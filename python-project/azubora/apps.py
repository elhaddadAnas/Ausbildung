import os
import sys

from django.apps import AppConfig
from django.core.exceptions import ImproperlyConfigured

PLACEHOLDER_SECRETS = {
    'generate-a-random-secret-with-at-least-32-characters',
    'generate-a-different-random-secret-with-at-least-32-characters',
    'change-this-to-a-long-random-production-secret',
    'ausbildung_finder_ai_jwt_secret_key_2026_super_secure',
    'your_jwt_secret_key',
}


def validate_production_environment() -> None:
    from django.conf import settings

    if settings.DEBUG or os.environ.get('AZUBORA_SKIP_ENV_CHECK') == '1':
        return
    errors = []
    if settings.DATABASES['default']['ENGINE'] != 'django.db.backends.postgresql':
        errors.append('NEON_DATABASE_URL (or DATABASE_URL) must be a PostgreSQL connection URL.')
    jwt_secret = settings.JWT_SECRET
    if len(jwt_secret) < 32 or jwt_secret in PLACEHOLDER_SECRETS:
        errors.append('JWT_SECRET must be a random value of at least 32 characters.')
    smtp_key = settings.SMTP_ENCRYPTION_KEY
    if len(smtp_key) < 32 or smtp_key in PLACEHOLDER_SECRETS or smtp_key == jwt_secret:
        errors.append('SMTP_ENCRYPTION_KEY must be a distinct random value of at least 32 characters.')
    if errors:
        raise ImproperlyConfigured('Invalid production environment:\n- ' + '\n- '.join(errors))


class AzuboraConfig(AppConfig):
    name = 'azubora'
    verbose_name = 'Azubora'
    default_auto_field = 'django.db.models.BigAutoField'

    def ready(self):
        # Build-time commands must work without production secrets.
        if not any(command in sys.argv for command in ('collectstatic', 'makemigrations', 'check', 'test')):
            validate_production_environment()
