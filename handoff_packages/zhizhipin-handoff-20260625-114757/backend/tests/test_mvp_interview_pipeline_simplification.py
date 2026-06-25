from datetime import UTC, datetime, timedelta
from pathlib import Path

from app import db
from app.models import Candidate, InterviewFeedback, Job, PipelineStage, UploadBatch, User


ROOT = Path(__file__).resolve().parents[2]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_pipeline_uses_single_interview_stage_for_mvp(client, make_user, app):
    _, token = make_user("mvp-pipeline@example.com", role="recruiter", name="流程HR")
    with app.app_context():
        job = Job(title="销售顾问", jd_text="销售跟进")
        candidate = Candidate(name_masked="候选人A", resume_json={})
        db.session.add_all([job, candidate])
        db.session.commit()
        job_id = job.id
        candidate_id = candidate.id

    response = client.post(
        "/api/pipeline/move",
        headers=_auth(token),
        json={
            "candidate_id": candidate_id,
            "job_id": job_id,
            "stage": "interview",
            "note": "业务确认进入面试",
        },
    )

    assert response.status_code == 200
    counts = client.get(f"/api/pipeline/{job_id}", headers=_auth(token)).get_json()
    assert counts == {"interview": 1}
    board = client.get(f"/api/pipeline/{job_id}/board", headers=_auth(token)).get_json()
    assert board["stage_order"] == [
        "pending",
        "ai_screen",
        "business_review",
        "interview",
        "offer",
        "onboarded",
        "rejected",
    ]
    assert board["candidates"][0]["stage"] == "interview"


def test_bi_staff_performance_uses_generic_interview_metrics(client, make_user, app):
    hr_id, _ = make_user("mvp-bi-hr@example.com", role="recruiter", name="绩效HR")
    interviewer_id, _ = make_user("mvp-bi-interviewer@example.com", role="interviewer", name="面试官")
    _, manager_token = make_user("mvp-bi-manager@example.com", role="manager", name="经理")

    with app.app_context():
        job = Job(title="AI 产品经理", city="上海", department="产品部", jd_text="AI 产品")
        db.session.add(job)
        db.session.flush()
        batch = UploadBatch(owner_hr_id=hr_id, target_job_id=job.id, source_channel="内推")
        db.session.add(batch)
        db.session.flush()

        passed = Candidate(owner_hr_id=hr_id, upload_batch_id=batch.id, name_masked="通过候选人", resume_json={})
        failed = Candidate(owner_hr_id=hr_id, upload_batch_id=batch.id, name_masked="未通过候选人", resume_json={})
        offer = Candidate(owner_hr_id=hr_id, upload_batch_id=batch.id, name_masked="Offer候选人", resume_json={})
        db.session.add_all([passed, failed, offer])
        db.session.flush()

        now = datetime.now(UTC).replace(tzinfo=None)
        db.session.add_all([
            PipelineStage(candidate_id=passed.id, job_id=job.id, stage="interview", updated_by=hr_id, ts=now - timedelta(days=3)),
            PipelineStage(candidate_id=failed.id, job_id=job.id, stage="interview", updated_by=hr_id, ts=now - timedelta(days=2)),
            PipelineStage(candidate_id=offer.id, job_id=job.id, stage="interview", updated_by=hr_id, ts=now - timedelta(days=2)),
            PipelineStage(candidate_id=offer.id, job_id=job.id, stage="offer", updated_by=hr_id, ts=now - timedelta(days=1)),
            InterviewFeedback(candidate_id=passed.id, job_id=job.id, round="round_1", interviewer_id=interviewer_id, score=4, passed=True),
            InterviewFeedback(candidate_id=failed.id, job_id=job.id, round="technical", interviewer_id=interviewer_id, score=2, passed=False),
            InterviewFeedback(candidate_id=offer.id, job_id=job.id, round="hr", interviewer_id=interviewer_id, score=5, passed=True),
        ])
        db.session.commit()

    response = client.get("/api/bi/overview?days=30", headers=_auth(manager_token))

    assert response.status_code == 200
    payload = response.get_json()
    staff = next(item for item in payload["staff"] if item["name"] == "绩效HR")
    assert staff["interview_entries"] == 3
    assert staff["interview_feedbacks"] == 3
    assert staff["interview_passed"] == 2
    assert staff["interview_pass_rate"] == 66.7
    assert staff["interview_to_offer_rate"] == 33.3

    source = next(item for item in payload["source_quality"] if item["channel"] == "内推")
    assert source["interview_entries"] == 3
    assert source["interview_passed"] == 2
    assert source["interview_pass_rate"] == 66.7


def test_seed_pipeline_data_uses_generic_interview_stage():
    seed_text = (ROOT / "backend" / "seed_dev.py").read_text(encoding="utf-8")

    assert '"interview_first"' not in seed_text
    assert '"interview_second"' not in seed_text
    assert '"interview_final"' not in seed_text


def test_migration_normalizes_legacy_pipeline_stages_to_interview(app):
    import migrate_stages

    with app.app_context():
        job = Job(title="迁移测试岗位", jd_text="测试")
        candidates = [
            Candidate(name_masked="一面候选人", resume_json={}),
            Candidate(name_masked="二面候选人", resume_json={}),
            Candidate(name_masked="终面候选人", resume_json={}),
            Candidate(name_masked="当前候选人", resume_json={}),
        ]
        db.session.add(job)
        db.session.add_all(candidates)
        db.session.flush()
        db.session.add_all([
            PipelineStage(candidate_id=candidates[0].id, job_id=job.id, stage="interview_first"),
            PipelineStage(candidate_id=candidates[1].id, job_id=job.id, stage="interview_second"),
            PipelineStage(candidate_id=candidates[2].id, job_id=job.id, stage="interview_final"),
            PipelineStage(candidate_id=candidates[3].id, job_id=job.id, stage="interview"),
        ])
        db.session.commit()

        migrated = migrate_stages.normalize_legacy_interview_stages()
        stages = [stage for (stage,) in db.session.query(PipelineStage.stage).order_by(PipelineStage.id).all()]

    assert migrated == 3
    assert stages == ["interview", "interview", "interview", "interview"]
