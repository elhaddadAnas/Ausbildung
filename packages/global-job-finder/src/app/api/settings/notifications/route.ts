import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const config = await db.notificationConfig.findUnique({ where: { userId: user.id } });
  return NextResponse.json({ notificationConfig: config });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  try {
    const body = await req.json();

    const updated = await db.notificationConfig.upsert({
      where: { userId: user.id },
      update: {
        emailEnabled: Boolean(body.emailEnabled),
        telegramEnabled: Boolean(body.telegramEnabled),
        telegramChatId: body.telegramChatId || null,
        whatsappEnabled: Boolean(body.whatsappEnabled),
        whatsappNumber: body.whatsappNumber || null,
        discordEnabled: Boolean(body.discordEnabled),
        discordWebhookUrl: body.discordWebhookUrl || null,
        alertOnNewMatch: Boolean(body.alertOnNewMatch),
        alertOnStatusChange: Boolean(body.alertOnStatusChange),
      },
      create: {
        userId: user.id,
        emailEnabled: Boolean(body.emailEnabled),
        telegramEnabled: Boolean(body.telegramEnabled),
        telegramChatId: body.telegramChatId || null,
        whatsappEnabled: Boolean(body.whatsappEnabled),
        whatsappNumber: body.whatsappNumber || null,
        discordEnabled: Boolean(body.discordEnabled),
        discordWebhookUrl: body.discordWebhookUrl || null,
        alertOnNewMatch: true,
        alertOnStatusChange: true,
      },
    });

    return NextResponse.json({ success: true, notificationConfig: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Speichern der Benachrichtigungseinstellungen fehlgeschlagen.' }, { status: 500 });
  }
}
