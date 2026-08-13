import { db } from '@/lib/db';
import { BAJobItem, fetchArbeitsagenturOffers } from '@/lib/services/arbeitsagentur';
import { deliverApplication } from '@/lib/services/application-mailer';
import { OPENAI_CONFIGURED } from '@/lib/services/openai';
import {
  assertAutoApplyAllowed,
  SubscriptionLimitError,
} from '@/lib/subscriptions';

const INTERVAL_MINUTES = 3;
const STALE_LOCK_MINUTES = 15;
const APPLICATIONS_PER_RUN = 1;
const SEARCH_PAGE_SIZE = 25;
const MAX_SEARCH_PAGES = 5;
const MAX_SEARCH_COMBINATIONS_PER_RUN = 8;
const MAX_CANDIDATE_ATTEMPTS_PER_RUN = 15;
const PROVIDER_ATTEMPTS = 2;

function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // Accept legacy comma-separated values.
  }
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function nextRunDate(): Date {
  return new Date(Date.now() + INTERVAL_MINUTES * 60_000);
}

function categoryMatches(job: BAJobItem, categories: string[]): boolean {
  if (!categories.length) return true;
  const actual = job.category.toLowerCase();
  return categories.some((category) => actual.includes(category.toLowerCase()));
}

function normalizeFilterValue(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('de-DE');
}

function federalStateMatches(job: BAJobItem, federalStates: string[]): boolean {
  if (!federalStates.length) return true;
  const actual = normalizeFilterValue(job.federalState);
  return federalStates.some((state) => actual === normalizeFilterValue(state));
}

async function fetchOffersWithRetry(
  filters: Parameters<typeof fetchArbeitsagenturOffers>[0]
) {
  let lastResponse: Awaited<ReturnType<typeof fetchArbeitsagenturOffers>> | null = null;
  for (let attempt = 0; attempt < PROVIDER_ATTEMPTS; attempt++) {
    lastResponse = await fetchArbeitsagenturOffers(filters);
    if (lastResponse.source === 'live_api') return lastResponse;
  }
  return lastResponse;
}

export async function runAutoApplyForUser(
  userId: string,
  options: { force?: boolean } = {}
) {
  try {
    await assertAutoApplyAllowed(userId);
  } catch (error) {
    if (error instanceof SubscriptionLimitError) {
      const result = {
        success: false,
        skipped: true,
        upgradeRequired: true,
        error: error.message,
        completedAt: new Date().toISOString(),
      };
      // Prevent an expired or downgraded account from remaining permanently
      // due and being retried by the scheduler every 30 seconds.
      await db.autoApplyConfig.updateMany({
        where: { userId },
        data: {
          enabled: false,
          running: false,
          runStartedAt: null,
          nextRunAt: null,
          lastResult: JSON.stringify(result),
        },
      });
      return result;
    }
    throw error;
  }
  const config = await db.autoApplyConfig.findUnique({ where: { userId } });
  if (!config) return { success: false, error: 'Configuration auto-candidature introuvable.' };
  if (!options.force && !config.enabled) {
    return { success: false, skipped: true, error: 'Auto-candidature désactivée.' };
  }
  if (!OPENAI_CONFIGURED) {
    const result = {
      success: false,
      skipped: true,
      error: 'La clé OpenAI doit être configurée pour générer les candidatures personnalisées.',
      completedAt: new Date().toISOString(),
    };
    await db.autoApplyConfig.update({
      where: { id: config.id },
      data: {
        enabled: false,
        running: false,
        runStartedAt: null,
        nextRunAt: null,
        lastResult: JSON.stringify(result),
      },
    });
    return result;
  }

  const acquired = await db.autoApplyConfig.updateMany({
    where: {
      id: config.id,
      running: false,
      ...(options.force ? {} : { enabled: true }),
    },
    data: { running: true, runStartedAt: new Date() },
  });
  if (!acquired.count) {
    return { success: false, skipped: true, error: 'Une exécution est déjà en cours.' };
  }

  const queueJob = await db.queueJob.create({
    data: {
      jobName: 'AUTO_APPLY',
      status: 'PENDING',
      payload: JSON.stringify({ userId, automated: !options.force, startedAt: new Date() }),
    },
  });

  let result: Record<string, unknown> = {};
  try {
    const keywords = parseList(config.keywords);
    const cities = parseList(config.cities);
    const federalStates = parseList(config.federalStates);
    const categories = parseList(config.categories);
    const searchKeywords = keywords.length ? keywords : ['Ausbildung'];
    const searchCities = cities.length ? cities : [''];
    const seen = new Set<string>();
    let sent = 0;
    let skipped = 0;
    let smtpHalted = false;
    let smtpHaltReason = '';
    let pagesScanned = 0;
    let providerAvailable = false;
    let alreadyApplied = 0;
    let candidateAttempts = 0;
    let fatalError = '';
    const errors: string[] = [];
    const deliveries: Array<{
      title: string;
      company: string;
      recipientEmail?: string;
      matchScore?: number;
    }> = [];
    const appliedOffers = await db.jobOffer.findMany({
      where: {
        applications: {
          some: {
            userId,
            status: 'APPLIED',
          },
        },
      },
      select: { externalId: true },
    });
    const appliedExternalIds = new Set(appliedOffers.map((offer) => offer.externalId));
    const searchCombinations = searchKeywords.flatMap((keyword) =>
      searchCities.map((city) => ({ keyword, city }))
    );
    const rotationIndex = config.lastRunAt
      ? Math.floor(config.lastRunAt.getTime() / (INTERVAL_MINUTES * 60_000)) %
        searchCombinations.length
      : 0;
    const rotatedSearchCombinations = [
      ...searchCombinations.slice(rotationIndex),
      ...searchCombinations.slice(0, rotationIndex),
    ].slice(0, MAX_SEARCH_COMBINATIONS_PER_RUN);

    search:
    for (const { keyword, city } of rotatedSearchCombinations) {
      for (let page = 1; page <= MAX_SEARCH_PAGES; page++) {
        const response = await fetchOffersWithRetry({
          was: keyword,
          wo: city,
          umkreis: config.radiusKm,
          remote: config.remoteOnly,
          page,
          limit: SEARCH_PAGE_SIZE,
        });
        if (!response || response.source === 'fallback_db') {
          if (errors.length < 5) {
            errors.push('La source Arbeitsagentur est temporairement indisponible ; une nouvelle tentative aura lieu automatiquement.');
          }
          break;
        }
        providerAvailable = true;
        pagesScanned++;

        for (const job of response.jobs) {
          if (
            sent >= APPLICATIONS_PER_RUN ||
            candidateAttempts >= MAX_CANDIDATE_ATTEMPTS_PER_RUN
          ) {
            break search;
          }
          if (seen.has(job.externalId)) continue;
          seen.add(job.externalId);
          if (!categoryMatches(job, categories)) continue;
          if (!federalStateMatches(job, federalStates)) continue;
          if (config.remoteOnly && !job.remote) continue;
          if (appliedExternalIds.has(job.externalId)) {
            alreadyApplied++;
            skipped++;
            continue;
          }

          if (!options.force) {
            const currentState = await db.autoApplyConfig.findUnique({
              where: { id: config.id },
              select: { enabled: true },
            });
            if (!currentState?.enabled) break search;
          }

          candidateAttempts++;
          let delivery;
          try {
            delivery = await deliverApplication(userId, job, {
              automated: true,
              minMatchScore: config.minMatchScore,
            });
          } catch (error) {
            fatalError = error instanceof Error ? error.message : String(error);
            if (errors.length < 5) errors.push(fatalError);
            skipped++;
            break search;
          }
          if (delivery.success) {
            sent++;
            appliedExternalIds.add(job.externalId);
            deliveries.push({
              title: job.title,
              company: job.company,
              recipientEmail: delivery.recipientEmail,
              matchScore: delivery.matchScore,
            });
          } else {
            skipped++;
            if (delivery.error && errors.length < 5) errors.push(delivery.error);
            if (delivery.haltAutoSending) {
              smtpHalted = true;
              smtpHaltReason =
                delivery.error ||
                'Limite SMTP détectée. L’auto-candidature a été arrêtée.';
              break search;
            }
          }
        }

        const reachedLastPage =
          response.jobs.length < SEARCH_PAGE_SIZE ||
          page * SEARCH_PAGE_SIZE >= response.total;
        if (reachedLastPage) break;
      }
    }

    const uniqueErrors = [...new Set(errors)];
    const noSendReason = sent > 0
      ? null
      : !providerAvailable
        ? 'La source d’offres est temporairement indisponible.'
        : seen.size === 0
          ? 'Aucune offre ne correspond actuellement aux filtres enregistrés.'
          : 'Aucune nouvelle offre éligible avec une adresse e-mail vérifiable n’a été trouvée.';
    const runSucceeded = !smtpHalted && providerAvailable && !fatalError;
    result = {
      success: runSucceeded,
      sent,
      skipped,
      checked: seen.size,
      pagesScanned,
      alreadyApplied,
      candidateAttempts,
      deliveries,
      errors: uniqueErrors,
      noSendReason,
      smtpHalted,
      smtpHaltReason: smtpHalted ? smtpHaltReason : null,
      fatalError: fatalError || null,
      completedAt: new Date().toISOString(),
    };
    await db.queueJob.update({
      where: { id: queueJob.id },
      data: {
        status: runSucceeded ? 'COMPLETED' : 'FAILED',
        result: JSON.stringify(result),
        errorMessage: runSucceeded ? null : smtpHaltReason || fatalError || noSendReason,
        completedAt: new Date(),
      },
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result = { success: false, error: message, completedAt: new Date().toISOString() };
    await db.queueJob.update({
      where: { id: queueJob.id },
      data: {
        status: 'FAILED',
        errorMessage: message,
        completedAt: new Date(),
      },
    });
    return result;
  } finally {
    const latest = await db.autoApplyConfig.findUnique({
      where: { id: config.id },
      select: { enabled: true },
    });
    await db.autoApplyConfig.update({
      where: { id: config.id },
      data: {
        running: false,
        runStartedAt: null,
        lastRunAt: new Date(),
        nextRunAt: latest?.enabled ? nextRunDate() : null,
        lastResult: JSON.stringify(result),
      },
    });
  }
}

export async function runDueAutoApplyJobs() {
  const staleBefore = new Date(Date.now() - STALE_LOCK_MINUTES * 60_000);
  await db.autoApplyConfig.updateMany({
    where: {
      running: true,
      OR: [
        { runStartedAt: null },
        { runStartedAt: { lt: staleBefore } },
      ],
    },
    data: { running: false, runStartedAt: null },
  });

  const due = await db.autoApplyConfig.findMany({
    where: {
      enabled: true,
      running: false,
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }],
    },
    select: { userId: true },
  });

  for (const config of due) {
    await runAutoApplyForUser(config.userId);
  }
}

export function getAutoApplyIntervalMinutes() {
  return INTERVAL_MINUTES;
}
