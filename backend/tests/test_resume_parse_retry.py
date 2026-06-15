from pathlib import Path


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_failed_resume_upload_keeps_retryable_candidate(client, make_user, app, monkeypatch, tmp_path):
    uid, token = make_user("retry-upload@x.com", role="recruiter")

    def fail_parse(self, fpath, owner_hr_id, upload_batch_id=None):
        raise ValueError("PDF 内容无法解析")

    from app.services.resume_service import ResumeBatchService

    monkeypatch.setattr(ResumeBatchService, "parse_and_save", fail_parse)
    resume = tmp_path / "broken.pdf"
    resume.write_bytes(b"%PDF-1.4 broken")

    with resume.open("rb") as f:
        response = client.post(
            "/api/resume/upload",
            headers=_auth(token),
            data={"files": (f, "broken.pdf")},
            content_type="multipart/form-data",
        )

    assert response.status_code == 202
    body = response.get_json()
    assert body["results"][0]["status"] == "error"
    assert body["results"][0]["candidate_id"]

    candidate_id = body["results"][0]["candidate_id"]
    detail = client.get(f"/api/resume/{candidate_id}", headers=_auth(token)).get_json()
    assert detail["parse_status"] == "failed"
    assert "PDF 内容无法解析" in detail["parse_error"]

    library = client.get("/api/candidates", headers=_auth(token)).get_json()
    item = next(c for c in library if c["id"] == candidate_id)
    assert item["parse_status"] == "failed"
    assert item["parse_error"]


def test_retry_parse_updates_failed_candidate(client, make_user, app, monkeypatch, tmp_path):
    uid, token = make_user("retry-owner@x.com", role="recruiter")
    other_uid, other_token = make_user("retry-other@x.com", role="recruiter")
    resume = tmp_path / "retry.pdf"
    resume.write_bytes(b"%PDF-1.4 retry")

    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateTag

        candidate = Candidate(
            owner_hr_id=uid,
            name_masked="broken.pdf",
            resume_json={},
            raw_file_path=str(resume),
            parse_status="failed",
            parse_error="旧错误",
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add(CandidateTag(candidate_id=candidate.id, tag="旧标签", score=1))
        db.session.commit()
        candidate_id = candidate.id

    class FakeParser:
        def parse_resume(self, file_path):
            assert Path(file_path) == resume
            return {
                "extracted_info": {
                    "name": "候选人C",
                    "email": "c@example.com",
                    "phone": "13800000000",
                },
                "skills": [
                    {"skill_name": "Python", "score": 5},
                    {"skill_name": "招聘系统", "score": 4},
                ],
            }

    monkeypatch.setattr("app.services.resume_service.ResumeParser", lambda: FakeParser())

    forbidden = client.post(
        f"/api/resume/{candidate_id}/retry-parse",
        headers=_auth(other_token),
    )
    assert forbidden.status_code == 403

    response = client.post(
        f"/api/resume/{candidate_id}/retry-parse",
        headers=_auth(token),
    )
    assert response.status_code == 200
    body = response.get_json()
    assert body["candidate_id"] == candidate_id
    assert body["parse_status"] == "ok"
    assert body["name_masked"] == "候选人C"
    assert [tag["tag"] for tag in body["tags"]] == ["Python", "招聘系统"]

    detail = client.get(f"/api/resume/{candidate_id}", headers=_auth(token)).get_json()
    assert detail["parse_status"] == "ok"
    assert detail["parse_error"] is None
    assert detail["resume_json"]["extracted_info"]["email"] == "c@example.com"
