from datetime import datetime, timedelta

from app import db
from app.api.bi import _funnel
from app.models import Candidate, InterviewAssignment, Job, PipelineStage, User


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_funnel_conversion_rate_uses_current_pipeline_total(app):
    with app.app_context():
        user = User(
            name="HR",
            email="hr@example.com",
            role="recruiter",
            password_hash="x",
        )
        db.session.add(user)
        db.session.flush()
        job = Job(title="会计", city="上海", department="财务总部", jd_text="负责财务核算")
        db.session.add(job)
        db.session.flush()

        now = datetime.utcnow()
        stages = (
            ["pending"] * 3
            + ["ai_screen"] * 4
            + ["interview_first"] * 2
            + ["offer"] * 1
            + ["onboarded"] * 4
            + ["rejected"] * 3
        )
        for index, stage in enumerate(stages, start=1):
            db.session.add(
                PipelineStage(
                    candidate_id=index,
                    job_id=job.id,
                    stage=stage,
                    updated_by=user.id,
                    ts=now - timedelta(minutes=index),
                )
            )
        db.session.commit()

        funnel = _funnel(days=30)

    assert funnel["pipeline_total"] == 17
    assert funnel["conversion_rate"] == round(4 / 17 * 100, 1)
    assert funnel["conversion_rate"] <= 100


def test_bi_overview_excludes_inactive_recruiters(client, make_user):
    _, admin_token = make_user("admin@example.com", role="admin", name="Admin")
    make_user("active@example.com", role="recruiter", name="正常专员")
    make_user("inactive@example.com", role="recruiter", name="测试专员", is_active=False)

    response = client.get("/api/bi/overview", headers=_auth(admin_token))

    assert response.status_code == 200
    names = [item["name"] for item in response.get_json()["staff"]]
    assert "正常专员" in names
    assert "测试专员" not in names


def test_bi_overview_surfaces_manager_action_alerts(client, make_user, app):
    hr_id, _ = make_user("hr@example.com", role="recruiter", name="HR")
    interviewer_id, _ = make_user("interviewer@example.com", role="interviewer", name="面试官")
    _, manager_token = make_user("manager@example.com", role="manager", name="经理")

    with app.app_context():
        job = Job(title="产品经理", city="上海", department="产品部", jd_text="负责产品规划")
        db.session.add(job)
        db.session.flush()
        stale_candidate = Candidate(
            owner_hr_id=hr_id,
            name_masked="候选人A",
            resume_json={"extracted_info": {"skills": ["产品规划"]}},
        )
        feedback_candidate = Candidate(
            owner_hr_id=hr_id,
            name_masked="候选人B",
            resume_json={"extracted_info": {"skills": ["用户研究"]}},
        )
        db.session.add_all([stale_candidate, feedback_candidate])
        db.session.flush()

        db.session.add(PipelineStage(
            candidate_id=stale_candidate.id,
            job_id=job.id,
            stage="pending",
            updated_by=hr_id,
            ts=datetime.utcnow() - timedelta(days=8),
        ))
        db.session.add(PipelineStage(
            candidate_id=feedback_candidate.id,
            job_id=job.id,
            stage="interview_first",
            updated_by=hr_id,
            ts=datetime.utcnow() - timedelta(days=1),
        ))
        db.session.add(InterviewAssignment(
            candidate_id=feedback_candidate.id,
            job_id=job.id,
            round="interview_first",
            interviewer_id=interviewer_id,
            scheduled_at=datetime.utcnow() - timedelta(days=2),
            created_by=hr_id,
        ))
        db.session.commit()
        stale_id = stale_candidate.id
        feedback_id = feedback_candidate.id
        job_id = job.id

    response = client.get("/api/bi/overview", headers=_auth(manager_token))

    assert response.status_code == 200
    alerts = response.get_json()["alerts"]
    stale_alert = next(item for item in alerts if item["kind"] == "stale_pipeline")
    feedback_alert = next(item for item in alerts if item["kind"] == "pending_interview_feedback")

    assert stale_alert["candidate_id"] == stale_id
    assert stale_alert["job_id"] == job_id
    assert stale_alert["stage"] == "pending"
    assert stale_alert["age_days"] >= 7
    assert stale_alert["action_path"] == f"/pipeline?job={job_id}&candidate={stale_id}"
    assert feedback_alert["candidate_id"] == feedback_id
    assert feedback_alert["job_id"] == job_id
    assert feedback_alert["action_path"] == f"/pipeline?job={job_id}&candidate={feedback_id}"
