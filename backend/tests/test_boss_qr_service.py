# -*- coding: utf-8 -*-
"""boss_qr_service 扫码登录会话池测试。

重点验证 Camoufox 补全 __zp_stoken__ 的状态机：
  - 派发拿到会话 cookie 后，若无 stoken 则进入 STATUS_STOKEN 再补全
  - Camoufox 补出 stoken → STATUS_DONE + has_stoken=True，cookies 被合并
  - Camoufox 未补出 stoken → STATUS_DONE + has_stoken=False（由 confirm 决定降级）
  - Camoufox 运行时缺失抛异常 → STATUS_DONE + stoken_hydrate_skipped
  - BOSS_QR_STOKEN_HYDRATE=0 → 跳过补全，stoken_hydrate_skipped=True
  - 派发本身就带 stoken → 直接 STATUS_DONE，不启动 Camoufox

不依赖真实 BOSS / camoufox，全部用 monkeypatch 替换 boss-cli 异步函数与 hydrate。
"""
import asyncio

import pytest

from app.services import boss_qr_service as qr_mod
from app.services.boss_qr_service import (
    _QrSession, STATUS_PENDING, STATUS_SCANNED, STATUS_STOKEN,
    STATUS_DONE, STATUS_EXPIRED, STATUS_FAILED,
)


# ── 测试辅助 ───────────────────────────────────────────────────────
class _FakeCredential:
    """模拟 boss_cli.auth.Credential：只暴露 .cookies。"""
    def __init__(self, cookies):
        self.cookies = cookies


def _patch_async_flow(monkeypatch, *, scan=True, confirm=True, dispatch_cookies=None):
    """把 boss-cli 的四个异步函数替换为受控假实现。

    dispatch_cookies: _dispatch_login 返回的 credential.cookies（None=抛异常）。
    """
    async def _get_qr_session(client):
        return {"qrId": "qid-1"}

    async def _wait_for_scan(client, qr_id):
        return scan

    async def _wait_for_confirm(client, qr_id):
        return confirm

    async def _dispatch_login(client, qr_id):
        if dispatch_cookies is None:
            raise RuntimeError("dispatch failed")
        return _FakeCredential(dispatch_cookies)

    # 这些 import 在 _async_qr_flow 内部执行（from boss_cli.auth import ...），
    # 直接 patch boss_cli.auth 模块的符号即可影响内部导入结果。
    import boss_cli.auth as auth_mod
    monkeypatch.setattr(auth_mod, "_get_qr_session", _get_qr_session)
    monkeypatch.setattr(auth_mod, "_wait_for_scan", _wait_for_scan)
    monkeypatch.setattr(auth_mod, "_wait_for_confirm", _wait_for_confirm)
    monkeypatch.setattr(auth_mod, "_dispatch_login", _dispatch_login)


def _run_flow(session):
    """同步执行后台流程（_poll_thread 用 asyncio.run 包了一层，这里直接复用）。"""
    qr_mod._poll_thread(session)


def _fresh_session():
    s = _QrSession(session_id="s1")
    s.qr_id = "qid-1"
    return s


# ── 状态机测试 ──────────────────────────────────────────────────────
def test_hydrate_success_merges_stoken(monkeypatch):
    """派发拿到无 stoken 的会话 cookie → Camoufox 补出 stoken → 合并并 DONE。"""
    monkeypatch.setattr(qr_mod, "_STOKEN_HYDRATE_ENABLED", True)
    _patch_async_flow(
        monkeypatch,
        dispatch_cookies={"wt2": "w1", "wbg": "g1", "zp_at": "at1"},
    )
    # Camoufox 返回完整 cookie 集（含 stoken）
    monkeypatch.setattr(qr_mod, "_hydrate_stoken",
                        lambda cookies: asyncio.sleep(0, result={"__zp_stoken__": "stok-xyz", "wt2": "w1"}))

    s = _fresh_session()
    _run_flow(s)

    assert s.status == STATUS_DONE
    assert s.has_stoken is True
    assert s.credential_cookies["__zp_stoken__"] == "stok-xyz"
    assert s.credential_cookies["wt2"] == "w1"


def test_hydrate_fail_no_stoken(monkeypatch):
    """Camoufox 未能生成 stoken（反爬拒绝）→ DONE 但 has_stoken=False。"""
    monkeypatch.setattr(qr_mod, "_STOKEN_HYDRATE_ENABLED", True)
    _patch_async_flow(
        monkeypatch,
        dispatch_cookies={"wt2": "w1", "zp_at": "at1"},
    )
    # Camoufox 返回的 cookie 集不含 stoken
    monkeypatch.setattr(qr_mod, "_hydrate_stoken",
                        lambda cookies: asyncio.sleep(0, result={"wt2": "w1"}))

    s = _fresh_session()
    _run_flow(s)

    assert s.status == STATUS_DONE
    assert s.has_stoken is False
    assert s.stoken_hydrate_skipped is False
    # 原会话 cookie 保留
    assert s.credential_cookies["wt2"] == "w1"


def test_hydrate_exception_skipped(monkeypatch):
    """Camoufox 运行时缺失（抛异常）→ DONE + stoken_hydrate_skipped=True。"""
    monkeypatch.setattr(qr_mod, "_STOKEN_HYDRATE_ENABLED", True)
    _patch_async_flow(
        monkeypatch,
        dispatch_cookies={"wt2": "w1", "zp_at": "at1"},
    )

    async def _boom(cookies):
        raise RuntimeError("camoufox not installed")
    monkeypatch.setattr(qr_mod, "_hydrate_stoken", _boom)

    s = _fresh_session()
    _run_flow(s)

    assert s.status == STATUS_DONE
    assert s.has_stoken is False
    assert s.stoken_hydrate_skipped is True


def test_hydrate_disabled_skips(monkeypatch):
    """BOSS_QR_STOKEN_HYDRATE=0 → 跳过 Camoufox，直接 DONE。"""
    _patch_async_flow(
        monkeypatch,
        dispatch_cookies={"wt2": "w1", "zp_at": "at1"},
    )
    monkeypatch.setattr(qr_mod, "_STOKEN_HYDRATE_ENABLED", False)
    # 即便 _hydrate_stoken 会抛错也不应被调用
    called = {"n": 0}
    async def _should_not_run(cookies):
        called["n"] += 1
        return {}
    monkeypatch.setattr(qr_mod, "_hydrate_stoken", _should_not_run)

    s = _fresh_session()
    _run_flow(s)

    assert s.status == STATUS_DONE
    assert s.has_stoken is False
    assert s.stoken_hydrate_skipped is True
    assert called["n"] == 0


def test_dispatch_already_has_stoken_skips_hydrate(monkeypatch):
    """派发返回的 cookie 已含 stoken → 直接 DONE，不进 STATUS_STOKEN。"""
    _patch_async_flow(
        monkeypatch,
        dispatch_cookies={"wt2": "w1", "zp_at": "at1", "__zp_stoken__": "pre-existing"},
    )
    called = {"n": 0}
    async def _should_not_run(cookies):
        called["n"] += 1
        return {}
    monkeypatch.setattr(qr_mod, "_hydrate_stoken", _should_not_run)

    s = _fresh_session()
    _run_flow(s)

    assert s.status == STATUS_DONE
    assert s.has_stoken is True
    assert called["n"] == 0


def test_dispatch_failure_marks_failed(monkeypatch):
    """派发抛异常 → STATUS_FAILED。"""
    _patch_async_flow(monkeypatch, dispatch_cookies=None)  # _dispatch_login 抛异常

    s = _fresh_session()
    _run_flow(s)

    assert s.status == STATUS_FAILED
    assert "获取登录凭证失败" in s.error


def test_scan_timeout_expired(monkeypatch):
    """扫码轮询始终 False → STATUS_EXPIRED。"""
    _patch_async_flow(monkeypatch, scan=False,
                      dispatch_cookies={"wt2": "w1"})
    s = _fresh_session()
    _run_flow(s)
    assert s.status == STATUS_EXPIRED


def test_get_qr_status_exposes_stoken_flags():
    """get_qr_status 返回 has_stoken / stoken_skipped 字段。"""
    s = _fresh_session()
    s.status = STATUS_DONE
    s.has_stoken = True
    with qr_mod._LOCK:
        qr_mod._SESSIONS[s.session_id] = s
    try:
        st = qr_mod.get_qr_status(s.session_id)
        assert st["status"] == STATUS_DONE
        assert st["has_stoken"] is True
        assert st["stoken_skipped"] is False
    finally:
        with qr_mod._LOCK:
            qr_mod._SESSIONS.pop(s.session_id, None)


def test_get_qr_credential_only_when_done():
    """未 DONE 时 get_qr_credential 返回 None；DONE 后返回 cookies。"""
    s = _fresh_session()
    s.status = STATUS_SCANNED
    with qr_mod._LOCK:
        qr_mod._SESSIONS[s.session_id] = s
    try:
        assert qr_mod.get_qr_credential(s.session_id) is None
        s.status = STATUS_DONE
        s.credential_cookies = {"wt2": "x", "__zp_stoken__": "y"}
        assert qr_mod.get_qr_credential(s.session_id) == {"wt2": "x", "__zp_stoken__": "y"}
    finally:
        with qr_mod._LOCK:
            qr_mod._SESSIONS.pop(s.session_id, None)
