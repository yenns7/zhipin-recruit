from datetime import date
from flask import Blueprint, request, jsonify, g
from sqlalchemy import func
from ..middleware.auth import require_auth
from ..middleware.events import record_event
from .. import db
from ..models import Candidate, CandidateDisposition, Job, OfferRecord, PipelineStage, VALID_STAGES, User
from .access import (
    can_access_candidate,
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
    if not can_access_candidate(g.user_id, g.role, candidate_id, job_id):
        return jsonify({"error": "Forbidden"}), 403
    if (job.status or "active") != "active":
        return jsonify({"error": "岗位已关闭，请先恢复岗位"}), 400

    # 当前阶段（用于事件记录与返回，便于前端给出"从 X 到 Y"的反馈）
    prev = (
        PipelineStage.query
        .filter_by(candidate_id=candidate_id, job_id=job_id)
        .order_by(PipelineStage.id.desc())
        .first()
    )
    from_stage = normalize_pipeline_stage(prev.stage) if prev else None

    # 阶段回退校验：禁止从靠后阶段回退到靠前阶段。
    # 例外1：首次进入流程（无前置阶段，from_stage 为 None）放行，目标可为任意非 rejected 阶段。
    # 例外2：目标是 rejected（淘汰终态）放行，淘汰可从任意阶段发生。
    if (
        from_stage is not None
        and to_stage != "rejected"
        and from_stage in STAGE_ORDER
        and to_stage in STAGE_ORDER
        and STAGE_ORDER.index(from_stage) > STAGE_ORDER.index(to_stage)
    ):
        return jsonify({"error": "不允许回退阶段，如需修正请联系管理员"}), 400

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
        .join(Candidate, Candidate.id == PipelineStage.candidate_id)
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
    if job is None:
        return jsonify({"error": "岗位不存在"}), 404

    latest = _latest_stage_subquery(job_id)
    rows = (
        db.session.query(PipelineStage, Candidate, User)
        .join(latest, PipelineStage.id == latest.c.max_id)
        .join(Candidate, Candidate.id == PipelineStage.candidate_id)
        .outerjoin(User, User.id == PipelineStage.updated_by)
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
    if db.session.get(Job, job_id) is None:
        return jsonify({"error": "岗位不存在"}), 404
    if not can_access_candidate(g.user_id, g.role, candidate_id, job_id):
        return jsonify({"error": "Forbidden"}), 403
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
