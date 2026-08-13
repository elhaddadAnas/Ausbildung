import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { getQueueStatus } from '@/lib/services/queue';
import { OPENAI_CONFIGURED, OPENAI_MODEL } from '@/lib/services/openai';
import { APPLICATION_AI_COST_ESTIMATE } from '@/lib/subscriptions';

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
    const aiUsage = await db.aiUsage.aggregate({
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        estimatedCostMicrousd: true,
        credits: true,
      },
      _count: true,
    });

    const users = await db.user.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        subscriptionRequestedPlan: true,
        aiCreditsUsed: true,
        aiCreditBalance: true,
        applicationsUsed: true,
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
        host: true,
        port: true,
        authUser: true,
        isTested: true,
        lastTestedAt: true,
      },
    });
    const bankPayments = await db.bankTransferPayment.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
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
      bankPayments: bankPayments.map((payment) => ({
        ...payment,
        amountEur: payment.amountCents / 100,
      })),
      queueInfo,
      openai: {
        configured: OPENAI_CONFIGURED,
        model: OPENAI_MODEL,
        costProfile: 'low',
        applicationCostEstimate: APPLICATION_AI_COST_ESTIMATE,
        usage: {
          operations: aiUsage._count,
          inputTokens: aiUsage._sum.inputTokens || 0,
          outputTokens: aiUsage._sum.outputTokens || 0,
          totalTokens: aiUsage._sum.totalTokens || 0,
          credits: aiUsage._sum.credits || 0,
          estimatedCostUsd: (aiUsage._sum.estimatedCostMicrousd || 0) / 1_000_000,
        },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Admin Daten konnten nicht abgerufen werden.' }, { status: 500 });
  }
}
