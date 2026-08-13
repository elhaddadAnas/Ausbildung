import { syncDueMailboxes } from '@/lib/services/email-inbox';

const globalInboxScheduler = globalThis as unknown as {
  emailInboxTimer?: NodeJS.Timeout;
  emailInboxTickRunning?: boolean;
};

async function tick() {
  if (globalInboxScheduler.emailInboxTickRunning) return;
  globalInboxScheduler.emailInboxTickRunning = true;
  try {
    await syncDueMailboxes();
  } catch (error) {
    console.error('Email inbox scheduler error:', error);
  } finally {
    globalInboxScheduler.emailInboxTickRunning = false;
  }
}

export function startEmailInboxScheduler() {
  if (globalInboxScheduler.emailInboxTimer) return;
  setTimeout(() => void tick(), 10_000);
  globalInboxScheduler.emailInboxTimer = setInterval(() => void tick(), 60_000);
  globalInboxScheduler.emailInboxTimer.unref?.();
}
