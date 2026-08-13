import nodemailer from 'nodemailer';
import crypto from 'crypto';
import net from 'net';
import { lookup } from 'dns/promises';
import {
  classifySMTPError,
  formatSMTPHaltMessage,
} from '@/lib/services/smtp-limits';

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
const FALLBACK_V2_ENCRYPTION_KEY = configuredEncryptionKey && process.env.JWT_SECRET
  ? crypto.scryptSync(process.env.JWT_SECRET, 'smtp-config-v2', 32)
  : null;
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
      // Development versions used JWT_SECRET when SMTP_ENCRYPTION_KEY was not
      // yet configured. Keep that key as a read-only fallback so adding the
      // required production key does not invalidate already saved SMTP data.
      const keys = FALLBACK_V2_ENCRYPTION_KEY
        ? [ENCRYPTION_KEY, FALLBACK_V2_ENCRYPTION_KEY]
        : [ENCRYPTION_KEY];
      for (const key of keys) {
        try {
          const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            key,
            Buffer.from(ivHex, 'hex')
          );
          decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
          return Buffer.concat([
            decipher.update(Buffer.from(payloadHex, 'hex')),
            decipher.final(),
          ]).toString('utf8');
        } catch {
          // Try the legacy JWT-derived v2 key when one is available.
        }
      }
      return '';
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
  path?: string;
  content?: Buffer;
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
    fromName: String(config.fromName || 'Azubora').trim(),
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

function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      /^fe[89ab]/.test(normalized)
    );
  }
  return true;
}

export async function assertSafeMailHost(host: string): Promise<void> {
  if (process.env.ALLOW_PRIVATE_MAIL_HOSTS === 'true') return;
  const normalized = host.trim().toLowerCase().replace(/\.$/, '');
  if (
    !normalized ||
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal')
  ) {
    throw new Error('Les serveurs de messagerie privés ou locaux ne sont pas autorisés.');
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(normalized, { all: true, verbatim: true });
  } catch {
    throw new Error('L’hôte de messagerie est introuvable.');
  }
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error('L’hôte de messagerie pointe vers une adresse réseau privée non autorisée.');
  }
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
  const limit = classifySMTPError(error);
  if (limit.haltAutoSending) return formatSMTPHaltMessage(limit);

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
  haltAutoSending?: boolean;
  smtpResponseCode?: number | null;
  smtpEnhancedCode?: string | null;
}> {
  const normalized = normalizeSMTPConfig(config);
  const validationError = validateSMTPConfig(normalized);
  if (validationError) return { success: false, message: validationError };

  let transporter: ReturnType<typeof createTransport> | null = null;
  try {
    await assertSafeMailHost(normalized.host);
    transporter = createTransport(normalized);
    await transporter.verify();
    return {
      success: true,
      message: `Connexion SMTP sécurisée réussie avec ${normalized.host}:${normalized.port}.`,
    };
  } catch (error) {
    const classification = classifySMTPError(error);
    return {
      success: false,
      message: friendlySMTPError(error, normalized.provider),
      haltAutoSending: classification.haltAutoSending,
      smtpResponseCode: classification.responseCode,
      smtpEnhancedCode: classification.enhancedCode,
    };
  } finally {
    transporter?.close();
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
): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
  haltAutoSending?: boolean;
  smtpResponseCode?: number | null;
  smtpEnhancedCode?: string | null;
}> {
  const normalized = normalizeSMTPConfig(config);
  const validationError = validateSMTPConfig(normalized);
  if (validationError) return { success: false, error: validationError };
  if (!isValidEmail(toEmail)) {
    return { success: false, error: 'Aucune adresse e-mail de candidature valide n’est disponible.' };
  }

  let transporter: ReturnType<typeof createTransport> | null = null;
  try {
    await assertSafeMailHost(normalized.host);
    transporter = createTransport(normalized);
    const info = await transporter.sendMail({
      from: {
        name: normalized.fromName || 'Azubora',
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
    return { success: true, messageId: info.messageId };
  } catch (error) {
    const classification = classifySMTPError(error);
    return {
      success: false,
      error: friendlySMTPError(error, normalized.provider),
      haltAutoSending: classification.haltAutoSending,
      smtpResponseCode: classification.responseCode,
      smtpEnhancedCode: classification.enhancedCode,
    };
  } finally {
    transporter?.close();
  }
}
