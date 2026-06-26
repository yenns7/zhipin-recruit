from datetime import UTC, date, datetime, timedelta

from app import db
from app.api.bi import _funnel
from app.models import (
    Candidate,
    InterviewAssignment,
    InterviewFeedback,
    Job,
    Match,
    PipelineStage,
    RecruitmentDemand,
    UploadBatch,
    User,
)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_funnel_pipeline_total_excludes_terminal_archive(app):
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

        now = datetime.now(UTC).replace(tzinfo=None)
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

    assert funnel["pipeline_total"] == 10
    assert funnel["archived_total"] == 7
    assert funnel["funnel_total"] == 17
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
    helper_hr_id, _ = make_user("alert-helper@example.com", role="recruiter", name="协作HR")
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
            updated_by=helper_hr_id,
            ts=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=8),
        ))
        db.session.add(PipelineStage(
            candidate_id=feedback_candidate.id,
            job_id=job.id,
            stage="interview_first",
            updated_by=hr_id,
            ts=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=1),
        ))
        db.session.add(InterviewAssignment(
            candidate_id=feedback_candidate.id,
            job_id=job.id,
            round="interview_first",
            interviewer_id=interviewer_id,
            scheduled_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=2),
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
    assert "负责人 HR" in stale_alert["detail"]
    assert "最后推进 协作HR" in stale_alert["detail"]
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
        rejected_candidate = Candidate(
            owner_hr_id=hr_id,
            name_masked="已淘汰候选人",
            resume_json={"extracted_info": {"skills": ["销售"]}},
        )
        db.session.add_all([candidate, rejected_candidate])
        db.session.flush()
        db.session.add_all([
            PipelineStage(
                candidate_id=candidate.id,
                job_id=feedback_job.id,
                stage="business_review",
                updated_by=hr_id,
                ts=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=1),
            ),
            PipelineStage(
                candidate_id=rejected_candidate.id,
                job_id=no_recommend_job.id,
                stage="rejected",
                updated_by=hr_id,
                ts=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=1),
            ),
        ])
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
                ts=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=1),
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


def test_bi_overview_includes_hr_monthly_performance_metrics(client, make_user, app):
    hr_id, _ = make_user("performance-hr@example.com", role="recruiter", name="绩效HR")
    other_hr_id, _ = make_user("other-performance-hr@example.com", role="recruiter", name="其他HR")
    interviewer_id, _ = make_user("performance-interviewer@example.com", role="interviewer", name="面试官")
    _, manager_token = make_user("performance-manager@example.com", role="manager", name="经理")

    with app.app_context():
        job = Job(title="后端工程师", city="上海", department="研发部", jd_text="Python")
        db.session.add(job)
        db.session.flush()

        boss_batch = UploadBatch(owner_hr_id=hr_id, target_job_id=job.id, source_channel="Boss直聘")
        referral_batch = UploadBatch(owner_hr_id=hr_id, target_job_id=job.id, source_channel="内推")
        db.session.add_all([boss_batch, referral_batch])
        db.session.flush()

        c1 = Candidate(owner_hr_id=hr_id, upload_batch_id=boss_batch.id, name_masked="候选人A", resume_json={})
        c2 = Candidate(owner_hr_id=hr_id, upload_batch_id=boss_batch.id, name_masked="候选人B", resume_json={})
        c3 = Candidate(owner_hr_id=hr_id, upload_batch_id=referral_batch.id, name_masked="候选人C", resume_json={})
        c4 = Candidate(
            owner_hr_id=hr_id,
            upload_batch_id=referral_batch.id,
            name_masked="解析失败候选人",
            resume_json={},
            parse_status="failed",
        )
        other = Candidate(owner_hr_id=other_hr_id, name_masked="其他HR候选人", resume_json={})
        db.session.add_all([c1, c2, c3, c4, other])
        db.session.flush()

        now = datetime.now(UTC).replace(tzinfo=None)
        db.session.add_all([
            PipelineStage(candidate_id=c1.id, job_id=job.id, stage="business_review", updated_by=other_hr_id, ts=now - timedelta(days=5)),
            PipelineStage(candidate_id=c1.id, job_id=job.id, stage="interview_first", updated_by=other_hr_id, ts=now - timedelta(days=4)),
            PipelineStage(candidate_id=c1.id, job_id=job.id, stage="interview_second", updated_by=other_hr_id, ts=now - timedelta(days=3)),
            PipelineStage(candidate_id=c1.id, job_id=job.id, stage="offer", updated_by=other_hr_id, ts=now - timedelta(days=2)),
            PipelineStage(candidate_id=c1.id, job_id=job.id, stage="onboarded", updated_by=other_hr_id, ts=now - timedelta(days=1)),
            PipelineStage(candidate_id=c2.id, job_id=job.id, stage="business_review", updated_by=hr_id, ts=now - timedelta(days=4)),
            PipelineStage(candidate_id=c2.id, job_id=job.id, stage="interview_first", updated_by=hr_id, ts=now - timedelta(days=3)),
            PipelineStage(candidate_id=c3.id, job_id=job.id, stage="interview_first", updated_by=hr_id, ts=now - timedelta(days=2)),
            PipelineStage(candidate_id=other.id, job_id=job.id, stage="interview_first", updated_by=other_hr_id, ts=now - timedelta(days=1)),
        ])
        db.session.add_all([
            InterviewFeedback(
                candidate_id=c1.id,
                job_id=job.id,
                round="interview_first",
                interviewer_id=interviewer_id,
                score=4,
                passed=True,
            ),
            InterviewFeedback(
                candidate_id=c1.id,
                job_id=job.id,
                round="interview_second",
                interviewer_id=interviewer_id,
                score=4,
                passed=True,
            ),
            InterviewFeedback(
                candidate_id=c2.id,
                job_id=job.id,
                round="interview_first",
                interviewer_id=interviewer_id,
                score=2,
                passed=False,
            ),
            InterviewAssignment(
                candidate_id=c3.id,
                job_id=job.id,
                round="interview_first",
                interviewer_id=interviewer_id,
                scheduled_at=now - timedelta(days=1),
                created_by=hr_id,
            ),
        ])
        db.session.commit()

    response = client.get("/api/bi/overview?days=30", headers=_auth(manager_token))

    assert response.status_code == 200
    payload = response.get_json()
    staff = next(item for item in payload["staff"] if item["name"] == "绩效HR")
    assert staff["resumes"] == 4
    assert staff["parse_failed"] == 1
    assert staff["effective_recommendations"] == 3
    assert staff["interview_entries"] == 3
    assert staff["interview_feedbacks"] == 2
    assert staff["interview_passed"] == 1
    assert staff["interview_pass_rate"] == 33.3
    assert "first_interview_entries" not in staff
    assert "second_interview_entries" not in staff
    assert "final_interview_entries" not in staff
    assert staff["offer_entries"] == 1
    assert staff["onboarded"] == 1
    assert staff["recommendation_to_onboard_rate"] == 33.3
    assert staff["feedback_pending"] == 1
    assert staff["feedback_overdue"] == 1

    source_quality = {item["channel"]: item for item in payload["source_quality"]}
    assert source_quality["BOSS直聘"]["resumes"] == 2
    assert source_quality["BOSS直聘"]["interview_entries"] == 2
    assert source_quality["BOSS直聘"]["interview_passed"] == 1
    assert "first_interview_entries" not in source_quality["BOSS直聘"]
    assert "second_interview_entries" not in source_quality["BOSS直聘"]
    assert source_quality["BOSS直聘"]["onboarded"] == 1
    assert source_quality["内推"]["resumes"] == 2
    assert source_quality["内推"]["interview_entries"] == 1
    assert "first_interview_entries" not in source_quality["内推"]


def test_bi_staff_detail_returns_public_performance_metrics(client, make_user, app):
    hr_id, hr_token = make_user("staff-detail-hr@example.com", role="recruiter", name="个人业绩HR")
    other_hr_id, _ = make_user("staff-detail-other@example.com", role="recruiter", name="其他HR")
    interviewer_id, _ = make_user("staff-detail-interviewer@example.com", role="interviewer", name="面试官")

    with app.app_context():
        job = Job(title="数据分析师", city="上海", department="数据部", jd_text="SQL")
        db.session.add(job)
        db.session.flush()

        c1 = Candidate(owner_hr_id=hr_id, name_masked="候选人A", resume_json={})
        c2 = Candidate(owner_hr_id=hr_id, name_masked="候选人B", resume_json={})
        c3 = Candidate(owner_hr_id=other_hr_id, name_masked="其他HR候选人", resume_json={})
        db.session.add_all([c1, c2, c3])
        db.session.flush()

        now = datetime.now(UTC).replace(tzinfo=None)
        db.session.add_all([
            PipelineStage(
                candidate_id=c1.id,
                job_id=job.id,
                stage="interview",
                updated_by=other_hr_id,
                ts=now - timedelta(days=3),
            ),
            PipelineStage(
                candidate_id=c1.id,
                job_id=job.id,
                stage="offer",
                updated_by=other_hr_id,
                ts=now - timedelta(days=2),
            ),
            PipelineStage(
                candidate_id=c2.id,
                job_id=job.id,
                stage="business_review",
                updated_by=hr_id,
                ts=now - timedelta(days=2),
            ),
            PipelineStage(
                candidate_id=c2.id,
                job_id=job.id,
                stage="interview",
                updated_by=hr_id,
                ts=now - timedelta(days=1),
            ),
            PipelineStage(
                candidate_id=c3.id,
                job_id=job.id,
                stage="interview",
                updated_by=other_hr_id,
                ts=now - timedelta(days=1),
            ),
            InterviewFeedback(
                candidate_id=c1.id,
                job_id=job.id,
                round="round_1",
                interviewer_id=interviewer_id,
                score=4,
                passed=True,
                created_at=now - timedelta(days=1),
            ),
            InterviewAssignment(
                candidate_id=c2.id,
                job_id=job.id,
                round="business",
                interviewer_id=interviewer_id,
                scheduled_at=now - timedelta(hours=4),
                created_by=hr_id,
            ),
        ])
        db.session.commit()

    response = client.get(f"/api/bi/staff/{hr_id}?days=30", headers=_auth(hr_token))

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["hr_id"] == hr_id
    assert "performance" in payload
    performance = payload["performance"]
    assert performance["name"] == "个人业绩HR"
    assert performance["resumes"] == 2
    assert performance["effective_recommendations"] == 2
    assert performance["business_review_entries"] == 1
    assert performance["interview_entries"] == 2
    assert performance["interview_passed"] == 1
    assert performance["offer_entries"] == 1
    assert performance["feedback_pending"] == 1
    assert "first_interview_entries" not in performance
    assert "second_interview_entries" not in performance


def test_bi_staff_detail_funnel_uses_candidate_owner_not_stage_actor(client, make_user, app):
    hr_id, hr_token = make_user("owner-funnel-hr@example.com", role="recruiter", name="负责HR")
    helper_hr_id, _ = make_user("helper-funnel-hr@example.com", role="recruiter", name="协作HR")

    with app.app_context():
        job = Job(title="增长运营", city="上海", department="运营部", jd_text="增长")
        db.session.add(job)
        db.session.flush()

        owned_candidate = Candidate(owner_hr_id=hr_id, name_masked="归属候选人", resume_json={})
        helper_candidate = Candidate(owner_hr_id=helper_hr_id, name_masked="协作候选人", resume_json={})
        db.session.add_all([owned_candidate, helper_candidate])
        db.session.flush()

        now = datetime.now(UTC).replace(tzinfo=None)
        db.session.add_all([
            PipelineStage(
                candidate_id=owned_candidate.id,
                job_id=job.id,
                stage="offer",
                updated_by=helper_hr_id,
                ts=now - timedelta(days=1),
            ),
            PipelineStage(
                candidate_id=helper_candidate.id,
                job_id=job.id,
                stage="interview",
                updated_by=hr_id,
                ts=now - timedelta(days=1),
            ),
        ])
        db.session.commit()

    response = client.get(f"/api/bi/staff/{hr_id}?days=30", headers=_auth(hr_token))

    assert response.status_code == 200
    funnel = response.get_json()["funnel"]
    assert funnel["offer"] == 1
    assert funnel["pipeline_total"] == 1
    assert funnel.get("interview", 0) == 0


def test_bi_overview_current_funnel_includes_old_latest_stage(client, make_user, app):
    hr_id, _ = make_user("current-funnel-hr@example.com", role="recruiter", name="HR")
    _, manager_token = make_user("current-funnel-manager@example.com", role="manager", name="经理")

    with app.app_context():
        job = Job(title="财务经理", city="上海", department="财务部", jd_text="财务")
        candidate = Candidate(owner_hr_id=hr_id, name_masked="长期流程候选人", resume_json={})
        db.session.add_all([job, candidate])
        db.session.flush()

        db.session.add(PipelineStage(
            candidate_id=candidate.id,
            job_id=job.id,
            stage="offer",
            updated_by=hr_id,
            ts=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=45),
        ))
        db.session.commit()

    response = client.get("/api/bi/overview?days=7", headers=_auth(manager_token))

    assert response.status_code == 200
    funnel = response.get_json()["funnel"]
    assert funnel["offer"] == 1
    assert funnel["pipeline_total"] == 1


def test_source_quality_uses_resume_cohort_not_recent_actions_for_old_resumes(client, make_user, app):
    hr_id, _ = make_user("source-cohort-hr@example.com", role="recruiter", name="HR")
    interviewer_id, _ = make_user("source-cohort-interviewer@example.com", role="interviewer", name="面试官")
    _, manager_token = make_user("source-cohort-manager@example.com", role="manager", name="经理")

    with app.app_context():
        job = Job(title="销售经理", city="上海", department="销售部", jd_text="销售")
        batch = UploadBatch(owner_hr_id=hr_id, target_job_id=job.id, source_channel="BOSS直聘")
        db.session.add_all([job, batch])
        db.session.flush()

        now = datetime.now(UTC).replace(tzinfo=None)
        old_candidate = Candidate(
            owner_hr_id=hr_id,
            upload_batch_id=batch.id,
            name_masked="老简历候选人",
            resume_json={},
            created_at=now - timedelta(days=60),
        )
        new_candidate = Candidate(
            owner_hr_id=hr_id,
            upload_batch_id=batch.id,
            name_masked="本期新简历",
            resume_json={},
            created_at=now - timedelta(days=1),
        )
        db.session.add_all([old_candidate, new_candidate])
        db.session.flush()

        db.session.add_all([
            PipelineStage(
                candidate_id=old_candidate.id,
                job_id=job.id,
                stage="interview",
                updated_by=hr_id,
                ts=now - timedelta(days=2),
            ),
            PipelineStage(
                candidate_id=old_candidate.id,
                job_id=job.id,
                stage="offer",
                updated_by=hr_id,
                ts=now - timedelta(days=1),
            ),
            InterviewFeedback(
                candidate_id=old_candidate.id,
                job_id=job.id,
                round="interview_first",
                interviewer_id=interviewer_id,
                score=4,
                passed=True,
                created_at=now - timedelta(days=1),
            ),
        ])
        db.session.commit()

    response = client.get("/api/bi/overview?days=30", headers=_auth(manager_token))

    assert response.status_code == 200
    source_quality = {item["channel"]: item for item in response.get_json()["source_quality"]}
    assert source_quality["BOSS直聘"]["resumes"] == 1
    assert source_quality["BOSS直聘"]["interview_entries"] == 0
    assert source_quality["BOSS直聘"]["offer_entries"] == 0
    assert source_quality["BOSS直聘"]["interview_passed"] == 0


def test_bi_overview_reports_data_quality_warning_for_missing_rate_denominator(client, make_user, app):
    hr_id, _ = make_user("warning-hr@example.com", role="recruiter", name="HR")
    _, manager_token = make_user("warning-manager@example.com", role="manager", name="经理")

    with app.app_context():
        job = Job(title="法务经理", city="上海", department="法务部", jd_text="法务")
        batch = UploadBatch(owner_hr_id=hr_id, target_job_id=job.id, source_channel="猎聘")
        db.session.add_all([job, batch])
        db.session.flush()

        candidate = Candidate(
            owner_hr_id=hr_id,
            upload_batch_id=batch.id,
            name_masked="跳阶候选人",
            resume_json={},
        )
        db.session.add(candidate)
        db.session.flush()

        db.session.add(PipelineStage(
            candidate_id=candidate.id,
            job_id=job.id,
            stage="offer",
            updated_by=hr_id,
            ts=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=1),
        ))
        db.session.commit()

    response = client.get("/api/bi/overview?days=30", headers=_auth(manager_token))

    assert response.status_code == 200
    warnings = response.get_json()["data_quality_warnings"]
    assert any(
        item["metric"] == "source_quality.interview_to_offer_rate"
        and item["label"] == "猎聘"
        and item["numerator"] == 1
        and item["denominator"] == 0
        for item in warnings
    )


def test_bi_overview_invalid_days_falls_back_to_default(client, make_user, app):
    hr_id, _ = make_user("invalid-days-hr@example.com", role="recruiter", name="HR")
    _, manager_token = make_user("invalid-days-manager@example.com", role="manager", name="经理")

    with app.app_context():
        recent_candidate = Candidate(owner_hr_id=hr_id, name_masked="本期候选人", resume_json={})
        old_candidate = Candidate(
            owner_hr_id=hr_id,
            name_masked="旧候选人",
            resume_json={},
            created_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=45),
        )
        db.session.add_all([recent_candidate, old_candidate])
        db.session.commit()

    response = client.get("/api/bi/overview?days=not-a-number", headers=_auth(manager_token))

    assert response.status_code == 200
    assert response.get_json()["resumes"]["total_candidates"] == 1


def test_bi_job_funnel_rejects_recruiter_for_unowned_job(client, make_user, app):
    owner_hr_id, owner_token = make_user("job-bi-owner@example.com", role="recruiter", name="负责HR")
    collaborator_hr_id, collaborator_token = make_user("job-bi-collaborator@example.com", role="recruiter", name="协作HR")
    _, unrelated_hr_token = make_user("job-bi-other@example.com", role="recruiter", name="其他HR")
    _, interviewer_token = make_user("job-bi-interviewer@example.com", role="interviewer", name="面试官")

    with app.app_context():
        job = Job(
            title="品牌经理",
            city="上海",
            department="市场部",
            jd_text="品牌",
            owner_hr_id=owner_hr_id,
        )
        db.session.add(job)
        db.session.flush()
        owner_candidate = Candidate(owner_hr_id=owner_hr_id, name_masked="岗位负责人候选人", resume_json={})
        collaborator_candidate = Candidate(owner_hr_id=collaborator_hr_id, name_masked="协作候选人", resume_json={})
        db.session.add_all([owner_candidate, collaborator_candidate])
        db.session.flush()
        now = datetime.now(UTC).replace(tzinfo=None)
        db.session.add_all([
            PipelineStage(
                candidate_id=owner_candidate.id,
                job_id=job.id,
                stage="offer",
                updated_by=owner_hr_id,
                ts=now - timedelta(days=1),
            ),
            PipelineStage(
                candidate_id=collaborator_candidate.id,
                job_id=job.id,
                stage="interview",
                updated_by=collaborator_hr_id,
                ts=now - timedelta(days=1),
            ),
        ])
        db.session.commit()
        job_id = job.id

    owner_response = client.get(f"/api/bi/job/{job_id}", headers=_auth(owner_token))
    collaborator_response = client.get(f"/api/bi/job/{job_id}", headers=_auth(collaborator_token))
    unrelated_response = client.get(f"/api/bi/job/{job_id}", headers=_auth(unrelated_hr_token))
    interviewer_response = client.get(f"/api/bi/job/{job_id}", headers=_auth(interviewer_token))

    assert owner_response.status_code == 200
    assert owner_response.get_json()["scope"] == "all"
    assert owner_response.get_json()["funnel"]["offer"] == 1
    assert owner_response.get_json()["funnel"]["interview"] == 1
    assert collaborator_response.status_code == 403
    assert unrelated_response.status_code == 403
    assert interviewer_response.status_code == 403


def test_bi_staff_detail_restricts_interviewer_scope(client, make_user):
    hr_id, hr_token = make_user("staff-scope-hr@example.com", role="recruiter", name="招聘HR")
    _, manager_token = make_user("staff-scope-manager@example.com", role="manager", name="经理")
    _, interviewer_token = make_user("staff-scope-interviewer@example.com", role="interviewer", name="面试官")

    own_response = client.get(f"/api/bi/staff/{hr_id}", headers=_auth(hr_token))
    manager_response = client.get(f"/api/bi/staff/{hr_id}", headers=_auth(manager_token))
    interviewer_response = client.get(f"/api/bi/staff/{hr_id}", headers=_auth(interviewer_token))

    assert own_response.status_code == 200
    assert manager_response.status_code == 200
    assert interviewer_response.status_code == 403


def test_interview_accountability_treats_substitute_feedback_as_round_completed(client, make_user, app):
    hr_id, _ = make_user("substitute-feedback-hr@example.com", role="recruiter", name="招聘HR")
    assigned_id, _ = make_user("assigned-interviewer@example.com", role="interviewer", name="原面试官")
    substitute_id, _ = make_user("substitute-interviewer@example.com", role="interviewer", name="代填面试官")
    _, manager_token = make_user("substitute-manager@example.com", role="manager", name="经理")

    with app.app_context():
        job = Job(title="算法工程师", city="上海", department="算法部", jd_text="算法")
        candidate = Candidate(owner_hr_id=hr_id, name_masked="候选人A", resume_json={})
        db.session.add_all([job, candidate])
        db.session.flush()

        now = datetime.now(UTC).replace(tzinfo=None)
        db.session.add_all([
            InterviewAssignment(
                candidate_id=candidate.id,
                job_id=job.id,
                round="round_1",
                interviewer_id=assigned_id,
                scheduled_at=now - timedelta(days=1),
                created_by=hr_id,
            ),
            InterviewFeedback(
                candidate_id=candidate.id,
                job_id=job.id,
                round="round_1",
                interviewer_id=substitute_id,
                score=4,
                passed=True,
                created_at=now,
            ),
        ])
        db.session.commit()

    response = client.get("/api/bi/overview?days=30", headers=_auth(manager_token))

    assert response.status_code == 200
    interviewers = {item["interviewer_name"]: item for item in response.get_json()["interviewer_accountability"]}
    assert interviewers["原面试官"]["assigned_count"] == 1
    assert interviewers["原面试官"]["pending_feedback"] == 0
    assert interviewers["代填面试官"]["feedback_submitted"] == 1


def test_bi_overview_includes_department_and_interviewer_accountability(client, make_user, app):
    hr_id, _ = make_user("accountability-hr@example.com", role="recruiter", name="招聘HR")
    interviewer_a_id, _ = make_user("accountability-a@example.com", role="interviewer", name="面试官A")
    interviewer_b_id, _ = make_user("accountability-b@example.com", role="interviewer", name="面试官B")
    _, manager_token = make_user("accountability-manager@example.com", role="manager", name="经理")

    with app.app_context():
        backend_job = Job(title="后端工程师", city="上海", department="研发部", jd_text="Python")
        product_job = Job(title="产品经理", city="上海", department="产品部", jd_text="AI 产品")
        db.session.add_all([backend_job, product_job])
        db.session.flush()

        candidates = [
            Candidate(owner_hr_id=hr_id, name_masked=f"候选人{i}", resume_json={})
            for i in range(1, 5)
        ]
        db.session.add_all(candidates)
        db.session.flush()

        now = datetime.now(UTC).replace(tzinfo=None)
        db.session.add_all([
            InterviewAssignment(
                candidate_id=candidates[0].id,
                job_id=backend_job.id,
                round="round_1",
                interviewer_id=interviewer_a_id,
                scheduled_at=now - timedelta(days=4),
                created_by=hr_id,
            ),
            InterviewAssignment(
                candidate_id=candidates[1].id,
                job_id=backend_job.id,
                round="round_1",
                interviewer_id=interviewer_a_id,
                scheduled_at=now - timedelta(days=3),
                created_by=hr_id,
            ),
            InterviewAssignment(
                candidate_id=candidates[2].id,
                job_id=backend_job.id,
                round="round_2",
                interviewer_id=interviewer_b_id,
                scheduled_at=now - timedelta(days=2),
                created_by=hr_id,
            ),
            InterviewAssignment(
                candidate_id=candidates[3].id,
                job_id=product_job.id,
                round="business",
                interviewer_id=interviewer_a_id,
                scheduled_at=now - timedelta(days=1),
                created_by=hr_id,
            ),
            InterviewFeedback(
                candidate_id=candidates[0].id,
                job_id=backend_job.id,
                round="round_1",
                interviewer_id=interviewer_a_id,
                score=4,
                passed=True,
                created_at=now - timedelta(days=3),
            ),
            InterviewFeedback(
                candidate_id=candidates[1].id,
                job_id=backend_job.id,
                round="round_1",
                interviewer_id=interviewer_a_id,
                score=2,
                passed=False,
                created_at=now - timedelta(days=2),
            ),
            InterviewFeedback(
                candidate_id=candidates[3].id,
                job_id=product_job.id,
                round="business",
                interviewer_id=interviewer_a_id,
                score=5,
                passed=True,
                created_at=now - timedelta(days=1),
            ),
        ])
        db.session.commit()

    response = client.get("/api/bi/overview?days=30", headers=_auth(manager_token))

    assert response.status_code == 200
    payload = response.get_json()

    interviewers = {item["interviewer_name"]: item for item in payload["interviewer_accountability"]}
    assert interviewers["面试官A"]["assigned_count"] == 3
    assert interviewers["面试官A"]["feedback_submitted"] == 3
    assert interviewers["面试官A"]["passed_count"] == 2
    assert interviewers["面试官A"]["rejected_count"] == 1
    assert interviewers["面试官A"]["pending_feedback"] == 0
    assert interviewers["面试官A"]["pass_rate"] == 66.7
    assert interviewers["面试官B"]["assigned_count"] == 1
    assert interviewers["面试官B"]["feedback_submitted"] == 0
    assert interviewers["面试官B"]["pending_feedback"] == 1
    assert interviewers["面试官B"]["overdue_feedback"] == 1

    departments = {item["department"]: item for item in payload["department_accountability"]}
    assert departments["研发部"]["assigned_count"] == 3
    assert departments["研发部"]["feedback_submitted"] == 2
    assert departments["研发部"]["passed_count"] == 1
    assert departments["研发部"]["rejected_count"] == 1
    assert departments["研发部"]["pending_feedback"] == 1
    assert departments["研发部"]["interviewers_count"] == 2
    assert departments["研发部"]["pass_rate"] == 50.0

    backend_rounds = {item["round"]: item for item in departments["研发部"]["rounds"]}
    assert backend_rounds["round_1"]["assigned_count"] == 2
    assert backend_rounds["round_1"]["passed_count"] == 1
    assert backend_rounds["round_1"]["rejected_count"] == 1
    assert backend_rounds["round_2"]["assigned_count"] == 1
    assert backend_rounds["round_2"]["pending_feedback"] == 1

    assert departments["产品部"]["assigned_count"] == 1
    assert departments["产品部"]["passed_count"] == 1
    assert departments["产品部"]["pass_rate"] == 100.0
