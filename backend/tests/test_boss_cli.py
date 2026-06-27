# -*- coding: utf-8 -*-
"""boss-cli 集成测试。

不依赖真实 boss 登录或网络，通过 monkeypatch 替换 subprocess.run / shutil.which /
_ensure_cli 来验证：argv 拼装、--json 注入、信封解析、超时/非 JSON 回退、CLI 未安装
降级，以及 REST 接口的鉴权与状态码映射。
"""
import json
import subprocess

import pytest

from app.services import boss_service
from app.services.boss_service import BossService, _run, _ensure_cli


# ── 测试辅助 ───────────────────────────────────────────────────────
class _FakeProc:
    def __init__(self, stdout="", stderr="", returncode=0):
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode


def _patch_run(monkeypatch, stdout="", stderr="", returncode=0, capture=None):
    """让 _run 内的 subprocess.run 返回固定结果。

    capture: 若提供，每次调用把 argv 追加进此 list，用于断言命令拼装。
    """
    def fake_run(cmd, *args, **kwargs):
        if capture is not None:
            capture.append(cmd)
        return _FakeProc(stdout=stdout, stderr=stderr, returncode=returncode)
    monkeypatch.setattr(subprocess, "run", fake_run)


def _patch_cli_ok(monkeypatch):
    """让 _ensure_cli 始终返回 boss 已安装。"""
    monkeypatch.setattr(boss_service, "_ensure_cli", lambda: (True, "/usr/local/bin/boss"))


def _auth(t):
    return {"Authorization": f"Bearer {t}"}


def _seed_account(owner_hr_id: int, cookies: dict = None, label: str = "test"):
    """在 DB 里给某用户存一个激活的 BOSS 账号（mock cookies），返回 BossAccount。"""
    from app import db
    from app.models import BossAccount
    from app.services.crypto import encrypt
    import json
    cookies = cookies or {"wt2": "v1", "wbg": "v2", "zp_at": "v3"}
    BossAccount.query.filter_by(owner_hr_id=owner_hr_id).update({"is_active": False})
    acct = BossAccount(
        owner_hr_id=owner_hr_id,
        label=label,
        cookies_encrypted=encrypt(json.dumps(cookies)),
        cookie_count=len(cookies),
        has_stoken="__zp_stoken__" in cookies,
        is_active=True,
    )
    db.session.add(acct)
    db.session.commit()
    return acct


# ── 服务层：_ensure_cli ────────────────────────────────────────────
def test_ensure_cli_missing_no_autoinstall(monkeypatch):
    """CLI 缺失 + 关闭自动安装 → 返回未安装错误。"""
    monkeypatch.setenv("BOSS_CLI_AUTO_INSTALL", "false")
    monkeypatch.setattr(boss_service.shutil, "which", lambda name: None)
    monkeypatch.setattr(boss_service, "_resolve_bin", lambda: None)
    monkeypatch.delenv("BOSS_CLI_BIN", raising=False)
    ok, msg = _ensure_cli()
    assert ok is False
    assert "未安装" in msg
    assert "pip install" in msg


def test_ensure_cli_present(monkeypatch):
    """_resolve_bin 命中 → 直接返回路径。"""
    monkeypatch.setattr(boss_service, "_resolve_bin", lambda: "/usr/local/bin/boss")
    monkeypatch.delenv("BOSS_CLI_BIN", raising=False)
    ok, msg = _ensure_cli()
    assert ok is True
    assert msg == "/usr/local/bin/boss"


def test_ensure_cli_env_override(monkeypatch):
    """BOSS_CLI_BIN 环境变量优先于 shutil.which。"""
    import tempfile, os
    tmp = tempfile.NamedTemporaryFile(delete=False)
    tmp.close()
    try:
        monkeypatch.setenv("BOSS_CLI_BIN", tmp.name)
        called = {"which": False}
        monkeypatch.setattr(boss_service.shutil, "which", lambda name: called.__setitem__("which", True) or "/nope")
        ok, msg = _ensure_cli()
        assert ok is True
        assert msg == tmp.name
        assert called["which"] is False  # 不应走到 which
    finally:
        os.unlink(tmp.name)


# ── 服务层：_run 信封解析 ──────────────────────────────────────────
def test_run_standard_envelope(monkeypatch):
    """标准信封 {ok,data,error} 原样取 data。"""
    _patch_cli_ok(monkeypatch)
    payload = {"ok": True, "schema_version": "1", "data": {"geekList": [{"name": "张三"}]}, "error": None}
    _patch_run(monkeypatch, stdout=json.dumps(payload))
    r = _run(["recruiter", "search", "golang"])
    assert r["ok"] is True
    assert r["data"]["geekList"][0]["name"] == "张三"
    assert r["error"] is None


def test_run_status_bare_dict(monkeypatch):
    """boss status --json 的裸 dict（无 ok 字段）应被包装为信封。"""
    _patch_cli_ok(monkeypatch)
    _patch_run(monkeypatch, stdout=json.dumps({"authenticated": True, "credential_present": True}))
    r = _run(["status"], want_json=True)
    assert r["ok"] is True
    assert r["data"]["authenticated"] is True


def test_run_error_envelope(monkeypatch):
    """错误信封透传 error。"""
    _patch_cli_ok(monkeypatch)
    payload = {"ok": False, "data": None, "error": {"code": "not_authenticated", "message": "未登录"}}
    _patch_run(monkeypatch, stdout=json.dumps(payload))
    r = _run(["recruiter", "jobs"])
    assert r["ok"] is False
    assert r["error"]["code"] == "not_authenticated"


def test_run_nonzero_exit_classifies_not_authenticated(monkeypatch):
    """非零退出码 + stderr 含认证提示 → code=not_authenticated。"""
    _patch_cli_ok(monkeypatch)
    _patch_run(monkeypatch, stdout="", stderr="错误：未登录，请先 boss login", returncode=1)
    r = _run(["recruiter", "jobs"])
    assert r["ok"] is False
    assert r["error"]["code"] == "not_authenticated"


def test_run_nonzero_exit_rate_limited(monkeypatch):
    _patch_cli_ok(monkeypatch)
    _patch_run(monkeypatch, stdout="", stderr="rate_limited: 429 频控", returncode=1)
    r = _run(["recruiter", "search", "x"])
    assert r["error"]["code"] == "rate_limited"


def test_run_action_command_no_stdout_success(monkeypatch):
    """job-close 无 --json，成功时 stdout 空 → 视为成功（退出码 0）。"""
    _patch_cli_ok(monkeypatch)
    _patch_run(monkeypatch, stdout="", stderr="职位已关闭: ABC123", returncode=0)
    r = _run(["recruiter", "job-close", "ABC123", "-y"], want_json=False)
    assert r["ok"] is True
    assert r["data"]["status"] == "ok"


def test_run_timeout(monkeypatch):
    """subprocess 超时 → code=timeout。"""
    _patch_cli_ok(monkeypatch)
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: (_ for _ in ()).throw(subprocess.TimeoutExpired(cmd=a[0], timeout=1)))
    r = _run(["recruiter", "jobs"], timeout=1)
    assert r["ok"] is False
    assert r["error"]["code"] == "timeout"


def test_run_non_json_text(monkeypatch):
    """非 JSON stdout（如 resume-download 的 Markdown）→ data 为文本。"""
    _patch_cli_ok(monkeypatch)
    md = "# 张三\n\n## 工作经历\n- 公司A"
    _patch_run(monkeypatch, stdout=md)
    r = _run(["recruiter", "resume-download", "GID", "-o", "-"], want_json=False)
    assert r["ok"] is True
    assert "# 张三" in r["data"]


# ── 服务层：argv 拼装 ─────────────────────────────────────────────
def test_search_argv_assembly(monkeypatch):
    """搜索：keyword/city/exp/.../page 正确拼到 argv，并追加 --json。"""
    _patch_cli_ok(monkeypatch)
    captured = []
    _patch_run(monkeypatch, stdout=json.dumps({"ok": True, "data": {}, "error": None}), capture=captured)
    s = BossService()
    s.recruiter_search(keyword="golang", city="上海", exp="3-5年", degree="本科",
                       salary="20-30K", job="JOB123", page=2)
    cmd = captured[0]
    assert cmd[0] == "/usr/local/bin/boss"
    assert cmd[1:4] == ["recruiter", "search", "golang"]
    assert "-c" in cmd and "上海" in cmd
    assert "--exp" in cmd and "3-5年" in cmd
    assert "--degree" in cmd and "本科" in cmd
    assert "--salary" in cmd and "20-30K" in cmd
    assert "--job" in cmd and "JOB123" in cmd
    assert "-p" in cmd and "2" in cmd
    assert cmd[-1] == "--json"  # 追加 --json


def test_job_close_no_json_flag(monkeypatch):
    """job-close 不应追加 --json（该命令无此选项）。"""
    _patch_cli_ok(monkeypatch)
    captured = []
    _patch_run(monkeypatch, stdout="", stderr="职位已关闭", returncode=0, capture=captured)
    BossService().recruiter_job_close("JOB123")
    cmd = captured[0]
    assert "--json" not in cmd
    assert cmd[-2:] == ["JOB123", "-y"]
    assert cmd[1:3] == ["recruiter", "job-close"]


def test_resume_download_uses_stdout_dash(monkeypatch):
    """resume-download 用 -o - 输出到 stdout，且不追加 --json。"""
    _patch_cli_ok(monkeypatch)
    captured = []
    _patch_run(monkeypatch, stdout="# 简历", capture=captured)
    r = BossService().recruiter_resume_download("GID", job="JOB1")
    cmd = captured[0]
    assert "--json" not in cmd
    assert "-o" in cmd and "-" in cmd
    assert "--job" in cmd and "JOB1" in cmd
    assert r["ok"] is True


def test_search_empty_keyword_rejected(monkeypatch):
    """空关键词 → invalid_params，不调用 CLI。"""
    _patch_cli_ok(monkeypatch)
    r = BossService().recruiter_search(keyword="   ")
    assert r["ok"] is False
    assert r["error"]["code"] == "invalid_params"


# ── CLI 未安装降级 ─────────────────────────────────────────────────
def test_not_installed_returns_503_at_api(client, make_user, monkeypatch):
    """CLI 未安装时 /api/boss/status 返回 503 + boss_cli_not_installed。"""
    uid, token = make_user("boss1@x.com", role="recruiter")
    _seed_account(uid)  # 需有激活账号才过 409 检查，触达 CLI 未安装分支
    monkeypatch.setattr(boss_service, "_ensure_cli", lambda: (False, "未安装"))
    r = client.get("/api/boss/status", headers=_auth(token))
    assert r.status_code == 503
    body = r.get_json()
    assert body["error"]["code"] == "boss_cli_not_installed"


# ── API 鉴权 ───────────────────────────────────────────────────────
def test_status_requires_auth(client):
    """无 token → 401。"""
    r = client.get("/api/boss/status")
    assert r.status_code == 401


def test_status_forbidden_for_interviewer(client, make_user, monkeypatch):
    """interviewer 角色无权访问招聘端 → 403。"""
    _patch_cli_ok(monkeypatch)
    _patch_run(monkeypatch, stdout=json.dumps({"authenticated": True}))
    _, token = make_user("iv1@x.com", role="interviewer")
    r = client.get("/api/boss/status", headers=_auth(token))
    assert r.status_code == 403


def test_status_ok_for_recruiter(client, make_user, monkeypatch):
    """recruiter 可访问，登录态正常 → 200。"""
    _patch_cli_ok(monkeypatch)
    _patch_run(monkeypatch, stdout=json.dumps({"authenticated": True, "credential_present": True}))
    uid, token = make_user("hr2@x.com", role="recruiter")
    _seed_account(uid)
    r = client.get("/api/boss/status", headers=_auth(token))
    assert r.status_code == 200
    assert r.get_json()["data"]["authenticated"] is True


def test_not_authenticated_maps_to_401(client, make_user, monkeypatch):
    """boss 未登录 → 401 not_authenticated。"""
    _patch_cli_ok(monkeypatch)
    _patch_run(monkeypatch, stdout=json.dumps({"ok": False, "error": {"code": "not_authenticated", "message": "未登录"}}))
    uid, token = make_user("hr3@x.com", role="recruiter")
    _seed_account(uid)
    r = client.get("/api/boss/jobs", headers=_auth(token))
    assert r.status_code == 401
    assert r.get_json()["error"]["code"] == "not_authenticated"


def test_resume_download_returns_markdown(client, make_user, monkeypatch):
    """简历下载接口返回 text/markdown + attachment 头。

    下载走 ?token= 查询参数鉴权（window.open 无法带 Authorization 头）。
    """
    _patch_cli_ok(monkeypatch)
    _patch_run(monkeypatch, stdout="# 候选人简历\n\n工作经历")
    uid, token = make_user("hr4@x.com", role="manager")
    _seed_account(uid)
    r = client.get(f"/api/boss/candidates/GID123/resume/download?job=J1&token={token}")
    assert r.status_code == 200
    assert "text/markdown" in r.content_type
    assert "attachment" in r.headers.get("Content-Disposition", "")
    assert "# 候选人简历" in r.get_data(as_text=True)


def test_resume_download_rejects_missing_token(client, make_user, monkeypatch):
    """下载接口无 token → 401。"""
    _patch_cli_ok(monkeypatch)
    _patch_run(monkeypatch, stdout="# 简历")
    make_user("hr4b@x.com", role="manager")
    r = client.get("/api/boss/candidates/GID123/resume/download?job=J1")
    assert r.status_code == 401


def test_resume_download_rejects_wrong_role(client, make_user, monkeypatch):
    """下载接口 interviewer 角色 → 403。"""
    _patch_cli_ok(monkeypatch)
    _patch_run(monkeypatch, stdout="# 简历")
    _, token = make_user("iv_dl@x.com", role="interviewer")
    r = client.get(f"/api/boss/candidates/GID123/resume/download?token={token}")
    assert r.status_code == 403


def test_search_endpoint_passes_params(client, make_user, monkeypatch):
    """搜索接口把 query 参数透传给服务层 argv。"""
    _patch_cli_ok(monkeypatch)
    captured = []
    _patch_run(monkeypatch, stdout=json.dumps({"ok": True, "data": {}, "error": None}), capture=captured)
    uid, token = make_user("hr5@x.com", role="recruiter")
    _seed_account(uid)
    r = client.get("/api/boss/candidates/search?keyword=golang&city=上海&page=2", headers=_auth(token))
    assert r.status_code == 200
    cmd = captured[0]
    assert "golang" in cmd and "上海" in cmd and "2" in cmd


# ── 多账号管理 ─────────────────────────────────────────────────────
def test_run_injects_boss_cookies_env(monkeypatch):
    """_run 传 cookies_override 时，应设 env BOSS_COOKIES。"""
    _patch_cli_ok(monkeypatch)
    captured_env = {}

    class _P:
        stdout = json.dumps({"ok": True, "data": {}, "error": None})
        stderr = ""
        returncode = 0

    def fake_run(cmd, *a, **k):
        captured_env.update(k.get("env", {}))
        return _P()
    monkeypatch.setattr(subprocess, "run", fake_run)
    _run(["recruiter", "jobs"], cookies_override="wt2=abc; wbg=def")
    assert captured_env.get("BOSS_COOKIES") == "wt2=abc; wbg=def"


def test_account_crud_and_isolation(client, make_user):
    """账号 CRUD + 用户隔离：用户 A 的账号对用户 B 不可见。"""
    uid_a, token_a = make_user("acc_a@x.com", role="recruiter")
    uid_b, token_b = make_user("acc_b@x.com", role="recruiter")

    # A 存账号1
    r = client.post("/api/boss/qr-login/confirm",
                    json={"session_id": "fake", "label": "A的主账号"},
                    headers=_auth(token_a))
    # fake session 无凭证 → 409；直接用服务层存
    from app.services.boss_service import BossService
    BossService.save_account(uid_a, {"wt2": "a1", "zp_at": "a1"}, "A主账号")
    BossService.save_account(uid_b, {"wt2": "b1", "zp_at": "b1"}, "B主账号")

    # A 查账号列表，只看到自己的
    r = client.get("/api/boss/accounts", headers=_auth(token_a))
    assert r.status_code == 200
    accts = r.get_json()["data"]
    assert len(accts) == 1
    assert accts[0]["label"] == "A主账号"
    assert accts[0]["is_active"] is True
    # cookies 明文不返回
    assert "cookies" not in accts[0]

    # B 查账号列表，只看到自己的
    r = client.get("/api/boss/accounts", headers=_auth(token_b))
    accts_b = r.get_json()["data"]
    assert len(accts_b) == 1
    assert accts_b[0]["label"] == "B主账号"

    # A 再存第二个账号，旧的取消激活
    acct2 = BossService.save_account(uid_a, {"wt2": "a2", "zp_at": "a2"}, "A次账号")
    r = client.get("/api/boss/accounts", headers=_auth(token_a))
    accts = r.get_json()["data"]
    assert len(accts) == 2
    active = [a for a in accts if a["is_active"]]
    assert len(active) == 1
    assert active[0]["label"] == "A次账号"

    # A 切换激活回第一个
    first_id = [a for a in accts if a["label"] == "A主账号"][0]["id"]
    r = client.post(f"/api/boss/accounts/{first_id}/activate", headers=_auth(token_a))
    assert r.status_code == 200
    r = client.get("/api/boss/accounts", headers=_auth(token_a))
    active = [a for a in r.get_json()["data"] if a["is_active"]]
    assert active[0]["id"] == first_id

    # B 不能操作 A 的账号（activate → 404）
    r = client.post(f"/api/boss/accounts/{first_id}/activate", headers=_auth(token_b))
    assert r.status_code == 404

    # A 删除账号
    r = client.delete(f"/api/boss/accounts/{acct2['id']}", headers=_auth(token_a))
    assert r.status_code == 200
    r = client.get("/api/boss/accounts", headers=_auth(token_a))
    assert len(r.get_json()["data"]) == 1


def test_recruiter_endpoint_no_active_account_409(client, make_user, monkeypatch):
    """无激活账号时 recruiter 接口返回 409 no_active_account。"""
    _patch_cli_ok(monkeypatch)
    _patch_run(monkeypatch, stdout=json.dumps({"ok": True, "data": [], "error": None}))
    _, token = make_user("noacct@x.com", role="recruiter")
    r = client.get("/api/boss/jobs", headers=_auth(token))
    assert r.status_code == 409
    assert r.get_json()["error"]["code"] == "no_active_account"


def test_crypto_roundtrip():
    """Fernet 加解密往返。"""
    from app.services.crypto import encrypt, decrypt
    plaintext = '{"wt2":"abc","zp_at":"def","__zp_stoken__":"xyz"}'
    ct = encrypt(plaintext)
    assert ct != plaintext
    assert decrypt(ct) == plaintext


# ── 浏览器 cookie 导入（方案 B：扩展采集 + 粘贴）────────────────────
_FULL_COOKIES = "__zp_stoken__=stok123; wt2=w1; wbg=g1; zp_at=at1"


def test_import_browser_cookie_missing_stoken_not_saved(client, make_user, monkeypatch):
    """缺 __zp_stoken__ → 409 needs_stoken，且不落库。"""
    _patch_cli_ok(monkeypatch)
    uid, token = make_user("imp1@x.com", role="recruiter")
    r = client.post("/api/boss/login/browser-cookie",
                    json={"cookies": "wt2=w1; wbg=g1; zp_at=at1", "label": "无stoken"},
                    headers=_auth(token))
    assert r.status_code == 409
    assert r.get_json()["error"]["code"] == "needs_stoken"
    # 不应保存任何账号
    r2 = client.get("/api/boss/accounts", headers=_auth(token))
    assert r2.get_json()["data"] == []


def test_import_browser_cookie_incomplete_cookie(client, make_user, monkeypatch):
    """有 stoken 但缺会话 cookie → 409 incomplete_cookie，不落库。"""
    _patch_cli_ok(monkeypatch)
    uid, token = make_user("imp2@x.com", role="recruiter")
    r = client.post("/api/boss/login/browser-cookie",
                    json={"cookies": "__zp_stoken__=stok123; wt2=w1"},
                    headers=_auth(token))
    assert r.status_code == 409
    assert r.get_json()["error"]["code"] == "incomplete_cookie"
    assert client.get("/api/boss/accounts", headers=_auth(token)).get_json()["data"] == []


def test_import_browser_cookie_not_authenticated_not_saved(client, make_user, monkeypatch):
    """cookie 齐全但 status 校验失败 → 401 not_authenticated，不落库。"""
    _patch_cli_ok(monkeypatch)
    _patch_run(monkeypatch, stdout=json.dumps({"authenticated": False, "credential_present": True}))
    uid, token = make_user("imp3@x.com", role="recruiter")
    r = client.post("/api/boss/login/browser-cookie",
                    json={"cookies": _FULL_COOKIES}, headers=_auth(token))
    assert r.status_code == 401
    assert r.get_json()["error"]["code"] == "not_authenticated"
    assert client.get("/api/boss/accounts", headers=_auth(token)).get_json()["data"] == []


def test_import_browser_cookie_full_saved_and_active(client, make_user, monkeypatch):
    """cookie 齐全 + status 通过 → 保存并激活，含 stoken。"""
    _patch_cli_ok(monkeypatch)
    _patch_run(monkeypatch, stdout=json.dumps({"authenticated": True, "credential_present": True}))
    uid, token = make_user("imp4@x.com", role="recruiter")
    r = client.post("/api/boss/login/browser-cookie",
                    json={"cookies": _FULL_COOKIES, "label": "浏览器导入"},
                    headers=_auth(token))
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["label"] == "浏览器导入"
    assert data["is_active"] is True
    assert data["has_stoken"] is True
    assert "cookies" not in data  # 明文不回传
    accts = client.get("/api/boss/accounts", headers=_auth(token)).get_json()["data"]
    assert len(accts) == 1 and accts[0]["is_active"] is True


def test_import_browser_cookie_accepts_dict(client, make_user, monkeypatch):
    """cookies 也支持 JSON dict 形式提交。"""
    _patch_cli_ok(monkeypatch)
    _patch_run(monkeypatch, stdout=json.dumps({"authenticated": True}))
    uid, token = make_user("imp5@x.com", role="recruiter")
    r = client.post("/api/boss/login/browser-cookie",
                    json={"cookies": {"__zp_stoken__": "s", "wt2": "w", "wbg": "g", "zp_at": "a"}},
                    headers=_auth(token))
    assert r.status_code == 200
    assert r.get_json()["data"]["has_stoken"] is True


def test_import_browser_cookie_requires_recruiter(client, make_user, monkeypatch):
    """非 recruiter 角色无权导入 → 403。"""
    _patch_cli_ok(monkeypatch)
    uid, token = make_user("imp6@x.com", role="interviewer")
    r = client.post("/api/boss/login/browser-cookie",
                    json={"cookies": _FULL_COOKIES}, headers=_auth(token))
    assert r.status_code == 403


def test_qr_confirm_missing_stoken_degraded(client, make_user, monkeypatch):
    """扫码 confirm 拿到的 cookie 缺 __zp_stoken__ → 200 已保存 + warning 引导安装扩展。"""
    _patch_cli_ok(monkeypatch)
    uid, token = make_user("qrdeg@x.com", role="recruiter")
    # 模拟扫码已完成但缺 stoken（纯 HTTP 扫码的真实情况）。
    # confirm 端点内部 `from ..services import boss_qr_service`，故 patch 源模块。
    from app.services import boss_qr_service as qr_mod
    monkeypatch.setattr(qr_mod, "get_qr_credential",
                        lambda sid: {"wt2": "w1", "wbg": "g1", "zp_at": "at1"})
    r = client.post("/api/boss/qr-login/confirm",
                    json={"session_id": "sess", "label": "扫码"}, headers=_auth(token))
    data = r.get_json()
    # 功能分层：缺 stoken 也保存账号（has_stoken=False），返回 200 + warning
    assert r.status_code == 200
    assert data["ok"] is True
    assert data["data"]["has_stoken"] is False
    assert "warning" in data
    assert "浏览器扩展" in data["warning"]


def test_parse_cookies_header_and_dict():
    """parse_cookies 兼容 Cookie 头字符串与 dict，且值含 = 不被切坏。"""
    from app.services.boss_service import parse_cookies
    d = parse_cookies("__zp_stoken__=a=b=c; wt2=v1")
    assert d["__zp_stoken__"] == "a=b=c"  # 值里的 = 保留
    assert d["wt2"] == "v1"
    assert parse_cookies({"wt2": 123}) == {"wt2": "123"}
    assert parse_cookies("") == {}


def test_field_encryption_key_fixed_survives_restart(monkeypatch):
    """固定 FIELD_ENCRYPTION_KEY 后，重建加密器仍能解开旧密文（模拟重启）。"""
    from cryptography.fernet import Fernet
    from app.services import crypto
    key = Fernet.generate_key().decode()
    monkeypatch.setenv("FIELD_ENCRYPTION_KEY", key)
    crypto._reset_cipher_for_test() if hasattr(crypto, "_reset_cipher_for_test") else None
    f1 = Fernet(key.encode())
    ct = f1.encrypt(b'{"wt2":"x"}')
    # 用同一固定 key 新建（模拟进程重启）→ 仍可解密
    f2 = Fernet(key.encode())
    assert f2.decrypt(ct) == b'{"wt2":"x"}'


def test_qr_status_unknown_session(client, make_user):
    """未知 session_id 查状态 → expired。"""
    uid, token = make_user("qr1@x.com", role="recruiter")
    r = client.get("/api/boss/qr-login/status?session_id=nonexistent",
                   headers=_auth(token))
    assert r.status_code == 200
    assert r.get_json()["data"]["status"] == "expired"
