# match blueprint — 实际匹配逻辑在 jobs.bp 的 /jobs/<id>/match
# 此处提供独立的 /match 端点以供前端直接调用
from flask import Blueprint, request, jsonify, g
from ..middleware.auth import require_auth, require_role
from ..models import Job
from ..services.match_service import MatchService
from .access import can_manage_job, visible_candidate_query

bp = Blueprint("match", __name__)


@bp.post("/match")
@require_auth
@require_role("recruiter", "manager", "admin")
def match():
    data = request.get_json()
    job_id = data.get("job_id")
    if not job_id:
        return jsonify({"error": "job_id required"}), 400
    job = Job.query.get_or_404(int(job_id))
    if not can_manage_job(g.user_id, g.role, job):
        return jsonify({"error": "Forbidden"}), 403
    svc = MatchService()
    results = svc.rank_for_job(
        int(job_id),
        candidate_query=visible_candidate_query(g.user_id, g.role),
    )
    return jsonify({"job_id": job_id, "results": results})
