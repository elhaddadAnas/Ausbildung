const placeholderSecrets = new Set([
  'generate-a-random-secret-with-at-least-32-characters',
  'generate-a-different-random-secret-with-at-least-32-characters',
  'change-this-to-a-long-random-production-secret',
  'ausbildung_finder_ai_jwt_secret_key_2026_super_secure',
  'your_jwt_secret_key',
]);

export function validateProductionEnvironment() {
  if (process.env.NODE_ENV !== 'production') return;

  const databaseUrl = process.env.NEON_DATABASE_URL?.trim() || '';
  const jwtSecret = process.env.JWT_SECRET?.trim() || '';
  const smtpKey = process.env.SMTP_ENCRYPTION_KEY?.trim() || '';
  const errors: string[] = [];

  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    errors.push('NEON_DATABASE_URL must be a PostgreSQL connection URL.');
  }
  const directDatabaseUrl = process.env.NEON_DATABASE_URL_UNPOOLED?.trim() || '';
  if (!/^postgres(ql)?:\/\//.test(directDatabaseUrl)) {
    errors.push('NEON_DATABASE_URL_UNPOOLED must be a PostgreSQL connection URL.');
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
  if (errors.length) {
    throw new Error(`Invalid production environment:\n- ${errors.join('\n- ')}`);
  }
}
