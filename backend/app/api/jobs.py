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


@bp.post("/jobs")
@require_auth
def create_job():
    data = request.get_json()
    if not data or not data.get("title") or not data.get("jd_text"):
        return jsonify({"error": "title and jd_text required"}), 400

    import json as _json
    from llm_client import LLMClient
    llm = LLMClient()
    JD_PROMPT_SYS = (
        "你是一位招聘专家。从以下 JD 中提取结构化信息，返回 JSON："
        '{"education":"学历要求","major":"专业要求","skills":["技能1","技能2"],"skill_tags_raw":"技能1 , 4 , AI|技能2 , 3 , BE"}'
        "只返回 JSON，不含其他文字。"
    )
    try:
        raw = llm.chat(JD_PROMPT_SYS, data["jd_text"][:2000])
        import re
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        structured = _json.loads(m.group()) if m else {}
    except Exception:
        structured = {}

    job = Job(
        title=data["title"],
        jd_text=data["jd_text"],
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
