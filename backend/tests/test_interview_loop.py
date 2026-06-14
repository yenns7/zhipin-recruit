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


def _stub_report(monkeypatch, passed):
    """绕过 LLM：把 build_report 固定为给定通过与否，便于测回写逻辑。"""
    from app.services.interview_service import PreScreenService
    monkeypatch.setattr(
        PreScreenService, "build_report",
        lambda self, pairs, jd: {"avg_score": 4.0 if passed else 2.0,
                                 "pass_recommended": passed, "details": []},
    )


def _latest_stage(app, cid, jid):
    with app.app_context():
        from app.models import PipelineStage
        ps = (PipelineStage.query.filter_by(candidate_id=cid, job_id=jid)
              .order_by(PipelineStage.id.desc()).first())
        return ps.stage if ps else None


def test_ai_pass_writes_interview_first_when_new(client, make_user, app, monkeypatch):
    _, token = make_user("hr@x.com", role="recruiter")
    jid, cid = _seed(app)
    _stub_report(monkeypatch, passed=True)
    r = client.post("/api/interview/submit", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid,
                          "qa_pairs": [{"q": "q", "a": "a"}]})
    assert r.status_code == 200
    # 未入流程 → 先补 ai_screen 再进 interview_first；最新阶段应为 interview_first
    assert _latest_stage(app, cid, jid) == "interview_first"


def test_ai_pass_does_not_move_backward(client, make_user, app, monkeypatch):
    """R2.1：候选人已在二面，AI 预筛通过不得把其回退到一面。"""
    _, token = make_user("hr@x.com", role="recruiter")
    jid, cid = _seed(app)
    # 先推进到二面
    for stage in ["pending", "ai_screen", "interview_first", "interview_second"]:
        client.post("/api/pipeline/move", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid, "stage": stage})
    _stub_report(monkeypatch, passed=True)
    r = client.post("/api/interview/submit", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid,
                          "qa_pairs": [{"q": "q", "a": "a"}]})
    assert r.status_code == 200
    # 不回退：最新阶段仍是二面
    assert _latest_stage(app, cid, jid) == "interview_second"


def test_ai_fail_rejects(client, make_user, app, monkeypatch):
    _, token = make_user("hr@x.com", role="recruiter")
    jid, cid = _seed(app)
    _stub_report(monkeypatch, passed=False)
    r = client.post("/api/interview/submit", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid,
                          "qa_pairs": [{"q": "q", "a": "a"}]})
    assert r.status_code == 200
    assert _latest_stage(app, cid, jid) == "rejected"
