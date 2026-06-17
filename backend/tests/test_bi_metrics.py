from datetime import date, datetime, timedelta

from app import db
from app.api.bi import _funnel
from app.models import (
    Candidate,
    InterviewAssignment,
    Job,
    Match,
    PipelineStage,
    RecruitmentDemand,
    UploadBatch,
    User,
)


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


def test_bi_overview_includes_demand_health_metrics(client, make_user, app):
    hr_id, _ = make_user("demand-hr@example.com", role="recruiter", name="需求HR")
    _, manager_token = make_user("demand-manager@example.com", role="manager", name="经理")

    with app.app_context():
        overdue_job = Job(title="财务主管", city="上海", department="财务部", jd_text="财务管理")
        no_recommend_job = Job(title="销售经理", city="深圳", department="销售部", jd_text="销售管理")
        feedback_job = Job(title="运营经理", city="广州", department="运营部", jd_text="运营管理")
        db.session.add_all([overdue_job, no_recommend_job, feedback_job])
        db.session.flush()

        db.session.add_all([
            RecruitmentDemand(
                job_id=overdue_job.id,
                owner_hr_id=hr_id,
                priority="A",
                status="active",
                requested_at=date.today() - timedelta(days=3),
                target_date=date.today() - timedelta(days=1),
            ),
            RecruitmentDemand(
                job_id=no_recommend_job.id,
                owner_hr_id=hr_id,
                priority="B",
                status="active",
                requested_at=date.today() - timedelta(days=10),
                accepted_at=date.today() - timedelta(days=9),
                target_date=date.today() + timedelta(days=20),
            ),
            RecruitmentDemand(
                job_id=feedback_job.id,
                owner_hr_id=hr_id,
                priority="C",
                status="active",
                requested_at=date.today() - timedelta(days=2),
                target_date=date.today() + timedelta(days=15),
            ),
        ])
        candidate = Candidate(
            owner_hr_id=hr_id,
            name_masked="业务待反馈候选人",
            resume_json={"extracted_info": {"skills": ["运营"]}},
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add(PipelineStage(
            candidate_id=candidate.id,
            job_id=feedback_job.id,
            stage="business_review",
            updated_by=hr_id,
            ts=datetime.utcnow() - timedelta(days=1),
        ))
        db.session.commit()

    response = client.get("/api/bi/overview", headers=_auth(manager_token))

    assert response.status_code == 200
    demands = response.get_json()["demands"]
    assert demands["active_total"] == 3
    assert demands["priority_counts"] == {"A": 1, "B": 1, "C": 1}
    assert demands["overdue"] == 1
    assert demands["hr_no_recommendation"] == 1
    assert demands["business_feedback_pending"] == 1


def test_bi_overview_includes_resume_consumption_metrics(client, make_user, app):
    hr_id, _ = make_user("resume-hr@example.com", role="recruiter", name="简历HR")
    _, manager_token = make_user("resume-manager@example.com", role="manager", name="经理")

    with app.app_context():
        job = Job(title="后端工程师", city="深圳", department="研发部", jd_text="Python")
        db.session.add(job)
        db.session.flush()
        targeted_batch = UploadBatch(owner_hr_id=hr_id, target_job_id=job.id, source_channel="猎聘")
        pool_batch = UploadBatch(owner_hr_id=hr_id, source_channel="内推")
        db.session.add_all([targeted_batch, pool_batch])
        db.session.flush()
        in_pipeline = Candidate(
            owner_hr_id=hr_id,
            upload_batch_id=targeted_batch.id,
            name_masked="候选人A",
            resume_json={"extracted_info": {"skills": ["Python"]}},
        )
        matched_only = Candidate(
            owner_hr_id=hr_id,
            upload_batch_id=targeted_batch.id,
            name_masked="候选人B",
            resume_json={"extracted_info": {"skills": ["Flask"]}},
        )
        pool_only = Candidate(
            owner_hr_id=hr_id,
            upload_batch_id=pool_batch.id,
            name_masked="候选人C",
            resume_json={"extracted_info": {"skills": ["SQL"]}},
        )
        db.session.add_all([in_pipeline, matched_only, pool_only])
        db.session.flush()
        db.session.add_all([
            Match(job_id=job.id, candidate_id=in_pipeline.id, score=0.88, reason="技能匹配"),
            Match(job_id=job.id, candidate_id=matched_only.id, score=0.72, reason="技能匹配"),
            PipelineStage(
                candidate_id=in_pipeline.id,
                job_id=job.id,
                stage="pending",
                updated_by=hr_id,
                ts=datetime.utcnow() - timedelta(days=1),
            ),
        ])
        db.session.commit()

    response = client.get("/api/bi/overview", headers=_auth(manager_token))

    assert response.status_code == 200
    resumes = response.get_json()["resumes"]
    assert resumes["total_candidates"] == 3
    assert resumes["linked_to_job"] == 2
    assert resumes["unassigned"] == 1
    assert resumes["matched_candidates"] == 2
    assert resumes["in_pipeline"] == 1
    assert resumes["not_in_pipeline"] == 2
    assert resumes["match_rate"] == 66.7
    assert resumes["pipeline_entry_rate"] == 33.3
