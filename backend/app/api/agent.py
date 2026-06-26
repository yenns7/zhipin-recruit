import json
from flask import Blueprint, request, Response, jsonify, g, current_app, stream_with_context
from ..middleware.auth import require_auth, require_role
from ..middleware.rate_limit import rate_limit
from .. import db
from ..models import Conversation, ConversationMessage, AgentCallLog
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

# log 文本字段截断阈值，避免单条记录过大
_LOG_TEXT_MAX = 8000


def _truncate(text, limit=_LOG_TEXT_MAX):
    """截断超长文本，超出部分用 …(truncated) 标记。"""
    if not text:
        return text
    s = str(text)
    return s if len(s) <= limit else s[:limit] + "…(truncated)"


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
    """列出当前用户的会话。支持 archived 过滤与分页（默认只看未归档）。"""
    archived = request.args.get("archived", "false").lower() in ("1", "true", "yes")
    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(100, max(1, int(request.args.get("per_page", 50))))
    except (TypeError, ValueError):
        page, per_page = 1, 50

    query = (
        Conversation.query
        .filter_by(user_id=g.user_id, archived=archived)
        .order_by(Conversation.updated_at.desc())
    )
    paginated = query.paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({
        "items": [{
            "id": conversation.id,
            "title": conversation.title,
            "title_source": conversation.title_source,
            "archived": conversation.archived,
            "created_at": conversation.created_at.isoformat() if conversation.created_at else None,
            "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None,
            "message_count": len(conversation.messages),
        } for conversation in paginated.items],
        "page": paginated.page,
        "per_page": paginated.per_page,
        "total": paginated.total,
    })


@bp.post("/agent/conversations")
@require_auth
@require_role("recruiter", "manager", "admin")
def create_conversation():
    """新建空会话，返回 {id, title, archived, title_source}。"""
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "新对话").strip()[:200] or "新对话"
    conversation = Conversation(
        user_id=g.user_id, title=title, title_source="manual",
    )
    db.session.add(conversation)
    db.session.commit()
    return jsonify({
        "id": conversation.id,
        "title": conversation.title,
        "archived": conversation.archived,
        "title_source": conversation.title_source,
        "created_at": conversation.created_at.isoformat() if conversation.created_at else None,
    }), 201


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
        "title_source": conversation.title_source,
        "archived": conversation.archived,
        "messages": [{
            "id": message.id,
            "role": message.role,
            "content": message.content,
            "tool_calls": message.tool_calls,
            "thoughts": message.thoughts,
            "created_at": message.created_at.isoformat() if message.created_at else None,
        } for message in conversation.messages],
    })


@bp.patch("/agent/conversations/<int:conversation_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def update_conversation(conversation_id):
    """重命名 / 归档 / 取消归档。请求体：{"title": "...", "archived": bool}（均可选）。"""
    conversation = db.get_or_404(Conversation, conversation_id)
    if conversation.user_id != g.user_id:
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json(silent=True) or {}
    if "title" in data:
        new_title = (str(data["title"]).strip())[:200]
        if new_title:
            conversation.title = new_title
            conversation.title_source = "manual"
    if "archived" in data:
        conversation.archived = bool(data["archived"])
    db.session.commit()
    return jsonify({
        "id": conversation.id,
        "title": conversation.title,
        "title_source": conversation.title_source,
        "archived": conversation.archived,
        "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None,
    })


@bp.delete("/agent/conversations/<int:conversation_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def delete_conversation(conversation_id):
    """软删会话（置 archived=True）。按 user_id 鉴权。"""
    conversation = db.get_or_404(Conversation, conversation_id)
    if conversation.user_id != g.user_id:
        return jsonify({"error": "Forbidden"}), 403
    conversation.archived = True
    db.session.commit()
    return jsonify({"id": conversation.id, "archived": True})


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
    conversation_id = data.get("conversation_id")
    if not tool:
        return jsonify({"ok": False, "error": "tool required"}), 400
    result = execute_write_tool(
        tool, args, user_id=g.user_id, role=g.role, conversation_id=conversation_id,
    )
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
                    # 写 AI 调用日志（chat 级）：记录本次对话的输入/输出/工具链/模型/耗时
                    # final assistant message 的 id 用于关联
                    _write_chat_call_log(
                        conversation_id=conversation.id,
                        user_id=user_id,
                        role=role,
                        input_text=message,
                        output_text=final_answer or "".join(answer_parts),
                        tool_calls=tool_calls,
                        thoughts=thoughts,
                        agent=agent,
                    )
            else:
                # 异常或未成功：补一条 error 日志，便于排障
                _write_chat_call_log(
                    conversation_id=store_conversation_id,
                    user_id=user_id,
                    role=role,
                    input_text=message,
                    output_text="".join(answer_parts) or None,
                    tool_calls=tool_calls,
                    thoughts=thoughts,
                    agent=agent,
                    status="error",
                    error_msg="agent stream ended without success",
                )

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


def _write_chat_call_log(
    conversation_id,
    user_id,
    role,
    input_text,
    output_text,
    tool_calls,
    thoughts,
    agent,
    status=None,
    error_msg=None,
):
    """写一条 chat 级 AI 调用日志。从 agent.client.last_call_log 取最终答案步的模型/token/耗时。
    log 写入失败只记 logging.error，不阻断主流程（事务与主业务隔离）。
    """
    try:
        llm_log = getattr(getattr(agent, "client", None), "last_call_log", None) or {}
        final_status = status or llm_log.get("status") or "ok"
        final_error = error_msg or llm_log.get("error_msg")
        db.session.add(AgentCallLog(
            conversation_id=conversation_id,
            user_id=user_id,
            role=role,
            kind="chat",
            input_text=_truncate(input_text),
            output_text=_truncate(output_text),
            tool_calls=tool_calls or None,
            thoughts=thoughts or None,
            model=llm_log.get("model"),
            prompt_tokens=llm_log.get("prompt_tokens"),
            completion_tokens=llm_log.get("completion_tokens"),
            duration_ms=llm_log.get("duration_ms"),
            status=final_status,
            error_msg=final_error,
        ))
        db.session.commit()
    except Exception as log_err:
        # log 写入失败不能影响已成功的对话返回
        db.session.rollback()
        current_app.logger.error(f"写入 AgentCallLog 失败: {log_err}")
