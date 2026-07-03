import sys
from pathlib import Path
from flask import Blueprint, request, jsonify, g
from ..middleware.auth import require_auth, require_role
from ..middleware.events import record_event
from ..services.match_service import MatchService
from .. import db
from ..models import Candidate, Job
from .access import assigned_job_ids_for_interviewer, can_manage_job, visible_candidate_query

BASE_AGENT_DIR = Path(__file__).resolve().parent.parent.parent.parent / "base_agent"
if str(BASE_AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_AGENT_DIR))

bp = Blueprint("jobs", __name__)

# JD 结构化提取：要求更完整的画像字段，提升解析准确性
JD_EXTRACT_SYS = (
    "你是一位资深招聘专家。请从岗位描述(JD)中提取结构化招聘画像，严格返回 JSON：\n"
    "{\n"
    '  "title_normalized": "规范化岗位名称",\n'
    '  "seniority": "职级，如 初级/中级/高级/专家/管理",\n'
    '  "education": "最低学历要求，如 本科/硕士/不限",\n'
    '  "major": "专业要求，无则填 不限",\n'
    '  "years_experience": "经验年限要求，如 3-5年/不限",\n'
    '  "must_have_skills": ["硬性技能1", "硬性技能2"],\n'
    '  "nice_to_have_skills": ["加分技能1"],\n'
    '  "responsibilities": ["职责1", "职责2"],\n'
    '  "skill_tags_raw": "技能1 , 4 , AI|技能2 , 3 , BE"\n'
    "}\n"
    "规则：只依据 JD 原文提取，不要臆造；JD 未提及的字段填 \"不限\" 或空数组；"
    "skill_tags_raw 中分数为该技能重要度(1-5)。只返回 JSON，不含任何其他文字。"
)

# JD 澄清追问：找出 JD 中缺失/模糊、会影响匹配与出题的关键信息
JD_CLARIFY_SYS = (
    "你是一位资深招聘顾问。请审阅岗位名称与 JD，找出其中【缺失或模糊、且会显著影响"
    "候选人匹配与面试出题】的关键信息，生成最多 4 条澄清追问。"
    "严格返回 JSON：{\"questions\":[{\"field\":\"字段标识\",\"question\":\"向 HR 提出的中文追问\","
    "\"placeholder\":\"输入示例\"}]}。"
    "只针对真正缺失的信息提问（如未写明的学历、经验年限、核心技术栈、团队规模、汇报对象等）；"
    "若 JD 已足够完整，返回 {\"questions\":[]}。只返回 JSON，不含其他文字。"
)


def _extract_jd_structured(llm, jd_text):
    """调用 LLM 提取 JD 结构化画像；失败返回空 dict。"""
    import json as _json
    import re
    try:
        if llm is None:
            from llm_client import LLMClient
            llm = LLMClient()
        raw = llm.chat(JD_EXTRACT_SYS, jd_text[:4000])
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        return _json.loads(m.group()) if m else {}
    except Exception:
        return {}


def _clean_optional(value, max_len):
    if value is None:
        return ""
    return str(value).strip()[:max_len]


def _job_list_payload(job):
    return {
        "id": job.id,
        "title": job.title,
        "city": job.city or "",
        "department": job.department or "",
        "job_code": job.job_code or "",
        "status": job.status or "active",
        "created_at": job.created_at.isoformat(),
    }


def _job_detail_payload(job):
    payload = _job_list_payload(job)
    payload.update({
        "jd_text": job.jd_text,
        "structured": job.jd_structured or {},
        "status": job.status,
        "owner_hr_id": job.owner_hr_id,
    })
    return payload


@bp.post("/jobs/clarify")
@require_auth
def clarify_job():
    """JD 澄清追问：返回 AI 针对 JD 缺失信息生成的追问列表。不落库。"""
    data = request.get_json() or {}
    jd_text = (data.get("jd_text") or "").strip()
    title = (data.get("title") or "").strip()
    if not jd_text:
        return jsonify({"error": "jd_text required"}), 400

    import json as _json
    import re
    from llm_client import LLMClient
    llm = LLMClient()
    user_prompt = f"岗位名称：{title or '(未填写)'}\n\nJD 原文：\n{jd_text[:4000]}"
    try:
        raw = llm.chat(JD_CLARIFY_SYS, user_prompt)
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        parsed = _json.loads(m.group()) if m else {}
        questions = parsed.get("questions", [])
        if not isinstance(questions, list):
            questions = []
        # 防御：限制数量与字段
        clean = []
        for q in questions[:4]:
            if isinstance(q, dict) and q.get("question"):
                clean.append({
                    "field": str(q.get("field", ""))[:60],
                    "question": str(q["question"])[:300],
                    "placeholder": str(q.get("placeholder", ""))[:120],
                })
        return jsonify({"questions": clean})
    except Exception as e:
        # 澄清失败不应阻塞流程：返回空追问，前端可直接保存
        return jsonify({"questions": [], "warning": f"澄清生成失败：{e}"}), 200


@bp.post("/jobs")
@require_auth
@require_role("recruiter", "manager", "admin")
def create_job():
    data = request.get_json()
    if not data or not data.get("title") or not data.get("jd_text"):
        return jsonify({"error": "title and jd_text required"}), 400

    # 若前端带来了澄清问答，拼接进 JD 文本，让提取更准确
    jd_text = data["jd_text"]
    clarifications = data.get("clarifications") or []
    if isinstance(clarifications, list) and clarifications:
        extra = "\n".join(
            f"补充说明 - {c.get('question', '')}: {c.get('answer', '')}"
            for c in clarifications
            if isinstance(c, dict) and c.get("answer")
        )
        if extra:
            jd_text = f"{jd_text}\n\n【HR 澄清补充】\n{extra}"

    structured = _extract_jd_structured(None, jd_text)

    job = Job(
        title=data["title"],
        city=_clean_optional(data.get("city"), 80),
        department=_clean_optional(data.get("department"), 120),
        job_code=_clean_optional(data.get("job_code"), 80),
        jd_text=jd_text,
        jd_structured=structured,
        owner_hr_id=g.user_id,
    )
    db.session.add(job)
    db.session.commit()
    record_event("job.created", entity_id=job.id, entity_type="job")
    return jsonify({
        "id": job.id,
        "title": job.title,
        "city": job.city or "",
        "department": job.department or "",
        "job_code": job.job_code or "",
        "status": job.status or "active",
        "structured": structured,
    }), 201


@bp.get("/jobs")
@require_auth
def list_jobs():
    status = (request.args.get("status") or "active").strip().lower()
    if status not in {"active", "closed", "all"}:
        return jsonify({"error": "Invalid status. Valid: active, closed, all"}), 400
    q = Job.query
    if status != "all":
        q = q.filter_by(status=status)
    if g.role == "interviewer":
        assigned_ids = assigned_job_ids_for_interviewer(g.user_id)
        q = q.filter(Job.id.in_(assigned_ids or [-1]))
    jobs = q.all()
    return jsonify([_job_list_payload(j) for j in jobs])


@bp.get("/jobs/<int:job_id>")
@require_auth
def get_job(job_id):
    """单个岗位详情，含结构化 JD。"""
    job = db.get_or_404(Job, job_id)
    if g.role == "interviewer" and job.id not in assigned_job_ids_for_interviewer(g.user_id):
        return jsonify({"error": "Forbidden"}), 403
    return jsonify(_job_detail_payload(job))


def _can_manage_job(job):
    """岗位归属校验：owner 本人，或 manager/admin。"""
    return can_manage_job(g.user_id, g.role, job)


@bp.put("/jobs/<int:job_id>")
@require_auth
def update_job(job_id):
    """编辑岗位：改基础信息 / JD（jd_text 变化时重新结构化）。"""
    job = db.get_or_404(Job, job_id)
    if not _can_manage_job(job):
        return jsonify({"error": "无权编辑该岗位"}), 403
    data = request.get_json() or {}
    title = data.get("title")
    jd_text = data.get("jd_text")
    if title is not None:
        title = str(title).strip()
        if not title:
            return jsonify({"error": "岗位名称不能为空"}), 400
        job.title = title
    if jd_text is not None:
        jd_text = str(jd_text).strip()
        if not jd_text:
            return jsonify({"error": "JD 不能为空"}), 400
        job.jd_text = jd_text
        # JD 变了，重新结构化
        job.jd_structured = _extract_jd_structured(None, jd_text)
    if "city" in data:
        job.city = _clean_optional(data.get("city"), 80)
    if "department" in data:
        job.department = _clean_optional(data.get("department"), 120)
    if "job_code" in data:
        job.job_code = _clean_optional(data.get("job_code"), 80)
    db.session.commit()
    record_event("job.updated", entity_id=job.id, entity_type="job")
    return jsonify(_job_detail_payload(job))


@bp.post("/jobs/<int:job_id>/close")
@require_auth
def close_job(job_id):
    """关闭/下线岗位（status=closed），不物理删除以保留历史与 BI 关联。"""
    job = db.get_or_404(Job, job_id)
    if not _can_manage_job(job):
        return jsonify({"error": "无权关闭该岗位"}), 403
    job.status = "closed"
    db.session.commit()
    record_event("job.closed", entity_id=job.id, entity_type="job")
    return jsonify({"id": job.id, "status": job.status})


@bp.post("/jobs/<int:job_id>/restore")
@require_auth
def restore_job(job_id):
    """恢复已关闭岗位（status=active），用于修正误关闭或继续招聘。"""
    job = db.get_or_404(Job, job_id)
    if not _can_manage_job(job):
        return jsonify({"error": "无权恢复该岗位"}), 403
    job.status = "active"
    db.session.commit()
    record_event("job.restored", entity_id=job.id, entity_type="job")
    return jsonify({"id": job.id, "status": job.status})


@bp.post("/jobs/<int:job_id>/match")
@require_auth
def match_job(job_id):
    if g.role not in ("recruiter", "manager", "admin"):
        return jsonify({"error": "Forbidden"}), 403
    job = db.get_or_404(Job, job_id)
    if not can_manage_job(g.user_id, g.role, job):
        return jsonify({"error": "Forbidden"}), 403
    svc = MatchService()
    results = svc.rank_for_job(
        job_id,
        candidate_query=visible_candidate_query(g.user_id, g.role),
    )
    record_event("match.run", entity_id=job_id, entity_type="job", payload={"count": len(results)})
    return jsonify({"job_id": job_id, "results": results})


@bp.get("/jobs/<int:job_id>/match-preview")
@require_auth
def match_job_preview(job_id):
    if g.role not in ("recruiter", "manager", "admin"):
        return jsonify({"error": "Forbidden"}), 403
    job = db.get_or_404(Job, job_id)
    if not can_manage_job(g.user_id, g.role, job):
        return jsonify({"error": "Forbidden"}), 403

    candidate_ids = []
    raw_ids = (request.args.get("candidate_ids") or "").strip()
    if raw_ids:
        try:
            candidate_ids = [
                int(item)
                for item in raw_ids.split(",")
                if item.strip()
            ]
        except ValueError:
            return jsonify({"error": "candidate_ids must be comma-separated integers"}), 400

    candidate_query = visible_candidate_query(g.user_id, g.role)
    if candidate_ids:
        candidate_query = candidate_query.filter(Candidate.id.in_(candidate_ids))

    svc = MatchService()
    results = svc.rank_for_job_readonly(
        job_id,
        top_n=max(len(candidate_ids), 20),
        candidate_query=candidate_query,
    )
    return jsonify({"job_id": job_id, "results": results})


@bp.post("/jobs/<int:job_id>/batch-pipeline")
@require_auth
def batch_add_to_pipeline(job_id):
    if g.role not in ("recruiter", "manager", "admin"):
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json() or {}
    raw_ids = data.get("candidate_ids")
    if not isinstance(raw_ids, list) or len(raw_ids) == 0:
        return jsonify({"error": "candidate_ids required"}), 400

    job = db.get_or_404(Job, job_id)
    if not can_manage_job(g.user_id, g.role, job):
        return jsonify({"error": "Forbidden"}), 403

    candidate_ids = []
    seen = set()
    for raw_id in raw_ids:
        try:
            candidate_id = int(raw_id)
        except (TypeError, ValueError):
            continue
        if candidate_id > 0 and candidate_id not in seen:
            candidate_ids.append(candidate_id)
            seen.add(candidate_id)

    if not candidate_ids:
        return jsonify({"error": "candidate_ids required"}), 400

    from ..models import Candidate, PipelineStage

    existing_ids = {
        row[0]
        for row in db.session.query(PipelineStage.candidate_id)
        .filter(PipelineStage.job_id == job.id, PipelineStage.candidate_id.in_(candidate_ids))
        .distinct()
        .all()
    }
    visible_ids = {
        row[0]
        for row in visible_candidate_query(g.user_id, g.role)
        .with_entities(Candidate.id)
        .filter(Candidate.id.in_(candidate_ids))
        .all()
    }

    added = 0
    skipped_existing = 0
    skipped_missing = 0
    for candidate_id in candidate_ids:
        if candidate_id not in visible_ids:
            skipped_missing += 1
            continue
        if candidate_id in existing_ids:
            skipped_existing += 1
            continue
        db.session.add(PipelineStage(
            candidate_id=candidate_id,
            job_id=job.id,
            stage="pending",
            updated_by=g.user_id,
            note="批量加入匹配流程",
        ))
        added += 1

    db.session.commit()
    record_event(
        "pipeline.batch_add",
        entity_id=job.id,
        entity_type="job",
        payload={
            "added": added,
            "skipped_existing": skipped_existing,
            "skipped_missing": skipped_missing,
        },
    )
    return jsonify({
        "job_id": job.id,
        "added": added,
        "skipped_existing": skipped_existing,
        "skipped_missing": skipped_missing,
    })
