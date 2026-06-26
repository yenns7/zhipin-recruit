from app import db
from app import models


def test_agent_call_log_creates_and_persists(app, make_user):
    """AgentCallLog 可创建并落库，含完整字段。"""
    assert hasattr(models, "AgentCallLog"), "AgentCallLog model should exist"

    user_id, _ = make_user("calllog-full@example.com", role="recruiter")

    with app.app_context():
        conv = models.Conversation(user_id=user_id, title="t1")
        db.session.add(conv)
        db.session.commit()

        msg = models.ConversationMessage(
            conversation_id=conv.id, role="user", content="帮我数候选人"
        )
        db.session.add(msg)
        db.session.commit()

        log = models.AgentCallLog(
            conversation_id=conv.id,
            message_id=msg.id,
            user_id=user_id,
            role="recruiter",
            kind="chat",
            input_text="帮我数候选人",
            output_text="系统里有 0 位候选人。",
            tool_calls=[{"name": "count_candidates", "args": {}}],
            thoughts=["先查系统数据"],
            model="gpt-4o-mini",
            prompt_tokens=12,
            completion_tokens=8,
            duration_ms=320,
            status="ok",
        )
        db.session.add(log)
        db.session.commit()

        fetched = models.AgentCallLog.query.get(log.id)
        assert fetched is not None
        assert fetched.conversation_id == conv.id
        assert fetched.message_id == msg.id
        assert fetched.user_id == user_id
        assert fetched.role == "recruiter"
        assert fetched.kind == "chat"
        assert fetched.input_text == "帮我数候选人"
        assert fetched.output_text == "系统里有 0 位候选人。"
        assert fetched.tool_calls == [{"name": "count_candidates", "args": {}}]
        assert fetched.thoughts == ["先查系统数据"]
        assert fetched.model == "gpt-4o-mini"
        assert fetched.prompt_tokens == 12
        assert fetched.completion_tokens == 8
        assert fetched.duration_ms == 320
        assert fetched.status == "ok"
        assert fetched.error_msg is None
        assert fetched.created_at is not None


def test_agent_call_log_nullable_fields_can_be_empty(app, make_user):
    """异常场景：conversation_id / message_id / 文本/JSON 等可空字段全空也能落库。"""
    user_id, _ = make_user("calllog-empty@example.com", role="interviewer")

    with app.app_context():
        log = models.AgentCallLog(
            conversation_id=None,
            message_id=None,
            user_id=user_id,
            role="interviewer",
            kind="tool_write",
            status="error",
            error_msg="超时",
        )
        db.session.add(log)
        db.session.commit()

        fetched = models.AgentCallLog.query.get(log.id)
        assert fetched.conversation_id is None
        assert fetched.message_id is None
        assert fetched.input_text is None
        assert fetched.output_text is None
        assert fetched.tool_calls is None
        assert fetched.thoughts is None
        assert fetched.model is None
        assert fetched.prompt_tokens is None
        assert fetched.completion_tokens is None
        assert fetched.duration_ms is None
        assert fetched.status == "error"
        assert fetched.error_msg == "超时"


def test_conversation_archived_and_title_source_defaults(app, make_user):
    """Conversation 新增字段 archived/title_source 默认值正确。"""
    user_id, _ = make_user("calllog-conv@example.com", role="manager")

    with app.app_context():
        conv = models.Conversation(user_id=user_id)
        db.session.add(conv)
        db.session.commit()

        fetched = models.Conversation.query.get(conv.id)
        assert fetched.archived is False
        assert fetched.title_source == "auto_first"

        # 可显式覆盖
        conv2 = models.Conversation(user_id=user_id, archived=True, title_source="manual")
        db.session.add(conv2)
        db.session.commit()

        fetched2 = models.Conversation.query.get(conv2.id)
        assert fetched2.archived is True
        assert fetched2.title_source == "manual"
