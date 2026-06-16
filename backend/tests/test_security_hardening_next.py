import io


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_job_candidate(app, owner_id, *, parse_status="ok"):
    with app.app_context():
        from app import db
        from app.models import Candidate, Job

        job = Job(title="安全岗", jd_text="负责招聘系统安全", owner_hr_id=owner_id)
        candidate = Candidate(
            owner_hr_id=owner_id,
            name_masked="安全候选人",
            resume_json={},
            raw_file_path="/tmp/resume.pdf",
            parse_status=parse_status,
        )
        db.session.add_all([job, candidate])
        db.session.commit()
        return job.id, candidate.id


def test_upload_rejects_spoofed_pdf_before_parse(client, make_user, monkeypatch):
    _, token = make_user("upload-spoof@x.com", role="recruiter")

    def fail_if_called(self, *args, **kwargs):
        raise AssertionError("parser should not receive a file with mismatched content")

    monkeypatch.setattr(
        "app.services.resume_service.ResumeBatchService.parse_and_save",
        fail_if_called,
    )

    response = client.post(
        "/api/resume/upload",
        headers=_auth(token),
        data={"files": (io.BytesIO(b"not a real pdf"), "spoof.pdf")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 202
    result = response.get_json()["results"][0]
    assert result["status"] == "skipped"
    assert "文件内容" in result["reason"]
    assert "candidate_id" not in result


def test_upload_rejects_oversized_resume_before_parse(client, make_user, monkeypatch):
    _, token = make_user("upload-large@x.com", role="recruiter")

    def fail_if_called(self, *args, **kwargs):
        raise AssertionError("parser should not receive an oversized resume")

    monkeypatch.setattr(
        "app.services.resume_service.ResumeBatchService.parse_and_save",
        fail_if_called,
    )

    oversized_pdf = b"%PDF-1.4\n" + (b"x" * (20 * 1024 * 1024 + 1))
    response = client.post(
        "/api/resume/upload",
        headers=_auth(token),
        data={"files": (io.BytesIO(oversized_pdf), "large.pdf")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 202
    result = response.get_json()["results"][0]
    assert result["status"] == "skipped"
    assert "文件大小" in result["reason"]
    assert "candidate_id" not in result


def test_interviewer_cannot_upload_resume(client, make_user):
    _, token = make_user("interviewer-upload@x.com", role="interviewer")

    response = client.post(
        "/api/resume/upload",
        headers=_auth(token),
        data={"files": (io.BytesIO(b"%PDF-1.4\n"), "resume.pdf")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 403


def test_recruiter_cannot_upload_into_another_recruiters_job(client, make_user, app):
    _, token = make_user("upload-owner@x.com", role="recruiter")
    other_id, _ = make_user("upload-other@x.com", role="recruiter")
    other_job_id, _ = _seed_job_candidate(app, other_id)

    response = client.post(
        "/api/resume/upload",
        headers=_auth(token),
        data={
            "files": (io.BytesIO(b"%PDF-1.4\n"), "resume.pdf"),
            "target_job_id": str(other_job_id),
        },
        content_type="multipart/form-data",
    )

    assert response.status_code == 403


def test_interviewer_cannot_retry_parse_even_when_assigned(client, make_user, app, monkeypatch):
    owner_id, _ = make_user("retry-owner-hardening@x.com", role="recruiter")
    interviewer_id, interviewer_token = make_user("retry-interviewer@x.com", role="interviewer")
    job_id, candidate_id = _seed_job_candidate(app, owner_id, parse_status="failed")

    with app.app_context():
        from app import db
        from app.models import InterviewAssignment

        db.session.add(InterviewAssignment(
            candidate_id=candidate_id,
            job_id=job_id,
            round="interview_first",
            interviewer_id=interviewer_id,
        ))
        db.session.commit()

    def fail_if_called(self, candidate):
        raise AssertionError("interviewer should not trigger resume reparsing")

    monkeypatch.setattr(
        "app.services.resume_service.ResumeBatchService.reparse_candidate",
        fail_if_called,
    )

    response = client.post(
        f"/api/resume/{candidate_id}/retry-parse",
        headers=_auth(interviewer_token),
    )

    assert response.status_code == 403


def test_manager_cannot_reassign_candidate_to_non_recruiter(client, make_user, app):
    owner_id, _ = make_user("reassign-owner@x.com", role="recruiter")
    interviewer_id, _ = make_user("reassign-interviewer@x.com", role="interviewer")
    _, manager_token = make_user("reassign-manager@x.com", role="manager")
    _, candidate_id = _seed_job_candidate(app, owner_id)

    response = client.patch(
        f"/api/candidates/{candidate_id}/owner",
        headers=_auth(manager_token),
        json={"owner_hr_id": interviewer_id},
    )

    assert response.status_code == 400


def test_legacy_match_endpoint_requires_job_owner(client, make_user, app):
    _, token = make_user("legacy-match-owner@x.com", role="recruiter")
    other_id, _ = make_user("legacy-match-other@x.com", role="recruiter")
    other_job_id, _ = _seed_job_candidate(app, other_id)

    response = client.post(
        "/api/match",
        headers=_auth(token),
        json={"job_id": other_job_id},
    )

    assert response.status_code == 403
