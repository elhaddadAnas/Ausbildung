import nodemailer from 'nodemailer';
import crypto from 'crypto';

const MASKED_PASSWORD = '••••••••';
const configuredEncryptionKey = process.env.SMTP_ENCRYPTION_KEY || '';
const insecureEncryptionKeys = new Set([
  'change-this-to-a-long-random-production-secret',
  'use-a-long-random-secret-different-from-jwt',
  'generate-a-different-random-secret-with-at-least-32-characters',
]);
if (
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PHASE !== 'phase-production-build' &&
  (configuredEncryptionKey.length < 32 || insecureEncryptionKeys.has(configuredEncryptionKey))
) {
  throw new Error('SMTP_ENCRYPTION_KEY must be set to a random value of at least 32 characters.');
}
const keyMaterial =
  configuredEncryptionKey ||
  process.env.JWT_SECRET ||
  'development-only-smtp-encryption-key';
const ENCRYPTION_KEY = crypto.scryptSync(keyMaterial, 'smtp-config-v2', 32);
const LEGACY_ENCRYPTION_KEY = crypto.scryptSync(
  process.env.JWT_SECRET || 'ausbildung_finder_ai_jwt_secret_key_2026_super_secure',
  'salt',
  32
);

export { MASKED_PASSWORD };

export function encryptString(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptString(encryptedText: string): string {
  if (!encryptedText) return '';

  try {
    if (encryptedText.startsWith('v2:')) {
      const [, ivHex, tagHex, payloadHex] = encryptedText.split(':');
      if (!ivHex || !tagHex || !payloadHex) return '';
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        ENCRYPTION_KEY,
        Buffer.from(ivHex, 'hex')
      );
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      return Buffer.concat([
        decipher.update(Buffer.from(payloadHex, 'hex')),
        decipher.final(),
      ]).toString('utf8');
    }

    // Backwards compatibility for credentials stored by the original AES-CBC code.
    const [ivHex, encrypted] = encryptedText.split(':');
    if (!ivHex || !encrypted) return encryptedText;
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      LEGACY_ENCRYPTION_KEY,
      Buffer.from(ivHex, 'hex')
    );
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
  } catch {
    return '';
  }
}

export interface SMTPConfigInput {
  provider: 'gmail' | 'outlook' | 'custom' | string;
  host: string;
  port: number;
  secure: boolean;
  authUser: string;
  authPass: string;
  fromEmail: string;
  fromName: string;
}

export interface EmailAttachment {
  filename: string;
  path: string;
  contentType?: string;
}

export interface EmailThreadingOptions {
  inReplyTo?: string;
  references?: string[];
}

export function isValidEmail(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function normalizeSMTPConfig(config: SMTPConfigInput): SMTPConfigInput {
  const provider = String(config.provider || 'custom').toLowerCase();
  let host = String(config.host || '').trim();
  let port = Number(config.port);
  let secure = Boolean(config.secure);

  if (provider === 'gmail') {
    host = 'smtp.gmail.com';
    port = 587;
    secure = false;
  } else if (provider === 'outlook') {
    host = 'smtp.office365.com';
    port = 587;
    secure = false;
  } else {
    if (!port) port = 587;
    // Port 465 uses implicit TLS. Port 587/25 use STARTTLS.
    secure = port === 465 ? true : secure;
  }

  const authUser = String(config.authUser || '').trim();
  const requestedFromEmail = String(config.fromEmail || authUser).trim();
  const fromEmail =
    provider === 'gmail' || provider === 'outlook'
      ? authUser
      : requestedFromEmail;

  return {
    provider,
    host,
    port,
    secure,
    authUser,
    authPass: String(config.authPass || '').replace(/\s+/g, ''),
    fromEmail,
    fromName: String(config.fromName || 'Global Job Finder AI').trim(),
  };
}

export function validateSMTPConfig(config: SMTPConfigInput): string | null {
  const normalized = normalizeSMTPConfig(config);
  if (!normalized.host || /\s/.test(normalized.host)) return 'L’hôte SMTP est invalide.';
  if (!Number.isInteger(normalized.port) || normalized.port < 1 || normalized.port > 65535) {
    return 'Le port SMTP doit être compris entre 1 et 65535.';
  }
  if (!isValidEmail(normalized.authUser)) return 'Le nom d’utilisateur SMTP doit être une adresse e-mail valide.';
  if (!normalized.authPass) return 'Le mot de passe SMTP est obligatoire.';
  if (!isValidEmail(normalized.fromEmail)) return 'L’adresse d’expéditeur est invalide.';
  return null;
}

function createTransport(config: SMTPConfigInput) {
  const normalized = normalizeSMTPConfig(config);
  return nodemailer.createTransport({
    host: normalized.host,
    port: normalized.port,
    secure: normalized.secure,
    requireTLS: !normalized.secure && normalized.port === 587,
    auth: {
      user: normalized.authUser,
      pass: normalized.authPass,
    },
    tls: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

function friendlySMTPError(error: unknown, provider?: string): string {
  const message = error instanceof Error ? error.message : String(error || '');
  const lowered = message.toLowerCase();

  if (
    message.includes('535') ||
    lowered.includes('badcredentials') ||
    lowered.includes('authentication unsuccessful') ||
    lowered.includes('username and password not accepted')
  ) {
    if (provider === 'gmail') {
      return "Authentification Gmail refusée. Activez la validation en deux étapes et utilisez un mot de passe d’application Google de 16 caractères.";
    }
    if (provider === 'outlook') {
      return "Authentification Outlook refusée. Vérifiez que SMTP AUTH est autorisé pour ce compte et utilisez un mot de passe d’application si nécessaire.";
    }
    return 'Authentification SMTP refusée. Vérifiez le nom d’utilisateur et le mot de passe.';
  }
  if (lowered.includes('certificate') || lowered.includes('self signed')) {
    return 'Le certificat TLS du serveur SMTP n’est pas valide.';
  }
  if (lowered.includes('timeout') || lowered.includes('etimedout')) {
    return 'Le serveur SMTP ne répond pas. Vérifiez l’hôte, le port et le pare-feu.';
  }
  if (lowered.includes('enotfound') || lowered.includes('getaddrinfo')) {
    return 'L’hôte SMTP est introuvable.';
  }
  return message || 'La connexion SMTP a échoué.';
}

export async function testSMTPConnection(config: SMTPConfigInput): Promise<{
  success: boolean;
  message: string;
}> {
  const normalized = normalizeSMTPConfig(config);
  const validationError = validateSMTPConfig(normalized);
  if (validationError) return { success: false, message: validationError };

  try {
    const transporter = createTransport(normalized);
    await transporter.verify();
    transporter.close();
    return {
      success: true,
      message: `Connexion SMTP sécurisée réussie avec ${normalized.host}:${normalized.port}.`,
    };
  } catch (error) {
    return {
      success: false,
      message: friendlySMTPError(error, normalized.provider),
    };
  }
}

export async function sendEmailNotification(
  config: SMTPConfigInput,
  toEmail: string,
  subject: string,
  htmlContent: string,
  attachments: EmailAttachment[] = [],
  textContent?: string,
  threading: EmailThreadingOptions = {}
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const normalized = normalizeSMTPConfig(config);
  const validationError = validateSMTPConfig(normalized);
  if (validationError) return { success: false, error: validationError };
  if (!isValidEmail(toEmail)) {
    return { success: false, error: 'Aucune adresse e-mail de candidature valide n’est disponible.' };
  }

  try {
    const transporter = createTransport(normalized);
    const info = await transporter.sendMail({
      from: {
        name: normalized.fromName || 'Global Job Finder AI',
        address: normalized.fromEmail,
      },
      replyTo: normalized.fromEmail,
      to: toEmail.trim(),
      subject,
      text: textContent,
      html: htmlContent,
      attachments,
      inReplyTo: threading.inReplyTo,
      references: threading.references,
    });
    transporter.close();
    return { success: true, messageId: info.messageId };
  } catch (error) {
    return {
      success: false,
      error: friendlySMTPError(error, normalized.provider),
    };
  }
}
