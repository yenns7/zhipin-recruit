"""验证全局 SQLAlchemy 错误处理：返回结构化错误 + rollback。"""

from sqlalchemy.exc import IntegrityError

from backend.app import create_app, db
from backend.app.config import TestingConfig
from backend.app.models import User


def test_sqlalchemy_error_returns_structured_500():
    app = create_app(TestingConfig)
    client = app.test_client()

    @app.route("/__test_db_error")
    def _trigger():
        u1 = User(email="dup@test.com", name="dup", role="recruiter", password_hash="x")
        u2 = User(email="dup@test.com", name="dup2", role="recruiter", password_hash="x")
        db.session.add(u1)
        db.session.commit()
        db.session.add(u2)
        db.session.commit()
        return {"ok": True}

    resp = client.get("/__test_db_error")
    assert resp.status_code == 500
    data = resp.get_json()
    assert data["code"] == "DB_ERROR"
    assert "Traceback" not in resp.get_data(as_text=True)


def test_generic_exception_returns_500():
    app = create_app(TestingConfig)
    client = app.test_client()

    @app.route("/__test_crash")
    def _crash():
        raise ValueError("boom")

    resp = client.get("/__test_crash")
    assert resp.status_code == 500
    data = resp.get_json()
    assert data["code"] == "INTERNAL_ERROR"
    assert "boom" in data["error"]


def test_sqlalchemy_error_handler_rolls_back_session(monkeypatch):
    app = create_app(TestingConfig)
    client = app.test_client()
    rolled_back = {"called": False}

    def _boom():
        rolled_back["called"] = True

    monkeypatch.setattr(db.session, "rollback", _boom)

    @app.route("/__test_integrity_error")
    def _integrity_error():
        raise IntegrityError("stmt", "params", Exception("dup"))

    resp = client.get("/__test_integrity_error")
    assert resp.status_code == 500
    assert resp.get_json()["code"] == "DB_ERROR"
    assert rolled_back["called"] is True
