# backend/tests/test_alembic_migrations.py
"""Alembic 迁移基线：确保 `alembic upgrade head` 在全新数据库上建出的表结构
与 `db.create_all()`（现有测试路径）完全一致，不产生 schema drift。

对应 docs/项目不足分析.md C1（无数据库迁移框架）。这里只新增迁移工具链，
不改变 conftest.py 现有的 create_all()/drop_all() 测试夹具路径（R6 验收门禁不变）。
"""
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _run_alembic(args, db_path):
    env = {
        **__import__("os").environ,
        "DATABASE_URL": f"sqlite:///{db_path}",
    }
    return subprocess.run(
        [sys.executable, "-m", "alembic"] + args,
        cwd=str(BACKEND_DIR),
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )


def _table_names(db_path):
    import sqlite3

    con = sqlite3.connect(str(db_path))
    try:
        rows = con.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'alembic_version'"
        ).fetchall()
        return sorted(r[0] for r in rows)
    finally:
        con.close()


@pytest.fixture()
def alembic_available():
    try:
        import alembic  # noqa: F401
    except ImportError:
        pytest.skip("alembic 未安装")


def _run_create_all(db_path):
    """在独立子进程里跑 create_app()，避免污染本进程内被所有其它测试共享的
    全局 `db = SQLAlchemy()` 单例（曾经把它放进程内跑导致 182 个无关测试失败）。"""
    env = {**__import__("os").environ, "DATABASE_URL": f"sqlite:///{db_path}"}
    code = (
        "from backend.app import create_app; create_app()"
    )
    return subprocess.run(
        [sys.executable, "-c", code],
        cwd=str(BACKEND_DIR.parent),
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )


def test_alembic_upgrade_head_matches_create_all_schema(tmp_path, alembic_available):
    alembic_db = tmp_path / "alembic_upgrade.db"
    result = _run_alembic(["upgrade", "head"], alembic_db)
    assert result.returncode == 0, f"alembic upgrade head 失败:\n{result.stdout}\n{result.stderr}"
    assert alembic_db.exists(), "alembic upgrade head 应该建出数据库文件"

    createall_db = tmp_path / "createall.db"
    createall_result = _run_create_all(createall_db)
    assert createall_result.returncode == 0, (
        f"create_all() 子进程失败:\n{createall_result.stdout}\n{createall_result.stderr}"
    )

    alembic_tables = _table_names(alembic_db)
    createall_tables = _table_names(createall_db)
    assert alembic_tables == createall_tables, (
        "alembic upgrade head 建出的表与 db.create_all() 不一致，"
        "存在 schema drift，需要新增迁移文件同步模型变更。\n"
        f"alembic: {alembic_tables}\ncreate_all: {createall_tables}"
    )


def test_alembic_check_reports_no_drift(tmp_path, alembic_available):
    """`alembic check`：确认当前模型与已生成的迁移历史一致（无未生成的 autogenerate diff）。"""
    db_path = tmp_path / "alembic_check.db"
    upgrade = _run_alembic(["upgrade", "head"], db_path)
    assert upgrade.returncode == 0, upgrade.stderr

    check = _run_alembic(["check"], db_path)
    assert check.returncode == 0, (
        "alembic check 检测到模型与迁移历史存在差异（有人改了 models.py 但没生成迁移）：\n"
        f"{check.stdout}\n{check.stderr}"
    )
