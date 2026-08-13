import { db } from '@/lib/db';

export interface SMTPHaltSignal {
  haltAutoSending?: boolean;
  error?: string;
  smtpResponseCode?: number | null;
  smtpEnhancedCode?: string | null;
}

export async function stopAutoSendingForSMTPLimit(
  userId: string,
  signal: SMTPHaltSignal
): Promise<boolean> {
  if (!signal.haltAutoSending) return false;

  const haltResult = JSON.stringify({
    success: false,
    smtpHalted: true,
    smtpHaltReason:
      signal.error ||
      'Limite SMTP détectée. L’auto-candidature a été arrêtée.',
    smtpResponseCode: signal.smtpResponseCode || null,
    smtpEnhancedCode: signal.smtpEnhancedCode || null,
    haltedAt: new Date().toISOString(),
  });
  await db.autoApplyConfig.updateMany({
    where: { userId },
    data: {
      enabled: false,
      running: false,
      runStartedAt: null,
      nextRunAt: null,
      lastResult: haltResult,
    },
  });
  return true;
}
