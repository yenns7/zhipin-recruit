def _auth(t): return {"Authorization": f"Bearer {t}"}

def _seed(app, owner_id):
    with app.app_context():
        from app import db
        from app.models import Job, Candidate
        j = Job(title="后端", jd_text="x")
        c = Candidate(name_masked="候选人A", resume_json={}, owner_hr_id=owner_id)
        db.session.add_all([j, c]); db.session.commit()
        return j.id, c.id

def test_candidate_pipelines_lists_current_stage_per_job(client, make_user, app):
    uid, token = make_user("hr@x.com", role="recruiter")
    jid, cid = _seed(app, uid)
    for stage in ["pending", "ai_screen", "interview"]:
        client.post("/api/pipeline/move", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid, "stage": stage})
    r = client.get(f"/api/candidates/{cid}/pipelines", headers=_auth(token))
    assert r.status_code == 200
    body = r.get_json()
    assert len(body["pipelines"]) == 1
    assert body["pipelines"][0]["stage"] == "interview"
    assert body["pipelines"][0]["job_id"] == jid

def test_journey_aggregates_timeline_and_feedback(client, make_user, app):
    uid, token = make_user("hr@x.com", role="recruiter")
    jid, cid = _seed(app, uid)
    client.post("/api/pipeline/move", headers=_auth(token),
                json={"candidate_id": cid, "job_id": jid, "stage": "interview", "note": "n1"})
    client.post("/api/interview/feedback", headers=_auth(token),
                json={"candidate_id": cid, "job_id": jid, "round": "round_1",
                      "score": 4, "passed": True, "strengths": "好"})
    r = client.get(f"/api/candidates/{cid}/journey?job_id={jid}", headers=_auth(token))
    assert r.status_code == 200
    body = r.get_json()
    assert len(body["timeline"]) == 1
    assert body["timeline"][0]["note"] == "n1"
    assert len(body["feedback"]) == 1 and body["feedback"][0]["score"] == 4

def test_journey_requires_job_id(client, make_user, app):
    uid, token = make_user("hr@x.com", role="recruiter")
    jid, cid = _seed(app, uid)
    r = client.get(f"/api/candidates/{cid}/journey", headers=_auth(token))
    assert r.status_code == 400

def test_recruiter_cannot_view_others_journey(client, make_user, app):
    owner_id, _ = make_user("owner@x.com", role="recruiter")
    _, other_token = make_user("other@x.com", role="recruiter")
    jid, cid = _seed(app, owner_id)
    r = client.get(f"/api/candidates/{cid}/journey?job_id={jid}", headers=_auth(other_token))
    assert r.status_code == 403

def test_reassign_owner_manager_only(client, make_user, app):
    owner_id, owner_token = make_user("owner@x.com", role="recruiter")
    new_id, _ = make_user("new@x.com", role="recruiter")
    _, mgr_token = make_user("m@x.com", role="manager")
    jid, cid = _seed(app, owner_id)
    # recruiter forbidden
    r = client.patch(f"/api/candidates/{cid}/owner", headers=_auth(owner_token),
                     json={"owner_hr_id": new_id})
    assert r.status_code == 403
    # manager ok
    r = client.patch(f"/api/candidates/{cid}/owner", headers=_auth(mgr_token),
                     json={"owner_hr_id": new_id, "reason": "调整试点负责人"})
    assert r.status_code == 200
    assert r.get_json()["owner_hr_id"] == new_id
