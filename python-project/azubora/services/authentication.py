"""Authentication: bcrypt password hashes, HS256 JWT tokens and the current user.

Tokens use the same issuer, audience, claims and secret as the original
Next.js implementation, so existing sessions and password hashes stay valid.
"""
import datetime as dt

import bcrypt
import jwt
from django.conf import settings
from django.http import HttpRequest

from azubora.models import User

JWT_ISSUER = 'ausbildung-finder-ai'

JWT_AUDIENCE = 'ausbildung-finder-web'

TOKEN_COOKIE = 'token'

TOKEN_MAX_AGE = 7 * 24 * 60 * 60

INSECURE_SECRETS = {
    'ausbildung_finder_ai_jwt_secret_key_2026_super_secure',
    'your_jwt_secret_key',
    'generate-a-random-secret-with-at-least-32-characters',
    'generate-a-different-random-secret-with-at-least-32-characters',
    'change-this-to-a-long-random-production-secret',
}


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(rounds=12)).decode('ascii')


def check_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('ascii'))
    except (ValueError, TypeError):
        return False


def sign_jwt(user: User) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    payload = {
        'userId': user.id,
        'email': user.email,
        'role': user.role,
        'name': user.name,
        'iss': JWT_ISSUER,
        'aud': JWT_AUDIENCE,
        'iat': int(now.timestamp()),
        'exp': int((now + dt.timedelta(seconds=TOKEN_MAX_AGE)).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm='HS256')


def verify_jwt(token: str) -> dict | None:
    if not settings.JWT_SECRET:
        return None
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=['HS256'],
            issuer=JWT_ISSUER,
            audience=JWT_AUDIENCE,
        )
    except jwt.PyJWTError:
        return None


def request_token(request: HttpRequest) -> str | None:
    header = request.headers.get('authorization', '')
    if header.startswith('Bearer '):
        return header[7:]
    return request.COOKIES.get(TOKEN_COOKIE)


def current_user(request: HttpRequest) -> User | None:
    """The authenticated user with profile, SMTP and notification settings loaded."""
    if hasattr(request, '_azubora_user'):
        return request._azubora_user
    user = None
    token = request_token(request)
    payload = verify_jwt(token) if token else None
    if payload and payload.get('userId'):
        user = (
            User.objects.select_related('profile', 'smtp_config', 'notification_config')
            .filter(id=payload['userId'])
            .first()
        )
        profile = getattr(user, 'profile', None) if user else None
        if profile is not None:
            # Load the CV bytes only where they are needed (application sending).
            from azubora.models import UserProfile

            user.profile = (
                UserProfile.objects.defer('cv_file_data')
                .prefetch_related('educations', 'experiences', 'certificates', 'skills')
                .get(pk=profile.pk)
            )
    request._azubora_user = user
    return user


def user_profile(user: User):
    try:
        return user.profile
    except User.profile.RelatedObjectDoesNotExist:
        return None


def user_smtp(user: User):
    try:
        return user.smtp_config
    except User.smtp_config.RelatedObjectDoesNotExist:
        return None


def user_notifications(user: User):
    try:
        return user.notification_config
    except User.notification_config.RelatedObjectDoesNotExist:
        return None
