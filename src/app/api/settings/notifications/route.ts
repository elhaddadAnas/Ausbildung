import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  MASKED_PASSWORD,
  decryptString,
  encryptString,
} from '@/lib/services/smtp';
import { checkRateLimit } from '@/lib/rate-limit';

function readableWebhook(value: string | null | undefined): string {
  if (!value) return '';
  return value.startsWith('v2:') ? decryptString(value) : value;
}

function isDiscordWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const allowedHosts = new Set([
      'discord.com',
      'canary.discord.com',
      'ptb.discord.com',
      'discordapp.com',
    ]);
    return (
      url.protocol === 'https:' &&
      allowedHosts.has(url.hostname.toLowerCase()) &&
      /^\/api\/webhooks\/[^/]+\/[^/]+/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function publicConfig<T extends { discordWebhookUrl: string | null }>(config: T) {
  return {
    ...config,
    discordWebhookUrl: config.discordWebhookUrl ? MASKED_PASSWORD : null,
  };
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const config = await db.notificationConfig.findUnique({ where: { userId: user.id } });
  const safeConfig = config ? publicConfig(config) : null;
  return NextResponse.json({
    config: safeConfig,
    notificationConfig: safeConfig,
  });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  const rateLimit = await checkRateLimit(`notification-settings:${user.id}`, 30, 60 * 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Trop de modifications. Réessayez plus tard.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  try {
    const body = await req.json();
    const existing = await db.notificationConfig.findUnique({ where: { userId: user.id } });
    const telegramEnabled = Boolean(body.telegramEnabled);
    const telegramChatId = String(body.telegramChatId || '').trim();
    const discordEnabled = Boolean(body.discordEnabled);
    const submittedWebhook = String(body.discordWebhookUrl || '').trim();
    const keepsStoredWebhook =
      !submittedWebhook || submittedWebhook === MASKED_PASSWORD;
    const discordWebhookUrl = keepsStoredWebhook
      ? readableWebhook(existing?.discordWebhookUrl)
      : submittedWebhook;

    if (telegramEnabled) {
      if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) {
        return NextResponse.json(
          { error: 'TELEGRAM_BOT_TOKEN doit être configuré sur le serveur.' },
          { status: 400 }
        );
      }
      if (!/^-?\d{5,20}$/.test(telegramChatId)) {
        return NextResponse.json(
          { error: 'L’identifiant de chat Telegram est invalide.' },
          { status: 400 }
        );
      }
    }
    if (discordEnabled && !isDiscordWebhookUrl(discordWebhookUrl)) {
      return NextResponse.json(
        { error: 'L’URL du webhook Discord est invalide.' },
        { status: 400 }
      );
    }
    if (body.whatsappEnabled) {
      return NextResponse.json(
        { error: 'WhatsApp nécessite un fournisseur Business API et n’est pas activé sur ce serveur.' },
        { status: 400 }
      );
    }

    const storedWebhook = discordWebhookUrl
      ? keepsStoredWebhook && existing?.discordWebhookUrl
        ? existing.discordWebhookUrl
        : encryptString(discordWebhookUrl)
      : null;
    const updated = await db.notificationConfig.upsert({
      where: { userId: user.id },
      update: {
        emailEnabled: Boolean(body.emailEnabled),
        telegramEnabled,
        telegramChatId: telegramEnabled ? telegramChatId : null,
        whatsappEnabled: false,
        whatsappNumber: null,
        discordEnabled,
        discordWebhookUrl: discordEnabled ? storedWebhook : null,
        ...(body.alertOnNewMatch !== undefined
          ? { alertOnNewMatch: Boolean(body.alertOnNewMatch) }
          : {}),
        ...(body.alertOnStatusChange !== undefined
          ? { alertOnStatusChange: Boolean(body.alertOnStatusChange) }
          : {}),
      },
      create: {
        userId: user.id,
        emailEnabled: body.emailEnabled !== false,
        telegramEnabled,
        telegramChatId: telegramEnabled ? telegramChatId : null,
        whatsappEnabled: false,
        whatsappNumber: null,
        discordEnabled,
        discordWebhookUrl: discordEnabled ? storedWebhook : null,
        alertOnNewMatch: body.alertOnNewMatch !== false,
        alertOnStatusChange: body.alertOnStatusChange !== false,
      },
    });

    return NextResponse.json({
      success: true,
      config: publicConfig(updated),
      notificationConfig: publicConfig(updated),
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Speichern der Benachrichtigungseinstellungen fehlgeschlagen.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
