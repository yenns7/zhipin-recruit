from app import db
from app.models import Candidate, CandidateTag, Event, Job


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_candidate(app, owner_id, name="候选人A"):
    with app.app_context():
        candidate = Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            name_masked=name,
            email_masked="candidate@example.com",
            phone_masked="13800138000",
            resume_json={
                "extracted_info": {
                    "name": name,
                    "email": "candidate@example.com",
                    "phone": "13800138000",
                    "summary": "有后端经验",
                },
                "skills": [{"skill_name": "Python", "score": 5}],
            },
        )
        job = Job(
            org_id=1,
            owner_hr_id=owner_id,
            title="后端工程师",
            jd_text="Python 后端",
            jd_structured={"skill_tags_raw": "Python,5,BE"},
        )
        db.session.add_all([candidate, job])
        db.session.flush()
        db.session.add(CandidateTag(candidate_id=candidate.id, tag="Python", score=5))
        db.session.commit()
        return candidate.id, job.id


def _latest_event(action):
    return Event.query.filter_by(action=action).order_by(Event.id.desc()).first()


def test_opening_resume_detail_records_audit_context(app, client, make_user):
    owner_id, token = make_user("audit-viewer@example.com", role="recruiter")
    candidate_id, _ = _seed_candidate(app, owner_id)

    response = client.get(
        f"/api/resume/{candidate_id}",
        headers={
            **_auth(token),
            "X-Request-ID": "req-view-1",
            "X-Forwarded-For": "203.0.113.8",
            "User-Agent": "AuditTest/1.0",
        },
    )

    assert response.status_code == 200
    with app.app_context():
        event = _latest_event("candidate.viewed")
        assert event is not None
        assert event.actor_id == owner_id
        assert event.actor_role == "recruiter"
        assert event.entity_type == "candidate"
        assert event.entity_id == candidate_id
        assert event.request_id == "req-view-1"
        assert event.ip == "203.0.113.8"
        assert event.user_agent == "AuditTest/1.0"
        assert event.result == "success"
        assert event.source == "ui"
        assert event.severity == "info"


def test_candidate_export_downloads_csv_and_records_audit(app, client, make_user):
    owner_id, token = make_user("audit-exporter@example.com", role="recruiter")
    candidate_id, _ = _seed_candidate(app, owner_id)

    response = client.get(f"/api/candidates/{candidate_id}/export", headers=_auth(token))

    assert response.status_code == 200
    assert response.mimetype == "text/csv"
    assert f"candidate-{candidate_id}.csv" in response.headers["Content-Disposition"]
    assert "候选人A" in response.get_data(as_text=True)
    with app.app_context():
        event = _latest_event("candidate.exported")
        assert event is not None
        assert event.actor_id == owner_id
        assert event.entity_id == candidate_id
        assert event.result == "success"


def test_forbidden_candidate_access_records_warning_event(app, client, make_user):
    owner_id, owner_token = make_user("audit-owner@example.com", role="recruiter")
    _, other_token = make_user("audit-other@example.com", role="recruiter")
    candidate_id, _ = _seed_candidate(app, owner_id)

    response = client.get(f"/api/resume/{candidate_id}", headers=_auth(other_token))

    assert response.status_code == 403
    with app.app_context():
        event = _latest_event("security.forbidden")
        assert event is not None
        assert event.actor_role == "recruiter"
        assert event.entity_type == "candidate"
        assert event.entity_id == candidate_id
        assert event.result == "denied"
        assert event.severity == "warning"
        assert event.payload["path"] == f"/api/resume/{candidate_id}"


def test_agent_write_records_ai_source_and_result(app, client, make_user):
    owner_id, token = make_user("audit-agent@example.com", role="recruiter")
    _, job_id = _seed_candidate(app, owner_id)

    response = client.post(
        "/api/agent/execute",
        headers=_auth(token),
        json={"tool": "run_match", "args": {"job_id": job_id}},
    )

    assert response.status_code == 200
    with app.app_context():
        event = _latest_event("agent.write")
        assert event is not None
        assert event.actor_id == owner_id
        assert event.source == "ai"
        assert event.result == "success"
        assert event.payload["tool"] == "run_match"
        assert event.payload["target_ids"]["job_id"] == job_id
