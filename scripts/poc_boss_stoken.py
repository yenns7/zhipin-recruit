#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BOSS 直聘 Camoufox stoken 生成 PoC 验证脚本。

目的：在目标服务器上验证「服务器端虚拟浏览器（Camoufox）能否为扫码登录补全
__zp_stoken__，并使 search / resume 等「需要 stoken」的招聘端接口真正可用」。

这是决定「纯扫码能否解决所有问题」的关键依据。boss_cli.browser_login 已实现
该机制，但 Camoufox 在 BOSS 反爬前并非 100% 成功（见 browser_login.py 注释）。
本脚本用对照实验给出明确结论，避免盲目改造 boss_qr_service。

对照实验设计：
  1. 浏览器扫码登录（browser_qr_login）：HTTP 拿会话 cookie + Camoufox 补 stoken
  2. 用「同一组凭证」分别测试：
     - 不需 stoken：recruiter jobs / recommend   （基线，应通过）
     - 需要 stoken：recruiter search <keyword>   （关键判定项）
  3. 逐项打印 PASS / FAIL / SKIP，最后给汇总表 + 结论

用法（在目标服务器上）：
  pip install 'kabi-boss-cli[browser]'
  python -m camoufox fetch            # 下载 Camoufox 浏览器内核
  python scripts/poc_boss_stoken.py   # 手机扫码后自动跑完测试

退出码：0=全通过(扫码能解决所有问题)  1=部分通过(需兜底)  2=环境/反爬失败
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import traceback
from pathlib import Path

# 测试用关键词（search 的必填参数）；可按实际招聘方向调整
TEST_KEYWORD = os.getenv("POC_SEARCH_KEYWORD", "前端")

# ── 环境检查 ───────────────────────────────────────────────────────
def check_env() -> list[tuple[str, bool, str]]:
    """检查 boss-cli / camoufox 依赖是否就绪。"""
    results: list[tuple[str, bool, str]] = []

    # boss_cli 可导入？
    try:
        import boss_cli  # noqa: F401
        results.append(("boss_cli 可导入", True, ""))
    except ImportError as e:
        results.append(("boss_cli 可导入", False, f"{e}（pip install 'kabi-boss-cli[browser]'）"))

    # camoufox 包
    try:
        import camoufox  # noqa: F401
        results.append(("camoufox 包", True, ""))
    except ImportError as e:
        results.append(("camoufox 包", False, f"{e}（pip install 'kabi-boss-cli[browser]'）"))

    # camoufox 浏览器内核已下载？
    try:
        r = subprocess.run(
            [sys.executable, "-m", "camoufox", "path"],
            capture_output=True, text=True, timeout=15,
        )
        if r.returncode == 0 and r.stdout.strip():
            results.append(("camoufox 浏览器内核", True, r.stdout.strip()))
        else:
            results.append(("camoufox 浏览器内核", False, "未下载，运行 python -m camoufox fetch"))
    except Exception as e:
        results.append(("camoufox 浏览器内核", False, f"校验失败：{e}"))

    return results


def _banner(title: str) -> None:
    print(f"\n{'=' * 60}\n {title}\n{'=' * 60}")


def _print_env(results: list[tuple[str, bool, str]]) -> bool:
    ok_all = True
    for name, ok, info in results:
        mark = "✅" if ok else "❌"
        extra = f"  ({info})" if info and ok else (f"  -> {info}" if info else "")
        print(f"  {mark} {name}{extra}")
        if not ok:
            ok_all = False
    return ok_all


# ── 步骤1：浏览器扫码登录 ──────────────────────────────────────────
def do_browser_login() -> dict | None:
    """调用 browser_qr_login 完成 HTTP 扫码 + Camoufox 补 stoken。

    返回 cookies dict 或 None（失败）。
    """
    _banner("步骤 1 / 3：浏览器扫码登录（HTTP 扫码 + Camoufox 补 stoken）")
    print("  📱 请用 BOSS 直聘 APP 扫描即将弹出的二维码，并在手机上确认登录")
    print("  （二维码以 Unicode 字符形式打印在终端；如显示错乱请放大终端窗口）\n")

    try:
        from boss_cli.browser_login import browser_qr_login
    except ImportError as e:
        print(f"  ❌ 无法导入 browser_qr_login：{e}")
        print("     请确认安装的是 GitHub 源码版（含 browser_login）：")
        print("     pip install 'git+https://github.com/jackwener/boss-cli.git#egg=kabi-boss-cli[browser]'")
        return None

    # on_status 回调实时打印进度
    def _on_status(msg: str) -> None:
        print(f"  {msg}")

    try:
        cred = browser_qr_login(on_status=_on_status)
    except Exception as e:
        print(f"\n  ❌ 扫码登录流程异常：{e}")
        traceback.print_exc()
        return None

    cookies = cred.cookies
    print(f"\n  获取到 {len(cookies)} 个 cookie")
    has_stoken = "__zp_stoken__" in cookies
    has_wt2 = "wt2" in cookies
    has_zp_at = "zp_at" in cookies
    print(f"  · __zp_stoken__: {'✅ 有' if has_stoken else '❌ 无（反爬未生成）'}")
    print(f"  · wt2(会话):     {'✅ 有' if has_wt2 else '❌ 无'}")
    print(f"  · zp_at(会话):   {'✅ 有' if has_zp_at else '❌ 无'}")
    return cookies


# ── 步骤2/3：接口对照测试 ──────────────────────────────────────────
def _run_boss(args: list[str], cookies_header: str, timeout: int = 45) -> dict:
    """执行 `boss <args> --json`，注入 BOSS_COOKIES env，返回解析结果。

    返回 {ok, stdout, parsed, err_code}。
    """
    # 复用 boss_service 的二进制定位逻辑
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
    try:
        from app.services.boss_service import _resolve_bin, _ensure_cli  # type: ignore
        ok, info = _ensure_cli()
        bin_path = info if ok else _resolve_bin()
    except Exception:
        bin_path = shutil.which("boss")

    if not bin_path or not Path(bin_path).exists():
        return {"ok": False, "stdout": "", "parsed": None, "err_code": "boss_cli_not_installed"}

    cmd = [bin_path] + args + ["--json"]
    env = dict(os.environ, PYTHONIOENCODING="utf-8", BOSS_COOKIES=cookies_header)
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
            env=env, encoding="utf-8", errors="ignore",
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "stdout": "", "parsed": None, "err_code": "timeout"}
    except Exception as e:
        return {"ok": False, "stdout": "", "parsed": None, "err_code": f"exec_error:{e}"}

    out = (proc.stdout or "").strip()
    err = (proc.stderr or "").strip()
    parsed = None
    try:
        parsed = json.loads(out) if out else None
    except Exception:
        parsed = None

    # 判定 ok：退出码0 且（有标准信封 ok=True 或 裸 dict 含目标数据）
    ok = proc.returncode == 0
    if isinstance(parsed, dict):
        if "ok" in parsed:
            ok = ok and bool(parsed.get("ok"))
        elif "geekList" in parsed or "resultList" in parsed or "jobList" in parsed or "encryptJobId" in parsed:
            ok = True
    # 错误码归类（与 boss_service._run 对齐）
    err_code = ""
    if not ok:
        msg = err or out
        if "code" in msg and any(c in msg for c in ("37", "stoken", "环境异常")):
            err_code = "needs_stoken"
        elif "not_authenticated" in msg or "未登录" in msg:
            err_code = "not_authenticated"
        elif "rate_limited" in msg or "429" in msg:
            err_code = "rate_limited"
        else:
            err_code = "unknown"
    return {"ok": ok, "stdout": out, "parsed": parsed, "err_code": err_code}


def _summary_line(label: str, result: dict, *, need_stoken: bool) -> tuple[str, str, str]:
    """格式化单条测试结果，返回 (状态, 说明, err_code)。"""
    if result["ok"]:
        # 看是否有数据
        parsed = result.get("parsed")
        has_data = False
        if isinstance(parsed, dict):
            data = parsed.get("data") if "data" in parsed else parsed
            if isinstance(data, dict):
                has_data = bool(
                    data.get("geekList") or data.get("resultList")
                    or data.get("jobList") or data.get("encryptJobId")
                    or data.get("zpData")
                )
            elif isinstance(data, list):
                has_data = len(data) > 0
        status = "✅ PASS" if has_data else "⚠️  EMPTY"
        note = "有数据" if has_data else "成功但无数据"
        return status, note, ""
    # 失败
    code = result.get("err_code") or "unknown"
    if need_stoken and code == "needs_stoken":
        return "❌ FAIL", "报 stoken/code=37 —— Camoufox 补的 stoken 未生效", code
    if code == "not_authenticated":
        return "❌ FAIL", "未登录（会话 cookie 失效或未注入）", code
    if code == "rate_limited":
        return "⚠️  RATE", "触发频控，非 stoken 问题，稍后重试", code
    return "❌ FAIL", f"失败 code={code}", code


def run_api_tests(cookies: dict) -> list[dict]:
    """对同一组凭证跑对照接口测试。"""
    _banner("步骤 2 / 3：招聘端接口对照测试")
    if not cookies:
        print("  ⏭️  无凭证，跳过接口测试")
        return []

    cookies_header = "; ".join(f"{k}={v}" for k, v in cookies.items())
    has_stoken = "__zp_stoken__" in cookies
    print(f"  使用凭证：{len(cookies)} 个 cookie，stoken={'有' if has_stoken else '无'}")
    print(f"  测试关键词：{TEST_KEYWORD}\n")

    tests: list[dict] = []
    # ── 基线组（不需 stoken）──
    print("  [基线组·不需 stoken，应通过]")
    r = _run_boss(["recruiter", "jobs"], cookies_header)
    status, note, code = _summary_line("jobs", r, need_stoken=False)
    print(f"    recruiter jobs       {status}  {note}")
    tests.append({"name": "jobs", "need_stoken": False, "status": status, "note": note, "code": code})
    time.sleep(1.5)

    r = _run_boss(["recruiter", "recommend", "-n", "3"], cookies_header)
    status, note, code = _summary_line("recommend", r, need_stoken=False)
    print(f"    recruiter recommend  {status}  {note}")
    tests.append({"name": "recommend", "need_stoken": False, "status": status, "note": note, "code": code})
    time.sleep(1.5)

    # ── 关键判定组（需要 stoken）──
    print("\n  [关键判定组·需要 stoken]")
    if not has_stoken:
        print(f"    recruiter search     ⏭️  SKIP  凭证无 stoken，search 必然失败，跳过")
        tests.append({"name": "search", "need_stoken": True, "status": "⏭️  SKIP",
                      "note": "凭证无 stoken", "code": "no_stoken"})
    else:
        r = _run_boss(["recruiter", "search", TEST_KEYWORD, "-c", "上海"], cookies_header, timeout=60)
        status, note, code = _summary_line("search", r, need_stoken=True)
        print(f"    recruiter search     {status}  {note}")
        # 失败时打印原始返回，便于诊断
        if not r["ok"] and r.get("stdout"):
            print(f"      └ 原始返回: {r['stdout'][:300]}")
        tests.append({"name": "search", "need_stoken": True, "status": status, "note": note, "code": code})

    return tests


# ── 步骤3：结论汇总 ────────────────────────────────────────────────
def conclude(login_ok: bool, has_stoken: bool, tests: list[dict]) -> int:
    _banner("步骤 3 / 3：结论汇总")
    print("  ┌──────────────────────────────────────────────────────────┐")
    print(f"  │ 扫码登录完成      : {'✅ 是' if login_ok else '❌ 否'}")
    print(f"  │ __zp_stoken__ 生成 : {'✅ 是' if has_stoken else '❌ 否（反爬拒绝/未安装）'}")
    print("  ├──────────────────────────────────────────────────────────┤")
    print("  │ 接口测试明细：")
    for t in tests:
        print(f"  │   {t['status']}  {t['name']:<10} (需stoken:{('是' if t['need_stoken'] else '否')})  {t['note']}")
    print("  └──────────────────────────────────────────────────────────┘\n")

    # 判定
    search_test = next((t for t in tests if t["name"] == "search"), None)
    baseline_ok = all(
        t["status"] in ("✅ PASS", "⚠️  EMPTY") for t in tests if not t["need_stoken"]
    ) and any(t["status"] == "✅ PASS" for t in tests if not t["need_stoken"])

    if not login_ok:
        print("  🔴 结论：扫码登录流程本身未跑通（环境/反爬问题），无法判断 stoken 方案。")
        print("     建议：检查 camoufox 安装、网络、是否在云服务器 IP 被风控。")
        return 2
    if not has_stoken:
        print("  🟡 结论：扫码成功但 Camoufox 未能生成 __zp_stoken__（BOSS 反爬拒绝）。")
        print("     纯扫码【无法】解决所有问题：recommend/jobs 可用，search/简历/打招呼受限。")
        print("     建议：维持浏览器扩展导入方案；或换住宅 IP / 更新 Camoufox 重试。")
        return 1
    # stoken 有，看 search
    if search_test and search_test["status"] == "✅ PASS":
        print("  🟢 结论：stoken 生成成功且 search 接口可用 —— 纯扫码【能】解决所有问题！")
        print("     可推进：改造 boss_qr_service 接入 browser_qr_login 作为主登录路径。")
        return 0
    if search_test and search_test["status"] in ("❌ FAIL",):
        print("  🟡 结论：stoken 生成了，但 search 仍失败（code=37/环境异常）。")
        print("     stoken 与会话可能未正确绑定，或反爬在接口层仍拦截。")
        print("     建议：把完整原始返回反馈给开发，进一步诊断。")
        return 1
    # search EMPTY 或 RATE
    print("  🟡 结论：stoken 生成 + search 未报错但无数据/触发频控，结果不充分。")
    print("     建议更换关键词或稍后重试 search 再下结论。")
    return 1


def main() -> int:
    _banner("BOSS 直聘 Camoufox stoken 生成 PoC")
    print("  验证目标：服务器端虚拟浏览器能否为扫码登录补全 __zp_stoken__，")
    print("  使 search / 简历 / 打招呼等「需要 stoken」的接口可用。")

    env_results = check_env()
    _banner("环境检查")
    env_ok = _print_env(env_results)
    if not env_ok:
        print("\n  ❌ 环境不满足，请先按提示安装依赖后再运行本脚本。")
        return 2

    # 步骤1
    cookies = do_browser_login()
    login_ok = bool(cookies and ("wt2" in cookies or "zp_at" in cookies))
    has_stoken = bool(cookies and "__zp_stoken__" in cookies)

    # 步骤2
    tests = run_api_tests(cookies or {})

    # 步骤3
    return conclude(login_ok, has_stoken, tests)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\n  用户中断。")
        sys.exit(130)
