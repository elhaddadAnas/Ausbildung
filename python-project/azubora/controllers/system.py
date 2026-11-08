"""Operational endpoints: health check and cron trigger."""

from django.conf import settings
from django.db import connection
from django.http import HttpRequest
from django.utils import timezone

from azubora.controllers.base import methods
from azubora.services.ai import openai_configured
from azubora.services.auto_apply import run_due_auto_apply_jobs
from azubora.views.responses import error, json_response


def health(request: HttpRequest):
    headers = {'Cache-Control': 'no-store'}
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
    except Exception:  # noqa: BLE001
        return json_response({'status': 'unavailable', 'database': 'error', 'timestamp': timezone.now()},
                             status=503, headers=headers)
    return json_response({
        'status': 'ok',
        'database': 'ok',
        'authenticationConfigured': bool(settings.JWT_SECRET),
        'smtpEncryptionConfigured': bool(settings.SMTP_ENCRYPTION_KEY),
        'cronConfigured': bool(settings.CRON_SECRET),
        'openaiConfigured': openai_configured(),
        'redisConfigured': bool(settings.REDIS_URL),
        'timestamp': timezone.now(),
    }, headers=headers)


def cron_auto_apply(request: HttpRequest):
    if not settings.CRON_SECRET or request.headers.get('authorization') != f'Bearer {settings.CRON_SECRET}':
        return error('Unauthorized', 401)
    try:
        return json_response({'success': True, **run_due_auto_apply_jobs()})
    except Exception:  # noqa: BLE001
        return json_response({'success': False, 'error': 'Auto-apply scheduler failed.'}, status=500)


health_view = methods(GET=health)
cron_view = methods(GET=cron_auto_apply)
