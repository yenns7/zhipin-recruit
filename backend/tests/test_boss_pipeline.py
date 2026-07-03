# -*- coding: utf-8 -*-
"""BOSS 招聘闭环（批量导入 / AI 初筛）测试。

不依赖真实 boss 登录、网络或 LLM：通过 monkeypatch 替换
BossPipelineService 内部依赖的 boss-cli 下载、PreScreenService.evaluate_resume。
覆盖：批量导入去重/节流/限流即停、AI 初筛写库与推进、已下线的 BOSS 面试邀请端点、
鉴权与状态码映射。
"""
import json
from pathlib import Path

import pytest

from app import db
from app.api import boss as boss_api
from app.models import (
    Candidate,
    Interview,
    Job,
    PipelineStage,
    UploadBatch,
)
from app.services.boss_pipeline_service import BossPipelineService


def _auth(t):
    return {"Authorization": f"Bearer {t}"}


def _seed_account(owner_hr_id: int, cookies: dict = None, label: str = "test"):
    from app.models import BossAccount
    from app.services.crypto import encrypt
    cookies = cookies or {"wt2": "v1", "zp_at": "v3"}
    BossAccount.query.filter_by(owner_hr_id=owner_hr_id).update({"is_active": False})
    acct = BossAccount(
        owner_hr_id=owner_hr_id,
        label=label,
        cookies_encrypted=encrypt(json.dumps(cookies)),
        cookie_count=len(cookies),
        has_stoken=False,
        is_active=True,
    )
    db.session.add(acct)
    db.session.commit()
    return acct


def _seed_job(title="后端工程师", jd="负责后端服务开发，要求 Python/Go 3 年经验"):
    job = Job(title=title, jd_text=jd, status="active")
    db.session.add(job)
    db.session.commit()
    return job


def _fake_download_ok(md="# 张三\n\n邮箱 zhangsan@example.com 电话 13800138000\n\n## 经历\n- 公司A"):
    def _dl(self, encrypt_geek_id, job=None, security_id=None, cookies_override=None):
        return {"ok": True, "data": md, "error": None}
    return _dl


# ── 服务层：批量导入 ───────────────────────────────────────────────
def test_save_markdown_sanitizes_geek_id_path(app, tmp_path):
    with app.app_context():
        app.config["UPLOAD_FOLDER"] = str(tmp_path)
        saved = BossPipelineService()._save_markdown(7, "../evil/../../G1?x", "# ok")

        assert saved is not None
        saved_path = Path(saved).resolve()
        target_dir = (tmp_path / "boss" / "7").resolve()
        assert target_dir in saved_path.parents
        assert saved_path.name == "evil_G1_x.md"
        assert saved_path.read_text(encoding="utf-8") == "# ok"


def test_batch_import_basic_and_dedup(app, make_user, monkeypatch):
    """导入两条 + 重复一条；去重生效，入库 Candidate/UploadBatch/PipelineStage。"""
    with app.app_context():
        uid, _ = make_user("imp1@x.com", role="recruiter")
        job = _seed_job()
        monkeypatch.setattr(
            "app.services.boss_service.BossService.recruiter_resume_download",
            _fake_download_ok(),
        )
        svc = BossPipelineService()
        items = [
            {"geek_id": "G1", "name": "甲"},
            {"geek_id": "G2", "name": "乙"},
            {"geek_id": "G1", "name": "甲重复"},
        ]
        r = svc.batch_import(uid, items, cookies_override="ck", target_job_id=job.id,
                             boss_job="BJOB1", limit=20, interval_sec=0)
        assert r["ok"] is True
        d = r["data"]
        assert d["imported"] == 2
        assert d["skipped"] == 1
        assert d["failed"] == 0
        assert Candidate.query.filter_by(owner_hr_id=uid).count() == 2
        assert UploadBatch.query.filter_by(owner_hr_id=uid).count() == 1
        # 自动入池 pending
        stages = PipelineStage.query.filter_by(job_id=job.id, stage="pending").all()
        assert len(stages) == 2
        # 基础字段被解析
        c = Candidate.query.filter(Candidate.resume_json["boss"]["geek_id"].as_string() == "G1").first()
        assert c is not None
        assert c.resume_json["boss"]["job"] == "BJOB1"


def test_batch_import_stops_on_rate_limited(app, make_user, monkeypatch):
    """第二条命中 rate_limited → 立即停止，第一条保留。"""
    with app.app_context():
        uid, _ = make_user("imp2@x.com", role="recruiter")
        calls = {"n": 0}

        def _dl(self, encrypt_geek_id, job=None, security_id=None, cookies_override=None):
            calls["n"] += 1
            if calls["n"] == 1:
                return {"ok": True, "data": "# 候选人A", "error": None}
            return {"ok": False, "data": None, "error": {"code": "rate_limited", "message": "429"}}

        monkeypatch.setattr("app.services.boss_service.BossService.recruiter_resume_download", _dl)
        svc = BossPipelineService()
        items = [{"geek_id": "A1"}, {"geek_id": "A2"}, {"geek_id": "A3"}]
        r = svc.batch_import(uid, items, cookies_override="ck", interval_sec=0)
        d = r["data"]
        assert d["imported"] == 1
        assert d["stopped_reason"] == "rate_limited"
        assert calls["n"] == 2  # 第三条没有再请求
        assert Candidate.query.filter_by(owner_hr_id=uid).count() == 1


def test_batch_import_empty_items_rejected(app, make_user):
    with app.app_context():
        uid, _ = make_user("imp3@x.com", role="recruiter")
        r = BossPipelineService().batch_import(uid, [], cookies_override="ck")
        assert r["ok"] is False
        assert r["error"]["code"] == "invalid_params"


# ── 服务层：AI 初筛 ────────────────────────────────────────────────
def _make_candidate(uid, geek_id="G1", md="# 候选人\n精通 Python", job=None):
    c = Candidate(
        owner_hr_id=uid,
        name_masked="候选人",
        resume_json={"source": "boss", "raw_markdown": md,
                     "boss": {"geek_id": geek_id, "job": job}},
        parse_status="ok",
    )
    db.session.add(c)
    db.session.commit()
    return c


def test_ai_screen_writes_interview_and_stage(app, make_user, monkeypatch):
    with app.app_context():
        uid, _ = make_user("scr1@x.com", role="recruiter")
        job = _seed_job()
        c1 = _make_candidate(uid, "G1")
        c2 = _make_candidate(uid, "G2")
        monkeypatch.setattr(
            "app.services.interview_service.PreScreenService.evaluate_resume",
            lambda self, resume, jd: {"score": 4, "summary": "匹配", "highlights": ["Python"],
                                      "concerns": [], "pass_recommended": True},
        )
        r = BossPipelineService().ai_screen(uid, [c1.id, c2.id], job.id)
        assert r["ok"] is True
        assert r["data"]["screened"] == 2
        assert Interview.query.filter_by(job_id=job.id).count() == 2
        iv = Interview.query.filter_by(candidate_id=c1.id).first()
        assert iv.score == 4
        assert iv.pass_recommended is True
        assert iv.ai_report["type"] == "resume_screen"
        assert PipelineStage.query.filter_by(job_id=job.id, stage="ai_screen").count() == 2


def test_ai_screen_rejects_foreign_candidate(app, make_user, monkeypatch):
    """非本人候选人 → 该条 failed，不写库。"""
    with app.app_context():
        uid, _ = make_user("scr2@x.com", role="recruiter")
        other, _ = make_user("scr2b@x.com", role="recruiter")
        job = _seed_job()
        c = _make_candidate(other, "GX")
        monkeypatch.setattr(
            "app.services.interview_service.PreScreenService.evaluate_resume",
            lambda self, resume, jd: {"score": 3, "pass_recommended": False},
        )
        r = BossPipelineService().ai_screen(uid, [c.id], job.id)
        assert r["data"]["screened"] == 0
        assert r["data"]["failed"] == 1
        assert Interview.query.count() == 0


# ── API 鉴权 / 状态码 ──────────────────────────────────────────────
def test_batch_import_api_requires_active_account(client, make_user, monkeypatch):
    """无激活账号 → 409 no_active_account。"""
    _, token = make_user("api1@x.com", role="recruiter")
    r = client.post("/api/boss/candidates/batch-import",
                    json={"items": [{"geek_id": "G1"}]}, headers=_auth(token))
    assert r.status_code == 409
    assert r.get_json()["error"]["code"] == "no_active_account"
    assert "从浏览器导入" in r.get_json()["error"]["message"]


def test_batch_import_api_empty_items_400(client, make_user):
    uid, token = make_user("api2@x.com", role="recruiter")
    _seed_account(uid)
    r = client.post("/api/boss/candidates/batch-import", json={"items": []}, headers=_auth(token))
    assert r.status_code == 400


def test_batch_import_api_ok(client, make_user, monkeypatch):
    uid, token = make_user("api3@x.com", role="recruiter")
    _seed_account(uid)
    monkeypatch.setattr(
        "app.services.boss_service.BossService.recruiter_resume_download",
        _fake_download_ok(),
    )
    r = client.post("/api/boss/candidates/batch-import",
                    json={"items": [{"geek_id": "Z1"}], "interval_sec": 0},
                    headers=_auth(token))
    assert r.status_code == 200
    assert r.get_json()["data"]["imported"] == 1


def test_ai_screen_api_validation(client, make_user):
    _, token = make_user("api4@x.com", role="recruiter")
    r = client.post("/api/boss/candidates/ai-screen",
                    json={"candidate_ids": [], "job_id": 1}, headers=_auth(token))
    assert r.status_code == 400


def test_invite_interview_api_removed_for_recruiter(client, make_user):
    """BOSS 面试邀请依赖短效 stoken，已下线；旧客户端得到明确 410。"""
    _, token = make_user("api5@x.com", role="recruiter")
    r = client.post("/api/boss/candidates/invite-interview",
                    json={"candidate_id": 1, "job_id": 1}, headers=_auth(token))
    assert r.status_code == 410
    body = r.get_json()
    assert body["error"]["code"] == "gone"
    assert "系统内面试安排" in body["error"]["message"]


def test_invite_interview_api_forbidden_for_interviewer(client, make_user):
    _, token = make_user("api6@x.com", role="interviewer")
    r = client.post("/api/boss/candidates/invite-interview",
                    json={"candidate_id": 1, "job_id": 1}, headers=_auth(token))
    assert r.status_code == 403
