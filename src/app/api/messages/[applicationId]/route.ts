import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { decryptString, isValidEmail, sendEmailNotification } from '@/lib/services/smtp';
import { stopAutoSendingForSMTPLimit } from '@/lib/services/smtp-circuit-breaker';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function replySubject(subject: string): string {
  const cleaned = subject.replace(/^\s*((re|aw|wg|fw|fwd)\s*:\s*)+/i, '').trim();
  return `Re: ${cleaned || 'Ihre Nachricht'}`;
}

async function ownedApplication(applicationId: string, userId: string) {
  return db.jobApplication.findFirst({
    where: { id: applicationId, userId },
    include: {
      jobOffer: true,
      messages: { orderBy: { sentAt: 'asc' } },
    },
  });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ applicationId: string }> }
) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const { applicationId } = await context.params;
  const application = await ownedApplication(applicationId, user.id);
  if (!application) {
    return NextResponse.json({ error: 'Conversation introuvable.' }, { status: 404 });
  }

  await db.applicationMessage.updateMany({
    where: {
      applicationId: application.id,
      userId: user.id,
      direction: 'INBOUND',
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return NextResponse.json({
    application: {
      ...application,
      messages: application.messages.map((message) => ({
        ...message,
        readAt: message.direction === 'INBOUND' ? message.readAt || new Date() : message.readAt,
      })),
    },
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ applicationId: string }> }
) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  try {
    const { applicationId } = await context.params;
    const body = await req.json();
    const text = String(body.text || '').trim();
    if (!text) {
      return NextResponse.json({ error: 'Écrivez un message avant de l’envoyer.' }, { status: 400 });
    }
    if (text.length > 10_000) {
      return NextResponse.json({ error: 'Le message ne peut pas dépasser 10 000 caractères.' }, { status: 400 });
    }
    const rateLimit = await checkRateLimit(`message-send:${user.id}`, 30, 60 * 60_000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Limite d’envoi atteinte. Réessayez plus tard.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    const [application, smtp] = await Promise.all([
      ownedApplication(applicationId, user.id),
      db.smtpConfig.findUnique({ where: { userId: user.id } }),
    ]);
    if (!application) {
      return NextResponse.json({ error: 'Conversation introuvable.' }, { status: 404 });
    }
    if (!smtp?.active || !smtp.isTested) {
      return NextResponse.json(
        { error: 'Activez et testez SMTP avant de répondre.' },
        { status: 400 }
      );
    }

    const latestInbound = [...application.messages]
      .reverse()
      .find((message) => message.direction === 'INBOUND' && isValidEmail(message.fromEmail));
    const recipient = latestInbound?.fromEmail || application.jobOffer.contactEmail;
    if (!isValidEmail(recipient)) {
      return NextResponse.json(
        { error: 'Aucune adresse e-mail valide n’est disponible pour cette conversation.' },
        { status: 400 }
      );
    }

    const lastMessage = application.messages.at(-1);
    const subject = replySubject(
      lastMessage?.subject || `Bewerbung – ${application.jobOffer.title} – ${user.name}`
    );
    const threadMessageIds = application.messages
      .map((message) => message.messageId)
      .filter((messageId): messageId is string =>
        Boolean(messageId && !messageId.startsWith('imap:'))
      )
      .slice(-20);
    const inReplyTo = threadMessageIds.at(-1);

    const delivery = await sendEmailNotification(
      {
        provider: smtp.provider,
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        authUser: smtp.authUser,
        authPass: decryptString(smtp.authPassEncrypted),
        fromEmail: smtp.fromEmail || smtp.authUser,
        fromName: smtp.fromName || user.name,
      },
      recipient,
      subject,
      `<!doctype html><html lang="de"><body>${escapeHtml(text).replace(/\r?\n/g, '<br>')}</body></html>`,
      [],
      text,
      {
        inReplyTo,
        references: threadMessageIds,
      }
    );
    if (!delivery.success) {
      const autoApplyStopped = await stopAutoSendingForSMTPLimit(user.id, delivery);
      return NextResponse.json(
        {
          error: delivery.error || 'Le message n’a pas pu être envoyé.',
          autoApplyStopped,
        },
        { status: 502 }
      );
    }

    const message = await db.applicationMessage.create({
      data: {
        applicationId: application.id,
        userId: user.id,
        direction: 'OUTBOUND',
        messageId: delivery.messageId || null,
        inReplyTo: inReplyTo || null,
        fromEmail: smtp.fromEmail || smtp.authUser,
        toEmail: recipient,
        subject,
        bodyText: text,
        sentAt: new Date(),
        readAt: new Date(),
      },
    });
    await db.jobApplication.update({
      where: { id: application.id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ success: true, message });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Le message n’a pas pu être envoyé.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
