import sys
from pathlib import Path
from flask import Blueprint, request, jsonify, g
from ..middleware.auth import require_auth
from ..middleware.events import record_event
from ..services.match_service import MatchService
from .. import db
from ..models import Job

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
        raw = llm.chat(JD_EXTRACT_SYS, jd_text[:4000])
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        return _json.loads(m.group()) if m else {}
    except Exception:
        return {}


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
def create_job():
    data = request.get_json()
    if not data or not data.get("title") or not data.get("jd_text"):
        return jsonify({"error": "title and jd_text required"}), 400

    from llm_client import LLMClient
    llm = LLMClient()

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

    structured = _extract_jd_structured(llm, jd_text)

    job = Job(
        title=data["title"],
        jd_text=jd_text,
        jd_structured=structured,
        owner_hr_id=g.user_id,
    )
    db.session.add(job)
    db.session.commit()
    record_event("job.created", entity_id=job.id, entity_type="job")
    return jsonify({"id": job.id, "title": job.title, "structured": structured}), 201


@bp.get("/jobs")
@require_auth
def list_jobs():
    jobs = Job.query.filter_by(status="active").all()
    return jsonify([{"id": j.id, "title": j.title, "created_at": j.created_at.isoformat()} for j in jobs])


@bp.post("/jobs/<int:job_id>/match")
@require_auth
def match_job(job_id):
    svc = MatchService()
    results = svc.rank_for_job(job_id)
    record_event("match.run", entity_id=job_id, entity_type="job", payload={"count": len(results)})
    return jsonify({"job_id": job_id, "results": results})
