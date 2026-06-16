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
