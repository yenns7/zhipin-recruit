from flask import Blueprint, jsonify, request, g
from sqlalchemy import func
from ..middleware.auth import require_auth, require_role
from ..middleware.events import record_event
from .. import db
from ..models import Candidate, Job, PipelineStage, Interview, InterviewFeedback, User
from .pipeline import _latest_stage_subquery, STAGE_ORDER

bp = Blueprint("candidates", __name__)


@bp.get("/candidates")
@require_auth
def list_candidates():
    if g.role == "recruiter":
        candidates = Candidate.query.filter_by(owner_hr_id=g.user_id).all()
    else:
        candidates = Candidate.query.all()
    return jsonify([{
        "id": c.id,
        "name_masked": c.name_masked,
        "owner_hr_id": c.owner_hr_id,
        "created_at": c.created_at.isoformat(),
        "tag_count": len(c.tags),
    } for c in candidates])


@bp.get("/candidates/<int:candidate_id>/pipelines")
@require_auth
def candidate_pipelines(candidate_id):
    cand = Candidate.query.get(candidate_id)
    if cand is None:
        return jsonify({"error": "候选人不存在"}), 404
    latest = _latest_stage_subquery()
    rows = (
        db.session.query(PipelineStage, Job)
        .join(latest, PipelineStage.id == latest.c.max_id)
        .join(Job, Job.id == PipelineStage.job_id)
        .filter(PipelineStage.candidate_id == candidate_id)
        .all()
    )
    items = [{
        "job_id": ps.job_id,
        "job_title": job.title,
        "stage": ps.stage,
        "updated_at": ps.ts.isoformat() if ps.ts else None,
    } for ps, job in rows]
    items.sort(key=lambda x: (
        STAGE_ORDER.index(x["stage"]) if x["stage"] in STAGE_ORDER else len(STAGE_ORDER)
    ))
    return jsonify({"candidate_id": candidate_id,
                    "name_masked": cand.name_masked, "pipelines": items})


@bp.get("/candidates/<int:candidate_id>/journey")
@require_auth
def candidate_journey(candidate_id):
    cand = Candidate.query.get(candidate_id)
    if cand is None:
        return jsonify({"error": "候选人不存在"}), 404
    if g.role == "recruiter" and cand.owner_hr_id != g.user_id:
        return jsonify({"error": "Forbidden"}), 403
    job_id = request.args.get("job_id", type=int)
    if not job_id:
        return jsonify({"error": "job_id required"}), 400
    job = Job.query.get(job_id)

    # 阶段时间线（含操作人、备注）
    stage_rows = (
        db.session.query(PipelineStage, User)
        .outerjoin(User, User.id == PipelineStage.updated_by)
        .filter(PipelineStage.candidate_id == candidate_id,
                PipelineStage.job_id == job_id)
        .order_by(PipelineStage.id.asc())
        .all()
    )
    timeline = [{
        "stage": ps.stage,
        "ts": ps.ts.isoformat() if ps.ts else None,
        "note": ps.note,
        "updated_by_name": u.name if u else None,
    } for ps, u in stage_rows]

    # AI 面试得分
    ai_rows = (Interview.query
               .filter_by(candidate_id=candidate_id, job_id=job_id)
               .order_by(Interview.id.desc()).all())
    ai_interviews = [{
        "id": iv.id, "score": iv.score, "pass": iv.pass_recommended,
        "created_at": iv.created_at.isoformat() if iv.created_at else None,
    } for iv in ai_rows]

    # 面试官评分
    fb_rows = (db.session.query(InterviewFeedback, User)
               .outerjoin(User, User.id == InterviewFeedback.interviewer_id)
               .filter(InterviewFeedback.candidate_id == candidate_id,
                       InterviewFeedback.job_id == job_id)
               .order_by(InterviewFeedback.id.desc()).all())
    feedback = [{
        "id": f.id, "round": f.round, "score": f.score, "passed": f.passed,
        "strengths": f.strengths, "concerns": f.concerns, "note": f.note,
        "interviewer_name": u.name if u else None,
        "created_at": f.created_at.isoformat() if f.created_at else None,
    } for f, u in fb_rows]

    return jsonify({
        "candidate_id": candidate_id,
        "name_masked": cand.name_masked,
        "job_id": job_id,
        "job_title": job.title if job else None,
        "timeline": timeline,
        "ai_interviews": ai_interviews,
        "feedback": feedback,
    })


@bp.patch("/candidates/<int:candidate_id>/owner")
@require_auth
@require_role("manager", "admin")
def reassign_owner(candidate_id):
    data = request.get_json(silent=True) or {}
    new_owner = data.get("owner_hr_id")
    if not new_owner:
        return jsonify({"error": "owner_hr_id required"}), 400
    cand = Candidate.query.get(candidate_id)
    if cand is None:
        return jsonify({"error": "候选人不存在"}), 404
    target = User.query.get(new_owner)
    if target is None:
        return jsonify({"error": "目标用户不存在"}), 404
    old_owner = cand.owner_hr_id
    cand.owner_hr_id = new_owner
    db.session.commit()
    record_event("candidate.reassigned", entity_id=candidate_id, entity_type="candidate",
                 payload={"from": old_owner, "to": new_owner})
    return jsonify({"candidate_id": candidate_id, "owner_hr_id": new_owner})
