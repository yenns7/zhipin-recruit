"""T4 测试：写操作执行后写 AgentCallLog(kind=tool_write)。"""
import json

from app import db
from app.models import Candidate, Job, PipelineStage, AgentCallLog
from app.services.agent_service import execute_write_tool


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_write_tool_success_writes_tool_write_log(app, make_user):
    """写工具执行成功应写一条 kind=tool_write, status=ok 的日志。"""
    owner_id, _ = make_user("t4-write-success@example.com", role="recruiter")

    with app.app_context():
        job = Job(title="前端工程师", jd_text="负责前端", owner_hr_id=owner_id)
        candidate = Candidate(owner_hr_id=owner_id, name_masked="候选人T4", resume_json={})
        db.session.add_all([job, candidate])
        db.session.commit()
        job_id, candidate_id = job.id, candidate.id

        result = execute_write_tool(
            "move_pipeline",
            {"candidate_id": candidate_id, "job_id": job_id, "stage": "interview"},
            user_id=owner_id, role="recruiter", conversation_id=None,
        )

    assert result["ok"] is True
    with app.app_context():
        log = AgentCallLog.query.filter_by(kind="tool_write", user_id=owner_id).one()
        assert log.role == "recruiter"
        assert log.status == "ok"
        assert log.error_msg is None
        assert log.duration_ms is not None and log.duration_ms >= 0
        assert log.conversation_id is None  # 未传则空
        # input_text 含工具名与入参
        parsed = json.loads(log.input_text)
        assert parsed["tool"] == "move_pipeline"
        assert parsed["args"]["stage"] == "interview"
        # tool_calls 含工具名
        assert log.tool_calls[0]["name"] == "move_pipeline"


def test_write_tool_rbac_rejection_writes_error_log(app, make_user):
    """RBAC 拒绝应写一条 status=error 的日志，记录拒绝原因。"""
    owner_id, _ = make_user("t4-rbac@example.com", role="recruiter")

    with app.app_context():
        # recruiter 无权执行 run_match 之外需 manager 的场景，这里用 interviewer 角色触发拒绝
        # move_pipeline 的 rbac 含 interviewer，所以用 create_job（不含 interviewer）测拒绝
        result = execute_write_tool(
            "create_job",
            {"title": "x", "jd_text": "y"},
            user_id=owner_id, role="interviewer",
        )

    assert result["ok"] is False
    assert "无权执行" in result["error"]
    with app.app_context():
        log = AgentCallLog.query.filter_by(
            kind="tool_write", user_id=owner_id, role="interviewer",
        ).one()
        assert log.status == "error"
        assert "无权执行" in log.error_msg


def test_write_tool_unknown_tool_writes_error_log(app, make_user):
    """未知写工具应写一条 status=error 日志。"""
    owner_id, _ = make_user("t4-unknown@example.com", role="recruiter")

    with app.app_context():
        result = execute_write_tool(
            "nonexistent_tool", {}, user_id=owner_id, role="recruiter",
        )

    assert result["ok"] is False
    with app.app_context():
        log = AgentCallLog.query.filter_by(
            kind="tool_write", user_id=owner_id,
        ).filter(AgentCallLog.input_text.contains("nonexistent_tool")).one()
        assert log.status == "error"
        assert "未知写工具" in log.error_msg


def test_execute_endpoint_passes_conversation_id(app, client, make_user, monkeypatch):
    """/agent/execute 接口应把 conversation_id 透传给 execute_write_tool。"""
    _, token = make_user("t4-endpoint@example.com", role="recruiter")

    captured = {}

    from app.services import agent_service

    def fake_execute(name, args, user_id, role, conversation_id=None):
        captured["conversation_id"] = conversation_id
        captured["name"] = name
        return {"ok": True, "result": {"id": 1}}

    monkeypatch.setattr(agent_service, "execute_write_tool", fake_execute)
    # agent.py 在 import 时已绑定 execute_write_tool 名字，需 patch api 层引用
    from app.api import agent as agent_api
    monkeypatch.setattr(agent_api, "execute_write_tool", fake_execute)

    response = client.post(
        "/api/agent/execute",
        headers=_auth(token),
        json={"tool": "create_job", "args": {"title": "x"}, "conversation_id": 42},
    )
    assert response.status_code == 200
    assert captured["conversation_id"] == 42
    assert captured["name"] == "create_job"
