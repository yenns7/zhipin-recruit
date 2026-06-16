def _auth(t): return {"Authorization": f"Bearer {t}"}

def _seed_job_candidate(app):
    with app.app_context():
        from app import db
        from app.models import Job, Candidate
        j = Job(title="后端", jd_text="x"); c = Candidate(name_masked="候选人A", resume_json={})
        db.session.add_all([j, c]); db.session.commit()
        return j.id, c.id

def test_move_through_rounds_with_note(client, make_user, app):
    _, token = make_user("hr@x.com", role="recruiter")
    jid, cid = _seed_job_candidate(app)
    for stage in ["pending", "ai_screen", "business_review", "interview_first", "interview_second"]:
        r = client.post("/api/pipeline/move", headers=_auth(token),
                        json={"candidate_id": cid, "job_id": jid, "stage": stage,
                              "note": f"进入{stage}"})
        assert r.status_code == 200
    counts = client.get(f"/api/pipeline/{jid}", headers=_auth(token)).get_json()
    assert counts == {"interview_second": 1}
    hist = client.get(f"/api/pipeline/{jid}/history/{cid}", headers=_auth(token)).get_json()
    stages = [t["stage"] for t in hist["timeline"]]
    assert stages == ["pending", "ai_screen", "business_review", "interview_first", "interview_second"]
    assert hist["timeline"][-1]["note"] == "进入interview_second"


def test_business_review_appears_in_board_order(client, make_user, app):
    _, token = make_user("hr-board@x.com", role="recruiter")
    jid, cid = _seed_job_candidate(app)

    r = client.post("/api/pipeline/move", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid, "stage": "business_review"})
    assert r.status_code == 200

    board = client.get(f"/api/pipeline/{jid}/board", headers=_auth(token)).get_json()
    assert board["stage_order"].index("business_review") > board["stage_order"].index("ai_screen")
    assert board["stage_order"].index("business_review") < board["stage_order"].index("interview_first")
    assert board["candidates"][0]["stage"] == "business_review"

def test_invalid_stage_rejected(client, make_user, app):
    _, token = make_user("hr@x.com", role="recruiter")
    jid, cid = _seed_job_candidate(app)
    r = client.post("/api/pipeline/move", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid, "stage": "interview"})
    assert r.status_code == 400  # 旧单值 interview 不再合法
