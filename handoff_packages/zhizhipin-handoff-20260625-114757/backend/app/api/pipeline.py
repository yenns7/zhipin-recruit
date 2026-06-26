from datetime import date
from flask import Blueprint, request, jsonify, g
from sqlalchemy import func
from ..middleware.auth import require_auth
from ..middleware.events import record_event
from .. import db
from ..models import Candidate, CandidateDisposition, Job, OfferRecord, PipelineStage, VALID_STAGES, User
from .access import (
    can_access_candidate,
    can_manage_job,
    can_read_job,
    job_is_active,
    same_org,
    visible_candidate_query,
)

bp = Blueprint("pipeline", __name__)

# 阶段顺序（用于"推进/回退"语义与前端排序）。rejected 是终态，不在主序列里。
# MVP 主流程只保留"面试中"，历史的一面/二面/终面统一归到 interview。
STAGE_ORDER = ["pending", "ai_screen", "business_review", "interview", "offer", "onboarded"]
LEGACY_INTERVIEW_STAGES = {"interview_first", "interview_second", "interview_final"}
PIPELINE_STAGE_ORDER = STAGE_ORDER + ["rejected"]


def normalize_pipeline_stage(stage):
    return "interview" if stage in LEGACY_INTERVIEW_STAGES else stage


def _stage_sort_index(stage):
    normalized = normalize_pipeline_stage(stage)
    return STAGE_ORDER.index(normalized) if normalized in STAGE_ORDER else len(STAGE_ORDER)


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
        return jsonify({"error": f"Invalid stage. Valid: {sorted(PIPELINE_STAGE_ORDER)}"}), 400
    to_stage = normalize_pipeline_stage(to_stage)
    if g.role == "interviewer":
        return jsonify({"error": "Forbidden"}), 403

    candidate = db.session.get(Candidate, candidate_id)
    if candidate is None:
        return jsonify({"error": "候选人不存在"}), 404
    job = db.session.get(Job, job_id)
    if job is None:
        return jsonify({"error": "岗位不存在"}), 404
    if not same_org(job, g.org_id):
        return jsonify({"error": "岗位不存在"}), 404
    if not can_access_candidate(g.user_id, g.role, candidate_id, job_id):
        return jsonify({"error": "Forbidden"}), 403
    if not can_manage_job(g.user_id, g.role, job):
        return jsonify({"error": "Forbidden"}), 403
    if not job_is_active(job):
        return jsonify({"error": "岗位已关闭，请先恢复在招后再推进流程"}), 400

    # 当前阶段（用于事件记录与返回，便于前端给出"从 X 到 Y"的反馈）
    prev = (
        PipelineStage.query
        .filter_by(candidate_id=candidate_id, job_id=job_id)
        .order_by(PipelineStage.id.desc())
        .first()
    )
    from_stage = normalize_pipeline_stage(prev.stage) if prev else None
    if (
        prev is not None
        and from_stage == to_stage
        and prev.updated_by == g.user_id
        and (prev.note or "") == (note or "")
    ):
        return jsonify({
            "status": "ok",
            "stage": to_stage,
            "from": from_stage,
            "candidate_id": candidate_id,
            "name_masked": candidate.name_masked,
            "deduplicated": True,
        })

    ps = PipelineStage(
        org_id=g.org_id,
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
            org_id=g.org_id,
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
        "deduplicated": False,
    })


@bp.post("/pipeline/transfer")
@require_auth
def transfer_candidate():
    data = request.get_json() or {}
    candidate_id = data.get("candidate_id")
    from_job_id = data.get("from_job_id")
    to_job_id = data.get("to_job_id")
    reason = str(data.get("reason") or "").strip()

    if not candidate_id or not from_job_id or not to_job_id:
        return jsonify({"error": "candidate_id, from_job_id, to_job_id required"}), 400
    if not reason:
        return jsonify({"error": "转入其他招聘需求需要填写原因"}), 400
    if from_job_id == to_job_id:
        return jsonify({"error": "目标招聘需求不能和当前需求相同"}), 400
    if g.role == "interviewer":
        return jsonify({"error": "Forbidden"}), 403

    candidate = db.session.get(Candidate, candidate_id)
    if candidate is None:
        return jsonify({"error": "候选人不存在"}), 404
    source_job = db.session.get(Job, from_job_id)
    target_job = db.session.get(Job, to_job_id)
    if source_job is None or not same_org(source_job, g.org_id):
        return jsonify({"error": "当前招聘需求不存在"}), 404
    if target_job is None or not same_org(target_job, g.org_id):
        return jsonify({"error": "目标招聘需求不存在"}), 404
    if not can_access_candidate(g.user_id, g.role, candidate_id, from_job_id):
        return jsonify({"error": "Forbidden"}), 403
    if not can_manage_job(g.user_id, g.role, source_job):
        return jsonify({"error": "Forbidden"}), 403
    if not can_manage_job(g.user_id, g.role, target_job):
        return jsonify({"error": "Forbidden"}), 403
    if not job_is_active(target_job):
        return jsonify({"error": "目标招聘需求已关闭，请先恢复在招后再转入"}), 400

    source_latest = (
        PipelineStage.query
        .filter_by(candidate_id=candidate_id, job_id=from_job_id)
        .order_by(PipelineStage.id.desc())
        .first()
    )
    if source_latest is None:
        return jsonify({"error": "候选人不在当前招聘需求流程中"}), 400
    from_stage = normalize_pipeline_stage(source_latest.stage)
    if from_stage in ("rejected", "onboarded"):
        return jsonify({"error": "候选人当前流程已结束，无法转入其他招聘需求"}), 400

    target_latest = (
        PipelineStage.query
        .filter_by(candidate_id=candidate_id, job_id=to_job_id)
        .order_by(PipelineStage.id.desc())
        .first()
    )
    if target_latest is not None and normalize_pipeline_stage(target_latest.stage) not in ("rejected", "onboarded"):
        return jsonify({"error": "候选人已在目标招聘需求流程中"}), 409

    transfer_reason = reason[:240]
    source_note = f"转入其他招聘需求：{target_job.title}；原因：{transfer_reason}"
    target_note = f"从 {source_job.title} 转入；原因：{transfer_reason}"
    db.session.add_all([
        PipelineStage(
            org_id=g.org_id,
            candidate_id=candidate_id,
            job_id=from_job_id,
            stage="rejected",
            updated_by=g.user_id,
            note=source_note,
        ),
        PipelineStage(
            org_id=g.org_id,
            candidate_id=candidate_id,
            job_id=to_job_id,
            stage="pending",
            updated_by=g.user_id,
            note=target_note,
        ),
    ])
    db.session.commit()
    record_event(
        "pipeline.transferred",
        entity_id=candidate_id,
        entity_type="candidate",
        payload={
            "from_job_id": from_job_id,
            "to_job_id": to_job_id,
            "from_stage": from_stage,
            "to_stage": "pending",
            "reason": transfer_reason,
        },
    )
    return jsonify({
        "status": "ok",
        "candidate_id": candidate_id,
        "name_masked": candidate.name_masked,
        "from_job_id": from_job_id,
        "to_job_id": to_job_id,
        "from_stage": from_stage,
        "to_stage": "pending",
    })


@bp.get("/pipeline/<int:job_id>")
@require_auth
def get_pipeline(job_id):
    """返回某岗位各 stage 的【当前】候选人数量（按最新阶段去重，不再重复计数历史流水）"""
    job = db.session.get(Job, job_id)
    if job is None or not same_org(job, g.org_id):
        return jsonify({"error": "岗位不存在"}), 404
    if not can_read_job(g.user_id, g.role, job):
        return jsonify({"error": "Forbidden"}), 403
    latest = _latest_stage_subquery(job_id)
    rows = (
        db.session.query(PipelineStage.stage, func.count(PipelineStage.id))
        .join(latest, PipelineStage.id == latest.c.max_id)
        .join(Candidate, Candidate.id == PipelineStage.candidate_id)
        .filter(Candidate.deleted_at.is_(None))
        .group_by(PipelineStage.stage)
    )
    if g.role not in ("manager", "admin"):
        rows = rows.filter(Candidate.id.in_(
            visible_candidate_query(g.user_id, g.role).with_entities(Candidate.id)
        ))
    rows = rows.all()
    counts = {}
    for stage, count in rows:
        normalized = normalize_pipeline_stage(stage)
        counts[normalized] = counts.get(normalized, 0) + count
    return jsonify(counts)


@bp.get("/pipeline/<int:job_id>/board")
@require_auth
def get_board(job_id):
    """
    招聘流程看板数据：返回该岗位下每位候选人的【当前阶段】，
    以便前端在对应阶段列里渲染候选人卡片，并就地变更状态。
    """
    job = db.session.get(Job, job_id)
    if job is None or not same_org(job, g.org_id):
        return jsonify({"error": "岗位不存在"}), 404
    if not can_read_job(g.user_id, g.role, job):
        return jsonify({"error": "Forbidden"}), 403

    latest = _latest_stage_subquery(job_id)
    rows = (
        db.session.query(PipelineStage, Candidate, User)
        .join(latest, PipelineStage.id == latest.c.max_id)
        .join(Candidate, Candidate.id == PipelineStage.candidate_id)
        .outerjoin(User, User.id == PipelineStage.updated_by)
        .filter(Candidate.deleted_at.is_(None))
    )
    if g.role not in ("manager", "admin"):
        rows = rows.filter(Candidate.id.in_(
            visible_candidate_query(g.user_id, g.role).with_entities(Candidate.id)
        ))
    rows = rows.all()

    candidates = [{
        "candidate_id": ps.candidate_id,
        "name_masked": cand.name_masked or f"候选人 {ps.candidate_id}",
        "stage": normalize_pipeline_stage(ps.stage),
        "note": ps.note,
        "updated_at": ps.ts.isoformat() if ps.ts else None,
        "updated_by_name": user.name if user else None,
    } for ps, cand, user in rows]
    # 稳定排序：按阶段顺序，再按更新时间倒序
    candidates.sort(key=lambda c: (
        _stage_sort_index(c["stage"]),
        c["updated_at"] or "",
    ))

    return jsonify({
        "job_id": job_id,
        "job_title": job.title,
        "stage_order": PIPELINE_STAGE_ORDER,
        "candidates": candidates,
    })


@bp.get("/pipeline/<int:job_id>/history/<int:candidate_id>")
@require_auth
def get_history(job_id, candidate_id):
    """单个候选人在某岗位的阶段流转时间线（按时间正序）。"""
    job = db.session.get(Job, job_id)
    if job is None or not same_org(job, g.org_id):
        return jsonify({"error": "岗位不存在"}), 404
    if not can_access_candidate(g.user_id, g.role, candidate_id, job_id):
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
        "stage": normalize_pipeline_stage(ps.stage),
        "ts": ps.ts.isoformat() if ps.ts else None,
        "updated_by_name": user.name if user else None,
        "note": ps.note,
    } for ps, user in rows]
    return jsonify({"job_id": job_id, "candidate_id": candidate_id, "timeline": timeline})


@bp.get("/pipeline/<int:job_id>/offer/<int:candidate_id>")
@require_auth
def get_offer(job_id, candidate_id):
    job = db.session.get(Job, job_id)
    if job is None or not same_org(job, g.org_id):
        return jsonify({"error": "岗位不存在"}), 404
    if not can_access_candidate(g.user_id, g.role, candidate_id, job_id):
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
    if db.session.get(Candidate, candidate_id) is None:
        return jsonify({"error": "候选人不存在"}), 404
    job = db.session.get(Job, job_id)
    if job is None or not same_org(job, g.org_id):
        return jsonify({"error": "岗位不存在"}), 404
    if not can_access_candidate(g.user_id, g.role, candidate_id, job_id):
        return jsonify({"error": "Forbidden"}), 403
    if not can_manage_job(g.user_id, g.role, job):
        return jsonify({"error": "Forbidden"}), 403
    if not job_is_active(job):
        return jsonify({"error": "岗位已关闭，请先恢复在招后再发放 Offer"}), 400
    data = request.get_json() or {}
    offer = (OfferRecord.query
             .filter_by(candidate_id=candidate_id, job_id=job_id)
             .order_by(OfferRecord.id.desc())
             .first())
    if offer is None:
        offer = OfferRecord(org_id=g.org_id, candidate_id=candidate_id, job_id=job_id, created_by=g.user_id)
        db.session.add(offer)

    offer.salary_range = str(data.get("salary_range") or "")[:120]
    offer.onboard_date = _parse_date(data.get("onboard_date"))
    offer.approval_status = str(data.get("approval_status") or "draft")[:40]
    offer.note = str(data.get("note") or "")
    db.session.commit()
    record_event("offer.saved", entity_id=candidate_id, entity_type="candidate",
                 payload={"job_id": job_id, "approval_status": offer.approval_status})
    return jsonify(_offer_payload(offer))
