def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_jobs_store_and_return_location_fields(client, make_user, monkeypatch):
    _, token = make_user("hr-location@x.com", role="recruiter")

    from app.api import jobs as jobs_api
    monkeypatch.setattr(
        jobs_api,
        "_extract_jd_structured",
        lambda _llm, _jd_text: {"skill_tags_raw": "Python , 4 , BE"},
    )

    created = client.post(
        "/api/jobs",
        headers=_auth(token),
        json={
            "title": "后端工程师",
            "jd_text": "负责后端服务开发",
            "city": "上海",
            "department": "技术部",
            "job_code": "SH-BE-001",
        },
    )

    assert created.status_code == 201
    body = created.get_json()
    assert body["city"] == "上海"
    assert body["department"] == "技术部"
    assert body["job_code"] == "SH-BE-001"

    listed = client.get("/api/jobs", headers=_auth(token))
    assert listed.status_code == 200
    item = next(job for job in listed.get_json() if job["id"] == body["id"])
    assert item["city"] == "上海"
    assert item["department"] == "技术部"
    assert item["job_code"] == "SH-BE-001"

    detail = client.get(f"/api/jobs/{body['id']}", headers=_auth(token))
    assert detail.status_code == 200
    detail_body = detail.get_json()
    assert detail_body["city"] == "上海"
    assert detail_body["department"] == "技术部"
    assert detail_body["job_code"] == "SH-BE-001"


def test_jobs_update_location_fields_without_restructuring_jd(client, make_user, monkeypatch):
    _, token = make_user("hr-location-edit@x.com", role="recruiter")

    from app.api import jobs as jobs_api
    calls = []

    def fake_extract(_llm, jd_text):
        calls.append(jd_text)
        return {"skill_tags_raw": "Python , 4 , BE"}

    monkeypatch.setattr(jobs_api, "_extract_jd_structured", fake_extract)

    created = client.post(
        "/api/jobs",
        headers=_auth(token),
        json={
            "title": "后端工程师",
            "jd_text": "负责后端服务开发",
            "city": "",
            "department": "",
            "job_code": "",
        },
    )
    assert created.status_code == 201
    job_id = created.get_json()["id"]
    assert len(calls) == 1

    updated = client.put(
        f"/api/jobs/{job_id}",
        headers=_auth(token),
        json={
            "city": "深圳",
            "department": "技术研发部",
            "job_code": "SZ-BE-001",
        },
    )

    assert updated.status_code == 200
    body = updated.get_json()
    assert body["city"] == "深圳"
    assert body["department"] == "技术研发部"
    assert body["job_code"] == "SZ-BE-001"
    assert len(calls) == 1


def test_closed_jobs_can_be_listed_and_restored(client, make_user, monkeypatch):
    _, token = make_user("hr-job-restore@x.com", role="recruiter")

    from app.api import jobs as jobs_api
    monkeypatch.setattr(
        jobs_api,
        "_extract_jd_structured",
        lambda _llm, _jd_text: {"skill_tags_raw": "React , 4 , FE"},
    )

    created = client.post(
        "/api/jobs",
        headers=_auth(token),
        json={
            "title": "前端工程师",
            "jd_text": "负责前端页面开发",
            "city": "深圳",
            "department": "技术研发部",
            "job_code": "SZ-FE-001",
        },
    )
    assert created.status_code == 201
    job_id = created.get_json()["id"]

    closed = client.post(f"/api/jobs/{job_id}/close", headers=_auth(token))
    assert closed.status_code == 200
    assert closed.get_json()["status"] == "closed"

    active_list = client.get("/api/jobs", headers=_auth(token))
    assert active_list.status_code == 200
    assert all(item["id"] != job_id for item in active_list.get_json())

    closed_list = client.get("/api/jobs?status=closed", headers=_auth(token))
    assert closed_list.status_code == 200
    closed_item = next(item for item in closed_list.get_json() if item["id"] == job_id)
    assert closed_item["status"] == "closed"

    restored = client.post(f"/api/jobs/{job_id}/restore", headers=_auth(token))
    assert restored.status_code == 200
    assert restored.get_json()["status"] == "active"

    active_after_restore = client.get("/api/jobs", headers=_auth(token))
    assert active_after_restore.status_code == 200
    restored_item = next(item for item in active_after_restore.get_json() if item["id"] == job_id)
    assert restored_item["status"] == "active"
