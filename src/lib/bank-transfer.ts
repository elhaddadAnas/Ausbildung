import { randomBytes } from 'crypto';
import { db } from '@/lib/db';
import {
  CREDIT_PACKS,
  isCreditPack,
  isSubscriptionPlan,
  SUBSCRIPTION_PLANS,
  type CreditPackCode,
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

export function creditPackAmountCents(pack: CreditPackCode): number {
  return Math.round(CREDIT_PACKS[pack].priceEur * 100);
}

export function isCreditTopupPayment(payment: {
  kind: string;
  plan: string;
  creditAmount: number | null;
}): payment is { kind: 'CREDIT_TOPUP'; plan: CreditPackCode; creditAmount: number } {
  return payment.kind === 'CREDIT_TOPUP'
    && isCreditPack(payment.plan)
    && payment.creditAmount === CREDIT_PACKS[payment.plan].credits;
}

export function addOneMonth(date = new Date()): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

export async function generateUniqueTransferReference(
  productCode: PaidSubscriptionPlan | CreditPackCode
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const reference = `AF-${productCode}-${randomBytes(5).toString('hex').toUpperCase()}`;
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
