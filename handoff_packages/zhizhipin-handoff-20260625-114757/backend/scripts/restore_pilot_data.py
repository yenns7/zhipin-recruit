#!/usr/bin/env python3
"""Restore pilot database data and uploaded resume files from a backup snapshot.

Environment:
  DATABASE_URL   PostgreSQL URL or sqlite:/// file URL to restore into
  UPLOAD_FOLDER  Destination directory for uploaded resume files

Usage:
  python backend/scripts/restore_pilot_data.py --backup-path /var/backups/zhipin/20260623-010101 --confirm
"""

import argparse
import os
import shutil
import subprocess
import tarfile
from pathlib import Path, PurePosixPath

from backup_pilot_data import _database_url, _postgres_env, _upload_folder


def _is_postgres(database_url):
    return database_url.startswith(("postgresql://", "postgresql+psycopg://"))


def _sqlite_path(database_url):
    if not database_url.startswith("sqlite:///"):
        return None
    return Path(database_url[len("sqlite:///"):]).expanduser().resolve()


def _restore_database(database_url, backup_path, dry_run=False):
    if _is_postgres(database_url):
        dump_path = backup_path / "database.dump"
        if not dump_path.exists():
            raise SystemExit(f"找不到 PostgreSQL 备份文件: {dump_path}")
        command = ["pg_restore", "--clean", "--if-exists", "--no-owner", "--dbname", _postgres_env(database_url)["PGDATABASE"], str(dump_path)]
        if dry_run:
            print(" ".join(command))
            return
        subprocess.run(command, env=_postgres_env(database_url), check=True)
        return

    target = _sqlite_path(database_url)
    if target is not None:
        source = backup_path / target.name
        if not source.exists():
            candidates = sorted(backup_path.glob("*.sqlite")) + sorted(backup_path.glob("*.db"))
            source = candidates[0] if candidates else source
        if not source.exists():
            raise SystemExit(f"找不到 SQLite 备份文件: {source}")
        if dry_run:
            print(f"copy sqlite database {source} -> {target}")
            return
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        return

    raise SystemExit("Unsupported DATABASE_URL. Use PostgreSQL or sqlite:/// path.")


def _safe_extract_uploads(tar_path, upload_folder, dry_run=False):
    if not tar_path.exists():
        if dry_run:
            print(f"uploads archive missing, skip: {tar_path}")
            return
        raise SystemExit(f"找不到 uploads 备份文件: {tar_path}")

    upload_folder = upload_folder.expanduser().resolve()
    if dry_run:
        print(f"extract uploads {tar_path} -> {upload_folder}")
        return

    planned = []
    with tarfile.open(tar_path, "r:gz") as archive:
        for member in archive.getmembers():
            posix = PurePosixPath(member.name)
            if posix.is_absolute() or ".." in posix.parts or ":" in member.name or member.name.startswith("\\"):
                raise SystemExit(f"不安全的 uploads 备份路径: {member.name}")
            parts = list(posix.parts)
            if parts and parts[0] == "uploads":
                parts = parts[1:]
            if not parts:
                target = upload_folder
            else:
                target = (upload_folder / Path(*parts)).resolve()
            if target != upload_folder and upload_folder not in target.parents:
                raise SystemExit(f"不安全的 uploads 备份路径: {member.name}")
            planned.append((member, target))

        if upload_folder.exists():
            shutil.rmtree(upload_folder)
        upload_folder.mkdir(parents=True, exist_ok=True)
        for member, target in planned:
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                target.parent.mkdir(parents=True, exist_ok=True)
                source = archive.extractfile(member)
                if source is None:
                    continue
                with source, open(target, "wb") as destination:
                    shutil.copyfileobj(source, destination)


def main():
    parser = argparse.ArgumentParser(description="Restore pilot database and uploads from a backup snapshot.")
    parser.add_argument("--backup-path", required=True, help="Backup snapshot directory created by backup_pilot_data.py.")
    parser.add_argument("--dry-run", action="store_true", help="Print planned actions without changing files.")
    parser.add_argument("--confirm", action="store_true", help="Required for destructive restore.")
    args = parser.parse_args()

    backup_path = Path(args.backup_path).expanduser().resolve()
    if not backup_path.is_dir():
        raise SystemExit(f"备份目录不存在: {backup_path}")
    if not args.dry_run and not args.confirm:
        raise SystemExit("恢复会覆盖当前数据库和 uploads。请确认备份无误后添加 --confirm。")

    _restore_database(_database_url(), backup_path, dry_run=args.dry_run)
    _safe_extract_uploads(backup_path / "uploads.tar.gz", _upload_folder(), dry_run=args.dry_run)

    print("restore plan ok" if args.dry_run else f"restore complete: {backup_path}")


if __name__ == "__main__":
    main()
