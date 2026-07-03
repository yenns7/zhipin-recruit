#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BOSS 直聘「扫码登录 + 全功能验证」半自动脚本。

目标：拿到一份真实 BOSS 凭证后，把 boss-cli 的全部招聘端命令跑一遍，
确凿收集「通 / 不通」证据矩阵，定位 __zp_stoken__ 到底卡哪些接口。

这是 systematic-debugging 的 Phase 1 证据收集工具。流程：
  1. 纯 HTTP 扫码（复用 boss-cli 原语）→ 拿会话 cookie（wt2/wbg/zp_at）
     · 二维码同时存成 PNG 文件 + 终端打印，方便手机扫
  2. 凭证写入 ~/.config/boss-cli/credential.json（boss-cli 全局凭证）
  3. 用该凭证跑全部 recruiter 命令，逐条判定 PASS/FAIL/STOKEN_BLOCKED
  4. 输出证据矩阵 + 结论

可选第二步增强（需 camoufox）：
  若环境装了 camoufox，扫码后自动尝试补 __zp_stoken__，解锁更多接口。

用法（在 backend 目录，用 venv 的 python）：
  venv/bin/python ../scripts/boss_scan_and_verify.py
  # 手机扫终端/文件二维码 → 自动跑完
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

# 让脚本能在 venv 外被 import 项目模块
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

# boss-cli 凭证文件路径（与 constants.CONFIG_DIR 一致）
CRED_FILE = Path.home() / ".config" / "boss-cli" / "credential.json"
QR_PNG = Path("/tmp/boss_qr.png")

# 测试关键词（search 必填）
TEST_KEYWORD = os.getenv("VERIFY_KEYWORD", "前端")


def _banner(t: str) -> None:
    print(f"\n{'=' * 64}\n {t}\n{'=' * 64}")


# ── 扫码登录（纯 HTTP，复用 boss-cli 原语）─────────────────────────
async def _qr_login_and_save() -> dict | None:
    """跑完整 HTTP 扫码流程，凭证落盘，返回 cookies dict。"""
    from boss_cli.auth import (
        _get_qr_session, _wait_for_scan, _wait_for_confirm,
        _dispatch_login, save_credential,
    )
    from boss_cli.constants import BASE_URL, HEADERS, QR_CODE_URL
    import httpx

    async with httpx.AsyncClient(
        base_url=BASE_URL, headers=HEADERS, follow_redirects=True,
        timeout=httpx.Timeout(30, read=40),
    ) as client:
        # 1. 拿 QR session
        data = await _get_qr_session(client)
        qr_id = data["qrId"]
        # 2. 拿二维码图片
        img_resp = await client.get(QR_CODE_URL, params={"content": qr_id})
        img_resp.raise_for_status()
        img = img_resp.content
        QR_PNG.write_bytes(img)
        print(f"\n  📱 二维码已存：{QR_PNG}（用图片查看器打开，或扫下方终端码）")
        print(f"  QR_ID: {qr_id[:16]}...\n")

        # 3. 轮询扫码
        scanned = False
        for i in range(6):
            print(f"  ⏳ 等待扫码... ({i + 1}/6)")
            if await _wait_for_scan(client, qr_id):
                scanned = True
                print("  📲 已扫码，请在手机上确认登录")
                break
        if not scanned:
            print("  ❌ 二维码过期，请重跑脚本")
            return None

        # 4. 轮询确认
        confirmed = False
        for i in range(6):
            print(f"  ⏳ 等待手机确认... ({i + 1}/6)")
            if await _wait_for_confirm(client, qr_id):
                confirmed = True
                break
        if not confirmed:
            print("  ❌ 确认超时，请重跑脚本")
            return None

        # 5. 派发拿 cookies
        print("  🔐 派发登录凭证...")
        cred = await _dispatch_login(client, qr_id)
        save_credential(cred)
        cookies = cred.cookies
        print(f"\n  ✅ 登录成功，拿到 {len(cookies)} 个 cookie")
        print(f"     · __zp_stoken__: {'有' if '__zp_stoken__' in cookies else '无（纯HTTP扫码拿不到，需 camoufox 补）'}")
        print(f"     · wt2: {'有' if 'wt2' in cookies else '无'}")
        print(f"     · zp_at: {'有' if 'zp_at' in cookies else '无'}")
        print(f"     凭证已存：{CRED_FILE}")
        return cookies


def try_hydrate_stoken() -> bool:
    """若 camoufox 可用，尝试为已登录会话补 __zp_stoken__。返回是否补成功。"""
    try:
        from boss_cli.browser_login import _hydrate_stoken_via_browser
        from boss_cli.auth import load_credential, save_credential, Credential
    except ImportError:
        print("  ⏭️  boss_cli.browser_login 不可用，跳过 stoken 补全")
        return False

    cred = load_credential()
    if cred is None or "__zp_stoken__" in cred.cookies:
        return "__zp_stoken__" in (cred.cookies if cred else {})

    print("  🔧 检测到 camoufox，尝试补 __zp_stoken__...")
    try:
        enriched = _hydrate_stoken_via_browser(cred.cookies)
    except Exception as e:
        print(f"  ⚠️  camoufox 补全失败：{e}")
        return False
    if "__zp_stoken__" in enriched:
        merged = {**cred.cookies, **enriched}
        save_credential(Credential(cookies=merged))
        print("  ✅ __zp_stoken__ 补全成功")
        return True
    print("  ⚠️  camoufox 未能生成 __zp_stoken__（反爬拒绝）")
    return False


# ── 全功能验证矩阵 ─────────────────────────────────────────────────
def _boss_bin() -> str | None:
    """定位 boss 二进制（venv 优先）。"""
    for cand in (BACKEND_DIR / "venv" / "bin" / "boss",
                 BACKEND_DIR / ".venv" / "bin" / "boss",
                 shutil.which("boss")):
        if cand and Path(cand).exists():
            return str(cand)
    return None


def _run(args: list[str], timeout: int = 45, cookies_header: str | None = None) -> dict:
    """跑 `boss <args> --json`，返回 {ok, code, snippet}。"""
    bin_path = _boss_bin()
    if not bin_path:
        return {"ok": False, "code": "no_boss_bin", "snippet": ""}
    cmd = [bin_path] + args + ["--json"]
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    if cookies_header:
        env["BOSS_COOKIES"] = cookies_header
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout,
                              env=env, encoding="utf-8", errors="ignore")
    except subprocess.TimeoutExpired:
        return {"ok": False, "code": "timeout", "snippet": ""}
    except Exception as e:
        return {"ok": False, "code": f"exec_error:{e}", "snippet": ""}

    out = (proc.stdout or "").strip()
    err = (proc.stderr or "").strip()
    parsed = None
    try:
        parsed = json.loads(out) if out else None
    except Exception:
        parsed = None

    ok = proc.returncode == 0
    if isinstance(parsed, dict) and "ok" in parsed:
        ok = ok and bool(parsed.get("ok"))

    code = ""
    if not ok:
        msg = err or out
        if "code" in msg and ("37" in msg or "stoken" in msg.lower() or "环境异常" in msg):
            code = "needs_stoken"
        elif "not_authenticated" in msg or "未登录" in msg:
            code = "not_authenticated"
        elif "rate_limited" in msg or "429" in msg:
            code = "rate_limited"
        else:
            code = "unknown"
    snippet = out[:200] if out else err[:200]
    return {"ok": ok, "code": code, "snippet": snippet, "parsed": parsed}


def _cookies_header() -> str | None:
    """从全局凭证文件读 cookie，拼 BOSS_COOKIES 头。"""
    if not CRED_FILE.exists():
        return None
    try:
        data = json.loads(CRED_FILE.read_text(encoding="utf-8"))
        cookies = data.get("cookies", {})
        return "; ".join(f"{k}={v}" for k, v in cookies.items())
    except Exception:
        return None


# 全部招聘端命令清单（name, argv, need_stoken 预期）
COMMANDS = [
    ("status",         ["status"],                                   False),
    ("jobs",           ["recruiter", "jobs"],                        False),
    ("recommend",      ["recruiter", "recommend", "-n", "3"],        False),
    ("inbox",          ["recruiter", "inbox", "-n", "5"],            False),
    ("search",         ["recruiter", "search", TEST_KEYWORD, "-c", "上海"], True),
    ("labels",         ["recruiter", "labels"],                      True),
]


def run_matrix() -> list[dict]:
    """跑全部命令，返回证据矩阵。"""
    _banner("Phase 1 · 全功能验证矩阵")
    header = _cookies_header()
    if not header:
        print("  ❌ 无凭证，无法跑验证。请先完成扫码登录。")
        return []

    has_stoken = "__zp_stoken__" in json.loads(CRED_FILE.read_text()).get("cookies", {})
    print(f"  凭证就绪：stoken={'有' if has_stoken else '无'}")
    print(f"  {'命令':<14}{'需stoken':<10}{'结果':<10}{'说明'}")
    print("  " + "-" * 60)

    results = []
    for name, argv, need in COMMANDS:
        r = _run(argv, cookies_header=header)
        if r["ok"]:
            status = "✅ PASS"
            note = "有数据"
        elif r["code"] == "needs_stoken":
            status = "❌ STOKEN"
            note = "报 code=37/stoken，被 stoken 拦截"
        elif r["code"] == "rate_limited":
            status = "⚠️ RATE"
            note = "频控，非 stoken"
        elif r["code"] == "not_authenticated":
            status = "❌ AUTH"
            note = "未登录/会话失效"
        else:
            status = "❌ FAIL"
            note = f"code={r['code']} | {r['snippet'][:60]}"
        print(f"  {name:<14}{'是' if need else '否':<10}{status:<10}{note}")
        results.append({"name": name, "need_stoken": need, "status": status, "code": r["code"], "note": note})
        time.sleep(1.5)  # 避免频控
    return results


def conclude(results: list[dict], has_stoken: bool) -> int:
    _banner("结论")
    stoken_blocked = [r for r in results if r["code"] == "needs_stoken"]
    auth_failed = [r for r in results if r["code"] == "not_authenticated"]
    passed = [r for r in results if r["status"] == "✅ PASS"]

    print(f"  凭证 stoken 状态：{'有' if has_stoken else '无'}")
    print(f"  通过 {len(passed)}/{len(results)}，stoken 拦截 {len(stoken_blocked)}，会话失效 {len(auth_failed)}")
    if not results:
        print("  🔴 无验证结果"); return 2
    if auth_failed:
        print("  🔴 会话 cookie 失效，需重新扫码登录"); return 2
    if not stoken_blocked:
        print("  🟢 全部命令可用（含 search 等 stoken 依赖接口）—— 扫码方案能覆盖所有功能！")
        return 0
    blocked_names = ", ".join(r["name"] for r in stoken_blocked)
    print(f"  🟡 有 {len(stoken_blocked)} 个接口被 stoken 拦截：{blocked_names}")
    if not has_stoken:
        print("     根因：纯 HTTP 扫码拿不到 __zp_stoken__。")
        print("     → 装 camoufox 后重跑可尝试补 stoken：pip install 'kabi-boss-cli[browser]' && python -m camoufox fetch")
    else:
        print("     根因：即使有 stoken 仍被拦，可能 stoken 与会话未绑定或反爬在接口层拦截。")
    return 1


def main() -> int:
    _banner("BOSS 直聘 扫码登录 + 全功能验证")
    # 已有凭证则跳过扫码
    if CRED_FILE.exists():
        print(f"  检测到已有凭证：{CRED_FILE}")
        cookies = json.loads(CRED_FILE.read_text()).get("cookies", {})
        print(f"  cookie 数：{len(cookies)}，stoken={'有' if '__zp_stoken__' in cookies else '无'}")
        ans = input("  用现有凭证跑验证？(Y=用现有 / n=重新扫码): ").strip().lower()
        if ans == "n":
            CRED_FILE.unlink(missing_ok=True)
            QR_PNG.unlink(missing_ok=True)
            cookies = asyncio.run(_qr_login_and_save()) or {}
    else:
        cookies = asyncio.run(_qr_login_and_save()) or {}

    if not cookies:
        print("\n  ❌ 未拿到凭证，退出。"); return 2

    # 尝试 camoufox 补 stoken（若装了）
    has_stoken = "__zp_stoken__" in cookies
    if not has_stoken:
        has_stoken = try_hydrate_stoken()

    results = run_matrix()
    return conclude(results, has_stoken)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\n  用户中断。"); sys.exit(130)
