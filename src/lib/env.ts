const placeholderSecrets = new Set([
  'generate-a-random-secret-with-at-least-32-characters',
  'generate-a-different-random-secret-with-at-least-32-characters',
  'change-this-to-a-long-random-production-secret',
  'ausbildung_finder_ai_jwt_secret_key_2026_super_secure',
  'your_jwt_secret_key',
]);

export function validateProductionEnvironment() {
  if (process.env.NODE_ENV !== 'production') return;

  const databaseUrl = process.env.DATABASE_URL?.trim() || '';
  const jwtSecret = process.env.JWT_SECRET?.trim() || '';
  const smtpKey = process.env.SMTP_ENCRYPTION_KEY?.trim() || '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || '';
  const bankHolder = process.env.BANK_ACCOUNT_HOLDER?.trim() || '';
  const bankRib = process.env.BANK_RIB?.replace(/\s+/g, '').toUpperCase() || '';
  const bankIban = process.env.BANK_IBAN?.replace(/\s+/g, '').toUpperCase() || '';
  const bankBic = process.env.BANK_BIC?.replace(/\s+/g, '').toUpperCase() || '';
  const systemSmtpHost = process.env.SYSTEM_SMTP_HOST?.trim() || '';
  const systemSmtpPort = Number(process.env.SYSTEM_SMTP_PORT || 587);
  const systemSmtpUser = process.env.SYSTEM_SMTP_USER?.trim() || '';
  const systemSmtpPassword = process.env.SYSTEM_SMTP_PASSWORD || '';
  const systemSmtpFrom = process.env.SYSTEM_SMTP_FROM_EMAIL?.trim() || '';
  const errors: string[] = [];

  if (!databaseUrl.startsWith('file:')) {
    errors.push('DATABASE_URL must use file: because the Prisma schema uses SQLite.');
  }
  if (jwtSecret.length < 32 || placeholderSecrets.has(jwtSecret)) {
    errors.push('JWT_SECRET must be a random value of at least 32 characters.');
  }
  if (
    smtpKey.length < 32 ||
    placeholderSecrets.has(smtpKey) ||
    smtpKey === jwtSecret
  ) {
    errors.push('SMTP_ENCRYPTION_KEY must be a distinct random value of at least 32 characters.');
  }
  try {
    const parsed = new URL(appUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    if (
      parsed.protocol !== 'https:' &&
      !['localhost', '127.0.0.1'].includes(parsed.hostname)
    ) {
      errors.push('NEXT_PUBLIC_APP_URL must use HTTPS outside localhost.');
    }
  } catch {
    errors.push('NEXT_PUBLIC_APP_URL must be an absolute HTTP(S) URL.');
  }
  if (!bankHolder) errors.push('BANK_ACCOUNT_HOLDER is required.');
  if (!bankRib && !bankIban) {
    errors.push('BANK_RIB or BANK_IBAN is required.');
  }
  if (bankRib && !/^[A-Z0-9]{10,34}$/.test(bankRib)) {
    errors.push('BANK_RIB must contain between 10 and 34 letters or digits.');
  }
  if (bankIban && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(bankIban)) {
    errors.push('BANK_IBAN is invalid.');
  }
  if (bankBic && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bankBic)) {
    errors.push('BANK_BIC must be a valid 8 or 11 character BIC.');
  }
  if (!systemSmtpHost || /\s/.test(systemSmtpHost)) {
    errors.push('SYSTEM_SMTP_HOST is required and must be a hostname.');
  }
  if (!Number.isInteger(systemSmtpPort) || systemSmtpPort < 1 || systemSmtpPort > 65535) {
    errors.push('SYSTEM_SMTP_PORT must be between 1 and 65535.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(systemSmtpUser)) {
    errors.push('SYSTEM_SMTP_USER must be a valid email address.');
  }
  if (!systemSmtpPassword) errors.push('SYSTEM_SMTP_PASSWORD is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(systemSmtpFrom)) {
    errors.push('SYSTEM_SMTP_FROM_EMAIL must be a valid email address.');
  }
  if (errors.length) {
    throw new Error(`Invalid production environment:\n- ${errors.join('\n- ')}`);
  }
}
