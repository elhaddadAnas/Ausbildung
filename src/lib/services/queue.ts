import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { db } from '../db';
import { fetchArbeitsagenturOffers } from './arbeitsagentur';
import { analyzeJobMatch } from './openai';
import { decryptString } from './smtp';
import { dispatchMultiChannelNotification } from './notifications';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redisConnection: Redis | null = null;
let searchQueue: Queue | null = null;

try {
  redisConnection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redisConnection.on('error', () => {
    // Deep search remains synchronous and database-backed when Redis is offline.
  });
  searchQueue = new Queue('ausbildung-search-queue', { connection: redisConnection });
} catch {
  redisConnection = null;
  searchQueue = null;
}

function publicAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured && /^https?:\/\//i.test(configured)) return configured.replace(/\/+$/, '');
  return 'http://localhost:3000';
}

export async function runAutoSearchJob(userId?: string) {
  const staleBefore = new Date(Date.now() - 30 * 60_000);
  const jobLog = await db.$transaction(async (tx) => {
    await tx.queueJob.updateMany({
      where: {
        jobName: 'AUTOMATED_AUSBILDUNG_SEARCH',
        status: 'PENDING',
        runAt: { lt: staleBefore },
      },
      data: {
        status: 'FAILED',
        errorMessage: 'Exécution interrompue ou expirée.',
        completedAt: new Date(),
      },
    });
    const active = await tx.queueJob.findFirst({
      where: {
        jobName: 'AUTOMATED_AUSBILDUNG_SEARCH',
        status: 'PENDING',
      },
      select: { id: true },
    });
    if (active) return null;
    return tx.queueJob.create({
      data: {
        jobName: 'AUTOMATED_AUSBILDUNG_SEARCH',
        status: 'PENDING',
        payload: JSON.stringify({ userId: userId || null, timestamp: new Date() }),
      },
    });
  });
  if (!jobLog) {
    return {
      success: false,
      skipped: true,
      error: 'Une recherche approfondie est déjà en cours.',
    };
  }

  try {
    const profiles = await db.userProfile.findMany({
      where: userId ? { userId } : { autoSearchEnabled: true },
      include: {
        user: {
          include: {
            smtpConfig: true,
            notificationConfig: true,
          },
        },
        skills: true,
        educations: true,
      },
    });
    if (userId && !profiles.length) {
      throw new Error('Complétez votre profil avant de lancer la recherche approfondie.');
    }

    let totalSaved = 0;
    let totalDuplicatesRemoved = 0;
    let totalMatches = 0;
    let notificationFailures = 0;
    let liveSearches = 0;
    const keywords = [
      'Fachinformatiker',
      'Kaufmann',
      'Mechatroniker',
      'Pflege',
      'Elektroniker',
      'Ausbildung',
    ];

    for (const keyword of keywords) {
      const response = await fetchArbeitsagenturOffers({ was: keyword, limit: 25 });
      if (response.source !== 'live_api') continue;
      liveSearches++;

      for (const job of response.jobs) {
        if (!job.externalId.startsWith('BA-')) continue;
        const existingOffer = await db.jobOffer.findUnique({
          where: { externalId: job.externalId },
          select: { id: true },
        });
        const offer = await db.jobOffer.upsert({
          where: { externalId: job.externalId },
          update: {
            title: job.title,
            company: job.company,
            location: job.location,
            postalCode: job.postalCode,
            federalState: job.federalState,
            category: job.category,
            contractType: job.contractType,
            workTime: job.workTime,
            remote: job.remote,
            salary: job.salary,
            description: job.description,
            requirements: job.requirements,
            url: job.url,
            publishedAt: new Date(job.publishedAt || Date.now()),
            active: true,
            searchKeyword: keyword,
          },
          create: {
            externalId: job.externalId,
            title: job.title,
            company: job.company,
            location: job.location,
            postalCode: job.postalCode,
            federalState: job.federalState,
            category: job.category,
            contractType: job.contractType,
            workTime: job.workTime,
            remote: job.remote,
            salary: job.salary,
            description: job.description,
            requirements: job.requirements,
            url: job.url,
            publishedAt: new Date(job.publishedAt || Date.now()),
            searchKeyword: keyword,
          },
        });
        if (existingOffer) totalDuplicatesRemoved++;
        else totalSaved++;

        for (const profile of profiles) {
          const existingApplication = await db.jobApplication.findUnique({
            where: {
              userId_jobOfferId: {
                userId: profile.userId,
                jobOfferId: offer.id,
              },
            },
            select: { id: true },
          });
          if (existingApplication) continue;

          const userProfileText =
            `Ausbildung: ${profile.educations.map((education) => education.degree).join(', ')}. ` +
            `Skills: ${profile.skills.map((skill) => skill.name).join(', ')}. ` +
            `Stadt: ${profile.city || ''}`;
          const jobText =
            `${job.title} - ${job.company} - ${job.description} - ${job.requirements}`;
          const analysis = await analyzeJobMatch(
            userProfileText,
            jobText,
            profile.userId
          );
          if (analysis.matchScore < 70) continue;

          await db.jobApplication.create({
            data: {
              userId: profile.userId,
              jobOfferId: offer.id,
              status: 'SAVED',
              matchScore: analysis.matchScore,
              missingSkills: JSON.stringify(analysis.missingSkills),
              cvTips: JSON.stringify(analysis.cvSuggestions),
              notesText: `Auto-gefundener Match (${analysis.matchScore}% Übereinstimmung)`,
            },
          });
          totalMatches++;

          const notification = profile.user.notificationConfig;
          if (!notification?.alertOnNewMatch) continue;
          const smtp = profile.user.smtpConfig;
          const smtpConfig = smtp?.active && smtp.isTested
            ? {
                provider: smtp.provider,
                host: smtp.host,
                port: smtp.port,
                secure: smtp.secure,
                authUser: smtp.authUser,
                authPass: decryptString(smtp.authPassEncrypted),
                fromEmail: smtp.fromEmail,
                fromName: smtp.fromName,
              }
            : null;
          const notifications = await dispatchMultiChannelNotification(
            {
              emailEnabled: notification.emailEnabled,
              userEmail: profile.user.email,
              smtpConfig,
              telegramEnabled: notification.telegramEnabled,
              telegramChatId: notification.telegramChatId,
              whatsappEnabled: false,
              whatsappNumber: null,
              discordEnabled: notification.discordEnabled,
              discordWebhookUrl: notification.discordWebhookUrl,
            },
            {
              title: `Nouveau match à ${analysis.matchScore}%`,
              message: `Une nouvelle offre correspondant à votre profil a été enregistrée.`,
              linkUrl: `${publicAppUrl()}/ai-matching?jobId=${offer.id}`,
              jobTitle: offer.title,
              company: offer.company,
            }
          );
          notificationFailures += notifications.filter((item) => !item.success).length;
        }
      }
    }

    if (!liveSearches) {
      throw new Error('La source officielle Arbeitsagentur est temporairement indisponible.');
    }

    const result = {
      totalSaved,
      totalDuplicatesRemoved,
      totalMatches,
      notificationFailures,
      liveSearches,
    };
    await db.queueJob.update({
      where: { id: jobLog.id },
      data: {
        status: 'COMPLETED',
        result: JSON.stringify(result),
        completedAt: new Date(),
      },
    });
    return { success: true, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Auto-search execution error';
    await db.queueJob.update({
      where: { id: jobLog.id },
      data: {
        status: 'FAILED',
        errorMessage: message,
        completedAt: new Date(),
      },
    });
    return { success: false, error: message };
  }
}

export function getQueueStatus() {
  return {
    redisConnected: Boolean(redisConnection && redisConnection.status === 'ready'),
    queueInitialized: Boolean(searchQueue),
    executionMode: 'database-backed manual deep search',
    queueName: 'ausbildung-search-queue',
    autoIntervalMinutes: null,
  };
}
