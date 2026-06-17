import os
import sys
from pathlib import Path

# 把 base_agent 加入 sys.path，复用原始模块
BASE_AGENT_DIR = Path(__file__).resolve().parent.parent.parent / "base_agent"
if str(BASE_AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_AGENT_DIR))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _normalize_database_url(url: str) -> str:
    """Use psycopg v3 for PostgreSQL while accepting the common postgresql:// form."""
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


class Config:
    # LLM
    LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "openai")
    LLM_MODEL = os.environ.get("LLM_MODEL", "gpt-4o-mini")
    LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
    LLM_API_URL = os.environ.get("LLM_API_URL", "")

    # JWT
    JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-in-prod")
    JWT_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", "8"))

    # 运行模式：生产模式下会强制校验密钥强度（见 app/__init__.py 的 _enforce_production_security）
    FLASK_DEBUG = os.environ.get("FLASK_DEBUG", "true").lower() == "true"

    # 公开注册开关：默认关闭，生产/试点下账号由 admin 创建（见 api/auth.py register）
    ALLOW_PUBLIC_REGISTRATION = os.environ.get("ALLOW_PUBLIC_REGISTRATION", "false").lower() == "true"

    # CORS 允许来源：逗号分隔的域名白名单；留空表示不限制（仅限开发）
    CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]

    # 视为弱/默认的密钥，生产启动时拒绝
    WEAK_SECRETS = {"dev-secret-change-in-prod", "dev-secret", "test-secret", "change-me-in-production", ""}
    MIN_SECRET_LENGTH = 32

    # 数据库：开发用 SQLite（绝对路径，避免 CWD 不同导致建出空库），生产换 PostgreSQL URL
    _default_db = "sqlite:///" + str(Path(__file__).resolve().parent.parent / "hireinsight.db")
    DATABASE_URL = _normalize_database_url(os.environ.get("DATABASE_URL", _default_db))
    SQLALCHEMY_DATABASE_URI = DATABASE_URL
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # 文件上传
    UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER", str(Path(__file__).resolve().parent.parent / "uploads"))
    MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB

    # Celery：开发用 eager（同进程，无需 Redis）
    CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "memory://")
    CELERY_TASK_ALWAYS_EAGER = os.environ.get("CELERY_TASK_ALWAYS_EAGER", "true").lower() == "true"

    # Flask
    SECRET_KEY = os.environ.get("JWT_SECRET", "dev-secret")
    TESTING = False

class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    CELERY_TASK_ALWAYS_EAGER = True
    JWT_SECRET = "test-secret"
    # 测试保留公开注册以覆盖既有 register 用例；生产默认关闭
    ALLOW_PUBLIC_REGISTRATION = True
