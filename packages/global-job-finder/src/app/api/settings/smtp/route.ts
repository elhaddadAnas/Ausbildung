import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  MASKED_PASSWORD,
  decryptString,
  encryptString,
  normalizeSMTPConfig,
  testSMTPConnection,
  validateSMTPConfig,
} from '@/lib/services/smtp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function publicSMTP(smtp: any) {
  return {
    id: smtp.id,
    provider: smtp.provider,
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    authUser: smtp.authUser,
    authPass: MASKED_PASSWORD,
    fromEmail: smtp.fromEmail,
    fromName: smtp.fromName,
    active: smtp.active,
    isTested: smtp.isTested,
    lastTestedAt: smtp.lastTestedAt,
    imapHost: smtp.imapHost,
    imapPort: smtp.imapPort,
    imapSecure: smtp.imapSecure,
    imapActive: smtp.imapActive,
    lastImapSyncAt: smtp.lastImapSyncAt,
    updatedAt: smtp.updatedAt,
  };
}

function inboxSettings(body: any, provider: string, existing?: any) {
  if (provider === 'gmail') {
    return { imapHost: 'imap.gmail.com', imapPort: 993, imapSecure: true };
  }
  if (provider === 'outlook') {
    return { imapHost: 'outlook.office365.com', imapPort: 993, imapSecure: true };
  }
  const requestedPort = Number(body.imapPort ?? existing?.imapPort ?? 993);
  return {
    imapHost: String(body.imapHost ?? existing?.imapHost ?? '').trim() || null,
    imapPort: Number.isInteger(requestedPort) && requestedPort >= 1 && requestedPort <= 65535
      ? requestedPort
      : 993,
    imapSecure: body.imapSecure ?? existing?.imapSecure ?? true,
  };
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const smtp = await db.smtpConfig.findUnique({ where: { userId: user.id } });
  return NextResponse.json({ smtp: smtp ? publicSMTP(smtp) : null });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  try {
    const body = await req.json();
    const existing = await db.smtpConfig.findUnique({ where: { userId: user.id } });
    const submittedPassword = String(body.authPass || '');
    const usesStoredPassword = !submittedPassword || submittedPassword === MASKED_PASSWORD;
    const plainPassword = usesStoredPassword
      ? decryptString(existing?.authPassEncrypted || '')
      : submittedPassword;

    const config = normalizeSMTPConfig({
      provider: body.provider || 'custom',
      host: body.host,
      port: Number(body.port),
      secure: Boolean(body.secure),
      authUser: body.authUser,
      authPass: plainPassword,
      fromEmail: body.fromEmail || body.authUser,
      fromName: body.fromName || user.name,
    });
    const validationError = validateSMTPConfig(config);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    const imap = inboxSettings(body, config.provider, existing);
    const imapActive = body.imapActive !== false;
    if (imapActive && config.provider === 'custom' && !imap.imapHost) {
      return NextResponse.json(
        { error: 'Indiquez l’hôte IMAP ou désactivez la réception des réponses.' },
        { status: 400 }
      );
    }

    const settingsChanged = Boolean(
      !existing ||
      !usesStoredPassword ||
      existing.provider !== config.provider ||
      existing.host !== config.host ||
      existing.port !== config.port ||
      existing.secure !== config.secure ||
      existing.authUser !== config.authUser ||
      existing.fromEmail !== config.fromEmail
    );
    const inboxSettingsChanged = Boolean(
      !existing ||
      existing.imapHost !== imap.imapHost ||
      existing.imapPort !== imap.imapPort ||
      existing.imapSecure !== imap.imapSecure ||
      existing.authUser !== config.authUser ||
      !usesStoredPassword
    );

    const smtp = await db.smtpConfig.upsert({
      where: { userId: user.id },
      update: {
        provider: config.provider,
        host: config.host,
        port: config.port,
        secure: config.secure,
        authUser: config.authUser,
        authPassEncrypted: usesStoredPassword && existing
          ? existing.authPassEncrypted
          : encryptString(config.authPass),
        fromEmail: config.fromEmail,
        fromName: config.fromName,
        active: body.active !== false,
        ...imap,
        imapActive,
        ...(inboxSettingsChanged ? { lastImapSyncAt: null } : {}),
        ...(settingsChanged ? { isTested: false, lastTestedAt: null } : {}),
      },
      create: {
        userId: user.id,
        provider: config.provider,
        host: config.host,
        port: config.port,
        secure: config.secure,
        authUser: config.authUser,
        authPassEncrypted: encryptString(config.authPass),
        fromEmail: config.fromEmail,
        fromName: config.fromName,
        active: body.active !== false,
        isTested: false,
        ...imap,
        imapActive,
      },
    });
    if (!smtp.active) {
      await db.autoApplyConfig.updateMany({
        where: { userId: user.id },
        data: { enabled: false, nextRunAt: null },
      });
    }

    return NextResponse.json({ success: true, smtp: publicSMTP(smtp) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SMTP-Konfiguration konnte nicht gespeichert werden.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  try {
    const body = await req.json();
    const existing = await db.smtpConfig.findUnique({ where: { userId: user.id } });
    const submittedPassword = String(body.authPass || '');
    const usesStoredPassword = !submittedPassword || submittedPassword === MASKED_PASSWORD;
    const authPass = usesStoredPassword
      ? decryptString(existing?.authPassEncrypted || '')
      : submittedPassword;

    const config = normalizeSMTPConfig({
      provider: body.provider || existing?.provider || 'custom',
      host: body.host || existing?.host || '',
      port: Number(body.port || existing?.port || 587),
      secure: body.secure ?? existing?.secure ?? false,
      authUser: body.authUser || existing?.authUser || '',
      authPass,
      fromEmail: body.fromEmail || existing?.fromEmail || body.authUser,
      fromName: body.fromName || existing?.fromName || user.name,
    });
    const result = await testSMTPConnection(config);
    const imap = inboxSettings(body, config.provider, existing);
    const imapActive = body.imapActive !== false;
    if (imapActive && config.provider === 'custom' && !imap.imapHost) {
      return NextResponse.json(
        { success: false, message: 'Indiquez l’hôte IMAP ou désactivez la réception des réponses.' },
        { status: 400 }
      );
    }

    let matchesSavedConfig = Boolean(
      existing &&
      config.provider === existing.provider &&
      config.host === existing.host &&
      config.port === existing.port &&
      config.secure === existing.secure &&
      config.authUser === existing.authUser &&
      config.fromEmail === existing.fromEmail &&
      (usesStoredPassword || decryptString(existing.authPassEncrypted) === config.authPass)
    );

    if (result.success && body.saveOnSuccess) {
      await db.smtpConfig.upsert({
        where: { userId: user.id },
        update: {
          provider: config.provider,
          host: config.host,
          port: config.port,
          secure: config.secure,
          authUser: config.authUser,
          authPassEncrypted: usesStoredPassword && existing
            ? existing.authPassEncrypted
            : encryptString(config.authPass),
          fromEmail: config.fromEmail,
          fromName: config.fromName,
          active: body.active !== false,
          ...imap,
          imapActive,
          isTested: true,
          lastTestedAt: new Date(),
        },
        create: {
          userId: user.id,
          provider: config.provider,
          host: config.host,
          port: config.port,
          secure: config.secure,
          authUser: config.authUser,
          authPassEncrypted: encryptString(config.authPass),
          fromEmail: config.fromEmail,
          fromName: config.fromName,
          active: body.active !== false,
          isTested: true,
          lastTestedAt: new Date(),
          ...imap,
          imapActive,
        },
      });
      matchesSavedConfig = true;
    } else if (result.success && existing && matchesSavedConfig) {
      await db.smtpConfig.update({
        where: { userId: user.id },
        data: { isTested: true, lastTestedAt: new Date() },
      });
    }
    if (result.success && body.saveOnSuccess && body.active === false) {
      await db.autoApplyConfig.updateMany({
        where: { userId: user.id },
        data: { enabled: false, nextRunAt: null },
      });
    }

    return NextResponse.json({
      ...result,
      savedConfigurationTested: result.success && matchesSavedConfig,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SMTP-Test fehlgeschlagen.';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
