from . import db
from .time_utils import utc_now


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    role = db.Column(db.String(20), nullable=False, default="recruiter")  # admin/manager/recruiter/interviewer
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    token_version = db.Column(db.Integer, default=0, nullable=False)


class Candidate(db.Model):
    __tablename__ = "candidates"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    owner_hr_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    upload_batch_id = db.Column(db.Integer, db.ForeignKey("upload_batches.id"))
    name_masked = db.Column(db.String(100))
    email_masked = db.Column(db.String(100))
    phone_masked = db.Column(db.String(30))
    resume_json = db.Column(db.JSON, nullable=False)
    raw_file_path = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utc_now)
    deleted_at = db.Column(db.DateTime)
    deleted_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    anonymized_at = db.Column(db.DateTime)
    parse_status = db.Column(db.String(20), default="ok", nullable=False)
    parse_error = db.Column(db.Text)
    tags = db.relationship("CandidateTag", backref="candidate", cascade="all,delete-orphan")
    stages = db.relationship("PipelineStage", backref="candidate")


class UploadBatch(db.Model):
    __tablename__ = "upload_batches"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    owner_hr_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    source_channel = db.Column(db.String(120), default="")
    source_link = db.Column(db.Text)
    referrer = db.Column(db.String(120), default="")
    target_job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"))
    note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utc_now)


class CandidateTag(db.Model):
    __tablename__ = "candidate_tags"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    tag = db.Column(db.String(100), nullable=False)
    score = db.Column(db.Integer)  # 1-5


class Job(db.Model):
    __tablename__ = "jobs"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    title = db.Column(db.String(200), nullable=False)
    city = db.Column(db.String(80), default="")
    department = db.Column(db.String(120), default="")
    job_code = db.Column(db.String(80), default="")
    jd_text = db.Column(db.Text, nullable=False)
    jd_structured = db.Column(db.JSON)
    owner_hr_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    status = db.Column(db.String(20), default="active")
    created_at = db.Column(db.DateTime, default=utc_now)


class RecruitmentDemand(db.Model):
    __tablename__ = "recruitment_demands"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"), nullable=False)
    owner_hr_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    request_no = db.Column(db.String(80), default="")
    requester_name = db.Column(db.String(120), default="")
    requester_department = db.Column(db.String(120), default="")
    hiring_manager_name = db.Column(db.String(120), default="")
    requested_at = db.Column(db.Date)
    accepted_at = db.Column(db.Date)
    target_date = db.Column(db.Date)
    priority = db.Column(db.String(1), default="B", nullable=False)
    headcount = db.Column(db.Integer, default=1, nullable=False)
    status = db.Column(db.String(20), default="active", nullable=False)
    close_reason = db.Column(db.Text)
    downgrade_reason = db.Column(db.Text)
    note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)
    job = db.relationship("Job", backref="demands")


class TalentMap(db.Model):
    __tablename__ = "talent_maps"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    name = db.Column(db.String(200), nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"))
    department = db.Column(db.String(120), default="")
    owner_hr_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    board_json = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)
    job = db.relationship("Job", backref="talent_maps")
    companies = db.relationship(
        "TalentMapCompany",
        backref="talent_map",
        cascade="all,delete-orphan",
        order_by="TalentMapCompany.id",
    )
    people = db.relationship(
        "TalentMapPerson",
        backref="talent_map",
        cascade="all,delete-orphan",
        order_by="TalentMapPerson.id",
    )


class TalentMapCompany(db.Model):
    __tablename__ = "talent_map_companies"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    map_id = db.Column(db.Integer, db.ForeignKey("talent_maps.id", ondelete="CASCADE"), nullable=False)
    company_name = db.Column(db.String(200), nullable=False)
    city = db.Column(db.String(80), default="")
    region = db.Column(db.String(80), default="")
    industry = db.Column(db.String(120), default="")
    priority = db.Column(db.String(40), default="medium")
    note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)
    people = db.relationship(
        "TalentMapPerson",
        backref="company",
        cascade="all",
        order_by="TalentMapPerson.id",
    )


class TalentMapPerson(db.Model):
    __tablename__ = "talent_map_people"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    map_id = db.Column(db.Integer, db.ForeignKey("talent_maps.id", ondelete="CASCADE"), nullable=False)
    company_id = db.Column(db.Integer, db.ForeignKey("talent_map_companies.id"))
    name = db.Column(db.String(120), nullable=False)
    title = db.Column(db.String(160), default="")
    city = db.Column(db.String(80), default="")
    tags = db.Column(db.JSON)
    salary_range = db.Column(db.String(120), default="")
    contact_status = db.Column(db.String(80), default="未接触")
    evaluation = db.Column(db.String(120), default="")
    source = db.Column(db.String(160), default="")
    next_follow_at = db.Column(db.Date)
    note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)


class Match(db.Model):
    __tablename__ = "matches"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"))
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"))
    score = db.Column(db.Float, nullable=False)
    reason = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utc_now)


class Interview(db.Model):
    __tablename__ = "interviews"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"))
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"))
    qa_json = db.Column(db.JSON)
    ai_report = db.Column(db.JSON)
    score = db.Column(db.Float)
    pass_recommended = db.Column(db.Boolean)
    created_at = db.Column(db.DateTime, default=utc_now)


VALID_STAGES = {
    "pending", "ai_screen", "business_review",
    "interview",
    "interview_first", "interview_second", "interview_final",
    "offer", "onboarded", "rejected",
}


class PipelineStage(db.Model):
    __tablename__ = "pipeline_stages"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"))
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"))
    stage = db.Column(db.String(50), nullable=False)
    updated_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    note = db.Column(db.Text)  # 本次阶段变更原因/备注，可空
    ts = db.Column(db.DateTime, default=utc_now)


class CandidateDisposition(db.Model):
    __tablename__ = "candidate_dispositions"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"), nullable=False)
    reason = db.Column(db.String(240), default="")
    enter_talent_pool = db.Column(db.Boolean, default=True, nullable=False)
    next_contact_at = db.Column(db.Date)
    tags = db.Column(db.JSON)
    note = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=utc_now)


class OfferRecord(db.Model):
    __tablename__ = "offer_records"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"), nullable=False)
    salary_range = db.Column(db.String(120), default="")
    onboard_date = db.Column(db.Date)
    approval_status = db.Column(db.String(40), default="draft")
    note = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)


class InterviewAssignment(db.Model):
    __tablename__ = "interview_assignments"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"), nullable=False)
    round = db.Column(db.String(30), nullable=False)
    interviewer_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    scheduled_at = db.Column(db.DateTime)
    location = db.Column(db.String(240), default="")
    note = db.Column(db.Text)
    status = db.Column(db.String(40), default="scheduled")
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=utc_now)


class Event(db.Model):
    __tablename__ = "events"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    actor_role = db.Column(db.String(20))
    action = db.Column(db.String(100), nullable=False)
    entity_id = db.Column(db.Integer)
    entity_type = db.Column(db.String(50))
    payload = db.Column(db.JSON)
    request_id = db.Column(db.String(80))
    ip = db.Column(db.String(80))
    user_agent = db.Column(db.Text)
    result = db.Column(db.String(20), default="success", nullable=False)
    failure_reason = db.Column(db.String(240))
    source = db.Column(db.String(20), default="ui", nullable=False)
    severity = db.Column(db.String(20), default="info", nullable=False)
    ts = db.Column(db.DateTime, default=utc_now)


class AuditLog(db.Model):
    __tablename__ = "audit_logs"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    target_table = db.Column(db.String(50))
    target_id = db.Column(db.Integer)
    action = db.Column(db.String(50))
    ts = db.Column(db.DateTime, default=utc_now)


class Notification(db.Model):
    __tablename__ = "notifications"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    type = db.Column(db.String(50), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    body = db.Column(db.Text)
    link = db.Column(db.String(500))
    is_read = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)


class IdempotencyRecord(db.Model):
    __tablename__ = "idempotency_records"
    id = db.Column(db.Integer, primary_key=True)
    scope_key = db.Column(db.String(64), unique=True, nullable=False, index=True)
    idempotency_key = db.Column(db.String(160), nullable=False)
    actor_scope = db.Column(db.String(120), nullable=False)
    method = db.Column(db.String(12), nullable=False)
    path = db.Column(db.String(500), nullable=False)
    body_hash = db.Column(db.String(64), nullable=False)
    status_code = db.Column(db.Integer, nullable=False)
    response_json = db.Column(db.JSON, nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)


class Conversation(db.Model):
    __tablename__ = "conversations"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    title = db.Column(db.String(200), default="新对话")
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)
    messages = db.relationship(
        "ConversationMessage",
        backref="conversation",
        cascade="all,delete-orphan",
        order_by="ConversationMessage.id",
    )


class ConversationMessage(db.Model):
    __tablename__ = "conversation_messages"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    conversation_id = db.Column(
        db.Integer,
        db.ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    role = db.Column(db.String(20), nullable=False)
    content = db.Column(db.Text, nullable=False)
    tool_calls = db.Column(db.JSON)
    thoughts = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=utc_now)


class InterviewFeedback(db.Model):
    __tablename__ = "interview_feedback"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"), nullable=False)
    round = db.Column(db.String(30), nullable=False)  # interview_first/second/final
    interviewer_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    score = db.Column(db.Integer)        # 1-5
    passed = db.Column(db.Boolean)
    strengths = db.Column(db.Text)
    concerns = db.Column(db.Text)
    reason_tags = db.Column(db.JSON)
    evaluation_json = db.Column(db.JSON)
    note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utc_now)
