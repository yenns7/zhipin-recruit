from collections import defaultdict
from datetime import date, timedelta
from flask import Blueprint, request, jsonify, g
from ..middleware.auth import require_auth, require_role
from .. import db
from ..models import (
    Candidate,
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
from ..source_channels import normalize_resume_source_channel
from ..time_utils import utc_now
from sqlalchemy import func
from sqlalchemy.orm import aliased

bp = Blueprint("bi", __name__)

ALLOWED_BI_DAYS = {7, 30, 90}
STAGE_LABELS = {
    "pending": "待筛选",
    "ai_screen": "AI初筛",
    "business_review": "业务待反馈",
    "interview": "面试中",
    "interview_first": "一面",
    "interview_second": "二面",
    "interview_final": "终面",
    "offer": "Offer",
    "onboarded": "已入职",
    "rejected": "已淘汰",
}
TERMINAL_STAGES = {"onboarded", "rejected"}
OPEN_DEMAND_STATUSES = {"pending", "active"}
PERFORMANCE_STAGE_FIELDS = {
    "business_review": "business_review_entries",
    "interview": "interview_entries",
    "offer": "offer_entries",
    "onboarded": "onboarded",
}
LEGACY_INTERVIEW_STAGE_FIELDS = {
    "interview_first": "first_interview_entries",
    "interview_second": "second_interview_entries",
    "interview_final": "final_interview_entries",
}
INTERVIEW_STAGES = {"interview", "interview_first", "interview_second", "interview_final"}
INTERVIEW_ROUND_PREFIXES = {
    "interview_first": "first_interview",
    "interview_second": "second_interview",
    "interview_final": "final_interview",
}
INTERVIEW_ROUND_LABELS = {
    "round_1": "第 1 轮面试",
    "round_2": "第 2 轮面试",
    "round_3": "第 3 轮面试",
    "additional": "加面",
    "hr": "HR 面",
    "business": "业务面",
    "technical": "技术面",
    "interview_first": "第 1 轮面试",
    "interview_second": "第 2 轮面试",
    "interview_final": "第 3 轮面试",
}
LEGACY_BI_PUBLIC_FIELDS = {
    "first_interview_entries",
    "first_interview_feedbacks",
    "first_interview_passed",
    "first_interview_pass_rate",
    "second_interview_entries",
    "second_interview_feedbacks",
    "second_interview_passed",
    "second_interview_pass_rate",
    "final_interview_entries",
    "final_interview_feedbacks",
    "final_interview_passed",
    "final_interview_pass_rate",
    "first_interview_rate",
}


def _public_metric_row(row):
    return {
        key: value
        for key, value in row.items()
        if key not in LEGACY_BI_PUBLIC_FIELDS
    }


def _safe_rate(numerator, denominator):
    numerator = int(numerator or 0)
    denominator = int(denominator or 0)
    if denominator <= 0:
        return 0.0
    return round((numerator / denominator) * 100, 1)


def _parse_days(default=30):
    try:
        days = int(request.args.get("days", default))
    except (TypeError, ValueError):
        return default
    return days if days in ALLOWED_BI_DAYS else default


def _round_label(round_name):
    return INTERVIEW_ROUND_LABELS.get(round_name or "", round_name or "未记录轮次")


def _department_label(job):
    return (job.department or "").strip() or "未记录部门"


def _funnel(hr_id=None, days=30, job_id=None):
    """
    招聘漏斗：按每个 (candidate_id, job_id) 的【当前阶段】去重计数。
    PipelineStage 是 append-only 流水表，直接 group by stage 会把同一候选人的
    历史流转重复计入多个阶段，导致漏斗虚高。这里先取每对的全量最新一行再聚合。
    days 参数保留给旧调用兼容；当前阶段分布是存量口径，不受周期筛选影响。
    """
    latest = _latest_stage_subquery(job_id=job_id)

    query = (
        db.session.query(PipelineStage.stage, func.count(PipelineStage.id))
        .join(latest, PipelineStage.id == latest.c.max_id)
    )
    if hr_id:
        query = (
            query
            .join(Candidate, Candidate.id == PipelineStage.candidate_id)
            .filter(Candidate.owner_hr_id == hr_id)
        )
    rows = query.group_by(PipelineStage.stage).all()
    stages = {}
    for stage, count in rows:
        normalized = "interview" if stage in INTERVIEW_STAGES else stage
        stages[normalized] = stages.get(normalized, 0) + count
    pipeline_total = sum(
        count
        for stage, count in stages.items()
        if stage not in TERMINAL_STAGES
    )
    archived_total = sum(
        count
        for stage, count in stages.items()
        if stage in TERMINAL_STAGES
    )
    funnel_total = pipeline_total + archived_total
    stages["pipeline_total"] = pipeline_total
    stages["archived_total"] = archived_total
    stages["funnel_total"] = funnel_total
    stages["conversion_rate"] = _safe_rate(stages.get("onboarded", 0), funnel_total)
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
    now = utc_now()
    alerts = []

    latest = _latest_stage_subquery()
    owner_user = aliased(User)
    updater_user = aliased(User)
    stale_rows = (
        db.session.query(PipelineStage, Candidate, Job, owner_user, updater_user)
        .join(latest, PipelineStage.id == latest.c.max_id)
        .join(Candidate, Candidate.id == PipelineStage.candidate_id)
        .join(Job, Job.id == PipelineStage.job_id)
        .outerjoin(owner_user, owner_user.id == Candidate.owner_hr_id)
        .outerjoin(updater_user, updater_user.id == PipelineStage.updated_by)
        .filter(~PipelineStage.stage.in_(TERMINAL_STAGES))
        .filter(PipelineStage.ts <= now - timedelta(days=stale_days))
        .order_by(PipelineStage.ts.asc())
        .limit(limit)
        .all()
    )
    for stage, candidate, job, owner, updater in stale_rows:
        age_days = _days_since(stage.ts, now)
        stage_label = STAGE_LABELS.get(stage.stage, stage.stage)
        owner_name = owner.name if owner else "未记录负责人"
        updater_name = updater.name if updater else "未记录推进人"
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
            f"{job.title} · {stage_label} 已 {age_days} 天未推进 · 负责人 {owner_name} · 最后推进 {updater_name}",
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
    open_job_ids = [demand.job_id for demand in open_demands]
    recommended_job_ids = set()
    if open_job_ids:
        recommended_job_ids = {
            row[0]
            for row in (
                db.session.query(PipelineStage.job_id)
                .join(latest, PipelineStage.id == latest.c.max_id)
                .filter(PipelineStage.job_id.in_(open_job_ids))
                .filter(~PipelineStage.stage.in_(TERMINAL_STAGES))
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
    cutoff = utc_now() - timedelta(days=days)
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


def _empty_staff_performance(hr_id, name):
    return {
        "hr_id": hr_id,
        "name": name,
        "resumes": 0,
        "parsed_ok": 0,
        "parse_failed": 0,
        "parse_pending": 0,
        "screens": 0,
        "effective_recommendations": 0,
        "business_review_entries": 0,
        "interview_entries": 0,
        "interview_feedbacks": 0,
        "interview_passed": 0,
        "interview_pass_rate": 0.0,
        "interview_to_offer_rate": 0.0,
        "first_interview_entries": 0,
        "first_interview_feedbacks": 0,
        "first_interview_passed": 0,
        "first_interview_pass_rate": 0.0,
        "second_interview_entries": 0,
        "second_interview_feedbacks": 0,
        "second_interview_passed": 0,
        "second_interview_pass_rate": 0.0,
        "final_interview_entries": 0,
        "final_interview_feedbacks": 0,
        "final_interview_passed": 0,
        "final_interview_pass_rate": 0.0,
        "offer_entries": 0,
        "onboarded": 0,
        "conversion_rate": 0.0,
        "recommendation_to_onboard_rate": 0.0,
        "feedback_pending": 0,
        "feedback_overdue": 0,
    }


def _staff_performance_metrics(days=30):
    """HR 月度绩效：按候选人 owner_hr_id 归属，避免被操作人字段带偏。"""
    cutoff = utc_now() - timedelta(days=days)
    now = utc_now()
    recruiters = (
        User.query
        .filter(User.role == "recruiter", User.is_active.is_(True))
        .order_by(User.id.asc())
        .all()
    )
    staff = {user.id: _empty_staff_performance(user.id, user.name) for user in recruiters}
    active_hr_ids = list(staff.keys())
    if not active_hr_ids:
        return []

    candidate_rows = (
        db.session.query(Candidate.id, Candidate.owner_hr_id, Candidate.parse_status)
        .filter(Candidate.created_at >= cutoff)
        .filter(Candidate.owner_hr_id.in_(active_hr_ids))
        .all()
    )
    for _, owner_hr_id, parse_status in candidate_rows:
        row = staff[owner_hr_id]
        row["resumes"] += 1
        if parse_status == "failed":
            row["parse_failed"] += 1
        elif parse_status == "ok":
            row["parsed_ok"] += 1
        else:
            row["parse_pending"] += 1

    recommendation_pairs = defaultdict(set)
    stage_pairs = defaultdict(lambda: defaultdict(set))
    stage_rows = (
        db.session.query(
            PipelineStage.candidate_id,
            PipelineStage.job_id,
            PipelineStage.stage,
            Candidate.owner_hr_id,
        )
        .join(Candidate, Candidate.id == PipelineStage.candidate_id)
        .filter(Candidate.created_at >= cutoff)
        .filter(Candidate.owner_hr_id.in_(active_hr_ids))
        .all()
    )
    for candidate_id, job_id, stage, owner_hr_id in stage_rows:
        pair = (candidate_id, job_id)
        recommendation_pairs[owner_hr_id].add(pair)
        if stage in INTERVIEW_STAGES:
            stage_pairs[owner_hr_id]["interview"].add(pair)
        if stage in PERFORMANCE_STAGE_FIELDS:
            stage_pairs[owner_hr_id][stage].add(pair)
        if stage in LEGACY_INTERVIEW_STAGE_FIELDS:
            stage_pairs[owner_hr_id][stage].add(pair)

    for owner_hr_id, pairs in recommendation_pairs.items():
        staff[owner_hr_id]["effective_recommendations"] = len(pairs)
    for owner_hr_id, stages in stage_pairs.items():
        row = staff[owner_hr_id]
        for stage, field in PERFORMANCE_STAGE_FIELDS.items():
            row[field] = len(stages.get(stage, set()))
        for stage, field in LEGACY_INTERVIEW_STAGE_FIELDS.items():
            row[field] = len(stages.get(stage, set()))
        row["screens"] = row["business_review_entries"]

    feedback_pairs = defaultdict(lambda: defaultdict(set))
    passed_pairs = defaultdict(lambda: defaultdict(set))
    feedback_rows = (
        db.session.query(
            InterviewFeedback.candidate_id,
            InterviewFeedback.job_id,
            InterviewFeedback.round,
            InterviewFeedback.passed,
            Candidate.owner_hr_id,
        )
        .join(Candidate, Candidate.id == InterviewFeedback.candidate_id)
        .filter(Candidate.created_at >= cutoff)
        .filter(Candidate.owner_hr_id.in_(active_hr_ids))
        .all()
    )
    for candidate_id, job_id, interview_round, passed, owner_hr_id in feedback_rows:
        pair = (candidate_id, job_id)
        feedback_pairs[owner_hr_id]["interview"].add(pair)
        if passed is True:
            passed_pairs[owner_hr_id]["interview"].add(pair)
        if interview_round not in INTERVIEW_ROUND_PREFIXES:
            continue
        feedback_pairs[owner_hr_id][interview_round].add(pair)
        if passed is True:
            passed_pairs[owner_hr_id][interview_round].add(pair)

    for owner_hr_id, rounds in feedback_pairs.items():
        row = staff[owner_hr_id]
        for interview_round, prefix in INTERVIEW_ROUND_PREFIXES.items():
            row[f"{prefix}_feedbacks"] = len(rounds.get(interview_round, set()))
            row[f"{prefix}_passed"] = len(passed_pairs[owner_hr_id].get(interview_round, set()))

    feedback_keys = {
        (candidate_id, job_id, interview_round)
        for candidate_id, job_id, interview_round in (
            db.session.query(
                InterviewFeedback.candidate_id,
                InterviewFeedback.job_id,
                InterviewFeedback.round,
            )
            .all()
        )
    }
    assignment_rows = (
        db.session.query(
            InterviewAssignment.candidate_id,
            InterviewAssignment.job_id,
            InterviewAssignment.round,
            InterviewAssignment.scheduled_at,
            Candidate.owner_hr_id,
        )
        .join(Candidate, Candidate.id == InterviewAssignment.candidate_id)
        .filter(InterviewAssignment.scheduled_at.isnot(None))
        .filter(InterviewAssignment.scheduled_at <= now)
        .filter(Candidate.created_at >= cutoff)
        .filter(Candidate.owner_hr_id.in_(active_hr_ids))
        .all()
    )
    for candidate_id, job_id, interview_round, scheduled_at, owner_hr_id in assignment_rows:
        if (candidate_id, job_id, interview_round) in feedback_keys:
            continue
        staff[owner_hr_id]["feedback_pending"] += 1
        if scheduled_at and scheduled_at <= now:
            staff[owner_hr_id]["feedback_overdue"] += 1

    for row in staff.values():
        row["interview_feedbacks"] = len(feedback_pairs[row["hr_id"]].get("interview", set()))
        row["interview_passed"] = len(passed_pairs[row["hr_id"]].get("interview", set()))
        row["interview_pass_rate"] = _safe_rate(
            row["interview_passed"],
            row["interview_entries"],
        )
        row["interview_to_offer_rate"] = _safe_rate(
            row["offer_entries"],
            row["interview_entries"],
        )
        for interview_round, prefix in INTERVIEW_ROUND_PREFIXES.items():
            row[f"{prefix}_pass_rate"] = _safe_rate(
                row[f"{prefix}_passed"],
                row[f"{prefix}_entries"],
            )
        row["conversion_rate"] = _safe_rate(row["onboarded"], row["resumes"])
        row["recommendation_to_onboard_rate"] = _safe_rate(
            row["onboarded"],
            row["effective_recommendations"],
        )

    return list(staff.values())


def _source_label(channel):
    label = normalize_resume_source_channel(channel)
    return label or "未记录来源"


def _empty_source_quality(channel):
    return {
        "channel": channel,
        "resumes": 0,
        "parsed_ok": 0,
        "parse_failed": 0,
        "effective_recommendations": 0,
        "interview_entries": 0,
        "interview_passed": 0,
        "interview_pass_rate": 0.0,
        "interview_to_offer_rate": 0.0,
        "first_interview_entries": 0,
        "first_interview_passed": 0,
        "first_interview_pass_rate": 0.0,
        "second_interview_entries": 0,
        "second_interview_passed": 0,
        "second_interview_pass_rate": 0.0,
        "offer_entries": 0,
        "onboarded": 0,
        "first_interview_rate": 0.0,
        "onboard_rate": 0.0,
    }


def _source_quality_metrics(days=30):
    """渠道质量：复用上传批次的 source_channel 和流程/面试记录做汇总。"""
    cutoff = utc_now() - timedelta(days=days)
    sources = {}

    def row_for(channel):
        label = _source_label(channel)
        if label not in sources:
            sources[label] = _empty_source_quality(label)
        return sources[label]

    candidate_rows = (
        db.session.query(Candidate.id, Candidate.parse_status, UploadBatch.source_channel)
        .outerjoin(UploadBatch, Candidate.upload_batch_id == UploadBatch.id)
        .filter(Candidate.created_at >= cutoff)
        .all()
    )
    for _, parse_status, source_channel in candidate_rows:
        row = row_for(source_channel)
        row["resumes"] += 1
        if parse_status == "failed":
            row["parse_failed"] += 1
        elif parse_status == "ok":
            row["parsed_ok"] += 1

    stage_pairs = defaultdict(lambda: defaultdict(set))
    stage_rows = (
        db.session.query(
            PipelineStage.candidate_id,
            PipelineStage.job_id,
            PipelineStage.stage,
            UploadBatch.source_channel,
        )
        .join(Candidate, Candidate.id == PipelineStage.candidate_id)
        .outerjoin(UploadBatch, Candidate.upload_batch_id == UploadBatch.id)
        .filter(Candidate.created_at >= cutoff)
        .all()
    )
    for candidate_id, job_id, stage, source_channel in stage_rows:
        channel = _source_label(source_channel)
        pair = (candidate_id, job_id)
        stage_pairs[channel]["effective_recommendations"].add(pair)
        if stage in INTERVIEW_STAGES:
            stage_pairs[channel]["interview"].add(pair)
        if stage in {"interview_first", "interview_second", "offer", "onboarded"}:
            stage_pairs[channel][stage].add(pair)
        row_for(channel)

    for channel, stages in stage_pairs.items():
        row = row_for(channel)
        row["effective_recommendations"] = len(stages.get("effective_recommendations", set()))
        row["interview_entries"] = len(stages.get("interview", set()))
        row["first_interview_entries"] = len(stages.get("interview_first", set()))
        row["second_interview_entries"] = len(stages.get("interview_second", set()))
        row["offer_entries"] = len(stages.get("offer", set()))
        row["onboarded"] = len(stages.get("onboarded", set()))

    feedback_pairs = defaultdict(lambda: defaultdict(set))
    feedback_rows = (
        db.session.query(
            InterviewFeedback.candidate_id,
            InterviewFeedback.job_id,
            InterviewFeedback.round,
            InterviewFeedback.passed,
            UploadBatch.source_channel,
        )
        .join(Candidate, Candidate.id == InterviewFeedback.candidate_id)
        .outerjoin(UploadBatch, Candidate.upload_batch_id == UploadBatch.id)
        .filter(Candidate.created_at >= cutoff)
        .all()
    )
    for candidate_id, job_id, interview_round, passed, source_channel in feedback_rows:
        if passed is not True:
            continue
        channel = _source_label(source_channel)
        feedback_pairs[channel]["interview"].add((candidate_id, job_id))
        if interview_round in {"interview_first", "interview_second"}:
            feedback_pairs[channel][interview_round].add((candidate_id, job_id))
        row_for(channel)

    for channel, rounds in feedback_pairs.items():
        row = row_for(channel)
        row["interview_passed"] = len(rounds.get("interview", set()))
        row["first_interview_passed"] = len(rounds.get("interview_first", set()))
        row["second_interview_passed"] = len(rounds.get("interview_second", set()))

    for row in sources.values():
        row["interview_pass_rate"] = _safe_rate(
            row["interview_passed"],
            row["interview_entries"],
        )
        row["interview_to_offer_rate"] = _safe_rate(
            row["offer_entries"],
            row["interview_entries"],
        )
        row["first_interview_pass_rate"] = _safe_rate(
            row["first_interview_passed"],
            row["first_interview_entries"],
        )
        row["second_interview_pass_rate"] = _safe_rate(
            row["second_interview_passed"],
            row["second_interview_entries"],
        )
        row["first_interview_rate"] = _safe_rate(
            row["first_interview_entries"],
            row["resumes"],
        )
        row["onboard_rate"] = _safe_rate(row["onboarded"], row["resumes"])

    return sorted(
        sources.values(),
        key=lambda item: (-item["resumes"], -item["onboarded"], item["channel"]),
    )


def _rate_denominator_warning(metric, label, numerator, denominator, detail):
    numerator = int(numerator or 0)
    denominator = int(denominator or 0)
    if numerator <= denominator:
        return None
    return {
        "kind": "rate_denominator_mismatch",
        "metric": metric,
        "label": label,
        "numerator": numerator,
        "denominator": denominator,
        "detail": detail,
    }


def _collect_data_quality_warnings(staff_rows, source_rows):
    warnings = []
    for row in source_rows:
        channel = row.get("channel") or "未记录来源"
        checks = [
            (
                "source_quality.interview_to_offer_rate",
                row.get("offer_entries"),
                row.get("interview_entries"),
                f"{channel} 的 Offer 数高于面试进入数，建议检查是否存在跳阶或漏录面试阶段。",
            ),
            (
                "source_quality.interview_pass_rate",
                row.get("interview_passed"),
                row.get("interview_entries"),
                f"{channel} 的面试通过数高于面试进入数，建议检查面试反馈与流程阶段是否匹配。",
            ),
            (
                "source_quality.onboard_rate",
                row.get("onboarded"),
                row.get("resumes"),
                f"{channel} 的入职数高于本期入库简历数，建议检查来源归属或简历入库时间。",
            ),
        ]
        for metric, numerator, denominator, detail in checks:
            warning = _rate_denominator_warning(metric, channel, numerator, denominator, detail)
            if warning:
                warnings.append(warning)

    for row in staff_rows:
        name = row.get("name") or f"专员 #{row.get('hr_id')}"
        checks = [
            (
                "staff.interview_to_offer_rate",
                row.get("offer_entries"),
                row.get("interview_entries"),
                f"{name} 的 Offer 数高于面试进入数，建议检查是否存在跳阶或漏录面试阶段。",
            ),
            (
                "staff.interview_pass_rate",
                row.get("interview_passed"),
                row.get("interview_entries"),
                f"{name} 的面试通过数高于面试进入数，建议检查面试反馈与流程阶段是否匹配。",
            ),
            (
                "staff.conversion_rate",
                row.get("onboarded"),
                row.get("resumes"),
                f"{name} 的入职数高于本期入库简历数，建议检查候选人归属或简历入库时间。",
            ),
        ]
        for metric, numerator, denominator, detail in checks:
            warning = _rate_denominator_warning(metric, name, numerator, denominator, detail)
            if warning:
                warnings.append(warning)
    return warnings


def _empty_accountability_row():
    return {
        "_assigned_keys": set(),
        "_feedback_keys": set(),
        "_passed_keys": set(),
        "_rejected_keys": set(),
        "_pending_keys": set(),
        "_overdue_keys": set(),
    }


def _empty_interviewer_accountability(interviewer_id, interviewer_name):
    row = _empty_accountability_row()
    row.update({
        "interviewer_id": interviewer_id,
        "interviewer_name": interviewer_name or "未记录面试官",
    })
    return row


def _empty_round_accountability(round_name):
    row = _empty_accountability_row()
    row.update({
        "round": round_name or "unknown",
        "round_label": _round_label(round_name),
    })
    return row


def _empty_department_accountability(department):
    row = _empty_accountability_row()
    row.update({
        "department": department,
        "_job_ids": set(),
        "_interviewer_ids": set(),
        "_rounds": {},
    })
    return row


def _mark_assignment(row, key):
    row["_assigned_keys"].add(key)


def _mark_feedback(row, key, passed):
    row["_assigned_keys"].add(key)
    row["_feedback_keys"].add(key)
    if passed is True:
        row["_passed_keys"].add(key)
    elif passed is False:
        row["_rejected_keys"].add(key)


def _mark_pending(row, key, overdue=False):
    row["_pending_keys"].add(key)
    if overdue:
        row["_overdue_keys"].add(key)


def _finalize_accountability_row(row):
    assigned_count = len(row.pop("_assigned_keys"))
    feedback_submitted = len(row.pop("_feedback_keys"))
    passed_count = len(row.pop("_passed_keys"))
    rejected_count = len(row.pop("_rejected_keys"))
    pending_feedback = len(row.pop("_pending_keys"))
    overdue_feedback = len(row.pop("_overdue_keys"))
    row.update({
        "assigned_count": assigned_count,
        "feedback_submitted": feedback_submitted,
        "passed_count": passed_count,
        "rejected_count": rejected_count,
        "pending_feedback": pending_feedback,
        "overdue_feedback": overdue_feedback,
        "pass_rate": _safe_rate(passed_count, feedback_submitted),
        "reject_rate": _safe_rate(rejected_count, feedback_submitted),
    })
    return row


def _interview_accountability_metrics(days=30):
    """面试责任归因：按面试官和用人部门汇总安排、反馈、通过、拒绝、待补反馈。"""
    cutoff = utc_now() - timedelta(days=days)
    now = utc_now()
    interviewers = {}
    departments = {}

    feedback_key_rows = (
        db.session.query(
            InterviewFeedback.candidate_id,
            InterviewFeedback.job_id,
            InterviewFeedback.round,
            InterviewFeedback.interviewer_id,
        )
        .all()
    )
    feedback_round_keys_all = {
        (candidate_id, job_id, round_name)
        for candidate_id, job_id, round_name, _ in feedback_key_rows
    }

    assignment_rows = (
        db.session.query(InterviewAssignment, Job, User)
        .join(Job, Job.id == InterviewAssignment.job_id)
        .outerjoin(User, User.id == InterviewAssignment.interviewer_id)
        .filter(InterviewAssignment.scheduled_at.isnot(None))
        .filter(InterviewAssignment.scheduled_at >= cutoff)
        .all()
    )
    for assignment, job, interviewer in assignment_rows:
        key = (
            assignment.candidate_id,
            assignment.job_id,
            assignment.round,
            assignment.interviewer_id,
        )
        interviewer_name = interviewer.name if interviewer else "未记录面试官"
        interviewer_row = interviewers.setdefault(
            assignment.interviewer_id,
            _empty_interviewer_accountability(assignment.interviewer_id, interviewer_name),
        )
        department = _department_label(job)
        department_row = departments.setdefault(department, _empty_department_accountability(department))
        round_row = department_row["_rounds"].setdefault(
            assignment.round,
            _empty_round_accountability(assignment.round),
        )

        _mark_assignment(interviewer_row, key)
        _mark_assignment(department_row, key)
        _mark_assignment(round_row, key)
        department_row["_job_ids"].add(job.id)
        if assignment.interviewer_id:
            department_row["_interviewer_ids"].add(assignment.interviewer_id)

        round_key = (
            assignment.candidate_id,
            assignment.job_id,
            assignment.round,
        )
        if round_key not in feedback_round_keys_all and assignment.scheduled_at <= now:
            _mark_pending(interviewer_row, key, overdue=True)
            _mark_pending(department_row, key, overdue=True)
            _mark_pending(round_row, key, overdue=True)

    feedback_rows = (
        db.session.query(InterviewFeedback, Job, User)
        .join(Job, Job.id == InterviewFeedback.job_id)
        .outerjoin(User, User.id == InterviewFeedback.interviewer_id)
        .filter(InterviewFeedback.created_at >= cutoff)
        .all()
    )
    for feedback, job, interviewer in feedback_rows:
        key = (
            feedback.candidate_id,
            feedback.job_id,
            feedback.round,
            feedback.interviewer_id,
        )
        interviewer_name = interviewer.name if interviewer else "未记录面试官"
        interviewer_row = interviewers.setdefault(
            feedback.interviewer_id,
            _empty_interviewer_accountability(feedback.interviewer_id, interviewer_name),
        )
        department = _department_label(job)
        department_row = departments.setdefault(department, _empty_department_accountability(department))
        round_row = department_row["_rounds"].setdefault(
            feedback.round,
            _empty_round_accountability(feedback.round),
        )

        _mark_feedback(interviewer_row, key, feedback.passed)
        _mark_feedback(department_row, key, feedback.passed)
        _mark_feedback(round_row, key, feedback.passed)
        department_row["_job_ids"].add(job.id)
        if feedback.interviewer_id:
            department_row["_interviewer_ids"].add(feedback.interviewer_id)

    interviewer_rows = [
        _finalize_accountability_row(row)
        for row in interviewers.values()
    ]
    interviewer_rows.sort(
        key=lambda item: (
            -item["assigned_count"],
            -item["pending_feedback"],
            item["interviewer_name"],
        )
    )

    department_rows = []
    for row in departments.values():
        round_rows = [
            _finalize_accountability_row(round_row)
            for round_row in row.pop("_rounds").values()
        ]
        round_rows.sort(key=lambda item: (item["round_label"], item["round"]))
        row["jobs_count"] = len(row.pop("_job_ids"))
        row["interviewers_count"] = len(row.pop("_interviewer_ids"))
        row["rounds"] = round_rows
        department_rows.append(_finalize_accountability_row(row))
    department_rows.sort(
        key=lambda item: (
            -item["assigned_count"],
            -item["pending_feedback"],
            item["department"],
        )
    )

    return {
        "interviewers": interviewer_rows,
        "departments": department_rows,
    }


def _job_bi_scope(job):
    if g.role in {"manager", "admin"}:
        return "all"
    if g.role != "recruiter":
        return None
    if job.owner_hr_id == g.user_id:
        return "all"
    has_owned_candidate = (
        db.session.query(PipelineStage.id)
        .join(Candidate, Candidate.id == PipelineStage.candidate_id)
        .filter(PipelineStage.job_id == job.id)
        .filter(Candidate.owner_hr_id == g.user_id)
        .first()
        is not None
    )
    return "owned_candidates" if has_owned_candidate else None


@bp.get("/bi/overview")
@require_auth
@require_role("manager", "admin")
def overview():
    days = _parse_days(default=30)
    funnel = _funnel(days=days)
    staff_rows = [_public_metric_row(row) for row in _staff_performance_metrics(days=days)]
    source_rows = [_public_metric_row(row) for row in _source_quality_metrics(days=days)]
    accountability = _interview_accountability_metrics(days=days)

    return jsonify({
        "funnel": funnel,
        "staff": staff_rows,
        "source_quality": source_rows,
        "interviewer_accountability": accountability["interviewers"],
        "department_accountability": accountability["departments"],
        "alerts": _manager_alerts(),
        "demands": _demand_health_metrics(),
        "resumes": _resume_consumption_metrics(days=days),
        "data_quality_warnings": _collect_data_quality_warnings(staff_rows, source_rows),
    })


@bp.get("/bi/staff/<int:hr_id>")
@require_auth
def staff_detail(hr_id):
    if g.role == "recruiter" and g.user_id != hr_id:
        return jsonify({"error": "Forbidden"}), 403
    if g.role not in {"recruiter", "manager", "admin"}:
        return jsonify({"error": "Forbidden"}), 403
    days = _parse_days(default=30)
    funnel = _funnel(hr_id=hr_id, days=days)
    user = db.session.get(User, hr_id)
    performance = next(
        (
            row
            for row in _staff_performance_metrics(days=days)
            if row["hr_id"] == hr_id
        ),
        _empty_staff_performance(
            hr_id,
            user.name if user else f"专员 #{hr_id}",
        ),
    )
    return jsonify({
        "hr_id": hr_id,
        "funnel": funnel,
        "performance": _public_metric_row(performance),
        "data_quality_warnings": _collect_data_quality_warnings([_public_metric_row(performance)], []),
    })


@bp.get("/bi/job/<int:job_id>")
@require_auth
def job_funnel(job_id):
    """单岗位招聘漏斗：主管/管理员可看全部；招聘专员只看自己负责范围。"""
    from ..models import Job
    job = db.get_or_404(Job, job_id)
    scope = _job_bi_scope(job)
    if scope is None:
        return jsonify({"error": "Forbidden"}), 403
    days = _parse_days(default=90)
    hr_id = g.user_id if scope == "owned_candidates" else None
    funnel = _funnel(hr_id=hr_id, days=days, job_id=job_id)
    return jsonify({
        "job_id": job_id,
        "job_title": job.title,
        "scope": scope,
        "funnel": funnel,
    })
