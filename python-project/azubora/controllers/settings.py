"""User settings: SMTP/IMAP account, notifications and the auto-apply bot."""
import re

from django.conf import settings as django_settings
from django.http import HttpRequest
from django.utils import timezone

from azubora.controllers.base import as_bool, as_int, as_number, methods, read_json
from azubora.controllers.session import login_required
from azubora.models import AutoApplyConfig, NotificationConfig, SmtpConfig, User, UserProfile
from azubora.services.ai import openai_configured
from azubora.services.auto_apply import INTERVAL_MINUTES, public_auto_apply_config, run_auto_apply_for_user
from azubora.services.auto_apply_schedule import is_valid_time_zone, next_run_at, parse_schedule_days
from azubora.services.notifications import is_discord_webhook, readable_secret
from azubora.services.ratelimit import check_rate_limit
from azubora.services.smtp import (
    MASKED_PASSWORD,
    decrypt_string,
    encrypt_string,
    normalize_smtp_config,
    test_smtp_connection,
    validate_smtp_config,
)
from azubora.services.smtp_circuit_breaker import stop_auto_sending_for_smtp_limit
from azubora.services.subscriptions import SubscriptionLimitError, assert_auto_apply_allowed
from azubora.views.responses import error, json_response, rate_limited
from azubora.views.serializers import dumps, iso, to_dict

# SMTP ------------------------------------------------------------------------------------------


def public_smtp(smtp: SmtpConfig) -> dict:
    data = to_dict(smtp, exclude=('userId',))
    data['authPass'] = MASKED_PASSWORD
    return data


def inbox_settings(body: dict, provider: str, existing: SmtpConfig | None) -> dict:
    if provider == 'gmail':
        return {'imap_host': 'imap.gmail.com', 'imap_port': 993, 'imap_secure': True}
    if provider == 'outlook':
        return {'imap_host': 'outlook.office365.com', 'imap_port': 993, 'imap_secure': True}
    port = as_int(body['imapPort'] if body.get('imapPort') is not None else (existing.imap_port if existing else 993))
    host = body['imapHost'] if body.get('imapHost') is not None else (existing.imap_host if existing else '')
    secure = body['imapSecure'] if body.get('imapSecure') is not None else (
        existing.imap_secure if existing else True)
    return {
        'imap_host': str(host or '').strip() or None,
        'imap_port': port if port is not None and 1 <= port <= 65535 else 993,
        'imap_secure': bool(secure),
    }


def _smtp_fields(config, encrypted: str, active: bool, imap: dict, imap_active: bool) -> dict:
    return {
        'provider': config.provider,
        'host': config.host,
        'port': config.port,
        'secure': config.secure,
        'auth_user': config.auth_user,
        'auth_pass_encrypted': encrypted,
        'from_email': config.from_email,
        'from_name': config.from_name,
        'active': active,
        'imap_active': imap_active,
        **imap,
    }


@login_required()
def get_smtp(request: HttpRequest, user: User):
    smtp = SmtpConfig.objects.filter(user=user).first()
    return json_response({'smtp': public_smtp(smtp) if smtp else None})


@login_required()
def save_smtp(request: HttpRequest, user: User):
    allowed, retry = check_rate_limit(f'smtp-settings:{user.id}', 20, 60 * 60_000)
    if not allowed:
        return rate_limited('Trop de modifications SMTP. Réessayez plus tard.', retry)
    body = read_json(request)
    existing = SmtpConfig.objects.filter(user=user).first()
    submitted = str(body.get('authPass') or '')
    uses_stored = not submitted or submitted == MASKED_PASSWORD
    password = decrypt_string(existing.auth_pass_encrypted if existing else '') if uses_stored else submitted
    config = normalize_smtp_config(
        provider=body.get('provider') or 'custom', host=body.get('host'), port=body.get('port'),
        secure=as_bool(body.get('secure')), auth_user=body.get('authUser'), auth_pass=password,
        from_email=body.get('fromEmail') or body.get('authUser'), from_name=body.get('fromName') or user.name,
    )
    validation_error = validate_smtp_config(config)
    if validation_error:
        return error(validation_error, 400)
    imap = inbox_settings(body, config.provider, existing)
    imap_active = body.get('imapActive') is not False
    if imap_active and config.provider == 'custom' and not imap['imap_host']:
        return error('Indiquez l’hôte IMAP ou désactivez la réception des réponses.', 400)

    settings_changed = (
        existing is None or not uses_stored
        or (existing.provider, existing.host, existing.port, existing.secure, existing.auth_user, existing.from_email)
        != (config.provider, config.host, config.port, config.secure, config.auth_user, config.from_email)
    )
    inbox_changed = (
        existing is None or not uses_stored or existing.auth_user != config.auth_user
        or (existing.imap_host, existing.imap_port, existing.imap_secure)
        != (imap['imap_host'], imap['imap_port'], imap['imap_secure'])
    )
    encrypted = existing.auth_pass_encrypted if uses_stored and existing else encrypt_string(config.auth_pass)
    fields = _smtp_fields(config, encrypted, body.get('active') is not False, imap, imap_active)
    if existing is None:
        smtp = SmtpConfig.objects.create(user=user, is_tested=False, **fields)
    else:
        smtp = existing
        for name, value in fields.items():
            setattr(smtp, name, value)
        if inbox_changed:
            smtp.last_imap_sync_at = None
        if settings_changed:
            smtp.is_tested = False
            smtp.last_tested_at = None
        smtp.save()

    # Saving an untested mailbox also verifies it, so one click is enough to
    # unlock sending and the auto-apply bot.
    test = None
    if smtp.active and not smtp.is_tested:
        test = test_smtp_connection(config)
        if test['success']:
            smtp.is_tested = True
            smtp.last_tested_at = timezone.now()
            smtp.save(update_fields=['is_tested', 'last_tested_at', 'updated_at'])
        else:
            stop_auto_sending_for_smtp_limit(user.id, {**test, 'error': test['message']})

    if not smtp.active or not smtp.is_tested:
        changes = {'enabled': False, 'next_run_at': None}
        if settings_changed:
            changes['last_result'] = dumps({
                'success': False,
                'skipped': True,
                'error': 'La configuration SMTP a changé. Testez-la de nouveau puis réactivez l’auto-candidature.',
                'completedAt': iso(timezone.now()),
            })
        AutoApplyConfig.objects.filter(user=user).update(**changes)
    return json_response({
        'success': True,
        'smtp': public_smtp(smtp),
        'test': {'success': test['success'], 'message': test['message']} if test else None,
    })


@login_required()
def test_smtp(request: HttpRequest, user: User):
    allowed, retry = check_rate_limit(f'smtp-test:{user.id}', 10, 60 * 60_000)
    if not allowed:
        return rate_limited('Trop de tests SMTP. Réessayez plus tard.', retry, key='message')
    body = read_json(request)
    existing = SmtpConfig.objects.filter(user=user).first()
    submitted = str(body.get('authPass') or '')
    uses_stored = not submitted or submitted == MASKED_PASSWORD
    password = decrypt_string(existing.auth_pass_encrypted if existing else '') if uses_stored else submitted

    def pick(key, attribute, default):
        if body.get(key):
            return body[key]
        return getattr(existing, attribute, None) or default if existing else default

    secure = body['secure'] if body.get('secure') is not None else (existing.secure if existing else False)
    config = normalize_smtp_config(
        provider=pick('provider', 'provider', 'custom'), host=pick('host', 'host', ''),
        port=pick('port', 'port', 587), secure=secure, auth_user=pick('authUser', 'auth_user', ''),
        auth_pass=password, from_email=pick('fromEmail', 'from_email', body.get('authUser')),
        from_name=pick('fromName', 'from_name', user.name),
    )
    result = test_smtp_connection(config)
    stopped = False
    if not result['success']:
        stopped = stop_auto_sending_for_smtp_limit(user.id, {**result, 'error': result['message']})
    imap = inbox_settings(body, config.provider, existing)
    imap_active = body.get('imapActive') is not False
    if imap_active and config.provider == 'custom' and not imap['imap_host']:
        return json_response({'success': False,
                              'message': 'Indiquez l’hôte IMAP ou désactivez la réception des réponses.'}, status=400)

    matches_saved = bool(
        existing
        and (config.provider, config.host, config.port, config.secure, config.auth_user, config.from_email)
        == (existing.provider, existing.host, existing.port, existing.secure, existing.auth_user, existing.from_email)
        and (uses_stored or decrypt_string(existing.auth_pass_encrypted) == config.auth_pass)
    )
    if result['success'] and body.get('saveOnSuccess'):
        encrypted = existing.auth_pass_encrypted if uses_stored and existing else encrypt_string(config.auth_pass)
        fields = _smtp_fields(config, encrypted, body.get('active') is not False, imap, imap_active)
        SmtpConfig.objects.update_or_create(
            user=user, defaults={**fields, 'is_tested': True, 'last_tested_at': timezone.now()})
        matches_saved = True
    elif result['success'] and existing and matches_saved:
        SmtpConfig.objects.filter(user=user).update(is_tested=True, last_tested_at=timezone.now())
    if result['success'] and body.get('saveOnSuccess') and body.get('active') is False:
        AutoApplyConfig.objects.filter(user=user).update(enabled=False, next_run_at=None)
    return json_response({**result, 'autoApplyStopped': stopped,
                          'savedConfigurationTested': result['success'] and matches_saved})


smtp = methods(GET=get_smtp, PUT=save_smtp, POST=test_smtp)


# Notifications -------------------------------------------------------------------------------------

def public_notifications(config: NotificationConfig) -> dict:
    data = to_dict(config)
    data['discordWebhookUrl'] = MASKED_PASSWORD if config.discord_webhook_url else None
    return data


@login_required()
def get_notifications(request: HttpRequest, user: User):
    config = NotificationConfig.objects.filter(user=user).first()
    safe = public_notifications(config) if config else None
    return json_response({'config': safe, 'notificationConfig': safe})


@login_required()
def save_notifications(request: HttpRequest, user: User):
    allowed, retry = check_rate_limit(f'notification-settings:{user.id}', 30, 60 * 60_000)
    if not allowed:
        return rate_limited('Trop de modifications. Réessayez plus tard.', retry)
    body = read_json(request)
    existing = NotificationConfig.objects.filter(user=user).first()
    telegram_enabled = as_bool(body.get('telegramEnabled'))
    chat_id = str(body.get('telegramChatId') or '').strip()
    discord_enabled = as_bool(body.get('discordEnabled'))
    submitted_webhook = str(body.get('discordWebhookUrl') or '').strip()
    keeps_stored = not submitted_webhook or submitted_webhook == MASKED_PASSWORD
    webhook = readable_secret(existing.discord_webhook_url if existing else None) if keeps_stored \
        else submitted_webhook

    if telegram_enabled:
        if not django_settings.TELEGRAM_BOT_TOKEN:
            return error('TELEGRAM_BOT_TOKEN doit être configuré sur le serveur.', 400)
        if not re.match(r'^-?\d{5,20}$', chat_id):
            return error('L’identifiant de chat Telegram est invalide.', 400)
    if discord_enabled and not is_discord_webhook(webhook):
        return error('L’URL du webhook Discord est invalide.', 400)
    if body.get('whatsappEnabled'):
        return error('WhatsApp nécessite un fournisseur Business API et n’est pas activé sur ce serveur.', 400)

    if webhook:
        stored_webhook = existing.discord_webhook_url if keeps_stored and existing and existing.discord_webhook_url \
            else encrypt_string(webhook)
    else:
        stored_webhook = None
    fields = {
        'telegram_enabled': telegram_enabled,
        'telegram_chat_id': chat_id if telegram_enabled else None,
        'whatsapp_enabled': False,
        'whatsapp_number': None,
        'discord_enabled': discord_enabled,
        'discord_webhook_url': stored_webhook if discord_enabled else None,
    }
    if existing is None:
        config = NotificationConfig.objects.create(
            user=user, email_enabled=body.get('emailEnabled') is not False,
            alert_on_new_match=body.get('alertOnNewMatch') is not False,
            alert_on_status_change=body.get('alertOnStatusChange') is not False, **fields)
    else:
        config = existing
        config.email_enabled = as_bool(body.get('emailEnabled'))
        if 'alertOnNewMatch' in body:
            config.alert_on_new_match = as_bool(body['alertOnNewMatch'])
        if 'alertOnStatusChange' in body:
            config.alert_on_status_change = as_bool(body['alertOnStatusChange'])
        for name, value in fields.items():
            setattr(config, name, value)
        config.save()
    safe = public_notifications(config)
    return json_response({'success': True, 'config': safe, 'notificationConfig': safe})


notifications = methods(GET=get_notifications, PUT=save_notifications)


# Auto-apply ------------------------------------------------------------------------------------------

def normalize_list(value, max_items: int = 20) -> list[str]:
    items = value if isinstance(value, list) else str(value or '').split(',')
    cleaned = [str(item).strip() for item in items]
    return list(dict.fromkeys([item for item in cleaned if item][:max_items]))


def _sending_prerequisites(user: User, run: bool) -> str | None:
    smtp = SmtpConfig.objects.filter(user=user).first()
    profile = UserProfile.objects.defer('cv_file_data').filter(user=user).first()
    if smtp is None or not smtp.active or not smtp.is_tested:
        return 'La connexion SMTP doit être active et testée.' if run else \
            'Enregistrez puis testez une connexion SMTP active avant d’activer l’auto-candidature.'
    if not decrypt_string(smtp.auth_pass_encrypted):
        return ('Le mot de passe SMTP enregistré ne peut pas être déchiffré. Enregistrez et testez de nouveau la '
                'connexion SMTP.')
    if profile is None or not profile.cv_file_url:
        return 'Ajoutez votre CV au profil avant de lancer l’auto-candidature.' if run else \
            'Ajoutez votre CV au profil avant d’activer l’auto-candidature.'
    return None


@login_required()
def get_auto_apply(request: HttpRequest, user: User):
    config, _ = AutoApplyConfig.objects.get_or_create(
        user=user, defaults={'interval_minutes': INTERVAL_MINUTES, 'keywords': dumps(['Ausbildung'])})
    return json_response({'config': public_auto_apply_config(config)})


@login_required()
def save_auto_apply(request: HttpRequest, user: User):
    body = read_json(request)
    enabled = as_bool(body.get('enabled'))
    if enabled:
        if not openai_configured():
            return error('Configurez OPENAI_API_KEY avant d’activer l’auto-candidature.', 503)
        try:
            assert_auto_apply_allowed(user.id)
        except SubscriptionLimitError as exc:
            return error(str(exc), 402, upgradeRequired=True)
        problem = _sending_prerequisites(user, run=False)
        if problem:
            return error(problem, 400)

    keywords = normalize_list(body.get('keywords'))
    radius = as_number(body.get('radiusKm'))
    schedule_days = parse_schedule_days(body.get('scheduleDays')) if isinstance(body.get('scheduleDays'), list) else []
    start = as_int(body.get('scheduleStartMinute'))
    end = as_int(body.get('scheduleEndMinute'))
    zone = str(body.get('scheduleTimezone') or '').strip()
    if not schedule_days:
        return error('Sélectionnez au moins un jour.', 400)
    if start is None or end is None or start < 0 or end > 1439 or start >= end:
        return error('L’heure de fin doit être postérieure à l’heure de début.', 400)
    if not is_valid_time_zone(zone):
        return error('Fuseau horaire invalide.', 400)

    current = AutoApplyConfig.objects.filter(user=user).first()
    just_enabled = enabled and not (current and current.enabled)
    schedule = {'scheduleDays': schedule_days, 'scheduleStartMinute': start, 'scheduleEndMinute': end,
                'scheduleTimezone': zone}
    fields = {
        'enabled': enabled,
        'interval_minutes': INTERVAL_MINUTES,
        'keywords': dumps(keywords or ['Ausbildung']),
        'cities': dumps(normalize_list(body.get('cities'))),
        'federal_states': dumps(normalize_list(body.get('federalStates'))),
        'categories': dumps(normalize_list(body.get('categories'))),
        'radius_km': int(min(200, max(0, radius or 25))),
        'remote_only': as_bool(body.get('remoteOnly')),
        'min_match_score': 0,  # no score threshold: apply to every offer with an address
        'max_applications': 1,
        'schedule_days': dumps(schedule_days),
        'schedule_start_minute': start,
        'schedule_end_minute': end,
        'schedule_timezone': zone,
        'next_run_at': next_run_at(schedule, timezone.now(), INTERVAL_MINUTES) if enabled else None,
    }
    if current is None:
        config = AutoApplyConfig.objects.create(user=user, **fields)
    else:
        config = current
        for name, value in fields.items():
            setattr(config, name, value)
        if just_enabled:
            config.last_result = None
        config.save()
    return json_response({'success': True, 'config': public_auto_apply_config(config)})


@login_required()
def run_auto_apply_now(request: HttpRequest, user: User):
    if not openai_configured():
        return error('Configurez OPENAI_API_KEY avant de lancer l’auto-candidature.', 503)
    try:
        assert_auto_apply_allowed(user.id)
    except SubscriptionLimitError as exc:
        return error(str(exc), 402, upgradeRequired=True)
    allowed, retry = check_rate_limit(f'manual-auto-apply:{user.id}', 5, 15 * 60_000)
    if not allowed:
        return rate_limited('Trop d’exécutions manuelles. Réessayez plus tard.', retry)
    problem = _sending_prerequisites(user, run=True)
    if problem:
        return error(problem, 400)
    result = run_auto_apply_for_user(user.id, force=True)
    latest = AutoApplyConfig.objects.filter(user=user).values('last_run_at', 'next_run_at').first() or {}
    return json_response({**result, 'lastRunAt': latest.get('last_run_at'), 'nextRunAt': latest.get('next_run_at')},
                         status=200 if result.get('success') else 422)


auto_apply = methods(GET=get_auto_apply, PUT=save_auto_apply, POST=run_auto_apply_now)
