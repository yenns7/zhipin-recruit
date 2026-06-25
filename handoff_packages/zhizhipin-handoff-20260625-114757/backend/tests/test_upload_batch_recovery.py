def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_upload_batch_rollback_soft_deletes_candidates_and_audits(client, make_user, app, tmp_path):
    owner_id, token = make_user("rollback-owner@example.com", role="recruiter")
    first_file = tmp_path / "first.pdf"
    second_file = tmp_path / "second.pdf"
    first_file.write_bytes(b"%PDF-1.4 first")
    second_file.write_bytes(b"%PDF-1.4 second")

    with app.app_context():
        from app import db
        from app.models import Candidate, UploadBatch

        batch = UploadBatch(org_id=1, owner_hr_id=owner_id, source_channel="BOSS直聘")
        db.session.add(batch)
        db.session.flush()
        candidates = [
            Candidate(
                org_id=1,
                owner_hr_id=owner_id,
                upload_batch_id=batch.id,
                name_masked="误导入A",
                email_masked="a@example.com",
                phone_masked="13800000000",
                resume_json={"extracted_info": {"name": "误导入A"}},
                raw_file_path=str(first_file),
            ),
            Candidate(
                org_id=1,
                owner_hr_id=owner_id,
                upload_batch_id=batch.id,
                name_masked="误导入B",
                email_masked="b@example.com",
                phone_masked="13900000000",
                resume_json={"extracted_info": {"name": "误导入B"}},
                raw_file_path=str(second_file),
            ),
        ]
        db.session.add_all(candidates)
        db.session.commit()
        batch_id = batch.id
        candidate_ids = [item.id for item in candidates]

    response = client.post(
        f"/api/resume/batches/{batch_id}/rollback",
        headers=_auth(token),
        json={"reason": "误导入供应商重复简历"},
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["batch_id"] == batch_id
    assert body["rolled_back_candidates"] == 2
    assert not first_file.exists()
    assert not second_file.exists()

    with app.app_context():
        from app.models import Candidate, Event

        rows = Candidate.query.filter(Candidate.id.in_(candidate_ids)).all()
        assert len(rows) == 2
        assert all(row.deleted_at is not None for row in rows)
        assert all(row.deleted_by == owner_id for row in rows)
        assert all(row.name_masked == "已撤回导入候选人" for row in rows)
        assert all(row.email_masked == "" and row.phone_masked == "" for row in rows)
        assert all(row.resume_json == {} and row.raw_file_path is None for row in rows)

        event = Event.query.filter_by(action="resume.upload_batch.rolled_back", entity_id=batch_id).first()
        assert event is not None
        assert event.payload["reason"] == "误导入供应商重复简历"
        assert event.payload["rolled_back_candidates"] == 2
