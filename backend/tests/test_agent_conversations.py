from app import db
from app import models


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_agent_chat_creates_conversation_and_persists_messages(
    app,
    client,
    make_user,
    monkeypatch,
):
    assert hasattr(models, "Conversation"), "Conversation model should exist"
    assert hasattr(models, "ConversationMessage"), "ConversationMessage model should exist"

    _, token = make_user("agent-conversation@example.com", role="recruiter")

    class FakeAgent:
        def run_stream(self, message, history, user_id=None, role=None):
            assert message == "帮我数一下候选人"
            assert history == []
            assert user_id is not None
            assert role == "recruiter"
            yield {"type": "thought", "text": "先查系统数据"}
            yield {"type": "done", "answer": "系统里有 0 位候选人。"}

    from app.api import agent as agent_api

    monkeypatch.setattr(agent_api, "_get_agent", lambda: FakeAgent())

    response = client.post(
        "/api/agent/chat",
        headers=_auth(token),
        json={"message": "帮我数一下候选人", "history": []},
    )

    assert response.status_code == 200
    stream_text = response.get_data(as_text=True)
    assert '"type": "conversation_started"' in stream_text
    assert '"answer": "系统里有 0 位候选人。"' in stream_text

    with app.app_context():
        Conversation = models.Conversation
        ConversationMessage = models.ConversationMessage
        conv = Conversation.query.one()
        assert conv.title == "帮我数一下候选人"
        assert conv.user_id is not None
        messages = ConversationMessage.query.order_by(ConversationMessage.id.asc()).all()
        assert [(m.role, m.content) for m in messages] == [
            ("user", "帮我数一下候选人"),
            ("assistant", "系统里有 0 位候选人。"),
        ]
        assert messages[1].thoughts == ["先查系统数据"]

    list_response = client.get("/api/agent/conversations", headers=_auth(token))
    assert list_response.status_code == 200
    assert list_response.get_json()[0]["message_count"] == 2


def test_agent_conversation_detail_is_user_scoped(client, make_user, app):
    assert hasattr(models, "Conversation"), "Conversation model should exist"
    assert hasattr(models, "ConversationMessage"), "ConversationMessage model should exist"

    owner_id, _ = make_user("agent-owner@example.com", role="recruiter")
    _, other_token = make_user("agent-other@example.com", role="recruiter")

    with app.app_context():
        Conversation = models.Conversation
        ConversationMessage = models.ConversationMessage
        conv = Conversation(user_id=owner_id, title="私有会话")
        db.session.add(conv)
        db.session.flush()
        db.session.add(ConversationMessage(
            conversation_id=conv.id,
            role="user",
            content="这是私有消息",
        ))
        db.session.commit()
        conv_id = conv.id

    response = client.get(f"/api/agent/conversations/{conv_id}", headers=_auth(other_token))

    assert response.status_code == 403
