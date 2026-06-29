# -*- coding: utf-8 -*-
"""BOSS 直聘集成 API。

封装 boss-cli（kabi-boss-cli）招聘端能力为 REST 接口，供前端 /boss 页面调用。
所有接口经 @require_auth 鉴权；招聘端操作限 recruiter/manager/admin 角色。

CLI 未安装时统一返回 503 + code=boss_cli_not_installed，前端据此引导安装/登录。
"""
from flask import Blueprint, request, jsonify, Response, current_app, g
import jwt

from ..middleware.auth import require_auth, require_role
from ..middleware.events import record_event
from ..services.boss_service import BossService
from ..services.boss_pipeline_service import BossPipelineService
from ..models import User
from .. import db

bp = Blueprint("boss", __name__)

_svc = BossService()
_pipeline = BossPipelineService(boss=_svc)

# 招聘端操作允许的角色
_RECRUITER_ROLES = ("recruiter", "manager", "admin")


def _require_query_token():
    """为 window.open 触发的下载接口做 query-token 鉴权（require_auth 仅支持 header）。

    成功 → 设置 g.user_id/g.role 并返回 None；失败 → 返回 (jsonify, status)。
    """
    token = request.args.get("token", "")
    if not token:
        return jsonify({"error": "Missing token"}), 401
    try:
        payload = jwt.decode(token, current_app.config["JWT_SECRET"], algorithms=["HS256"])
        user = db.session.get(User, payload["user_id"])
        if not user or not user.is_active:
            return jsonify({"error": "Invalid token"}), 401
        if user.role not in _RECRUITER_ROLES:
            return jsonify({"error": "Forbidden"}), 403
        g.user_id = user.id
        g.role = user.role
    except jwt.PyJWTError:
        return jsonify({"error": "Invalid token"}), 401
    return None


def _ok_or_fail(result: dict, *, success_code: int = 200, installed_err_code: int = 503):
    """把服务层统一信封转成 HTTP 响应。CLI 未安装 → 503。"""
    if result.get("ok"):
        return jsonify({"ok": True, "data": result.get("data")}), success_code
    err = result.get("error") or {}
    code = err.get("code", "unknown_error")
    msg = err.get("message", "未知错误")
    # CLI 未安装 / 超时 / 执行错误 → 503；认证类 → 401；参数类 → 400；其余 → 502
    if code == "boss_cli_not_installed":
        status = installed_err_code
    elif code == "timeout" or code == "exec_error":
        status = 503
    elif code == "not_authenticated":
        status = 401
    elif code == "needs_stoken":
        status = 409
    elif code == "incomplete_cookie":
        status = 409
    elif code in ("invalid_params",):
        status = 400
    elif code in ("rate_limited",):
        status = 429
    else:
        status = 502
    return jsonify({"ok": False, "error": {"code": code, "message": msg}}), status


def _active_cookies_or_409():
    """取当前智聘用户激活的 BOSS 账号 cookies（BOSS_COOKIES 格式）。

    返回 (cookies_header, None) 或 (None, error_response)。
    无激活账号 → 409 提示先添加账号。供 recruiter 接口注入 env。
    """
    cookies = _svc.active_cookies_header(g.user_id)
    if not cookies:
        return None, (jsonify({"ok": False, "error": {
            "code": "no_active_account",
            "message": "尚未绑定或激活 BOSS 账号，请先扫码登录添加账号",
        }}), 409)
    return cookies, None


# ── 认证 / 登录态 ──────────────────────────────────────────────────
@bp.get("/boss/status")
@require_auth
@require_role(*_RECRUITER_ROLES)
def boss_status():
    """检测当前激活 BOSS 账号的登录态。无激活账号返回 409。"""
    cookies, err = _active_cookies_or_409()
    if err is not None:
        return err
    return _ok_or_fail(_svc.status(cookies_override=cookies))


@bp.get("/boss/login/guide")
@require_auth
@require_role(*_RECRUITER_ROLES)
def boss_login_guide():
    """返回交互式登录指引（boss login 需在终端执行）。"""
    return _ok_or_fail(_svc.login_guide())


@bp.post("/boss/login/cookie")
@require_auth
@require_role(*_RECRUITER_ROLES)
def boss_login_cookie():
    """已下线：本机浏览器 Cookie 登录依赖后端读取使用者浏览器，云端不适用。

    保留端点仅为兼容旧前端调用，统一返回 410，引导改用扫码登录。
    """
    return jsonify({"ok": False, "error": {
        "code": "gone", "message": "该登录方式已下线，请改用扫码登录",
    }}), 410


# ── 招聘端 · 岗位管理 ──────────────────────────────────────────────
@bp.get("/boss/jobs")
@require_auth
@require_role(*_RECRUITER_ROLES)
def boss_jobs():
    """招聘端在招职位列表（只读）。"""
    cookies, err = _active_cookies_or_409()
    if err is not None:
        return err
    return _ok_or_fail(_svc.recruiter_jobs(cookies_override=cookies))


# ── 招聘端 · 候选人推荐/收件箱 ─────────────────────────────────────
@bp.get("/boss/candidates/recommend")
@require_auth
@require_role(*_RECRUITER_ROLES)
def boss_candidates_recommend():
    """推荐候选人列表。query: job?, limit?, page?"""
    cookies, err = _active_cookies_or_409()
    if err is not None:
        return err
    result = _svc.recruiter_recommend(
        job=request.args.get("job") or None,
        limit=request.args.get("limit", 10),
        page=request.args.get("page", 1),
        cookies_override=cookies,
    )
    return _ok_or_fail(result)


@bp.get("/boss/candidates/inbox")
@require_auth
@require_role(*_RECRUITER_ROLES)
def boss_candidates_inbox():
    """沟通列表/收件箱。query: job?, label?, limit?, page?"""
    cookies, err = _active_cookies_or_409()
    if err is not None:
        return err
    result = _svc.recruiter_inbox(
        job=request.args.get("job") or None,
        label=request.args.get("label", type=int),
        limit=request.args.get("limit", 20),
        page=request.args.get("page", 1),
        cookies_override=cookies,
    )
    return _ok_or_fail(result)


# ── 招聘端 · 简历 ──────────────────────────────────────────────────
@bp.get("/boss/candidates/<encrypt_geek_id>/resume")
@require_auth
@require_role(*_RECRUITER_ROLES)
def boss_candidate_resume(encrypt_geek_id: str):
    """查看候选人完整简历（JSON 结构）。query: job?, security_id?"""
    cookies, err = _active_cookies_or_409()
    if err is not None:
        return err
    result = _svc.recruiter_resume(
        encrypt_geek_id=encrypt_geek_id,
        job=request.args.get("job") or None,
        security_id=request.args.get("security_id") or None,
        cookies_override=cookies,
    )
    return _ok_or_fail(result)


@bp.get("/boss/candidates/<encrypt_geek_id>/resume/download")
def boss_candidate_resume_download(encrypt_geek_id: str):
    """下载候选人简历 Markdown 文件。query: job?, security_id?, token=

    用 ?token= 传 JWT（window.open 无法带 Authorization 头），手动鉴权 + 角色校验。
    """
    err = _require_query_token()
    if err is not None:
        return err
    cookies = _svc.active_cookies_header(g.user_id)
    if not cookies:
        return jsonify({"ok": False, "error": {
            "code": "no_active_account", "message": "尚未绑定或激活 BOSS 账号",
        }}), 409
    result = _svc.recruiter_resume_download(
        encrypt_geek_id=encrypt_geek_id,
        job=request.args.get("job") or None,
        security_id=request.args.get("security_id") or None,
        cookies_override=cookies,
    )
    if not result.get("ok"):
        return _ok_or_fail(result)
    md_text = result.get("data") or ""
    if not isinstance(md_text, str):
        md_text = str(md_text)
    # 安全文件名：仅保留字母数字与下划线
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in encrypt_geek_id)[:40]
    download_name = f"{safe or 'candidate'}_resume.md"
    resp = Response(md_text, mimetype="text/markdown; charset=utf-8")
    resp.headers["Content-Disposition"] = f'attachment; filename="{download_name}"'
    record_event("boss.resume.download", entity_type="boss_candidate",
                 payload={"geek_id": encrypt_geek_id})
    return resp


# ── 招聘端 · 闭环：批量导入 / AI 筛选 ──────────────────────────────
@bp.post("/boss/candidates/batch-import")
@require_auth
@require_role(*_RECRUITER_ROLES)
def boss_candidates_batch_import():
    """批量下载并导入收件箱候选人简历到候选人库。

    body: {
      items: [{geek_id, name?, security_id?, friend_id?, job?}],  # 必填，至少含 geek_id
      target_job_id?: int,   # 导入后自动加入该系统岗位 pipeline(stage=pending)
      boss_job?: str,        # BOSS encryptJobId，下载简历透传 --job
      limit?: int,           # 单次上限(<=50)
      interval_sec?: float   # 每条间隔秒，默认 1.5；命中 rate_limited 立即停止
    }
    """
    data = request.get_json(silent=True) or {}
    items = data.get("items")
    if not isinstance(items, list) or not items:
        return jsonify({"ok": False, "error": {"code": "invalid_params", "message": "items 不能为空"}}), 400
    cookies, err = _active_cookies_or_409()
    if err is not None:
        return err
    result = _pipeline.batch_import(
        owner_hr_id=g.user_id,
        items=items,
        cookies_override=cookies,
        target_job_id=data.get("target_job_id"),
        boss_job=(data.get("boss_job") or None),
        limit=data.get("limit", 20),
        interval_sec=data.get("interval_sec", 1.5),
    )
    if result.get("ok"):
        d = result.get("data") or {}
        record_event("boss.batch_import", entity_type="boss",
                     payload={"imported": d.get("imported"), "skipped": d.get("skipped"),
                              "failed": d.get("failed"), "stopped_reason": d.get("stopped_reason")})
    return _ok_or_fail(result)


@bp.post("/boss/candidates/ai-screen")
@require_auth
@require_role(*_RECRUITER_ROLES)
def boss_candidates_ai_screen():
    """对已导入候选人做 AI 简历初筛（LLM 评估 + 写 Interview + 推进 ai_screen）。

    body: {candidate_ids: [int], job_id: int}
    """
    data = request.get_json(silent=True) or {}
    candidate_ids = data.get("candidate_ids")
    job_id = data.get("job_id")
    if not isinstance(candidate_ids, list) or not candidate_ids:
        return jsonify({"ok": False, "error": {"code": "invalid_params", "message": "candidate_ids 不能为空"}}), 400
    if job_id is None:
        return jsonify({"ok": False, "error": {"code": "invalid_params", "message": "job_id 必填"}}), 400
    result = _pipeline.ai_screen(owner_hr_id=g.user_id, candidate_ids=candidate_ids, job_id=job_id)
    if result.get("ok"):
        d = result.get("data") or {}
        record_event("boss.ai_screen", entity_type="boss",
                     payload={"job_id": job_id, "screened": d.get("screened"), "failed": d.get("failed")})
    return _ok_or_fail(result)


# ── 扫码登录 ───────────────────────────────────────────────────────
@bp.post("/boss/qr-login/start")
@require_auth
@require_role(*_RECRUITER_ROLES)
def boss_qr_login_start():
    """发起扫码登录，返回 session_id + base64 二维码 PNG。"""
    from ..services.boss_service import _ensure_cli
    ok, info = _ensure_cli()
    if not ok:
        return jsonify({"ok": False, "error": {"code": "boss_cli_not_installed", "message": info}}), 503
    try:
        from ..services import boss_qr_service
        session_id, qr_b64, qr_mime = boss_qr_service.start_qr_login()
    except Exception as e:
        return jsonify({"ok": False, "error": {"code": "qr_start_failed", "message": str(e)}}), 502
    record_event("boss.qr_login.start", entity_type="boss", payload={"session_id": session_id})
    return jsonify({"ok": True, "data": {"session_id": session_id, "qr_image": qr_b64, "qr_mime": qr_mime}})


@bp.get("/boss/qr-login/status")
@require_auth
@require_role(*_RECRUITER_ROLES)
def boss_qr_login_status():
    """轮询扫码状态。query: session_id"""
    from ..services import boss_qr_service
    session_id = request.args.get("session_id", "")
    if not session_id:
        return jsonify({"ok": False, "error": {"code": "invalid_params", "message": "session_id 必填"}}), 400
    return jsonify({"ok": True, "data": boss_qr_service.get_qr_status(session_id)})


@bp.post("/boss/qr-login/confirm")
@require_auth
@require_role(*_RECRUITER_ROLES)
def boss_qr_login_confirm():
    """扫码成功后，把登录凭证存为该用户的新 BOSS 账号。body: {session_id, label?}

    纯 HTTP 扫码拿到会话 cookie（wt2/wbg/zp_at），即可使用全部招聘端功能
    （收件箱、推荐、查看/下载简历、批量导入、AI 初筛）。这些功能不依赖
    页面 JS 生成的 __zp_stoken__，扫码成功即全功能可用。
    """
    from ..services import boss_qr_service
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id", "")
    label = (data.get("label") or "").strip()
    if not session_id:
        return jsonify({"ok": False, "error": {"code": "invalid_params", "message": "session_id 必填"}}), 400
    cookies = boss_qr_service.get_qr_credential(session_id)
    if not cookies:
        return jsonify({"ok": False, "error": {
            "code": "qr_not_done", "message": "扫码登录尚未完成，请先扫码并确认",
        }}), 409

    acct = _svc.save_account(g.user_id, cookies, label)
    record_event("boss.qr_login.confirm", entity_type="boss_account",
                 payload={"account_id": acct["id"], "label": acct["label"]})
    return jsonify({"ok": True, "data": dict(acct)})


# ── 账号管理 ───────────────────────────────────────────────────────
@bp.get("/boss/accounts")
@require_auth
@require_role(*_RECRUITER_ROLES)
def boss_accounts_list():
    """列出当前用户的 BOSS 账号（不含 cookies 明文）。"""
    return jsonify({"ok": True, "data": _svc.list_accounts(g.user_id)})


@bp.post("/boss/accounts/<int:account_id>/activate")
@require_auth
@require_role(*_RECRUITER_ROLES)
def boss_account_activate(account_id: int):
    """切换激活账号。"""
    result = _svc.activate_account(g.user_id, account_id)
    if result.get("ok"):
        record_event("boss.account.activate", entity_type="boss_account",
                     payload={"account_id": account_id})
        return jsonify({"ok": True})
    return jsonify(result), 404


@bp.delete("/boss/accounts/<int:account_id>")
@require_auth
@require_role(*_RECRUITER_ROLES)
def boss_account_delete(account_id: int):
    """删除账号。"""
    result = _svc.delete_account(g.user_id, account_id)
    if result.get("ok"):
        record_event("boss.account.delete", entity_type="boss_account",
                     payload={"account_id": account_id})
        return jsonify({"ok": True})
    return jsonify(result), 404


@bp.post("/boss/accounts/<int:account_id>/verify")
@require_auth
@require_role(*_RECRUITER_ROLES)
def boss_account_verify(account_id: int):
    """校验账号登录态。"""
    result = _svc.verify_account(g.user_id, account_id)
    if not result.get("ok"):
        return jsonify(result), 404
    record_event("boss.account.verify", entity_type="boss_account",
                 payload={"account_id": account_id, "ok": result.get("data", {}).get("authenticated")})
    return jsonify(result)
