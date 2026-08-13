import { db } from '@/lib/db';
import { GlobalJobItem, fetchGlobalJobs } from '@/lib/services/job-providers';
import { deliverApplication } from '@/lib/services/application-mailer';

const INTERVAL_MINUTES = 5;
const STALE_LOCK_MINUTES = 15;
const APPLICATIONS_PER_RUN = 1;

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

function categoryMatches(job: GlobalJobItem, categories: string[]): boolean {
  if (!categories.length) return true;
  const actual = job.category.toLowerCase();
  return categories.some((category) => actual.includes(category.toLowerCase()));
}

export async function runAutoApplyForUser(
  userId: string,
  options: { force?: boolean } = {}
) {
  const config = await db.autoApplyConfig.findUnique({ where: { userId } });
  if (!config) return { success: false, error: 'Configuration auto-candidature introuvable.' };
  if (!options.force && !config.enabled) {
    return { success: false, skipped: true, error: 'Auto-candidature désactivée.' };
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
    const countries = parseList(config.countries);
    const categories = parseList(config.categories);
    const searchKeywords = keywords.length ? keywords : ['Software Engineer'];
    const searchCities = cities.length ? cities : [''];
    const searchCountries = countries.length ? countries : [''];
    const seen = new Set<string>();
    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];
    const deliveries: Array<{
      title: string;
      company: string;
      recipientEmail?: string;
      matchScore?: number;
    }> = [];

    search:
    for (const keyword of searchKeywords) {
      for (const city of searchCities) {
        for (const country of searchCountries) {
          const response = await fetchGlobalJobs({
            query: keyword,
            location: city,
            country,
            remote: config.remoteOnly,
            limit: 25,
          });
          if (response.source === 'unavailable') {
            if (errors.length < 5) {
              errors.push('Les sources d’offres mondiales sont temporairement indisponibles.');
            }
            continue;
          }

          for (const job of response.jobs) {
            if (sent >= APPLICATIONS_PER_RUN) break search;
            if (seen.has(job.externalId)) continue;
            seen.add(job.externalId);
            if (!categoryMatches(job, categories)) continue;
            if (
              countries.length &&
              !countries.some((value) =>
                job.country.toLowerCase().includes(value.toLowerCase())
              )
            ) continue;
            if (config.remoteOnly && !job.remote) continue;

            if (!options.force) {
              const currentState = await db.autoApplyConfig.findUnique({
                where: { id: config.id },
                select: { enabled: true },
              });
              if (!currentState?.enabled) break search;
            }

            const delivery = await deliverApplication(userId, job, {
              automated: true,
              minMatchScore: config.minMatchScore,
            });
            if (delivery.success) {
              sent++;
              deliveries.push({
                title: job.title,
                company: job.company,
                recipientEmail: delivery.recipientEmail,
                matchScore: delivery.matchScore,
              });
            } else {
              skipped++;
              if (delivery.error && errors.length < 5) errors.push(delivery.error);
            }
          }
        }
      }
    }

    result = {
      success: true,
      sent,
      skipped,
      checked: seen.size,
      deliveries,
      errors: [...new Set(errors)],
      completedAt: new Date().toISOString(),
    };
    await db.queueJob.update({
      where: { id: queueJob.id },
      data: {
        status: 'COMPLETED',
        result: JSON.stringify(result),
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
      runStartedAt: { lt: staleBefore },
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
