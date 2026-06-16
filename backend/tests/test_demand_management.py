from datetime import datetime, timedelta

from app import db
from app.models import Candidate, Job, PipelineStage


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_demands_can_be_created_listed_and_closed_with_metrics(client, make_user, app):
    hr_id, token = make_user("demand-hr@example.com", role="recruiter", name="需求HR")

    with app.app_context():
        job = Job(title="产品经理", city="上海", department="科技部", jd_text="负责产品规划")
        db.session.add(job)
        db.session.flush()
        candidates = [
            Candidate(owner_hr_id=hr_id, name_masked=f"候选人{i}", resume_json={})
            for i in range(1, 4)
        ]
        db.session.add_all(candidates)
        db.session.flush()
        db.session.add_all([
            PipelineStage(candidate_id=candidates[0].id, job_id=job.id, stage="business_review", updated_by=hr_id),
            PipelineStage(candidate_id=candidates[1].id, job_id=job.id, stage="interview_first", updated_by=hr_id),
            PipelineStage(candidate_id=candidates[2].id, job_id=job.id, stage="offer", updated_by=hr_id),
        ])
        db.session.commit()
        job_id = job.id

    created = client.post(
        "/api/demands",
        headers=_auth(token),
        json={
            "job_id": job_id,
            "request_no": "REQ-2026-001",
            "requester_name": "宋总",
            "requester_department": "科技部",
            "hiring_manager_name": "业务负责人A",
            "requested_at": "2026-06-01",
            "accepted_at": "2026-06-02",
            "target_date": "2026-07-01",
            "priority": "A",
            "headcount": 3,
            "status": "active",
            "note": "核心需求",
        },
    )

    assert created.status_code == 201
    body = created.get_json()
    assert body["job_id"] == job_id
    assert body["priority"] == "A"
    assert body["metrics"]["recommended_count"] == 3
    assert body["metrics"]["business_review_count"] == 1
    assert body["metrics"]["interview_count"] == 2
    assert body["metrics"]["offer_count"] == 1

    listed = client.get("/api/demands", headers=_auth(token))
    assert listed.status_code == 200
    item = listed.get_json()[0]
    assert item["request_no"] == "REQ-2026-001"
    assert item["job_title"] == "产品经理"
    assert item["metrics"]["recommended_count"] == 3

    closed = client.post(
        f"/api/demands/{body['id']}/close",
        headers=_auth(token),
        json={"status": "cancelled", "close_reason": "业务确认暂不招聘"},
    )
    assert closed.status_code == 200
    assert closed.get_json()["status"] == "cancelled"
    assert closed.get_json()["close_reason"] == "业务确认暂不招聘"

    with app.app_context():
        job = Job.query.get(job_id)
        assert job.status == "closed"


def test_demands_can_be_downgraded_and_expose_risk_flags(client, make_user, app):
    hr_id, token = make_user("demand-risk@example.com", role="recruiter", name="风险HR")

    with app.app_context():
        job = Job(title="Java 工程师", city="深圳", department="研发部", jd_text="负责 Java 开发")
        db.session.add(job)
        db.session.flush()
        for index in range(25):
            candidate = Candidate(owner_hr_id=hr_id, name_masked=f"候选人{index}", resume_json={})
            db.session.add(candidate)
            db.session.flush()
            db.session.add(PipelineStage(
                candidate_id=candidate.id,
                job_id=job.id,
                stage="business_review",
                updated_by=hr_id,
            ))
        db.session.commit()
        job_id = job.id

    created = client.post(
        "/api/demands",
        headers=_auth(token),
        json={
            "job_id": job_id,
            "requester_department": "研发部",
            "requested_at": (datetime.utcnow() - timedelta(days=45)).date().isoformat(),
            "accepted_at": (datetime.utcnow() - timedelta(days=44)).date().isoformat(),
            "target_date": (datetime.utcnow() - timedelta(days=5)).date().isoformat(),
            "priority": "A",
            "headcount": 2,
            "status": "active",
        },
    )
    assert created.status_code == 201
    demand_id = created.get_json()["id"]

    detail = client.get(f"/api/demands/{demand_id}", headers=_auth(token))
    assert detail.status_code == 200
    body = detail.get_json()
    assert "overdue" in body["risk_flags"]
    assert "business_feedback_pending" in body["risk_flags"]

    downgraded = client.post(
        f"/api/demands/{demand_id}/downgrade",
        headers=_auth(token),
        json={"priority": "C", "downgrade_reason": "推送多轮仍未反馈，先降级处理"},
    )
    assert downgraded.status_code == 200
    assert downgraded.get_json()["priority"] == "C"
    assert downgraded.get_json()["downgrade_reason"] == "推送多轮仍未反馈，先降级处理"


def test_demands_flag_hr_side_when_accepted_but_no_candidates(client, make_user, app):
    hr_id, token = make_user("demand-hr-stall@example.com", role="recruiter", name="停滞HR")

    with app.app_context():
        job = Job(title="AI 产品经理", city="杭州", department="产品部", jd_text="负责 AI 产品")
        db.session.add(job)
        db.session.commit()
        job_id = job.id

    created = client.post(
        "/api/demands",
        headers=_auth(token),
        json={
            "job_id": job_id,
            "requester_department": "产品部",
            "requested_at": (datetime.utcnow() - timedelta(days=10)).date().isoformat(),
            "accepted_at": (datetime.utcnow() - timedelta(days=8)).date().isoformat(),
            "priority": "A",
            "headcount": 1,
            "status": "active",
        },
    )

    assert created.status_code == 201
    body = created.get_json()
    assert body["metrics"]["recommended_count"] == 0
    assert "hr_no_recommendation" in body["risk_flags"]


def test_recruiter_demands_are_scoped_to_owned_jobs(client, make_user, app):
    owner_id, owner_token = make_user("demand-owner@example.com", role="recruiter", name="负责人")
    other_id, other_token = make_user("demand-other@example.com", role="recruiter", name="其他HR")

    with app.app_context():
        from app.models import RecruitmentDemand

        owner_job = Job(title="自有岗位", jd_text="x", owner_hr_id=owner_id)
        other_job = Job(title="他人岗位", jd_text="x", owner_hr_id=other_id)
        db.session.add_all([owner_job, other_job])
        db.session.flush()
        owner_demand = RecruitmentDemand(job_id=owner_job.id, owner_hr_id=owner_id, request_no="OWN")
        other_demand = RecruitmentDemand(job_id=other_job.id, owner_hr_id=other_id, request_no="OTHER")
        db.session.add_all([owner_demand, other_demand])
        db.session.commit()
        owner_demand_id = owner_demand.id
        other_demand_id = other_demand.id
        other_job_id = other_job.id

    listed = client.get("/api/demands", headers=_auth(owner_token))
    assert listed.status_code == 200
    assert [item["request_no"] for item in listed.get_json()] == ["OWN"]

    forbidden_detail = client.get(f"/api/demands/{other_demand_id}", headers=_auth(owner_token))
    assert forbidden_detail.status_code == 403

    forbidden_create = client.post(
        "/api/demands",
        headers=_auth(owner_token),
        json={"job_id": other_job_id, "request_no": "BAD"},
    )
    assert forbidden_create.status_code == 403

    other_detail = client.get(f"/api/demands/{other_demand_id}", headers=_auth(other_token))
    assert other_detail.status_code == 200
