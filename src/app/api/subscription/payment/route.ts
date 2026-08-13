import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  bankTransferConfigured,
  generateUniqueTransferReference,
  getBankTransferDetails,
  isPaidSubscriptionPlan,
  paymentAmountCents,
  serializePayment,
} from '@/lib/bank-transfer';
import {
  sendAdminTransferAlert,
  sendBankTransferInstructionsEmail,
  sendTransferSubmittedEmail,
} from '@/lib/services/transactional-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function expireStaleRequests(userId: string) {
  await db.bankTransferPayment.updateMany({
    where: {
      userId,
      status: { in: ['PENDING', 'SUBMITTED'] },
      expiresAt: { lte: new Date() },
    },
    data: { status: 'EXPIRED' },
  });
}

async function currentPayment(userId: string) {
  await expireStaleRequests(userId);
  return db.bankTransferPayment.findFirst({
    where: { userId, status: { in: ['PENDING', 'SUBMITTED'] } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  const payment = await currentPayment(user.id);
  return NextResponse.json({
    payment: payment ? serializePayment(payment) : null,
    bankDetails: payment && bankTransferConfigured() ? getBankTransferDetails() : null,
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  if (user.role === 'ADMIN' || user.unlimitedAccess) {
    return NextResponse.json({ error: 'Ce compte dispose déjà d’un accès illimité.' }, { status: 400 });
  }
  const bankConfigured = bankTransferConfigured();
  const rateLimit = await checkRateLimit(`bank-transfer:${user.id}`, 10, 60 * 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Trop de demandes. Réessayez plus tard.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const body = await req.json().catch(() => ({}));
  if (!isPaidSubscriptionPlan(body.plan)) {
    return NextResponse.json({ error: 'Choisissez la formule Plus ou Pro.' }, { status: 400 });
  }
  const plan = body.plan;
  await expireStaleRequests(user.id);
  let payment = await db.bankTransferPayment.findFirst({
    where: { userId: user.id, plan, status: { in: ['PENDING', 'SUBMITTED'] } },
    orderBy: { createdAt: 'desc' },
  });
  let created = false;
  if (!payment) {
    const reference = await generateUniqueTransferReference(plan);
    payment = await db.$transaction(async (tx) => {
      await tx.bankTransferPayment.updateMany({
        where: { userId: user.id, status: { in: ['PENDING', 'SUBMITTED'] } },
        data: { status: 'EXPIRED' },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { subscriptionRequestedPlan: plan },
      });
      return tx.bankTransferPayment.create({
        data: {
          userId: user.id,
          plan,
          amountCents: paymentAmountCents(plan),
          reference,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
        },
      });
    });
    created = true;
  }

  const bankDetails = bankConfigured ? getBankTransferDetails() : null;
  const email = bankDetails
    ? await sendBankTransferInstructionsEmail({
        to: user.email,
        name: user.name,
        plan,
        amountEur: payment.amountCents / 100,
        reference: payment.reference,
        ...bankDetails,
      })
    : {
        success: false,
        error: 'Les coordonnées bancaires doivent encore être configurées par un administrateur.',
      };
  if (created) {
    await sendAdminTransferAlert({
      userName: user.name,
      userEmail: user.email,
      plan,
      amountEur: payment.amountCents / 100,
      reference: payment.reference,
      submitted: false,
    });
  }

  return NextResponse.json(
    {
      success: true,
      payment: serializePayment(payment),
      bankDetails,
      emailWarning: email.success ? null : email.error,
    },
    { status: created ? 201 : 200 }
  );
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.paymentId !== 'string' || body.action !== 'submitted') {
    return NextResponse.json({ error: 'Action de paiement invalide.' }, { status: 400 });
  }
  const payment = await db.bankTransferPayment.findFirst({
    where: { id: body.paymentId, userId: user.id },
  });
  if (!payment) return NextResponse.json({ error: 'Paiement introuvable.' }, { status: 404 });
  if (payment.expiresAt <= new Date()) {
    await db.bankTransferPayment.update({ where: { id: payment.id }, data: { status: 'EXPIRED' } });
    return NextResponse.json({ error: 'Cette demande a expiré. Créez-en une nouvelle.' }, { status: 409 });
  }
  if (!['PENDING', 'SUBMITTED'].includes(payment.status)) {
    return NextResponse.json({ error: 'Ce paiement ne peut plus être modifié.' }, { status: 409 });
  }
  const updated = payment.status === 'SUBMITTED'
    ? payment
    : await db.bankTransferPayment.update({
        where: { id: payment.id },
        data: { status: 'SUBMITTED', submittedAt: new Date() },
      });
  if (payment.status !== 'SUBMITTED' && isPaidSubscriptionPlan(payment.plan)) {
    await Promise.all([
      sendTransferSubmittedEmail(user.email, user.name, payment.reference),
      sendAdminTransferAlert({
        userName: user.name,
        userEmail: user.email,
        plan: payment.plan,
        amountEur: payment.amountCents / 100,
        reference: payment.reference,
        submitted: true,
      }),
    ]);
  }
  return NextResponse.json({ success: true, payment: serializePayment(updated) });
}
