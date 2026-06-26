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
import re
import time
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
    AgentCallLog,
)
from .match_service import MatchService  # noqa: E402
from ..api.bi import _funnel, _safe_rate  # 复用 BI 漏斗逻辑（模块级函数）  # noqa: E402
from ..api.access import can_access_candidate, visible_candidate_query  # noqa: E402
from ..time_utils import utc_now  # noqa: E402

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 5  # ReAct 步数上限，防止无限循环


def _scoped_candidate_query(user_id=None, role=None):
    if user_id and role:
        return visible_candidate_query(user_id, role)
    return Candidate.query


def _agent_current_stage_counts(job_id=None, user_id=None, role=None):
    from ..api.pipeline import _latest_stage_subquery, normalize_pipeline_stage

    latest = _latest_stage_subquery(int(job_id) if job_id else None)
    rows = (
        db.session.query(PipelineStage.stage, db.func.count(PipelineStage.id))
        .join(latest, PipelineStage.id == latest.c.max_id)
        .join(Candidate, Candidate.id == PipelineStage.candidate_id)
    )
    if job_id:
        rows = rows.filter(PipelineStage.job_id == int(job_id))
    rows = rows.filter(Candidate.id.in_(
        _scoped_candidate_query(user_id, role).with_entities(Candidate.id)
    ))
    counts = {}
    for stage, count in rows.group_by(PipelineStage.stage).all():
        normalized = normalize_pipeline_stage(stage)
        counts[normalized] = counts.get(normalized, 0) + count
    return counts


# =============================================================================
# 1) 工具实现（每个工具内部查现有 model / service，返回可 JSON 序列化的 dict/list）
# =============================================================================
def _tool_list_candidates(limit: int = 20, **_) -> Dict[str, Any]:
    """候选人列表摘要。"""
    try:
        limit = int(limit) if limit else 20
    except (TypeError, ValueError):
        limit = 20
    user_id = _.get("_user_id")
    role = _.get("_role")
    rows = _scoped_candidate_query(user_id, role).order_by(Candidate.id).limit(limit).all()
    items = [{
        "id": c.id,
        "name_masked": c.name_masked,
        "tag_count": len(c.tags),
    } for c in rows]
    return {"count": len(items), "candidates": items}


def _tool_get_candidate(candidate_id: int, **_) -> Dict[str, Any]:
    """单个候选人详情，含技能标签。"""
    user_id = _.get("_user_id")
    role = _.get("_role")
    if user_id and role and not can_access_candidate(user_id, role, int(candidate_id)):
        return {"error": "Forbidden"}
    c = db.session.get(Candidate, int(candidate_id))
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
    """给某岗位匹配候选人排名（计算匹配分，不持久化）。"""
    job = db.session.get(Job, int(job_id))
    if not job:
        return {"error": f"岗位 {job_id} 不存在"}
    # 使用纯计算模式（不写入 DB），rank_for_job(..., persist=False)
    from .match_service import MatchService as MS
    ranked = MS().rank_for_job_readonly(
        int(job_id),
        top_n=10,
        candidate_query=_scoped_candidate_query(_.get("_user_id"), _.get("_role")),
    )
    return {"job_id": int(job_id), "job_title": job.title, "ranking": ranked}


def _tool_get_pipeline(job_id: int, **_) -> Dict[str, Any]:
    """某岗位招聘流程看板：按 stage 分组计数。"""
    by_stage = _agent_current_stage_counts(
        job_id=job_id,
        user_id=_.get("_user_id"),
        role=_.get("_role"),
    )
    return {"job_id": int(job_id), "pipeline": by_stage}


def _tool_get_bi_overview(days: int = 30, **_) -> Dict[str, Any]:
    """团队 BI 报表：招聘漏斗（复用 _funnel）+ 专员效能。"""
    role = _.get("_role")
    if role not in ("manager", "admin"):
        return {
            "error": "Forbidden",
            "message": "团队 BI 仅经理和管理员可查看；招聘专员请查看工作台里的个人指标或自己的候选人流程。",
        }
    try:
        days = int(days) if days else 30
    except (TypeError, ValueError):
        days = 30
    from datetime import timedelta
    from sqlalchemy import func
    from ..models import User, Event

    funnel = _funnel(days=days)
    cutoff = utc_now() - timedelta(days=days)
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
        .filter(User.role == "recruiter", User.is_active.is_(True))
        .group_by(User.id, User.name)
        .all()
    )
    staff = [{
        "hr_id": hr_id, "name": name,
        "resumes": resumes or 0, "screens": screens or 0,
        "onboarded": onboarded or 0,
        "conversion_rate": _safe_rate(onboarded or 0, resumes or 0),
    } for hr_id, name, resumes, screens, onboarded in staff_rows]
    return {"days": days, "funnel": funnel, "staff": staff}


def _tool_count_summary(**_) -> Dict[str, Any]:
    """系统概览数字：候选人/岗位/面试总数 + 各流程阶段人数。"""
    scoped_candidates = _scoped_candidate_query(_.get("_user_id"), _.get("_role"))
    return {
        "candidate_count": scoped_candidates.count(),
        "job_count": Job.query.count(),
        "interview_count": Interview.query.count(),
        "stage_counts": _agent_current_stage_counts(
            user_id=_.get("_user_id"),
            role=_.get("_role"),
        ),
    }


def _is_search_quota_or_credential_leak(text: str) -> bool:
    """Detect non-search responses that expose credentials or setup prompts."""
    if not text:
        return False
    low = text.lower()
    signals = (
        "quota_exhausted",
        "quota is exhausted",
        "daily_free_quota",
        "recharge",
        "api key:",
        "api_key:",
        "apikey",
        "password:",
        "username:",
        "console:",
        "registration_status",
        "add the api key",
        "mcp config",
    )
    return any(signal in low for signal in signals)


_CRED_PATTERNS = [
    re.compile(r"\b(?:as_sk|sk|pk|api|key|token)[-_][A-Za-z0-9]{12,}\b", re.I),
    re.compile(r"(?im)^\s*(?:api[_ ]?key|username|password|console)\s*[:=].*$"),
]


def _sanitize_search_text(text: str) -> str:
    """Redact credential-looking content before search output reaches AI/UI."""
    if not text:
        return text
    cleaned = text
    for pattern in _CRED_PATTERNS:
        cleaned = pattern.sub("[已脱敏]", cleaned)
    return cleaned


def _sanitize_search_payload(payload: Any) -> Any:
    """Recursively redact credential-looking strings in structured search output."""
    if isinstance(payload, str):
        return _sanitize_search_text(payload)
    if isinstance(payload, list):
        return [_sanitize_search_payload(item) for item in payload]
    if isinstance(payload, dict):
        return {key: _sanitize_search_payload(value) for key, value in payload.items()}
    return payload


def _tool_web_search(query: str = "", max_results: int = 5, **_) -> Dict[str, Any]:
    """联网搜索：调用 anysearch CLI 获取实时网络信息（薪资行情/技能趋势/公司背景等）。

    通过 subprocess 调 anysearch_cli.py，匿名访问无需 Key。CLI 路径可用环境变量
    ANYSEARCH_CLI 覆盖；默认指向用户 .claude/skills/anysearch。网络不通时返回明确提示。
    """
    import os
    import subprocess
    import shlex

    query = (query or "").strip()
    if not query:
        return {"error": "搜索关键词不能为空"}
    try:
        max_results = max(1, min(int(max_results or 5), 10))
    except (TypeError, ValueError):
        max_results = 5

    # CLI 路径：env 覆盖 > 默认用户目录
    cli = os.getenv("ANYSEARCH_CLI")
    if not cli:
        default_cli = Path(os.path.expanduser("~")) / ".claude" / "skills" / "anysearch" / "scripts" / "anysearch_cli.py"
        cli = str(default_cli)
    if not Path(cli).exists():
        return {"error": "联网搜索未配置（anysearch CLI 不存在），请设置 ANYSEARCH_CLI 环境变量"}

    cmd = [sys.executable, cli, "search", query, "--max_results", str(max_results)]
    try:
        env = dict(os.environ, PYTHONIOENCODING="utf-8")
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=45, env=env,
            encoding="utf-8", errors="ignore",
        )
        out = (proc.stdout or "").strip()
        err = (proc.stderr or "").strip()
        if not out:
            msg = err or "无输出"
            if "Connection" in msg or "Timeout" in msg or "timed out" in msg:
                return {"error": "联网搜索服务暂时不可达（网络问题），请稍后重试"}
            return {"error": f"搜索失败：{_sanitize_search_text(msg)[:200]}"}
        if _is_search_quota_or_credential_leak(out):
            return {"error": "联网搜索服务当前不可用（额度已用尽或需重新配置），请稍后重试或改用系统内数据回答"}
        # CLI 可能返回 JSON 或 Markdown；尝试 JSON，失败则原样返回文本
        try:
            parsed = json.loads(out)
            return {"query": query, "results": _sanitize_search_payload(parsed)}
        except Exception:
            return {"query": query, "results_text": _sanitize_search_text(out)[:4000]}
    except subprocess.TimeoutExpired:
        return {"error": "联网搜索超时（45s），请稍后重试"}
    except Exception as e:
        logger.exception("web_search 失败")
        return {"error": f"联网搜索执行失败：{e}"}


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
        "description": "团队BI报表（仅经理/管理员）：招聘漏斗各阶段人数+转化率，以及各招聘专员效能。",
        "params": {"days": "int，可选，统计天数，默认30"},
        "execute": _tool_get_bi_overview,
    },
    {
        "name": "count_summary",
        "description": "系统概览数字：候选人总数、岗位总数、面试总数、各流程阶段人数。无参数。",
        "params": {},
        "execute": _tool_count_summary,
    },
    {
        "name": "web_search",
        "description": "联网搜索实时网络信息（如市场薪资行情、技能趋势、公司背景、行业动态等系统内查不到的外部信息）。当用户问题需要系统数据库之外的最新信息时使用。",
        "params": {"query": "str，必填，搜索关键词", "max_results": "int，可选，结果条数1-10，默认5"},
        "execute": _tool_web_search,
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
# 2b) 写操作工具：AI 只「提议」，经用户确认后由 /api/agent/execute 在请求上下文内执行
# =============================================================================
def _write_create_job(title: str = "", jd_text: str = "", actor_id: int = None, **_) -> Dict[str, Any]:
    """创建岗位：LLM 结构化 JD 后落库。"""
    from ..api.jobs import _extract_jd_structured
    if not title or not jd_text:
        return {"error": "缺少岗位名称或 JD 描述"}
    llm = LLMClient()
    structured = _extract_jd_structured(llm, jd_text)
    job = Job(title=title, jd_text=jd_text, jd_structured=structured, owner_hr_id=actor_id)
    db.session.add(job)
    db.session.flush()  # 先 flush 确保 job.id 可用，但不 commit
    from ..middleware.events import record_event
    record_event("job.created", entity_id=job.id, entity_type="job")
    db.session.commit()  # 原子提交：job + event 一起成功或一起回滚
    return {"job_id": job.id, "title": job.title, "structured": structured}


def _write_move_pipeline(candidate_id: int = None, job_id: int = None,
                         stage: str = "", actor_id: int = None,
                         actor_role: str = None, **_) -> Dict[str, Any]:
    """推进候选人到指定招聘流程阶段。"""
    from ..models import VALID_STAGES
    from ..middleware.events import record_event
    from ..api.pipeline import PIPELINE_STAGE_ORDER, normalize_pipeline_stage
    if not candidate_id or not job_id or not stage:
        return {"error": "缺少 candidate_id / job_id / stage"}
    if stage not in VALID_STAGES:
        return {"error": f"无效阶段，可选: {PIPELINE_STAGE_ORDER}"}
    stage = normalize_pipeline_stage(stage)
    if not db.session.get(Candidate, int(candidate_id)):
        return {"error": f"候选人 {candidate_id} 不存在"}
    if not db.session.get(Job, int(job_id)):
        return {"error": f"岗位 {job_id} 不存在"}
    if not can_access_candidate(actor_id, actor_role, int(candidate_id), int(job_id)):
        return {"error": "Forbidden"}
    ps = PipelineStage(candidate_id=int(candidate_id), job_id=int(job_id),
                       stage=stage, updated_by=actor_id)
    db.session.add(ps)
    db.session.commit()
    record_event("pipeline.moved", entity_id=int(candidate_id), entity_type="candidate",
                 payload={"job_id": int(job_id), "to": stage})
    if stage == "onboarded":
        record_event("candidate.onboarded", entity_id=int(candidate_id),
                     entity_type="candidate", payload={"job_id": int(job_id)})
    return {"candidate_id": int(candidate_id), "job_id": int(job_id), "stage": stage, "status": "ok"}


def _write_start_interview(candidate_id: int = None, job_id: int = None,
                           count: int = 5, actor_id: int = None,
                           actor_role: str = None, **_) -> Dict[str, Any]:
    """为候选人发起 AI 面试，生成面试题。"""
    from ..services.interview_service import PreScreenService
    from ..middleware.events import record_event
    if not candidate_id or not job_id:
        return {"error": "缺少 candidate_id / job_id"}
    job = db.session.get(Job, int(job_id))
    if not job:
        return {"error": f"岗位 {job_id} 不存在"}
    if not db.session.get(Candidate, int(candidate_id)):
        return {"error": f"候选人 {candidate_id} 不存在"}
    if not can_access_candidate(actor_id, actor_role, int(candidate_id), int(job_id)):
        return {"error": "Forbidden"}
    try:
        count = int(count) if count else 5
    except (TypeError, ValueError):
        count = 5
    questions = PreScreenService().generate_questions(job.jd_text, count=count)
    record_event("interview.started", entity_id=int(candidate_id), entity_type="candidate",
                 payload={"job_id": int(job_id), "actor_id": actor_id})
    return {"candidate_id": int(candidate_id), "job_id": int(job_id), "questions": questions}


def _write_run_match(job_id: int = None, actor_id: int = None,
                     actor_role: str = None, **_) -> Dict[str, Any]:
    """为岗位运行候选人匹配并持久化结果。"""
    from ..middleware.events import record_event
    if not job_id:
        return {"error": "缺少 job_id"}
    job = db.session.get(Job, int(job_id))
    if not job:
        return {"error": f"岗位 {job_id} 不存在"}
    ranked = MatchService().rank_for_job(
        int(job_id),
        top_n=10,
        candidate_query=_scoped_candidate_query(actor_id, actor_role),
    )
    record_event("match.run", entity_id=int(job_id), entity_type="job",
                 payload={"count": len(ranked)})
    return {"job_id": int(job_id), "job_title": job.title, "ranking": ranked}


# 写工具注册表：name / description / params / rbac(允许角色) / execute / summary(确认文案模板)
_WRITE_TOOL_DEFS: List[Dict[str, Any]] = [
    {
        "name": "create_job",
        "description": "创建一个新岗位。根据用户的自然语言描述，AI 会自动结构化 JD 并提取技能要求。",
        "params": {"title": "str，必填，岗位名称", "jd_text": "str，必填，岗位描述/JD 原文"},
        "rbac": ("recruiter", "manager", "admin"),
        "execute": _write_create_job,
        "summary": lambda a: f"创建岗位「{a.get('title', '?')}」",
    },
    {
        "name": "move_pipeline",
        "description": "把候选人推进到指定招聘流程阶段（pending/ai_screen/interview/offer/onboarded/rejected）。",
        "params": {"candidate_id": "int，必填", "job_id": "int，必填", "stage": "str，必填，目标阶段"},
        "rbac": ("recruiter", "manager", "admin", "interviewer"),
        "execute": _write_move_pipeline,
        "summary": lambda a: f"将候选人 #{a.get('candidate_id', '?')} 在岗位 #{a.get('job_id', '?')} 推进到「{a.get('stage', '?')}」阶段",
    },
    {
        "name": "start_interview",
        "description": "为候选人针对某岗位发起 AI 面试，生成面试题目。",
        "params": {"candidate_id": "int，必填", "job_id": "int，必填", "count": "int，可选，题目数，默认5"},
        "rbac": ("recruiter", "manager", "admin"),
        "execute": _write_start_interview,
        "summary": lambda a: f"为候选人 #{a.get('candidate_id', '?')} 发起岗位 #{a.get('job_id', '?')} 的 AI 面试",
    },
    {
        "name": "run_match",
        "description": "为指定岗位运行候选人智能匹配，计算排名并持久化匹配结果。",
        "params": {"job_id": "int，必填，岗位ID"},
        "rbac": ("recruiter", "manager", "admin"),
        "execute": _write_run_match,
        "summary": lambda a: f"为岗位 #{a.get('job_id', '?')} 运行候选人匹配",
    },
]

_WRITE_TOOL_MAP: Dict[str, Dict[str, Any]] = {t["name"]: t for t in _WRITE_TOOL_DEFS}

# 写工具元信息（供前端展示 + system prompt）
WRITE_TOOLS: List[Dict[str, Any]] = [
    {"name": t["name"], "description": t["description"], "params": t["params"],
     "rbac": list(t["rbac"]), "write": True}
    for t in _WRITE_TOOL_DEFS
]


def get_agent_architecture_dashboard() -> Dict[str, Any]:
    """Admin-facing read-only description of the AI assistant prompt and powers."""
    return {
        "title": "AI 提示词与后端架构看板",
        "purpose": "给管理员查看 AI 助手的系统提示词、可调用工具、写操作边界与后端接入方式。",
        "system_prompt": _build_decision_system_prompt([]),
        "read_tools": TOOLS,
        "write_tools": WRITE_TOOLS,
        "architecture": [
            {
                "name": "前端 AI 助手页",
                "description": "展示对话、思考过程、工具调用结果；遇到写操作时展示确认卡片。",
                "files": ["frontend/src/pages/AgentPage.tsx", "frontend/src/lib/agent.ts"],
            },
            {
                "name": "后端智能体入口",
                "description": "提供工具列表、流式对话、用户确认后的写操作执行接口。",
                "files": ["backend/app/api/agent.py"],
            },
            {
                "name": "智能体编排与工具",
                "description": "用 ReAct 流程决定调用查询工具、提议写操作，工具内部通过 SQLAlchemy 访问招聘数据库。",
                "files": ["backend/app/services/agent_service.py"],
            },
            {
                "name": "数据库层",
                "description": "AI 助手不直接写 SQL，而是通过固定工具读取 Candidate、Job、Interview、PipelineStage 等模型。",
                "files": ["backend/app/models.py"],
            },
        ],
        "permission_model": {
            "database_access": True,
            "read_tools_available_to_authenticated_users": False,
            "read_scope_note": (
                "AI 助手后端入口仅允许招聘专员、经理和管理员访问；"
                "面试官即使直接请求 /api/agent/* 也会返回 403。"
                "查询工具继续按当前登录用户角色与候选人归属过滤；"
                "团队 BI 工具只允许经理和管理员使用，招聘专员不能通过 AI 助手绕过 BI 页面权限。"
            ),
            "write_requires_confirmation": True,
            "write_scope_note": (
                "AI 只能提议写操作；用户点击确认后，/api/agent/execute 再按写工具 RBAC 执行。"
            ),
            "cannot_do": [
                "不能修改代码或前端页面",
                "不能修改数据库表结构",
                "不能管理用户账号",
                "不能删除候选人、岗位或面试记录",
                "不能执行未注册的任意后端函数",
            ],
        },
        "safeguards": [
            "AI 助手入口需要登录 token，并限制为招聘专员、经理、管理员",
            "写操作先生成确认卡片，用户确认后才执行",
            "写工具有角色白名单",
            "ReAct 最多迭代 5 步，避免无限循环调用工具",
            "所有工具固定注册，AI 不能临时创造新工具",
        ],
        "recommended_next_steps": [
            "把管理员看板标注为只读审计页",
            "给 AI 助手查询行为增加审计日志",
            "如未来开放给面试官，单独做只看已分配候选人的面试官专用 AI 助手",
        ],
    }


def execute_write_tool(
    name: str,
    args: Dict[str, Any],
    user_id: int,
    role: str,
    conversation_id: Optional[int] = None,
) -> Dict[str, Any]:
    """在请求上下文内执行写工具（供 /api/agent/execute 调用）。做 RBAC 校验。
    执行后写一条 AgentCallLog(kind=tool_write) 用于审计。"""
    t0 = time.time()
    tool = _WRITE_TOOL_MAP.get(name)
    if not tool:
        _log_tool_write(conversation_id, user_id, role, name, args, None,
                        t0, status="error", error_msg=f"未知写工具：{name}")
        return {"ok": False, "error": f"未知写工具：{name}"}
    if role not in tool["rbac"]:
        _log_tool_write(conversation_id, user_id, role, name, args, None,
                        t0, status="error",
                        error_msg=f"当前角色「{role}」无权执行此操作")
        return {"ok": False, "error": f"当前角色「{role}」无权执行此操作"}
    try:
        clean_args = dict(args or {})
        clean_args["actor_id"] = user_id
        clean_args["actor_role"] = role
        result = tool["execute"](**clean_args)
        if isinstance(result, dict) and result.get("error"):
            _log_tool_write(conversation_id, user_id, role, name, args, result,
                            t0, status="error", error_msg=result["error"])
            return {"ok": False, "error": result["error"]}
        _log_tool_write(conversation_id, user_id, role, name, args, result, t0, status="ok")
        return {"ok": True, "result": result}
    except Exception as e:
        logger.exception("写工具 %s 执行失败", name)
        _log_tool_write(conversation_id, user_id, role, name, args, None,
                        t0, status="error", error_msg=f"执行失败：{e}")
        return {"ok": False, "error": f"执行失败：{e}"}


def _log_tool_write(
    conversation_id: Optional[int],
    user_id: int,
    role: str,
    tool_name: str,
    args: Dict[str, Any],
    result: Any,
    t0: float,
    status: str,
    error_msg: Optional[str] = None,
) -> None:
    """写一条 tool_write 级 AI 调用日志。失败只记日志，不阻断主流程。"""
    try:
        # 入参/结果序列化为可读文本（截断防过大）
        input_text = json.dumps({"tool": tool_name, "args": args}, ensure_ascii=False, default=str)
        output_text = json.dumps(result, ensure_ascii=False, default=str) if result is not None else None
        db.session.add(AgentCallLog(
            conversation_id=conversation_id,
            user_id=user_id,
            role=role,
            kind="tool_write",
            input_text=input_text[:8000],
            output_text=output_text[:8000] if output_text else None,
            tool_calls=[{"name": tool_name, "args": args}],
            duration_ms=int((time.time() - t0) * 1000),
            status=status,
            error_msg=error_msg,
        ))
        db.session.commit()
    except Exception as log_err:
        db.session.rollback()
        logger.error("写入 tool_write AgentCallLog 失败: %s", log_err)


# =============================================================================
# 3) LangGraph State 定义
# =============================================================================
class AgentState(TypedDict, total=False):
    messages: List[Dict[str, str]]      # 用户对话历史（role/content）
    tool_results: List[Dict[str, Any]]  # 已执行工具的结果累积
    iterations: int                     # 已迭代步数
    user_id: int
    role: str
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


def _build_write_tools_desc() -> str:
    """把写操作工具拼成给模型看的描述文本。"""
    lines = []
    for t in _WRITE_TOOL_DEFS:
        params = json.dumps(t["params"], ensure_ascii=False) if t["params"] else "无参数"
        lines.append(f"- {t['name']}: {t['description']} 参数: {params}")
    return "\n".join(lines)


def _build_decision_system_prompt(tool_results: List[Dict[str, Any]]) -> str:
    """构造 ReAct 决策步的 system prompt（要求 JSON 输出）。"""
    tools_desc = _build_tools_desc()
    write_desc = _build_write_tools_desc()
    if tool_results:
        results_text = json.dumps(tool_results, ensure_ascii=False)
    else:
        results_text = "（暂无，尚未调用任何工具）"
    return (
        "你是「智聘·招聘管理系统」的 AI 助手，既能查询数据，也能执行招聘操作，"
        "帮助 HR 和管理者用自然语言完成工作。\n\n"
        "你采用 ReAct 模式：每一步都必须用 JSON 格式回复，决定下一步动作。\n\n"
        f"【查询工具】（只读，可直接调用）：\n{tools_desc}\n\n"
        f"【写操作工具】（会修改系统数据，必须经用户确认后才执行，你只能「提议」）：\n{write_desc}\n\n"
        f"已获得的工具结果：\n{results_text}\n\n"
        "决策规则：\n"
        "1. 若需要查询数据，输出 action=\"tool\"，tool 填查询工具名，args 填参数。\n"
        "2. 若用户意图是执行写操作（创建岗位、推进流程、发起面试、运行匹配），"
        "先用查询工具确认必要的 ID 等信息，然后输出 action=\"propose_write\"，"
        "在 tool 字段填写操作工具名，args 字段填完整参数对象。系统会向用户展示确认卡片，"
        "用户确认后才真正执行——你不要假装已经执行成功。\n"
        "3. 若信息足够直接回答（或写操作已提议），输出 action=\"final\"，answer 给简洁中文回答。\n"
        "4. 不要重复调用已得到结果的同名同参工具。\n\n"
        "你必须只输出一个 JSON 对象（不要带 markdown 代码块），格式之一：\n"
        '{"thought": "思考", "action": "tool", "tool": "查询工具名", "args": {...}}\n'
        '{"thought": "思考", "action": "propose_write", "tool": "写工具名", "args": {...}}\n'
        '{"thought": "思考", "action": "final", "answer": "中文回答"}\n'
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

        # 写操作：AI 只「提议」，发确认事件并结束循环，由前端确认后调 /agent/execute 执行
        if decision.get("action") == "propose_write":
            wt_name = decision.get("tool")
            wt_args = decision.get("args") or {}
            wt_def = _WRITE_TOOL_MAP.get(wt_name)
            if wt_def:
                try:
                    summary = wt_def["summary"](wt_args)
                except Exception:
                    summary = f"执行 {wt_name}"
                events.append({
                    "type": "confirm_required",
                    "tool": wt_name,
                    "args": wt_args,
                    "summary": summary,
                })
            else:
                # 未知写工具，降级为普通回答
                decision = {"action": "final",
                            "answer": f"抱歉，我不能执行未知操作「{wt_name}」。"}

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
                if isinstance(args, dict):
                    clean_args = dict(args)
                    clean_args["_user_id"] = state.get("user_id")
                    clean_args["_role"] = state.get("role")
                    result = tool_def["execute"](**clean_args)
                else:
                    result = tool_def["execute"]()
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
    def run_stream(
        self,
        user_message: str,
        history: Optional[List[Dict[str, str]]] = None,
        user_id: Optional[int] = None,
        role: Optional[str] = None,
    ):
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
            "user_id": user_id,
            "role": role,
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

        # 把本次最终答案步的调用日志快照进 done 事件，供 agent.py 落库。
        # 用快照而非后续读 self.client.last_call_log，避免单例 client 在并发请求下被覆盖串号。
        done_event: Dict[str, Any] = {"type": "done", "answer": answer_text}
        try:
            if getattr(self.client, "last_call_log", None):
                done_event["_call_log"] = dict(self.client.last_call_log)
        except Exception:
            pass
        yield done_event
