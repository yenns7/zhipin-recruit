#!/usr/bin/env python3
"""Back up pilot database data and uploaded resume files.

Environment:
  DATABASE_URL   PostgreSQL URL or sqlite:/// file URL
  UPLOAD_FOLDER  Directory containing uploaded resume files
  BACKUP_DIR     Destination directory for backup artifacts
"""

import argparse
import os
import shutil
import subprocess
import tarfile
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parents[2]


def _env_path(name, default):
    return Path(os.environ.get(name, default)).expanduser().resolve()


def _database_url():
    return os.environ.get("DATABASE_URL", "sqlite:///" + str(ROOT / "backend" / "hireinsight.db"))


def _backup_dir():
    return _env_path("BACKUP_DIR", str(ROOT / "backups"))


def _upload_folder():
    return _env_path("UPLOAD_FOLDER", str(ROOT / "backend" / "uploads"))


def _timestamp():
    return datetime.now(UTC).strftime("%Y%m%d-%H%M%S")


def _postgres_env(database_url):
    normalized = database_url.replace("postgresql+psycopg://", "postgresql://", 1)
    parsed = urlparse(normalized)
    env = os.environ.copy()
    env.update({
        "PGHOST": parsed.hostname or "",
        "PGPORT": str(parsed.port or 5432),
        "PGDATABASE": unquote(parsed.path.lstrip("/")),
        "PGUSER": unquote(parsed.username or ""),
    })
    if parsed.password:
        env["PGPASSWORD"] = unquote(parsed.password)
    return env


def _backup_database(database_url, target_dir, dry_run=False):
    if database_url.startswith(("postgresql://", "postgresql+psycopg://")):
        dump_path = target_dir / "database.dump"
        command = ["pg_dump", "--format=custom", "--file", str(dump_path)]
        if dry_run:
            env = _postgres_env(database_url)
            print(
                "pg_dump --format=custom --file "
                f"{dump_path} (PGHOST={env.get('PGHOST')} PGDATABASE={env.get('PGDATABASE')})"
            )
            return
        subprocess.run(command, env=_postgres_env(database_url), check=True)
        return

    if database_url.startswith("sqlite:///"):
        source = Path(database_url[len("sqlite:///"):]).expanduser().resolve()
        target = target_dir / source.name
        if dry_run:
            print(f"copy sqlite database {source} -> {target}")
            return
        if source.exists():
            shutil.copy2(source, target)
        return

    raise SystemExit("Unsupported DATABASE_URL. Use PostgreSQL or sqlite:/// path.")


def _backup_uploads(upload_folder, target_dir, dry_run=False):
    target = target_dir / "uploads.tar.gz"
    if dry_run:
        print(f"tar uploads {upload_folder} -> {target}")
        return
    if not upload_folder.exists():
        upload_folder.mkdir(parents=True, exist_ok=True)
    with tarfile.open(target, "w:gz") as archive:
        archive.add(upload_folder, arcname="uploads")


def main():
    parser = argparse.ArgumentParser(description="Back up pilot database and uploads.")
    parser.add_argument("--dry-run", action="store_true", help="Print planned actions without writing files.")
    args = parser.parse_args()

    backup_root = _backup_dir()
    target_dir = backup_root / _timestamp()
    if args.dry_run:
        print(f"backup dir {target_dir}")
    else:
        target_dir.mkdir(parents=True, exist_ok=True)

    _backup_database(_database_url(), target_dir, dry_run=args.dry_run)
    _backup_uploads(_upload_folder(), target_dir, dry_run=args.dry_run)

    print("backup plan ok" if args.dry_run else f"backup complete: {target_dir}")


if __name__ == "__main__":
    main()
