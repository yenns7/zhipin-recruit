#!/usr/bin/env python3
"""Check whether pilot deployment environment settings satisfy hard gates.

This script is read-only. It never prints secret values and never writes .env.
"""

import argparse
import fnmatch
import sys
from dataclasses import dataclass
from pathlib import Path


WEAK_SECRETS = {
    "",
    "dev-secret",
    "dev-secret-change-in-prod",
    "test-secret",
    "change-me-in-production",
}


@dataclass
class CheckResult:
    name: str
    ok: bool
    detail: str


def _parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def _is_true(value: str | None) -> bool:
    return (value or "").strip().lower() == "true"


def _is_false(value: str | None) -> bool:
    return (value or "").strip().lower() == "false"


def _is_positive_int(value: str | None) -> bool:
    try:
        return int(value or "") > 0
    except ValueError:
        return False


def _database_kind(database_url: str) -> str:
    if database_url.startswith(("postgresql://", "postgresql+psycopg://")):
        return "postgresql"
    if database_url.startswith("sqlite:///"):
        return "sqlite"
    if not database_url:
        return "missing"
    return "unsupported"


def _gitignore_patterns(project_root: Path) -> list[str]:
    gitignore = project_root / ".gitignore"
    if not gitignore.exists():
        return []
    patterns = []
    for raw_line in gitignore.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("!"):
            continue
        patterns.append(line.lstrip("/"))
    return patterns


def _env_is_ignored(project_root: Path, env_file: Path) -> bool:
    try:
        rel = env_file.resolve().relative_to(project_root.resolve()).as_posix()
    except ValueError:
        return False

    name = env_file.name
    for pattern in _gitignore_patterns(project_root):
        if pattern == rel:
            return True
        if pattern == ".env" and name == ".env":
            return True
        if fnmatch.fnmatch(rel, pattern) or fnmatch.fnmatch(name, pattern):
            return True
    return False


def run_checks(values: dict[str, str], project_root: Path, env_file: Path) -> list[CheckResult]:
    secret = values.get("JWT_SECRET", "")
    database_url = values.get("DATABASE_URL", "")
    database_kind = _database_kind(database_url)

    checks = [
        CheckResult(
            "JWT_SECRET",
            len(secret) >= 32 and secret not in WEAK_SECRETS,
            "长度需 >=32 且不能是默认弱值",
        ),
        CheckResult("JWT_EXPIRY_HOURS", _is_positive_int(values.get("JWT_EXPIRY_HOURS")), "需配置为正整数"),
        CheckResult("FLASK_DEBUG", _is_false(values.get("FLASK_DEBUG")), "生产/试点必须为 false"),
        CheckResult("DATABASE_URL", database_kind == "postgresql", f"生产/试点需使用 PostgreSQL，当前类型：{database_kind}"),
        CheckResult("CORS_ORIGINS", bool(values.get("CORS_ORIGINS", "").strip()), "生产/试点必须配置公司域名白名单"),
        CheckResult("SECURITY_HEADERS_ENABLED", _is_true(values.get("SECURITY_HEADERS_ENABLED")), "必须显式为 true"),
        CheckResult("RATE_LIMIT_ENABLED", _is_true(values.get("RATE_LIMIT_ENABLED")), "必须显式为 true"),
        CheckResult("RATE_LIMIT_LOGIN", _is_positive_int(values.get("RATE_LIMIT_LOGIN")), "必须显式配置正整数"),
        CheckResult("RATE_LIMIT_AGENT_CHAT", _is_positive_int(values.get("RATE_LIMIT_AGENT_CHAT")), "必须显式配置正整数"),
        CheckResult("RATE_LIMIT_RESUME_UPLOAD", _is_positive_int(values.get("RATE_LIMIT_RESUME_UPLOAD")), "必须显式配置正整数"),
        CheckResult("BACKUP_DIR", bool(values.get("BACKUP_DIR", "").strip()), "必须配置服务器备份目录"),
        CheckResult("ALLOW_PUBLIC_REGISTRATION", _is_false(values.get("ALLOW_PUBLIC_REGISTRATION")), "生产/试点必须关闭公开注册"),
        CheckResult(".env gitignore", _env_is_ignored(project_root, env_file), "真实 .env 必须被 .gitignore 忽略"),
    ]
    return checks


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="Check pilot deployment readiness without printing secrets.")
    parser.add_argument("--env-file", default=str(root / "backend" / ".env"), help="Path to backend .env")
    parser.add_argument("--project-root", default=str(root), help="Project root containing .gitignore")
    args = parser.parse_args()

    env_file = Path(args.env_file).expanduser()
    project_root = Path(args.project_root).expanduser()
    values = _parse_env_file(env_file)

    checks = run_checks(values, project_root, env_file)
    failed = [check for check in checks if not check.ok]

    print("试点部署前自检")
    print(f"env_file={env_file}")
    for check in checks:
        marker = "PASS" if check.ok else "FAIL"
        print(f"[{marker}] {check.name}: {check.detail}")

    if failed:
        print(f"自检未通过：{len(failed)} 项需要处理。")
        return 1

    print("试点部署前自检通过。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
