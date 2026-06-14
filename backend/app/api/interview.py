from flask import Blueprint, request, jsonify, g
from ..middleware.auth import require_auth
from ..middleware.events import record_event
from ..services.interview_service import PreScreenService
from .. import db
from ..models import Interview, Job

bp = Blueprint("interview", __name__)


@bp.post("/interview/start")
@require_auth
def start_interview():
    """HR 对候选人发起 AI 预筛，生成面试题"""
    data = request.get_json()
    candidate_id = data.get("candidate_id")
    job_id = data.get("job_id")
    if not candidate_id or not job_id:
        return jsonify({"error": "candidate_id and job_id required"}), 400

    job = Job.query.get_or_404(job_id)
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

    job = Job.query.get_or_404(job_id)
    svc = PreScreenService()
    pairs = [(item["q"], item["a"]) for item in qa_pairs]
    report = svc.build_report(pairs, job.jd_text)
    iv = svc.save_report(candidate_id, job_id, pairs, report)
    record_event("interview.scored", entity_id=candidate_id, entity_type="candidate",
                 payload={"job_id": job_id, "score": report["avg_score"],
                          "pass": report["pass_recommended"]})
    # R2.1 回写流程：通过→一面；不通过→淘汰。未入流程先补 ai_screen 再推进。
    from ..models import PipelineStage
    last = (PipelineStage.query
            .filter_by(candidate_id=candidate_id, job_id=job_id)
            .order_by(PipelineStage.id.desc()).first())
    passed = report["pass_recommended"]
    if last is None:
        db.session.add(PipelineStage(candidate_id=candidate_id, job_id=job_id,
                                     stage="ai_screen", updated_by=g.user_id,
                                     note="AI 预筛入流程"))
    target = "interview_first" if passed else "rejected"
    note = f"AI 预筛{'通过' if passed else '未通过'}，均分 {report['avg_score']}"
    db.session.add(PipelineStage(candidate_id=candidate_id, job_id=job_id,
                                 stage=target, updated_by=g.user_id, note=note))
    db.session.commit()
    return jsonify({"interview_id": iv.id, "report": report})


@bp.get("/interview/<int:interview_id>")
@require_auth
def get_report(interview_id):
    iv = Interview.query.get_or_404(interview_id)
    return jsonify({
        "id": iv.id,
        "candidate_id": iv.candidate_id,
        "job_id": iv.job_id,
        "score": iv.score,
        "pass_recommended": iv.pass_recommended,
        "ai_report": iv.ai_report,
        "created_at": iv.created_at.isoformat(),
    })
