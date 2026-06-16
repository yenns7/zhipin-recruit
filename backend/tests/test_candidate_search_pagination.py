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


def test_candidates_support_intent_city_filter_from_resume(client, make_user, app):
    admin_id, admin_token = make_user("candidate-city-admin@example.com", role="admin")

    with app.app_context():
        from app import db
        from app.models import Candidate

        db.session.add_all([
            Candidate(
                owner_hr_id=admin_id,
                name_masked="候选人深圳",
                resume_json={"extracted_info": {"intent_city": "深圳"}},
            ),
            Candidate(
                owner_hr_id=admin_id,
                name_masked="候选人杭州",
                resume_json={"extracted_info": {"summary": "求职意向：后端工程师；意向城市：杭州"}},
            ),
            Candidate(
                owner_hr_id=admin_id,
                name_masked="候选人上海校友",
                resume_json={"extracted_info": {"education": [{"school": "上海交通大学"}]}},
            ),
        ])
        db.session.commit()

    shenzhen = client.get(
        "/api/candidates?city=深圳&page=1&per_page=20",
        headers=_auth(admin_token),
    )
    assert shenzhen.status_code == 200
    shenzhen_body = shenzhen.get_json()
    assert shenzhen_body["total"] == 1
    assert shenzhen_body["candidates"][0]["name_masked"] == "候选人深圳"
    assert shenzhen_body["candidates"][0]["intent_city"] == "深圳"

    hangzhou = client.get(
        "/api/candidates?city=杭州&page=1&per_page=20",
        headers=_auth(admin_token),
    )
    assert hangzhou.status_code == 200
    hangzhou_body = hangzhou.get_json()
    assert hangzhou_body["total"] == 1
    assert hangzhou_body["candidates"][0]["name_masked"] == "候选人杭州"
    assert hangzhou_body["candidates"][0]["intent_city"] == "杭州"

    education_only = client.get(
        "/api/candidates?city=上海&page=1&per_page=20",
        headers=_auth(admin_token),
    )
    assert education_only.status_code == 200
    assert education_only.get_json()["total"] == 0


def test_candidates_support_source_parse_and_pipeline_filters(client, make_user, app):
    admin_id, admin_token = make_user("candidate-library-filter-admin@example.com", role="admin")

    with app.app_context():
        from app import db
        from app.models import Candidate, Job, PipelineStage, UploadBatch

        job = Job(title="算法工程师", jd_text="负责推荐算法", owner_hr_id=admin_id)
        boss_batch = UploadBatch(owner_hr_id=admin_id, source_channel="BOSS直聘")
        liepin_batch = UploadBatch(owner_hr_id=admin_id, source_channel="猎聘")
        db.session.add_all([job, boss_batch, liepin_batch])
        db.session.flush()

        library_only = Candidate(
            owner_hr_id=admin_id,
            upload_batch_id=boss_batch.id,
            name_masked="候选人未分配",
            resume_json={"extracted_info": {"intent_city": "深圳"}},
            parse_status="ok",
        )
        failed = Candidate(
            owner_hr_id=admin_id,
            upload_batch_id=liepin_batch.id,
            name_masked="候选人解析失败",
            resume_json={"extracted_info": {"intent_city": "深圳"}},
            parse_status="failed",
            parse_error="文件损坏",
        )
        in_pipeline = Candidate(
            owner_hr_id=admin_id,
            upload_batch_id=boss_batch.id,
            name_masked="候选人已入流程",
            resume_json={"extracted_info": {"intent_city": "深圳"}},
            parse_status="ok",
        )
        db.session.add_all([library_only, failed, in_pipeline])
        db.session.flush()
        db.session.add(PipelineStage(
            candidate_id=in_pipeline.id,
            job_id=job.id,
            stage="pending",
            updated_by=admin_id,
        ))
        db.session.commit()

    response = client.get(
        "/api/candidates?source_channel=BOSS直聘&parse_status=ok&pipeline_status=not_in_pipeline&page=1&per_page=20",
        headers=_auth(admin_token),
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["total"] == 1
    assert body["candidates"][0]["name_masked"] == "候选人未分配"
    assert body["candidates"][0]["source"]["channel"] == "BOSS直聘"
    assert body["candidates"][0]["parse_status"] == "ok"

    failed_response = client.get(
        "/api/candidates?parse_status=failed&page=1&per_page=20",
        headers=_auth(admin_token),
    )
    assert failed_response.status_code == 200
    assert failed_response.get_json()["candidates"][0]["name_masked"] == "候选人解析失败"

    pipeline_response = client.get(
        "/api/candidates?pipeline_status=in_pipeline&page=1&per_page=20",
        headers=_auth(admin_token),
    )
    assert pipeline_response.status_code == 200
    assert pipeline_response.get_json()["candidates"][0]["name_masked"] == "候选人已入流程"


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
