from .. import db
from ..models import Candidate, InterviewAssignment


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


def visible_candidate_query(user_id, role):
    query = Candidate.query
    if role == "recruiter":
        return query.filter(
            db.or_(Candidate.owner_hr_id == user_id, Candidate.owner_hr_id.is_(None))
        )
    if role == "interviewer":
        assigned_ids = assigned_candidate_ids_for_interviewer(user_id)
        return query.filter(Candidate.id.in_(assigned_ids or [-1]))
    return query


def can_access_candidate(user_id, role, candidate_id, job_id=None, round_name=None):
    if role in ("manager", "admin"):
        return True
    if role == "recruiter":
        return visible_candidate_query(user_id, role).filter(Candidate.id == candidate_id).first() is not None
    if role == "interviewer":
        return interviewer_has_assignment(user_id, candidate_id, job_id, round_name)
    return False


def can_manage_job(user_id, role, job):
    if role in ("manager", "admin"):
        return True
    return role == "recruiter" and (job.owner_hr_id == user_id or job.owner_hr_id is None)
