from datetime import timedelta
import re

from .. import db
from ..models import Candidate, InterviewAssignment, Job, PipelineStage, UploadBatch, User
from ..time_utils import utc_now


DEMO_REPLACEMENT_NAMES = [
    "陈昊然",
    "许若涵",
    "周一鸣",
    "林可欣",
    "沈芮",
    "顾明轩",
    "苏安琪",
    "陆嘉宁",
    "唐子墨",
    "何雨桐",
    "马景行",
    "赵思远",
    "孙若琳",
    "蒋一诺",
    "韩雨泽",
    "罗予安",
    "郑梓涵",
    "梁嘉树",
    "宋清越",
    "丁沐阳",
    "叶知秋",
    "高云舒",
    "彭嘉言",
    "邵亦辰",
    "魏宁远",
    "傅星河",
    "曹若溪",
    "袁景澄",
    "薛予墨",
    "范清和",
    "田书瑶",
    "金沐宸",
    "卢思源",
    "秦若安",
    "谢云舟",
    "夏语桐",
    "方以宁",
    "江承泽",
    "任清欢",
    "崔明煦",
]

INTERVIEW_STAGES = {"interview", "interview_first", "interview_second", "interview_final"}
DEMO_ROUND_BY_STAGE = {
    "interview": "round_1",
    "interview_first": "round_1",
    "interview_second": "round_2",
    "interview_final": "round_3",
}
SYNTHETIC_NAME_PATTERN = re.compile(r".+-\d+$")
GENERIC_CANDIDATE_NAME_PATTERN = re.compile(r"^候选人\d+$")
NON_ASCII_EMAIL_PATTERN = re.compile(r"[^\x00-\x7F]")
SHORT_PLACEHOLDER_EMAIL_PATTERN = re.compile(r"^[a-z]@[a-z]\.com$")
DEMO_ASSIGNMENT_NOTE = "演示样例：由招聘流程自动补齐面试安排"
MAX_DEMO_ASSIGNMENTS = 3
STALE_DEMO_NAMES = {"张伟", "李四", "王五", "赵六", "Zhao Liu", "孙七", "测试候选人"}
STALE_DEMO_EMAILS = {
    "zhangwei.demo@example.com",
    "wangwu@example.com",
    "zhaoliu@example.com",
}
STALE_DEMO_PHONES = {"13800001111"}


def _active_jobs():
    return Job.query.filter_by(status="active").order_by(Job.id.asc()).all()


def _candidate_stage_job(candidate_id):
    stage = (
        PipelineStage.query
        .filter_by(candidate_id=candidate_id)
        .order_by(PipelineStage.ts.desc(), PipelineStage.id.desc())
        .first()
    )
    return stage.job_id if stage else None


def _fallback_job_for_candidate(candidate, jobs):
    if not jobs:
        return None
    staged_job_id = _candidate_stage_job(candidate.id)
    if staged_job_id and any(job.id == staged_job_id for job in jobs):
        return staged_job_id

    resume_text = str(candidate.resume_json or "")
    for job in jobs:
        if job.title and job.title in resume_text:
            return job.id
    return jobs[0].id


def _clean_duplicate_candidate_names():
    changed = 0
    used_names = {
        row[0]
        for row in db.session.query(Candidate.name_masked).all()
        if row[0]
    }
    groups = {}
    for candidate in Candidate.query.order_by(Candidate.id.asc()).all():
        groups.setdefault(candidate.name_masked or "", []).append(candidate)

    replacement_index = 0
    def next_replacement(fallback):
        nonlocal replacement_index
        while (
            replacement_index < len(DEMO_REPLACEMENT_NAMES)
            and DEMO_REPLACEMENT_NAMES[replacement_index] in used_names
        ):
            replacement_index += 1
        if replacement_index < len(DEMO_REPLACEMENT_NAMES):
            new_name = DEMO_REPLACEMENT_NAMES[replacement_index]
            replacement_index += 1
        else:
            new_name = fallback
        used_names.add(new_name)
        return new_name

    for name, candidates in groups.items():
        if not name or len(candidates) <= 1:
            continue
        for candidate in candidates[1:]:
            candidate.name_masked = next_replacement(f"候选人{candidate.id}")
            changed += 1

    for candidate in Candidate.query.order_by(Candidate.id.asc()).all():
        if not candidate.name_masked:
            continue
        needs_cleanup = (
            SYNTHETIC_NAME_PATTERN.match(candidate.name_masked)
            or GENERIC_CANDIDATE_NAME_PATTERN.match(candidate.name_masked)
            or candidate.name_masked in STALE_DEMO_NAMES
        )
        if not needs_cleanup:
            continue
        candidate.name_masked = next_replacement(f"候选人{candidate.id}")
        changed += 1
    return changed


def _unique_demo_email(candidate_id, used_values):
    index = candidate_id
    while True:
        email = f"candidate{index:03d}.demo@example.com"
        if email not in used_values:
            return email
        index += 1


def _unique_demo_phone(candidate_id, used_values):
    index = candidate_id
    while True:
        phone = f"1380000{index % 10000:04d}"
        if phone not in used_values:
            return phone
        index += 1


def _clean_duplicate_candidate_contacts():
    changed = 0

    used_emails = set()
    used_phones = set()
    for candidate in Candidate.query.order_by(Candidate.id.asc()).all():
        if candidate.email_masked:
            email = candidate.email_masked.lower()
            needs_cleanup = (
                candidate.email_masked in used_emails
                or email in STALE_DEMO_EMAILS
                or NON_ASCII_EMAIL_PATTERN.search(candidate.email_masked)
                or SHORT_PLACEHOLDER_EMAIL_PATTERN.match(email)
            )
            if needs_cleanup:
                candidate.email_masked = _unique_demo_email(candidate.id, used_emails)
                changed += 1
            used_emails.add(candidate.email_masked)

        if candidate.phone_masked:
            if candidate.phone_masked in used_phones or candidate.phone_masked in STALE_DEMO_PHONES:
                candidate.phone_masked = _unique_demo_phone(candidate.id, used_phones)
                changed += 1
            used_phones.add(candidate.phone_masked)

    return changed


def _ensure_candidate_source_batches(jobs):
    linked = 0
    for candidate in Candidate.query.order_by(Candidate.id.asc()).all():
        target_job_id = _fallback_job_for_candidate(candidate, jobs)
        if not target_job_id:
            continue

        batch = db.session.get(UploadBatch, candidate.upload_batch_id) if candidate.upload_batch_id else None
        if batch and batch.target_job_id:
            continue
        if batch is None:
            batch = UploadBatch(
                owner_hr_id=candidate.owner_hr_id,
                source_channel="演示数据",
                target_job_id=target_job_id,
                note="演示前整理：补齐候选人投递归属",
            )
            db.session.add(batch)
            db.session.flush()
            candidate.upload_batch_id = batch.id
        else:
            batch.target_job_id = target_job_id
            if not batch.source_channel:
                batch.source_channel = "演示数据"
            if not batch.note:
                batch.note = "演示前整理：补齐候选人投递归属"
        linked += 1
    return linked


def _demo_interviewer():
    return (
        User.query
        .filter(User.is_active.is_(True), User.role == "interviewer")
        .order_by(User.id.asc())
        .first()
        or User.query
        .filter(User.is_active.is_(True), User.role.in_(["manager", "admin"]))
        .order_by(User.id.asc())
        .first()
    )


def _ensure_interview_assignments():
    demo_assignments = (
        InterviewAssignment.query
        .filter_by(note=DEMO_ASSIGNMENT_NOTE)
        .order_by(InterviewAssignment.id.asc())
        .all()
    )
    if len(demo_assignments) > MAX_DEMO_ASSIGNMENTS:
        for extra in demo_assignments[MAX_DEMO_ASSIGNMENTS:]:
            db.session.delete(extra)
        db.session.flush()
        demo_assignments = demo_assignments[:MAX_DEMO_ASSIGNMENTS]
    if demo_assignments or InterviewAssignment.query.count() > 0:
        return 0

    interviewer = _demo_interviewer()
    if interviewer is None:
        return 0

    created = 0
    stages = (
        PipelineStage.query
        .filter(PipelineStage.stage.in_(INTERVIEW_STAGES))
        .order_by(PipelineStage.ts.asc(), PipelineStage.id.asc())
        .all()
    )
    for stage in stages:
        exists = InterviewAssignment.query.filter_by(
            candidate_id=stage.candidate_id,
            job_id=stage.job_id,
            round=DEMO_ROUND_BY_STAGE.get(stage.stage, "round_1"),
        ).first()
        if exists:
            continue
        db.session.add(InterviewAssignment(
            candidate_id=stage.candidate_id,
            job_id=stage.job_id,
            round=DEMO_ROUND_BY_STAGE.get(stage.stage, "round_1"),
            interviewer_id=interviewer.id,
            scheduled_at=utc_now() + timedelta(days=1 + created),
            location="腾讯会议 / 现场面试",
            note=DEMO_ASSIGNMENT_NOTE,
            status="scheduled",
            created_by=stage.updated_by,
        ))
        created += 1
        if created >= 3:
            break
    return created


def prepare_demo_readiness():
    """Tidy local demo data without changing product schema or core workflows."""
    result = {
        "candidate_names_cleaned": 0,
        "candidate_contacts_cleaned": 0,
        "candidates_linked": 0,
        "assignments_created": 0,
    }
    jobs = _active_jobs()
    result["candidate_names_cleaned"] = _clean_duplicate_candidate_names()
    result["candidate_contacts_cleaned"] = _clean_duplicate_candidate_contacts()
    result["candidates_linked"] = _ensure_candidate_source_batches(jobs)
    result["assignments_created"] = _ensure_interview_assignments()
    db.session.commit()
    return result
