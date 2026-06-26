"""T3 测试：/agent/chat 流式 done 后写 AgentCallLog。"""
from app import db
from app import models


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


class _FakeClient:
    """模拟 LLMClient，暴露 last_call_log 给 _write_chat_call_log 读取。"""
    def __init__(self, call_log=None):
        self.last_call_log = call_log


class _FakeAgent:
    """模拟 RecruitingAgent，run_stream yield 事件序列。
    done 事件附带 _call_log 快照（与真实 run_stream 一致）。"""
    def __init__(self, events, call_log=None):
        # 若 events 里已有 done 事件且未带 _call_log，注入 call_log 快照
        self._events = []
        for ev in events:
            if ev.get("type") == "done" and "_call_log" not in ev and call_log is not None:
                self._events.append({**ev, "_call_log": dict(call_log)})
            else:
                self._events.append(ev)
        self.client = _FakeClient(call_log)

    def run_stream(self, message, history, user_id=None, role=None):
        for ev in self._events:
            yield ev


def test_chat_success_writes_call_log(app, client, make_user, monkeypatch):
    """chat 成功后应写一条 AgentCallLog(kind=chat, status=ok)，含模型/token/耗时。"""
    _, token = make_user("t3-success@example.com", role="recruiter")

    call_log = {
        "model": "deepseek-v4-flash",
        "prompt_tokens": 15,
        "completion_tokens": 9,
        "duration_ms": 420,
        "status": "ok",
        "error_msg": None,
    }
    fake = _FakeAgent(
        events=[
            {"type": "thought", "text": "先查系统数据"},
            {"type": "tool_call", "tool": "count_summary", "args": {}},
            {"type": "tool_result", "tool": "count_summary", "result": {"candidates": 0}},
            {"type": "done", "answer": "系统里有 0 位候选人。"},
        ],
        call_log=call_log,
    )
    from app.api import agent as agent_api
    monkeypatch.setattr(agent_api, "_get_agent", lambda: fake)

    response = client.post(
        "/api/agent/chat",
        headers=_auth(token),
        json={"message": "帮我数候选人", "history": []},
    )
    assert response.status_code == 200
    # 消费完整流，确保 generate() 跑到 done 块（SSE 生成器是惰性的）
    response.get_data(as_text=True)

    with app.app_context():
        log = models.AgentCallLog.query.filter_by(kind="chat").one()
        assert log.role == "recruiter"
        assert log.status == "ok"
        assert log.model == "deepseek-v4-flash"
        assert log.prompt_tokens == 15
        assert log.completion_tokens == 9
        assert log.duration_ms == 420
        assert log.input_text == "帮我数候选人"
        assert log.output_text == "系统里有 0 位候选人。"
        assert log.thoughts == ["先查系统数据"]
        # tool_calls 含 count_summary
        assert any(c.get("tool") == "count_summary" for c in (log.tool_calls or []))
        assert log.conversation_id is not None


def test_chat_error_path_writes_error_log(app, client, make_user, monkeypatch):
    """agent 流异常（未成功）应写一条 status=error 的 AgentCallLog。"""
    _, token = make_user("t3-error@example.com", role="recruiter")

    fake = _FakeAgent(
        events=[
            {"type": "thought", "text": "开始处理"},
            {"type": "error", "message": "智能体执行出错：boom"},
        ],
        call_log={"model": "deepseek-v4-flash", "status": "ok", "duration_ms": 10},
    )
    from app.api import agent as agent_api
    monkeypatch.setattr(agent_api, "_get_agent", lambda: fake)

    response = client.post(
        "/api/agent/chat",
        headers=_auth(token),
        json={"message": "出错的请求", "history": []},
    )
    assert response.status_code == 200  # SSE 仍 200，error 在流里
    response.get_data(as_text=True)

    with app.app_context():
        log = models.AgentCallLog.query.filter_by(kind="chat").one()
        assert log.status == "error"
        assert log.error_msg
        assert log.input_text == "出错的请求"


def test_call_log_write_failure_does_not_block_chat(app, client, make_user, monkeypatch):
    """log 写入失败不应阻断主流程——对话仍应正常返回。
    _write_chat_call_log 内部 try/except 应吞掉 log 写入异常。"""
    _, token = make_user("t3-logfail@example.com", role="recruiter")

    fake = _FakeAgent(
        events=[{"type": "done", "answer": "正常回答"}],
        call_log={"model": "m", "status": "ok", "duration_ms": 1},
    )
    from app.api import agent as agent_api
    monkeypatch.setattr(agent_api, "_get_agent", lambda: fake)

    # 让 _write_chat_call_log 内部构造 AgentCallLog 时抛异常
    class _BoomLog:
        def __init__(self, **kwargs):
            raise RuntimeError("db down")

    monkeypatch.setattr(agent_api, "AgentCallLog", _BoomLog)

    response = client.post(
        "/api/agent/chat",
        headers=_auth(token),
        json={"message": "log会失败", "history": []},
    )
    assert response.status_code == 200
    stream_text = response.get_data(as_text=True)
    assert "正常回答" in stream_text

    with app.app_context():
        # 对话消息仍应落库（在 log 写入之前已 commit）
        assert models.ConversationMessage.query.count() >= 2
        # log 写入失败，故无 chat 级记录
        assert models.AgentCallLog.query.filter_by(kind="chat").count() == 0
