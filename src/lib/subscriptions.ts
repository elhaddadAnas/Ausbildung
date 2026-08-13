import { db } from '@/lib/db';

export const SUBSCRIPTION_PLANS = {
  BASIC: {
    code: 'BASIC',
    name: 'Découverte',
    monthlyPriceEur: 0,
    applicationsPerMonth: 5,
    aiCreditsPerMonth: 50,
    autoApply: false,
    recommended: false,
    features: [
      '5 candidatures par mois',
      'Matching IA et lettres personnalisées',
      'Recherche et suivi des candidatures',
      'Envoi manuel par votre SMTP',
    ],
  },
  PLUS: {
    code: 'PLUS',
    name: 'Plus',
    monthlyPriceEur: 9.99,
    applicationsPerMonth: 60,
    aiCreditsPerMonth: 1_000,
    autoApply: true,
    recommended: true,
    features: [
      '60 candidatures par mois',
      '1 000 crédits IA par mois',
      'Auto-candidature et recherche approfondie',
      'Analyse automatique des réponses',
    ],
  },
  PRO: {
    code: 'PRO',
    name: 'Pro',
    monthlyPriceEur: 19.99,
    applicationsPerMonth: 250,
    aiCreditsPerMonth: 5_000,
    autoApply: true,
    recommended: false,
    features: [
      '250 candidatures par mois',
      '5 000 crédits IA par mois',
      'Auto-candidature intensive',
      'Volume adapté aux recherches multi-villes',
    ],
  },
} as const;

export const CREDIT_PACKS = {
  CREDITS_100: {
    code: 'CREDITS_100',
    name: 'Pack Essentiel',
    credits: 100,
    priceEur: 2.99,
  },
  CREDITS_500: {
    code: 'CREDITS_500',
    name: 'Pack Boost',
    credits: 500,
    priceEur: 8.99,
  },
  CREDITS_1000: {
    code: 'CREDITS_1000',
    name: 'Pack Intensif',
    credits: 1_000,
    priceEur: 14.99,
  },
} as const;

export type SubscriptionPlanCode = keyof typeof SUBSCRIPTION_PLANS;
export type CreditPackCode = keyof typeof CREDIT_PACKS;
export type AiOperation = 'MATCH' | 'COVER_LETTER' | 'CV_PARSE' | 'REPLY_ANALYSIS';
export type AiCreditReservation = 'PLAN' | 'PURCHASED' | false;

export const AI_CREDIT_COST: Record<AiOperation, number> = {
  MATCH: 1,
  COVER_LETTER: 2,
  CV_PARSE: 6,
  REPLY_ANALYSIS: 1,
};

export const APPLICATION_AI_COST_ESTIMATE = {
  model: 'gpt-4o-mini',
  typicalInputTokens: 3_500,
  typicalOutputTokens: 500,
  typicalCostUsd: 0.000825,
  conservativeCostUsd: 0.006,
  pricingPerMillionTokensUsd: {
    input: 0.15,
    output: 0.60,
  },
} as const;

export class SubscriptionLimitError extends Error {
  readonly code = 'SUBSCRIPTION_LIMIT';

  constructor(message: string) {
    super(message);
    this.name = 'SubscriptionLimitError';
  }
}

export function isSubscriptionPlan(value: unknown): value is SubscriptionPlanCode {
  return typeof value === 'string' && value in SUBSCRIPTION_PLANS;
}

export function isCreditPack(value: unknown): value is CreditPackCode {
  return typeof value === 'string' && value in CREDIT_PACKS;
}

function monthStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function nextMonthStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

async function resetExpiredUsage(userId: string): Promise<void> {
  await db.user.updateMany({
    where: {
      id: userId,
      role: { not: 'ADMIN' },
      subscriptionPlan: { in: ['PLUS', 'PRO'] },
      subscriptionCurrentPeriodEnd: { lte: new Date() },
    },
    data: {
      subscriptionPlan: 'BASIC',
      subscriptionStatus: 'ACTIVE',
      subscriptionRequestedPlan: null,
      subscriptionCurrentPeriodEnd: null,
      subscriptionPeriodStart: monthStart(),
      aiCreditsUsed: 0,
      applicationsUsed: 0,
    },
  });
  const currentPeriod = monthStart();
  await db.user.updateMany({
    where: {
      id: userId,
      subscriptionPeriodStart: { lt: currentPeriod },
    },
    data: {
      subscriptionPeriodStart: currentPeriod,
      aiCreditsUsed: 0,
      applicationsUsed: 0,
    },
  });
}

export async function getSubscriptionSnapshot(userId: string) {
  await resetExpiredUsage(userId);
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionPlan: true,
      subscriptionStatus: true,
      subscriptionRequestedPlan: true,
      subscriptionPeriodStart: true,
      subscriptionCurrentPeriodEnd: true,
      aiCreditsUsed: true,
      aiCreditBalance: true,
      applicationsUsed: true,
      role: true,
      unlimitedAccess: true,
    },
  });
  if (!user) throw new Error('Utilisateur introuvable.');

  const planCode = isSubscriptionPlan(user.subscriptionPlan)
    ? user.subscriptionPlan
    : 'BASIC';
  const unlimited = user.role === 'ADMIN' || user.unlimitedAccess;
  const effectivePlanCode = unlimited
    ? 'PRO'
    : user.subscriptionStatus === 'ACTIVE'
      ? planCode
      : 'BASIC';
  const plan = SUBSCRIPTION_PLANS[effectivePlanCode];

  return {
    planCode,
    effectivePlanCode,
    plan,
    status: user.subscriptionStatus,
    requestedPlan: isSubscriptionPlan(user.subscriptionRequestedPlan)
      ? user.subscriptionRequestedPlan
      : null,
    unlimited,
    hasPaidSubscription: planCode !== 'BASIC' && user.subscriptionStatus === 'ACTIVE',
    periodStart: user.subscriptionPeriodStart,
    periodEnd: user.subscriptionCurrentPeriodEnd || nextMonthStart(),
    usage: {
      aiCredits: user.aiCreditsUsed,
      applications: user.applicationsUsed,
    },
    creditBalance: unlimited ? null : user.aiCreditBalance,
    remaining: {
      aiCredits: unlimited
        ? null
        : Math.max(0, plan.aiCreditsPerMonth - user.aiCreditsUsed) + user.aiCreditBalance,
      applications: unlimited
        ? null
        : Math.max(0, plan.applicationsPerMonth - user.applicationsUsed),
    },
  };
}

export async function consumeAiCredits(
  userId: string,
  operation: AiOperation
): Promise<AiCreditReservation> {
  const snapshot = await getSubscriptionSnapshot(userId);
  if (snapshot.unlimited) return false;
  const credits = AI_CREDIT_COST[operation];
  const updated = await db.user.updateMany({
    where: {
      id: userId,
      subscriptionPeriodStart: { gte: monthStart() },
      aiCreditsUsed: {
        lte: snapshot.plan.aiCreditsPerMonth - credits,
      },
    },
    data: {
      aiCreditsUsed: { increment: credits },
    },
  });
  if (!updated.count) {
    const purchased = await db.user.updateMany({
      where: {
        id: userId,
        aiCreditBalance: { gte: credits },
      },
      data: {
        aiCreditBalance: { decrement: credits },
      },
    });
    if (purchased.count) return 'PURCHASED';
    throw new SubscriptionLimitError(
      `Vos crédits IA sont épuisés. Achetez un pack de crédits ou passez à une formule supérieure pour continuer.`
    );
  }
  return 'PLAN';
}

export async function tryConsumeAiCredits(
  userId: string,
  operation: AiOperation
): Promise<{ allowed: boolean; reserved: AiCreditReservation }> {
  try {
    const reserved = await consumeAiCredits(userId, operation);
    return { allowed: true, reserved };
  } catch (error) {
    if (error instanceof SubscriptionLimitError) {
      return { allowed: false, reserved: false };
    }
    throw error;
  }
}

export async function releaseAiCredits(
  userId: string,
  operation: AiOperation,
  reservation: Exclude<AiCreditReservation, false> = 'PLAN'
): Promise<void> {
  const credits = AI_CREDIT_COST[operation];
  if (reservation === 'PURCHASED') {
    await db.user.update({
      where: { id: userId },
      data: { aiCreditBalance: { increment: credits } },
    });
    return;
  }
  await db.user.updateMany({
    where: {
      id: userId,
      aiCreditsUsed: { gte: credits },
      subscriptionPeriodStart: { gte: monthStart() },
    },
    data: {
      aiCreditsUsed: { decrement: credits },
    },
  });
}

export async function reserveApplicationSlot(userId: string): Promise<boolean> {
  const snapshot = await getSubscriptionSnapshot(userId);
  if (snapshot.unlimited) return false;
  const updated = await db.user.updateMany({
    where: {
      id: userId,
      subscriptionPeriodStart: { gte: monthStart() },
      applicationsUsed: {
        lt: snapshot.plan.applicationsPerMonth,
      },
    },
    data: {
      applicationsUsed: { increment: 1 },
    },
  });
  if (!updated.count) {
    throw new SubscriptionLimitError(
      `Votre limite de ${snapshot.plan.applicationsPerMonth} candidatures mensuelles est atteinte.`
    );
  }
  return true;
}

export async function releaseApplicationSlot(userId: string): Promise<void> {
  await db.user.updateMany({
    where: {
      id: userId,
      applicationsUsed: { gt: 0 },
      subscriptionPeriodStart: { gte: monthStart() },
    },
    data: {
      applicationsUsed: { decrement: 1 },
    },
  });
}

export async function assertAutoApplyAllowed(userId: string): Promise<void> {
  const snapshot = await getSubscriptionSnapshot(userId);
  if (snapshot.unlimited) return;
  if (!snapshot.plan.autoApply) {
    throw new SubscriptionLimitError(
      'L’auto-candidature est disponible avec les formules Plus et Pro.'
    );
  }
}

export async function recordOpenAiUsage(
  userId: string,
  operation: AiOperation,
  usage: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    total_tokens?: number | null;
  } | null | undefined,
  model: string
): Promise<void> {
  const inputTokens = Math.max(0, Number(usage?.prompt_tokens) || 0);
  const outputTokens = Math.max(0, Number(usage?.completion_tokens) || 0);
  const totalTokens = Math.max(
    inputTokens + outputTokens,
    Number(usage?.total_tokens) || 0
  );
  const estimatedCostMicrousd = Math.round(
    inputTokens * APPLICATION_AI_COST_ESTIMATE.pricingPerMillionTokensUsd.input +
    outputTokens * APPLICATION_AI_COST_ESTIMATE.pricingPerMillionTokensUsd.output
  );
  try {
    await db.aiUsage.create({
      data: {
        userId,
        operation,
        model,
        inputTokens,
        outputTokens,
        totalTokens,
        estimatedCostMicrousd,
        credits: AI_CREDIT_COST[operation],
      },
    });
  } catch (error) {
    console.warn('AI usage accounting could not be persisted:', error);
  }
}
