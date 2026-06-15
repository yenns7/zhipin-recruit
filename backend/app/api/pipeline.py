from datetime import date
from flask import Blueprint, request, jsonify, g
from sqlalchemy import func
from ..middleware.auth import require_auth
from ..middleware.events import record_event
from .. import db
from ..models import Candidate, CandidateDisposition, Job, OfferRecord, PipelineStage, VALID_STAGES, User
from .access import assigned_candidate_ids_for_interviewer, interviewer_has_assignment

bp = Blueprint("pipeline", __name__)

# 阶段顺序（用于"推进/回退"语义与前端排序）。rejected 是终态，不在主序列里。
STAGE_ORDER = ["pending", "ai_screen", "interview_first",
               "interview_second", "interview_final", "offer", "onboarded"]


def _parse_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _offer_payload(offer):
    if offer is None:
        return None
    return {
        "id": offer.id,
        "candidate_id": offer.candidate_id,
        "job_id": offer.job_id,
        "salary_range": offer.salary_range or "",
        "onboard_date": offer.onboard_date.isoformat() if offer.onboard_date else None,
        "approval_status": offer.approval_status or "draft",
        "note": offer.note or "",
        "updated_at": offer.updated_at.isoformat() if offer.updated_at else None,
    }


def _latest_stage_subquery(job_id=None):
    """
    PipelineStage 是 append-only 流水表：一个候选人推进多次会留多行。
    要得到"当前阶段分布"，必须先取每个 (candidate_id, job_id) 的最新一行。
    返回一个子查询，列为 (candidate_id, job_id, max_id)。
    """
    q = db.session.query(
        PipelineStage.candidate_id.label("candidate_id"),
        PipelineStage.job_id.label("job_id"),
        func.max(PipelineStage.id).label("max_id"),
    )
    if job_id is not None:
        q = q.filter(PipelineStage.job_id == job_id)
    return q.group_by(PipelineStage.candidate_id, PipelineStage.job_id).subquery()


@bp.post("/pipeline/move")
@require_auth
def move_stage():
    data = request.get_json() or {}
    candidate_id = data.get("candidate_id")
    job_id = data.get("job_id")
    to_stage = data.get("stage")
    note = data.get("note")

    if not candidate_id or not job_id or not to_stage:
        return jsonify({"error": "candidate_id, job_id, stage required"}), 400
    if to_stage not in VALID_STAGES:
        return jsonify({"error": f"Invalid stage. Valid: {sorted(VALID_STAGES)}"}), 400

    candidate = Candidate.query.get(candidate_id)
    if candidate is None:
        return jsonify({"error": "候选人不存在"}), 404
    job = Job.query.get(job_id)
    if job is None:
        return jsonify({"error": "岗位不存在"}), 404
    if g.role == "interviewer" and not interviewer_has_assignment(g.user_id, candidate_id, job_id):
        return jsonify({"error": "Forbidden"}), 403

    # 当前阶段（用于事件记录与返回，便于前端给出"从 X 到 Y"的反馈）
    prev = (
        PipelineStage.query
        .filter_by(candidate_id=candidate_id, job_id=job_id)
        .order_by(PipelineStage.id.desc())
        .first()
    )
    from_stage = prev.stage if prev else None

    ps = PipelineStage(
        candidate_id=candidate_id,
        job_id=job_id,
        stage=to_stage,
        updated_by=g.user_id,
        note=note,
    )
    db.session.add(ps)
    db.session.commit()
    record_event("pipeline.moved", entity_id=candidate_id, entity_type="candidate",
                 payload={"job_id": job_id, "from": from_stage, "to": to_stage, "note": note})
    if to_stage == "onboarded":
        record_event("candidate.onboarded", entity_id=candidate_id, entity_type="candidate",
                     payload={"job_id": job_id})
    if to_stage == "rejected" and isinstance(data.get("disposition"), dict):
        disposition_data = data["disposition"]
        tags = disposition_data.get("tags") or []
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]
        elif not isinstance(tags, list):
            tags = []
        disposition = CandidateDisposition(
            candidate_id=candidate_id,
            job_id=job_id,
            reason=str(disposition_data.get("reason") or "")[:240],
            enter_talent_pool=bool(disposition_data.get("enter_talent_pool", True)),
            next_contact_at=_parse_date(disposition_data.get("next_contact_at")),
            tags=[str(t).strip()[:60] for t in tags if str(t).strip()][:12],
            note=str(disposition_data.get("note") or ""),
            created_by=g.user_id,
        )
        db.session.add(disposition)
        db.session.commit()
        record_event("candidate.disposition", entity_id=candidate_id, entity_type="candidate",
                     payload={"job_id": job_id, "reason": disposition.reason,
                              "enter_talent_pool": disposition.enter_talent_pool})
    return jsonify({
        "status": "ok",
        "stage": to_stage,
        "from": from_stage,
        "candidate_id": candidate_id,
        "name_masked": candidate.name_masked,
    })


@bp.get("/pipeline/<int:job_id>")
@require_auth
def get_pipeline(job_id):
    """返回某岗位各 stage 的【当前】候选人数量（按最新阶段去重，不再重复计数历史流水）"""
    latest = _latest_stage_subquery(job_id)
    rows = (
        db.session.query(PipelineStage.stage, func.count(PipelineStage.id))
        .join(latest, PipelineStage.id == latest.c.max_id)
        .group_by(PipelineStage.stage)
        .all()
    )
    return jsonify({stage: count for stage, count in rows})


@bp.get("/pipeline/<int:job_id>/board")
@require_auth
def get_board(job_id):
    """
    招聘流程看板数据：返回该岗位下每位候选人的【当前阶段】，
    以便前端在对应阶段列里渲染候选人卡片，并就地变更状态。
    """
    job = Job.query.get(job_id)
    if job is None:
        return jsonify({"error": "岗位不存在"}), 404

    latest = _latest_stage_subquery(job_id)
    rows = (
        db.session.query(PipelineStage, Candidate, User)
        .join(latest, PipelineStage.id == latest.c.max_id)
        .join(Candidate, Candidate.id == PipelineStage.candidate_id)
        .outerjoin(User, User.id == PipelineStage.updated_by)
    )
    if g.role == "interviewer":
        assigned_ids = assigned_candidate_ids_for_interviewer(g.user_id)
        rows = rows.filter(Candidate.id.in_(assigned_ids or [-1]))
    rows = rows.all()

    candidates = [{
        "candidate_id": ps.candidate_id,
        "name_masked": cand.name_masked or f"候选人 {ps.candidate_id}",
        "stage": ps.stage,
        "note": ps.note,
        "updated_at": ps.ts.isoformat() if ps.ts else None,
        "updated_by_name": user.name if user else None,
    } for ps, cand, user in rows]
    # 稳定排序：按阶段顺序，再按更新时间倒序
    candidates.sort(key=lambda c: (
        STAGE_ORDER.index(c["stage"]) if c["stage"] in STAGE_ORDER else len(STAGE_ORDER),
        c["updated_at"] or "",
    ))

    return jsonify({
        "job_id": job_id,
        "job_title": job.title,
        "stage_order": STAGE_ORDER + ["rejected"],
        "candidates": candidates,
    })


@bp.get("/pipeline/<int:job_id>/history/<int:candidate_id>")
@require_auth
def get_history(job_id, candidate_id):
    """单个候选人在某岗位的阶段流转时间线（按时间正序）。"""
    if g.role == "interviewer" and not interviewer_has_assignment(g.user_id, candidate_id, job_id):
        return jsonify({"error": "Forbidden"}), 403
    rows = (
        db.session.query(PipelineStage, User)
        .outerjoin(User, User.id == PipelineStage.updated_by)
        .filter(PipelineStage.job_id == job_id,
                PipelineStage.candidate_id == candidate_id)
        .order_by(PipelineStage.id.asc())
        .all()
    )
    timeline = [{
        "stage": ps.stage,
        "ts": ps.ts.isoformat() if ps.ts else None,
        "updated_by_name": user.name if user else None,
        "note": ps.note,
    } for ps, user in rows]
    return jsonify({"job_id": job_id, "candidate_id": candidate_id, "timeline": timeline})


@bp.get("/pipeline/<int:job_id>/offer/<int:candidate_id>")
@require_auth
def get_offer(job_id, candidate_id):
    if g.role == "interviewer" and not interviewer_has_assignment(g.user_id, candidate_id, job_id):
        return jsonify({"error": "Forbidden"}), 403
    offer = (OfferRecord.query
             .filter_by(candidate_id=candidate_id, job_id=job_id)
             .order_by(OfferRecord.id.desc())
             .first())
    return jsonify(_offer_payload(offer) or {
        "candidate_id": candidate_id,
        "job_id": job_id,
        "salary_range": "",
        "onboard_date": None,
        "approval_status": "draft",
        "note": "",
    })


@bp.put("/pipeline/<int:job_id>/offer/<int:candidate_id>")
@require_auth
def save_offer(job_id, candidate_id):
    if g.role == "interviewer":
        return jsonify({"error": "Forbidden"}), 403
    if Candidate.query.get(candidate_id) is None:
        return jsonify({"error": "候选人不存在"}), 404
    if Job.query.get(job_id) is None:
        return jsonify({"error": "岗位不存在"}), 404
    data = request.get_json() or {}
    offer = (OfferRecord.query
             .filter_by(candidate_id=candidate_id, job_id=job_id)
             .order_by(OfferRecord.id.desc())
             .first())
    if offer is None:
        offer = OfferRecord(candidate_id=candidate_id, job_id=job_id, created_by=g.user_id)
        db.session.add(offer)

    offer.salary_range = str(data.get("salary_range") or "")[:120]
    offer.onboard_date = _parse_date(data.get("onboard_date"))
    offer.approval_status = str(data.get("approval_status") or "draft")[:40]
    offer.note = str(data.get("note") or "")
    db.session.commit()
    record_event("offer.saved", entity_id=candidate_id, entity_type="candidate",
                 payload={"job_id": job_id, "approval_status": offer.approval_status})
    return jsonify(_offer_payload(offer))
