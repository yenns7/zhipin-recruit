"""试点上线安全硬化（C1 密钥强制 / C2 CORS / C3 注册关闭）回归测试。"""
from contextlib import contextmanager

import pytest

from app import create_app, _enforce_production_security, db
from app.config import Config, TestingConfig, _normalize_database_url


class _ProdLike(Config):
    """模拟生产：关闭 debug、关闭 testing。"""
    TESTING = False
    FLASK_DEBUG = False
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    CELERY_TASK_ALWAYS_EAGER = True


def _mk(**over):
    cfg = type("C", (_ProdLike,), over)
    app = type("A", (), {"config": {k: getattr(cfg, k) for k in dir(cfg) if k.isupper()}})()
    return app


@contextmanager
def _managed_app(config):
    app = create_app(config)
    try:
        yield app
    finally:
        with app.app_context():
            db.session.remove()
            db.drop_all()
            db.engine.dispose()


def test_prod_rejects_default_secret():
    app = _mk(JWT_SECRET="dev-secret-change-in-prod", CORS_ORIGINS=["https://x.com"])
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        _enforce_production_security(app)


def test_prod_rejects_short_secret():
    app = _mk(JWT_SECRET="abc123", CORS_ORIGINS=["https://x.com"])
    with pytest.raises(RuntimeError, match="长度"):
        _enforce_production_security(app)


def test_prod_requires_cors_whitelist():
    app = _mk(JWT_SECRET="x" * 40, CORS_ORIGINS=[])
    with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
        _enforce_production_security(app)


def test_prod_requires_ai_compliance_acknowledgement():
    app = _mk(
        JWT_SECRET="x" * 40,
        CORS_ORIGINS=["https://x.com"],
        AI_RECRUITMENT_COMPLIANCE_ACK=False,
        CANDIDATE_PRIVACY_NOTICE_URL="https://x.com/privacy",
        AI_HUMAN_REVIEW_REQUIRED=True,
    )
    with pytest.raises(RuntimeError, match="AI_RECRUITMENT_COMPLIANCE_ACK"):
        _enforce_production_security(app)


def test_prod_requires_candidate_privacy_notice_url():
    app = _mk(
        JWT_SECRET="x" * 40,
        CORS_ORIGINS=["https://x.com"],
        AI_RECRUITMENT_COMPLIANCE_ACK=True,
        CANDIDATE_PRIVACY_NOTICE_URL="",
        AI_HUMAN_REVIEW_REQUIRED=True,
    )
    with pytest.raises(RuntimeError, match="CANDIDATE_PRIVACY_NOTICE_URL"):
        _enforce_production_security(app)


def test_prod_requires_ai_human_review():
    app = _mk(
        JWT_SECRET="x" * 40,
        CORS_ORIGINS=["https://x.com"],
        AI_RECRUITMENT_COMPLIANCE_ACK=True,
        CANDIDATE_PRIVACY_NOTICE_URL="https://x.com/privacy",
        AI_HUMAN_REVIEW_REQUIRED=False,
    )
    with pytest.raises(RuntimeError, match="AI_HUMAN_REVIEW_REQUIRED"):
        _enforce_production_security(app)


def test_prod_passes_with_strong_config():
    app = _mk(
        JWT_SECRET="x" * 40,
        CORS_ORIGINS=["https://x.com"],
        AI_RECRUITMENT_COMPLIANCE_ACK=True,
        CANDIDATE_PRIVACY_NOTICE_URL="https://x.com/privacy",
        AI_HUMAN_REVIEW_REQUIRED=True,
    )
    _enforce_production_security(app)  # 不抛即通过


def test_postgres_url_uses_psycopg_driver():
    assert _normalize_database_url("postgresql://user:pass@db:5432/zhipin") == (
        "postgresql+psycopg://user:pass@db:5432/zhipin"
    )
    assert _normalize_database_url("sqlite:///hireinsight.db") == "sqlite:///hireinsight.db"


def test_dev_mode_skips_enforcement():
    app = _mk(FLASK_DEBUG=True, JWT_SECRET="dev-secret", CORS_ORIGINS=[])
    _enforce_production_security(app)  # 开发模式放行


def test_public_register_closed_by_default():
    with _managed_app(_DefaultClosed) as app:
        client = app.test_client()
        r = client.post("/api/auth/register", json={"email": "a@b.com", "password": "pw123456"})
    assert r.status_code == 403
    assert "公开注册" in r.get_json()["error"]


class _DefaultClosed(TestingConfig):
    ALLOW_PUBLIC_REGISTRATION = False


class _RuntimeHardeningConfig(_DefaultClosed):
    RATE_LIMIT_ENABLED = True
    RATE_LIMITS = {
        "auth.login": {"limit": 2, "window_seconds": 60},
    }


def test_security_headers_are_added_to_api_responses():
    with _managed_app(_DefaultClosed) as app:
        client = app.test_client()

        response = client.post("/api/auth/register", json={"email": "a@b.com", "password": "pw123456"})

    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "camera=()" in response.headers["Permissions-Policy"]
    assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]


def test_login_rate_limit_blocks_repeated_failures():
    with _managed_app(_RuntimeHardeningConfig) as app:
        client = app.test_client()

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
    assert "请求过于频繁" in blocked.get_json()["error"]
