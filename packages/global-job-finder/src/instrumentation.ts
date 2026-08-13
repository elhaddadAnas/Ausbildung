export async function register() {
  // Instrumentation is also evaluated by Next.js build workers. Starting the
  // scheduler there can query the database while routes are being collected.
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    const { startAutoApplyScheduler } = await import('@/lib/services/auto-apply-scheduler');
    const { startEmailInboxScheduler } = await import('@/lib/services/email-inbox-scheduler');
    startAutoApplyScheduler();
    startEmailInboxScheduler();
  }
}
