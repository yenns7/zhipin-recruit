from .. import db
from ..models import InterviewAssignment


def assigned_candidate_ids_for_interviewer(user_id):
    rows = (
        db.session.query(InterviewAssignment.candidate_id)
        .filter_by(interviewer_id=user_id)
        .distinct()
        .all()
    )
    return [row[0] for row in rows]


def assigned_job_ids_for_interviewer(user_id):
    rows = (
        db.session.query(InterviewAssignment.job_id)
        .filter_by(interviewer_id=user_id)
        .distinct()
        .all()
    )
    return [row[0] for row in rows]


def interviewer_has_assignment(user_id, candidate_id, job_id=None, round_name=None):
    q = InterviewAssignment.query.filter_by(
        interviewer_id=user_id,
        candidate_id=candidate_id,
    )
    if job_id is not None:
        q = q.filter_by(job_id=job_id)
    if round_name:
        q = q.filter_by(round=round_name)
    return q.first() is not None
