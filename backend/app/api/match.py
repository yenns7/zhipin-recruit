# match blueprint — 实际匹配逻辑在 jobs.bp 的 /jobs/<id>/match
# 此处提供独立的 /match 端点以供前端直接调用
from flask import Blueprint, request, jsonify, g
from ..middleware.auth import require_auth, require_role
from .. import db
from ..models import Job
from ..services.match_service import MatchService
from .access import can_manage_job, job_is_active, same_org, visible_candidate_query

bp = Blueprint("match", __name__)


@bp.post("/match")
@require_auth
@require_role("recruiter", "manager", "admin")
def match():
    data = request.get_json()
    job_id = data.get("job_id")
    if not job_id:
        return jsonify({"error": "job_id required"}), 400
    job = db.get_or_404(Job, int(job_id))
    if not same_org(job, g.org_id):
        return jsonify({"error": "岗位不存在"}), 404
    if not can_manage_job(g.user_id, g.role, job):
        return jsonify({"error": "Forbidden"}), 403
    if not job_is_active(job):
        return jsonify({"error": "岗位已关闭，请先恢复在招后再运行匹配"}), 400
    svc = MatchService()
    results = svc.rank_for_job(
        int(job_id),
        candidate_query=visible_candidate_query(g.user_id, g.role),
    )
    return jsonify({"job_id": job_id, "results": results})
