"""Security headers and same-origin protection for the JSON API."""
from urllib.parse import urlsplit

from django.conf import settings
from django.http import HttpRequest, HttpResponse

from azubora.views.responses import error

UNSAFE_METHODS = {'POST', 'PUT', 'PATCH', 'DELETE'}


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        directives = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'" + ('' if not settings.DEBUG else " 'unsafe-eval'"),
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        ]
        if settings.APP_URL.startswith('https://'):
            directives.append('upgrade-insecure-requests')
        self.csp = '; '.join(directives)

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)
        response.setdefault('Content-Security-Policy', self.csp)
        response.setdefault('X-Permitted-Cross-Domain-Policies', 'none')
        response.setdefault('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
        response.setdefault('Cross-Origin-Resource-Policy', 'same-origin')
        return response


class SameOriginApiMiddleware:
    """Reject cross-site state-changing API calls (the session cookie is SameSite=Lax as well)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        if request.method in UNSAFE_METHODS and request.path.startswith('/api/') \
                and not request.path.startswith('/api/cron/'):
            origin = request.headers.get('origin')
            if origin and origin != 'null':
                origin_host = urlsplit(origin).netloc.lower()
                allowed = {request.get_host().lower()}
                allowed.update(urlsplit(item).netloc.lower() for item in settings.CSRF_TRUSTED_ORIGINS)
                if origin_host not in allowed:
                    return error('Origine de requête non autorisée.', 403)
        return self.get_response(request)
