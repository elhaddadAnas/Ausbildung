"""Sign-up, sign-in, sign-out and the current account."""
import re

from django.db import IntegrityError, transaction
from django.http import HttpRequest

from azubora.controllers.base import client_ip, read_json, text
from azubora.controllers.session import clear_token_cookie, login_required, set_token_cookie
from azubora.models import NotificationConfig, User, UserProfile
from azubora.services.authentication import (
    check_password,
    hash_password,
    user_notifications,
    user_profile,
    user_smtp,
)
from azubora.services.ratelimit import check_rate_limit, clear_rate_limit
from azubora.services.subscriptions import get_subscription_snapshot
from azubora.services.transactional_email import send_welcome_email
from azubora.views.responses import error, json_response, rate_limited
from azubora.views.serializers import profile_dict, to_dict

_EMAIL = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')


def _public_user(user: User) -> dict:
    return {'id': user.id, 'name': user.name, 'email': user.email, 'role': user.role}


def login(request: HttpRequest):
    body = read_json(request)
    email = text(body.get('email')).lower() if isinstance(body.get('email'), str) else ''
    password = body.get('password') if isinstance(body.get('password'), str) else ''
    key = f'login:{client_ip(request)}:{email}'
    allowed, retry = check_rate_limit(key, 5, 15 * 60_000)
    if not allowed:
        return rate_limited('Trop de tentatives. Réessayez plus tard.', retry)
    if not _EMAIL.match(email) or not password:
        return error('Saisissez une adresse e-mail valide et votre mot de passe.', 400)
    user = User.objects.filter(email=email).first()
    if user is None or not user.password_hash or not check_password(password, user.password_hash):
        return error('Adresse e-mail ou mot de passe incorrect.', 401)
    clear_rate_limit(key)
    response = json_response({'success': True, 'user': _public_user(user)})
    set_token_cookie(response, user)
    return response


def logout(request: HttpRequest):
    response = json_response({'success': True, 'message': 'Erfolgreich abgemeldet.'})
    clear_token_cookie(response)
    return response


def register(request: HttpRequest):
    allowed, retry = check_rate_limit(f'register:{client_ip(request)}', 5, 60 * 60_000)
    if not allowed:
        return rate_limited('Trop de créations de compte. Réessayez plus tard.', retry)
    body = read_json(request)
    name = text(body.get('name')) if isinstance(body.get('name'), str) else ''
    email = text(body.get('email')).lower() if isinstance(body.get('email'), str) else ''
    password = body.get('password') if isinstance(body.get('password'), str) else ''
    if not 2 <= len(name) <= 100:
        return error('Le nom doit contenir entre 2 et 100 caractères.', 400)
    if not _EMAIL.match(email) or len(email) > 254:
        return error('Adresse e-mail invalide.', 400)
    if not 10 <= len(password) <= 128:
        return error('Le mot de passe doit contenir entre 10 et 128 caractères.', 400)
    if User.objects.filter(email=email).exists():
        return error('Cette adresse e-mail est déjà enregistrée.', 409)
    try:
        with transaction.atomic():
            user = User.objects.create(email=email, name=name, password_hash=hash_password(password), role='USER')
            UserProfile.objects.create(user=user, auto_search_enabled=True, auto_search_interval_mins=30)
            NotificationConfig.objects.create(user=user, email_enabled=True, alert_on_new_match=True)
    except IntegrityError:
        return error('Cette adresse e-mail est déjà enregistrée.', 409)
    welcome = send_welcome_email(user.email, user.name)
    response = json_response({
        'success': True,
        'user': _public_user(user),
        'emailWarning': None if welcome['success'] else welcome.get('error'),
    }, status=201)
    set_token_cookie(response, user)
    return response


@login_required('Nicht authentifiziert.')
def me(request: HttpRequest, user: User):
    smtp = user_smtp(user)
    notifications = user_notifications(user)
    return json_response({'user': {
        'id': user.id,
        'name': user.name,
        'email': user.email,
        'role': user.role,
        'avatarUrl': user.avatar_url,
        'profile': profile_dict(user_profile(user)),
        'smtpConfigured': smtp is not None,
        'smtpActive': bool(smtp and smtp.active),
        'smtpTested': bool(smtp and smtp.is_tested),
        'notificationConfig': to_dict(notifications),
        'subscription': get_subscription_snapshot(user.id),
    }})
