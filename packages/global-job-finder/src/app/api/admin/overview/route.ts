import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { getQueueStatus } from '@/lib/services/queue';
import { OPENAI_CONFIGURED, OPENAI_MODEL } from '@/lib/services/openai';

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Nur für Administratoren zugänglich.' }, { status: 403 });
  }

  try {
    const totalUsers = await db.user.count();
    const totalOffers = await db.jobOffer.count();
    const totalApplications = await db.jobApplication.count();
    const totalFavorites = await db.favoriteJob.count();

    const users = await db.user.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        isGoogleLogin: true,
        isMicrosoftLogin: true,
      },
    });

    const systemLogs = await db.systemLog.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    const queueJobs = await db.queueJob.findMany({
      take: 15,
      orderBy: { runAt: 'desc' },
    });

    const smtpConfigs = await db.smtpConfig.findMany({
      take: 10,
      select: {
        id: true,
        provider: true,
        isTested: true,
        lastTestedAt: true,
      },
    });

    const queueInfo = getQueueStatus();

    return NextResponse.json({
      stats: {
        totalUsers,
        totalOffers,
        totalApplications,
        totalFavorites,
      },
      users,
      systemLogs,
      queueJobs,
      smtpConfigs,
      queueInfo,
      openai: {
        configured: OPENAI_CONFIGURED,
        model: OPENAI_MODEL,
        costProfile: 'low',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Admin Daten konnten nicht abgerufen werden.' }, { status: 500 });
  }
}
