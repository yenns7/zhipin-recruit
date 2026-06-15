from datetime import datetime, timedelta


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_candidates_support_search_stage_sort_and_pagination(client, make_user, app):
    admin_id, admin_token = make_user("candidate-search-admin@example.com", role="admin")
    recruiter_id, _ = make_user("candidate-search-hr@example.com", role="recruiter")

    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateTag, Job, PipelineStage

        job = Job(title="AI 产品经理", jd_text="负责 AI 产品", owner_hr_id=admin_id)
        db.session.add(job)
        db.session.flush()

        first = Candidate(
            owner_hr_id=recruiter_id,
            name_masked="候选人Alpha",
            email_masked="alpha@example.com",
            phone_masked="13800000001",
            resume_json={"extracted_info": {}},
            created_at=datetime.utcnow(),
        )
        second = Candidate(
            owner_hr_id=recruiter_id,
            name_masked="候选人Beta",
            email_masked="beta@example.com",
            phone_masked="13800000002",
            resume_json={"extracted_info": {}},
            created_at=datetime.utcnow() - timedelta(minutes=5),
        )
        db.session.add_all([first, second])
        db.session.flush()
        db.session.add_all([
            CandidateTag(candidate_id=first.id, tag="Python", score=5),
            CandidateTag(candidate_id=second.id, tag="Java", score=4),
            PipelineStage(
                candidate_id=first.id,
                job_id=job.id,
                stage="interview_first",
                updated_by=admin_id,
            ),
            PipelineStage(
                candidate_id=second.id,
                job_id=job.id,
                stage="pending",
                updated_by=admin_id,
            ),
        ])
        db.session.commit()

    response = client.get(
        "/api/candidates?search=Python&stage=interview_first&page=1&per_page=1&sort_by=name_masked&sort_order=asc",
        headers=_auth(admin_token),
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["total"] == 1
    assert body["page"] == 1
    assert body["per_page"] == 1
    assert body["pages"] == 1
    assert body["candidates"][0]["name_masked"] == "候选人Alpha"
    assert body["candidates"][0]["top_tags"][0] == {"tag": "Python", "score": 5}


def test_candidates_keep_legacy_array_shape_without_query_params(client, make_user, app):
    user_id, token = make_user("candidate-legacy@example.com", role="recruiter")

    with app.app_context():
        from app import db
        from app.models import Candidate

        db.session.add(Candidate(
            owner_hr_id=user_id,
            name_masked="候选人Legacy",
            resume_json={"extracted_info": {}},
        ))
        db.session.commit()

    response = client.get("/api/candidates", headers=_auth(token))

    assert response.status_code == 200
    body = response.get_json()
    assert isinstance(body, list)
    assert body[0]["name_masked"] == "候选人Legacy"
