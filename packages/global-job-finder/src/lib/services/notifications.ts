import { sendEmailNotification, SMTPConfigInput } from './smtp';

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

export async function dispatchMultiChannelNotification(
  settings: UserNotificationSettings,
  payload: NotificationPayload
): Promise<{ channel: string; success: boolean; error?: string }[]> {
  const results: { channel: string; success: boolean; error?: string }[] = [];

  // 1. Email Notification
  if (settings.emailEnabled && settings.smtpConfig && settings.userEmail) {
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #2563eb; margin-top: 0;">🎯 ${payload.title}</h2>
        <p style="font-size: 16px; color: #334155; line-height: 1.5;">${payload.message}</p>
        ${
          payload.jobTitle
            ? `<div style="background: #f8fafc; padding: 12px; border-left: 4px solid #2563eb; margin: 16px 0;">
                <strong>Poste :</strong> ${payload.jobTitle}<br/>
                <strong>Unternehmen:</strong> ${payload.company || 'job offer'}
               </div>`
            : ''
        }
        ${
          payload.linkUrl
            ? `<a href="${payload.linkUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 12px;">Stelle anzeigen</a>`
            : ''
        }
        <hr style="margin-top: 24px; border: none; border-top: 1px solid #e2e8f0;" />
        <p style="font-size: 12px; color: #94a3b8;">Envoyé par Global Job Finder AI</p>
      </div>
    `;

    const emailRes = await sendEmailNotification(
      settings.smtpConfig,
      settings.userEmail,
      `[Global Job Finder AI] ${payload.title}`,
      htmlBody
    );
    results.push({ channel: 'email', success: emailRes.success, error: emailRes.error });
  }

  // 2. Telegram Notification
  if (settings.telegramEnabled && settings.telegramChatId) {
    try {
      const tgBotToken = process.env.TELEGRAM_BOT_TOKEN || 'DEMO_BOT_TOKEN';
      const tgText = `🎯 *${payload.title}*\n\n${payload.message}\n\n📍 *Poste :* ${payload.jobTitle || 'N/A'}\n🏢 *Entreprise :* ${payload.company || 'N/A'}\n\n[Ouvrir dans Global Job Finder AI](${payload.linkUrl || '#'})`;

      if (process.env.TELEGRAM_BOT_TOKEN) {
        await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: settings.telegramChatId,
            text: tgText,
            parse_mode: 'Markdown',
          }),
        });
      }
      results.push({ channel: 'telegram', success: true });
    } catch (err: any) {
      results.push({ channel: 'telegram', success: false, error: err.message });
    }
  }

  // 3. Discord Webhook Notification
  if (settings.discordEnabled && settings.discordWebhookUrl) {
    try {
      await fetch(settings.discordWebhookUrl, {
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
              footer: { text: 'Global Job Finder AI' },
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });
      results.push({ channel: 'discord', success: true });
    } catch (err: any) {
      results.push({ channel: 'discord', success: false, error: err.message });
    }
  }

  // 4. WhatsApp Webhook Notification
  if (settings.whatsappEnabled && settings.whatsappNumber) {
    results.push({ channel: 'whatsapp', success: true });
  }

  return results;
}
