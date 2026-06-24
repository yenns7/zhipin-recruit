import json
from flask import Blueprint, request, Response, jsonify, g, current_app, stream_with_context
from ..middleware.auth import require_auth, require_role
from ..middleware.rate_limit import rate_limit
from .. import db
from ..models import Conversation, ConversationMessage
from ..time_utils import utc_now
from ..services.agent_service import (
    RecruitingAgent,
    TOOLS as AGENT_TOOLS,
    WRITE_TOOLS as AGENT_WRITE_TOOLS,
    execute_write_tool,
)

bp = Blueprint("agent", __name__)

# 单例：编译一次 LangGraph，复用
_agent_instance = None


def _get_agent() -> RecruitingAgent:
    global _agent_instance
    if _agent_instance is None:
        _agent_instance = RecruitingAgent()
    return _agent_instance


@bp.get("/agent/tools")
@require_auth
@require_role("recruiter", "manager", "admin")
def list_tools():
    """返回智能体可用的工具清单（供前端展示「能力」）。含只读与写操作。"""
    return jsonify({"tools": AGENT_TOOLS, "write_tools": AGENT_WRITE_TOOLS})


@bp.get("/agent/conversations")
@require_auth
@require_role("recruiter", "manager", "admin")
def list_conversations():
    conversations = (
        Conversation.query
        .filter_by(user_id=g.user_id)
        .order_by(Conversation.updated_at.desc())
        .all()
    )
    return jsonify([{
        "id": conversation.id,
        "title": conversation.title,
        "created_at": conversation.created_at.isoformat() if conversation.created_at else None,
        "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None,
        "message_count": len(conversation.messages),
    } for conversation in conversations])


@bp.get("/agent/conversations/<int:conversation_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def get_conversation(conversation_id):
    conversation = db.get_or_404(Conversation, conversation_id)
    if conversation.user_id != g.user_id:
        return jsonify({"error": "Forbidden"}), 403
    return jsonify({
        "id": conversation.id,
        "title": conversation.title,
        "messages": [{
            "id": message.id,
            "role": message.role,
            "content": message.content,
            "tool_calls": message.tool_calls,
            "thoughts": message.thoughts,
            "created_at": message.created_at.isoformat() if message.created_at else None,
        } for message in conversation.messages],
    })


@bp.post("/agent/execute")
@require_auth
@require_role("recruiter", "manager", "admin")
def execute():
    """执行 AI 助手提议的写操作（用户确认后调用）。
    在正常请求上下文内运行，g.user_id / g.role 有效，做 RBAC 校验。
    请求体：{"tool": "写工具名", "args": {...}}
    """
    data = request.get_json(silent=True) or {}
    tool = (data.get("tool") or "").strip()
    args = data.get("args") or {}
    if not tool:
        return jsonify({"ok": False, "error": "tool required"}), 400
    result = execute_write_tool(tool, args, user_id=g.user_id, role=g.role)
    status = 200 if result.get("ok") else 400
    return jsonify(result), status


@bp.post("/agent/chat")
@require_auth
@require_role("recruiter", "manager", "admin")
@rate_limit("agent.chat")
def chat():
    """
    智能体对话 SSE 流式端点。
    请求体：{"message": "用户问题", "history": [{"role","content"}, ...]}
    响应：text/event-stream，每个事件一行 `data: {json}\n\n`，
          事件类型 thought / tool_call / tool_result / token / done / error。
    """
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    history = data.get("history") or []
    conversation_id = data.get("conversation_id")
    if not message:
        return jsonify({"error": "message required"}), 400

    if conversation_id:
        try:
            conversation_id = int(conversation_id)
        except (TypeError, ValueError):
            return jsonify({"error": "invalid conversation_id"}), 400
        conversation = db.session.get(Conversation, conversation_id)
        if conversation is None:
            return jsonify({"error": "会话不存在"}), 404
        if conversation.user_id != g.user_id:
            return jsonify({"error": "Forbidden"}), 403
    else:
        conversation = Conversation(user_id=g.user_id, title=_conversation_title(message))
        db.session.add(conversation)
        db.session.commit()
        conversation_id = conversation.id

    # 在请求上下文内捕获需要的应用对象（生成器执行时 g 已不可用）
    app = current_app._get_current_object()
    agent = _get_agent()
    user_id = g.user_id
    role = g.role
    store_conversation_id = conversation_id

    @stream_with_context
    def generate():
        # 生成器运行在 app context 内（工具要查 DB）
        with app.app_context():
            thoughts = []
            tool_calls = []
            answer_parts = []
            final_answer = ""
            success = False
            yield f"data: {json.dumps({'type': 'conversation_started', 'id': store_conversation_id}, ensure_ascii=False)}\n\n"
            try:
                for ev in agent.run_stream(message, history, user_id=user_id, role=role):
                    ev_type = ev.get("type")
                    if ev_type == "thought":
                        thoughts.append(ev.get("text", ""))
                    elif ev_type == "tool_call":
                        tool_calls.append({
                            "tool": ev.get("tool"),
                            "args": ev.get("args") or {},
                        })
                    elif ev_type == "tool_result":
                        for call in reversed(tool_calls):
                            if call.get("tool") == ev.get("tool") and "result" not in call:
                                call["result"] = ev.get("result")
                                break
                    elif ev_type == "token":
                        answer_parts.append(ev.get("text", ""))
                    elif ev_type == "done":
                        final_answer = ev.get("answer") or "".join(answer_parts)
                        success = True
                    yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
            except Exception as e:
                err = {"type": "error", "message": f"智能体执行出错：{e}"}
                yield f"data: {json.dumps(err, ensure_ascii=False)}\n\n"

            if success:
                conversation = db.session.get(Conversation, store_conversation_id)
                if conversation and conversation.user_id == user_id:
                    db.session.add(ConversationMessage(
                        conversation_id=conversation.id,
                        role="user",
                        content=message,
                    ))
                    db.session.add(ConversationMessage(
                        conversation_id=conversation.id,
                        role="assistant",
                        content=final_answer or "".join(answer_parts),
                        tool_calls=tool_calls or None,
                        thoughts=thoughts or None,
                    ))
                    conversation.updated_at = utc_now()
                    db.session.commit()

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # 禁用 nginx 缓冲，保证流式
            "Connection": "keep-alive",
        },
    )


def _conversation_title(first_message: str) -> str:
    clean = first_message.strip().replace("\n", " ")
    return clean[:30] + ("…" if len(clean) > 30 else "")
