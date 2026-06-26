#!/usr/bin/env python3
"""Clean local demo data after backing up database and uploads.

Default mode is a dry run. Pass --confirm to delete rows and upload files.
"""

import argparse
import os
import shutil
import sys
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import MetaData, and_, create_engine, delete, inspect, or_, select


ROOT = Path(__file__).resolve().parents[2]


def _database_url():
    url = os.environ.get("DATABASE_URL")
    if url:
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return "sqlite:///" + str(ROOT / "backend" / "hireinsight.db")


def _load_tables(engine):
    metadata = MetaData()
    metadata.reflect(bind=engine)
    return metadata.tables


def _ids(connection, table, *conditions):
    if table is None or "id" not in table.c:
        return set()
    query = select(table.c.id)
    if conditions:
        query = query.where(or_(*conditions))
    return {row[0] for row in connection.execute(query)}


def _in(table, column, values):
    if table is None or column not in table.c or not values:
        return None
    return table.c[column].in_(values)


def _eq(table, column, value):
    if table is None or column not in table.c:
        return None
    return table.c[column] == value


def _or(*conditions):
    conditions = [condition for condition in conditions if condition is not None]
    if not conditions:
        return None
    return or_(*conditions)


def _like(table, column, pattern):
    if table is None or column not in table.c:
        return None
    return table.c[column].like(pattern)


def _and(*conditions):
    if any(condition is None for condition in conditions):
        return None
    return and_(*conditions)


def _collect_plan(connection, tables, demo_domain):
    users = tables.get("users")
    jobs = tables.get("jobs")
    candidates = tables.get("candidates")
    upload_batches = tables.get("upload_batches")
    talent_maps = tables.get("talent_maps")
    talent_map_companies = tables.get("talent_map_companies")
    conversations = tables.get("conversations")

    demo_user_ids = _ids(connection, users, _like(users, "email", f"%{demo_domain}"))
    demo_job_ids = _ids(connection, jobs, _in(jobs, "owner_hr_id", demo_user_ids))
    demo_upload_batch_ids = _ids(
        connection,
        upload_batches,
        _in(upload_batches, "owner_hr_id", demo_user_ids),
        _in(upload_batches, "target_job_id", demo_job_ids),
    )
    demo_candidate_ids = _ids(
        connection,
        candidates,
        _in(candidates, "owner_hr_id", demo_user_ids),
        _in(candidates, "upload_batch_id", demo_upload_batch_ids),
    )
    demo_talent_map_ids = _ids(
        connection,
        talent_maps,
        _in(talent_maps, "owner_hr_id", demo_user_ids),
        _in(talent_maps, "job_id", demo_job_ids),
    )
    demo_talent_company_ids = _ids(
        connection,
        talent_map_companies,
        _in(talent_map_companies, "map_id", demo_talent_map_ids),
    )
    demo_conversation_ids = _ids(
        connection,
        conversations,
        _in(conversations, "user_id", demo_user_ids),
    )

    conditions = {
        "conversation_messages": _in(tables.get("conversation_messages"), "conversation_id", demo_conversation_ids),
        "conversations": _in(conversations, "id", demo_conversation_ids),
        "interview_feedback": _or(
            _in(tables.get("interview_feedback"), "candidate_id", demo_candidate_ids),
            _in(tables.get("interview_feedback"), "job_id", demo_job_ids),
            _in(tables.get("interview_feedback"), "interviewer_id", demo_user_ids),
        ),
        "interview_assignments": _or(
            _in(tables.get("interview_assignments"), "candidate_id", demo_candidate_ids),
            _in(tables.get("interview_assignments"), "job_id", demo_job_ids),
            _in(tables.get("interview_assignments"), "interviewer_id", demo_user_ids),
            _in(tables.get("interview_assignments"), "created_by", demo_user_ids),
        ),
        "offer_records": _or(
            _in(tables.get("offer_records"), "candidate_id", demo_candidate_ids),
            _in(tables.get("offer_records"), "job_id", demo_job_ids),
            _in(tables.get("offer_records"), "created_by", demo_user_ids),
        ),
        "candidate_dispositions": _or(
            _in(tables.get("candidate_dispositions"), "candidate_id", demo_candidate_ids),
            _in(tables.get("candidate_dispositions"), "job_id", demo_job_ids),
            _in(tables.get("candidate_dispositions"), "created_by", demo_user_ids),
        ),
        "pipeline_stages": _or(
            _in(tables.get("pipeline_stages"), "candidate_id", demo_candidate_ids),
            _in(tables.get("pipeline_stages"), "job_id", demo_job_ids),
            _in(tables.get("pipeline_stages"), "updated_by", demo_user_ids),
        ),
        "interviews": _or(
            _in(tables.get("interviews"), "candidate_id", demo_candidate_ids),
            _in(tables.get("interviews"), "job_id", demo_job_ids),
        ),
        "matches": _or(
            _in(tables.get("matches"), "candidate_id", demo_candidate_ids),
            _in(tables.get("matches"), "job_id", demo_job_ids),
        ),
        "candidate_tags": _in(tables.get("candidate_tags"), "candidate_id", demo_candidate_ids),
        "notifications": _in(tables.get("notifications"), "user_id", demo_user_ids),
        "events": _or(
            _in(tables.get("events"), "actor_id", demo_user_ids),
            _and(
                _eq(tables.get("events"), "entity_type", "candidate"),
                _in(tables.get("events"), "entity_id", demo_candidate_ids),
            ),
            _and(
                _eq(tables.get("events"), "entity_type", "job"),
                _in(tables.get("events"), "entity_id", demo_job_ids),
            ),
        ),
        "audit_logs": _or(
            _in(tables.get("audit_logs"), "actor_id", demo_user_ids),
            _and(
                _eq(tables.get("audit_logs"), "target_table", "candidates"),
                _in(tables.get("audit_logs"), "target_id", demo_candidate_ids),
            ),
            _and(
                _eq(tables.get("audit_logs"), "target_table", "jobs"),
                _in(tables.get("audit_logs"), "target_id", demo_job_ids),
            ),
        ),
        "talent_map_people": _or(
            _in(tables.get("talent_map_people"), "map_id", demo_talent_map_ids),
            _in(tables.get("talent_map_people"), "company_id", demo_talent_company_ids),
        ),
        "talent_map_companies": _in(tables.get("talent_map_companies"), "map_id", demo_talent_map_ids),
        "talent_maps": _in(talent_maps, "id", demo_talent_map_ids),
        "recruitment_demands": _or(
            _in(tables.get("recruitment_demands"), "owner_hr_id", demo_user_ids),
            _in(tables.get("recruitment_demands"), "job_id", demo_job_ids),
        ),
        "candidates": _in(candidates, "id", demo_candidate_ids),
        "upload_batches": _in(upload_batches, "id", demo_upload_batch_ids),
        "jobs": _in(jobs, "id", demo_job_ids),
        "users": _in(users, "id", demo_user_ids),
    }

    delete_order = [
        "conversation_messages",
        "conversations",
        "interview_feedback",
        "interview_assignments",
        "offer_records",
        "candidate_dispositions",
        "pipeline_stages",
        "interviews",
        "matches",
        "candidate_tags",
        "notifications",
        "events",
        "audit_logs",
        "talent_map_people",
        "talent_map_companies",
        "talent_maps",
        "recruitment_demands",
        "candidates",
        "upload_batches",
        "jobs",
        "users",
    ]
    return [(name, conditions[name]) for name in delete_order if conditions.get(name) is not None]


def _safe_upload_dirs(project_root):
    root = project_root.resolve()
    candidates = [
        root / "backend" / "uploads",
        root / "uploads",
    ]
    safe_dirs = []
    for path in candidates:
        resolved = path.resolve()
        if root not in (resolved, *resolved.parents):
            raise SystemExit(f"Refusing to clean path outside project root: {resolved}")
        safe_dirs.append(resolved)
    return safe_dirs


def _file_count(path):
    if not path.exists():
        return 0
    return sum(1 for item in path.rglob("*") if item.is_file() or item.is_symlink())


def _clear_directory_files(path):
    if not path.exists():
        path.mkdir(parents=True, exist_ok=True)
        return 0

    count = 0
    for item in sorted(path.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        if item.is_file() or item.is_symlink():
            item.unlink()
            count += 1
        elif item.is_dir():
            try:
                item.rmdir()
            except OSError:
                pass
    return count


def _run_backup(database_url, upload_dirs):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import backup_pilot_data

    backup_root = Path(os.environ.get("BACKUP_DIR", str(ROOT / "backups"))).expanduser().resolve()
    target_dir = backup_root / (datetime.now(UTC).strftime("%Y%m%d-%H%M%S") + "-cleanup-demo-data")
    target_dir.mkdir(parents=True, exist_ok=True)
    backup_pilot_data._backup_database(database_url, target_dir, dry_run=False)

    for upload_dir in upload_dirs:
        label = "backend_uploads" if upload_dir.name == "uploads" and upload_dir.parent.name == "backend" else upload_dir.name
        upload_target = target_dir / label
        upload_target.mkdir(parents=True, exist_ok=True)
        backup_pilot_data._backup_uploads(upload_dir, upload_target, dry_run=False)

    print(f"backup complete: {target_dir}")
    return target_dir


def main():
    parser = argparse.ArgumentParser(description="Clean demo rows and upload files after backup.")
    parser.add_argument("--project-root", default=str(ROOT), help="Project root containing backend/uploads and uploads.")
    parser.add_argument("--demo-email-domain", default="@mvp.local", help="Demo account email suffix to remove.")
    parser.add_argument("--confirm", action="store_true", help="Actually back up and delete demo data.")
    parser.add_argument("--dry-run", action="store_true", help="Preview actions only. This is the default.")
    args = parser.parse_args()

    project_root = Path(args.project_root).expanduser().resolve()
    database_url = _database_url()
    engine = create_engine(database_url)
    upload_dirs = _safe_upload_dirs(project_root)

    with engine.begin() as connection:
        tables = _load_tables(engine)
        table_names = set(inspect(engine).get_table_names())
        plan = _collect_plan(connection, tables, args.demo_email_domain)
        counts = []
        for table_name, condition in plan:
            if table_name not in table_names:
                continue
            table = tables[table_name]
            counts.append((table_name, connection.execute(select(table.c.id).where(condition)).fetchall()))

        file_counts = [(path, _file_count(path)) for path in upload_dirs]
        mode = "DELETE CONFIRMED" if args.confirm else "DRY RUN"
        print(f"{mode}: demo cleanup for {database_url}")
        for table_name, rows in counts:
            print(f"{table_name}: {len(rows)}")
        for path, count in file_counts:
            label = "backend/uploads files" if path.parts[-2:] == ("backend", "uploads") else "uploads files"
            print(f"{label}: {count}")

        if not args.confirm:
            print("No data deleted. Re-run with --confirm after reviewing counts.")
            return

        _run_backup(database_url, upload_dirs)

        conditions_by_name = dict(plan)
        for table_name, _rows in counts:
            table = tables[table_name]
            condition = conditions_by_name[table_name]
            connection.execute(delete(table).where(condition))

    deleted_files = sum(_clear_directory_files(path) for path in upload_dirs)
    print(f"cleanup complete: deleted upload files {deleted_files}")


if __name__ == "__main__":
    main()
