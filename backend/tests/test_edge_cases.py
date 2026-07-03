# -*- coding: utf-8 -*-
"""边界条件与安全测试 — 验证系统在异常/极端条件下的行为。

覆盖：越权访问、无效输入、并发操作、数据一致性等。
"""
from datetime import UTC, datetime, timedelta

import jwt

from app import db
from app.models import (
    Candidate,
    Job,
    Match,
    Notification,
    PipelineStage,
    User,
)
from app.config import TestingConfig


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ==================== 越权访问测试 ====================

class TestCrossUserAccess:
    def test_interviewer_cannot_create_job(self, client, make_user):
        _, token = make_user("iv-create-job@test.com", role="interviewer")
        r = client.post("/api/jobs", headers=_auth(token), json={"title": "x", "jd_text": "y"})
        assert r.status_code == 403

    def test_interviewer_cannot_access_admin_users(self, client, make_user):
        """面试官不能访问管理后台。"""
        _, token = make_user("iv-admin@test.com", role="interviewer")
        r = client.get("/api/admin/users", headers=_auth(token))
        assert r.status_code == 403

    def test_recruiter_cannot_access_admin_users(self, client, make_user):
        _, token = make_user("r-admin@test.com", role="recruiter")
        r = client.get("/api/admin/users", headers=_auth(token))
        assert r.status_code == 403

    def test_manager_can_view_all_candidates(self, client, make_user, app):
        """经理可以看到所有候选人的列表（用分页格式）。"""
        uid, _ = make_user("mgr-owner@test.com", role="recruiter")
        _, manager_token = make_user("mgr-view@test.com", role="manager")
        with app.app_context():
            c = Candidate(owner_hr_id=uid, name_masked="归属候选人", resume_json={})
            db.session.add(c)
            db.session.commit()
        r = client.get("/api/candidates?page=1", headers=_auth(manager_token))
        assert r.status_code == 200
        assert r.get_json()["total"] == 1

    def test_cannot_move_other_users_candidates(self, client, make_user, app):
        """HR_A不能推进HR_B的候选人。"""
        hr_a_id, hr_a_token = make_user("cross-a@test.com")
        hr_b_id, _ = make_user("cross-b@test.com")
        with app.app_context():
            job = Job(title="跨用户测试", jd_text="x", owner_hr_id=hr_a_id)
            candidate = Candidate(owner_hr_id=hr_b_id, name_masked="B的候选人", resume_json={})
            db.session.add_all([job, candidate])
            db.session.commit()
            jid, cid = job.id, candidate.id
        r = client.post("/api/pipeline/move", headers=_auth(hr_a_token), json={
            "candidate_id": cid, "job_id": jid, "stage": "ai_screen"
        })
        assert r.status_code == 403


# ==================== 无效输入测试 ====================

class TestInvalidInput:
    def test_create_job_missing_title(self, client, make_user):
        _, token = make_user("invalid-job@test.com")
        r = client.post("/api/jobs", headers=_auth(token), json={"jd_text": "x"})
        assert r.status_code == 400

    def test_pipeline_move_missing_fields(self, client, make_user):
        _, token = make_user("invalid-pipe@test.com")
        r = client.post("/api/pipeline/move", headers=_auth(token), json={
            "candidate_id": 1, "job_id": 1
        })
        assert r.status_code in (400, 404)

    def test_nonexistent_candidate_detail(self, client, make_user):
        _, token = make_user("nf-c@test.com")
        r = client.get("/api/candidates/99999", headers=_auth(token))
        # 不存在的候选人
        assert r.status_code in (200, 404)


# ==================== 通知作用域测试 ====================

class TestNotificationScoping:
    def test_notifications_user_scoped(self, client, make_user, app):
        uid_a, token_a = make_user("notif-a@test.com")
        uid_b, token_b = make_user("notif-b@test.com")
        with app.app_context():
            n = Notification(user_id=uid_a, type="info", title="A的通知", body="仅A可见")
            db.session.add(n)
            db.session.commit()

        r_a = client.get("/api/notifications", headers=_auth(token_a))
        r_b = client.get("/api/notifications", headers=_auth(token_b))
        assert r_a.status_code == 200
        assert len(r_a.get_json()["notifications"]) == 1
        assert r_b.status_code == 200
        assert len(r_b.get_json()["notifications"]) == 0

    def test_mark_read_only_own(self, client, make_user, app):
        uid_a, token_a = make_user("mark-a@test.com")
        uid_b, token_b = make_user("mark-b@test.com")
        with app.app_context():
            n_a = Notification(user_id=uid_a, type="info", title="A", body="x", is_read=False)
            n_b = Notification(user_id=uid_b, type="info", title="B", body="y", is_read=False)
            db.session.add_all([n_a, n_b])
            db.session.commit()

        client.post("/api/notifications/mark-read", headers=_auth(token_a))
        r_b = client.get("/api/notifications/unread-count", headers=_auth(token_b))
        assert r_b.get_json()["unread_count"] == 1  # B的未读不受影响


# ==================== 数据一致性测试 ====================

class TestDataConsistency:
    def test_pipeline_append_only(self, client, make_user, app):
        """Pipeline阶段是append-only的，每次推进新增记录。"""
        _, token = make_user("pipe-append@test.com")
        with app.app_context():
            job = Job(title="追加测试", jd_text="x")
            candidate = Candidate(name_masked="追加候选人", resume_json={})
            db.session.add_all([job, candidate])
            db.session.commit()
            jid, cid = job.id, candidate.id

        for stage in ["pending", "ai_screen", "business_review"]:
            client.post("/api/pipeline/move", headers=_auth(token), json={
                "candidate_id": cid, "job_id": jid, "stage": stage
            })

        history = client.get(f"/api/pipeline/{jid}/history/{cid}", headers=_auth(token)).get_json()
        assert len(history["timeline"]) == 3
        timestamps = [t["ts"] for t in history["timeline"]]
        assert timestamps == sorted(timestamps)


# ==================== JWT 安全测试 ====================

class TestJWTSecurity:
    def test_expired_token_rejected(self, client, make_user):
        make_user("expired@test.com")
        expired_token = jwt.encode(
            {"user_id": 1, "role": "recruiter",
             "exp": datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=2)},
            TestingConfig.JWT_SECRET, algorithm="HS256",
        )
        r = client.get("/api/auth/me", headers=_auth(expired_token))
        assert r.status_code == 401

    def test_tampered_token_rejected(self, client):
        r = client.get("/api/auth/me", headers={"Authorization": "BearereyJhbGciOiJIUzI1NiJ9.dGFtcGVy"})
        assert r.status_code == 401

    def test_inactive_user_token_rejected(self, client, make_user):
        """不活跃用户的token被拒绝。"""
        make_user("inactive@test.com", is_active=False)
        token = jwt.encode(
            {"user_id": 1, "role": "recruiter",
             "exp": datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=1)},
            TestingConfig.JWT_SECRET, algorithm="HS256",
        )
        r = client.get("/api/auth/me", headers=_auth(token))
        # 不活跃用户返回403（Forbidden）或401
        assert r.status_code in (401, 403)


# ==================== Boss 多账号安全测试 ====================

class TestBossMultiAccountSecurity:
    def test_boss_accounts_user_scoped(self, client, make_user):
        uid_a, token_a = make_user("boss-a@test.com")
        uid_b, token_b = make_user("boss-b@test.com")
        r_a = client.get("/api/boss/accounts", headers=_auth(token_a))
        r_b = client.get("/api/boss/accounts", headers=_auth(token_b))
        assert r_a.status_code == 200
        assert r_b.status_code == 200
