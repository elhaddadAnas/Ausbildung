"""Multi-channel alerts (e-mail, Telegram, Discord)."""
import html
import re
from urllib.parse import urlsplit

import requests
from django.conf import settings
from django.utils import timezone

from azubora.services.smtp import SMTPConfig, decrypt_string, send_email

DISCORD_HOSTS = {'discord.com', 'canary.discord.com', 'ptb.discord.com', 'discordapp.com'}


def readable_secret(value: str | None) -> str:
    if not value:
        return ''
    return decrypt_string(value) if value.startswith('v2:') else value


def is_discord_webhook(value: str) -> bool:
    try:
        url = urlsplit(value)
    except ValueError:
        return False
    return (url.scheme == 'https' and (url.hostname or '').lower() in DISCORD_HOSTS
            and bool(re.match(r'^/api/webhooks/[^/]+/[^/]+', url.path)))


def dispatch_notification(*, email_enabled: bool, user_email: str, smtp: SMTPConfig | None,
                          telegram_enabled: bool, telegram_chat_id: str | None, discord_enabled: bool,
                          discord_webhook_url: str | None, title: str, message: str, link_url: str = '',
                          job_title: str = '', company: str = '') -> list[dict]:
    results: list[dict] = []
    safe_link = html.escape(link_url) if re.match(r'^https?://', link_url or '', re.IGNORECASE) else ''

    if email_enabled and smtp and user_email:
        job_block = (
            '<div style="background: #f8fafc; padding: 12px; border-left: 4px solid #2563eb; margin: 16px 0;">'
            f'<strong>Ausbildung:</strong> {html.escape(job_title or "N/A")}<br/>'
            f'<strong>Unternehmen:</strong> {html.escape(company or "N/A")}</div>'
        ) if job_title else ''
        button = (
            f'<a href="{safe_link}" style="display: inline-block; background: #2563eb; color: #fff; padding: '
            '10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 12px;">'
            'Stelle anzeigen</a>'
        ) if safe_link else ''
        body = (
            '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; '
            'border: 1px solid #e2e8f0; border-radius: 8px;">'
            f'<h2 style="color: #2563eb; margin-top: 0;">🎯 {html.escape(title)}</h2>'
            f'<p style="font-size: 16px; color: #334155; line-height: 1.5;">{html.escape(message)}</p>'
            f'{job_block}{button}'
            '<hr style="margin-top: 24px; border: none; border-top: 1px solid #e2e8f0;" />'
            '<p style="font-size: 12px; color: #94a3b8;">Gesendet von Azubora • Automatisierte Ausbildungssuche</p>'
            '</div>'
        )
        sent = send_email(smtp, user_email, f'[Azubora] {title}', body)
        results.append({'channel': 'email', 'success': sent['success'], 'error': sent.get('error')})

    if telegram_enabled and telegram_chat_id:
        try:
            if not settings.TELEGRAM_BOT_TOKEN:
                raise RuntimeError('TELEGRAM_BOT_TOKEN non configuré.')
            text = (f'🎯 {title}\n\n{message}\n\n📍 Ausbildung: {job_title or "N/A"}\n🏢 Firma: {company or "N/A"}'
                    + (f'\n\n{link_url}' if link_url else ''))
            response = requests.post(f'https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage',
                                     json={'chat_id': telegram_chat_id, 'text': text}, timeout=10)
            if not response.ok:
                raise RuntimeError(f'Telegram HTTP {response.status_code}')
            results.append({'channel': 'telegram', 'success': True})
        except Exception as exc:  # noqa: BLE001
            results.append({'channel': 'telegram', 'success': False, 'error': str(exc)})

    if discord_enabled and discord_webhook_url:
        try:
            webhook = readable_secret(discord_webhook_url)
            if not is_discord_webhook(webhook):
                raise RuntimeError('Webhook Discord invalide.')
            response = requests.post(webhook, json={'embeds': [{
                'title': f'🎯 {title}',
                'description': message,
                'color': 0x2563EB,
                'fields': [
                    {'name': 'Stelle', 'value': job_title or 'N/A', 'inline': True},
                    {'name': 'Firma', 'value': company or 'N/A', 'inline': True},
                ],
                'footer': {'text': 'Azubora'},
                'timestamp': timezone.now().isoformat(),
            }]}, timeout=10)
            if not response.ok:
                raise RuntimeError(f'Discord HTTP {response.status_code}')
            results.append({'channel': 'discord', 'success': True})
        except Exception as exc:  # noqa: BLE001
            results.append({'channel': 'discord', 'success': False, 'error': str(exc)})
    return results
