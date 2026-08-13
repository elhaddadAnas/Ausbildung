import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { addOneMonth, isPaidSubscriptionPlan } from '@/lib/bank-transfer';
import {
  sendSubscriptionApprovedEmail,
  sendSubscriptionRejectedEmail,
} from '@/lib/services/transactional-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest) {
  const admin = await getCurrentUserFromRequest(req);
  if (!admin || admin.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : null;
  if (typeof body.paymentId !== 'string' || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Action invalide.' }, { status: 400 });
  }
  const payment = await db.bankTransferPayment.findUnique({
    where: { id: body.paymentId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          subscriptionPlan: true,
          subscriptionCurrentPeriodEnd: true,
        },
      },
    },
  });
  if (!payment) return NextResponse.json({ error: 'Paiement introuvable.' }, { status: 404 });
  if (!['PENDING', 'SUBMITTED'].includes(payment.status)) {
    return NextResponse.json({ error: 'Ce paiement a déjà été traité.' }, { status: 409 });
  }
  if (!isPaidSubscriptionPlan(payment.plan)) {
    return NextResponse.json({ error: 'Formule de paiement invalide.' }, { status: 400 });
  }

  if (action === 'approve') {
    const now = new Date();
    const renewalBase =
      payment.user.subscriptionPlan === payment.plan &&
      payment.user.subscriptionCurrentPeriodEnd &&
      payment.user.subscriptionCurrentPeriodEnd > now
        ? payment.user.subscriptionCurrentPeriodEnd
        : now;
    const periodEnd = addOneMonth(renewalBase);
    await db.$transaction(async (tx) => {
      const claimed = await tx.bankTransferPayment.updateMany({
        where: { id: payment.id, status: { in: ['PENDING', 'SUBMITTED'] } },
        data: {
          status: 'PAID',
          paidAt: now,
          reviewedAt: now,
          reviewedById: admin.id,
          adminNote: note,
        },
      });
      if (!claimed.count) throw new Error('Ce paiement a déjà été traité.');
      await tx.user.update({
        where: { id: payment.userId },
        data: {
          subscriptionPlan: payment.plan,
          subscriptionStatus: 'ACTIVE',
          subscriptionRequestedPlan: null,
          subscriptionPeriodStart: now,
          subscriptionCurrentPeriodEnd: periodEnd,
          subscriptionExpiryReminderSentAt: null,
          subscriptionExpiredEmailSentAt: null,
          aiCreditsUsed: 0,
          applicationsUsed: 0,
        },
      });
      await tx.bankTransferPayment.updateMany({
        where: {
          userId: payment.userId,
          id: { not: payment.id },
          status: { in: ['PENDING', 'SUBMITTED'] },
        },
        data: { status: 'EXPIRED' },
      });
      await tx.systemLog.create({
        data: {
          source: 'PAYMENT',
          message: `Virement ${payment.reference} validé par ${admin.email}; formule ${payment.plan} activée pour ${payment.user.email}.`,
        },
      });
    });
    const email = await sendSubscriptionApprovedEmail(
      payment.user.email,
      payment.user.name,
      payment.plan,
      periodEnd
    );
    return NextResponse.json({
      success: true,
      message: 'Paiement validé et formule activée.',
      emailWarning: email.success ? null : email.error,
    });
  }

  await db.$transaction(async (tx) => {
    await tx.bankTransferPayment.update({
      where: { id: payment.id },
      data: {
        status: 'REJECTED',
        reviewedAt: new Date(),
        reviewedById: admin.id,
        adminNote: note,
      },
    });
    await tx.user.updateMany({
      where: { id: payment.userId, subscriptionRequestedPlan: payment.plan },
      data: { subscriptionRequestedPlan: null },
    });
    await tx.systemLog.create({
      data: {
        source: 'PAYMENT',
        message: `Virement ${payment.reference} refusé par ${admin.email} pour ${payment.user.email}.`,
      },
    });
  });
  const email = await sendSubscriptionRejectedEmail(
    payment.user.email,
    payment.user.name,
    payment.reference,
    note
  );
  return NextResponse.json({
    success: true,
    message: 'Paiement refusé.',
    emailWarning: email.success ? null : email.error,
  });
}
