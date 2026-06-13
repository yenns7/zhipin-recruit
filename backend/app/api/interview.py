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
