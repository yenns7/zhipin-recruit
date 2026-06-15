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
    is_active = db.Column(db.Boolean, default=True, nullable=False)


class Candidate(db.Model):
    __tablename__ = "candidates"
    id = db.Column(db.Integer, primary_key=True)
    owner_hr_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    upload_batch_id = db.Column(db.Integer, db.ForeignKey("upload_batches.id"))
    name_masked = db.Column(db.String(100))
    email_masked = db.Column(db.String(100))
    phone_masked = db.Column(db.String(30))
    resume_json = db.Column(db.JSON, nullable=False)
    raw_file_path = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    parse_status = db.Column(db.String(20), default="ok", nullable=False)
    parse_error = db.Column(db.Text)
    tags = db.relationship("CandidateTag", backref="candidate", cascade="all,delete-orphan")
    stages = db.relationship("PipelineStage", backref="candidate")


class UploadBatch(db.Model):
    __tablename__ = "upload_batches"
    id = db.Column(db.Integer, primary_key=True)
    owner_hr_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    source_channel = db.Column(db.String(120), default="")
    source_link = db.Column(db.Text)
    referrer = db.Column(db.String(120), default="")
    target_job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"))
    note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


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
    city = db.Column(db.String(80), default="")
    department = db.Column(db.String(120), default="")
    job_code = db.Column(db.String(80), default="")
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


VALID_STAGES = {
    "pending", "ai_screen",
    "interview_first", "interview_second", "interview_final",
    "offer", "onboarded", "rejected",
}


class PipelineStage(db.Model):
    __tablename__ = "pipeline_stages"
    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"))
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"))
    stage = db.Column(db.String(50), nullable=False)
    updated_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    note = db.Column(db.Text)  # 本次阶段变更原因/备注，可空
    ts = db.Column(db.DateTime, default=datetime.utcnow)


class CandidateDisposition(db.Model):
    __tablename__ = "candidate_dispositions"
    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"), nullable=False)
    reason = db.Column(db.String(240), default="")
    enter_talent_pool = db.Column(db.Boolean, default=True, nullable=False)
    next_contact_at = db.Column(db.Date)
    tags = db.Column(db.JSON)
    note = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class OfferRecord(db.Model):
    __tablename__ = "offer_records"
    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"), nullable=False)
    salary_range = db.Column(db.String(120), default="")
    onboard_date = db.Column(db.Date)
    approval_status = db.Column(db.String(40), default="draft")
    note = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class InterviewAssignment(db.Model):
    __tablename__ = "interview_assignments"
    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"), nullable=False)
    round = db.Column(db.String(30), nullable=False)
    interviewer_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    scheduled_at = db.Column(db.DateTime)
    location = db.Column(db.String(240), default="")
    note = db.Column(db.Text)
    status = db.Column(db.String(40), default="scheduled")
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


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


class Notification(db.Model):
    __tablename__ = "notifications"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    type = db.Column(db.String(50), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    body = db.Column(db.Text)
    link = db.Column(db.String(500))
    is_read = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Conversation(db.Model):
    __tablename__ = "conversations"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    title = db.Column(db.String(200), default="新对话")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    messages = db.relationship(
        "ConversationMessage",
        backref="conversation",
        cascade="all,delete-orphan",
        order_by="ConversationMessage.id",
    )


class ConversationMessage(db.Model):
    __tablename__ = "conversation_messages"
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(
        db.Integer,
        db.ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    role = db.Column(db.String(20), nullable=False)
    content = db.Column(db.Text, nullable=False)
    tool_calls = db.Column(db.JSON)
    thoughts = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class InterviewFeedback(db.Model):
    __tablename__ = "interview_feedback"
    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"), nullable=False)
    round = db.Column(db.String(30), nullable=False)  # interview_first/second/final
    interviewer_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    score = db.Column(db.Integer)        # 1-5
    passed = db.Column(db.Boolean)
    strengths = db.Column(db.Text)
    concerns = db.Column(db.Text)
    evaluation_json = db.Column(db.JSON)
    note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
