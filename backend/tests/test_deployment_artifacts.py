import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_nginx_sample_covers_security_headers_and_hot_path_limits():
    config_path = ROOT / "deploy" / "nginx" / "zhipin.conf.example"
    assert config_path.exists()

    content = config_path.read_text()
    assert "add_header X-Frame-Options" in content
    assert "add_header X-Content-Type-Options" in content
    assert "add_header Referrer-Policy" in content
    assert "limit_req_zone" in content
    assert "location = /api/auth/login" in content
    assert "location = /api/agent/chat" in content
    assert "location = /api/resume/upload" in content


def test_backup_script_dry_run_lists_database_and_uploads_targets(tmp_path):
    script = ROOT / "backend" / "scripts" / "backup_pilot_data.py"
    assert script.exists()

    env = os.environ.copy()
    env.update({
        "DATABASE_URL": "postgresql://user:pass@db:5432/zhipin",
        "UPLOAD_FOLDER": str(tmp_path / "uploads"),
        "BACKUP_DIR": str(tmp_path / "backups"),
    })
    result = subprocess.run(
        [sys.executable, str(script), "--dry-run"],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "pg_dump" in result.stdout
    assert "uploads" in result.stdout
    assert str(tmp_path / "backups") in result.stdout
