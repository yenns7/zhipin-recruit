# backend/tests/test_health.py
"""健康检查端点：负载均衡/编排平台探活用，不需要认证。"""


def test_health_returns_200_when_db_up(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["status"] == "ok"
    assert body["database"] == "up"


def test_healthz_alias_returns_200(client):
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "ok"


def test_health_does_not_require_auth(client):
    # 无 Authorization header 也应正常返回，不是探活接口的话就会被 401。
    resp = client.get("/health")
    assert resp.status_code == 200


def test_health_reports_down_when_db_unavailable(app, client, monkeypatch):
    from backend.app import db as _db

    def _boom(*args, **kwargs):
        raise RuntimeError("simulated db outage")

    monkeypatch.setattr(_db.session, "execute", _boom)
    resp = client.get("/health")
    assert resp.status_code == 503
    body = resp.get_json()
    assert body["status"] == "error"
    assert body["database"] == "down"
