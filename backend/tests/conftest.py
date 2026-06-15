# backend/tests/conftest.py
import sys
from pathlib import Path

# 让 `import app` 生效（backend/ 入 sys.path）
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest
from app import create_app, db as _db
from app.config import TestingConfig


@pytest.fixture()
def app():
    app = create_app(TestingConfig)
    with app.app_context():
        _db.create_all()
        yield app
        _db.session.remove()
        _db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def make_user(app):
    """直接建用户并返回 (user_id, token)。绕过 register，便于建任意角色做测试前置。"""
    import bcrypt, jwt
    from datetime import datetime, timedelta
    from app.models import User
    from app.config import TestingConfig

    def _make(email, role="recruiter", password="pw123456", name="T", is_active=True):
        with app.app_context():
            u = User(name=name, email=email, role=role, is_active=is_active,
                     password_hash=bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode())
            db_ = __import__("app", fromlist=["db"]).db
            db_.session.add(u); db_.session.commit()
            uid = u.id
        token = jwt.encode({"user_id": uid, "role": role,
                            "exp": datetime.utcnow() + timedelta(hours=1)},
                           TestingConfig.JWT_SECRET, algorithm="HS256")
        return uid, token
    return _make
