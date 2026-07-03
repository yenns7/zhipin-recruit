# -*- coding: utf-8 -*-
"""boss_qr_service 扫码登录会话池测试。

当前产品约束：扫码登录只获取 wt2/wbg/zp_at 等会话 cookie；系统已移除
Camoufox / __zp_stoken__ 补全链路，依赖 stoken 的 BOSS 写操作不再暴露。

不依赖真实 BOSS，全部用 monkeypatch 替换 boss-cli 异步函数。
"""

import pytest

from app.services import boss_qr_service as qr_mod
from app.services.boss_qr_service import (
    _QrSession, STATUS_SCANNED, STATUS_DONE, STATUS_EXPIRED, STATUS_FAILED,
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


def test_dispatch_success_marks_done_with_session_cookies(monkeypatch):
    """派发拿到会话 cookie 后直接 DONE，不进入 stoken 补全状态。"""
    _patch_async_flow(
        monkeypatch,
        dispatch_cookies={"wt2": "w1", "wbg": "g1", "zp_at": "at1"},
    )

    s = _fresh_session()
    _run_flow(s)

    assert s.status == STATUS_DONE
    assert s.credential_cookies == {"wt2": "w1", "wbg": "g1", "zp_at": "at1"}


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


def test_get_qr_status_exposes_current_state_only():
    """get_qr_status 只返回当前扫码状态和错误信息。"""
    s = _fresh_session()
    s.status = STATUS_DONE
    with qr_mod._LOCK:
        qr_mod._SESSIONS[s.session_id] = s
    try:
        st = qr_mod.get_qr_status(s.session_id)
        assert st["status"] == STATUS_DONE
        assert st["error"] == ""
        assert "has_stoken" not in st
        assert "stoken_skipped" not in st
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
        s.credential_cookies = {"wt2": "x", "wbg": "y", "zp_at": "z"}
        assert qr_mod.get_qr_credential(s.session_id) == {"wt2": "x", "wbg": "y", "zp_at": "z"}
    finally:
        with qr_mod._LOCK:
            qr_mod._SESSIONS.pop(s.session_id, None)
