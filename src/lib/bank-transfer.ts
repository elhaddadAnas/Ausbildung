import { randomBytes } from 'crypto';
import { db } from '@/lib/db';
import {
  isSubscriptionPlan,
  SUBSCRIPTION_PLANS,
  type SubscriptionPlanCode,
} from '@/lib/subscriptions';

export type PaidSubscriptionPlan = Exclude<SubscriptionPlanCode, 'BASIC'>;

export function isPaidSubscriptionPlan(value: unknown): value is PaidSubscriptionPlan {
  return isSubscriptionPlan(value) && value !== 'BASIC';
}

export function getBankTransferDetails() {
  return {
    accountHolder: process.env.BANK_ACCOUNT_HOLDER?.trim() || '',
    bankName: process.env.BANK_NAME?.trim() || '',
    rib: process.env.BANK_RIB?.replace(/\s+/g, '').toUpperCase() || '',
    iban: process.env.BANK_IBAN?.replace(/\s+/g, '').toUpperCase() || '',
    bic: process.env.BANK_BIC?.replace(/\s+/g, '').toUpperCase() || '',
    instructions: process.env.BANK_TRANSFER_INSTRUCTIONS?.trim() || '',
  };
}

export function bankTransferConfigured(): boolean {
  const details = getBankTransferDetails();
  return Boolean(details.accountHolder && (details.rib || details.iban));
}

export function paymentAmountCents(plan: PaidSubscriptionPlan): number {
  return Math.round(SUBSCRIPTION_PLANS[plan].monthlyPriceEur * 100);
}

export function addOneMonth(date = new Date()): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

export async function generateUniqueTransferReference(
  plan: PaidSubscriptionPlan
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const reference = `AF-${plan}-${randomBytes(5).toString('hex').toUpperCase()}`;
    const exists = await db.bankTransferPayment.findUnique({
      where: { reference },
      select: { id: true },
    });
    if (!exists) return reference;
  }
  throw new Error('Impossible de générer une référence de paiement unique.');
}

export function serializePayment<T extends {
  amountCents: number;
  createdAt: Date;
  expiresAt: Date;
  submittedAt: Date | null;
  paidAt: Date | null;
  reviewedAt: Date | null;
}>(payment: T) {
  return {
    ...payment,
    amountEur: payment.amountCents / 100,
    createdAt: payment.createdAt.toISOString(),
    expiresAt: payment.expiresAt.toISOString(),
    submittedAt: payment.submittedAt?.toISOString() || null,
    paidAt: payment.paidAt?.toISOString() || null,
    reviewedAt: payment.reviewedAt?.toISOString() || null,
  };
}
