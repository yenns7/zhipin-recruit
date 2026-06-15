from flask import Blueprint, jsonify, request, g
from sqlalchemy import func
from ..middleware.auth import require_auth, require_role
from ..middleware.events import record_event
from .. import db
from ..models import (
    Candidate,
    CandidateDisposition,
    Job,
    PipelineStage,
    Interview,
    InterviewFeedback,
    UploadBatch,
    User,
)
from .pipeline import _latest_stage_subquery, STAGE_ORDER
from .access import assigned_candidate_ids_for_interviewer, interviewer_has_assignment

bp = Blueprint("candidates", __name__)


def _resume_info(candidate):
    resume = candidate.resume_json or {}
    if not isinstance(resume, dict):
        return {}
    info = resume.get("extracted_info") or {}
    return info if isinstance(info, dict) else {}


def _latest_experience(info):
    experiences = info.get("experience") or []
    if not isinstance(experiences, list) or not experiences:
        return None
    exp = experiences[0] if isinstance(experiences[0], dict) else {}
    return {
        "company": str(exp.get("company") or "")[:120],
        "position": str(exp.get("position") or "")[:120],
        "duration": str(exp.get("duration") or "")[:80],
    }


def _education_summary(info):
    education = info.get("education") or []
    if not isinstance(education, list) or not education:
        return ""
    edu = education[0] if isinstance(education[0], dict) else {}
    parts = [
        str(edu.get("school") or "").strip(),
        str(edu.get("degree") or "").strip(),
        str(edu.get("major") or "").strip(),
    ]
    return " · ".join([p for p in parts if p])[:240]


def _candidate_library_item(candidate):
    info = _resume_info(candidate)
    tags = sorted(
        [{"tag": t.tag, "score": t.score or 0} for t in candidate.tags if t.tag],
        key=lambda x: (-int(x["score"] or 0), x["tag"]),
    )
    return {
        "id": candidate.id,
        "name_masked": candidate.name_masked,
        "email_masked": candidate.email_masked,
        "phone_masked": candidate.phone_masked,
        "owner_hr_id": candidate.owner_hr_id,
        "created_at": candidate.created_at.isoformat(),
        "tag_count": len(candidate.tags),
        "top_tags": tags[:6],
        "max_score": tags[0]["score"] if tags else 0,
        "latest_experience": _latest_experience(info),
        "education_summary": _education_summary(info),
        "source": _candidate_source_payload(candidate),
    }


def _candidate_source_payload(candidate):
    if not candidate.upload_batch_id:
        return None
    batch = UploadBatch.query.get(candidate.upload_batch_id)
    if batch is None:
        return None
    target_job = Job.query.get(batch.target_job_id) if batch.target_job_id else None
    return {
        "batch_id": batch.id,
        "channel": batch.source_channel or "",
        "source_link": batch.source_link or "",
        "referrer": batch.referrer or "",
        "target_job_id": batch.target_job_id,
        "target_job_title": target_job.title if target_job else None,
        "note": batch.note or "",
        "created_at": batch.created_at.isoformat() if batch.created_at else None,
    }


def _dedupe_non_empty(items, limit=5):
    result = []
    seen = set()
    for item in items:
        text = str(item or "").strip()
        if not text or text in seen:
            continue
        result.append(text)
        seen.add(text)
        if len(result) >= limit:
            break
    return result


def _decision_summary(timeline, ai_interviews, feedback, dispositions):
    scores = [float(item["score"]) for item in feedback if item.get("score") is not None]
    average_score = round(sum(scores) / len(scores), 1) if scores else None
    passed_count = sum(1 for item in feedback if item.get("passed") is True)
    failed_count = sum(1 for item in feedback if item.get("passed") is False)
    latest_stage = timeline[-1]["stage"] if timeline else None
    highlights = _dedupe_non_empty([item.get("strengths") for item in feedback])
    risks = _dedupe_non_empty(
        [item.get("concerns") for item in feedback] +
        [item.get("reason") for item in dispositions]
    )

    if latest_stage in ("offer", "onboarded"):
        recommendation = "建议发放 Offer" if latest_stage == "offer" else "已进入入职跟进"
    elif latest_stage == "rejected" or failed_count > 0:
        recommendation = "建议复核"
    elif average_score is not None and average_score >= 4 and failed_count == 0:
        recommendation = "建议推进"
    elif feedback:
        recommendation = "待补充判断"
    else:
        recommendation = "等待面试反馈"

    return {
        "current_stage": latest_stage,
        "feedback_count": len(feedback),
        "passed_count": passed_count,
        "failed_count": failed_count,
        "average_score": average_score,
        "ai_interview_count": len(ai_interviews),
        "highlights": highlights,
        "risks": risks,
        "recommendation": recommendation,
    }


@bp.get("/candidates")
@require_auth
def list_candidates():
    if g.role == "recruiter":
        candidates = Candidate.query.filter_by(owner_hr_id=g.user_id).all()
    elif g.role == "interviewer":
        assigned_ids = assigned_candidate_ids_for_interviewer(g.user_id)
        candidates = Candidate.query.filter(Candidate.id.in_(assigned_ids or [-1])).all()
    else:
        candidates = Candidate.query.all()
    return jsonify([_candidate_library_item(c) for c in candidates])


@bp.get("/candidates/<int:candidate_id>/pipelines")
@require_auth
def candidate_pipelines(candidate_id):
    cand = Candidate.query.get(candidate_id)
    if cand is None:
        return jsonify({"error": "候选人不存在"}), 404
    if g.role == "recruiter" and cand.owner_hr_id != g.user_id:
        return jsonify({"error": "Forbidden"}), 403
    if g.role == "interviewer" and not interviewer_has_assignment(g.user_id, candidate_id):
        return jsonify({"error": "Forbidden"}), 403
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
    if g.role == "interviewer" and not interviewer_has_assignment(g.user_id, candidate_id, job_id):
        return jsonify({"error": "Forbidden"}), 403
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
        "evaluation": f.evaluation_json or {},
        "interviewer_name": u.name if u else None,
        "created_at": f.created_at.isoformat() if f.created_at else None,
    } for f, u in fb_rows]

    disposition_rows = (db.session.query(CandidateDisposition, User)
                        .outerjoin(User, User.id == CandidateDisposition.created_by)
                        .filter(CandidateDisposition.candidate_id == candidate_id,
                                CandidateDisposition.job_id == job_id)
                        .order_by(CandidateDisposition.id.desc()).all())
    dispositions = [{
        "id": d.id,
        "reason": d.reason or "",
        "enter_talent_pool": d.enter_talent_pool,
        "next_contact_at": d.next_contact_at.isoformat() if d.next_contact_at else None,
        "tags": d.tags if isinstance(d.tags, list) else [],
        "note": d.note or "",
        "created_by_name": u.name if u else None,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    } for d, u in disposition_rows]

    return jsonify({
        "candidate_id": candidate_id,
        "name_masked": cand.name_masked,
        "job_id": job_id,
        "job_title": job.title if job else None,
        "timeline": timeline,
        "ai_interviews": ai_interviews,
        "feedback": feedback,
        "dispositions": dispositions,
        "decision_summary": _decision_summary(timeline, ai_interviews, feedback, dispositions),
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
