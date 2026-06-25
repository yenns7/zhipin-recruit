from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, g
from ..middleware.auth import require_auth
from ..middleware.events import record_event
from ..services.interview_service import PreScreenService
from .. import db
from ..models import Candidate, Interview, InterviewAssignment, Job
from ..time_utils import utc_now
from .access import (
    can_access_candidate,
    can_manage_job,
    job_is_active,
    same_org,
    visible_candidate_query,
)

bp = Blueprint("interview", __name__)


INTERVIEW_ROUNDS = {
    "round_1",
    "round_2",
    "round_3",
    "additional",
    "hr",
    "business",
    "technical",
    # 兼容历史数据，不再作为管道主阶段使用。
    "interview_first",
    "interview_second",
    "interview_final",
}

FEEDBACK_REASON_TAGS = {
    "专业能力不匹配",
    "项目经验不足",
    "行业经验不匹配",
    "沟通表达不符合预期",
    "稳定性存疑",
    "薪资期望不匹配",
    "到岗时间不匹配",
    "候选人意愿不强",
    "候选人主动放弃",
    "候选人已接受其他机会",
    "工作地点不匹配",
    "面试时间无法协调",
    "简历信息存疑",
    "背景匹配度不足",
    "岗位要求变化",
    "部门内部意见不一致",
    "面试标准变化",
    "HC暂缓或冻结",
    "岗位暂停招聘",
    "组织架构或汇报关系变化",
    "优先级下降",
    "薪资预算变化",
    "需要加面确认",
    "需要补充作品或案例",
    "面试官暂未形成结论",
    "其他",
}


def _parse_datetime(value):
    if not value:
        return None
    raw = str(value).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def _normalize_for_compare(value):
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _sanitize_evaluation(value):
    if not isinstance(value, dict):
        return {}
    evaluation = {}
    for key, raw_score in value.items():
        name = str(key or "").strip()[:40]
        if not name:
            continue
        try:
            score = int(raw_score)
        except (TypeError, ValueError):
            continue
        evaluation[name] = min(5, max(1, score))
    return evaluation


def _sanitize_reason_tags(value):
    if not isinstance(value, list):
        return []
    tags = []
    seen = set()
    for item in value:
        tag = str(item or "").strip()[:40]
        if not tag or tag not in FEEDBACK_REASON_TAGS or tag in seen:
            continue
        tags.append(tag)
        seen.add(tag)
        if len(tags) >= 8:
            break
    return tags


def _resume_info(candidate):
    resume = candidate.resume_json or {}
    if not isinstance(resume, dict):
        return {}
    info = resume.get("extracted_info") or {}
    return info if isinstance(info, dict) else {}


def _top_candidate_tags(candidate, limit=5):
    tags = sorted(
        [tag for tag in candidate.tags if tag.tag],
        key=lambda tag: (-(tag.score or 0), tag.tag),
    )
    return [tag.tag for tag in tags[:limit]]


def _build_interview_guide(candidate, job, round_name):
    info = _resume_info(candidate)
    skills = _top_candidate_tags(candidate)
    summary = str(info.get("summary") or "").strip()
    jd_text = f"{job.title} {job.jd_text or ''}"
    focus = []
    if round_name in {"round_3", "interview_final"}:
        focus.extend(["最终匹配度", "入职动机", "团队协作与稳定性"])
    elif round_name in {"round_2", "interview_second", "technical"}:
        focus.extend(["岗位深度能力", "项目复盘", "跨团队推动"])
    elif round_name == "hr":
        focus.extend(["入职动机", "薪资预期", "稳定性"])
    elif round_name == "business":
        focus.extend(["业务理解", "岗位匹配", "协作方式"])
    elif round_name == "additional":
        focus.extend(["补充疑点", "关键风险", "决策分歧"])
    else:
        focus.extend(["岗位基础匹配", "核心技能验证", "项目真实性"])
    focus.extend(skills[:3])
    focus = list(dict.fromkeys([item for item in focus if item]))[:6]

    questions = []
    for skill in skills[:4]:
        questions.append(f"请结合过往项目说明你如何使用或验证「{skill}」能力？")
    if "用户研究" in jd_text and "用户研究" not in skills:
        questions.append("请举例说明你如何从用户研究中提炼产品机会，并推动落地？")
    if "数据" in jd_text and not any("数据" in skill for skill in skills):
        questions.append("请讲一个你用数据分析影响产品决策的案例。")
    if summary:
        questions.append(f"简历提到「{summary[:32]}」，请展开讲最能代表你能力的项目。")
    questions.extend([
        "最近一个完整项目中，你负责的关键决策是什么，结果如何衡量？",
        "如果入职该岗位，前三个月你会优先验证哪些问题？",
    ])
    questions = list(dict.fromkeys(questions))[:8]

    return {
        "candidate_id": candidate.id,
        "job_id": job.id,
        "round": round_name,
        "focus": focus,
        "questions": questions,
        "risks": [
            "确认简历核心项目是否为本人主导",
            "追问岗位关键能力与实际产出的对应关系",
            "对评分分歧点做事实澄清",
        ],
        "required_checks": ["面试结论", "是否推进下一轮", "关键优势与顾虑"],
    }


def _assignment_payload(item):
    from ..models import Candidate, InterviewFeedback, User

    candidate = db.session.get(Candidate, item.candidate_id)
    job = db.session.get(Job, item.job_id)
    interviewer = db.session.get(User, item.interviewer_id)
    creator = db.session.get(User, item.created_by) if item.created_by else None
    feedback_submitted = InterviewFeedback.query.filter_by(
        org_id=item.org_id or 1,
        candidate_id=item.candidate_id,
        job_id=item.job_id,
        round=item.round,
        interviewer_id=item.interviewer_id,
    ).first() is not None
    scheduled_at = _normalize_for_compare(item.scheduled_at)
    is_overdue = bool(
        scheduled_at and scheduled_at < utc_now() and not feedback_submitted
    )
    return {
        "id": item.id,
        "candidate_id": item.candidate_id,
        "name_masked": candidate.name_masked if candidate else None,
        "job_id": item.job_id,
        "job_title": job.title if job else None,
        "round": item.round,
        "interviewer_id": item.interviewer_id,
        "interviewer_name": interviewer.name if interviewer else None,
        "scheduled_at": item.scheduled_at.isoformat() if item.scheduled_at else None,
        "location": item.location or "",
        "note": item.note or "",
        "status": item.status or "scheduled",
        "feedback_submitted": feedback_submitted,
        "is_overdue": is_overdue,
        "created_by_name": creator.name if creator else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


@bp.post("/interview/start")
@require_auth
def start_interview():
    """HR 对候选人发起 AI 预筛，生成面试题"""
    data = request.get_json()
    candidate_id = data.get("candidate_id")
    job_id = data.get("job_id")
    if not candidate_id or not job_id:
        return jsonify({"error": "candidate_id and job_id required"}), 400
    if g.role not in ("recruiter", "manager", "admin"):
        return jsonify({"error": "Forbidden"}), 403

    from ..models import Candidate

    candidate = db.session.get(Candidate, candidate_id)
    if candidate is None or not same_org(candidate, g.org_id) or candidate.deleted_at is not None:
        return jsonify({"error": "候选人不存在"}), 404
    job = db.session.get(Job, job_id)
    if job is None or not same_org(job, g.org_id):
        return jsonify({"error": "岗位不存在"}), 404
    if not can_access_candidate(g.user_id, g.role, candidate_id, job_id):
        return jsonify({"error": "Forbidden"}), 403
    if not can_manage_job(g.user_id, g.role, job):
        return jsonify({"error": "Forbidden"}), 403
    if not job_is_active(job):
        return jsonify({"error": "岗位已关闭，请先恢复在招后再发起 AI 面试"}), 400
    svc = PreScreenService()
    questions = svc.generate_questions(job.jd_text, count=data.get("count", 5))
    record_event("interview.started", entity_id=candidate_id, entity_type="candidate",
                 payload={"job_id": job_id, "actor_id": g.user_id})
    return jsonify({"candidate_id": candidate_id, "job_id": job_id, "questions": questions})


@bp.post("/interview/submit")
@require_auth
def submit_interview():
    """候选人提交答案，AI 评估并生成报告"""
    data = request.get_json()
    candidate_id = data.get("candidate_id")
    job_id = data.get("job_id")
    qa_pairs = data.get("qa_pairs", [])  # [{"q": "...", "a": "..."}, ...]
    if not candidate_id or not job_id or not qa_pairs:
        return jsonify({"error": "candidate_id, job_id, qa_pairs required"}), 400
    if g.role not in ("recruiter", "manager", "admin"):
        return jsonify({"error": "Forbidden"}), 403

    from ..models import Candidate

    candidate = db.session.get(Candidate, candidate_id)
    if candidate is None or not same_org(candidate, g.org_id) or candidate.deleted_at is not None:
        return jsonify({"error": "候选人不存在"}), 404
    job = db.session.get(Job, job_id)
    if job is None or not same_org(job, g.org_id):
        return jsonify({"error": "岗位不存在"}), 404
    if not can_access_candidate(g.user_id, g.role, candidate_id, job_id):
        return jsonify({"error": "Forbidden"}), 403
    if not can_manage_job(g.user_id, g.role, job):
        return jsonify({"error": "Forbidden"}), 403
    if not job_is_active(job):
        return jsonify({"error": "岗位已关闭，请先恢复在招后再提交 AI 面试"}), 400
    svc = PreScreenService()
    pairs = [(item["q"], item["a"]) for item in qa_pairs]
    report = svc.build_report(pairs, job.jd_text)
    iv = svc.save_report(candidate_id, job_id, pairs, report, org_id=g.org_id)
    record_event("interview.scored", entity_id=candidate_id, entity_type="candidate",
                 payload={"job_id": job_id, "score": report["avg_score"],
                          "pass": report["pass_recommended"]})
    # R2.1 回写流程：通过→面试中；不通过→淘汰。未入流程先补 ai_screen 再推进。
    # 不回退、不重复写：若当前阶段已 ≥ 面试中，则通过分支不再追加。
    from ..models import PipelineStage
    from .pipeline import STAGE_ORDER, normalize_pipeline_stage
    last = (PipelineStage.query
            .filter_by(candidate_id=candidate_id, job_id=job_id)
            .order_by(PipelineStage.id.desc()).first())
    passed = report["pass_recommended"]
    current_stage = normalize_pipeline_stage(last.stage) if last else None
    cur_idx = STAGE_ORDER.index(current_stage) if current_stage in STAGE_ORDER else -1
    first_idx = STAGE_ORDER.index("interview")

    if passed and cur_idx >= first_idx:
        # 已在一面或更靠后，AI 预筛不应让其回退或重复入轮——仅记录预筛分，不动阶段。
        pass
    else:
        if last is None:
            db.session.add(PipelineStage(candidate_id=candidate_id, job_id=job_id,
                                         org_id=g.org_id,
                                         stage="ai_screen", updated_by=g.user_id,
                                         note="AI 预筛入流程"))
        target = "interview" if passed else "rejected"
        note = f"AI 预筛{'通过' if passed else '未通过'}，均分 {report['avg_score']}"
        db.session.add(PipelineStage(candidate_id=candidate_id, job_id=job_id,
                                     org_id=g.org_id,
                                     stage=target, updated_by=g.user_id, note=note))
    db.session.commit()
    return jsonify({"interview_id": iv.id, "report": report})


@bp.get("/interview/<int:interview_id>")
@require_auth
def get_report(interview_id):
    iv = db.get_or_404(Interview, interview_id)
    if not same_org(iv, g.org_id):
        return jsonify({"error": "面试记录不存在"}), 404
    if not can_access_candidate(g.user_id, g.role, iv.candidate_id, iv.job_id):
        return jsonify({"error": "Forbidden"}), 403
    return jsonify({
        "id": iv.id,
        "candidate_id": iv.candidate_id,
        "job_id": iv.job_id,
        "score": iv.score,
        "pass_recommended": iv.pass_recommended,
        "ai_report": iv.ai_report,
        "created_at": iv.created_at.isoformat(),
    })


@bp.get("/interview/guide")
@require_auth
def interview_guide():
    from ..models import Candidate

    candidate_id = request.args.get("candidate_id", type=int)
    job_id = request.args.get("job_id", type=int)
    round_name = request.args.get("round") or "round_1"
    if not candidate_id or not job_id:
        return jsonify({"error": "candidate_id and job_id required"}), 400
    if round_name not in INTERVIEW_ROUNDS:
        return jsonify({"error": "无效面试轮次"}), 400

    candidate = db.session.get(Candidate, candidate_id)
    if candidate is None or not same_org(candidate, g.org_id) or candidate.deleted_at is not None:
        return jsonify({"error": "候选人不存在"}), 404
    job = db.session.get(Job, job_id)
    if job is None or not same_org(job, g.org_id):
        return jsonify({"error": "岗位不存在"}), 404
    if not can_access_candidate(g.user_id, g.role, candidate_id, job_id, round_name):
        return jsonify({"error": "Forbidden"}), 403
    return jsonify(_build_interview_guide(candidate, job, round_name))


@bp.post("/interview/feedback")
@require_auth
def submit_feedback():
    from ..models import Candidate, InterviewFeedback
    data = request.get_json() or {}
    required = ("candidate_id", "job_id", "round")
    if not all(data.get(k) for k in required):
        return jsonify({"error": "candidate_id, job_id, round required"}), 400
    candidate = db.session.get(Candidate, data["candidate_id"])
    if candidate is None or not same_org(candidate, g.org_id) or candidate.deleted_at is not None:
        return jsonify({"error": "候选人不存在"}), 404
    job = db.session.get(Job, data["job_id"])
    if job is None or not same_org(job, g.org_id):
        return jsonify({"error": "岗位不存在"}), 404
    if not job_is_active(job):
        return jsonify({"error": "岗位已关闭，请先恢复在招后再提交面试反馈"}), 400
    score = data.get("score")
    if score is not None:
        try:
            score = int(score)
        except (TypeError, ValueError):
            return jsonify({"error": "score must be an integer between 1 and 5"}), 400
        if score < 1 or score > 5:
            return jsonify({"error": "score must be between 1 and 5"}), 400
    if not can_access_candidate(
        g.user_id,
        g.role,
        data["candidate_id"],
        data["job_id"],
        data["round"],
    ):
        return jsonify({"error": "Forbidden"}), 403
    existing = InterviewFeedback.query.filter_by(
        org_id=g.org_id,
        candidate_id=data["candidate_id"],
        job_id=data["job_id"],
        round=data["round"],
        interviewer_id=g.user_id,
    ).first()
    if existing is not None:
        return jsonify({"id": existing.id, "status": "ok", "deduplicated": True}), 200
    fb = InterviewFeedback(
        candidate_id=data["candidate_id"], job_id=data["job_id"],
        org_id=g.org_id,
        round=data["round"], interviewer_id=g.user_id,
        score=score, passed=data.get("passed"),
        strengths=data.get("strengths"), concerns=data.get("concerns"),
        reason_tags=_sanitize_reason_tags(data.get("reason_tags")),
        evaluation_json=_sanitize_evaluation(data.get("evaluation")),
        note=data.get("note"))
    db.session.add(fb)
    db.session.commit()
    record_event("interview.feedback", entity_id=data["candidate_id"],
                 entity_type="candidate",
                 payload={"job_id": data["job_id"], "round": data["round"],
                          "score": data.get("score"), "passed": data.get("passed")})
    return jsonify({"id": fb.id, "status": "ok", "deduplicated": False}), 201


@bp.get("/interview/feedback")
@require_auth
def list_feedback():
    from ..models import InterviewFeedback, User
    cid = request.args.get("candidate_id", type=int)
    jid = request.args.get("job_id", type=int)
    q = InterviewFeedback.query
    q = q.filter(InterviewFeedback.org_id == g.org_id)
    if g.role == "interviewer":
        q = q.filter_by(interviewer_id=g.user_id)
    elif g.role == "recruiter":
        visible_ids = visible_candidate_query(g.user_id, g.role).with_entities(Candidate.id)
        q = q.filter(InterviewFeedback.candidate_id.in_(visible_ids))
    if cid: q = q.filter_by(candidate_id=cid)
    if jid: q = q.filter_by(job_id=jid)
    rows = q.order_by(InterviewFeedback.id.desc()).all()
    out = []
    for f in rows:
        u = db.session.get(User, f.interviewer_id)
        out.append({
            "id": f.id, "candidate_id": f.candidate_id, "job_id": f.job_id,
            "round": f.round, "interviewer_id": f.interviewer_id,
            "interviewer_name": u.name if u else None,
            "score": f.score, "passed": f.passed,
            "reason_tags": f.reason_tags if isinstance(f.reason_tags, list) else [],
            "evaluation": f.evaluation_json or {},
            "strengths": f.strengths, "concerns": f.concerns, "note": f.note,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        })
    return jsonify(out)


@bp.get("/interviews")
@require_auth
def list_interviews():
    """面试记录列表：AI 面试 + 面试官反馈，按角色过滤。"""
    from ..models import Interview, InterviewFeedback, Candidate, Job, User
    items = []
    ai_q = Interview.query
    fb_q = InterviewFeedback.query.filter(InterviewFeedback.org_id == g.org_id)
    ai_q = ai_q.filter(Interview.org_id == g.org_id)
    if g.role == "recruiter":
        own_ids = [c.id for c in visible_candidate_query(g.user_id, g.role).all()]
        ai_q = ai_q.filter(Interview.candidate_id.in_(own_ids or [-1]))
        fb_q = fb_q.filter(InterviewFeedback.candidate_id.in_(own_ids or [-1]))
    elif g.role == "interviewer":
        ai_q = ai_q.filter(Interview.id < 0)  # 面试官不看 AI 预筛发起记录（永假条件）
        fb_q = fb_q.filter_by(interviewer_id=g.user_id)

    def cname(cid):
        c = db.session.get(Candidate, cid); return c.name_masked if c else None
    def jtitle(jid):
        j = db.session.get(Job, jid); return j.title if j else None
    def uname(uid):
        u = db.session.get(User, uid); return u.name if u else None

    for iv in ai_q.order_by(Interview.id.desc()).all():
        items.append({"id": iv.id, "type": "ai", "candidate_id": iv.candidate_id,
                      "name_masked": cname(iv.candidate_id), "job_id": iv.job_id,
                      "job_title": jtitle(iv.job_id), "score": iv.score,
                      "pass": iv.pass_recommended, "round": None,
                      "interviewer_id": None, "interviewer_name": None,
                      "evaluation": None,
                      "reason_tags": [],
                      "strengths": None, "concerns": None, "note": None,
                      "created_at": iv.created_at.isoformat() if iv.created_at else None})
    for f in fb_q.order_by(InterviewFeedback.id.desc()).all():
        items.append({"id": f.id, "type": "feedback", "candidate_id": f.candidate_id,
                      "name_masked": cname(f.candidate_id), "job_id": f.job_id,
                      "job_title": jtitle(f.job_id), "score": f.score,
                      "pass": f.passed, "round": f.round,
                      "interviewer_id": f.interviewer_id,
                      "interviewer_name": uname(f.interviewer_id),
                      "evaluation": f.evaluation_json or {},
                      "reason_tags": f.reason_tags if isinstance(f.reason_tags, list) else [],
                      "strengths": f.strengths, "concerns": f.concerns, "note": f.note,
                      "created_at": f.created_at.isoformat() if f.created_at else None})
    items.sort(key=lambda it: it["created_at"] or "", reverse=True)
    return jsonify(items)


@bp.get("/interview/interviewers")
@require_auth
def list_interviewers():
    from ..models import User

    users = (User.query
             .filter(User.org_id == g.org_id, User.is_active.is_(True), User.role.in_(["interviewer", "manager", "admin"]))
             .order_by(User.name.asc())
             .all())
    return jsonify([{"id": u.id, "name": u.name, "role": u.role} for u in users])


@bp.get("/interview/assignments")
@require_auth
def list_assignments():
    from ..models import Candidate

    q = InterviewAssignment.query
    q = q.filter(InterviewAssignment.org_id == g.org_id)
    if g.role == "interviewer":
        q = q.filter_by(interviewer_id=g.user_id)
    elif g.role == "recruiter":
        own_ids = [c.id for c in visible_candidate_query(g.user_id, g.role).all()]
        q = q.filter(InterviewAssignment.candidate_id.in_(own_ids or [-1]))

    job_id = request.args.get("job_id", type=int)
    candidate_id = request.args.get("candidate_id", type=int)
    if job_id:
        q = q.filter_by(job_id=job_id)
    if candidate_id:
        q = q.filter_by(candidate_id=candidate_id)

    rows = q.order_by(InterviewAssignment.scheduled_at.asc(), InterviewAssignment.id.desc()).all()
    return jsonify([_assignment_payload(item) for item in rows])


@bp.post("/interview/assignments")
@require_auth
def create_assignment():
    from ..models import Candidate, User

    if g.role not in ("recruiter", "manager", "admin"):
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json() or {}
    required = ("candidate_id", "job_id", "round", "interviewer_id")
    if not all(data.get(k) for k in required):
        return jsonify({"error": "candidate_id, job_id, round, interviewer_id required"}), 400
    if data["round"] not in INTERVIEW_ROUNDS:
        return jsonify({"error": "无效面试轮次"}), 400
    candidate = db.session.get(Candidate, data["candidate_id"])
    if candidate is None or not same_org(candidate, g.org_id) or candidate.deleted_at is not None:
        return jsonify({"error": "候选人不存在"}), 404
    job = db.session.get(Job, data["job_id"])
    if job is None or not same_org(job, g.org_id):
        return jsonify({"error": "岗位不存在"}), 404
    if not can_access_candidate(g.user_id, g.role, data["candidate_id"], data["job_id"], data["round"]):
        return jsonify({"error": "Forbidden"}), 403
    if not can_manage_job(g.user_id, g.role, job):
        return jsonify({"error": "Forbidden"}), 403
    if (job.status or "active") != "active":
        return jsonify({"error": "岗位已关闭，请先恢复在招后再安排面试"}), 400
    interviewer = db.session.get(User, data["interviewer_id"])
    if (
        interviewer is None
        or not same_org(interviewer, g.org_id)
        or interviewer.role not in ("interviewer", "manager", "admin")
        or not interviewer.is_active
    ):
        return jsonify({"error": "面试官不存在、未启用或角色不正确"}), 400

    scheduled_at = _parse_datetime(data.get("scheduled_at"))
    existing = InterviewAssignment.query.filter_by(
        org_id=g.org_id,
        candidate_id=data["candidate_id"],
        job_id=data["job_id"],
        round=data["round"],
        interviewer_id=data["interviewer_id"],
    ).all()
    normalized_scheduled_at = _normalize_for_compare(scheduled_at)
    for item in existing:
        if _normalize_for_compare(item.scheduled_at) == normalized_scheduled_at:
            payload = _assignment_payload(item)
            payload["deduplicated"] = True
            return jsonify(payload), 200
    if normalized_scheduled_at is not None:
        interviewer_assignments = InterviewAssignment.query.filter_by(
            org_id=g.org_id,
            interviewer_id=data["interviewer_id"],
        ).all()
        for item in interviewer_assignments:
            status = (item.status or "scheduled").lower()
            if status in {"cancelled", "canceled"}:
                continue
            if _normalize_for_compare(item.scheduled_at) == normalized_scheduled_at:
                return jsonify({
                    "error": "面试官该时间已有面试安排，请改期或更换面试官",
                    "conflict_assignment_id": item.id,
                }), 409

    assignment = InterviewAssignment(
        org_id=g.org_id,
        candidate_id=data["candidate_id"],
        job_id=data["job_id"],
        round=data["round"],
        interviewer_id=data["interviewer_id"],
        scheduled_at=scheduled_at,
        location=str(data.get("location") or "")[:240],
        note=str(data.get("note") or ""),
        status=str(data.get("status") or "scheduled")[:40],
        created_by=g.user_id,
    )
    db.session.add(assignment)
    db.session.commit()
    record_event("interview.assigned", entity_id=assignment.candidate_id,
                 entity_type="candidate",
                 payload={"job_id": assignment.job_id, "round": assignment.round,
                          "interviewer_id": assignment.interviewer_id})
    payload = _assignment_payload(assignment)
    payload["deduplicated"] = False
    return jsonify(payload), 201
