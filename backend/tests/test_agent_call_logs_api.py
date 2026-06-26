"""T6 测试：AgentCallLog 查询接口（列表筛选/分页 + 详情鉴权隔离）。"""
from app import db
from app.models import AgentCallLog


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_logs(app, user_id, n=3, status="ok", kind="chat"):
    with app.app_context():
        for i in range(n):
            db.session.add(AgentCallLog(
                user_id=user_id, role="recruiter", kind=kind,
                input_text=f"问{i}", output_text=f"答{i}",
                model="m", prompt_tokens=10 + i, completion_tokens=5,
                duration_ms=100 + i, status=status,
            ))
        db.session.commit()


def test_list_call_logs_non_admin_sees_only_own(app, client, make_user):
    """非管理员只能看自己的日志。"""
    _, token_a = make_user("t6-a@example.com", role="recruiter")
    uid_b, _ = make_user("t6-b@example.com", role="recruiter")
    _seed_logs(app, uid_b, n=2)
    _seed_logs(app, _uid_of(token_a, app), n=3)

    resp = client.get("/api/agent/call-logs", headers=_auth(token_a))
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["total"] == 3  # 只看到自己的 3 条


def test_list_call_logs_admin_sees_all(app, client, make_user):
    """管理员能看全部用户的日志。"""
    _, token_admin = make_user("t6-admin@example.com", role="admin")
    _, token_r = make_user("t6-r@example.com", role="recruiter")
    _seed_logs(app, _uid_of(token_r, app), n=2)

    resp = client.get("/api/agent/call-logs", headers=_auth(token_admin))
    assert resp.status_code == 200
    assert resp.get_json()["total"] == 2


def test_list_call_logs_filters(app, client, make_user):
    """支持 conversation_id / status / kind 筛选。"""
    _, token = make_user("t6-filter@example.com", role="recruiter")
    uid = _uid_of(token, app)
    with app.app_context():
        db.session.add(AgentCallLog(user_id=uid, role="recruiter", kind="chat",
                                    status="ok", conversation_id=1, input_text="a"))
        db.session.add(AgentCallLog(user_id=uid, role="recruiter", kind="tool_write",
                                    status="error", conversation_id=1, input_text="b"))
        db.session.add(AgentCallLog(user_id=uid, role="recruiter", kind="chat",
                                    status="error", conversation_id=2, input_text="c"))
        db.session.commit()

    # status=error
    resp = client.get("/api/agent/call-logs?status=error", headers=_auth(token))
    assert resp.get_json()["total"] == 2

    # kind=tool_write
    resp = client.get("/api/agent/call-logs?kind=tool_write", headers=_auth(token))
    assert resp.get_json()["total"] == 1

    # conversation_id=2
    resp = client.get("/api/agent/call-logs?conversation_id=2", headers=_auth(token))
    assert resp.get_json()["total"] == 1


def test_list_call_logs_pagination(app, client, make_user):
    _, token = make_user("t6-page@example.com", role="recruiter")
    _seed_logs(app, _uid_of(token, app), n=5)

    resp = client.get("/api/agent/call-logs?per_page=2&page=1", headers=_auth(token))
    body = resp.get_json()
    assert body["total"] == 5
    assert len(body["items"]) == 2


def test_get_call_log_detail(app, client, make_user):
    """详情含完整 input/output。"""
    _, token = make_user("t6-detail@example.com", role="recruiter")
    uid = _uid_of(token, app)
    with app.app_context():
        log = AgentCallLog(user_id=uid, role="recruiter", kind="chat",
                           input_text="完整问题", output_text="完整回答",
                           tool_calls=[{"name": "x"}], thoughts=["想"],
                           model="m", prompt_tokens=1, completion_tokens=2,
                           duration_ms=3, status="ok")
        db.session.add(log)
        db.session.commit()
        log_id = log.id

    resp = client.get(f"/api/agent/call-logs/{log_id}", headers=_auth(token))
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["input_text"] == "完整问题"
    assert body["output_text"] == "完整回答"
    assert body["tool_calls"] == [{"name": "x"}]


def test_get_call_log_detail_is_user_scoped(app, client, make_user):
    """非管理员不能看别人的日志详情。"""
    _, token_owner = make_user("t6-owner@example.com", role="recruiter")
    _, token_other = make_user("t6-other@example.com", role="recruiter")
    uid = _uid_of(token_owner, app)
    with app.app_context():
        log = AgentCallLog(user_id=uid, role="recruiter", kind="chat", status="ok")
        db.session.add(log)
        db.session.commit()
        log_id = log.id

    assert client.get(f"/api/agent/call-logs/{log_id}", headers=_auth(token_other)).status_code == 403
    # 管理员能看
    _, token_admin = make_user("t6-admin2@example.com", role="admin")
    assert client.get(f"/api/agent/call-logs/{log_id}", headers=_auth(token_admin)).status_code == 200


def _uid_of(token, app):
    """从 JWT 解出 user_id（仅测试用，不验签）。"""
    import jwt
    from app.config import TestingConfig
    payload = jwt.decode(token, TestingConfig.JWT_SECRET, algorithms=["HS256"])
    return payload["user_id"]
