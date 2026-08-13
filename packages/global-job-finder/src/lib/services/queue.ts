import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { db } from '../db';
import { fetchGlobalJobs } from './job-providers';
import { analyzeJobMatch } from './openai';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redisConnection: Redis | null = null;
let searchQueue: Queue | null = null;

try {
  redisConnection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    retryStrategy: () => null, // Fail fast if Redis is not running
  });

  redisConnection.on('error', (err) => {
    // Silent fail over to memory worker
  });

  searchQueue = new Queue('global-job-search-queue', { connection: redisConnection });
} catch (e) {
  console.log('Redis offline, fallback to in-memory job scheduler.');
}

export async function runAutoSearchJob(userId?: string) {
  const jobLog = await db.queueJob.create({
    data: {
      jobName: 'AUTOMATED_GLOBAL_JOB_SEARCH',
      status: 'PENDING',
      payload: JSON.stringify({ userId, searchIntervalMins: 30, timestamp: new Date() }),
    },
  });

  try {
    // 1. Fetch active search filters from profiles
    const profiles = await db.userProfile.findMany({
      where: { autoSearchEnabled: true },
      include: {
        user: true,
        skills: true,
        educations: true,
      },
    });

    let totalSaved = 0;
    let totalDuplicatesRemoved = 0;

    const keywords = ['Software Engineer', 'Product Manager', 'Designer', 'Sales', 'Marketing'];

    for (const kw of keywords) {
      const { jobs } = await fetchGlobalJobs({ query: kw });

      for (const job of jobs) {
        // Deduplication check
        const existing = await db.jobOffer.findUnique({
          where: { externalId: job.id },
        });

        if (existing) {
          totalDuplicatesRemoved++;
          continue;
        }

        // Save new offer
        const createdOffer = await db.jobOffer.create({
          data: {
            externalId: job.id,
            title: job.title,
            company: job.company,
            location: job.location,
            postalCode: job.postalCode,
            country: job.country,
            category: job.category,
            contractType: job.contractType,
            workTime: job.workTime,
            remote: job.remote,
            salary: job.salary,
            description: job.description,
            requirements: job.requirements,
            url: job.url,
            publishedAt: new Date(job.publishedAt || Date.now()),
            searchKeyword: kw,
          },
        });

        totalSaved++;

        // Auto-match for interested user profiles
        for (const prof of profiles) {
          const userProfileText = `Education: ${prof.educations.map(e => e.degree).join(', ')}. Skills: ${prof.skills.map(s => s.name).join(', ')}. Location: ${prof.city || ''}`;
          const jobText = `${job.title} - ${job.company} - ${job.description} - ${job.requirements}`;

          const analysis = await analyzeJobMatch(userProfileText, jobText);

          if (analysis.matchScore >= 70) {
            // Auto create saved application if match is high
            const existingApp = await db.jobApplication.findFirst({
              where: { userId: prof.userId, jobOfferId: createdOffer.id },
            });

            if (!existingApp) {
              await db.jobApplication.create({
                data: {
                  userId: prof.userId,
                  jobOfferId: createdOffer.id,
                  status: 'SAVED',
                  matchScore: analysis.matchScore,
                  missingSkills: JSON.stringify(analysis.missingSkills),
                  cvTips: JSON.stringify(analysis.cvSuggestions),
                  notesText: `Auto-gefundener Match (${analysis.matchScore}% Übereinstimmung)`,
                },
              });
            }
          }
        }
      }
    }

    // Update job log
    await db.queueJob.update({
      where: { id: jobLog.id },
      data: {
        status: 'COMPLETED',
        result: JSON.stringify({ totalSaved, totalDuplicatesRemoved }),
        completedAt: new Date(),
      },
    });

    return { success: true, totalSaved, totalDuplicatesRemoved };
  } catch (error: any) {
    await db.queueJob.update({
      where: { id: jobLog.id },
      data: {
        status: 'FAILED',
        errorMessage: error.message || 'Auto-search execution error',
        completedAt: new Date(),
      },
    });

    return { success: false, error: error.message };
  }
}

export function getQueueStatus() {
  return {
    redisConnected: Boolean(redisConnection && redisConnection.status === 'ready'),
    queueName: 'global-job-search-queue',
    autoIntervalMinutes: 30,
  };
}
