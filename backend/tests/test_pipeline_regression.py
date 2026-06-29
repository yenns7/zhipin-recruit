# -*- coding: utf-8 -*-
"""Pipeline 阶段回退校验 + 关闭岗位后推进校验 回归测试。

对应 docs/COMPREHENSIVE_TEST_REPORT.md 问题1、问题2 的修复行为。
"""


def _auth(t):
    return {"Authorization": f"Bearer {t}"}


def _seed(app, owner_id=None):
    with app.app_context():
        from app import db
        from app.models import Candidate, Job
        job = Job(title="回归测试岗", jd_text="x", owner_hr_id=owner_id)
        candidate = Candidate(owner_hr_id=owner_id, name_masked="回归候选人", resume_json={})
        db.session.add_all([job, candidate])
        db.session.commit()
        return job.id, candidate.id


def test_forward_move_pending_to_ai_screen_returns_200(client, make_user, app):
    """前向推进 pending→ai_screen 返回 200（回归保护）。"""
    uid, token = make_user("reg-forward@x.com", role="recruiter")
    jid, cid = _seed(app, owner_id=uid)
    client.post("/api/pipeline/move", headers=_auth(token),
                json={"candidate_id": cid, "job_id": jid, "stage": "pending"})
    r = client.post("/api/pipeline/move", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid, "stage": "ai_screen"})
    assert r.status_code == 200


def test_backward_move_interview_to_pending_returns_400(client, make_user, app):
    """回退 interview→pending 返回 400，错误信息含'回退'。"""
    uid, token = make_user("reg-backward@x.com", role="recruiter")
    jid, cid = _seed(app, owner_id=uid)
    client.post("/api/pipeline/move", headers=_auth(token),
                json={"candidate_id": cid, "job_id": jid, "stage": "interview"})
    r = client.post("/api/pipeline/move", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid, "stage": "pending"})
    assert r.status_code == 400
    assert "回退" in r.get_json()["error"]


def test_rejected_from_any_stage_returns_200(client, make_user, app):
    """rejected 从任意阶段（此处从 interview）返回 200（例外放行）。"""
    uid, token = make_user("reg-reject@x.com", role="recruiter")
    jid, cid = _seed(app, owner_id=uid)
    client.post("/api/pipeline/move", headers=_auth(token),
                json={"candidate_id": cid, "job_id": jid, "stage": "interview"})
    r = client.post("/api/pipeline/move", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid, "stage": "rejected",
                          "note": "不匹配"})
    assert r.status_code == 200


def test_first_entry_directly_to_interview_returns_200(client, make_user, app):
    """首次进入（无前置）直接到 interview 返回 200。"""
    uid, token = make_user("reg-first@x.com", role="recruiter")
    jid, cid = _seed(app, owner_id=uid)
    r = client.post("/api/pipeline/move", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid, "stage": "interview"})
    assert r.status_code == 200


def test_move_on_closed_job_returns_400(client, make_user, app):
    """关闭岗位后 move 返回 400，错误信息含'关闭'。"""
    uid, token = make_user("reg-closed@x.com", role="recruiter")
    jid, cid = _seed(app, owner_id=uid)
    client.post("/api/pipeline/move", headers=_auth(token),
                json={"candidate_id": cid, "job_id": jid, "stage": "pending"})
    with app.app_context():
        from app import db
        from app.models import Job
        job = db.session.get(Job, jid)
        job.status = "closed"
        db.session.commit()
    r = client.post("/api/pipeline/move", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid, "stage": "ai_screen"})
    assert r.status_code == 400
    assert "关闭" in r.get_json()["error"]
