def _auth(t): return {"Authorization": f"Bearer {t}"}

def _seed_job_candidate(app):
    with app.app_context():
        from app import db
        from app.models import Job, Candidate
        j = Job(title="后端", jd_text="x"); c = Candidate(name_masked="候选人A", resume_json={})
        db.session.add_all([j, c]); db.session.commit()
        return j.id, c.id

def test_move_through_main_pipeline_with_note(client, make_user, app):
    _, token = make_user("hr@x.com", role="recruiter")
    jid, cid = _seed_job_candidate(app)
    for stage in ["pending", "ai_screen", "business_review", "interview"]:
        r = client.post("/api/pipeline/move", headers=_auth(token),
                        json={"candidate_id": cid, "job_id": jid, "stage": stage,
                              "note": f"进入{stage}"})
        assert r.status_code == 200
    counts = client.get(f"/api/pipeline/{jid}", headers=_auth(token)).get_json()
    assert counts == {"interview": 1}
    hist = client.get(f"/api/pipeline/{jid}/history/{cid}", headers=_auth(token)).get_json()
    stages = [t["stage"] for t in hist["timeline"]]
    assert stages == ["pending", "ai_screen", "business_review", "interview"]
    assert hist["timeline"][-1]["note"] == "进入interview"


def test_business_review_appears_in_board_order(client, make_user, app):
    _, token = make_user("hr-board@x.com", role="recruiter")
    jid, cid = _seed_job_candidate(app)

    r = client.post("/api/pipeline/move", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid, "stage": "business_review"})
    assert r.status_code == 200

    board = client.get(f"/api/pipeline/{jid}/board", headers=_auth(token)).get_json()
    assert board["stage_order"].index("business_review") > board["stage_order"].index("ai_screen")
    assert board["stage_order"].index("business_review") < board["stage_order"].index("interview")
    assert board["candidates"][0]["stage"] == "business_review"

def test_invalid_stage_rejected(client, make_user, app):
    _, token = make_user("hr@x.com", role="recruiter")
    jid, cid = _seed_job_candidate(app)
    r = client.post("/api/pipeline/move", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid, "stage": "screened"})
    assert r.status_code == 400


def test_transfer_candidate_to_another_demand_keeps_history(client, make_user, app):
    hr_id, token = make_user("hr-transfer@x.com", role="recruiter")
    with app.app_context():
        from app import db
        from app.models import Candidate, Job, PipelineStage

        source = Job(title="销售经理", jd_text="负责华东销售", owner_hr_id=hr_id)
        target = Job(title="渠道经理", jd_text="负责渠道拓展", owner_hr_id=hr_id)
        candidate = Candidate(name_masked="候选人转需", resume_json={}, owner_hr_id=hr_id)
        db.session.add_all([source, target, candidate])
        db.session.flush()
        db.session.add(PipelineStage(
            candidate_id=candidate.id,
            job_id=source.id,
            stage="business_review",
            updated_by=hr_id,
            note="业务初筛",
        ))
        db.session.commit()
        source_id = source.id
        target_id = target.id
        candidate_id = candidate.id

    r = client.post("/api/pipeline/transfer", headers=_auth(token), json={
        "candidate_id": candidate_id,
        "from_job_id": source_id,
        "to_job_id": target_id,
        "reason": "更适合渠道岗位",
    })

    assert r.status_code == 200
    body = r.get_json()
    assert body["from_stage"] == "business_review"
    assert body["to_stage"] == "pending"

    source_board = client.get(f"/api/pipeline/{source_id}/board", headers=_auth(token)).get_json()
    target_board = client.get(f"/api/pipeline/{target_id}/board", headers=_auth(token)).get_json()
    assert source_board["candidates"][0]["stage"] == "rejected"
    assert "转入其他招聘需求" in source_board["candidates"][0]["note"]
    assert target_board["candidates"][0]["stage"] == "pending"
    assert "更适合渠道岗位" in target_board["candidates"][0]["note"]
