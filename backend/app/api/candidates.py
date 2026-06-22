import json
import re

from flask import Blueprint, jsonify, request, g
from sqlalchemy import func, select
from ..middleware.auth import require_auth, require_role
from ..middleware.events import record_event
from .. import db
from ..models import (
    Candidate,
    CandidateTag,
    CandidateDisposition,
    Job,
    PipelineStage,
    Interview,
    InterviewFeedback,
    UploadBatch,
    User,
    VALID_STAGES,
)
from ..source_channels import normalize_resume_source_channel, resume_source_channel_filter_values
from .pipeline import LEGACY_INTERVIEW_STAGES, STAGE_ORDER, _latest_stage_subquery, normalize_pipeline_stage
from .access import assigned_candidate_ids_for_interviewer, interviewer_has_assignment

bp = Blueprint("candidates", __name__)

COMMON_CITIES = [
    "北京",
    "上海",
    "深圳",
    "广州",
    "杭州",
    "成都",
    "武汉",
    "南京",
    "苏州",
    "西安",
    "长沙",
    "重庆",
    "天津",
    "厦门",
    "合肥",
    "郑州",
    "青岛",
    "宁波",
    "佛山",
    "东莞",
    "远程",
]
CITY_FIELD_KEYS = {
    "intent_city",
    "target_city",
    "expected_city",
    "preferred_city",
    "desired_city",
    "work_city",
    "city",
    "location",
    "意向城市",
    "目标城市",
    "期望城市",
    "求职城市",
    "工作城市",
    "所在城市",
    "城市",
}
CITY_LABEL_PATTERN = re.compile(
    rf"(?:意向城市|目标城市|期望城市|求职城市|工作城市|希望城市|投递城市|城市)"
    rf"\s*[：:：]?\s*({'|'.join(COMMON_CITIES)})市?"
)


def _resume_info(candidate):
    resume = candidate.resume_json or {}
    if not isinstance(resume, dict):
        return {}
    info = resume.get("extracted_info") or {}
    return info if isinstance(info, dict) else {}


def _normalize_city_value(value):
    text = str(value or "").strip()
    if not text:
        return ""
    for city in COMMON_CITIES:
        if text == city or text == f"{city}市" or city in text:
            return city
    return ""


def _walk_resume_values(value):
    if isinstance(value, dict):
        for key, child in value.items():
            yield str(key), child
            yield from _walk_resume_values(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk_resume_values(child)


def _candidate_intent_city(candidate):
    resume = candidate.resume_json or {}
    if not isinstance(resume, dict):
        return ""

    info = _resume_info(candidate)
    for key in CITY_FIELD_KEYS:
        city = _normalize_city_value(info.get(key))
        if city:
            return city

    for key, value in _walk_resume_values(info):
        if key in CITY_FIELD_KEYS:
            city = _normalize_city_value(value)
            if city:
                return city

    raw_text = json.dumps(resume, ensure_ascii=False)
    match = CITY_LABEL_PATTERN.search(raw_text)
    return _normalize_city_value(match.group(1)) if match else ""


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
        "parse_status": candidate.parse_status,
        "parse_error": candidate.parse_error,
        "tag_count": len(candidate.tags),
        "top_tags": tags[:6],
        "max_score": tags[0]["score"] if tags else 0,
        "intent_city": _candidate_intent_city(candidate),
        "latest_experience": _latest_experience(info),
        "education_summary": _education_summary(info),
        "source": _candidate_source_payload(candidate),
    }


def _candidate_source_payload(candidate):
    if not candidate.upload_batch_id:
        return None
    batch = db.session.get(UploadBatch, candidate.upload_batch_id)
    if batch is None:
        return None
    target_job = db.session.get(Job, batch.target_job_id) if batch.target_job_id else None
    return {
        "batch_id": batch.id,
        "channel": normalize_resume_source_channel(batch.source_channel),
        "source_link": batch.source_link or "",
        "referrer": batch.referrer or "",
        "target_job_id": batch.target_job_id,
        "target_job_title": target_job.title if target_job else None,
        "target_job_city": target_job.city if target_job else "",
        "target_job_department": target_job.department if target_job else "",
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
    wants_paginated = any(
        key in request.args
        for key in (
            "search",
            "stage",
            "job_id",
            "city",
            "source_channel",
            "parse_status",
            "pipeline_status",
            "sort_by",
            "sort_order",
            "page",
            "per_page",
        )
    )

    if g.role == "recruiter":
        query = Candidate.query.filter_by(owner_hr_id=g.user_id)
    elif g.role == "interviewer":
        assigned_ids = assigned_candidate_ids_for_interviewer(g.user_id)
        query = Candidate.query.filter(Candidate.id.in_(assigned_ids or [-1]))
    else:
        query = Candidate.query

    if not wants_paginated:
        return jsonify([_candidate_library_item(c) for c in query.all()])

    search = request.args.get("search", "").strip()
    stage = request.args.get("stage", "").strip()
    job_id = request.args.get("job_id", type=int)
    city = _normalize_city_value(request.args.get("city", "").strip())
    source_channel = request.args.get("source_channel", "").strip()
    parse_status = request.args.get("parse_status", "").strip()
    pipeline_status = request.args.get("pipeline_status", "").strip()
    sort_by = request.args.get("sort_by", "created_at")
    sort_order = request.args.get("sort_order", "desc")
    page = max(1, request.args.get("page", 1, type=int) or 1)
    per_page = min(max(1, request.args.get("per_page", 20, type=int) or 20), 100)

    if search:
        like = f"%{search}%"
        tag_subquery = select(CandidateTag.candidate_id).where(CandidateTag.tag.ilike(like))
        query = query.filter(db.or_(
            Candidate.name_masked.ilike(like),
            Candidate.email_masked.ilike(like),
            Candidate.phone_masked.ilike(like),
            Candidate.id.in_(tag_subquery),
        ))

    if stage and stage in VALID_STAGES:
        latest = _latest_stage_subquery()
        matching_stages = [stage]
        if stage == "interview":
            matching_stages += list(LEGACY_INTERVIEW_STAGES)
        stage_subquery = (
            select(PipelineStage.candidate_id)
            .join(latest, PipelineStage.id == latest.c.max_id)
            .where(PipelineStage.stage.in_(matching_stages))
        )
        query = query.filter(Candidate.id.in_(stage_subquery))

    if job_id:
        job_subquery = select(PipelineStage.candidate_id).where(PipelineStage.job_id == job_id)
        query = query.filter(Candidate.id.in_(job_subquery))

    if source_channel:
        channel_values = resume_source_channel_filter_values(source_channel)
        query = (
            query.join(UploadBatch, Candidate.upload_batch_id == UploadBatch.id)
            .filter(UploadBatch.source_channel.in_(channel_values or [source_channel]))
        )

    if parse_status in {"pending", "processing", "ok", "failed"}:
        query = query.filter(Candidate.parse_status == parse_status)

    if pipeline_status in {"in_pipeline", "not_in_pipeline"}:
        pipeline_subquery = select(PipelineStage.candidate_id).distinct()
        if pipeline_status == "in_pipeline":
            query = query.filter(Candidate.id.in_(pipeline_subquery))
        else:
            query = query.filter(Candidate.id.notin_(pipeline_subquery))

    if city:
        candidate_ids = [c.id for c in query.all() if _candidate_intent_city(c) == city]
        query = query.filter(Candidate.id.in_(candidate_ids or [-1]))

    sort_column = Candidate.created_at
    if sort_by == "name_masked":
        sort_column = Candidate.name_masked
    query = query.order_by(sort_column.asc() if sort_order == "asc" else sort_column.desc())

    total = query.count()
    candidates = query.offset((page - 1) * per_page).limit(per_page).all()

    return jsonify({
        "candidates": [_candidate_library_item(c) for c in candidates],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, (total + per_page - 1) // per_page),
    })


@bp.get("/candidates/owner-options")
@require_auth
@require_role("manager", "admin")
def candidate_owner_options():
    recruiters = (
        User.query
        .filter(User.role == "recruiter", User.is_active.is_(True))
        .order_by(User.name.asc(), User.id.asc())
        .all()
    )
    return jsonify([
        {
            "id": user.id,
            "name": user.name,
            "email": user.email,
        }
        for user in recruiters
    ])


@bp.get("/candidates/<int:candidate_id>/pipelines")
@require_auth
def candidate_pipelines(candidate_id):
    cand = db.session.get(Candidate, candidate_id)
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
        "stage": normalize_pipeline_stage(ps.stage),
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
    cand = db.session.get(Candidate, candidate_id)
    if cand is None:
        return jsonify({"error": "候选人不存在"}), 404
    if g.role == "recruiter" and cand.owner_hr_id != g.user_id:
        return jsonify({"error": "Forbidden"}), 403
    job_id = request.args.get("job_id", type=int)
    if not job_id:
        return jsonify({"error": "job_id required"}), 400
    if g.role == "interviewer" and not interviewer_has_assignment(g.user_id, candidate_id, job_id):
        return jsonify({"error": "Forbidden"}), 403
    job = db.session.get(Job, job_id)

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
        "reason_tags": f.reason_tags if isinstance(f.reason_tags, list) else [],
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
    reason = str(data.get("reason") or "").strip()[:240]
    if not new_owner:
        return jsonify({"error": "owner_hr_id required"}), 400
    if not reason:
        return jsonify({"error": "转派原因必填"}), 400
    cand = db.session.get(Candidate, candidate_id)
    if cand is None:
        return jsonify({"error": "候选人不存在"}), 404
    target = db.session.get(User, new_owner)
    if target is None:
        return jsonify({"error": "目标用户不存在"}), 404
    if target.role != "recruiter" or not target.is_active:
        return jsonify({"error": "候选人负责人必须是启用中的招聘专员"}), 400
    old_owner = cand.owner_hr_id
    cand.owner_hr_id = new_owner
    db.session.commit()
    record_event("candidate.reassigned", entity_id=candidate_id, entity_type="candidate",
                 payload={"from": old_owner, "to": new_owner, "reason": reason})
    return jsonify({"candidate_id": candidate_id, "owner_hr_id": new_owner, "reason": reason})
