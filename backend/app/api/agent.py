import json
from flask import Blueprint, request, Response, jsonify, g, current_app, stream_with_context
from ..middleware.auth import require_auth
from ..services.agent_service import RecruitingAgent, TOOLS as AGENT_TOOLS

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
def list_tools():
    """返回智能体可用的工具清单（供前端展示「能力」）。"""
    return jsonify({"tools": AGENT_TOOLS})


@bp.post("/agent/chat")
@require_auth
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
    if not message:
        return jsonify({"error": "message required"}), 400

    # 在请求上下文内捕获需要的应用对象（生成器执行时 g 已不可用）
    app = current_app._get_current_object()
    agent = _get_agent()

    @stream_with_context
    def generate():
        # 生成器运行在 app context 内（工具要查 DB）
        with app.app_context():
            try:
                for ev in agent.run_stream(message, history):
                    yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
            except Exception as e:
                err = {"type": "error", "message": f"智能体执行出错：{e}"}
                yield f"data: {json.dumps(err, ensure_ascii=False)}\n\n"

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # 禁用 nginx 缓冲，保证流式
            "Connection": "keep-alive",
        },
    )
