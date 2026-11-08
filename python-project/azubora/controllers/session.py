"""Access control for controllers and the session cookie."""
from functools import wraps
from typing import Callable

from django.conf import settings
from django.http import HttpRequest, HttpResponse

from azubora.models import User
from azubora.services.authentication import TOKEN_COOKIE, TOKEN_MAX_AGE, current_user, sign_jwt
from azubora.views.responses import error


def login_required(message: str = 'Nicht autorisiert.') -> Callable:
    def decorator(view: Callable[..., HttpResponse]) -> Callable[..., HttpResponse]:
        @wraps(view)
        def wrapper(request: HttpRequest, *args, **kwargs) -> HttpResponse:
            user = current_user(request)
            if user is None:
                return error(message, 401)
            return view(request, user, *args, **kwargs)

        return wrapper

    return decorator


def admin_required(message: str = 'Réservé aux administrateurs.') -> Callable:
    def decorator(view: Callable[..., HttpResponse]) -> Callable[..., HttpResponse]:
        @wraps(view)
        def wrapper(request: HttpRequest, *args, **kwargs) -> HttpResponse:
            user = current_user(request)
            if user is None or user.role != 'ADMIN':
                return error(message, 403)
            return view(request, user, *args, **kwargs)

        return wrapper

    return decorator


def secure_cookies() -> bool:
    return not settings.DEBUG or settings.APP_URL.startswith('https://')


def set_token_cookie(response: HttpResponse, user: User) -> None:
    response.set_cookie(
        TOKEN_COOKIE,
        sign_jwt(user),
        max_age=TOKEN_MAX_AGE,
        path='/',
        httponly=True,
        secure=secure_cookies(),
        samesite='Lax',
    )


def clear_token_cookie(response: HttpResponse) -> None:
    response.delete_cookie(TOKEN_COOKIE, path='/', samesite='Lax')
