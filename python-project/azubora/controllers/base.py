"""Controller helpers: method dispatch and request parsing."""
import json
from typing import Any, Callable

from django.http import HttpRequest, HttpResponse
from django.views.decorators.csrf import csrf_exempt

from azubora.views.responses import error


class BadJSON(Exception):
    pass


def read_json(request: HttpRequest, *, strict: bool = False) -> dict:
    """Return the JSON object body. Invalid JSON gives ``{}`` unless ``strict``."""
    try:
        data = json.loads(request.body or b'{}')
    except (ValueError, UnicodeDecodeError):
        if strict:
            raise BadJSON()
        return {}
    return data if isinstance(data, dict) else {}


def client_ip(request: HttpRequest) -> str:
    forwarded = request.headers.get('x-forwarded-for', '').split(',')[0].strip()
    return forwarded or request.headers.get('x-real-ip', '').strip() or 'unknown'


def methods(**handlers: Callable[..., HttpResponse]) -> Callable[..., HttpResponse]:
    """Build one view that dispatches to ``GET=…``, ``POST=…`` handlers."""
    allowed = {name.upper(): handler for name, handler in handlers.items()}

    @csrf_exempt
    def view(request: HttpRequest, *args, **kwargs) -> HttpResponse:
        handler = allowed.get(request.method or '')
        if handler is None:
            response = error('Méthode non autorisée.', 405)
            response['Allow'] = ', '.join(sorted(allowed))
            return response
        try:
            return handler(request, *args, **kwargs)
        except BadJSON:
            return error('Corps de requête JSON invalide.', 400)

    return view


def text(value: Any, max_length: int | None = None) -> str:
    """``String(value ?? '').trim()`` with an optional length cap."""
    normalized = '' if value is None else str(value).strip()
    return normalized[:max_length] if max_length is not None else normalized


def optional_text(value: Any, max_length: int) -> str | None:
    normalized = text(value)
    return normalized[:max_length] if normalized else None


def as_bool(value: Any) -> bool:
    """JavaScript ``Boolean(value)`` semantics for JSON input."""
    return bool(value) and value not in ('', 0)


def as_number(value: Any) -> float | None:
    """JavaScript ``Number(value)`` for JSON input; ``None`` stands for NaN."""
    if isinstance(value, bool):
        return float(value)
    if value is None:
        return None
    try:
        number = float(str(value).strip() or 0)
    except ValueError:
        return None
    if number != number or number in (float('inf'), float('-inf')):
        return None
    return number


def as_int(value: Any) -> int | None:
    """``Number(value)`` restricted to integers (``Number.isInteger``)."""
    number = as_number(value)
    return int(number) if number is not None and number.is_integer() else None
