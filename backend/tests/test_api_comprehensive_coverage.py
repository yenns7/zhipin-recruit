# -*- coding: utf-8 -*-
"""API 端点全面覆盖测试 — 验证每个端点的正常路径和错误路径。

覆盖：Auth、Candidates、Jobs、Pipeline、Interview、BI、Demands、
Talent Maps、Notifications、Agent、Admin 等所有蓝图。
"""
from datetime import UTC, datetime, timedelta

import jwt

from app import db
from app.config import TestingConfig
from app.models import (
    Candidate,
    CandidateTag,
    InterviewAssignment,
    InterviewFeedback,
    Job,
    Match,
    Notification,
    PipelineStage,
    RecruitmentDemand,
    User,
    UploadBatch,
)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _make_token(user_id, role):
    return jwt.encode(
        {"user_id": user_id, "role": role,
         "exp": datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=1)},
        TestingConfig.JWT_SECRET, algorithm="HS256",
    )


# ==================== Auth 模块 ====================

class TestAuthEndpoints:
    def test_register_success(self, client):
        r = client.post("/api/auth/register", json={
            "email": "new@test.com", "password": "secure123", "name": "新用户"
        })
        assert r.status_code == 201
        body = r.get_json()
        assert body["role"] == "recruiter"
        assert body["email"] == "new@test.com"
        assert "password_hash" not in body

    def test_register_duplicate_email(self, client, make_user):
        make_user("dup@test.com")
        r = client.post("/api/auth/register", json={
            "email": "dup@test.com", "password": "secure123", "name": "重复"
        })
        assert r.status_code == 409

    def test_register_role_ignored(self, client):
        r = client.post("/api/auth/register", json={
            "email": "role-test@test.com", "password": "secure123", "name": "尝试", "role": "admin"
        })
        assert r.status_code == 201
        assert r.get_json()["role"] == "recruiter"

    def test_login_success(self, client, make_user):
        make_user("login@test.com", password="pass1234")
        r = client.post("/api/auth/login", json={"email": "login@test.com", "password": "pass1234"})
        assert r.status_code == 200
        assert "token" in r.get_json()

    def test_login_wrong_password(self, client, make_user):
        make_user("login-wrong@test.com", password="correct")
        r = client.post("/api/auth/login", json={"email": "login-wrong@test.com", "password": "wrong"})
        assert r.status_code == 401

    def test_login_nonexistent_user(self, client):
        r = client.post("/api/auth/login", json={"email": "noexist@test.com", "password": "x"})
        assert r.status_code in (401, 400)

    def test_me_endpoint(self, client, make_user):
        uid, token = make_user("me@test.com", name="我", role="recruiter")
        r = client.get("/api/auth/me", headers=_auth(token))
        assert r.status_code == 200
        assert r.get_json()["email"] == "me@test.com"
        assert r.get_json()["name"] == "我"

    def test_me_without_token(self, client):
        r = client.get("/api/auth/me")
        assert r.status_code == 401

    def test_me_with_invalid_token(self, client):
        r = client.get("/api/auth/me", headers={"Authorization": "Bearer invalid"})
        assert r.status_code == 401

    def test_change_password(self, client, make_user):
        make_user("change-pw@test.com", password="oldpass")
        login = client.post("/api/auth/login", json={"email": "change-pw@test.com", "password": "oldpass"})
        token = login.get_json()["token"]
        r = client.post("/api/auth/change-password", headers=_auth(token), json={
            "old_password": "oldpass", "new_password": "newpass123"
        })
        assert r.status_code == 200
        r2 = client.post("/api/auth/login", json={"email": "change-pw@test.com", "password": "oldpass"})
        assert r2.status_code == 401
        r3 = client.post("/api/auth/login", json={"email": "change-pw@test.com", "password": "newpass123"})
        assert r3.status_code == 200


# ==================== Candidates 模块 ====================

class TestCandidateEndpoints:
    def _seed_candidate(self, app, hr_id):
        with app.app_context():
            c = Candidate(owner_hr_id=hr_id, name_masked="测试候选人", resume_json={
                "extracted_info": {"skills": ["Python", "SQL"], "summary": "测试简历"}
            })
            db.session.add(c)
            db.session.commit()
            return c.id

    def test_list_candidates_empty(self, client, make_user):
        _, token = make_user("empty-list@test.com")
        r = client.get("/api/candidates?page=1", headers=_auth(token))
        assert r.status_code == 200
        assert r.get_json()["total"] == 0
        assert r.get_json()["candidates"] == []

    def test_list_candidates_with_data(self, client, make_user, app):
        uid, token = make_user("list-c@test.com")
        cid = self._seed_candidate(app, uid)
        r = client.get("/api/candidates?page=1", headers=_auth(token))
        assert r.status_code == 200
        assert len(r.get_json()["candidates"]) == 1

    def test_search_candidates(self, client, make_user, app):
        uid, token = make_user("search-c@test.com")
        with app.app_context():
            c = Candidate(owner_hr_id=uid, name_masked="张三丰", resume_json={"extracted_info": {"skills": ["太极"]}})
            db.session.add(c)
            db.session.commit()
        r = client.get("/api/candidates?search=张三&page=1", headers=_auth(token))
        assert r.status_code == 200
        assert len(r.get_json()["candidates"]) >= 1

    def test_candidate_pipelines(self, client, make_user, app):
        uid, token = make_user("c-pipe@test.com")
        with app.app_context():
            job = Job(title="测试岗位", jd_text="x", owner_hr_id=uid)
            candidate = Candidate(owner_hr_id=uid, name_masked="有流程的候选人", resume_json={})
            db.session.add_all([job, candidate])
            db.session.flush()
            db.session.add(PipelineStage(candidate_id=candidate.id, job_id=job.id, stage="pending", updated_by=uid))
            db.session.commit()
            cid, jid = candidate.id, job.id
        r = client.get(f"/api/candidates/{cid}/pipelines", headers=_auth(token))
        assert r.status_code == 200
        assert len(r.get_json()) >= 1

    def test_candidate_owner_options_requires_manager(self, client, make_user):
        """owner-options 端点需要 manager 或 admin 角色。"""
        make_user("owner-opt-1@test.com", name="HR_A")
        _, recruiter_token = make_user("owner-opt-r@test.com", role="recruiter")
        _, manager_token = make_user("owner-opt-m@test.com", role="manager")
        _, admin_token = make_user("owner-opt-a@test.com", role="admin")
        # recruiter 无权访问
        r_recruiter = client.get("/api/candidates/owner-options", headers=_auth(recruiter_token))
        assert r_recruiter.status_code == 403
        # manager 可以访问
        r_manager = client.get("/api/candidates/owner-options", headers=_auth(manager_token))
        assert r_manager.status_code == 200
        # admin 可以访问
        r_admin = client.get("/api/candidates/owner-options", headers=_auth(admin_token))
        assert r_admin.status_code == 200

    def test_candidate_not_found(self, client, make_user):
        _, token = make_user("c-nf@test.com")
        r = client.get("/api/candidates/99999/pipelines", headers=_auth(token))
        # 不存在的候选人返回404
        assert r.status_code == 404


# ==================== Jobs 模块 ====================

class TestJobEndpoints:
    def test_create_job(self, client, make_user):
        _, token = make_user("create-job@test.com")
        r = client.post("/api/jobs", headers=_auth(token), json={
            "title": "测试岗位", "city": "北京", "department": "产品部", "jd_text": "产品设计"
        })
        assert r.status_code == 201
        body = r.get_json()
        assert body["title"] == "测试岗位"
        # POST /api/jobs 返回新创建岗位的 status（默认 active）
        assert body["status"] == "active"

    def test_list_jobs(self, client, make_user):
        _, token = make_user("list-jobs@test.com")
        client.post("/api/jobs", headers=_auth(token), json={"title": "岗位1", "jd_text": "x"})
        client.post("/api/jobs", headers=_auth(token), json={"title": "岗位2", "jd_text": "y"})
        r = client.get("/api/jobs", headers=_auth(token))
        assert r.status_code == 200
        # GET /api/jobs 返回 JSON 数组，不是字典
        assert len(r.get_json()) == 2

    def test_get_job_detail(self, client, make_user):
        _, token = make_user("job-detail@test.com")
        create = client.post("/api/jobs", headers=_auth(token), json={"title": "详情岗位", "jd_text": "x"})
        job_id = create.get_json()["id"]
        r = client.get(f"/api/jobs/{job_id}", headers=_auth(token))
        assert r.status_code == 200
        assert r.get_json()["title"] == "详情岗位"

    def test_update_job(self, client, make_user):
        _, token = make_user("update-job@test.com")
        create = client.post("/api/jobs", headers=_auth(token), json={"title": "原岗位", "jd_text": "x"})
        job_id = create.get_json()["id"]
        r = client.put(f"/api/jobs/{job_id}", headers=_auth(token), json={"title": "更新后岗位"})
        assert r.status_code == 200
        assert r.get_json()["title"] == "更新后岗位"

    def test_close_and_restore_job(self, client, make_user):
        _, token = make_user("close-job@test.com")
        create = client.post("/api/jobs", headers=_auth(token), json={"title": "关闭岗位", "jd_text": "x"})
        job_id = create.get_json()["id"]
        close = client.post(f"/api/jobs/{job_id}/close", headers=_auth(token))
        assert close.get_json()["status"] == "closed"
        restore = client.post(f"/api/jobs/{job_id}/restore", headers=_auth(token))
        assert restore.get_json()["status"] == "active"

    def test_job_not_found(self, client, make_user):
        _, token = make_user("job-nf@test.com")
        r = client.get("/api/jobs/99999", headers=_auth(token))
        assert r.status_code == 404


# ==================== Pipeline 模块 ====================

class TestPipelineEndpoints:
    def _seed(self, app, hr_id):
        with app.app_context():
            job = Job(title="Pipeline测试岗", jd_text="x", owner_hr_id=hr_id)
            candidate = Candidate(owner_hr_id=hr_id, name_masked="Pipeline候选人", resume_json={})
            db.session.add_all([job, candidate])
            db.session.commit()
            return job.id, candidate.id

    def test_move_invalid_stage(self, client, make_user, app):
        _, token = make_user("pipe-invalid@test.com")
        jid, cid = self._seed(app, token)
        r = client.post("/api/pipeline/move", headers=_auth(token), json={
            "candidate_id": cid, "job_id": jid, "stage": "invalid_stage"
        })
        assert r.status_code == 400

    def test_move_backward_is_rejected(self, client, make_user, app):
        """Pipeline move 禁止回退阶段（修复阶段回退缺陷后的正确行为）。"""
        uid, token = make_user("pipe-backward@test.com")
        jid, cid = self._seed(app, uid)
        # 先推进到 interview（首次进入，放行）
        forward = client.post("/api/pipeline/move", headers=_auth(token), json={
            "candidate_id": cid, "job_id": jid, "stage": "interview"
        })
        assert forward.status_code == 200
        # 回退到 pending — 修复后应拒绝（返回400），错误信息为中文提示
        r = client.post("/api/pipeline/move", headers=_auth(token), json={
            "candidate_id": cid, "job_id": jid, "stage": "pending"
        })
        assert r.status_code == 400
        assert "回退" in r.get_json()["error"]

    def test_move_forward_is_allowed(self, client, make_user, app):
        """前向推进 pending→ai_screen 应返回 200（回归保护）。"""
        uid, token = make_user("pipe-forward@test.com")
        jid, cid = self._seed(app, uid)
        first = client.post("/api/pipeline/move", headers=_auth(token), json={
            "candidate_id": cid, "job_id": jid, "stage": "pending"
        })
        assert first.status_code == 200
        r = client.post("/api/pipeline/move", headers=_auth(token), json={
            "candidate_id": cid, "job_id": jid, "stage": "ai_screen"
        })
        assert r.status_code == 200


    def test_pipeline_board(self, client, make_user, app):
        _, token = make_user("pipe-board@test.com")
        jid, cid = self._seed(app, token)
        client.post("/api/pipeline/move", headers=_auth(token), json={
            "candidate_id": cid, "job_id": jid, "stage": "ai_screen"
        })
        board = client.get(f"/api/pipeline/{jid}/board", headers=_auth(token))
        assert board.status_code == 200
        assert "stage_order" in board.get_json()
        assert "candidates" in board.get_json()

    def test_pipeline_history(self, client, make_user, app):
        uid, token = make_user("pipe-history@test.com")
        jid, cid = self._seed(app, uid)
        client.post("/api/pipeline/move", headers=_auth(token), json={
            "candidate_id": cid, "job_id": jid, "stage": "ai_screen", "note": "初次筛选"
        })
        r = client.get(f"/api/pipeline/{jid}/history/{cid}", headers=_auth(token))
        assert r.status_code == 200
        assert len(r.get_json()["timeline"]) >= 1


# ==================== BI 模块 ====================

class TestBiEndpoints:
    def test_bi_overview_requires_auth(self, client):
        r = client.get("/api/bi/overview")
        assert r.status_code == 401

    def test_bi_overview_for_manager(self, client, make_user):
        _, token = make_user("bi-mgr@test.com", role="manager")
        r = client.get("/api/bi/overview", headers=_auth(token))
        assert r.status_code == 200
        body = r.get_json()
        assert "funnel" in body
        assert "staff" in body

    def test_bi_overview_for_interviewer_restricted(self, client, make_user):
        _, token = make_user("bi-interviewer@test.com", role="interviewer")
        r = client.get("/api/bi/overview", headers=_auth(token))
        assert r.status_code == 403

    def test_bi_overview_with_days_param(self, client, make_user):
        _, token = make_user("bi-days@test.com", role="manager")
        r7 = client.get("/api/bi/overview?days=7", headers=_auth(token))
        r30 = client.get("/api/bi/overview?days=30", headers=_auth(token))
        assert r7.status_code == 200
        assert r30.status_code == 200

    def test_bi_staff_detail(self, client, make_user, app):
        hr_id, hr_token = make_user("bi-staff@test.com", role="recruiter")
        _, manager_token = make_user("bi-staff-mgr@test.com", role="manager")
        r = client.get(f"/api/bi/staff/{hr_id}", headers=_auth(manager_token))
        assert r.status_code == 200
        assert r.get_json()["hr_id"] == hr_id

    def test_bi_job_detail(self, client, make_user, app):
        hr_id, token = make_user("bi-job@test.com")
        with app.app_context():
            job = Job(title="BI岗位", jd_text="x", owner_hr_id=hr_id)
            db.session.add(job)
            db.session.commit()
            jid = job.id
        r = client.get(f"/api/bi/job/{jid}", headers=_auth(token))
        assert r.status_code == 200
        assert "funnel" in r.get_json()


# ==================== Notifications 模块 ====================

class TestNotificationEndpoints:
    def test_notifications_empty(self, client, make_user):
        _, token = make_user("notif-empty@test.com")
        r = client.get("/api/notifications", headers=_auth(token))
        assert r.status_code == 200

    def test_unread_count(self, client, make_user):
        _, token = make_user("notif-count@test.com")
        r = client.get("/api/notifications/unread-count", headers=_auth(token))
        assert r.status_code == 200
        assert r.get_json()["unread_count"] == 0

    def test_mark_read(self, client, make_user):
        _, token = make_user("notif-read@test.com")
        r = client.post("/api/notifications/mark-read", headers=_auth(token))
        assert r.status_code == 200


# ==================== Admin 模块 ====================

class TestAdminEndpoints:
    def test_admin_user_list(self, client, make_user):
        make_user("admin-list-1@test.com")
        make_user("admin-list-2@test.com")
        _, admin_token = make_user("admin-admin@test.com", role="admin")
        r = client.get("/api/admin/users", headers=_auth(admin_token))
        assert r.status_code == 200
        assert len(r.get_json()) >= 3

    def test_admin_create_user(self, client, make_user):
        _, admin_token = make_user("admin-create@test.com", role="admin")
        r = client.post("/api/admin/users", headers=_auth(admin_token), json={
            "email": "admin-created@test.com", "name": "管理员创建", "role": "recruiter", "password": "pass123"
        })
        assert r.status_code == 201
        assert r.get_json()["email"] == "admin-created@test.com"

    def test_admin_only_access(self, client, make_user):
        _, recruiter_token = make_user("admin-restrict@test.com", role="recruiter")
        r = client.get("/api/admin/users", headers=_auth(recruiter_token))
        assert r.status_code == 403

    def test_admin_update_user(self, client, make_user):
        uid, _ = make_user("admin-update@test.com")
        _, admin_token = make_user("admin-upd-admin@test.com", role="admin")
        r = client.patch(f"/api/admin/users/{uid}", headers=_auth(admin_token), json={"role": "manager"})
        assert r.status_code == 200
        assert r.get_json()["role"] == "manager"

    def test_admin_audit_logs(self, client, make_user):
        _, admin_token = make_user("admin-audit@test.com", role="admin")
        r = client.get("/api/admin/audit-logs", headers=_auth(admin_token))
        assert r.status_code == 200

    def test_admin_ai_architecture(self, client, make_user):
        _, admin_token = make_user("admin-ai@test.com", role="admin")
        r = client.get("/api/admin/ai-architecture", headers=_auth(admin_token))
        assert r.status_code == 200


# ==================== Interview 模块 ====================

class TestInterviewEndpoints:
    def test_interview_list(self, client, make_user):
        _, token = make_user("interview-list@test.com")
        r = client.get("/api/interviews", headers=_auth(token))
        assert r.status_code == 200

    def test_interview_guide_requires_params(self, client, make_user):
        """面试指南需要candidate_id和job_id参数。"""
        _, token = make_user("interview-guide@test.com")
        r = client.get("/api/interview/guide", headers=_auth(token))
        assert r.status_code == 400  # 缺少必要参数

    def test_interviewers_list(self, client, make_user):
        _, token = make_user("interviewers@test.com")
        r = client.get("/api/interview/interviewers", headers=_auth(token))
        assert r.status_code == 200


# ==================== Demands 模块 ====================

class TestDemandEndpoints:
    def test_demands_empty(self, client, make_user):
        _, token = make_user("demands-empty@test.com")
        r = client.get("/api/demands", headers=_auth(token))
        assert r.status_code == 200

    def test_create_demand_missing_job(self, client, make_user):
        _, token = make_user("demand-nojob@test.com")
        r = client.post("/api/demands", headers=_auth(token), json={"job_id": 99999})
        assert r.status_code in (400, 404)


# ==================== Talent Maps 模块 ====================

class TestTalentMapEndpoints:
    def test_talent_maps_empty(self, client, make_user):
        _, token = make_user("tm-empty@test.com")
        r = client.get("/api/talent-maps", headers=_auth(token))
        assert r.status_code == 200

    def test_create_talent_map(self, client, make_user, app):
        _, token = make_user("tm-create@test.com")
        with app.app_context():
            job = Job(title="地图岗", jd_text="x")
            db.session.add(job)
            db.session.commit()
            jid = job.id
        r = client.post("/api/talent-maps", headers=_auth(token), json={
            "name": "测试人才地图", "job_id": jid
        })
        assert r.status_code == 201
        assert r.get_json()["name"] == "测试人才地图"


# ==================== Agent 模块 ====================

class TestAgentEndpoints:
    def test_agent_tools(self, client, make_user):
        _, token = make_user("agent-tools@test.com")
        r = client.get("/api/agent/tools", headers=_auth(token))
        assert r.status_code == 200

    def test_agent_conversations_empty(self, client, make_user):
        _, token = make_user("agent-conv@test.com")
        r = client.get("/api/agent/conversations", headers=_auth(token))
        assert r.status_code == 200

    def test_agent_create_conversation(self, client, make_user):
        _, token = make_user("agent-create-conv@test.com")
        r = client.post("/api/agent/conversations", headers=_auth(token), json={"title": "测试对话"})
        assert r.status_code == 201

    def test_agent_call_logs(self, client, make_user):
        _, token = make_user("agent-logs@test.com")
        r = client.get("/api/agent/call-logs", headers=_auth(token))
        assert r.status_code == 200


# ==================== Boss 模块 (CLI 不可用场景) ====================

class TestBossEndpointsWithoutCLI:
    def test_boss_accounts_list(self, client, make_user):
        _, token = make_user("boss-accounts@test.com")
        r = client.get("/api/boss/accounts", headers=_auth(token))
        assert r.status_code == 200

    def test_boss_requires_recruiter_role(self, client, make_user):
        _, token = make_user("boss-interviewer@test.com", role="interviewer")
        r = client.get("/api/boss/accounts", headers=_auth(token))
        assert r.status_code == 403
