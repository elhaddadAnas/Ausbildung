"""Fixed-window rate limiting backed by Redis, with an in-memory fallback."""
import logging
import threading
import time

from django.conf import settings

logger = logging.getLogger(__name__)

_memory: dict[str, tuple[int, float]] = {}
_memory_lock = threading.Lock()
_redis_client = None
_redis_checked = False

_LUA = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
"""


def redis_client():
    global _redis_client, _redis_checked
    if _redis_checked:
        return _redis_client
    _redis_checked = True
    if settings.REDIS_URL:
        try:
            import redis

            _redis_client = redis.Redis.from_url(
                settings.REDIS_URL,
                socket_connect_timeout=1.5,
                socket_timeout=1.5,
                retry_on_timeout=False,
            )
        except Exception:  # pragma: no cover - invalid URL
            logger.warning('REDIS_URL is invalid; using in-memory rate limits.')
            _redis_client = None
    return _redis_client


def _redis_key(key: str) -> str:
    return f'ausbildung-finder:rate-limit:{key}'


def _check_memory(key: str, limit: int, window_ms: int) -> tuple[bool, int]:
    now = time.time() * 1000
    with _memory_lock:
        count, reset_at = _memory.get(key, (0, 0.0))
        if reset_at <= now:
            _memory[key] = (1, now + window_ms)
            return True, 0
        if count >= limit:
            return False, max(1, int((reset_at - now + 999) // 1000))
        _memory[key] = (count + 1, reset_at)
        return True, 0


def check_rate_limit(key: str, limit: int, window_ms: int) -> tuple[bool, int]:
    """Return ``(allowed, retry_after_seconds)``."""
    client = redis_client()
    if client is not None:
        try:
            count, ttl = client.eval(_LUA, 1, _redis_key(key), str(window_ms))
            count, ttl = int(count), max(0, int(ttl))
            allowed = count <= limit
            return allowed, 0 if allowed else max(1, (ttl + 999) // 1000)
        except Exception:
            # A Redis outage must not take authentication or search offline.
            pass
    return _check_memory(key, limit, window_ms)


def clear_rate_limit(key: str) -> None:
    with _memory_lock:
        _memory.pop(key, None)
    client = redis_client()
    if client is not None:
        try:
            client.delete(_redis_key(key))
        except Exception:
            pass


def redis_connected() -> bool:
    client = redis_client()
    if client is None:
        return False
    try:
        return bool(client.ping())
    except Exception:
        return False
