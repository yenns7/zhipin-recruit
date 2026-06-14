import os
import sys
from pathlib import Path

# 把 base_agent 加入 sys.path，复用原始模块
BASE_AGENT_DIR = Path(__file__).resolve().parent.parent.parent / "base_agent"
if str(BASE_AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_AGENT_DIR))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

class Config:
    # LLM
    LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "openai")
    LLM_MODEL = os.environ.get("LLM_MODEL", "gpt-4o-mini")
    LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
    LLM_API_URL = os.environ.get("LLM_API_URL", "")

    # JWT
    JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-in-prod")
    JWT_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", "8"))

    # 数据库：开发用 SQLite（绝对路径，避免 CWD 不同导致建出空库），生产换 PostgreSQL URL
    _default_db = "sqlite:///" + str(Path(__file__).resolve().parent.parent / "hireinsight.db")
    DATABASE_URL = os.environ.get("DATABASE_URL", _default_db)
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
