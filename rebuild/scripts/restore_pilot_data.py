#!/usr/bin/env python3
"""Restore Java rebuild pilot PostgreSQL data and uploaded files from a backup.

Default mode is a dry run. Pass --confirm to run pg_restore and replace uploads.
Always create a fresh backup before confirming a restore.
"""

import argparse
import os
import shutil
import subprocess
import tarfile
from datetime import datetime, timezone
from pathlib import Path

import backup_pilot_data


def restore_database(backup_dir: Path, dry_run: bool) -> None:
    dump_path = backup_dir / "database.dump"
    if not dump_path.exists() and not dry_run:
        raise SystemExit(f"Missing database dump: {dump_path}")
    pg_env = backup_pilot_data.parse_postgres_env(backup_pilot_data.normalized_database_url())
    command = [
        "pg_restore",
        "--clean",
        "--if-exists",
        "--no-owner",
        "--dbname",
        pg_env.get("PGDATABASE", ""),
        str(dump_path),
    ]
    if dry_run:
        print(
            " ".join(command)
            + f" (PGHOST={pg_env.get('PGHOST')} PGDATABASE={pg_env.get('PGDATABASE')} PGUSER={pg_env.get('PGUSER')})"
        )
        return
    subprocess.run(command, env=pg_env, check=True)


def restore_uploads(backup_dir: Path, upload_folder: Path, dry_run: bool) -> None:
    archive_path = backup_dir / "uploads.tar.gz"
    if not archive_path.exists() and not dry_run:
        raise SystemExit(f"Missing upload archive: {archive_path}")
    if dry_run:
        print(f"replace uploads {upload_folder} from {archive_path}")
        return

    if upload_folder.exists():
        archive_current = upload_folder.with_name(upload_folder.name + ".before-restore-" + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S"))
        shutil.move(str(upload_folder), str(archive_current))
    upload_folder.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive_path, "r:gz") as archive:
        archive.extractall(upload_folder.parent)


def main() -> None:
    parser = argparse.ArgumentParser(description="Restore Java rebuild pilot database and uploads.")
    parser.add_argument("--backup-dir", required=True, help="Backup directory containing database.dump and uploads.tar.gz.")
    parser.add_argument("--confirm", action="store_true", help="Actually restore data. Without this, only prints actions.")
    args = parser.parse_args()

    backup_dir = Path(args.backup_dir).expanduser().resolve()
    upload_folder = backup_pilot_data.env_path("UPLOAD_FOLDER", "/srv/hireinsight/uploads")
    dry_run = not args.confirm

    print("RESTORE CONFIRMED" if args.confirm else "DRY RUN")
    restore_database(backup_dir, dry_run)
    restore_uploads(backup_dir, upload_folder, dry_run)
    print("restore plan ok" if dry_run else "restore complete")


if __name__ == "__main__":
    main()
