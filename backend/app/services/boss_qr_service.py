# -*- coding: utf-8 -*-
"""BOSS 直聘网页扫码登录会话池。

boss-cli 的 QR 登录函数（_get_qr_session/_wait_for_scan/_wait_for_confirm/
_dispatch_login）是 async，且 _dispatch_login 依赖同一个 httpx.AsyncClient 上累积
的 cookies。本模块用进程内字典按 session_id 保持会话，后台线程跑完整异步流程：
拿码 → 轮询扫码 → 轮询确认 → 派发拿 cookies → Camoufox 补 __zp_stoken__。

前端三次请求：start（拿二维码图）→ 轮询 status → confirm（存账号）。

纯 HTTP 扫码只能拿到会话 cookie（wt2/wbg/zp_at），拿不到页面 JS 生成的
__zp_stoken__，导致 search/简历/打招呼等接口被 code=37「环境异常」拦截。
因此 _dispatch_login 拿到会话 cookie 后，调用 boss_cli.browser_login.
_hydrate_stoken_via_browser 用 Camoufox 无头浏览器补全 stoken。Camoufox 在
BOSS 反爬前并非 100% 成功；补全失败时 stoken 仍缺，confirm 会返回 409
needs_stoken 引导用户改用浏览器扩展采集完整 Cookie。
"""
from __future__ import annotations

import asyncio
import base64
import logging
import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# 会话状态
STATUS_PENDING = "pending"        # 已出码，等待扫码
STATUS_SCANNED = "scanned"        # 已扫码，等待手机确认
STATUS_STOKEN = "stoken"          # 已拿到会话 cookie，正在用 Camoufox 补 stoken
STATUS_DONE = "done"             # 登录成功，credential 就绪（含 stoken）
STATUS_EXPIRED = "expired"       # 二维码过期/超时
STATUS_FAILED = "failed"         # 异常

_SESSION_TTL = 300  # 会话保留 5 分钟后清理
_SCAN_MAX_RETRIES = 6   # 扫码轮询次数（每次 long-poll ~35s，约 3.5min）
_CONFIRM_MAX_RETRIES = 6

# 是否启用 Camoufox 补全 __zp_stoken__。Camoufox 依赖较重、BOSS 反爬前
# 并非 100% 成功，且启动缓慢可能阻塞扫码流程。
# 默认关闭（0）—— 采用功能分层策略：扫码成功即保存账号（has_stoken=False），
# Tier-1 功能立即可用；Tier-2 功能由 Chrome 扩展补全 Cookie 解锁。
# 设为 1 可重新启用 Camoufox 自动补全（需安装 kabi-boss-cli[browser]）。
_STOKEN_HYDRATE_ENABLED = os.getenv("BOSS_QR_STOKEN_HYDRATE", "0") not in ("0", "false", "False")


@dataclass
class _QrSession:
    session_id: str
    qr_id: str = ""
    qr_image_b64: str = ""        # base64 图片，供前端 <img> 渲染
    qr_image_mime: str = "image/png"  # 图片 MIME（BOSS 服务器实际返回 JPEG）
    status: str = STATUS_PENDING
    error: str = ""
    credential_cookies: Optional[dict] = None  # 登录成功后的 cookies
    has_stoken: bool = False      # __zp_stoken__ 是否已补全
    stoken_hydrate_skipped: bool = False  # Camoufox 不可用而跳过补全
    created_at: float = field(default_factory=time.time)


# 进程内会话池（session_id -> _QrSession）
_SESSIONS: dict[str, _QrSession] = {}
_LOCK = threading.Lock()


def _cleanup_expired() -> None:
    """清理过期会话（加锁）。"""
    now = time.time()
    expired = [sid for sid, s in _SESSIONS.items() if now - s.created_at > _SESSION_TTL]
    for sid in expired:
        _SESSIONS.pop(sid, None)


async def _async_qr_flow(session: _QrSession) -> None:
    """完整异步 QR 登录流程，在后台线程的独立 event loop 内运行。

    复用 boss-cli 的 _get_qr_session/_wait_for_scan/_wait_for_confirm/_dispatch_login，
    但 client 在本协程内创建并全程复用（保证 cookies 跨步骤累积）。
    """
    # 延迟导入：boss-cli 可能未安装，调用方已在更上层做 _ensure_cli 校验
    from boss_cli.auth import (
        _get_qr_session, _wait_for_scan, _wait_for_confirm, _dispatch_login,
    )
    from boss_cli.constants import BASE_URL, HEADERS

    async with httpx.AsyncClient(
        base_url=BASE_URL,
        headers=HEADERS,
        follow_redirects=True,
        timeout=httpx.Timeout(30, read=40),
    ) as client:
        qr_id = session.qr_id  # start_qr_login 已预先拿到
        # 步骤3：轮询扫码
        scanned = False
        for _ in range(_SCAN_MAX_RETRIES):
            if session.status == STATUS_EXPIRED:
                return
            scanned = await _wait_for_scan(client, qr_id)
            if scanned:
                break
        if not scanned:
            session.status = STATUS_EXPIRED
            session.error = "二维码已过期，请重新扫码"
            return
        session.status = STATUS_SCANNED

        # 步骤4：轮询确认
        confirmed = False
        for _ in range(_CONFIRM_MAX_RETRIES):
            if session.status == STATUS_EXPIRED:
                return
            confirmed = await _wait_for_confirm(client, qr_id)
            if confirmed:
                break
        if not confirmed:
            session.status = STATUS_EXPIRED
            session.error = "确认超时，请重新扫码"
            return

        # 步骤5：派发拿会话 cookies
        try:
            credential = await _dispatch_login(client, qr_id)
            session.credential_cookies = credential.cookies
        except Exception as e:
            logger.exception("QR dispatch_login 失败")
            session.status = STATUS_FAILED
            session.error = f"获取登录凭证失败：{e}"
            return

        # 步骤6：用 Camoufox 补全 __zp_stoken__（纯 HTTP 扫码拿不到这个 token，
        # 没有 stoken 时 search/简历/打招呼会被 code=37 拦截）。
        cookies = session.credential_cookies or {}
        if "__zp_stoken__" in cookies:
            session.has_stoken = True
            session.status = STATUS_DONE
            return

        if not _STOKEN_HYDRATE_ENABLED:
            logger.info("Camoufox stoken 补全已关闭(BOSS_QR_STOKEN_HYDRATE=0)，跳过")
            session.stoken_hydrate_skipped = True
            session.status = STATUS_DONE
            return

        session.status = STATUS_STOKEN
        try:
            enriched = await _hydrate_stoken(cookies)
        except Exception as e:
            # Camoufox 未安装/内核缺失等：不视为登录失败，仍保存会话 cookie，
            # 由 confirm 端点决定是否降级（默认 needs_stoken 引导浏览器扩展）。
            logger.warning("Camoufox stoken 补全异常：%s", e)
            session.stoken_hydrate_skipped = True
            session.status = STATUS_DONE
            return

        if "__zp_stoken__" in enriched:
            # 浏览器返回的是完整 cookie 集（含原有会话 cookie），合并后覆盖
            session.credential_cookies = {**cookies, **enriched}
            session.has_stoken = True
        else:
            logger.warning("Camoufox 未能生成 __zp_stoken__（BOSS 反爬检测）")
        session.status = STATUS_DONE


def _poll_thread(session: _QrSession) -> None:
    """后台线程入口：在独立 event loop 内跑完整异步流程。"""
    try:
        asyncio.run(_async_qr_flow(session))
    except Exception as e:
        logger.exception("QR 登录后台流程异常")
        session.status = STATUS_FAILED
        session.error = f"登录流程异常：{e}"


async def _hydrate_stoken(cookies: dict) -> dict:
    """用 Camoufox 无头浏览器为会话 cookie 补全 __zp_stoken__。

    boss_cli.browser_login._hydrate_stoken_via_browser 是同步实现（内部用
    camoufox.sync_api 启动真实浏览器并执行页面 JS），不能直接在 event loop 里
    调用，否则会阻塞整个 loop。通过 asyncio.to_thread 丢到线程池执行。
    返回浏览器导出的完整 cookie dict（可能含、也可能不含 __zp_stoken__）。
    """
    from boss_cli.browser_login import _hydrate_stoken_via_browser
    # 检查 Camoufox 运行时是否就绪，未就绪时抛 BrowserLoginUnavailable，
    # 由调用方捕获后降级（避免在 loop 里启动半截浏览器再失败）。
    _ensure_camoufox_ready_or_raise()
    return await asyncio.to_thread(_hydrate_stoken_via_browser, cookies)


def _ensure_camoufox_ready_or_raise() -> None:
    """校验 Camoufox 包与浏览器内核可用，不可用抛 BrowserLoginUnavailable。"""
    from boss_cli.browser_login import _ensure_camoufox_ready
    _ensure_camoufox_ready()


def start_qr_login() -> tuple[str, str, str]:
    """发起扫码登录，返回 (session_id, qr_image_base64, qr_image_mime)。

    同步完成：拿 QR session + 拿二维码图片，存入会话池，启动后台轮询线程。
    失败抛 RuntimeError（调用方返回 502/503）。
    """
    _cleanup_expired()
    # 延迟导入
    from boss_cli.auth import _get_qr_session
    from boss_cli.constants import BASE_URL, HEADERS, QR_CODE_URL

    session = _QrSession(session_id=uuid.uuid4().hex)

    async def _init():
        async with httpx.AsyncClient(
            base_url=BASE_URL, headers=HEADERS, follow_redirects=True,
            timeout=httpx.Timeout(30, read=40),
        ) as client:
            # 步骤1：拿 QR session（qrId/randKey/secretKey）
            data = await _get_qr_session(client)
            qr_id = data["qrId"]
            # 步骤2：拿二维码图片（BOSS 服务器实际返回 JPEG）
            img_resp = await client.get(QR_CODE_URL, params={"content": qr_id})
            img_resp.raise_for_status()
            return qr_id, img_resp.content, img_resp.headers.get("content-type", "")

    try:
        qr_id, img_bytes, content_type = asyncio.run(_init())
    except Exception as e:
        logger.exception("QR 登录初始化失败")
        raise RuntimeError(f"获取二维码失败：{e}") from e

    # 识别真实 MIME（BOSS 服务器返回 JPEG，但文档/变量名误导性写 PNG）
    mime = "image/png"
    if content_type and content_type.startswith("image/"):
        mime = content_type.split(";")[0].strip()
    elif img_bytes[:3] == b"\xff\xd8\xff":
        mime = "image/jpeg"

    session.qr_id = qr_id
    session.qr_image_b64 = base64.b64encode(img_bytes).decode("ascii")
    session.qr_image_mime = mime

    with _LOCK:
        _SESSIONS[session.session_id] = session

    # 启动后台 daemon 线程跑扫码轮询（daemon=True 随进程退出）
    t = threading.Thread(target=_poll_thread, args=(session,), daemon=True)
    t.start()

    return session.session_id, session.qr_image_b64, session.qr_image_mime


def get_qr_status(session_id: str) -> dict:
    """查询扫码状态（前端 2s 轮询）。"""
    with _LOCK:
        session = _SESSIONS.get(session_id)
    if not session:
        return {"status": STATUS_EXPIRED, "error": "会话不存在或已过期"}
    return {
        "status": session.status,
        "error": session.error,
        "has_stoken": session.has_stoken,
        "stoken_skipped": session.stoken_hydrate_skipped,
    }


def get_qr_credential(session_id: str) -> Optional[dict]:
    """登录成功后取出 cookies dict。未完成返回 None。"""
    with _LOCK:
        session = _SESSIONS.get(session_id)
    if not session or session.status != STATUS_DONE:
        return None
    return session.credential_cookies
