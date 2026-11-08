"""HTTP responses: JSON documents and errors."""
from typing import Any

from django.http import HttpResponse

from azubora.views.serializers import dumps


def json_response(data: Any, status: int = 200, headers: dict[str, str] | None = None) -> HttpResponse:
    response = HttpResponse(dumps(data), status=status, content_type='application/json')
    for key, value in (headers or {}).items():
        response[key] = value
    return response


def error(message: str, status: int, **extra: Any) -> HttpResponse:
    return json_response({'error': message, **extra}, status=status)


def rate_limited(message: str, retry_after_seconds: int, key: str = 'error') -> HttpResponse:
    payload: dict[str, Any] = {key: message}
    if key == 'message':
        payload['success'] = False
    return json_response(payload, status=429, headers={'Retry-After': str(retry_after_seconds)})
