import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate()
  ));
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const now = new Date();
  const today = startOfUtcDay(now);
  const chartStart = new Date(today.getTime() - 6 * 24 * 60 * 60_000);
  const [
    totalOffers,
    offersToday,
    favoriteCount,
    applications,
    responseCount,
    nextInterview,
  ] = await Promise.all([
    db.jobOffer.count({ where: { active: true } }),
    db.jobOffer.count({ where: { active: true, createdAt: { gte: today } } }),
    db.favoriteJob.count({ where: { userId: user.id } }),
    db.jobApplication.findMany({
      where: { userId: user.id },
      include: {
        jobOffer: true,
        messages: {
          where: { direction: 'INBOUND' },
          orderBy: { sentAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    db.jobApplication.count({
      where: {
        userId: user.id,
        messages: { some: { direction: 'INBOUND' } },
      },
    }),
    db.jobApplication.findFirst({
      where: {
        userId: user.id,
        interviewDate: { gte: now },
      },
      orderBy: { interviewDate: 'asc' },
      select: { interviewDate: true },
    }),
  ]);

  const chartData = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(chartStart.getTime() + index * 24 * 60 * 60_000);
    const nextDate = new Date(date.getTime() + 24 * 60 * 60_000);
    return {
      name: date.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' }),
      date: date.toISOString().slice(0, 10),
      matches: applications.filter(
        (application) => application.createdAt >= date && application.createdAt < nextDate
      ).length,
      bewerbungen: applications.filter(
        (application) =>
          application.appliedAt &&
          application.appliedAt >= date &&
          application.appliedAt < nextDate
      ).length,
    };
  });

  return NextResponse.json({
    stats: {
      totalOffers,
      offersToday,
      appliedJobs: applications.filter((application) => application.appliedAt).length,
      interviews: applications.filter((application) => application.status === 'INTERVIEW').length,
      rejections: applications.filter((application) => application.status === 'REJECTED').length,
      responses: responseCount,
      savedJobs: favoriteCount,
      nextInterviewAt: nextInterview?.interviewDate || null,
    },
    chartData,
    applications: applications.slice(0, 10).map(({ messages, ...application }) => ({
      ...application,
      latestReply: messages[0] || null,
    })),
  });
}
