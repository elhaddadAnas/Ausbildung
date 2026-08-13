import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { db } from '@/lib/db';
import { decryptString, isValidEmail } from '@/lib/services/smtp';

const INITIAL_LOOKBACK_DAYS = 30;
const SYNC_OVERLAP_MINUTES = 10;
const SYNC_INTERVAL_MINUTES = 1;
const STALE_SYNC_MINUTES = 10;
const MAX_MESSAGES_PER_SYNC = 100;
const MAX_MESSAGE_BYTES = 5_000_000;

interface InboxConfig {
  provider: string;
  smtpHost: string;
  imapHost: string | null;
  imapPort: number;
  imapSecure: boolean;
  authUser: string;
  authPass: string;
}

function normalizeMessageId(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeSubject(value: string | null | undefined): string {
  return String(value || '')
    .replace(/^\s*((re|aw|wg|fw|fwd)\s*:\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function cleanMessageBody(value: string | null | undefined): string {
  const normalized = String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim();
  if (!normalized) return '(Message sans contenu texte)';

  const replySeparators = [
    /^\s*On .+wrote:\s*$/im,
    /^\s*Am .+schrieb .+:\s*$/im,
    /^\s*Le .+a écrit\s*:\s*$/im,
    /^\s*From:\s.+$/im,
    /^\s*Von:\s.+$/im,
    /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
    /^\s*-{2,}\s*Ursprüngliche Nachricht\s*-{2,}\s*$/im,
  ];
  let end = normalized.length;
  for (const separator of replySeparators) {
    const match = separator.exec(normalized);
    if (match?.index !== undefined) end = Math.min(end, match.index);
  }
  return normalized
    .slice(0, end)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 30_000) || normalized.slice(0, 30_000);
}

function resolveInboxConfig(config: {
  provider: string;
  host: string;
  imapHost: string | null;
  imapPort: number;
  imapSecure: boolean;
  authUser: string;
  authPassEncrypted: string;
}): InboxConfig | null {
  const provider = config.provider.toLowerCase();
  let imapHost = config.imapHost?.trim() || null;
  let imapPort = config.imapPort || 993;
  let imapSecure = config.imapSecure;

  if (provider === 'gmail') {
    imapHost = 'imap.gmail.com';
    imapPort = 993;
    imapSecure = true;
  } else if (provider === 'outlook') {
    imapHost = 'outlook.office365.com';
    imapPort = 993;
    imapSecure = true;
  }

  const authPass = decryptString(config.authPassEncrypted);
  if (!imapHost || !isValidEmail(config.authUser) || !authPass) return null;
  return {
    provider,
    smtpHost: config.host,
    imapHost,
    imapPort,
    imapSecure,
    authUser: config.authUser,
    authPass,
  };
}

function friendlyInboxError(error: unknown, provider: string): string {
  const message = error instanceof Error ? error.message : String(error || '');
  const lowered = message.toLowerCase();
  if (lowered.includes('auth') || lowered.includes('credentials') || lowered.includes('login')) {
    return provider === 'gmail'
      ? "Connexion Gmail IMAP refusée. Vérifiez le mot de passe d’application et que l’accès IMAP est autorisé."
      : 'Connexion IMAP refusée. Vérifiez les identifiants et les autorisations de la boîte e-mail.';
  }
  if (lowered.includes('timeout') || lowered.includes('timed out')) {
    return 'Le serveur IMAP ne répond pas.';
  }
  return message || 'La synchronisation de la boîte e-mail a échoué.';
}

function findApplicationForMessage(
  applications: Array<{
    id: string;
    appliedAt: Date | null;
    jobOffer: { title: string; company: string; contactEmail: string | null };
    messages: Array<{ messageId: string | null; subject: string }>;
  }>,
  fromEmail: string,
  subject: string,
  references: string[]
) {
  const referenceSet = new Set(references.map((value) => value.trim()).filter(Boolean));
  const byReference = applications.find((application) =>
    application.messages.some((message) => message.messageId && referenceSet.has(message.messageId))
  );
  if (byReference) return byReference;

  const normalizedFrom = fromEmail.trim().toLowerCase();
  const normalizedIncomingSubject = normalizeSubject(subject);
  const bySenderAndSubject = applications.find((application) => {
    const contactMatches =
      application.jobOffer.contactEmail?.trim().toLowerCase() === normalizedFrom;
    const threadSubjectMatches = application.messages.some(
      (message) => normalizeSubject(message.subject) === normalizedIncomingSubject
    );
    return contactMatches && threadSubjectMatches;
  });
  if (bySenderAndSubject) return bySenderAndSubject;

  return applications.find((application) => {
    const title = normalizeSubject(application.jobOffer.title);
    const company = normalizeSubject(application.jobOffer.company);
    return Boolean(
      normalizedIncomingSubject &&
      (normalizedIncomingSubject.includes(title) ||
        (company.length >= 4 && normalizedIncomingSubject.includes(company)))
    );
  });
}

export async function syncMailboxForUser(userId: string) {
  const storedConfig = await db.smtpConfig.findUnique({ where: { userId } });
  if (!storedConfig?.active || !storedConfig.imapActive || !storedConfig.isTested) {
    return {
      success: false,
      skipped: true,
      error: 'Activez et testez la messagerie avant de synchroniser les réponses.',
    };
  }

  const inbox = resolveInboxConfig(storedConfig);
  if (!inbox) {
    return {
      success: false,
      skipped: true,
      error: 'Configurez un serveur IMAP valide pour recevoir les réponses.',
    };
  }

  const acquired = await db.smtpConfig.updateMany({
    where: { id: storedConfig.id, imapSyncing: false, imapActive: true },
    data: { imapSyncing: true, imapSyncStartedAt: new Date() },
  });
  if (!acquired.count) {
    return { success: true, skipped: true, received: 0, message: 'Synchronisation déjà en cours.' };
  }

  const applications = await db.jobApplication.findMany({
    where: { userId, appliedAt: { not: null } },
    include: {
      jobOffer: true,
      messages: {
        select: { messageId: true, subject: true },
        orderBy: { sentAt: 'asc' },
      },
    },
    orderBy: { appliedAt: 'desc' },
  });

  const client = new ImapFlow({
    host: inbox.imapHost!,
    port: inbox.imapPort,
    secure: inbox.imapSecure,
    auth: { user: inbox.authUser, pass: inbox.authPass },
    logger: false,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  let received = 0;
  let lock: { release(): void } | null = null;
  try {
    if (!applications.length) {
      return { success: true, received: 0, message: 'Aucune candidature envoyée à synchroniser.' };
    }

    await client.connect();
    lock = await client.getMailboxLock('INBOX');
    const since = storedConfig.lastImapSyncAt
      ? new Date(storedConfig.lastImapSyncAt.getTime() - SYNC_OVERLAP_MINUTES * 60_000)
      : new Date(Date.now() - INITIAL_LOOKBACK_DAYS * 24 * 60 * 60_000);
    const searchResult = await client.search({ since }, { uid: true });
    const uids = Array.isArray(searchResult)
      ? searchResult.slice(-MAX_MESSAGES_PER_SYNC)
      : [];

    if (uids.length) {
      for await (const message of client.fetch(
        uids,
        { uid: true, source: { maxLength: MAX_MESSAGE_BYTES } },
        { uid: true }
      )) {
        if (!message.source) continue;
        try {
          const parsed = await simpleParser(message.source, { skipImageLinks: true });
          const fromEmail = parsed.from?.value[0]?.address?.trim() || '';
          if (!isValidEmail(fromEmail)) continue;
          if (
            fromEmail.toLowerCase() === storedConfig.authUser.toLowerCase() ||
            fromEmail.toLowerCase() === storedConfig.fromEmail.toLowerCase()
          ) {
            continue;
          }

          const realMessageId = normalizeMessageId(parsed.messageId);
          const storedMessageId = realMessageId || `imap:${storedConfig.id}:${message.uid}`;
          const duplicate = await db.applicationMessage.findUnique({
            where: { messageId: storedMessageId },
            select: { id: true },
          });
          if (duplicate) continue;

          const references = [
            normalizeMessageId(parsed.inReplyTo),
            ...(Array.isArray(parsed.references)
              ? parsed.references
              : parsed.references
                ? [parsed.references]
                : []),
          ].filter((value): value is string => Boolean(value));
          const subject = parsed.subject?.trim() || '(Sans objet)';
          const application = findApplicationForMessage(
            applications,
            fromEmail,
            subject,
            references
          );
          if (!application) continue;

          const recipientAddresses = Array.isArray(parsed.to)
            ? parsed.to.flatMap((addressGroup) => addressGroup.value)
            : parsed.to?.value || [];
          const toEmail = recipientAddresses
            .map((address) => address.address)
            .filter((address): address is string => Boolean(address))
            .join(', ') || storedConfig.fromEmail;

          await db.applicationMessage.create({
            data: {
              applicationId: application.id,
              userId,
              direction: 'INBOUND',
              messageId: storedMessageId,
              inReplyTo: normalizeMessageId(parsed.inReplyTo),
              fromEmail,
              toEmail,
              subject,
              bodyText: cleanMessageBody(parsed.text),
              sentAt: parsed.date || new Date(),
            },
          });
          await db.jobApplication.update({
            where: { id: application.id },
            data: { updatedAt: new Date() },
          });
          received++;
        } catch (error) {
          console.warn('Skipping unreadable inbox message:', error);
        }
      }
    }

    return {
      success: true,
      received,
      message: received
        ? `${received} nouvelle(s) réponse(s) synchronisée(s).`
        : 'Aucune nouvelle réponse.',
    };
  } catch (error) {
    return { success: false, received, error: friendlyInboxError(error, inbox.provider) };
  } finally {
    lock?.release();
    if (client.usable) {
      await client.logout().catch(() => client.close());
    }
    await db.smtpConfig.update({
      where: { id: storedConfig.id },
      data: {
        imapSyncing: false,
        imapSyncStartedAt: null,
        lastImapSyncAt: new Date(),
      },
    });
  }
}

export async function syncDueMailboxes() {
  const staleBefore = new Date(Date.now() - STALE_SYNC_MINUTES * 60_000);
  await db.smtpConfig.updateMany({
    where: { imapSyncing: true, imapSyncStartedAt: { lt: staleBefore } },
    data: { imapSyncing: false, imapSyncStartedAt: null },
  });

  const dueBefore = new Date(Date.now() - SYNC_INTERVAL_MINUTES * 60_000);
  const configs = await db.smtpConfig.findMany({
    where: {
      active: true,
      isTested: true,
      imapActive: true,
      imapSyncing: false,
      OR: [{ lastImapSyncAt: null }, { lastImapSyncAt: { lte: dueBefore } }],
    },
    select: { userId: true },
  });
  for (const config of configs) {
    await syncMailboxForUser(config.userId);
  }
}
