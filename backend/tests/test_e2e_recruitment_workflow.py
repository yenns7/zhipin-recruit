# -*- coding: utf-8 -*-
"""端到端招聘工作流测试 — 模拟完整招聘生命周期。

覆盖：岗位创建 → 简历上传 → AI匹配 → Pipeline推进 →
面试安排 → 面试反馈 → Offer → 入职。
"""
from datetime import UTC, date, datetime, timedelta

import jwt

from app import db
from app.config import TestingConfig
from app.models import (
    Candidate,
    InterviewAssignment,
    InterviewFeedback,
    Job,
    Match,
    PipelineStage,
    RecruitmentDemand,
    OfferRecord,
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


def test_full_recruitment_lifecycle(client, make_user, app):
    """完整招聘周期：创建岗位 → 上传简历 → 匹配 → 推进 → 面试 → Offer → 入职。"""
    hr_id, hr_token = make_user("lifecycle-hr@example.com", role="recruiter", name="招聘HR")
    _, manager_token = make_user("lifecycle-manager@example.com", role="manager", name="招聘经理")
    interviewer_id, interviewer_token = make_user(
        "lifecycle-interviewer@example.com", role="interviewer", name="面试官A"
    )

    # === 阶段1: 创建岗位 ===
    job_res = client.post("/api/jobs", headers=_auth(hr_token), json={
        "title": "高级Python工程师",
        "city": "上海",
        "department": "研发部",
        "jd_text": "负责后端核心服务开发，要求Python/Flask/SQLAlchemy经验",
    })
    assert job_res.status_code == 201
    job = job_res.get_json()
    job_id = job["id"]
    assert job["title"] == "高级Python工程师"
    # POST /api/jobs 返回新岗位 status（默认 active），与列表端点一致
    assert job["status"] == "active"

    # === 阶段2: 上传简历（通过DB直接建数据，跳过解析） ===
    with app.app_context():
        batch = UploadBatch(owner_hr_id=hr_id, source_channel="猎聘", target_job_id=job_id)
        db.session.add(batch)
        db.session.flush()
        candidates_data = []
        for i, (name, skills) in enumerate([
            ("候选人A", ["Python", "Flask", "SQLAlchemy"]),
            ("候选人B", ["Python", "Django"]),
            ("候选人C", ["Java", "Spring"]),
        ], 1):
            c = Candidate(
                owner_hr_id=hr_id,
                upload_batch_id=batch.id,
                name_masked=name,
                resume_json={"extracted_info": {"skills": skills, "summary": f"{name}的简历"}},
                parse_status="parsed",
            )
            db.session.add(c)
            db.session.flush()
            candidates_data.append((c.id, name))
        db.session.commit()

    # === 阶段3: AI 匹配 ===
    with app.app_context():
        c1_id = candidates_data[0][0]
        c2_id = candidates_data[1][0]
        c3_id = candidates_data[2][0]
        db.session.add_all([
            Match(job_id=job_id, candidate_id=c1_id, score=0.92, reason="Python+Flask+SQLAlchemy全匹配"),
            Match(job_id=job_id, candidate_id=c2_id, score=0.65, reason="Python匹配但无Flask经验"),
            Match(job_id=job_id, candidate_id=c3_id, score=0.15, reason="Java技术栈不匹配"),
        ])
        db.session.commit()

    # 验证匹配预览（注意：返回字段是 "results" 不是 "matches"）
    match_preview = client.get(f"/api/jobs/{job_id}/match-preview", headers=_auth(hr_token))
    assert match_preview.status_code == 200
    results = match_preview.get_json()["results"]
    assert len(results) == 3
    assert results[0]["score"] >= results[1]["score"]  # 排序验证

    # === 阶段4: 批量加入Pipeline ===
    batch_res = client.post(f"/api/jobs/{job_id}/batch-pipeline", headers=_auth(hr_token),
                            json={"candidate_ids": [c1_id, c2_id]})
    assert batch_res.status_code == 200
    assert batch_res.get_json()["added"] == 2

    # 验证Pipeline状态（board端点返回stage_order + candidates列表，无counts字段）
    board = client.get(f"/api/pipeline/{job_id}/board", headers=_auth(hr_token))
    assert board.status_code == 200
    board_data = board.get_json()
    assert "candidates" in board_data
    assert len(board_data["candidates"]) == 2  # 2个候选人加入pipeline
    pending_count = sum(1 for c in board_data["candidates"] if c["stage"] == "pending")
    assert pending_count == 2

    # === 阶段5: 推进候选人A到各阶段 ===
    for stage in ["ai_screen", "business_review", "interview"]:
        r = client.post("/api/pipeline/move", headers=_auth(hr_token), json={
            "candidate_id": c1_id, "job_id": job_id, "stage": stage, "note": f"推进到{stage}"
        })
        assert r.status_code == 200

    # === 阶段6: 面试安排（round必须是有效的面试轮次） ===
    assignment_res = client.post("/api/interview/assignments", headers=_auth(hr_token), json={
        "candidate_id": c1_id,
        "job_id": job_id,
        "round": "round_1",
        "interviewer_id": interviewer_id,
        "scheduled_at": (datetime.now(UTC).replace(tzinfo=None) + timedelta(days=2)).isoformat(),
        "location": "线上-腾讯会议",
        "note": "请准备算法题",
    })
    assert assignment_res.status_code == 201
    assignment = assignment_res.get_json()
    assert assignment["interviewer_name"] == "面试官A"

    # 验证面试官能看到分配
    interviewer_list = client.get("/api/interview/assignments", headers=_auth(interviewer_token))
    assert interviewer_list.status_code == 200

    # === 阶段7: 面试反馈（与分配的轮次一致） ===
    feedback_res = client.post("/api/interview/feedback", headers=_auth(interviewer_token), json={
        "candidate_id": c1_id,
        "job_id": job_id,
        "round": "round_1",
        "score": 4,
        "passed": True,
        "strengths": "Python基础扎实，Flask项目经验丰富",
        "concerns": "系统设计经验稍显不足",
        "note": "推荐进入下一轮",
    })
    assert feedback_res.status_code == 201

    # === 阶段8: 推进到Offer ===
    offer_move = client.post("/api/pipeline/move", headers=_auth(hr_token), json={
        "candidate_id": c1_id, "job_id": job_id, "stage": "offer", "note": "发放Offer"
    })
    assert offer_move.status_code == 200

    # === 阶段9: 候选人B被淘汰 ===
    reject_move = client.post("/api/pipeline/move", headers=_auth(hr_token), json={
        "candidate_id": c2_id, "job_id": job_id, "stage": "rejected", "note": "技术栈不完全匹配"
    })
    assert reject_move.status_code == 200

    # === 验证最终看板状态（board返回candidates列表） ===
    final_board = client.get(f"/api/pipeline/{job_id}/board", headers=_auth(hr_token)).get_json()
    stages = [c["stage"] for c in final_board["candidates"]]
    assert "offer" in stages
    assert "rejected" in stages

    # === 验证候选人旅程 ===
    journey = client.get(f"/api/candidates/{c1_id}/journey?job_id={job_id}", headers=_auth(hr_token))
    assert journey.status_code == 200
    timeline = journey.get_json()["timeline"]
    stages_seen = [t["stage"] for t in timeline]
    assert "pending" in stages_seen
    assert "offer" in stages_seen


def test_candidate_ownership_transfer(client, make_user, app):
    """候选人转移负责人全流程 — 需要 manager/admin 角色执行转移。"""
    hr_a_id, hr_a_token = make_user("owner-a@example.com", role="recruiter", name="HR_A")
    hr_b_id, hr_b_token = make_user("owner-b@example.com", role="recruiter", name="HR_B")
    _, manager_token = make_user("owner-mgr@example.com", role="manager", name="经理")

    with app.app_context():
        job = Job(title="数据分析师", jd_text="SQL + Python", owner_hr_id=hr_a_id)
        candidate = Candidate(owner_hr_id=hr_a_id, name_masked="可转移候选人", resume_json={})
        db.session.add_all([job, candidate])
        db.session.flush()
        cid = candidate.id
        jid = job.id
        db.session.commit()

    # A创建的候选人B看不到（用分页参数触发分页格式）
    list_b = client.get("/api/candidates?page=1", headers=_auth(hr_b_token))
    assert list_b.status_code == 200
    assert list_b.get_json()["total"] == 0

    # 经理将A的候选人转移给B（reassign 需要 manager/admin 角色，字段名是 owner_hr_id）
    transfer = client.patch(f"/api/candidates/{cid}/owner", headers=_auth(manager_token), json={
        "owner_hr_id": hr_b_id, "reason": "业务调整"
    })
    assert transfer.status_code == 200
    assert transfer.get_json()["owner_hr_id"] == hr_b_id

    # B现在能看到
    list_b2 = client.get("/api/candidates?page=1", headers=_auth(hr_b_token))
    assert list_b2.status_code == 200
    assert list_b2.get_json()["total"] == 1

    # A看不到了
    list_a = client.get("/api/candidates?page=1", headers=_auth(hr_a_token))
    assert list_a.status_code == 200
    assert list_a.get_json()["total"] == 0


def test_job_close_and_restore_preserves_data(client, make_user, app):
    """岗位关闭后恢复，数据完整性验证。"""
    hr_id, hr_token = make_user("close-restore-hr@example.com", role="recruiter", name="HR")

    with app.app_context():
        job = Job(title="前端工程师", jd_text="React/Vue", owner_hr_id=hr_id)
        candidate = Candidate(owner_hr_id=hr_id, name_masked="前端候选人", resume_json={})
        db.session.add_all([job, candidate])
        db.session.flush()
        cid, jid = candidate.id, job.id
        db.session.commit()

    # 加入pipeline
    client.post(f"/api/jobs/{jid}/batch-pipeline", headers=_auth(hr_token),
                json={"candidate_ids": [cid]})

    # 关闭岗位
    close_res = client.post(f"/api/jobs/{jid}/close", headers=_auth(hr_token))
    assert close_res.status_code == 200
    assert close_res.get_json()["status"] == "closed"

    # 修复后：关闭岗位后 pipeline move 检查岗位状态，应拒绝（返回400）
    move_res = client.post("/api/pipeline/move", headers=_auth(hr_token), json={
        "candidate_id": cid, "job_id": jid, "stage": "ai_screen"
    })
    assert move_res.status_code == 400
    assert "关闭" in move_res.get_json()["error"]

    # 恢复岗位
    restore_res = client.post(f"/api/jobs/{jid}/restore", headers=_auth(hr_token))
    assert restore_res.status_code == 200
    assert restore_res.get_json()["status"] == "active"


def test_demand_lifecycle_with_priority_change(client, make_user, app):
    """招聘需求完整生命周期：创建 → 降级 → 关闭 → 恢复。"""
    hr_id, hr_token = make_user("demand-lifecycle-hr@example.com", role="recruiter", name="需求HR")

    with app.app_context():
        job = Job(title="DevOps工程师", jd_text="CI/CD + K8s", owner_hr_id=hr_id)
        db.session.add(job)
        db.session.commit()
        job_id = job.id

    # 创建需求
    create_res = client.post("/api/demands", headers=_auth(hr_token), json={
        "job_id": job_id,
        "requester_name": "CTO",
        "requester_department": "技术部",
        "priority": "A",
        "headcount": 2,
        "target_date": (date.today() + timedelta(days=30)).isoformat(),
    })
    assert create_res.status_code == 201
    demand = create_res.get_json()
    demand_id = demand["id"]
    assert demand["priority"] == "A"

    # 更新需求
    update_res = client.patch(f"/api/demands/{demand_id}", headers=_auth(hr_token), json={
        "headcount": 3, "note": "紧急扩编"
    })
    assert update_res.status_code == 200
    assert update_res.get_json()["headcount"] == 3

    # 降级
    downgrade_res = client.post(f"/api/demands/{demand_id}/downgrade", headers=_auth(hr_token), json={
        "priority": "C", "downgrade_reason": "预算调整"
    })
    assert downgrade_res.status_code == 200
    assert downgrade_res.get_json()["priority"] == "C"

    # 关闭
    close_res = client.post(f"/api/demands/{demand_id}/close", headers=_auth(hr_token), json={
        "status": "cancelled", "close_reason": "项目暂停"
    })
    assert close_res.status_code == 200
    assert close_res.get_json()["status"] == "cancelled"

    # 恢复
    restore_res = client.post(f"/api/demands/{demand_id}/restore", headers=_auth(hr_token), json={
        "note": "项目重新启动"
    })
    assert restore_res.status_code == 200
    assert restore_res.get_json()["status"] == "active"
