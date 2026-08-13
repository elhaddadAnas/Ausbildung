import { db } from '@/lib/db';
import { SUBSCRIPTION_PLANS, isSubscriptionPlan } from '@/lib/subscriptions';
import {
  sendSubscriptionExpiredEmail,
  sendSubscriptionExpiringEmail,
} from '@/lib/services/transactional-email';

let lifecycleTimer: ReturnType<typeof setInterval> | null = null;

export async function processSubscriptionLifecycle(): Promise<void> {
  const now = new Date();
  const reminderLimit = new Date(now.getTime() + 3 * 24 * 60 * 60_000);
  const expiring = await db.user.findMany({
    where: {
      role: { not: 'ADMIN' },
      subscriptionPlan: { in: ['PLUS', 'PRO'] },
      subscriptionStatus: 'ACTIVE',
      subscriptionCurrentPeriodEnd: { gt: now, lte: reminderLimit },
      subscriptionExpiryReminderSentAt: null,
    },
    select: {
      id: true, email: true, name: true, subscriptionPlan: true,
      subscriptionCurrentPeriodEnd: true,
    },
  });
  for (const user of expiring) {
    const claimed = await db.user.updateMany({
      where: { id: user.id, subscriptionExpiryReminderSentAt: null },
      data: { subscriptionExpiryReminderSentAt: now },
    });
    if (!claimed.count || !user.subscriptionCurrentPeriodEnd) continue;
    const plan = isSubscriptionPlan(user.subscriptionPlan)
      ? SUBSCRIPTION_PLANS[user.subscriptionPlan].name
      : user.subscriptionPlan;
    await sendSubscriptionExpiringEmail(
      user.email, user.name, plan, user.subscriptionCurrentPeriodEnd
    );
  }

  const expired = await db.user.findMany({
    where: {
      role: { not: 'ADMIN' },
      subscriptionPlan: { in: ['PLUS', 'PRO'] },
      subscriptionCurrentPeriodEnd: { lte: now },
    },
    select: { id: true, email: true, name: true },
  });
  for (const user of expired) {
    const updated = await db.user.updateMany({
      where: {
        id: user.id,
        role: { not: 'ADMIN' },
        subscriptionPlan: { in: ['PLUS', 'PRO'] },
        subscriptionCurrentPeriodEnd: { lte: now },
      },
      data: {
        subscriptionPlan: 'BASIC',
        subscriptionStatus: 'ACTIVE',
        subscriptionRequestedPlan: null,
        subscriptionCurrentPeriodEnd: null,
        subscriptionPeriodStart: now,
        aiCreditsUsed: 0,
        applicationsUsed: 0,
        subscriptionExpiredEmailSentAt: now,
      },
    });
    if (updated.count) await sendSubscriptionExpiredEmail(user.email, user.name);
  }
}

export function startSubscriptionLifecycleScheduler(): void {
  if (lifecycleTimer) return;
  void processSubscriptionLifecycle().catch((error) => {
    console.error('Subscription lifecycle error:', error);
  });
  lifecycleTimer = setInterval(() => {
    void processSubscriptionLifecycle().catch((error) => {
      console.error('Subscription lifecycle error:', error);
    });
  }, 6 * 60 * 60_000);
  lifecycleTimer.unref?.();
}
