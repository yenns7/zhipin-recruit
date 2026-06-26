def _auth(t): return {"Authorization": f"Bearer {t}"}

def _seed(app):
    with app.app_context():
        from app import db
        from app.models import Job, Candidate
        j = Job(title="后端", jd_text="x"); c = Candidate(name_masked="候选人A", resume_json={})
        db.session.add_all([j, c]); db.session.commit()
        return j.id, c.id

def _assign(app, cid, jid, interviewer_id, round_name="interview_first"):
    with app.app_context():
        from app import db
        from app.models import InterviewAssignment
        db.session.add(InterviewAssignment(
            candidate_id=cid,
            job_id=jid,
            round=round_name,
            interviewer_id=interviewer_id,
        ))
        db.session.commit()

def test_interviewer_submits_feedback(client, make_user, app):
    interviewer_id, token = make_user("iv@x.com", role="interviewer")
    jid, cid = _seed(app)
    _assign(app, cid, jid, interviewer_id)
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
    interviewer_id, iv_token = make_user("iv@x.com", role="interviewer")
    _, mgr_token = make_user("m@x.com", role="manager")
    jid, cid = _seed(app)
    _assign(app, cid, jid, interviewer_id)
    client.post("/api/interview/feedback", headers=_auth(iv_token), json={
        "candidate_id": cid, "job_id": jid, "round": "interview_first",
        "score": 5, "passed": True})
    r = client.get("/api/interviews", headers=_auth(mgr_token))
    assert r.status_code == 200
    assert any(it["type"] == "feedback" for it in r.get_json())

def test_interviews_list_exposes_feedback_detail_fields(client, make_user, app):
    interviewer_id, iv_token = make_user("iv-detail@x.com", role="interviewer", name="赵面试官")
    _, mgr_token = make_user("mgr-detail@x.com", role="manager")
    jid, cid = _seed(app)
    _assign(app, cid, jid, interviewer_id, "interview_second")
    client.post("/api/interview/feedback", headers=_auth(iv_token), json={
        "candidate_id": cid, "job_id": jid, "round": "interview_second",
        "score": 4, "passed": False, "strengths": "沟通清晰",
        "concerns": "系统设计深度不足", "note": "建议暂缓"})

    r = client.get("/api/interviews", headers=_auth(mgr_token))

    assert r.status_code == 200
    feedback = next(it for it in r.get_json() if it["type"] == "feedback")
    assert feedback["interviewer_name"] == "赵面试官"
    assert feedback["strengths"] == "沟通清晰"
    assert feedback["concerns"] == "系统设计深度不足"
    assert feedback["note"] == "建议暂缓"

def test_feedback_persists_structured_reason_tags(client, make_user, app):
    interviewer_id, iv_token = make_user("iv-reason@x.com", role="interviewer", name="业务面试官")
    _, mgr_token = make_user("mgr-reason@x.com", role="manager")
    jid, cid = _seed(app)
    _assign(app, cid, jid, interviewer_id, "round_1")

    r = client.post("/api/interview/feedback", headers=_auth(iv_token), json={
        "candidate_id": cid,
        "job_id": jid,
        "round": "round_1",
        "score": 2,
        "passed": False,
        "reason_tags": ["专业能力不匹配", "岗位画像变化", "候选人已接受其他机会", "未知原因"],
        "concerns": "业务侧重新调整画像",
    })
    assert r.status_code == 201

    feedback = client.get(
        f"/api/interview/feedback?candidate_id={cid}&job_id={jid}",
        headers=_auth(mgr_token),
    ).get_json()[0]
    assert feedback["reason_tags"] == ["专业能力不匹配", "岗位画像变化", "候选人已接受其他机会"]

    listed = client.get("/api/interviews", headers=_auth(mgr_token)).get_json()
    row = next(item for item in listed if item["type"] == "feedback")
    assert row["reason_tags"] == ["专业能力不匹配", "岗位画像变化", "候选人已接受其他机会"]

def test_feedback_requires_core_fields(client, make_user, app):
    _, token = make_user("iv@x.com", role="interviewer")
    jid, cid = _seed(app)
    r = client.post("/api/interview/feedback", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid})  # missing round
    assert r.status_code == 400


def test_create_assignment_rejects_inactive_interviewer(client, make_user, app):
    _, hr_token = make_user("assign-hr@x.com", role="recruiter")
    inactive_id, _ = make_user(
        "inactive-interviewer@x.com",
        role="interviewer",
        is_active=False,
    )
    jid, cid = _seed(app)

    response = client.post("/api/interview/assignments", headers=_auth(hr_token), json={
        "candidate_id": cid,
        "job_id": jid,
        "round": "round_1",
        "interviewer_id": inactive_id,
    })

    assert response.status_code == 400
    assert "启用" in response.get_json()["error"]


def test_create_assignment_rejects_closed_job(client, make_user, app):
    _, manager_token = make_user("assign-manager@x.com", role="manager")
    active_interviewer_id, _ = make_user("active-interviewer@x.com", role="interviewer")
    jid, cid = _seed(app)
    with app.app_context():
        from app import db
        from app.models import Job

        job = db.session.get(Job, jid)
        job.status = "closed"
        db.session.commit()

    response = client.post("/api/interview/assignments", headers=_auth(manager_token), json={
        "candidate_id": cid,
        "job_id": jid,
        "round": "round_1",
        "interviewer_id": active_interviewer_id,
    })

    assert response.status_code == 400
    assert "已关闭" in response.get_json()["error"]


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


def test_ai_pass_writes_interview_when_new(client, make_user, app, monkeypatch):
    _, token = make_user("hr@x.com", role="recruiter")
    jid, cid = _seed(app)
    _stub_report(monkeypatch, passed=True)
    r = client.post("/api/interview/submit", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid,
                          "qa_pairs": [{"q": "q", "a": "a"}]})
    assert r.status_code == 200
    # 未入流程 → 先补 ai_screen 再进 interview；最新阶段应为 interview
    assert _latest_stage(app, cid, jid) == "interview"


def test_ai_pass_does_not_move_backward(client, make_user, app, monkeypatch):
    """R2.1：候选人已在面试中，AI 预筛通过不得重复写入面试阶段。"""
    _, token = make_user("hr@x.com", role="recruiter")
    jid, cid = _seed(app)
    # 先推进到面试中
    for stage in ["pending", "ai_screen", "interview"]:
        client.post("/api/pipeline/move", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid, "stage": stage})
    _stub_report(monkeypatch, passed=True)
    r = client.post("/api/interview/submit", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid,
                          "qa_pairs": [{"q": "q", "a": "a"}]})
    assert r.status_code == 200
    # 不重复写：最新阶段仍是面试中
    assert _latest_stage(app, cid, jid) == "interview"


def test_ai_fail_rejects(client, make_user, app, monkeypatch):
    _, token = make_user("hr@x.com", role="recruiter")
    jid, cid = _seed(app)
    _stub_report(monkeypatch, passed=False)
    r = client.post("/api/interview/submit", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid,
                          "qa_pairs": [{"q": "q", "a": "a"}]})
    assert r.status_code == 200
    assert _latest_stage(app, cid, jid) == "rejected"
