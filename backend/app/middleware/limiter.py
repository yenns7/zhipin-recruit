"""Shared rate limiter bootstrap.

Production prefers Redis-backed counters so multiple gunicorn workers share
the same budget. When Redis is unavailable we intentionally fall back to an
in-process strategy in `rate_limit.py` to keep local development usable.
"""

from __future__ import annotations

import logging

from flask import request

try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address
except Exception:  # noqa: BLE001 - dependency may be absent before install
    Limiter = None
    get_remote_address = None


logger = logging.getLogger(__name__)
limiter = None
_fallback_reason = "flask-limiter not installed"


def _client_identity() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    if get_remote_address is not None:
        return get_remote_address() or "unknown"
    return request.remote_addr or "unknown"


def init_limiter(app) -> None:
    """Initialize the shared limiter instance if Redis-backed storage is usable."""
    global limiter, _fallback_reason

    limiter = None

    if Limiter is None:
        _fallback_reason = "flask-limiter not installed"
        logger.warning("flask-limiter 不可用，限流退回进程内模式")
        return

    storage_uri = (app.config.get("RATE_LIMIT_STORAGE_URI") or app.config.get("REDIS_URL") or "").strip()
    if not storage_uri:
        _fallback_reason = "RATE_LIMIT_STORAGE_URI/REDIS_URL not configured"
        logger.info("未配置 Redis 限流存储，限流使用进程内 fallback")
        return

    try:
        limiter = Limiter(
            key_func=_client_identity,
            storage_uri=storage_uri,
            strategy="fixed-window",
            default_limits=[],
            headers_enabled=True,
        )
        limiter.init_app(app)
        _fallback_reason = ""
        logger.info("Redis-backed 限流已启用: %s", storage_uri)
    except Exception as exc:  # noqa: BLE001 - startup should continue with fallback
        limiter = None
        _fallback_reason = str(exc)
        logger.warning("Redis 限流初始化失败，退回进程内模式: %s", exc, exc_info=True)


def limiter_available() -> bool:
    return limiter is not None


def fallback_reason() -> str:
    return _fallback_reason
