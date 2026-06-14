from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, g
from ..middleware.auth import require_auth, require_role
from .. import db
from ..models import Event, PipelineStage, User
from sqlalchemy import func

bp = Blueprint("bi", __name__)


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
    top = stages.get("pending", 1) or 1
    stages["conversion_rate"] = round(stages.get("onboarded", 0) / top * 100, 1)
    return stages


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
        .filter(User.role == "recruiter")
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
            "conversion_rate": round((onboarded or 0) / (resumes or 1) * 100, 1),
        })

    return jsonify({"funnel": funnel, "staff": staff})


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
