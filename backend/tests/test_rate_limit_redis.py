"""Redis-backed rate limiting and fallback behavior."""

from backend.app import create_app
from backend.app.config import TestingConfig


class _RedisRateLimitConfig(TestingConfig):
    RATE_LIMIT_ENABLED = True
    REDIS_URL = "redis://127.0.0.1:6399/0"
    RATE_LIMIT_STORAGE_URI = REDIS_URL
    RATE_LIMITS = {
        "auth.login": {"limit": 2, "window_seconds": 60},
    }


class _MemoryFallbackConfig(TestingConfig):
    RATE_LIMIT_ENABLED = True
    REDIS_URL = ""
    RATE_LIMIT_STORAGE_URI = ""
    RATE_LIMITS = {
        "auth.login": {"limit": 2, "window_seconds": 60},
    }


def test_redis_unavailable_falls_back_to_memory(monkeypatch):
    app = create_app(_RedisRateLimitConfig)
    client = app.test_client()
    warnings = []

    from backend.app.middleware import rate_limit as rate_limit_module

    monkeypatch.setattr(rate_limit_module.logger, "warning", lambda message, *args: warnings.append(message % args))

    for _ in range(2):
        response = client.post(
            "/api/auth/login",
            json={"email": "missing@example.com", "password": "wrong"},
            environ_base={"REMOTE_ADDR": "203.0.113.10"},
        )
        assert response.status_code == 401

    blocked = client.post(
        "/api/auth/login",
        json={"email": "missing@example.com", "password": "wrong"},
        environ_base={"REMOTE_ADDR": "203.0.113.10"},
    )

    assert blocked.status_code == 429
    assert blocked.headers["Retry-After"] == "59"
    assert any("退回进程内模式" in warning for warning in warnings)


def test_memory_fallback_blocks_repeated_requests():
    app = create_app(_MemoryFallbackConfig)
    client = app.test_client()

    for _ in range(2):
        response = client.post(
            "/api/auth/login",
            json={"email": "missing@example.com", "password": "wrong"},
            environ_base={"REMOTE_ADDR": "198.51.100.10"},
        )
        assert response.status_code == 401

    blocked = client.post(
        "/api/auth/login",
        json={"email": "missing@example.com", "password": "wrong"},
        environ_base={"REMOTE_ADDR": "198.51.100.10"},
    )

    assert blocked.status_code == 429
    assert blocked.headers["Retry-After"] == "59"


def test_clients_do_not_share_rate_limit_bucket():
    app = create_app(_MemoryFallbackConfig)
    client = app.test_client()

    for _ in range(2):
        response = client.post(
            "/api/auth/login",
            json={"email": "missing@example.com", "password": "wrong"},
            environ_base={"REMOTE_ADDR": "192.0.2.10"},
        )
        assert response.status_code == 401

    second_client = client.post(
        "/api/auth/login",
        json={"email": "missing@example.com", "password": "wrong"},
        environ_base={"REMOTE_ADDR": "192.0.2.20"},
    )

    assert second_client.status_code == 401
