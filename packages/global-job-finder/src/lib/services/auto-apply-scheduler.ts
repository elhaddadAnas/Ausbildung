import { runDueAutoApplyJobs } from '@/lib/services/auto-apply';

const globalScheduler = globalThis as unknown as {
  autoApplyTimer?: NodeJS.Timeout;
  autoApplyTickRunning?: boolean;
};

async function tick() {
  if (globalScheduler.autoApplyTickRunning) return;
  globalScheduler.autoApplyTickRunning = true;
  try {
    await runDueAutoApplyJobs();
  } catch (error) {
    console.error('Auto-apply scheduler error:', error);
  } finally {
    globalScheduler.autoApplyTickRunning = false;
  }
}

export function startAutoApplyScheduler() {
  if (globalScheduler.autoApplyTimer) return;
  setTimeout(() => void tick(), 5_000);
  globalScheduler.autoApplyTimer = setInterval(() => void tick(), 30_000);
  globalScheduler.autoApplyTimer.unref?.();
}
