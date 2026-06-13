from flask import Blueprint, request, jsonify, g
from ..middleware.auth import require_auth
from ..middleware.events import record_event
from .. import db
from ..models import PipelineStage, VALID_STAGES

bp = Blueprint("pipeline", __name__)


@bp.post("/pipeline/move")
@require_auth
def move_stage():
    data = request.get_json()
    candidate_id = data.get("candidate_id")
    job_id = data.get("job_id")
    to_stage = data.get("stage")

    if not candidate_id or not job_id or not to_stage:
        return jsonify({"error": "candidate_id, job_id, stage required"}), 400
    if to_stage not in VALID_STAGES:
        return jsonify({"error": f"Invalid stage. Valid: {sorted(VALID_STAGES)}"}), 400

    ps = PipelineStage(
        candidate_id=candidate_id,
        job_id=job_id,
        stage=to_stage,
        updated_by=g.user_id,
    )
    db.session.add(ps)
    db.session.commit()
    record_event("pipeline.moved", entity_id=candidate_id, entity_type="candidate",
                 payload={"job_id": job_id, "to": to_stage})
    if to_stage == "onboarded":
        record_event("candidate.onboarded", entity_id=candidate_id, entity_type="candidate",
                     payload={"job_id": job_id})
    return jsonify({"status": "ok", "stage": to_stage})


@bp.get("/pipeline/<int:job_id>")
@require_auth
def get_pipeline(job_id):
    """返回某岗位各 stage 的候选人分布"""
    rows = (
        db.session.query(PipelineStage.stage, db.func.count(PipelineStage.candidate_id))
        .filter(PipelineStage.job_id == job_id)
        .group_by(PipelineStage.stage)
        .all()
    )
    return jsonify({stage: count for stage, count in rows})
