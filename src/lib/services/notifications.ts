import { decryptString, sendEmailNotification, SMTPConfigInput } from './smtp';

export interface NotificationPayload {
  title: string;
  message: string;
  linkUrl?: string;
  jobTitle?: string;
  company?: string;
}

export interface UserNotificationSettings {
  emailEnabled: boolean;
  userEmail: string;
  smtpConfig?: SMTPConfigInput | null;
  telegramEnabled: boolean;
  telegramChatId?: string | null;
  whatsappEnabled: boolean;
  whatsappNumber?: string | null;
  discordEnabled: boolean;
  discordWebhookUrl?: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function readableSecret(value: string | null | undefined): string {
  if (!value) return '';
  return value.startsWith('v2:') ? decryptString(value) : value;
}

function isAllowedDiscordWebhook(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      ['discord.com', 'canary.discord.com', 'ptb.discord.com', 'discordapp.com']
        .includes(url.hostname.toLowerCase()) &&
      /^\/api\/webhooks\/[^/]+\/[^/]+/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export async function dispatchMultiChannelNotification(
  settings: UserNotificationSettings,
  payload: NotificationPayload
): Promise<{ channel: string; success: boolean; error?: string }[]> {
  const results: { channel: string; success: boolean; error?: string }[] = [];
  const safeTitle = escapeHtml(payload.title);
  const safeMessage = escapeHtml(payload.message);
  const safeJobTitle = escapeHtml(payload.jobTitle || 'N/A');
  const safeCompany = escapeHtml(payload.company || 'N/A');
  const safeLink = payload.linkUrl && /^https?:\/\//i.test(payload.linkUrl)
    ? escapeHtml(payload.linkUrl)
    : '';

  // 1. Email Notification
  if (settings.emailEnabled && settings.smtpConfig && settings.userEmail) {
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #2563eb; margin-top: 0;">🎯 ${safeTitle}</h2>
        <p style="font-size: 16px; color: #334155; line-height: 1.5;">${safeMessage}</p>
        ${
          payload.jobTitle
            ? `<div style="background: #f8fafc; padding: 12px; border-left: 4px solid #2563eb; margin: 16px 0;">
                <strong>Ausbildung:</strong> ${safeJobTitle}<br/>
                <strong>Unternehmen:</strong> ${safeCompany}
               </div>`
            : ''
        }
        ${
          safeLink
            ? `<a href="${safeLink}" style="display: inline-block; background: #2563eb; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 12px;">Stelle anzeigen</a>`
            : ''
        }
        <hr style="margin-top: 24px; border: none; border-top: 1px solid #e2e8f0;" />
        <p style="font-size: 12px; color: #94a3b8;">Gesendet von Azubora • Automatisierte Ausbildungssuche</p>
      </div>
    `;

    const emailRes = await sendEmailNotification(
      settings.smtpConfig,
      settings.userEmail,
      `[Azubora] ${payload.title}`,
      htmlBody
    );
    results.push({ channel: 'email', success: emailRes.success, error: emailRes.error });
  }

  // 2. Telegram Notification
  if (settings.telegramEnabled && settings.telegramChatId) {
    try {
      const tgBotToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
      if (!tgBotToken) throw new Error('TELEGRAM_BOT_TOKEN non configuré.');
      const tgText = `🎯 ${payload.title}\n\n${payload.message}\n\n📍 Ausbildung: ${payload.jobTitle || 'N/A'}\n🏢 Firma: ${payload.company || 'N/A'}${payload.linkUrl ? `\n\n${payload.linkUrl}` : ''}`;
      const response = await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: settings.telegramChatId,
          text: tgText,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
      results.push({ channel: 'telegram', success: true });
    } catch (err: any) {
      results.push({ channel: 'telegram', success: false, error: err.message });
    }
  }

  // 3. Discord Webhook Notification
  if (settings.discordEnabled && settings.discordWebhookUrl) {
    try {
      const webhookUrl = readableSecret(settings.discordWebhookUrl);
      if (!isAllowedDiscordWebhook(webhookUrl)) {
        throw new Error('Webhook Discord invalide.');
      }
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [
            {
              title: `🎯 ${payload.title}`,
              description: payload.message,
              color: 0x2563eb,
              fields: [
                { name: 'Stelle', value: payload.jobTitle || 'N/A', inline: true },
                { name: 'Firma', value: payload.company || 'N/A', inline: true },
              ],
              footer: { text: 'Azubora' },
              timestamp: new Date().toISOString(),
            },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Discord HTTP ${response.status}`);
      results.push({ channel: 'discord', success: true });
    } catch (err: any) {
      results.push({ channel: 'discord', success: false, error: err.message });
    }
  }

  // 4. WhatsApp Webhook Notification
  if (settings.whatsappEnabled && settings.whatsappNumber) {
    results.push({
      channel: 'whatsapp',
      success: false,
      error: 'Aucun fournisseur WhatsApp Business API n’est configuré.',
    });
  }

  return results;
}
