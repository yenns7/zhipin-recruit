# -*- coding: utf-8 -*-
"""BOSS 直聘 CLI（boss-cli / kabi-boss-cli）集成服务。

把开源项目 https://github.com/jackwener/boss-cli 的 `boss` 命令封装为
招聘方可调用的服务层，供 backend/app/api/boss.py 蓝图使用。

设计要点：
- 强制安装：`boss` 二进制缺失时按 BOSS_CLI_AUTO_INSTALL 自动 `pip install
  kabi-boss-cli`，仍失败则调用方返回 503 明确提示。
- 子进程调用沿用 agent_service._tool_web_search 的安全范式：argv list（无
  shell）、capture_output、text、显式 timeout、utf-8 env、JSON-then-text 回退。
- 统一返回 `{"ok": bool, "data": Any, "error": Optional[dict]}`，调用方据此
  组 HTTP 响应。boss status 的 --json 是裸 dict（非标准信封），此处统一包装。
"""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# boss-cli 鉴权所需的全套 cookie（与 boss_cli.constants.REQUIRED_COOKIES 对齐）。
# __zp_stoken__ 由页面 JS 生成、wt2/wbg/zp_at 为服务端 HttpOnly 会话 cookie，
# 四者缺一不可，否则 recruiter 接口会判 not_authenticated。
REQUIRED_COOKIES = ("__zp_stoken__", "wt2", "wbg", "zp_at")

BOSS_PYPI_PKG = "kabi-boss-cli"
# 招聘端 recruiter 子命令只在 GitHub 源码里，PyPI 发布包未收录，
# 故强制从 GitHub 安装（pip install git+...）。
BOSS_INSTALL_TARGET = "git+https://github.com/jackwener/boss-cli.git"
BOSS_BIN_NAME = "boss"
# recruiter 子命令信封里 data 字段最大保留长度，超长截断避免撑爆 LLM/前端
MAX_DATA_CHARS = 8000


def _auto_install_enabled() -> bool:
    return os.getenv("BOSS_CLI_AUTO_INSTALL", "true").lower() == "true"


def _candidate_script_dirs() -> List[Path]:
    """枚举 boss 可执行脚本可能所在的目录（去重保序）。

    覆盖三类环境：
    1. 与当前解释器同目录（标准 venv：boss 与 python 同在 .venv/bin/）。
    2. sysconfig 的 scripts 安装目录——当 pip 用 `--prefix` 装到非标准前缀
       （如 /tmp/build/dist），包目录与解释器目录分离，boss 落在 <prefix>/bin，
       既不在 PATH 也不与解释器同目录，仅 sysconfig 能定位。
    3. 由已安装包的 site-packages 反推前缀下的 bin（兜底 prefix 不一致）。
    """
    dirs: List[Path] = [Path(sys.executable).parent]
    try:
        import sysconfig

        for key in ("scripts", "purelib"):
            p = sysconfig.get_paths().get(key)
            if not p:
                continue
            # purelib 形如 <prefix>/lib/pythonX/site-packages，回推 <prefix>/bin
            dirs.append(Path(p) if key == "scripts" else Path(p).parent.parent.parent / "bin")
    except Exception:  # noqa: BLE001
        pass
    try:
        import importlib.metadata as _md

        dist = _md.distribution(BOSS_PYPI_PKG)
        # site-packages 上溯三级到前缀，再拼 bin
        dirs.append(Path(str(dist.locate_file(""))).parent.parent.parent / "bin")
    except Exception:  # noqa: BLE001
        pass

    seen: set[str] = set()
    uniq: List[Path] = []
    for d in dirs:
        s = str(d)
        if s not in seen:
            seen.add(s)
            uniq.append(d)
    return uniq


def _resolve_bin() -> Optional[str]:
    """定位 boss 二进制：env 覆盖 > shutil.which > 解释器同目录 / sysconfig 脚本目录。

    最后一档回退覆盖两类常见场景：
    - venv 未激活、PATH 不含 .venv/bin（boss 与 sys.executable 同目录）；
    - pip 用 --prefix 装到非标准前缀，脚本目录与解释器目录分离（需 sysconfig）。
    """
    override = os.getenv("BOSS_CLI_BIN", "").strip()
    if override:
        return override if Path(override).exists() else None
    found = shutil.which(BOSS_BIN_NAME)
    if found:
        return found
    for d in _candidate_script_dirs():
        cand = d / BOSS_BIN_NAME
        if cand.exists():
            return str(cand)
    return None


def _ensure_cli() -> Tuple[bool, str]:
    """确保 boss CLI 可用。缺失时按配置自动安装。

    返回 (ok, bin_or_message)：成功时 message 即二进制路径；失败时为提示文案。
    """
    bin_path = _resolve_bin()
    if bin_path:
        return True, bin_path

    if not _auto_install_enabled():
        return False, (
            f"BOSS 直聘 CLI 未安装：请手动执行 "
            f"`pip install {BOSS_INSTALL_TARGET}` 后重启服务。"
        )

    # 运行时自愈：自动安装（从 GitHub 源码，因 recruiter 命令仅源码版含）
    logger.info("boss CLI 缺失，尝试自动安装 %s ...", BOSS_INSTALL_TARGET)
    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "--quiet", BOSS_INSTALL_TARGET],
            timeout=300,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
        )
    except subprocess.TimeoutExpired:
        return False, f"自动安装超时，请手动执行 `pip install {BOSS_INSTALL_TARGET}`。"
    except Exception as e:  # noqa: BLE001
        logger.exception("自动安装 boss CLI 失败")
        return False, f"自动安装失败：{e}，请手动执行 `pip install {BOSS_INSTALL_TARGET}`。"

    bin_path = _resolve_bin()
    if bin_path:
        logger.info("boss CLI 自动安装成功：%s", bin_path)
        return True, bin_path
    return False, (
        f"boss-cli 安装后仍未找到 `{BOSS_BIN_NAME}`，"
        f"请确认 pip 安装目录是否在 PATH 中，或设置 BOSS_CLI_BIN 环境变量。"
    )


def _truncate(data: Any) -> Any:
    """递归截断超长字符串，避免单次结果过大。"""
    if isinstance(data, str):
        return data if len(data) <= MAX_DATA_CHARS else data[:MAX_DATA_CHARS] + "...[truncated]"
    if isinstance(data, list):
        return [_truncate(x) for x in data]
    if isinstance(data, dict):
        return {k: _truncate(v) for k, v in data.items()}
    return data


def _run(args: List[str], timeout: int = 60, want_json: bool = True,
         cookies_override: Optional[str] = None) -> Dict[str, Any]:
    """执行 `boss <args...> [--json]`，返回统一结构。

    - want_json=True 时追加 --json（适用于 status / recruiter 数据命令）。
    - cookies_override：传入则设 env BOSS_COOKIES，让 boss 用指定账号而非全局文件
      （多账号切换的关键；格式 "k1=v1; k2=v2"）。
    - 解析 stdout：标准信封 {ok,data,error} 原样取；裸 dict（如 status）包装为信封；
      非 JSON 回退为文本。
    """
    ok, info = _ensure_cli()
    if not ok:
        return {"ok": False, "data": None, "error": {"code": "boss_cli_not_installed", "message": info}}

    cmd: List[str] = [info] + list(args)
    if want_json:
        cmd.append("--json")

    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    if cookies_override:
        env["BOSS_COOKIES"] = cookies_override
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
            encoding="utf-8",
            errors="ignore",
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "data": None, "error": {"code": "timeout", "message": f"boss 命令执行超时（{timeout}s）"}}
    except Exception as e:  # noqa: BLE001
        logger.exception("boss 命令执行失败: %s", cmd)
        return {"ok": False, "data": None, "error": {"code": "exec_error", "message": f"执行失败：{e}"}}

    out = (proc.stdout or "").strip()
    err = (proc.stderr or "").strip()

    # 退出码非 0 → 失败（取 stderr 末段作为提示）；登录/频控等归类
    if proc.returncode != 0:
        msg = err or out or f"boss 命令退出码 {proc.returncode}，无输出"
        code = "unknown_error"
        if "not_authenticated" in msg or "未登录" in msg or "凭证" in msg:
            code = "not_authenticated"
        elif "rate_limited" in msg or "频控" in msg or "429" in msg:
            code = "rate_limited"
        elif "stoken" in msg.lower() or "环境异常" in msg:
            code = "needs_stoken"
        return {"ok": False, "data": None, "error": {"code": code, "message": msg[:500]}}

    # 退出码 0 但无 stdout：常见于 job-close/reopen/greet 等「动作型」命令
    # （无 --json，成功时只往 stderr 打印 Rich 提示）。视为成功。
    if not out:
        return {"ok": True, "data": {"status": "ok", "message": err[:300] or "done"}, "error": None}

    # 尝试 JSON 解析
    try:
        parsed = json.loads(out)
    except Exception:
        # 纯文本输出（如 resume-download -o - 的 Markdown）
        return {"ok": True, "data": _truncate(out), "error": None}

    if isinstance(parsed, dict) and "ok" in parsed:
        # 标准信封 {ok, schema_version, data, error}
        return {
            "ok": bool(parsed.get("ok")),
            "data": _truncate(parsed.get("data")),
            "error": parsed.get("error"),
        }
    if isinstance(parsed, dict) and ("authenticated" in parsed or "credential_present" in parsed):
        # boss status --json 的裸 dict，统一包装
        return {"ok": True, "data": _truncate(parsed), "error": None}
    # 其它 dict/list 直接当 data
    return {"ok": True, "data": _truncate(parsed), "error": None}


def _opt(flag: str, value: Any) -> List[str]:
    """构造 [flag, value]，value 为空则返回 []。"""
    if value is None or value == "":
        return []
    return [flag, str(value)]


def _safe_text(value: Any, max_len: int = 200) -> str:
    s = str(value or "").strip()
    # 去除换行，防止参数注入换行干扰 CLI 解析
    s = re.sub(r"\s+", " ", s)
    return s[:max_len]


def parse_cookies(raw: Any) -> Dict[str, str]:
    """把客户端提交的 cookie 解析成 {name: value} dict。

    兼容两种来源（浏览器扩展 chrome.cookies / 用户手动粘贴 Cookie 头）：
    - dict：{"wt2": "v1", ...} 直接归一化为字符串键值。
    - str：Cookie 头格式 "k1=v1; k2=v2"，按 `;` 切分，仅取第一个 `=` 前后。
    值里可能含 `=`（如 base64），故用 split("=", 1) 只切一次。
    """
    out: Dict[str, str] = {}
    if isinstance(raw, dict):
        for k, v in raw.items():
            k = str(k).strip()
            if k:
                out[k] = str(v)
        return out
    if isinstance(raw, str):
        for part in raw.split(";"):
            part = part.strip()
            if not part or "=" not in part:
                continue
            k, v = part.split("=", 1)
            k = k.strip()
            if k:
                out[k] = v.strip()
    return out


class BossService:
    """boss-cli 招聘端能力的封装。所有方法返回统一信封 dict。"""

    # ── 认证 ───────────────────────────────────────────────
    def status(self, cookies_override: Optional[str] = None) -> Dict[str, Any]:
        """登录态检测（非交互，安全）。status 会真实请求 BOSS API 健康检查，
        未登录时网络握手较慢，给 30s 余量。"""
        return _run(["status"], timeout=30, cookies_override=cookies_override)

    def login_guide(self) -> Dict[str, Any]:
        """登录指引。boss login 是交互式命令（扫码/浏览器 cookie），无法在
        Web 请求内安全执行，返回操作指引文案。"""
        ok, info = _ensure_cli()
        installed = ok
        return {
            "ok": True,
            "data": {
                "installed": installed,
                "bin": info if installed else None,
                "interactive": True,
                "instructions": [
                    "boss login 为交互式命令，需在运行后端的终端中执行：",
                    "  · 浏览器 Cookie：boss login --cookie-source chrome",
                    "  · 扫码登录：boss login --qrcode",
                    "登录成功后刷新本页即可，凭证保存在 ~/.config/boss-cli/credential.json",
                ],
            },
            "error": None,
        }

    def login_cookie(self, browser: str = "chrome") -> Dict[str, Any]:
        """尝试从浏览器提取 Cookie 登录（非交互，可 Web 触发）。"""
        browser = _safe_text(browser, 30) or "chrome"
        # 不加 --json（login 命令无该选项）；登录是否成功靠后续 status 校验
        result = _run(["login", "--cookie-source", browser], timeout=60, want_json=False)
        if result["ok"]:
            # 用 status 复核登录态
            st = self.status()
            return st
        return result

    # ── 招聘端 · 岗位 ──────────────────────────────────────
    def recruiter_jobs(self, cookies_override: Optional[str] = None) -> Dict[str, Any]:
        return _run(["recruiter", "jobs"], timeout=30, cookies_override=cookies_override)

    def recruiter_job_close(self, encrypt_job_id: str, cookies_override: Optional[str] = None) -> Dict[str, Any]:
        jid = _safe_text(encrypt_job_id, 64)
        if not jid:
            return {"ok": False, "data": None, "error": {"code": "invalid_params", "message": "encrypt_job_id 不能为空"}}
        # job-close 无 --json 选项，靠退出码判成功
        return _run(["recruiter", "job-close", jid, "-y"], timeout=30, want_json=False, cookies_override=cookies_override)

    def recruiter_job_reopen(self, encrypt_job_id: str, cookies_override: Optional[str] = None) -> Dict[str, Any]:
        jid = _safe_text(encrypt_job_id, 64)
        if not jid:
            return {"ok": False, "data": None, "error": {"code": "invalid_params", "message": "encrypt_job_id 不能为空"}}
        # job-reopen 无 --json 选项，靠退出码判成功
        return _run(["recruiter", "job-reopen", jid, "-y"], timeout=30, want_json=False, cookies_override=cookies_override)

    # ── 招聘端 · 候选人搜索/推荐/收件箱 ────────────────────
    def recruiter_search(
        self,
        keyword: str,
        city: Optional[str] = None,
        exp: Optional[str] = None,
        degree: Optional[str] = None,
        salary: Optional[str] = None,
        job: Optional[str] = None,
        page: int = 1,
        cookies_override: Optional[str] = None,
    ) -> Dict[str, Any]:
        kw = _safe_text(keyword, 80)
        if not kw:
            return {"ok": False, "data": None, "error": {"code": "invalid_params", "message": "keyword 不能为空"}}
        try:
            page = max(1, int(page))
        except (TypeError, ValueError):
            page = 1
        args = ["recruiter", "search", kw]
        args += _opt("-c", city)
        args += _opt("--exp", exp)
        args += _opt("--degree", degree)
        args += _opt("--salary", salary)
        args += _opt("--job", job)
        args += ["-p", str(page)]
        return _run(args, timeout=45, cookies_override=cookies_override)

    def recruiter_recommend(
        self,
        job: Optional[str] = None,
        limit: int = 10,
        page: int = 1,
        cookies_override: Optional[str] = None,
    ) -> Dict[str, Any]:
        try:
            limit = max(0, int(limit))
            page = max(1, int(page))
        except (TypeError, ValueError):
            limit, page = 10, 1
        args = ["recruiter", "recommend", "-n", str(limit), "-p", str(page)]
        args += _opt("--job", job)
        return _run(args, timeout=45, cookies_override=cookies_override)

    def recruiter_inbox(
        self,
        job: Optional[str] = None,
        label: Optional[int] = None,
        limit: int = 20,
        page: int = 1,
        cookies_override: Optional[str] = None,
    ) -> Dict[str, Any]:
        try:
            label = int(label) if label is not None else 0
            limit = max(0, int(limit))
            page = max(1, int(page))
        except (TypeError, ValueError):
            label, limit, page = 0, 20, 1
        args = ["recruiter", "inbox", "--label", str(label), "-n", str(limit)]
        args += _opt("--job", job)
        return _run(args, timeout=45, cookies_override=cookies_override)

    # ── 招聘端 · 简历 ──────────────────────────────────────
    def recruiter_resume(
        self,
        encrypt_geek_id: str,
        job: Optional[str] = None,
        security_id: Optional[str] = None,
        cookies_override: Optional[str] = None,
    ) -> Dict[str, Any]:
        gid = _safe_text(encrypt_geek_id, 64)
        if not gid:
            return {"ok": False, "data": None, "error": {"code": "invalid_params", "message": "encrypt_geek_id 不能为空"}}
        args = ["recruiter", "resume", gid]
        args += _opt("--job", job)
        args += _opt("--security-id", security_id)
        return _run(args, timeout=45, cookies_override=cookies_override)

    def recruiter_resume_download(
        self,
        encrypt_geek_id: str,
        job: Optional[str] = None,
        security_id: Optional[str] = None,
        cookies_override: Optional[str] = None,
    ) -> Dict[str, Any]:
        """下载候选人简历 Markdown。用 `-o -` 输出到 stdout，直接拿 md 文本。"""
        gid = _safe_text(encrypt_geek_id, 64)
        if not gid:
            return {"ok": False, "data": None, "error": {"code": "invalid_params", "message": "encrypt_geek_id 不能为空"}}
        args = ["recruiter", "resume-download", gid]
        args += _opt("--job", job)
        args += _opt("--security-id", security_id)
        args += ["-o", "-"]  # 输出到 stdout
        # resume-download 无 --json 选项，stdout 即 Markdown
        return _run(args, timeout=60, want_json=False, cookies_override=cookies_override)

    # ── 招聘端 · 沟通动作 ──────────────────────────────────
    def recruiter_greet(self, encrypt_geek_id: str, job: Optional[str] = None,
                        cookies_override: Optional[str] = None) -> Dict[str, Any]:
        gid = _safe_text(encrypt_geek_id, 64)
        if not gid:
            return {"ok": False, "data": None, "error": {"code": "invalid_params", "message": "encrypt_geek_id 不能为空"}}
        args = ["recruiter", "greet", gid]
        args += _opt("--job", job)
        return _run(args, timeout=30, cookies_override=cookies_override)

    def recruiter_invite_interview(
        self,
        encrypt_geek_id: str,
        job: str,
        time: Optional[str] = None,
        address: Optional[str] = None,
        desc: Optional[str] = None,
        cookies_override: Optional[str] = None,
    ) -> Dict[str, Any]:
        """向候选人发送 BOSS 面试邀请。

        对应 `boss recruiter invite-interview ENCRYPT_GEEK_ID --job ... -y`。
        --job（关联职位 encryptJobId）为 CLI 必填项，缺失直接 invalid_params。
        time/address/desc 可空；-y 跳过 CLI 二次确认（人工确认在系统侧完成）。
        """
        gid = _safe_text(encrypt_geek_id, 64)
        if not gid:
            return {"ok": False, "data": None, "error": {"code": "invalid_params", "message": "encrypt_geek_id 不能为空"}}
        jid = _safe_text(job, 64)
        if not jid:
            return {"ok": False, "data": None, "error": {"code": "invalid_params", "message": "job（BOSS encryptJobId）不能为空"}}
        args = ["recruiter", "invite-interview", gid, "--job", jid]
        args += _opt("--time", _safe_text(time, 64) if time else None)
        args += _opt("--address", _safe_text(address, 200) if address else None)
        args += _opt("--desc", _safe_text(desc, 500) if desc else None)
        args += ["-y"]
        return _run(args, timeout=45, cookies_override=cookies_override)

    def recruiter_request_resume(self, friend_id: int, cookies_override: Optional[str] = None) -> Dict[str, Any]:
        try:
            fid = int(friend_id)
        except (TypeError, ValueError):
            return {"ok": False, "data": None, "error": {"code": "invalid_params", "message": "friend_id 必须为整数"}}
        return _run(["recruiter", "request-resume", str(fid), "-y"], timeout=30, cookies_override=cookies_override)

    def recruiter_reply(self, friend_id: int, message: str, cookies_override: Optional[str] = None) -> Dict[str, Any]:
        try:
            fid = int(friend_id)
        except (TypeError, ValueError):
            return {"ok": False, "data": None, "error": {"code": "invalid_params", "message": "friend_id 必须为整数"}}
        msg = _safe_text(message, 500)
        if not msg:
            return {"ok": False, "data": None, "error": {"code": "invalid_params", "message": "message 不能为空"}}
        return _run(["recruiter", "reply", str(fid), msg, "-y"], timeout=30, cookies_override=cookies_override)

    # ── 多账号管理 ──────────────────────────────────────────
    # 以下方法操作 DB（BossAccount 模型），需在 app context 内调用。
    # cookies 经 Fernet 加密存储；切换账号靠注入 BOSS_COOKIES env，不动全局文件。

    @staticmethod
    def list_accounts(owner_hr_id: int) -> List[Dict[str, Any]]:
        """列出某智聘用户绑定的所有 BOSS 账号（不含 cookies 明文）。"""
        from ..models import BossAccount
        rows = BossAccount.query.filter_by(owner_hr_id=owner_hr_id) \
            .order_by(BossAccount.is_active.desc(), BossAccount.created_at.desc()).all()
        return [_account_to_dict(r) for r in rows]

    @staticmethod
    def get_active_account(owner_hr_id: int):
        """取该用户当前激活的 BOSS 账号（BossAccount 或 None）。"""
        from ..models import BossAccount
        return BossAccount.query.filter_by(owner_hr_id=owner_hr_id, is_active=True).first()

    @staticmethod
    def save_account(owner_hr_id: int, cookies: dict, label: str = "") -> Dict[str, Any]:
        """保存一个新 BOSS 账号（cookies 加密），并设为激活。返回账号 dict。"""
        from ..models import BossAccount
        from .. import db
        from .crypto import encrypt
        import json as _json

        cookies_json = _json.dumps(cookies, ensure_ascii=False)
        has_stoken = "__zp_stoken__" in cookies
        # 该用户其他账号取消激活
        BossAccount.query.filter_by(owner_hr_id=owner_hr_id).update({"is_active": False})
        acct = BossAccount(
            owner_hr_id=owner_hr_id,
            label=(label or "")[:100],
            cookies_encrypted=encrypt(cookies_json),
            cookie_count=len(cookies),
            has_stoken=has_stoken,
            is_active=True,
        )
        db.session.add(acct)
        db.session.commit()
        return _account_to_dict(acct)

    @staticmethod
    def import_browser_cookie(
        owner_hr_id: int, raw_cookies: Any, label: str = ""
    ) -> Dict[str, Any]:
        """从浏览器扩展/手动粘贴导入完整 cookie，校验通过后保存为激活账号。

        云部署下后端读不到使用者本机浏览器，cookie 必须由客户端（扩展或粘贴）
        提交。流程：解析 → 校验必需 cookie 齐全 → 跑 boss status 复核登录态，
        仅当含 __zp_stoken__ 且 authenticated 才落库激活，否则不保存并回 needs_stoken。

        返回统一信封 {ok, data, error}。
        """
        cookies = parse_cookies(raw_cookies)
        if not cookies:
            return {"ok": False, "data": None,
                    "error": {"code": "invalid_params", "message": "未解析到任何 cookie，请重新采集"}}

        missing = [c for c in REQUIRED_COOKIES if c not in cookies]
        if missing:
            # 缺 __zp_stoken__ 单独给 needs_stoken（前端据此引导改用扩展），
            # 其余缺失统一提示重新登录采集。
            code = "needs_stoken" if "__zp_stoken__" in missing else "incomplete_cookie"
            return {
                "ok": False, "data": {"missing": missing},
                "error": {"code": code,
                          "message": f"cookie 不完整，缺少 {', '.join(missing)}；"
                                     f"请确认已在本机浏览器完整登录 BOSS 直聘招聘端后用扩展重新采集"},
            }

        # 用提交的 cookie 真实复核登录态，避免存入失效凭证
        cookie_header = "; ".join(f"{k}={v}" for k, v in cookies.items())
        st = _run(["status"], timeout=30, cookies_override=cookie_header)
        authenticated = bool(st.get("ok") and st.get("data", {}).get("authenticated"))
        if not authenticated:
            return {
                "ok": False, "data": st.get("data"),
                "error": {"code": "not_authenticated",
                          "message": "cookie 校验未通过（可能已过期），请在浏览器重新登录后再采集"},
            }

        acct = BossService.save_account(owner_hr_id, cookies, label=label)
        return {"ok": True, "data": acct, "error": None}

    @staticmethod
    def activate_account(owner_hr_id: int, account_id: int) -> Dict[str, Any]:
        """切换激活账号。返回 {ok, error?}。"""
        from ..models import BossAccount
        from .. import db
        acct = BossAccount.query.filter_by(id=account_id, owner_hr_id=owner_hr_id).first()
        if not acct:
            return {"ok": False, "error": {"code": "not_found", "message": "账号不存在或无权操作"}}
        BossAccount.query.filter_by(owner_hr_id=owner_hr_id).update({"is_active": False})
        acct.is_active = True
        db.session.commit()
        return {"ok": True}

    @staticmethod
    def delete_account(owner_hr_id: int, account_id: int) -> Dict[str, Any]:
        """删除账号。返回 {ok, error?}。"""
        from ..models import BossAccount
        from .. import db
        acct = BossAccount.query.filter_by(id=account_id, owner_hr_id=owner_hr_id).first()
        if not acct:
            return {"ok": False, "error": {"code": "not_found", "message": "账号不存在或无权操作"}}
        was_active = acct.is_active
        db.session.delete(acct)
        db.session.commit()
        # 若删的是激活账号，自动激活最近一个
        if was_active:
            next_acct = BossAccount.query.filter_by(owner_hr_id=owner_hr_id) \
                .order_by(BossAccount.created_at.desc()).first()
            if next_acct:
                next_acct.is_active = True
                db.session.commit()
        return {"ok": True}

    @staticmethod
    def verify_account(owner_hr_id: int, account_id: int) -> Dict[str, Any]:
        """用该账号 cookies 跑 boss status 校验登录态，更新 last_verified_*。"""
        from ..models import BossAccount
        from .. import db
        from .crypto import decrypt
        from ..time_utils import utc_now
        import json as _json

        acct = BossAccount.query.filter_by(id=account_id, owner_hr_id=owner_hr_id).first()
        if not acct:
            return {"ok": False, "error": {"code": "not_found", "message": "账号不存在或无权操作"}}
        try:
            cookies = _json.loads(decrypt(acct.cookies_encrypted))
        except Exception as e:
            return {"ok": False, "error": {"code": "decrypt_error", "message": f"解密 cookies 失败：{e}"}}
        cookie_header = "; ".join(f"{k}={v}" for k, v in cookies.items())
        result = _run(["status"], timeout=30, cookies_override=cookie_header)
        authenticated = bool(result.get("ok") and result.get("data", {}).get("authenticated"))
        acct.last_verified_at = utc_now()
        acct.last_verified_ok = authenticated
        acct.cookie_count = len(cookies)
        acct.has_stoken = "__zp_stoken__" in cookies
        db.session.commit()
        return {"ok": True, "data": {"authenticated": authenticated, "status": result.get("data")}}

    @staticmethod
    def active_cookies_header(owner_hr_id: int) -> Optional[str]:
        """取该用户激活账号的 cookies，返回 BOSS_COOKIES 格式字符串。

        供 recruiter 接口注入 env。无激活账号返回 None。
        """
        from .crypto import decrypt
        import json as _json
        acct = BossService.get_active_account(owner_hr_id)
        if not acct:
            return None
        try:
            cookies = _json.loads(decrypt(acct.cookies_encrypted))
        except Exception:
            logger.exception("解密激活账号 cookies 失败 account_id=%s", acct.id)
            return None
        return "; ".join(f"{k}={v}" for k, v in cookies.items())


def _account_to_dict(acct) -> Dict[str, Any]:
    """BossAccount → 前端安全的 dict（不含 cookies 明文）。"""
    return {
        "id": acct.id,
        "label": acct.label or "",
        "cookie_count": acct.cookie_count or 0,
        "has_stoken": bool(acct.has_stoken),
        "is_active": bool(acct.is_active),
        "last_verified_at": acct.last_verified_at.isoformat() if acct.last_verified_at else None,
        "last_verified_ok": acct.last_verified_ok,
        "created_at": acct.created_at.isoformat() if acct.created_at else None,
    }
