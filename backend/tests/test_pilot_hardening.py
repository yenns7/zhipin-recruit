"""试点上线安全硬化（C1 密钥强制 / C2 CORS / C3 注册关闭）回归测试。"""
import pytest

from app import create_app, _enforce_production_security
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


def test_prod_passes_with_strong_config():
    app = _mk(JWT_SECRET="x" * 40, CORS_ORIGINS=["https://x.com"])
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
    app = create_app(Config.__class__ if False else _DefaultClosed)
    client = app.test_client()
    r = client.post("/api/auth/register", json={"email": "a@b.com", "password": "pw123456"})
    assert r.status_code == 403
    assert "公开注册" in r.get_json()["error"]


class _DefaultClosed(TestingConfig):
    ALLOW_PUBLIC_REGISTRATION = False
