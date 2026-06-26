import io


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_job_candidate(app, owner_id, *, org_id=1, job_owner_id=None, job_status="active", raw_file_path="/tmp/resume.pdf"):
    with app.app_context():
        from app import db
        from app.models import Candidate, Job

        job = Job(
            title=f"岗位-{owner_id}-{org_id}",
            jd_text="负责招聘系统生产级权限",
            owner_hr_id=owner_id if job_owner_id is None else job_owner_id,
            status=job_status,
            org_id=org_id,
        )
        candidate = Candidate(
            owner_hr_id=owner_id,
            org_id=org_id,
            name_masked=f"候选人-{owner_id}",
            email_masked="candidate@example.com",
            phone_masked="13800000000",
            raw_file_path=raw_file_path,
            resume_json={"extracted_info": {"name": "候选人"}},
        )
        db.session.add_all([job, candidate])
        db.session.commit()
        return job.id, candidate.id


def test_recruiter_only_sees_own_jobs_in_own_org(client, make_user, app):
    owner_id, owner_token = make_user("org-owner@x.com", role="recruiter", org_id=1)
    other_id, _ = make_user("org-other@x.com", role="recruiter", org_id=1)
    external_id, _ = make_user("org-external@x.com", role="recruiter", org_id=2)

    own_job_id, _ = _seed_job_candidate(app, owner_id, org_id=1)
    other_job_id, _ = _seed_job_candidate(app, other_id, org_id=1)
    external_job_id, _ = _seed_job_candidate(app, external_id, org_id=2)

    listed = client.get("/api/jobs?status=all", headers=_auth(owner_token))
    ids = {item["id"] for item in listed.get_json()}

    assert listed.status_code == 200
    assert own_job_id in ids
    assert other_job_id not in ids
    assert external_job_id not in ids
    assert client.get(f"/api/jobs/{own_job_id}", headers=_auth(owner_token)).status_code == 200
    assert client.get(f"/api/jobs/{other_job_id}", headers=_auth(owner_token)).status_code == 403
    assert client.get(f"/api/jobs/{external_job_id}", headers=_auth(owner_token)).status_code == 404


def test_recruiter_cannot_move_own_candidate_into_unowned_job(client, make_user, app):
    owner_id, owner_token = make_user("move-owner@x.com", role="recruiter", org_id=1)
    other_id, _ = make_user("move-other@x.com", role="recruiter", org_id=1)
    _, candidate_id = _seed_job_candidate(app, owner_id, org_id=1)
    other_job_id, _ = _seed_job_candidate(app, other_id, org_id=1)

    response = client.post(
        "/api/pipeline/move",
        headers=_auth(owner_token),
        json={"candidate_id": candidate_id, "job_id": other_job_id, "stage": "interview"},
    )

    assert response.status_code == 403
    with app.app_context():
        from app.models import PipelineStage

        assert PipelineStage.query.filter_by(candidate_id=candidate_id, job_id=other_job_id).count() == 0


def test_closed_job_rejects_pipeline_offer_assignment_and_upload(client, make_user, app):
    owner_id, owner_token = make_user("closed-owner@x.com", role="recruiter")
    interviewer_id, _ = make_user("closed-interviewer@x.com", role="interviewer")
    closed_job_id, candidate_id = _seed_job_candidate(app, owner_id, job_status="closed")

    move = client.post(
        "/api/pipeline/move",
        headers=_auth(owner_token),
        json={"candidate_id": candidate_id, "job_id": closed_job_id, "stage": "offer"},
    )
    offer = client.put(
        f"/api/pipeline/{closed_job_id}/offer/{candidate_id}",
        headers=_auth(owner_token),
        json={"salary_range": "30-40k", "approval_status": "approved"},
    )
    assignment = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={
            "candidate_id": candidate_id,
            "job_id": closed_job_id,
            "round": "round_1",
            "interviewer_id": interviewer_id,
        },
    )
    upload = client.post(
        "/api/resume/upload",
        headers=_auth(owner_token),
        data={
            "files": (io.BytesIO(b"%PDF-1.4\n"), "resume.pdf"),
            "target_job_id": str(closed_job_id),
        },
        content_type="multipart/form-data",
    )

    assert move.status_code == 400
    assert offer.status_code == 400
    assert assignment.status_code == 400
    assert upload.status_code == 400


def test_interviewer_cannot_start_or_submit_ai_interview_when_assigned(
    client, make_user, app, monkeypatch
):
    owner_id, _ = make_user("ai-owner@x.com", role="recruiter")
    interviewer_id, interviewer_token = make_user("ai-interviewer@x.com", role="interviewer")
    job_id, candidate_id = _seed_job_candidate(app, owner_id)

    with app.app_context():
        from app import db
        from app.models import InterviewAssignment

        db.session.add(InterviewAssignment(
            candidate_id=candidate_id,
            job_id=job_id,
            round="round_1",
            interviewer_id=interviewer_id,
        ))
        db.session.commit()

    def fail_if_called(*_args, **_kwargs):
        raise AssertionError("面试官账号不应触发 AI 面试写流程")

    monkeypatch.setattr("app.services.interview_service.PreScreenService.generate_questions", fail_if_called)
    monkeypatch.setattr("app.services.interview_service.PreScreenService.build_report", fail_if_called)

    start = client.post(
        "/api/interview/start",
        headers=_auth(interviewer_token),
        json={"candidate_id": candidate_id, "job_id": job_id},
    )
    submit = client.post(
        "/api/interview/submit",
        headers=_auth(interviewer_token),
        json={
            "candidate_id": candidate_id,
            "job_id": job_id,
            "qa_pairs": [{"q": "问题", "a": "回答"}],
        },
    )

    assert start.status_code == 403
    assert submit.status_code == 403


def test_feedback_rejects_score_outside_one_to_five(client, make_user, app):
    owner_id, _ = make_user("score-owner@x.com", role="recruiter")
    interviewer_id, interviewer_token = make_user("score-interviewer@x.com", role="interviewer")
    job_id, candidate_id = _seed_job_candidate(app, owner_id)

    with app.app_context():
        from app import db
        from app.models import InterviewAssignment

        db.session.add(InterviewAssignment(
            candidate_id=candidate_id,
            job_id=job_id,
            round="round_1",
            interviewer_id=interviewer_id,
        ))
        db.session.commit()

    response = client.post(
        "/api/interview/feedback",
        headers=_auth(interviewer_token),
        json={
            "candidate_id": candidate_id,
            "job_id": job_id,
            "round": "round_1",
            "score": 999,
            "passed": True,
        },
    )

    assert response.status_code == 400
    with app.app_context():
        from app.models import InterviewFeedback

        assert InterviewFeedback.query.count() == 0


def test_agent_write_uses_same_permission_and_records_audit_event(client, make_user, app):
    owner_id, owner_token = make_user("agent-owner@x.com", role="recruiter")
    other_id, _ = make_user("agent-other@x.com", role="recruiter")
    other_job_id, _ = _seed_job_candidate(app, other_id)

    response = client.post(
        "/api/agent/execute",
        headers=_auth(owner_token),
        json={"tool": "run_match", "args": {"job_id": other_job_id}},
    )

    assert response.status_code == 400
    assert response.get_json()["ok"] is False
    with app.app_context():
        from app.models import Event

        event = Event.query.filter_by(action="agent.write").order_by(Event.id.desc()).first()
        assert event is not None
        assert event.actor_id == owner_id
        assert event.payload["tool"] == "run_match"
        assert event.payload["ok"] is False
        assert event.payload["target_ids"]["job_id"] == other_job_id


def test_delete_candidate_soft_deletes_anonymizes_and_removes_raw_file(client, make_user, app, tmp_path):
    owner_id, owner_token = make_user("delete-owner@x.com", role="recruiter")
    raw_file = tmp_path / "resume.pdf"
    raw_file.write_bytes(b"%PDF-1.4\nprivate resume")
    _, candidate_id = _seed_job_candidate(app, owner_id, raw_file_path=str(raw_file))

    response = client.delete(
        f"/api/candidates/{candidate_id}",
        headers=_auth(owner_token),
        json={"reason": "候选人要求删除个人信息"},
    )

    assert response.status_code == 200
    with app.app_context():
        from app import db
        from app.models import Candidate

        candidate = db.session.get(Candidate, candidate_id)
        assert candidate.deleted_at is not None
        assert candidate.deleted_by == owner_id
        assert candidate.name_masked == "已删除候选人"
        assert candidate.email_masked == ""
        assert candidate.phone_masked == ""
        assert candidate.resume_json == {}
        assert candidate.raw_file_path is None
        assert not raw_file.exists()

    listed = client.get("/api/candidates", headers=_auth(owner_token))
    assert candidate_id not in {item["id"] for item in listed.get_json()}
