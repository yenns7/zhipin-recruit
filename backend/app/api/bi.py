from datetime import date, datetime, timedelta
from flask import Blueprint, request, jsonify, g
from ..middleware.auth import require_auth, require_role
from .. import db
from ..models import (
    Candidate,
    Event,
    InterviewAssignment,
    InterviewFeedback,
    Job,
    Match,
    PipelineStage,
    RecruitmentDemand,
    UploadBatch,
    User,
)
from .pipeline import _latest_stage_subquery
from sqlalchemy import func

bp = Blueprint("bi", __name__)

STAGE_LABELS = {
    "pending": "待筛选",
    "ai_screen": "AI初筛",
    "business_review": "业务待反馈",
    "interview_first": "一面",
    "interview_second": "二面",
    "interview_final": "终面",
    "offer": "Offer",
    "onboarded": "已入职",
    "rejected": "已淘汰",
}
TERMINAL_STAGES = {"onboarded", "rejected"}
OPEN_DEMAND_STATUSES = {"pending", "active"}


def _safe_rate(numerator, denominator):
    base = max(int(denominator or 0), int(numerator or 0), 1)
    return round((int(numerator or 0) / base) * 100, 1)


def _funnel(hr_id=None, days=30, job_id=None):
    """
    招聘漏斗：按每个 (candidate_id, job_id) 的【当前阶段】去重计数。
    PipelineStage 是 append-only 流水表，直接 group by stage 会把同一候选人的
    历史流转重复计入多个阶段，导致漏斗虚高。这里先取每对的最新一行再聚合。
    """
    cutoff = datetime.utcnow() - timedelta(days=days)
    base = db.session.query(
        PipelineStage.candidate_id.label("candidate_id"),
        PipelineStage.job_id.label("job_id"),
        func.max(PipelineStage.id).label("max_id"),
    ).filter(PipelineStage.ts >= cutoff)
    if hr_id:
        base = base.filter(PipelineStage.updated_by == hr_id)
    if job_id:
        base = base.filter(PipelineStage.job_id == job_id)
    latest = base.group_by(
        PipelineStage.candidate_id, PipelineStage.job_id
    ).subquery()

    rows = (
        db.session.query(PipelineStage.stage, func.count(PipelineStage.id))
        .join(latest, PipelineStage.id == latest.c.max_id)
        .group_by(PipelineStage.stage)
        .all()
    )
    stages = {s: c for s, c in rows}
    pipeline_total = sum(stages.values())
    stages["pipeline_total"] = pipeline_total
    stages["conversion_rate"] = _safe_rate(stages.get("onboarded", 0), pipeline_total)
    return stages


def _days_since(value, now):
    if value is None:
        return 0
    return max(0, (now - value).days)


def _alert_payload(kind, priority, title, detail, candidate, job, stage, age_days):
    return {
        "kind": kind,
        "priority": priority,
        "title": title,
        "detail": detail,
        "candidate_id": candidate.id,
        "candidate_name": candidate.name_masked or f"候选人 {candidate.id}",
        "job_id": job.id,
        "job_title": job.title,
        "stage": stage,
        "stage_label": STAGE_LABELS.get(stage, stage),
        "age_days": age_days,
        "action_path": f"/pipeline?job={job.id}&candidate={candidate.id}",
    }


def _manager_alerts(limit=8, stale_days=7):
    """管理者待办提醒：只聚合现有流程和面试数据，不创建新状态。"""
    now = datetime.utcnow()
    alerts = []

    latest = _latest_stage_subquery()
    stale_rows = (
        db.session.query(PipelineStage, Candidate, Job, User)
        .join(latest, PipelineStage.id == latest.c.max_id)
        .join(Candidate, Candidate.id == PipelineStage.candidate_id)
        .join(Job, Job.id == PipelineStage.job_id)
        .outerjoin(User, User.id == PipelineStage.updated_by)
        .filter(~PipelineStage.stage.in_(TERMINAL_STAGES))
        .filter(PipelineStage.ts <= now - timedelta(days=stale_days))
        .order_by(PipelineStage.ts.asc())
        .limit(limit)
        .all()
    )
    for stage, candidate, job, owner in stale_rows:
        age_days = _days_since(stage.ts, now)
        stage_label = STAGE_LABELS.get(stage.stage, stage.stage)
        owner_name = owner.name if owner else "未记录负责人"
        kind = "business_feedback_overdue" if stage.stage == "business_review" else "stale_pipeline"
        title = (
            f"{candidate.name_masked or f'候选人 {candidate.id}'}业务反馈超时"
            if stage.stage == "business_review"
            else f"{candidate.name_masked or f'候选人 {candidate.id}'}停留过久"
        )
        alerts.append(_alert_payload(
            kind,
            "high" if age_days >= 14 else "medium",
            title,
            f"{job.title} · {stage_label} 已 {age_days} 天未推进 · {owner_name}",
            candidate,
            job,
            stage.stage,
            age_days,
        ))

    remaining = max(0, limit - len(alerts))
    if remaining == 0:
        return alerts

    has_feedback = (
        db.session.query(InterviewFeedback.id)
        .filter(InterviewFeedback.candidate_id == InterviewAssignment.candidate_id)
        .filter(InterviewFeedback.job_id == InterviewAssignment.job_id)
        .filter(InterviewFeedback.round == InterviewAssignment.round)
        .exists()
    )
    feedback_rows = (
        db.session.query(InterviewAssignment, Candidate, Job, User)
        .join(Candidate, Candidate.id == InterviewAssignment.candidate_id)
        .join(Job, Job.id == InterviewAssignment.job_id)
        .outerjoin(User, User.id == InterviewAssignment.interviewer_id)
        .filter(InterviewAssignment.scheduled_at.isnot(None))
        .filter(InterviewAssignment.scheduled_at <= now)
        .filter(~has_feedback)
        .order_by(InterviewAssignment.scheduled_at.asc())
        .limit(remaining)
        .all()
    )
    for assignment, candidate, job, interviewer in feedback_rows:
        age_days = _days_since(assignment.scheduled_at, now)
        round_label = STAGE_LABELS.get(assignment.round, assignment.round)
        interviewer_name = interviewer.name if interviewer else "未记录面试官"
        alerts.append(_alert_payload(
            "pending_interview_feedback",
            "high",
            f"{candidate.name_masked or f'候选人 {candidate.id}'}面试反馈待补",
            f"{job.title} · {round_label} 已结束 {age_days} 天 · {interviewer_name}",
            candidate,
            job,
            assignment.round,
            age_days,
        ))

    return alerts


def _demand_health_metrics():
    """招聘需求健康度：从需求表和当前流程状态直接汇总。"""
    today = date.today()
    open_demands = (
        RecruitmentDemand.query
        .filter(RecruitmentDemand.status.in_(OPEN_DEMAND_STATUSES))
        .all()
    )
    priority_counts = {"A": 0, "B": 0, "C": 0}

    latest = _latest_stage_subquery()
    business_job_ids = {
        row[0]
        for row in (
            db.session.query(PipelineStage.job_id)
            .join(latest, PipelineStage.id == latest.c.max_id)
            .filter(PipelineStage.stage == "business_review")
            .distinct()
            .all()
        )
    }
    recommended_job_ids = {
        row[0]
        for row in (
            db.session.query(PipelineStage.job_id)
            .filter(PipelineStage.job_id.in_([demand.job_id for demand in open_demands] or [-1]))
            .distinct()
            .all()
        )
    }

    overdue = 0
    hr_no_recommendation = 0
    business_feedback_pending = 0
    for demand in open_demands:
        priority = (demand.priority or "B").upper()
        priority_counts[priority if priority in priority_counts else "B"] += 1

        if demand.target_date and demand.target_date < today:
            overdue += 1

        start_date = demand.accepted_at or demand.requested_at
        if (
            start_date
            and demand.job_id not in recommended_job_ids
            and (today - start_date).days >= 7
        ):
            hr_no_recommendation += 1

        if demand.job_id in business_job_ids:
            business_feedback_pending += 1

    return {
        "active_total": len(open_demands),
        "priority_counts": priority_counts,
        "overdue": overdue,
        "hr_no_recommendation": hr_no_recommendation,
        "business_feedback_pending": business_feedback_pending,
    }


def _resume_consumption_metrics(days=30):
    """简历消化度：统计入库简历是否被匹配、是否进入流程。"""
    cutoff = datetime.utcnow() - timedelta(days=days)
    candidate_ids = [
        row[0]
        for row in (
            db.session.query(Candidate.id)
            .filter(Candidate.created_at >= cutoff)
            .all()
        )
    ]
    total_candidates = len(candidate_ids)
    if total_candidates == 0:
        return {
            "total_candidates": 0,
            "linked_to_job": 0,
            "unassigned": 0,
            "matched_candidates": 0,
            "in_pipeline": 0,
            "not_in_pipeline": 0,
            "match_rate": 0.0,
            "pipeline_entry_rate": 0.0,
        }

    linked_to_job = (
        db.session.query(func.count(func.distinct(Candidate.id)))
        .join(UploadBatch, Candidate.upload_batch_id == UploadBatch.id)
        .filter(Candidate.id.in_(candidate_ids))
        .filter(UploadBatch.target_job_id.isnot(None))
        .scalar()
        or 0
    )
    matched_candidates = (
        db.session.query(func.count(func.distinct(Match.candidate_id)))
        .filter(Match.candidate_id.in_(candidate_ids))
        .scalar()
        or 0
    )
    in_pipeline = (
        db.session.query(func.count(func.distinct(PipelineStage.candidate_id)))
        .filter(PipelineStage.candidate_id.in_(candidate_ids))
        .scalar()
        or 0
    )

    return {
        "total_candidates": total_candidates,
        "linked_to_job": linked_to_job,
        "unassigned": total_candidates - linked_to_job,
        "matched_candidates": matched_candidates,
        "in_pipeline": in_pipeline,
        "not_in_pipeline": total_candidates - in_pipeline,
        "match_rate": _safe_rate(matched_candidates, total_candidates),
        "pipeline_entry_rate": _safe_rate(in_pipeline, total_candidates),
    }


@bp.get("/bi/overview")
@require_auth
@require_role("manager", "admin")
def overview():
    days = int(request.args.get("days", 30))
    funnel = _funnel(days=days)
    cutoff = datetime.utcnow() - timedelta(days=days)

    # 各专员效能
    staff_rows = (
        db.session.query(
            User.id, User.name,
            func.count(func.distinct(
                db.case((Event.action == "resume.uploaded", Event.entity_id))
            )).label("resumes"),
            func.count(func.distinct(
                db.case((Event.action == "interview.started", Event.entity_id))
            )).label("screens"),
            func.count(func.distinct(
                db.case((Event.action == "candidate.onboarded", Event.entity_id))
            )).label("onboarded"),
        )
        .outerjoin(Event, (Event.actor_id == User.id) & (Event.ts >= cutoff))
        .filter(User.role == "recruiter", User.is_active.is_(True))
        .group_by(User.id, User.name)
        .all()
    )
    staff = []
    for hr_id, name, resumes, screens, onboarded in staff_rows:
        staff.append({
            "hr_id": hr_id, "name": name,
            "resumes": resumes or 0,
            "screens": screens or 0,
            "onboarded": onboarded or 0,
            "conversion_rate": _safe_rate(onboarded or 0, resumes or 0),
        })

    return jsonify({
        "funnel": funnel,
        "staff": staff,
        "alerts": _manager_alerts(),
        "demands": _demand_health_metrics(),
        "resumes": _resume_consumption_metrics(days=days),
    })


@bp.get("/bi/staff/<int:hr_id>")
@require_auth
def staff_detail(hr_id):
    if g.role == "recruiter" and g.user_id != hr_id:
        return jsonify({"error": "Forbidden"}), 403
    days = int(request.args.get("days", 30))
    funnel = _funnel(hr_id=hr_id, days=days)
    return jsonify({"hr_id": hr_id, "funnel": funnel})


@bp.get("/bi/job/<int:job_id>")
@require_auth
def job_funnel(job_id):
    """单岗位招聘漏斗：该岗位各阶段人数 + 转化率。所有登录角色可看。"""
    from ..models import Job
    job = Job.query.get_or_404(job_id)
    days = int(request.args.get("days", 90))
    funnel = _funnel(days=days, job_id=job_id)
    return jsonify({"job_id": job_id, "job_title": job.title, "funnel": funnel})
