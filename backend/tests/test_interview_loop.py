def _auth(t): return {"Authorization": f"Bearer {t}"}

def _seed(app):
    with app.app_context():
        from app import db
        from app.models import Job, Candidate
        j = Job(title="后端", jd_text="x"); c = Candidate(name_masked="候选人A", resume_json={})
        db.session.add_all([j, c]); db.session.commit()
        return j.id, c.id

def test_interviewer_submits_feedback(client, make_user, app):
    _, token = make_user("iv@x.com", role="interviewer")
    jid, cid = _seed(app)
    r = client.post("/api/interview/feedback", headers=_auth(token), json={
        "candidate_id": cid, "job_id": jid, "round": "interview_first",
        "score": 4, "passed": True, "strengths": "扎实", "concerns": "", "note": ""})
    assert r.status_code == 201
    r2 = client.get(f"/api/interview/feedback?candidate_id={cid}&job_id={jid}",
                    headers=_auth(token))
    assert r2.status_code == 200
    items = r2.get_json()
    assert len(items) == 1 and items[0]["score"] == 4

def test_interviews_list_filtered_by_role(client, make_user, app):
    _, iv_token = make_user("iv@x.com", role="interviewer")
    _, mgr_token = make_user("m@x.com", role="manager")
    jid, cid = _seed(app)
    client.post("/api/interview/feedback", headers=_auth(iv_token), json={
        "candidate_id": cid, "job_id": jid, "round": "interview_first",
        "score": 5, "passed": True})
    r = client.get("/api/interviews", headers=_auth(mgr_token))
    assert r.status_code == 200
    assert any(it["type"] == "feedback" for it in r.get_json())

def test_feedback_requires_core_fields(client, make_user, app):
    _, token = make_user("iv@x.com", role="interviewer")
    jid, cid = _seed(app)
    r = client.post("/api/interview/feedback", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid})  # missing round
    assert r.status_code == 400
