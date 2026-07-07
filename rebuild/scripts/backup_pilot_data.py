#!/usr/bin/env python3
"""Back up Java rebuild pilot PostgreSQL data and uploaded files.

Environment:
  DATABASE_URL       jdbc:postgresql://host:port/database or postgresql://...
  DATABASE_USER      PostgreSQL user
  DATABASE_PASSWORD  PostgreSQL password
  UPLOAD_FOLDER      Directory containing uploaded resumes
  BACKUP_DIR         Destination directory for backup artifacts
"""

import argparse
import json
import os
import subprocess
import tarfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]


def timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def env_path(name: str, default: str) -> Path:
    return Path(os.environ.get(name, default)).expanduser().resolve()


def normalized_database_url() -> str:
    return os.environ.get("DATABASE_URL", "jdbc:postgresql://localhost:5432/hireinsight")


def parse_postgres_env(database_url: str) -> dict[str, str]:
    normalized = database_url
    if normalized.startswith("jdbc:postgresql://"):
        normalized = "postgresql://" + normalized[len("jdbc:postgresql://"):]
    if normalized.startswith("postgresql+psycopg://"):
        normalized = normalized.replace("postgresql+psycopg://", "postgresql://", 1)
    if not normalized.startswith("postgresql://"):
        raise SystemExit("DATABASE_URL must use jdbc:postgresql:// or postgresql:// for Java rebuild pilot backups.")

    parsed = urlparse(normalized)
    env = os.environ.copy()
    env.update({
        "PGHOST": parsed.hostname or "localhost",
        "PGPORT": str(parsed.port or 5432),
        "PGDATABASE": unquote(parsed.path.lstrip("/")),
        "PGUSER": unquote(parsed.username or os.environ.get("DATABASE_USER", "")),
    })
    password = parsed.password or os.environ.get("DATABASE_PASSWORD", "")
    if password:
        env["PGPASSWORD"] = unquote(password)
    return env


def backup_database(target_dir: Path, dry_run: bool) -> None:
    dump_path = target_dir / "database.dump"
    command = ["pg_dump", "--format=custom", "--file", str(dump_path)]
    pg_env = parse_postgres_env(normalized_database_url())
    if dry_run:
        print(
            " ".join(command)
            + f" (PGHOST={pg_env.get('PGHOST')} PGDATABASE={pg_env.get('PGDATABASE')} PGUSER={pg_env.get('PGUSER')})"
        )
        return
    subprocess.run(command, env=pg_env, check=True)


def backup_uploads(upload_folder: Path, target_dir: Path, dry_run: bool) -> None:
    target = target_dir / "uploads.tar.gz"
    if dry_run:
        print(f"tar uploads {upload_folder} -> {target}")
        return
    upload_folder.mkdir(parents=True, exist_ok=True)
    with tarfile.open(target, "w:gz") as archive:
        archive.add(upload_folder, arcname="uploads")


def write_manifest(target_dir: Path, upload_folder: Path, dry_run: bool) -> None:
    manifest = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "databaseUrl": normalized_database_url(),
        "uploadFolder": str(upload_folder),
        "artifacts": ["database.dump", "uploads.tar.gz"],
    }
    if dry_run:
        print("manifest " + json.dumps(manifest, ensure_ascii=False))
        return
    (target_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Back up Java rebuild pilot database and uploads.")
    parser.add_argument("--dry-run", action="store_true", help="Print planned actions without writing backup files.")
    args = parser.parse_args()

    backup_root = env_path("BACKUP_DIR", str(ROOT / "backups"))
    upload_folder = env_path("UPLOAD_FOLDER", "/srv/hireinsight/uploads")
    target_dir = backup_root / timestamp()

    if args.dry_run:
        print(f"backup dir {target_dir}")
    else:
        target_dir.mkdir(parents=True, exist_ok=True)

    backup_database(target_dir, args.dry_run)
    backup_uploads(upload_folder, target_dir, args.dry_run)
    write_manifest(target_dir, upload_folder, args.dry_run)
    print("backup plan ok" if args.dry_run else f"backup complete: {target_dir}")


if __name__ == "__main__":
    main()
