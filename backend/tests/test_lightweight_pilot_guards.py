import io


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_job_candidate(app, owner_id):
    with app.app_context():
        from app import db
        from app.models import Candidate, Job

        job = Job(
            org_id=1,
            owner_hr_id=owner_id,
            title="轻量试点岗位",
            jd_text="负责招聘试点",
        )
        candidate = Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            name_masked="试点候选人",
            resume_json={"extracted_info": {"name": "试点候选人"}},
        )
        db.session.add_all([job, candidate])
        db.session.commit()
        return job.id, candidate.id


def test_repeated_pipeline_move_reuses_current_stage(client, make_user, app):
    owner_id, token = make_user("pilot-move@example.com", role="recruiter")
    job_id, candidate_id = _seed_job_candidate(app, owner_id)
    payload = {"candidate_id": candidate_id, "job_id": job_id, "stage": "interview", "note": "进入面试"}

    first = client.post("/api/pipeline/move", headers=_auth(token), json=payload)
    second = client.post("/api/pipeline/move", headers=_auth(token), json=payload)

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.get_json()["deduplicated"] is True
    with app.app_context():
        from app.models import PipelineStage

        rows = PipelineStage.query.filter_by(candidate_id=candidate_id, job_id=job_id).all()
        assert len(rows) == 1


def test_repeated_interview_assignment_returns_existing_assignment(client, make_user, app):
    owner_id, token = make_user("pilot-assign@example.com", role="recruiter")
    interviewer_id, _ = make_user("pilot-interviewer@example.com", role="interviewer")
    job_id, candidate_id = _seed_job_candidate(app, owner_id)
    payload = {
        "candidate_id": candidate_id,
        "job_id": job_id,
        "round": "round_1",
        "interviewer_id": interviewer_id,
        "scheduled_at": "2026-06-24T10:00:00",
    }

    first = client.post("/api/interview/assignments", headers=_auth(token), json=payload)
    second = client.post("/api/interview/assignments", headers=_auth(token), json=payload)

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.get_json()["deduplicated"] is True
    with app.app_context():
        from app.models import InterviewAssignment

        assert InterviewAssignment.query.filter_by(candidate_id=candidate_id, job_id=job_id).count() == 1


def test_interview_assignment_rejects_same_interviewer_time_conflict(client, make_user, app):
    owner_id, token = make_user("pilot-assign-conflict@example.com", role="recruiter")
    interviewer_id, _ = make_user("pilot-interviewer-conflict@example.com", role="interviewer")
    first_job_id, first_candidate_id = _seed_job_candidate(app, owner_id)
    second_job_id, second_candidate_id = _seed_job_candidate(app, owner_id)

    first = client.post("/api/interview/assignments", headers=_auth(token), json={
        "candidate_id": first_candidate_id,
        "job_id": first_job_id,
        "round": "round_1",
        "interviewer_id": interviewer_id,
        "scheduled_at": "2026-06-24T10:00:00",
    })
    second = client.post("/api/interview/assignments", headers=_auth(token), json={
        "candidate_id": second_candidate_id,
        "job_id": second_job_id,
        "round": "round_1",
        "interviewer_id": interviewer_id,
        "scheduled_at": "2026-06-24T10:00:00",
    })

    assert first.status_code == 201
    assert second.status_code == 409
    assert "已有面试安排" in second.get_json()["error"]
    with app.app_context():
        from app.models import InterviewAssignment

        assert InterviewAssignment.query.filter_by(interviewer_id=interviewer_id).count() == 1


def test_repeated_interview_feedback_returns_existing_feedback(client, make_user, app):
    owner_id, _ = make_user("pilot-feedback-owner@example.com", role="recruiter")
    interviewer_id, interviewer_token = make_user("pilot-feedback-iv@example.com", role="interviewer")
    job_id, candidate_id = _seed_job_candidate(app, owner_id)
    with app.app_context():
        from app import db
        from app.models import InterviewAssignment

        db.session.add(InterviewAssignment(
            org_id=1,
            candidate_id=candidate_id,
            job_id=job_id,
            round="round_1",
            interviewer_id=interviewer_id,
        ))
        db.session.commit()

    payload = {
        "candidate_id": candidate_id,
        "job_id": job_id,
        "round": "round_1",
        "score": 4,
        "passed": True,
        "strengths": "沟通清楚",
    }
    first = client.post("/api/interview/feedback", headers=_auth(interviewer_token), json=payload)
    second = client.post("/api/interview/feedback", headers=_auth(interviewer_token), json=payload)

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.get_json()["deduplicated"] is True
    with app.app_context():
        from app.models import InterviewFeedback

        assert InterviewFeedback.query.filter_by(candidate_id=candidate_id, job_id=job_id).count() == 1


def test_repeated_resume_upload_reuses_first_result(client, make_user, app, monkeypatch):
    owner_id, token = make_user("pilot-upload@example.com", role="recruiter")
    calls = []

    def fake_parse_and_save(self, fpath, owner_hr_id, upload_batch_id=None):
        from app import db
        from app.models import Candidate

        calls.append(fpath)
        candidate = Candidate(
            org_id=1,
            owner_hr_id=owner_hr_id,
            upload_batch_id=upload_batch_id,
            name_masked="重复上传候选人",
            resume_json={"extracted_info": {"name": "重复上传候选人"}},
            raw_file_path=fpath,
        )
        db.session.add(candidate)
        db.session.commit()
        return candidate

    monkeypatch.setattr("app.services.resume_service.ResumeBatchService.parse_and_save", fake_parse_and_save)

    def upload_once():
        return client.post(
            "/api/resume/upload",
            headers=_auth(token),
            data={"files": (io.BytesIO(b"%PDF-1.4 same resume"), "same.pdf")},
            content_type="multipart/form-data",
        )

    first = upload_once()
    second = upload_once()

    assert first.status_code == 202
    assert second.status_code == 200
    assert second.get_json()["deduplicated"] is True
    assert second.get_json()["results"] == first.get_json()["results"]
    assert len(calls) == 1
    with app.app_context():
        from app.models import Candidate, UploadBatch

        assert Candidate.query.filter_by(owner_hr_id=owner_id).count() == 1
        assert UploadBatch.query.filter_by(owner_hr_id=owner_id).count() == 1


def test_candidate_export_burst_marks_warning_for_admin_audit(client, make_user, app):
    owner_id, token = make_user("pilot-export@example.com", role="recruiter")
    candidate_id = _seed_job_candidate(app, owner_id)[1]

    for _ in range(6):
        response = client.get(f"/api/candidates/{candidate_id}/export", headers=_auth(token))
        assert response.status_code == 200

    with app.app_context():
        from app.models import Event

        latest = Event.query.filter_by(action="candidate.exported").order_by(Event.id.desc()).first()
        assert latest is not None
        assert latest.severity == "warning"
        assert latest.payload["export_count_10m"] >= 6
