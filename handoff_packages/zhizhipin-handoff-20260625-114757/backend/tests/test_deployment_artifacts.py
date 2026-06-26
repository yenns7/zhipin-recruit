import os
import shutil
import sqlite3
import subprocess
import sys
import tarfile
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


def test_pilot_readiness_check_fails_without_required_production_env(tmp_path):
    script = ROOT / "backend" / "scripts" / "check_pilot_readiness.py"
    env_file = tmp_path / "backend" / ".env"
    env_file.parent.mkdir()
    env_file.write_text(
        "\n".join([
            "JWT_SECRET=short-secret",
            "FLASK_DEBUG=true",
            "DATABASE_URL=sqlite:///local.db",
            "CORS_ORIGINS=",
        ])
    )

    result = subprocess.run(
        [sys.executable, str(script), "--env-file", str(env_file), "--project-root", str(tmp_path)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 1
    assert "JWT_SECRET" in result.stdout
    assert "FLASK_DEBUG" in result.stdout
    assert "DATABASE_URL" in result.stdout
    assert "CORS_ORIGINS" in result.stdout
    assert "short-secret" not in result.stdout


def test_pilot_readiness_check_passes_with_production_env(tmp_path):
    script = ROOT / "backend" / "scripts" / "check_pilot_readiness.py"
    env_file = tmp_path / "backend" / ".env"
    env_file.parent.mkdir()
    env_file.write_text(
        "\n".join([
            "JWT_SECRET=" + "x" * 48,
            "JWT_EXPIRY_HOURS=8",
            "FLASK_DEBUG=false",
            "DATABASE_URL=postgresql://user:pass@db:5432/zhipin",
            "CORS_ORIGINS=https://zhipin.example.com",
            "SECURITY_HEADERS_ENABLED=true",
            "RATE_LIMIT_ENABLED=true",
            "RATE_LIMIT_LOGIN=10",
            "RATE_LIMIT_AGENT_CHAT=20",
            "RATE_LIMIT_RESUME_UPLOAD=8",
            "BACKUP_DIR=/var/backups/zhipin",
            "ALLOW_PUBLIC_REGISTRATION=false",
            "AI_RECRUITMENT_COMPLIANCE_ACK=true",
            "CANDIDATE_PRIVACY_NOTICE_URL=https://zhipin.example.com/privacy",
            "AI_HUMAN_REVIEW_REQUIRED=true",
        ])
    )
    (tmp_path / ".gitignore").write_text("backend/.env\n*.env\n")

    result = subprocess.run(
        [sys.executable, str(script), "--env-file", str(env_file), "--project-root", str(tmp_path)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "试点部署前自检通过" in result.stdout


def test_pilot_readiness_check_requires_ai_compliance_flags(tmp_path):
    script = ROOT / "backend" / "scripts" / "check_pilot_readiness.py"
    env_file = tmp_path / "backend" / ".env"
    env_file.parent.mkdir()
    env_file.write_text(
        "\n".join([
            "JWT_SECRET=" + "x" * 48,
            "JWT_EXPIRY_HOURS=8",
            "FLASK_DEBUG=false",
            "DATABASE_URL=postgresql://user:pass@db:5432/zhipin",
            "CORS_ORIGINS=https://zhipin.example.com",
            "SECURITY_HEADERS_ENABLED=true",
            "RATE_LIMIT_ENABLED=true",
            "RATE_LIMIT_LOGIN=10",
            "RATE_LIMIT_AGENT_CHAT=20",
            "RATE_LIMIT_RESUME_UPLOAD=8",
            "BACKUP_DIR=/var/backups/zhipin",
            "ALLOW_PUBLIC_REGISTRATION=false",
        ])
    )
    (tmp_path / ".gitignore").write_text("backend/.env\n*.env\n")

    result = subprocess.run(
        [sys.executable, str(script), "--env-file", str(env_file), "--project-root", str(tmp_path)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 1
    assert "AI_RECRUITMENT_COMPLIANCE_ACK" in result.stdout
    assert "CANDIDATE_PRIVACY_NOTICE_URL" in result.stdout
    assert "AI_HUMAN_REVIEW_REQUIRED" in result.stdout


def test_restore_script_restores_sqlite_database_and_uploads(tmp_path):
    backup_script = ROOT / "backend" / "scripts" / "backup_pilot_data.py"
    restore_script = ROOT / "backend" / "scripts" / "restore_pilot_data.py"
    db_path = tmp_path / "pilot.sqlite"
    upload_folder = tmp_path / "uploads"
    backup_root = tmp_path / "backups"
    upload_folder.mkdir()

    connection = sqlite3.connect(db_path)
    connection.execute("CREATE TABLE candidates (id INTEGER PRIMARY KEY, name_masked TEXT)")
    connection.execute("INSERT INTO candidates (id, name_masked) VALUES (1, '恢复候选人')")
    connection.commit()
    connection.close()
    (upload_folder / "resume.pdf").write_text("resume", encoding="utf-8")

    env = os.environ.copy()
    env.update({
        "DATABASE_URL": "sqlite:///" + str(db_path),
        "UPLOAD_FOLDER": str(upload_folder),
        "BACKUP_DIR": str(backup_root),
    })
    backup = subprocess.run(
        [sys.executable, str(backup_script)],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert backup.returncode == 0
    snapshot = sorted(backup_root.iterdir())[-1]
    restore_upload_folder = tmp_path / "restored_uploads"

    db_path.unlink()
    for child in upload_folder.iterdir():
        child.unlink()
    upload_folder.rmdir()

    restore_env = env | {"UPLOAD_FOLDER": str(restore_upload_folder)}
    restore = subprocess.run(
        [sys.executable, str(restore_script), "--backup-path", str(snapshot), "--confirm"],
        cwd=str(ROOT),
        env=restore_env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert restore.returncode == 0
    connection = sqlite3.connect(db_path)
    row = connection.execute("SELECT name_masked FROM candidates WHERE id=1").fetchone()
    connection.close()
    assert row == ("恢复候选人",)
    assert (restore_upload_folder / "resume.pdf").read_text(encoding="utf-8") == "resume"


def test_restore_script_rejects_upload_tar_path_traversal(tmp_path):
    restore_script = ROOT / "backend" / "scripts" / "restore_pilot_data.py"
    backup_path = tmp_path / "backup"
    backup_path.mkdir()
    db_path = tmp_path / "pilot.sqlite"
    upload_folder = tmp_path / "uploads"
    upload_folder.mkdir()
    sqlite3.connect(db_path).close()
    shutil.copy2(db_path, backup_path / db_path.name)
    with tarfile.open(backup_path / "uploads.tar.gz", "w:gz") as archive:
        evil = tmp_path / "evil.txt"
        evil.write_text("evil", encoding="utf-8")
        archive.add(evil, arcname="../evil.txt")

    env = os.environ.copy()
    env.update({
        "DATABASE_URL": "sqlite:///" + str(db_path),
        "UPLOAD_FOLDER": str(upload_folder),
    })

    result = subprocess.run(
        [sys.executable, str(restore_script), "--backup-path", str(backup_path), "--confirm"],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode != 0
    assert "不安全" in (result.stderr + result.stdout)


def _seed_cleanup_database(db_path):
    connection = sqlite3.connect(db_path)
    cursor = connection.cursor()
    cursor.executescript(
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            role TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE jobs (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            jd_text TEXT NOT NULL,
            owner_hr_id INTEGER
        );
        CREATE TABLE candidates (
            id INTEGER PRIMARY KEY,
            owner_hr_id INTEGER,
            upload_batch_id INTEGER,
            name_masked TEXT,
            email_masked TEXT,
            phone_masked TEXT,
            resume_json JSON NOT NULL,
            raw_file_path TEXT
        );
        CREATE TABLE upload_batches (
            id INTEGER PRIMARY KEY,
            owner_hr_id INTEGER,
            target_job_id INTEGER
        );
        CREATE TABLE matches (
            id INTEGER PRIMARY KEY,
            job_id INTEGER,
            candidate_id INTEGER,
            score REAL NOT NULL
        );
        CREATE TABLE pipeline_stages (
            id INTEGER PRIMARY KEY,
            candidate_id INTEGER,
            job_id INTEGER,
            stage TEXT NOT NULL,
            updated_by INTEGER
        );
        CREATE TABLE interview_assignments (
            id INTEGER PRIMARY KEY,
            candidate_id INTEGER NOT NULL,
            job_id INTEGER NOT NULL,
            round TEXT NOT NULL,
            interviewer_id INTEGER NOT NULL,
            created_by INTEGER
        );
        CREATE TABLE notifications (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL
        );
        CREATE TABLE conversations (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            title TEXT
        );
        CREATE TABLE conversation_messages (
            id INTEGER PRIMARY KEY,
            conversation_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL
        );
        CREATE TABLE events (
            id INTEGER PRIMARY KEY,
            actor_id INTEGER,
            action TEXT NOT NULL,
            entity_id INTEGER,
            entity_type TEXT
        );
        CREATE TABLE audit_logs (
            id INTEGER PRIMARY KEY,
            actor_id INTEGER,
            target_table TEXT,
            target_id INTEGER,
            action TEXT
        );
        """
    )
    cursor.executescript(
        """
        INSERT INTO users (id, name, email, role, password_hash) VALUES
            (1, 'Demo HR', 'hr01@mvp.local', 'recruiter', 'x'),
            (2, 'Real HR', 'real@example.com', 'recruiter', 'x');
        INSERT INTO jobs (id, title, jd_text, owner_hr_id) VALUES
            (10, 'Demo Job', 'demo jd', 1),
            (20, 'Real Job', 'real jd', 2);
        INSERT INTO upload_batches (id, owner_hr_id, target_job_id) VALUES
            (100, 1, 10),
            (200, 2, 20);
        INSERT INTO candidates (
            id, owner_hr_id, upload_batch_id, name_masked, email_masked, phone_masked, resume_json, raw_file_path
        ) VALUES
            (1000, 1, 100, 'Demo Candidate', 'demo@example.com', '138', '{}', 'backend/uploads/demo.pdf'),
            (2000, 2, 200, 'Real Candidate', 'real@example.com', '139', '{}', 'backend/uploads/real.pdf');
        INSERT INTO matches (id, job_id, candidate_id, score) VALUES
            (1, 10, 1000, 90),
            (2, 20, 2000, 80);
        INSERT INTO pipeline_stages (id, candidate_id, job_id, stage, updated_by) VALUES
            (1, 1000, 10, 'pending', 1),
            (2, 2000, 20, 'pending', 2);
        INSERT INTO interview_assignments (id, candidate_id, job_id, round, interviewer_id, created_by) VALUES
            (1, 1000, 10, 'interview', 1, 1),
            (2, 2000, 20, 'interview', 2, 2);
        INSERT INTO notifications (id, user_id, type, title) VALUES
            (1, 1, 'demo', 'demo'),
            (2, 2, 'real', 'real');
        INSERT INTO conversations (id, user_id, title) VALUES
            (1, 1, 'demo'),
            (2, 2, 'real');
        INSERT INTO conversation_messages (id, conversation_id, role, content) VALUES
            (1, 1, 'user', 'demo'),
            (2, 2, 'user', 'real');
        INSERT INTO events (id, actor_id, action, entity_id, entity_type) VALUES
            (1, 1, 'demo', 1000, 'candidate'),
            (2, 2, 'real', 2000, 'candidate');
        INSERT INTO audit_logs (id, actor_id, target_table, target_id, action) VALUES
            (1, 1, 'candidates', 1000, 'demo'),
            (2, 2, 'candidates', 2000, 'real');
        """
    )
    connection.commit()
    connection.close()


def test_cleanup_demo_data_dry_run_does_not_delete_or_create_backup(tmp_path):
    script = ROOT / "backend" / "scripts" / "cleanup_demo_data.py"
    db_path = tmp_path / "hireinsight.db"
    backend_uploads = tmp_path / "backend" / "uploads"
    root_uploads = tmp_path / "uploads"
    backend_uploads.mkdir(parents=True)
    root_uploads.mkdir()
    (backend_uploads / "demo.pdf").write_text("demo")
    (root_uploads / "demo-root.pdf").write_text("demo root")
    _seed_cleanup_database(db_path)

    env = os.environ.copy()
    env.update({
        "DATABASE_URL": "sqlite:///" + str(db_path),
        "BACKUP_DIR": str(tmp_path / "backups"),
    })
    result = subprocess.run(
        [
            sys.executable,
            str(script),
            "--project-root",
            str(tmp_path),
            "--dry-run",
        ],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "DRY RUN" in result.stdout
    assert "users: 1" in result.stdout
    assert "backend/uploads files: 1" in result.stdout
    assert "uploads files: 1" in result.stdout
    assert sqlite3.connect(db_path).execute("SELECT COUNT(*) FROM users").fetchone()[0] == 2
    assert (backend_uploads / "demo.pdf").exists()
    assert not (tmp_path / "backups").exists()


def test_cleanup_demo_data_confirm_backs_up_then_deletes_demo_rows_and_uploads(tmp_path):
    script = ROOT / "backend" / "scripts" / "cleanup_demo_data.py"
    db_path = tmp_path / "hireinsight.db"
    backend_uploads = tmp_path / "backend" / "uploads"
    root_uploads = tmp_path / "uploads"
    backend_uploads.mkdir(parents=True)
    root_uploads.mkdir()
    (backend_uploads / "demo.pdf").write_text("demo")
    (root_uploads / "demo-root.pdf").write_text("demo root")
    _seed_cleanup_database(db_path)

    env = os.environ.copy()
    env.update({
        "DATABASE_URL": "sqlite:///" + str(db_path),
        "BACKUP_DIR": str(tmp_path / "backups"),
    })
    command = [
        sys.executable,
        str(script),
        "--project-root",
        str(tmp_path),
        "--confirm",
    ]
    first = subprocess.run(
        command,
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    second = subprocess.run(
        command,
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert first.returncode == 0
    assert second.returncode == 0
    assert "backup complete" in first.stdout
    assert "DELETE CONFIRMED" in first.stdout

    connection = sqlite3.connect(db_path)
    assert connection.execute("SELECT email FROM users").fetchall() == [("real@example.com",)]
    assert connection.execute("SELECT title FROM jobs").fetchall() == [("Real Job",)]
    assert connection.execute("SELECT name_masked FROM candidates").fetchall() == [("Real Candidate",)]
    assert connection.execute("SELECT COUNT(*) FROM matches").fetchone()[0] == 1
    assert connection.execute("SELECT COUNT(*) FROM pipeline_stages").fetchone()[0] == 1
    assert connection.execute("SELECT COUNT(*) FROM interview_assignments").fetchone()[0] == 1
    assert connection.execute("SELECT COUNT(*) FROM notifications").fetchone()[0] == 1
    assert connection.execute("SELECT COUNT(*) FROM conversation_messages").fetchone()[0] == 1
    assert connection.execute("SELECT COUNT(*) FROM events").fetchone()[0] == 1
    assert connection.execute("SELECT COUNT(*) FROM audit_logs").fetchone()[0] == 1
    connection.close()
    assert list(backend_uploads.glob("*")) == []
    assert list(root_uploads.glob("*")) == []
    assert list((tmp_path / "backups").glob("*"))
