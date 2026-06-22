from datetime import UTC, datetime, timedelta


def _auth(t):
    return {"Authorization": f"Bearer {t}"}


def _seed_job_candidate(app, owner_id=None):
    with app.app_context():
        from app import db
        from app.models import Candidate, Job

        job = Job(title="产品经理", jd_text="负责 AI 招聘产品", owner_hr_id=owner_id)
        candidate = Candidate(
            owner_hr_id=owner_id,
            name_masked="候选人A",
            resume_json={},
        )
        db.session.add_all([job, candidate])
        db.session.commit()
        return job.id, candidate.id


def test_upload_batch_source_metadata_is_attached_to_candidate(client, make_user, app, monkeypatch, tmp_path):
    uid, token = make_user("source@x.com", role="recruiter")
    jid, _ = _seed_job_candidate(app, owner_id=uid)

    def fake_parse_and_save(self, fpath, owner_hr_id, upload_batch_id=None):
        from app import db
        from app.models import Candidate

        candidate = Candidate(
            owner_hr_id=owner_hr_id,
            upload_batch_id=upload_batch_id,
            name_masked="候选人B",
            resume_json={"extracted_info": {}},
            raw_file_path=fpath,
        )
        db.session.add(candidate)
        db.session.commit()
        return candidate

    from app.services.resume_service import ResumeBatchService

    monkeypatch.setattr(ResumeBatchService, "parse_and_save", fake_parse_and_save)
    resume = tmp_path / "resume.pdf"
    resume.write_bytes(b"%PDF-1.4")

    with resume.open("rb") as f:
        response = client.post(
            "/api/resume/upload",
            headers=_auth(token),
            data={
                "files": (f, "resume.pdf"),
                "source_channel": "BOSS直聘",
                "source_link": "https://example.com/candidate",
                "referrer": "张三",
                "target_job_id": str(jid),
                "source_note": "主动搜索",
            },
            content_type="multipart/form-data",
        )

    assert response.status_code == 202
    body = response.get_json()
    assert body["batch_id"] is not None
    candidate_id = body["results"][0]["candidate_id"]

    library = client.get("/api/candidates", headers=_auth(token)).get_json()
    item = next(c for c in library if c["id"] == candidate_id)
    assert item["source"]["channel"] == "BOSS直聘"
    assert item["source"]["target_job_id"] == jid
    assert item["source"]["target_job_title"] == "产品经理"
    assert item["source"]["batch_id"] == body["batch_id"]


def test_upload_source_channel_alias_is_normalized_for_bi(client, make_user, app, monkeypatch, tmp_path):
    uid, token = make_user("source-normalize@x.com", role="recruiter")
    jid, _ = _seed_job_candidate(app, owner_id=uid)

    def fake_parse_and_save(self, fpath, owner_hr_id, upload_batch_id=None):
        from app import db
        from app.models import Candidate

        candidate = Candidate(
            owner_hr_id=owner_hr_id,
            upload_batch_id=upload_batch_id,
            name_masked="来源归一候选人",
            resume_json={"extracted_info": {}},
            raw_file_path=fpath,
        )
        db.session.add(candidate)
        db.session.commit()
        return candidate

    from app.services.resume_service import ResumeBatchService

    monkeypatch.setattr(ResumeBatchService, "parse_and_save", fake_parse_and_save)
    resume = tmp_path / "resume.pdf"
    resume.write_bytes(b"%PDF-1.4")

    with resume.open("rb") as f:
        response = client.post(
            "/api/resume/upload",
            headers=_auth(token),
            data={
                "files": (f, "resume.pdf"),
                "source_channel": "BOSS",
                "target_job_id": str(jid),
            },
            content_type="multipart/form-data",
        )

    assert response.status_code == 202
    candidate_id = response.get_json()["results"][0]["candidate_id"]
    library = client.get("/api/candidates", headers=_auth(token)).get_json()
    item = next(c for c in library if c["id"] == candidate_id)
    assert item["source"]["channel"] == "BOSS直聘"


def test_successful_upload_with_target_job_enters_pending_pipeline(client, make_user, app, monkeypatch, tmp_path):
    uid, token = make_user("upload-pipeline@x.com", role="recruiter")
    jid, _ = _seed_job_candidate(app, owner_id=uid)

    def fake_parse_and_save(self, fpath, owner_hr_id, upload_batch_id=None):
        from app import db
        from app.models import Candidate

        candidate = Candidate(
            owner_hr_id=owner_hr_id,
            upload_batch_id=upload_batch_id,
            name_masked="候选人自动入流程",
            resume_json={"extracted_info": {}},
            raw_file_path=fpath,
        )
        db.session.add(candidate)
        db.session.commit()
        return candidate

    from app.services.resume_service import ResumeBatchService

    monkeypatch.setattr(ResumeBatchService, "parse_and_save", fake_parse_and_save)
    resume = tmp_path / "auto-pipeline.pdf"
    resume.write_bytes(b"%PDF-1.4")

    with resume.open("rb") as f:
        response = client.post(
            "/api/resume/upload",
            headers=_auth(token),
            data={
                "files": (f, "auto-pipeline.pdf"),
                "target_job_id": str(jid),
            },
            content_type="multipart/form-data",
        )

    assert response.status_code == 202
    candidate_id = response.get_json()["results"][0]["candidate_id"]

    board = client.get(f"/api/pipeline/{jid}/board", headers=_auth(token)).get_json()
    row = next(item for item in board["candidates"] if item["candidate_id"] == candidate_id)
    assert row["stage"] == "pending"

    pipelines = client.get(f"/api/candidates/{candidate_id}/pipelines", headers=_auth(token)).get_json()
    assert pipelines["pipelines"][0]["job_id"] == jid
    assert pipelines["pipelines"][0]["stage"] == "pending"


def test_upload_without_target_job_stays_in_library_without_pipeline(client, make_user, app, monkeypatch, tmp_path):
    uid, token = make_user("upload-library-only@x.com", role="recruiter")

    def fake_parse_and_save(self, fpath, owner_hr_id, upload_batch_id=None):
        from app import db
        from app.models import Candidate

        candidate = Candidate(
            owner_hr_id=owner_hr_id,
            upload_batch_id=upload_batch_id,
            name_masked="候选人简历库",
            resume_json={"extracted_info": {"intent_city": "深圳"}},
            raw_file_path=fpath,
        )
        db.session.add(candidate)
        db.session.commit()
        return candidate

    from app.services.resume_service import ResumeBatchService

    monkeypatch.setattr(ResumeBatchService, "parse_and_save", fake_parse_and_save)
    resume = tmp_path / "library-only.pdf"
    resume.write_bytes(b"%PDF-1.4")

    with resume.open("rb") as f:
        response = client.post(
            "/api/resume/upload",
            headers=_auth(token),
            data={
                "files": (f, "library-only.pdf"),
                "source_channel": "内推",
                "source_note": "先入库，后续再筛岗位",
            },
            content_type="multipart/form-data",
        )

    assert response.status_code == 202
    result = response.get_json()["results"][0]
    assert result["status"] == "ok"
    assert "target_job_id" not in result
    assert "pipeline_stage" not in result

    candidate_id = result["candidate_id"]
    library = client.get("/api/candidates", headers=_auth(token)).get_json()
    item = next(c for c in library if c["id"] == candidate_id)
    assert item["source"]["channel"] == "内推"
    assert item["source"]["target_job_id"] is None
    assert item["source"]["target_job_title"] is None

    pipelines = client.get(f"/api/candidates/{candidate_id}/pipelines", headers=_auth(token)).get_json()
    assert pipelines["pipelines"] == []


def test_rejected_pipeline_move_persists_disposition_for_candidate_journey(client, make_user, app):
    uid, token = make_user("reject@x.com", role="recruiter")
    jid, cid = _seed_job_candidate(app, owner_id=uid)

    response = client.post(
        "/api/pipeline/move",
        headers=_auth(token),
        json={
            "candidate_id": cid,
            "job_id": jid,
            "stage": "rejected",
            "note": "终面后不推进",
            "disposition": {
                "reason": "经验年限不足",
                "enter_talent_pool": True,
                "next_contact_at": "2026-09-01",
                "tags": ["AI产品", "后续关注"],
                "note": "可关注更初级岗位",
            },
        },
    )

    assert response.status_code == 200
    journey = client.get(
        f"/api/candidates/{cid}/journey?job_id={jid}",
        headers=_auth(token),
    ).get_json()
    assert journey["dispositions"][0]["reason"] == "经验年限不足"
    assert journey["dispositions"][0]["enter_talent_pool"] is True
    assert journey["dispositions"][0]["tags"] == ["AI产品", "后续关注"]


def test_offer_record_can_be_saved_without_changing_pipeline_shape(client, make_user, app):
    uid, token = make_user("offer@x.com", role="recruiter")
    jid, cid = _seed_job_candidate(app, owner_id=uid)
    client.post(
        "/api/pipeline/move",
        headers=_auth(token),
        json={"candidate_id": cid, "job_id": jid, "stage": "offer"},
    )

    response = client.put(
        f"/api/pipeline/{jid}/offer/{cid}",
        headers=_auth(token),
        json={
            "salary_range": "25-30K * 14",
            "onboard_date": "2026-07-15",
            "approval_status": "pending",
            "note": "等待部门负责人确认",
        },
    )

    assert response.status_code == 200
    offer = client.get(
        f"/api/pipeline/{jid}/offer/{cid}",
        headers=_auth(token),
    ).get_json()
    assert offer["salary_range"] == "25-30K * 14"
    assert offer["approval_status"] == "pending"

    board = client.get(f"/api/pipeline/{jid}/board", headers=_auth(token)).get_json()
    assert board["stage_order"] == [
        "pending",
        "ai_screen",
        "business_review",
        "interview",
        "offer",
        "onboarded",
        "rejected",
    ]


def test_interview_assignment_can_be_created_and_listed(client, make_user, app):
    uid, token = make_user("assign-hr@x.com", role="recruiter")
    interviewer_id, _ = make_user("assign-iv@x.com", role="interviewer", name="李面试官")
    jid, cid = _seed_job_candidate(app, owner_id=uid)

    response = client.post(
        "/api/interview/assignments",
        headers=_auth(token),
        json={
            "candidate_id": cid,
            "job_id": jid,
            "round": "interview_first",
            "interviewer_id": interviewer_id,
            "scheduled_at": "2026-06-20T10:00:00",
            "location": "腾讯会议 123",
            "note": "重点看产品判断",
        },
    )

    assert response.status_code == 201
    created = response.get_json()
    assert created["interviewer_name"] == "李面试官"
    assert created["scheduled_at"].startswith("2026-06-20T10:00:00")

    listed = client.get("/api/interview/assignments", headers=_auth(token)).get_json()
    assert any(item["id"] == created["id"] for item in listed)

    interviewers = client.get("/api/interview/interviewers", headers=_auth(token)).get_json()
    assert {"id": interviewer_id, "name": "李面试官", "role": "interviewer"} in interviewers


def test_feedback_persists_structured_evaluation_and_journey_decision_summary(client, make_user, app):
    uid, token = make_user("eval@x.com", role="recruiter")
    jid, cid = _seed_job_candidate(app, owner_id=uid)

    response = client.post(
        "/api/interview/feedback",
        headers=_auth(token),
        json={
            "candidate_id": cid,
            "job_id": jid,
            "round": "interview_first",
            "score": 4,
            "passed": True,
            "strengths": "产品判断清晰",
            "concerns": "商业化经验略浅",
            "evaluation": {
                "专业能力": 4,
                "沟通表达": 5,
                "业务理解": 4,
                "文化匹配": 4,
            },
        },
    )

    assert response.status_code == 201
    feedback = client.get(
        f"/api/interview/feedback?candidate_id={cid}&job_id={jid}",
        headers=_auth(token),
    ).get_json()
    assert feedback[0]["evaluation"]["沟通表达"] == 5

    journey = client.get(
        f"/api/candidates/{cid}/journey?job_id={jid}",
        headers=_auth(token),
    ).get_json()
    assert journey["feedback"][0]["evaluation"]["专业能力"] == 4
    assert journey["decision_summary"]["feedback_count"] == 1
    assert journey["decision_summary"]["average_score"] == 4.0
    assert journey["decision_summary"]["recommendation"] == "建议推进"
    assert "产品判断清晰" in journey["decision_summary"]["highlights"]


def test_assignment_payload_flags_overdue_and_feedback_status(client, make_user, app):
    uid, token = make_user("overdue-hr@x.com", role="recruiter")
    interviewer_id, iv_token = make_user("overdue-iv@x.com", role="interviewer", name="周面试官")
    jid, cid = _seed_job_candidate(app, owner_id=uid)
    past = (datetime.now(UTC).replace(tzinfo=None) - timedelta(days=1)).isoformat(timespec="seconds")

    created = client.post(
        "/api/interview/assignments",
        headers=_auth(token),
        json={
            "candidate_id": cid,
            "job_id": jid,
            "round": "interview_first",
            "interviewer_id": interviewer_id,
            "scheduled_at": past,
        },
    ).get_json()

    listed = client.get("/api/interview/assignments", headers=_auth(iv_token)).get_json()
    item = next(row for row in listed if row["id"] == created["id"])
    assert item["feedback_submitted"] is False
    assert item["is_overdue"] is True

    client.post(
        "/api/interview/feedback",
        headers=_auth(iv_token),
        json={
            "candidate_id": cid,
            "job_id": jid,
            "round": "interview_first",
            "score": 5,
            "passed": True,
        },
    )
    listed_after = client.get("/api/interview/assignments", headers=_auth(iv_token)).get_json()
    item_after = next(row for row in listed_after if row["id"] == created["id"])
    assert item_after["feedback_submitted"] is True
    assert item_after["is_overdue"] is False


def test_interview_guide_returns_role_specific_prompts(client, make_user, app):
    uid, token = make_user("guide@x.com", role="recruiter")
    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateTag, Job

        job = Job(title="AI 产品经理", jd_text="负责 AI 产品规划，需要用户研究和数据分析", owner_hr_id=uid)
        candidate = Candidate(
            owner_hr_id=uid,
            name_masked="候选人C",
            resume_json={
                "extracted_info": {
                    "summary": "做过 AI 助手和增长项目",
                    "experience": [{"company": "某科技公司", "position": "产品经理"}],
                }
            },
        )
        db.session.add_all([job, candidate])
        db.session.flush()
        db.session.add(CandidateTag(candidate_id=candidate.id, tag="用户研究", score=5))
        db.session.commit()
        jid, cid = job.id, candidate.id

    response = client.get(
        f"/api/interview/guide?candidate_id={cid}&job_id={jid}&round=interview_first",
        headers=_auth(token),
    )

    assert response.status_code == 200
    guide = response.get_json()
    assert guide["round"] == "interview_first"
    assert guide["focus"]
    assert guide["questions"]
    assert any("用户研究" in item for item in guide["questions"])


def test_interviewer_scope_is_based_on_real_assignments(client, make_user, app):
    hr_id, hr_token = make_user("scope-hr@x.com", role="recruiter")
    interviewer_a_id, interviewer_a_token = make_user(
        "scope-a@x.com", role="interviewer", name="A面试官"
    )
    interviewer_b_id, interviewer_b_token = make_user(
        "scope-b@x.com", role="interviewer", name="B面试官"
    )
    with app.app_context():
        from app import db
        from app.models import Candidate, Job

        job = Job(title="增长产品经理", jd_text="负责增长策略", owner_hr_id=hr_id)
        candidate_a = Candidate(owner_hr_id=hr_id, name_masked="候选人A", resume_json={})
        candidate_b = Candidate(owner_hr_id=hr_id, name_masked="候选人B", resume_json={})
        db.session.add_all([job, candidate_a, candidate_b])
        db.session.commit()
        jid, cid_a, cid_b = job.id, candidate_a.id, candidate_b.id

    for cid in (cid_a, cid_b):
        client.post(
            "/api/pipeline/move",
            headers=_auth(hr_token),
            json={"candidate_id": cid, "job_id": jid, "stage": "interview_first"},
        )

    client.post(
        "/api/interview/assignments",
        headers=_auth(hr_token),
        json={
            "candidate_id": cid_a,
            "job_id": jid,
            "round": "interview_first",
            "interviewer_id": interviewer_a_id,
        },
    )
    client.post(
        "/api/interview/assignments",
        headers=_auth(hr_token),
        json={
            "candidate_id": cid_b,
            "job_id": jid,
            "round": "interview_first",
            "interviewer_id": interviewer_b_id,
        },
    )

    assignments_a = client.get("/api/interview/assignments", headers=_auth(interviewer_a_token)).get_json()
    assert {item["candidate_id"] for item in assignments_a} == {cid_a}

    candidates_a = client.get("/api/candidates", headers=_auth(interviewer_a_token)).get_json()
    assert {item["id"] for item in candidates_a} == {cid_a}

    board_a = client.get(f"/api/pipeline/{jid}/board", headers=_auth(interviewer_a_token)).get_json()
    assert {item["candidate_id"] for item in board_a["candidates"]} == {cid_a}

    blocked_feedback = client.post(
        "/api/interview/feedback",
        headers=_auth(interviewer_b_token),
        json={
            "candidate_id": cid_a,
            "job_id": jid,
            "round": "interview_first",
            "score": 4,
            "passed": True,
        },
    )
    assert blocked_feedback.status_code == 403

    own_feedback = client.post(
        "/api/interview/feedback",
        headers=_auth(interviewer_a_token),
        json={
            "candidate_id": cid_a,
            "job_id": jid,
            "round": "interview_first",
            "score": 4,
            "passed": True,
        },
    )
    assert own_feedback.status_code == 201
