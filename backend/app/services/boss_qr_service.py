# -*- coding: utf-8 -*-
"""BOSS 直聘网页扫码登录会话池。

boss-cli 的 QR 登录函数（_get_qr_session/_wait_for_scan/_wait_for_confirm/
_dispatch_login）是 async，且 _dispatch_login 依赖同一个 httpx.AsyncClient 上累积
的 cookies。本模块用进程内字典按 session_id 保持会话，后台线程跑完整异步流程：
拿码 → 轮询扫码 → 轮询确认 → 派发拿 cookies。

前端三次请求：start（拿二维码图）→ 轮询 status → confirm（存账号）。

纯 HTTP 扫码拿到会话 cookie（wt2/wbg/zp_at），即可使用本系统保留的全部招聘端
功能（收件箱、推荐、查看/下载简历、批量导入、AI 初筛）。这些功能不依赖页面 JS
生成的 __zp_stoken__，扫码成功即全功能可用，无需浏览器扩展或 Camoufox 补全。
"""
from __future__ import annotations

import asyncio
import base64
import logging
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
STATUS_DONE = "done"             # 登录成功，credential 就绪
STATUS_EXPIRED = "expired"       # 二维码过期/超时
STATUS_FAILED = "failed"         # 异常

_SESSION_TTL = 300  # 会话保留 5 分钟后清理
_SCAN_MAX_RETRIES = 6   # 扫码轮询次数（每次 long-poll ~35s，约 3.5min）
_CONFIRM_MAX_RETRIES = 6


@dataclass
class _QrSession:
    session_id: str
    qr_id: str = ""
    qr_image_b64: str = ""        # base64 图片，供前端 <img> 渲染
    qr_image_mime: str = "image/png"  # 图片 MIME（BOSS 服务器实际返回 JPEG）
    status: str = STATUS_PENDING
    error: str = ""
    credential_cookies: Optional[dict] = None  # 登录成功后的 cookies
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
        _wait_for_scan, _wait_for_confirm, _dispatch_login,
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

        # 步骤5：派发拿会话 cookies（wt2/wbg/zp_at），即登录完成
        try:
            credential = await _dispatch_login(client, qr_id)
            session.credential_cookies = credential.cookies
        except Exception as e:
            logger.exception("QR dispatch_login 失败")
            session.status = STATUS_FAILED
            session.error = f"获取登录凭证失败：{e}"
            return

        session.status = STATUS_DONE


def _poll_thread(session: _QrSession) -> None:
    """后台线程入口：在独立 event loop 内跑完整异步流程。"""
    try:
        asyncio.run(_async_qr_flow(session))
    except Exception as e:
        logger.exception("QR 登录后台流程异常")
        session.status = STATUS_FAILED
        session.error = f"登录流程异常：{e}"


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
    }


def get_qr_credential(session_id: str) -> Optional[dict]:
    """登录成功后取出 cookies dict。未完成返回 None。"""
    with _LOCK:
        session = _SESSIONS.get(session_id)
    if not session or session.status != STATUS_DONE:
        return None
    return session.credential_cookies
