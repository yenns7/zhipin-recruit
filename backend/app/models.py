from datetime import datetime
from . import db


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    role = db.Column(db.String(20), nullable=False, default="recruiter")  # admin/manager/recruiter/interviewer
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Candidate(db.Model):
    __tablename__ = "candidates"
    id = db.Column(db.Integer, primary_key=True)
    owner_hr_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    name_masked = db.Column(db.String(100))
    email_masked = db.Column(db.String(100))
    phone_masked = db.Column(db.String(30))
    resume_json = db.Column(db.JSON, nullable=False)
    raw_file_path = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    tags = db.relationship("CandidateTag", backref="candidate", cascade="all,delete-orphan")
    stages = db.relationship("PipelineStage", backref="candidate")


class CandidateTag(db.Model):
    __tablename__ = "candidate_tags"
    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    tag = db.Column(db.String(100), nullable=False)
    score = db.Column(db.Integer)  # 1-5


class Job(db.Model):
    __tablename__ = "jobs"
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    jd_text = db.Column(db.Text, nullable=False)
    jd_structured = db.Column(db.JSON)
    owner_hr_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    status = db.Column(db.String(20), default="active")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Match(db.Model):
    __tablename__ = "matches"
    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"))
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"))
    score = db.Column(db.Float, nullable=False)
    reason = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Interview(db.Model):
    __tablename__ = "interviews"
    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"))
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"))
    qa_json = db.Column(db.JSON)
    ai_report = db.Column(db.JSON)
    score = db.Column(db.Float)
    pass_recommended = db.Column(db.Boolean)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


VALID_STAGES = {"pending", "ai_screen", "interview", "offer", "onboarded", "rejected"}


class PipelineStage(db.Model):
    __tablename__ = "pipeline_stages"
    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"))
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"))
    stage = db.Column(db.String(50), nullable=False)
    updated_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    ts = db.Column(db.DateTime, default=datetime.utcnow)


class Event(db.Model):
    __tablename__ = "events"
    id = db.Column(db.Integer, primary_key=True)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    action = db.Column(db.String(100), nullable=False)
    entity_id = db.Column(db.Integer)
    entity_type = db.Column(db.String(50))
    payload = db.Column(db.JSON)
    ts = db.Column(db.DateTime, default=datetime.utcnow)


class AuditLog(db.Model):
    __tablename__ = "audit_logs"
    id = db.Column(db.Integer, primary_key=True)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    target_table = db.Column(db.String(50))
    target_id = db.Column(db.Integer)
    action = db.Column(db.String(50))
    ts = db.Column(db.DateTime, default=datetime.utcnow)
