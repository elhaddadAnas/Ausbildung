"""Django settings for the Azubora project (``config`` = project, ``azubora`` = MVC app).

Configuration is read from environment variables. A ``.env`` file at the
repository root (or in ``backend/``) is loaded automatically for local
development; real environment variables always take precedence.
"""
import os
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent


def _load_dotenv() -> None:
    for candidate in (REPO_ROOT / '.env', BASE_DIR / '.env'):
        if not candidate.is_file():
            continue
        for raw_line in candidate.read_text(encoding='utf-8').splitlines():
            line = raw_line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            key = key.strip().removeprefix('export ').strip()
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in '"\'':
                value = value[1:-1]
            os.environ.setdefault(key, value)


_load_dotenv()


def env(name: str, default: str = '') -> str:
    return (os.environ.get(name) or default).strip()


def env_bool(name: str, default: bool = False) -> bool:
    value = env(name)
    if not value:
        return default
    return value.lower() in {'1', 'true', 'yes', 'on'}


DEBUG = env_bool('DJANGO_DEBUG', False)

JWT_SECRET = env('JWT_SECRET') or ('' if not DEBUG else 'development-only-secret-change-before-production')
SECRET_KEY = env('DJANGO_SECRET_KEY') or JWT_SECRET or 'development-only-django-secret'

APP_URL = (env('APP_URL') or env('NEXT_PUBLIC_APP_URL') or 'http://localhost:8000').rstrip('/')

ALLOWED_HOSTS = [host.strip() for host in env('DJANGO_ALLOWED_HOSTS', '*').split(',') if host.strip()]
CSRF_TRUSTED_ORIGINS = [APP_URL] if APP_URL.startswith('http') else []

INSTALLED_APPS = [
    'azubora',
]

MIDDLEWARE = [
    'azubora.middleware.SecurityHeadersMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'azubora.middleware.SameOriginApiMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'
APPEND_SLASH = False

# V — HTML templates live in azubora/templates/.
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {'context_processors': []},
    }
]

# Neon exposes a pooled URL (application traffic) and a direct URL (migrations).
_database_url = env('NEON_DATABASE_URL') or env('DATABASE_URL')
if _database_url and _database_url.startswith(('postgres://', 'postgresql://')):
    DATABASES = {'default': dj_database_url.parse(_database_url, conn_max_age=60, conn_health_checks=True)}
    _direct_url = env('NEON_DATABASE_URL_UNPOOLED')
    if _direct_url and env_bool('DJANGO_USE_DIRECT_DATABASE_URL'):
        DATABASES['default'] = dj_database_url.parse(_direct_url, conn_max_age=0)
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'dev.sqlite3',
            # The web server, the worker and the bot's parallel look-ups write concurrently:
            # wait for the lock instead of failing, and let readers work during a write.
            'OPTIONS': {
                'timeout': 20,
                'transaction_mode': 'IMMEDIATE',
                'init_command': 'PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;',
            },
        }
    }

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

LANGUAGE_CODE = 'fr-fr'
TIME_ZONE = 'UTC'
USE_I18N = False
USE_TZ = True

# The React UI is compiled to static files (``npm run build`` in frontend/)
# and served by Django from this directory.
FRONTEND_DIST = Path(env('FRONTEND_DIST') or (REPO_ROOT / 'frontend' / 'out'))
STATIC_URL = '/static/'
WHITENOISE_ROOT = FRONTEND_DIST if FRONTEND_DIST.is_dir() else None
WHITENOISE_MAX_AGE = 3600

DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'
SECURE_CROSS_ORIGIN_OPENER_POLICY = 'same-origin'
X_FRAME_OPTIONS = 'DENY'
if not DEBUG and APP_URL.startswith('https://'):
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'azubora-default',
    }
}

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {'plain': {'format': '%(asctime)s %(levelname)s %(name)s: %(message)s'}},
    'handlers': {'console': {'class': 'logging.StreamHandler', 'formatter': 'plain'}},
    'root': {'handlers': ['console'], 'level': 'INFO'},
}

# Application settings -------------------------------------------------------
SMTP_ENCRYPTION_KEY = env('SMTP_ENCRYPTION_KEY')
OPENAI_API_KEY = env('OPENAI_API_KEY')
REDIS_URL = env('REDIS_URL')
CRON_SECRET = env('CRON_SECRET')
TELEGRAM_BOT_TOKEN = env('TELEGRAM_BOT_TOKEN')
ADMIN_EMAIL = env('ADMIN_EMAIL')
ALLOW_PRIVATE_MAIL_HOSTS = env_bool('ALLOW_PRIVATE_MAIL_HOSTS')
UPLOADS_DIR = Path(env('UPLOADS_DIR') or (REPO_ROOT / 'data' / 'uploads'))
