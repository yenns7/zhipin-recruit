# -*- coding: utf-8 -*-
"""
智聘·招聘管理系统 —— LangGraph 驱动的 ReAct 招聘智能体。

设计要点：
- 用 LangGraph 的 StateGraph 手搓 ReAct 循环（agent 决策 → tools 执行 → 回到 agent）。
- LLM 调用复用 base_agent/llm_client.py 的 LLMClient（DeepSeek，OpenAI 兼容接口），
  不自己写 HTTP，也不引入 langchain-openai。
- 决策步用 chat_messages 的 json_object 模式（让模型输出结构化动作）；
  最终答案步用 chat_stream 流式产出 token，前端可见“思考→调用工具→看到数据→流式回答”。
- 所有工具内部直接查 SQLAlchemy model 或复用现有 service，需在 Flask app context 内运行。
"""
from __future__ import annotations

import sys
import json
import logging
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, TypedDict

# --- 复用 base_agent 的 LLMClient（DeepSeek）-----------------------------------
BASE_AGENT_DIR = Path(__file__).resolve().parent.parent.parent.parent / "base_agent"
if str(BASE_AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_AGENT_DIR))
from llm_client import LLMClient, route_model  # noqa: E402

# --- LangGraph 编排 -----------------------------------------------------------
from langgraph.graph import StateGraph, START, END  # noqa: E402

# --- 现有模块（model / service）-----------------------------------------------
from .. import db  # noqa: E402
from ..models import (  # noqa: E402
    Candidate,
    CandidateTag,
    Job,
    Interview,
    PipelineStage,
)
from .match_service import MatchService  # noqa: E402
from ..api.bi import _funnel  # 复用 BI 漏斗逻辑（模块级函数）  # noqa: E402

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 5  # ReAct 步数上限，防止无限循环


# =============================================================================
# 1) 工具实现（每个工具内部查现有 model / service，返回可 JSON 序列化的 dict/list）
# =============================================================================
def _tool_list_candidates(limit: int = 20, **_) -> Dict[str, Any]:
    """候选人列表摘要。"""
    try:
        limit = int(limit) if limit else 20
    except (TypeError, ValueError):
        limit = 20
    rows = Candidate.query.order_by(Candidate.id).limit(limit).all()
    items = [{
        "id": c.id,
        "name_masked": c.name_masked,
        "tag_count": len(c.tags),
    } for c in rows]
    return {"count": len(items), "candidates": items}


def _tool_get_candidate(candidate_id: int, **_) -> Dict[str, Any]:
    """单个候选人详情，含技能标签。"""
    c = Candidate.query.get(int(candidate_id))
    if not c:
        return {"error": f"候选人 {candidate_id} 不存在"}
    tags = [{"tag": t.tag, "score": t.score} for t in c.tags]
    return {
        "id": c.id,
        "name_masked": c.name_masked,
        "email_masked": c.email_masked,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "tags": tags,
    }


def _tool_list_jobs(limit: int = 20, **_) -> Dict[str, Any]:
    """岗位列表。"""
    try:
        limit = int(limit) if limit else 20
    except (TypeError, ValueError):
        limit = 20
    rows = Job.query.order_by(Job.id).limit(limit).all()
    items = [{"id": j.id, "title": j.title, "status": j.status} for j in rows]
    return {"count": len(items), "jobs": items}


def _tool_match_candidates_for_job(job_id: int, **_) -> Dict[str, Any]:
    """给某岗位匹配候选人排名（复用 MatchService.rank_for_job）。"""
    job = Job.query.get(int(job_id))
    if not job:
        return {"error": f"岗位 {job_id} 不存在"}
    ranked = MatchService().rank_for_job(int(job_id), top_n=10)
    return {"job_id": int(job_id), "job_title": job.title, "ranking": ranked}


def _tool_get_pipeline(job_id: int, **_) -> Dict[str, Any]:
    """某岗位招聘流程看板：按 stage 分组计数。"""
    rows = (
        db.session.query(PipelineStage.stage, db.func.count(PipelineStage.candidate_id))
        .filter(PipelineStage.job_id == int(job_id))
        .group_by(PipelineStage.stage)
        .all()
    )
    by_stage = {stage: count for stage, count in rows}
    return {"job_id": int(job_id), "pipeline": by_stage}


def _tool_get_bi_overview(days: int = 30, **_) -> Dict[str, Any]:
    """团队 BI 报表：招聘漏斗（复用 _funnel）+ 专员效能。"""
    try:
        days = int(days) if days else 30
    except (TypeError, ValueError):
        days = 30
    from datetime import datetime, timedelta
    from sqlalchemy import func
    from ..models import User, Event

    funnel = _funnel(days=days)
    cutoff = datetime.utcnow() - timedelta(days=days)
    # 专员效能（与 bi.overview() 中相同逻辑）
    staff_rows = (
        db.session.query(
            User.id, User.name,
            func.count(func.distinct(
                db.case((Event.action == "resume.uploaded", Event.entity_id))
            )).label("resumes"),
            func.count(func.distinct(
                db.case((Event.action == "interview.started", Event.entity_id))
            )).label("screens"),
            func.count(func.distinct(
                db.case((Event.action == "candidate.onboarded", Event.entity_id))
            )).label("onboarded"),
        )
        .outerjoin(Event, (Event.actor_id == User.id) & (Event.ts >= cutoff))
        .filter(User.role == "recruiter")
        .group_by(User.id, User.name)
        .all()
    )
    staff = [{
        "hr_id": hr_id, "name": name,
        "resumes": resumes or 0, "screens": screens or 0,
        "onboarded": onboarded or 0,
        "conversion_rate": round((onboarded or 0) / (resumes or 1) * 100, 1),
    } for hr_id, name, resumes, screens, onboarded in staff_rows]
    return {"days": days, "funnel": funnel, "staff": staff}


def _tool_count_summary(**_) -> Dict[str, Any]:
    """系统概览数字：候选人/岗位/面试总数 + 各流程阶段人数。"""
    stage_rows = (
        db.session.query(PipelineStage.stage, db.func.count(PipelineStage.id))
        .group_by(PipelineStage.stage)
        .all()
    )
    return {
        "candidate_count": Candidate.query.count(),
        "job_count": Job.query.count(),
        "interview_count": Interview.query.count(),
        "stage_counts": {stage: count for stage, count in stage_rows},
    }


# =============================================================================
# 2) 工具注册表：name / description（给模型看）/ params（参数说明）/ execute
# =============================================================================
_TOOL_DEFS: List[Dict[str, Any]] = [
    {
        "name": "list_candidates",
        "description": "查询候选人列表摘要（id、脱敏姓名、技能标签数）。可选参数 limit 限制条数。",
        "params": {"limit": "int，可选，默认20"},
        "execute": _tool_list_candidates,
    },
    {
        "name": "get_candidate",
        "description": "查询单个候选人详情，含全部技能标签及评分。",
        "params": {"candidate_id": "int，必填，候选人ID"},
        "execute": _tool_get_candidate,
    },
    {
        "name": "list_jobs",
        "description": "查询岗位列表（id、标题title、状态status）。可选参数 limit。",
        "params": {"limit": "int，可选，默认20"},
        "execute": _tool_list_jobs,
    },
    {
        "name": "match_candidates_for_job",
        "description": "为指定岗位匹配并排名候选人，返回 score、命中标签 matched_tags、缺失标签 missing_tags。",
        "params": {"job_id": "int，必填，岗位ID"},
        "execute": _tool_match_candidates_for_job,
    },
    {
        "name": "get_pipeline",
        "description": "查询某岗位招聘流程看板，按阶段（pending/ai_screen/interview/offer/onboarded/rejected）统计人数。",
        "params": {"job_id": "int，必填，岗位ID"},
        "execute": _tool_get_pipeline,
    },
    {
        "name": "get_bi_overview",
        "description": "团队BI报表：招聘漏斗各阶段人数+转化率，以及各招聘专员效能。",
        "params": {"days": "int，可选，统计天数，默认30"},
        "execute": _tool_get_bi_overview,
    },
    {
        "name": "count_summary",
        "description": "系统概览数字：候选人总数、岗位总数、面试总数、各流程阶段人数。无参数。",
        "params": {},
        "execute": _tool_count_summary,
    },
]

# 工具名 -> 定义 的快速索引
_TOOL_MAP: Dict[str, Dict[str, Any]] = {t["name"]: t for t in _TOOL_DEFS}

# 对外暴露的工具元信息（仅 name + description + params，供前端展示/system prompt 拼装）
TOOLS: List[Dict[str, Any]] = [
    {"name": t["name"], "description": t["description"], "params": t["params"]}
    for t in _TOOL_DEFS
]


# =============================================================================
# 3) LangGraph State 定义
# =============================================================================
class AgentState(TypedDict, total=False):
    messages: List[Dict[str, str]]      # 用户对话历史（role/content）
    tool_results: List[Dict[str, Any]]  # 已执行工具的结果累积
    iterations: int                     # 已迭代步数
    final: str                          # 决策为 final 时模型给的回答（非流式兜底）
    # 内部传递：当前 agent 节点的决策结果
    _decision: Dict[str, Any]
    # 事件回调：把过程事件推给 run_stream 的消费者
    _events: List[Dict[str, Any]]


# =============================================================================
# 4) ReAct 决策 prompt 构造
# =============================================================================
def _build_tools_desc() -> str:
    """把工具列表拼成给模型看的描述文本。"""
    lines = []
    for t in _TOOL_DEFS:
        params = json.dumps(t["params"], ensure_ascii=False) if t["params"] else "无参数"
        lines.append(f"- {t['name']}: {t['description']} 参数: {params}")
    return "\n".join(lines)


def _build_decision_system_prompt(tool_results: List[Dict[str, Any]]) -> str:
    """构造 ReAct 决策步的 system prompt（要求 JSON 输出）。"""
    tools_desc = _build_tools_desc()
    if tool_results:
        results_text = json.dumps(tool_results, ensure_ascii=False)
    else:
        results_text = "（暂无，尚未调用任何工具）"
    return (
        "你是「智聘·招聘管理系统」的 AI 助手，可以调用工具查询候选人、岗位、匹配、"
        "招聘流程、BI报表等系统数据，帮助 HR 和管理者用自然语言完成查询。\n\n"
        "你采用 ReAct 模式：每一步都必须用 JSON 格式回复，决定下一步动作。\n\n"
        f"可用工具：\n{tools_desc}\n\n"
        f"已获得的工具结果：\n{results_text}\n\n"
        "决策规则：\n"
        "1. 若已有信息足够回答用户问题，输出 action=\"final\"，并在 answer 字段给出简洁的中文回答。\n"
        "2. 若还需要数据，输出 action=\"tool\"，在 tool 字段填工具名，args 字段填参数对象。\n"
        "3. 不要重复调用已经得到结果的同名同参工具。\n\n"
        "你必须只输出一个 JSON 对象（不要带 markdown 代码块），格式如下：\n"
        '{"thought": "你的简短思考", "action": "tool", "tool": "工具名", "args": {"参数名": 值}}\n'
        "或：\n"
        '{"thought": "你的简短思考", "action": "final", "answer": "给用户的中文回答"}\n'
    )


def _safe_parse_json(text: str) -> Dict[str, Any]:
    """容错解析模型输出的 JSON（去除可能的 ```json 包裹）。"""
    s = (text or "").strip()
    if s.startswith("```"):
        # 去掉 ```json ... ``` 包裹
        s = s.strip("`")
        if s.lower().startswith("json"):
            s = s[4:]
        s = s.strip()
    try:
        return json.loads(s)
    except Exception:
        # 尝试截取第一个 { 到最后一个 }
        start, end = s.find("{"), s.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(s[start:end + 1])
            except Exception:
                pass
    return {"action": "final", "answer": s or "抱歉，我暂时无法处理这个请求。"}


# =============================================================================
# 5) RecruitingAgent：构建 LLMClient + 编译 LangGraph
# =============================================================================
class RecruitingAgent:
    def __init__(self) -> None:
        self.client = LLMClient()
        # 决策步用 think（开思考，结构化推理更稳）；最终回答用 pro（高质量流式输出）
        self.decision_route = route_model("think")
        self.answer_route = route_model("pro")
        self.graph = self._build_graph()

    # ----- LangGraph 节点：agent 决策 -----------------------------------------
    def _agent_node(self, state: AgentState) -> AgentState:
        """决策节点：喂对话历史+工具描述+已有工具结果，用 json 模式让模型选动作。"""
        system_prompt = _build_decision_system_prompt(state.get("tool_results", []))
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(state.get("messages", []))

        try:
            raw = self.client.chat_messages(
                messages,
                response_format={"type": "json_object"},
                model=self.decision_route["model"],
                thinking=self.decision_route["thinking"],
            )
            decision = _safe_parse_json(raw)
        except Exception as e:
            logger.exception("决策节点 LLM 调用失败")
            decision = {"action": "final", "answer": f"决策失败：{e}"}

        events = state.setdefault("_events", [])
        thought = decision.get("thought")
        if thought:
            events.append({"type": "thought", "text": thought})

        state["_decision"] = decision
        state["iterations"] = state.get("iterations", 0) + 1
        return state

    # ----- LangGraph 节点：tools 执行 -----------------------------------------
    def _tools_node(self, state: AgentState) -> AgentState:
        """执行节点：根据决策里的 tool+args 调用工具函数，结果存入 state。"""
        decision = state.get("_decision", {})
        tool_name = decision.get("tool")
        args = decision.get("args") or {}
        events = state.setdefault("_events", [])

        events.append({"type": "tool_call", "tool": tool_name, "args": args})

        tool_def = _TOOL_MAP.get(tool_name)
        if not tool_def:
            result: Any = {"error": f"未知工具：{tool_name}"}
        else:
            try:
                result = tool_def["execute"](**args) if isinstance(args, dict) else tool_def["execute"]()
            except Exception as e:
                logger.exception("工具 %s 执行失败", tool_name)
                result = {"error": f"工具执行失败：{e}"}

        events.append({"type": "tool_result", "tool": tool_name, "result": result})
        state.setdefault("tool_results", []).append({
            "tool": tool_name, "args": args, "result": result,
        })
        return state

    # ----- 条件边：决定 agent 之后去哪 ----------------------------------------
    def _route_after_agent(self, state: AgentState) -> str:
        """action=tool 且未超步数 → tools；否则 → END。"""
        decision = state.get("_decision", {})
        if state.get("iterations", 0) >= MAX_ITERATIONS:
            return "end"
        if decision.get("action") == "tool" and decision.get("tool"):
            return "tools"
        return "end"

    # ----- 编译图 -------------------------------------------------------------
    def _build_graph(self):
        sg = StateGraph(AgentState)
        sg.add_node("agent", self._agent_node)
        sg.add_node("tools", self._tools_node)
        sg.add_edge(START, "agent")
        sg.add_conditional_edges(
            "agent",
            self._route_after_agent,
            {"tools": "tools", "end": END},
        )
        sg.add_edge("tools", "agent")  # 工具执行完回到决策节点继续 ReAct
        return sg.compile()

    # ----- 最终答案：用 chat_stream 流式产出 token ----------------------------
    def _stream_final_answer(self, messages: List[Dict[str, str]],
                             tool_results: List[Dict[str, Any]]):
        """生成器：基于工具结果，用 chat_stream 流式生成最终中文答案。

        逐 token yield {"type":"token","text":...}，
        结束时通过 StopIteration.value 返回完整答案文本。
        """
        if tool_results:
            data_text = json.dumps(tool_results, ensure_ascii=False)
        else:
            data_text = "（无工具数据，直接根据常识回答）"
        sys_prompt = (
            "你是「智聘·招聘管理系统」的 AI 助手。下面是为回答用户问题而查询到的系统数据，"
            "请基于这些真实数据，用简洁、专业、友好的中文回答用户。不要编造数据中没有的信息。\n\n"
            f"查询到的数据：\n{data_text}"
        )
        answer_messages = [{"role": "system", "content": sys_prompt}]
        answer_messages.extend(messages)

        full: List[str] = []
        try:
            # pro 路由（开思考），高质量流式输出
            for ev in self.client.chat_stream(
                answer_messages,
                model=self.answer_route["model"],
                thinking=self.answer_route["thinking"],
            ):
                if ev.get("type") == "content":
                    piece = ev.get("text", "")
                    full.append(piece)
                    yield {"type": "token", "text": piece}
                # reasoning 事件不作为答案展示，此处略过
        except Exception as e:
            logger.exception("最终答案流式生成失败")
            msg = f"（生成回答时出错：{e}）"
            full.append(msg)
            yield {"type": "token", "text": msg}
        return "".join(full)

    # ----- 对外接口：流式运行 -------------------------------------------------
    def run_stream(self, user_message: str, history: Optional[List[Dict[str, str]]] = None):
        """
        生成器，yield SSE 事件 dict：
          {"type":"thought","text":...}                  # agent 思考
          {"type":"tool_call","tool":...,"args":...}      # 决定调用工具
          {"type":"tool_result","tool":...,"result":...}  # 工具返回
          {"type":"token","text":...}                     # 最终答案流式 token
          {"type":"done","answer":...}                    # 结束
        """
        messages: List[Dict[str, str]] = list(history or [])
        messages.append({"role": "user", "content": user_message})

        init_state: AgentState = {
            "messages": messages,
            "tool_results": [],
            "iterations": 0,
            "_events": [],
        }

        # 跑 LangGraph：StateGraph 编排 agent<->tools 循环直到 END。
        # stream_mode="values" 逐节点拿到完整状态快照，从而把过程事件实时吐给前端。
        emitted = 0
        final_state: AgentState = init_state
        try:
            for chunk in self.graph.stream(init_state, stream_mode="values"):
                final_state = chunk
                events = chunk.get("_events", [])
                # 把本轮新产生的事件依次 yield 出去（已发送的不重复）
                while emitted < len(events):
                    yield events[emitted]
                    emitted += 1
        except Exception as e:
            logger.exception("LangGraph 执行失败")
            yield {"type": "done", "answer": f"执行出错：{e}"}
            return

        # 最终答案：用 chat_stream 流式产出 token（_stream_final_answer 是子生成器）
        tool_results = final_state.get("tool_results", [])
        answer_text = yield from self._stream_final_answer(messages, tool_results)

        yield {"type": "done", "answer": answer_text}
