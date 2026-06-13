# match blueprint — 实际匹配逻辑在 jobs.bp 的 /jobs/<id>/match
# 此处提供独立的 /match 端点以供前端直接调用
from flask import Blueprint, request, jsonify, g
from ..middleware.auth import require_auth
from ..services.match_service import MatchService

bp = Blueprint("match", __name__)


@bp.post("/match")
@require_auth
def match():
    data = request.get_json()
    job_id = data.get("job_id")
    if not job_id:
        return jsonify({"error": "job_id required"}), 400
    svc = MatchService()
    results = svc.rank_for_job(int(job_id))
    return jsonify({"job_id": job_id, "results": results})
