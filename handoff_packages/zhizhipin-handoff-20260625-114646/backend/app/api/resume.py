import hashlib
import os, uuid, zipfile
from datetime import timedelta
from pathlib import Path, PurePosixPath
from flask import current_app
from flask import Blueprint, request, jsonify, g
from werkzeug.utils import secure_filename
from ..middleware.auth import require_auth, require_role
from ..middleware.rate_limit import rate_limit
from ..middleware.events import record_event
from ..services.resume_service import ResumeBatchService
from ..source_channels import normalize_resume_source_channel
from .. import db
from ..models import Candidate, Event, UploadBatch
from ..time_utils import utc_now
from .access import can_access_candidate, can_manage_job, job_is_active, same_org

bp = Blueprint("resume", __name__)

# 简历文件白名单。旧版 .doc 是 OLE 容器，存在宏风险，本轮只允许作为显式跳过项给出原因。
RESUME_EXTS = {"pdf", "docx"}
BLOCKED_RESUME_EXTS = {"doc"}
# 上传白名单：简历文件 + zip 压缩包
ALLOWED = RESUME_EXTS | BLOCKED_RESUME_EXTS | {"zip"}
RESUME_MAX_FILE_SIZE = 20 * 1024 * 1024
FILE_SIGNATURES = {
    "pdf": (b"%PDF-",),
    "doc": (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",),
    "docx": (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"),
    "zip": (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"),
}

# ---- zip 解压安全限制（防 zip 炸弹）----
ZIP_MAX_ENTRIES = 100              # zip 内最多处理的文件条目数
ZIP_MAX_FILE_SIZE = 20 * 1024 * 1024     # 单个解压文件上限 20MB
ZIP_MAX_TOTAL_SIZE = 200 * 1024 * 1024   # 解压总大小上限 200MB
UPLOAD_DEDUP_WINDOW = timedelta(minutes=10)


def _ext(filename):
    """取小写扩展名（不含点）；无扩展名返回空串"""
    return filename.rsplit(".", 1)[1].lower() if "." in filename else ""


def _allowed(filename):
    return _ext(filename) in ALLOWED


def _is_resume(filename):
    return _ext(filename) in RESUME_EXTS | BLOCKED_RESUME_EXTS


def _stream_size(file_storage):
    stream = file_storage.stream
    current = stream.tell()
    stream.seek(0, os.SEEK_END)
    size = stream.tell()
    stream.seek(current)
    return size


def _content_matches_extension(file_storage, ext):
    signatures = FILE_SIGNATURES.get(ext)
    if not signatures:
        return True
    stream = file_storage.stream
    current = stream.tell()
    head = stream.read(max(len(sig) for sig in signatures))
    stream.seek(current)
    return any(head.startswith(sig) for sig in signatures)


def _validate_upload_file(file_storage):
    ext = _ext(file_storage.filename)
    size = _stream_size(file_storage)
    if size <= 0:
        return "文件为空"
    if ext in BLOCKED_RESUME_EXTS:
        return "旧版 DOC 存在宏风险，请转换为 PDF 或 DOCX 后上传"
    if ext in RESUME_EXTS and size > RESUME_MAX_FILE_SIZE:
        return f"文件大小超过上限（{RESUME_MAX_FILE_SIZE // (1024 * 1024)}MB）"
    if not _content_matches_extension(file_storage, ext):
        return "文件内容与扩展名不匹配"
    return None


def _file_fingerprints(files):
    fingerprints = []
    for file_storage in files:
        if not file_storage.filename:
            continue
        stream = file_storage.stream
        current = stream.tell()
        digest = hashlib.sha256()
        size = 0
        while True:
            chunk = stream.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            digest.update(chunk)
        stream.seek(current)
        fingerprints.append({
            "filename": file_storage.filename,
            "size": size,
            "sha256": digest.hexdigest(),
        })
    return sorted(fingerprints, key=lambda item: (item["filename"], item["sha256"]))


def _upload_dedup_key(files, target_job_id):
    source_channel = normalize_resume_source_channel(request.form.get("source_channel"))
    source_link = (request.form.get("source_link") or "").strip()
    referrer = (request.form.get("referrer") or "").strip()[:120]
    note = (request.form.get("source_note") or request.form.get("note") or "").strip()
    raw = {
        "org_id": g.org_id,
        "actor_id": g.user_id,
        "target_job_id": target_job_id,
        "source_channel": source_channel,
        "source_link": source_link,
        "referrer": referrer,
        "note": note,
        "files": _file_fingerprints(files),
    }
    digest = hashlib.sha256(repr(raw).encode("utf-8")).hexdigest()
    return digest


def _recent_completed_upload(upload_key):
    cutoff = utc_now() - UPLOAD_DEDUP_WINDOW
    events = (
        Event.query
        .filter(
            Event.org_id == g.org_id,
            Event.actor_id == g.user_id,
            Event.action == "resume.upload.completed",
            Event.ts >= cutoff,
        )
        .order_by(Event.id.desc())
        .limit(20)
        .all()
    )
    for event in events:
        payload = event.payload if isinstance(event.payload, dict) else {}
        if payload.get("upload_fingerprint") == upload_key:
            return payload
    return None


def _add_to_target_pipeline(candidate, target_job_id):
    if not target_job_id:
        return False

    from ..models import PipelineStage

    exists = PipelineStage.query.filter_by(
        candidate_id=candidate.id,
        job_id=target_job_id,
    ).first()
    if exists:
        return False

    db.session.add(PipelineStage(
        org_id=g.org_id,
        candidate_id=candidate.id,
        job_id=target_job_id,
        stage="pending",
        updated_by=g.user_id,
        note="上传简历后自动进入待筛选",
    ))
    record_event(
        "pipeline.moved",
        entity_id=candidate.id,
        entity_type="candidate",
        payload={"job_id": target_job_id, "stage": "pending", "source": "resume_upload"},
    )
    return True


def _related_jobs_for_candidate(candidate):
    from ..models import Job, PipelineStage, UploadBatch

    job_ids = set()
    if candidate.upload_batch_id:
        batch = db.session.get(UploadBatch, candidate.upload_batch_id)
        if batch and batch.target_job_id:
            job_ids.add(batch.target_job_id)

    rows = (
        db.session.query(PipelineStage.job_id)
        .filter(PipelineStage.candidate_id == candidate.id)
        .distinct()
        .all()
    )
    for job_id, in rows:
        if job_id:
            job_ids.add(job_id)

    if not job_ids:
        return []

    return (
        db.session.query(Job)
        .filter(Job.org_id == (candidate.org_id or 1), Job.id.in_(job_ids), Job.status == "active")
        .order_by(Job.id.asc())
        .all()
    )


def _refresh_related_job_matches(candidate):
    from ..services.match_service import MatchService

    jobs = _related_jobs_for_candidate(candidate)
    if not jobs:
        return []

    svc = MatchService()
    refreshed = []
    for job in jobs:
        try:
            svc.rank_for_job(job.id)
        except Exception:
            current_app.logger.exception(
                "候选人档案保存后刷新岗位匹配失败: candidate_id=%s job_id=%s",
                candidate.id,
                job.id,
            )
            continue
        refreshed.append({"id": job.id, "title": job.title})
    return refreshed


def _process_resume(svc, fpath, display_name, results, upload_batch_id=None, target_job_id=None):
    """解析单份简历并入库，把结果（成功/失败）追加到 results。
    display_name 用于结果展示（zip 内文件会带 "xxx.zip → 文件名" 前缀）。"""
    try:
        candidate = svc.parse_and_save(fpath, owner_hr_id=g.user_id, upload_batch_id=upload_batch_id)
        candidate.org_id = g.org_id
        from ..models import CandidateTag
        CandidateTag.query.filter_by(candidate_id=candidate.id).update({"org_id": g.org_id})
        db.session.commit()
        record_event("resume.uploaded", entity_id=candidate.id, entity_type="candidate")
        auto_joined = _add_to_target_pipeline(candidate, target_job_id)
        result = {"file": display_name, "status": "ok", "candidate_id": candidate.id}
        if auto_joined:
            result.update({"target_job_id": target_job_id, "pipeline_stage": "pending"})
        results.append(result)
    except Exception as e:
        candidate = svc.create_failed_candidate(
            fpath,
            owner_hr_id=g.user_id,
            display_name=display_name,
            error=e,
            upload_batch_id=upload_batch_id,
        )
        candidate.org_id = g.org_id
        db.session.commit()
        record_event(
            "resume.parse_failed",
            entity_id=candidate.id,
            entity_type="candidate",
            payload={"file": display_name, "reason": str(e)[:500]},
        )
        results.append({
            "file": display_name,
            "status": "error",
            "candidate_id": candidate.id,
            "reason": str(e),
        })


def _process_zip(svc, zip_path, zip_display_name, folder, results, upload_batch_id=None, target_job_id=None):
    """安全解压 zip，逐个解析其中的 pdf/doc/docx 简历。
    安全防护：
      - 防 zip 炸弹：限制条目数、单文件与总解压大小。
      - 防路径穿越（zip slip）：忽略含 `..`、绝对路径或跳出目标目录的条目，只取 basename。
      - 跳过目录、隐藏文件（__MACOSX/.DS_Store 等）和非简历格式。
    zip 整体损坏或超限时，给一条 error 结果。"""
    # 为本 zip 单独建一个临时子目录，避免文件名冲突
    extract_dir = Path(folder) / f"zip_{uuid.uuid4().hex}"
    extract_dir.mkdir(parents=True, exist_ok=True)

    try:
        with zipfile.ZipFile(zip_path) as zf:
            infos = zf.infolist()

            # 防 zip 炸弹：声明的解压总大小（用 zipinfo.file_size，避免实际解压炸弹）
            declared_total = sum(i.file_size for i in infos if not i.is_dir())
            if declared_total > ZIP_MAX_TOTAL_SIZE:
                results.append({
                    "file": zip_display_name,
                    "status": "error",
                    "reason": f"压缩包解压后总大小超过上限（{ZIP_MAX_TOTAL_SIZE // (1024 * 1024)}MB）",
                })
                return

            processed = 0          # 已处理（解析）的简历份数
            extracted_total = 0    # 实际已解压字节数
            extract_root = extract_dir.resolve()

            for info in infos:
                if processed >= ZIP_MAX_ENTRIES:
                    results.append({
                        "file": zip_display_name,
                        "status": "error",
                        "reason": f"压缩包内文件数量超过上限（{ZIP_MAX_ENTRIES}），其余文件未处理",
                    })
                    break

                name = info.filename
                # 跳过目录
                if info.is_dir():
                    continue

                # 防路径穿越：含 .. 或绝对路径（含驱动器/盘符）的条目直接忽略
                posix = PurePosixPath(name)
                if posix.is_absolute() or ".." in posix.parts or (":" in name) or name.startswith("/") or name.startswith("\\"):
                    continue

                # 只取 basename，不保留 zip 内目录结构
                base = os.path.basename(name.replace("\\", "/"))
                if not base:
                    continue

                # 跳过隐藏文件 / mac 元数据 / 非简历格式
                if base.startswith(".") or "__MACOSX" in name:
                    continue
                if not _is_resume(base):
                    continue
                if _ext(base) in BLOCKED_RESUME_EXTS:
                    results.append({
                        "file": f"{zip_display_name} → {base}",
                        "status": "skipped",
                        "reason": "旧版 DOC 存在宏风险，请转换为 PDF 或 DOCX 后上传",
                    })
                    continue

                # 单文件大小防护
                if info.file_size > ZIP_MAX_FILE_SIZE:
                    results.append({
                        "file": f"{zip_display_name} → {base}",
                        "status": "skipped",
                        "reason": f"单个文件超过解压上限（{ZIP_MAX_FILE_SIZE // (1024 * 1024)}MB）",
                    })
                    continue

                # 解压目标路径，并再次校验最终路径仍在目标目录内（双保险防穿越）
                out_name = f"{uuid.uuid4().hex}_{secure_filename(base)}"
                out_path = (extract_dir / out_name).resolve()
                if extract_root not in out_path.parents and out_path != extract_root:
                    # 解压后路径跳出了目标目录，忽略
                    continue

                # 流式解压，边读边累计大小，超总量则中止
                try:
                    with zf.open(info) as src, open(out_path, "wb") as dst:
                        remaining = ZIP_MAX_TOTAL_SIZE - extracted_total
                        chunk_size = 1024 * 64
                        written = 0
                        while True:
                            chunk = src.read(chunk_size)
                            if not chunk:
                                break
                            written += len(chunk)
                            # 实际解压超过单文件或总量上限：中止该文件
                            if written > ZIP_MAX_FILE_SIZE or written > remaining:
                                dst.close()
                                out_path.unlink(missing_ok=True)
                                raise ValueError("解压大小超过限制")
                            dst.write(chunk)
                        extracted_total += written
                except Exception as ex:
                    results.append({
                        "file": f"{zip_display_name} → {base}",
                        "status": "error",
                        "reason": f"解压失败：{ex}",
                    })
                    continue

                # 解析入库，结果标明来源 zip
                _process_resume(
                    svc,
                    str(out_path),
                    f"{zip_display_name} → {base}",
                    results,
                    upload_batch_id=upload_batch_id,
                    target_job_id=target_job_id,
                )
                processed += 1

            # zip 内没有任何可处理的简历
            if processed == 0 and not any(r["file"].startswith(f"{zip_display_name} →") for r in results):
                results.append({
                    "file": zip_display_name,
                    "status": "skipped",
                    "reason": "压缩包内未找到 PDF / Word 简历",
                })

    except zipfile.BadZipFile:
        results.append({"file": zip_display_name, "status": "error", "reason": "压缩包已损坏或不是有效的 ZIP 文件"})
    except Exception as e:
        results.append({"file": zip_display_name, "status": "error", "reason": f"压缩包处理失败：{e}"})


@bp.post("/resume/upload")
@require_auth
@require_role("recruiter", "manager", "admin")
@rate_limit("resume.upload")
def upload():
    files = request.files.getlist("files")
    if not files or all(f.filename == "" for f in files):
        return jsonify({"error": "No files provided"}), 400

    from flask import current_app
    folder = current_app.config.get("UPLOAD_FOLDER", "/tmp/hi_uploads")
    Path(folder).mkdir(parents=True, exist_ok=True)

    from ..models import UploadBatch, Job

    target_job_id = request.form.get("target_job_id", type=int)
    target_job = db.session.get(Job, target_job_id) if target_job_id else None
    if target_job_id and (target_job is None or not same_org(target_job, g.org_id)):
        return jsonify({"error": "目标岗位不存在"}), 400
    if target_job is not None and not can_manage_job(g.user_id, g.role, target_job):
        return jsonify({"error": "Forbidden"}), 403
    if target_job is not None and not job_is_active(target_job):
        return jsonify({"error": "岗位已关闭，请先恢复在招后再上传候选人"}), 400

    upload_key = _upload_dedup_key(files, target_job_id)
    previous_upload = _recent_completed_upload(upload_key)
    if previous_upload is not None:
        return jsonify({
            "batch_id": previous_upload.get("batch_id"),
            "total": previous_upload.get("total", 0),
            "results": previous_upload.get("results", []),
            "deduplicated": True,
        }), 200

    batch = UploadBatch(
        org_id=g.org_id,
        owner_hr_id=g.user_id,
        source_channel=normalize_resume_source_channel(request.form.get("source_channel")),
        source_link=(request.form.get("source_link") or "").strip(),
        referrer=(request.form.get("referrer") or "").strip()[:120],
        target_job_id=target_job_id,
        note=(request.form.get("source_note") or request.form.get("note") or "").strip(),
    )
    db.session.add(batch)
    db.session.commit()
    record_event("resume.upload_batch.created", entity_id=batch.id, entity_type="upload_batch")

    svc = ResumeBatchService()
    results = []
    for f in files:
        if not f.filename:
            continue
        if not _allowed(f.filename):
            results.append({"file": f.filename, "status": "skipped", "reason": "unsupported format"})
            continue
        invalid_reason = _validate_upload_file(f)
        if invalid_reason:
            results.append({"file": f.filename, "status": "skipped", "reason": invalid_reason})
            continue

        # 落盘（普通简历直接落盘并保留路径供 raw_file_path 使用）
        fname = f"{uuid.uuid4()}_{secure_filename(f.filename)}"
        fpath = str(Path(folder) / fname)
        f.save(fpath)

        if _ext(f.filename) == "zip":
            # zip：解压后逐个解析其中的简历
            _process_zip(
                svc,
                fpath,
                f.filename,
                folder,
                results,
                upload_batch_id=batch.id,
                target_job_id=target_job_id,
            )
            # 原始 zip 不再需要，删除（解压出的简历文件已单独保留）
            try:
                os.remove(fpath)
            except OSError:
                pass
        else:
            # 普通简历文件，逐个解析
            _process_resume(
                svc,
                fpath,
                f.filename,
                results,
                upload_batch_id=batch.id,
                target_job_id=target_job_id,
            )

    # total 改为实际产生的简历结果条数（zip 会展开成多条）
    record_event(
        "resume.upload.completed",
        entity_id=batch.id,
        entity_type="upload_batch",
        payload={
            "upload_fingerprint": upload_key,
            "batch_id": batch.id,
            "total": len(results),
            "results": results,
        },
    )
    return jsonify({"batch_id": batch.id, "total": len(results), "results": results}), 202


@bp.post("/resume/batches/<int:batch_id>/rollback")
@require_auth
@require_role("recruiter", "manager", "admin")
def rollback_upload_batch(batch_id):
    data = request.get_json(silent=True) or {}
    reason = str(data.get("reason") or "").strip()[:240]
    if not reason:
        return jsonify({"error": "撤回原因必填"}), 400

    batch = db.session.get(UploadBatch, batch_id)
    if batch is None or not same_org(batch, g.org_id):
        return jsonify({"error": "上传批次不存在"}), 404
    if g.role == "recruiter" and batch.owner_hr_id != g.user_id:
        return jsonify({"error": "Forbidden"}), 403

    candidates = (
        Candidate.query
        .filter_by(org_id=g.org_id, upload_batch_id=batch.id)
        .filter(Candidate.deleted_at.is_(None))
        .all()
    )
    removed_files = 0
    now = utc_now()
    for candidate in candidates:
        raw_path = candidate.raw_file_path
        if raw_path:
            try:
                path = Path(raw_path)
                if path.is_file():
                    path.unlink()
                    removed_files += 1
            except OSError:
                pass

        candidate.name_masked = "已撤回导入候选人"
        candidate.email_masked = ""
        candidate.phone_masked = ""
        candidate.resume_json = {}
        candidate.raw_file_path = None
        candidate.parse_error = None
        candidate.deleted_at = now
        candidate.deleted_by = g.user_id
        candidate.anonymized_at = now
        for tag in candidate.tags:
            tag.tag = "已撤回"
            tag.score = None
            tag.org_id = g.org_id

    db.session.commit()
    record_event(
        "resume.upload_batch.rolled_back",
        entity_id=batch.id,
        entity_type="upload_batch",
        payload={
            "reason": reason,
            "rolled_back_candidates": len(candidates),
            "raw_files_removed": removed_files,
        },
        severity="warning",
    )
    return jsonify({
        "batch_id": batch.id,
        "rolled_back_candidates": len(candidates),
        "raw_files_removed": removed_files,
    })


@bp.get("/resume/<int:candidate_id>")
@require_auth
def get_resume(candidate_id):
    c = db.get_or_404(Candidate, candidate_id)
    if not same_org(c, g.org_id) or c.deleted_at is not None:
        return jsonify({"error": "候选人不存在"}), 404
    if not can_access_candidate(g.user_id, g.role, candidate_id):
        return jsonify({"error": "Forbidden"}), 403
    record_event(
        "candidate.viewed",
        entity_id=c.id,
        entity_type="candidate",
        payload={"view": "resume_detail"},
    )
    return jsonify({
        "id": c.id,
        "name_masked": c.name_masked,
        "owner_hr_id": c.owner_hr_id,
        "resume_json": c.resume_json,
        "tags": [{"tag": t.tag, "score": t.score} for t in c.tags],
        "parse_status": c.parse_status,
        "parse_error": c.parse_error,
        "source": _candidate_source_payload(c),
        "created_at": c.created_at.isoformat(),
    })


@bp.patch("/resume/<int:candidate_id>/profile")
@require_auth
def update_resume_profile(candidate_id):
    from ..models import Candidate

    candidate = db.get_or_404(Candidate, candidate_id)
    if g.role == "interviewer":
        return jsonify({"error": "Forbidden"}), 403
    if not same_org(candidate, g.org_id) or candidate.deleted_at is not None:
        return jsonify({"error": "候选人不存在"}), 404
    if not can_access_candidate(g.user_id, g.role, candidate_id):
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json(silent=True) or {}
    profile = data.get("profile")
    if not isinstance(profile, dict):
        return jsonify({"error": "profile required"}), 400
    skills = data.get("skills") if "skills" in data else None
    if skills is not None and not isinstance(skills, list):
        return jsonify({"error": "skills must be a list"}), 400

    svc = ResumeBatchService()
    candidate = svc.update_candidate_profile(candidate, profile, skills)
    rematched_jobs = _refresh_related_job_matches(candidate)
    record_event(
        "resume.profile_updated",
        entity_id=candidate.id,
        entity_type="candidate",
        payload={
            "actor_id": g.user_id,
            "fields": sorted(profile.keys()),
            "rematched_job_ids": [job["id"] for job in rematched_jobs],
        },
    )
    return jsonify({
        "id": candidate.id,
        "name_masked": candidate.name_masked,
        "owner_hr_id": candidate.owner_hr_id,
        "resume_json": candidate.resume_json,
        "tags": [{"tag": t.tag, "score": t.score} for t in candidate.tags],
        "parse_status": candidate.parse_status,
        "parse_error": candidate.parse_error,
        "source": _candidate_source_payload(candidate),
        "created_at": candidate.created_at.isoformat(),
        "rematched_jobs": rematched_jobs,
    })


@bp.post("/resume/<int:candidate_id>/retry-parse")
@require_auth
def retry_parse(candidate_id):
    from ..models import Candidate

    candidate = db.get_or_404(Candidate, candidate_id)
    if g.role == "interviewer":
        return jsonify({"error": "Forbidden"}), 403
    if not same_org(candidate, g.org_id) or candidate.deleted_at is not None:
        return jsonify({"error": "候选人不存在"}), 404
    if not can_access_candidate(g.user_id, g.role, candidate_id):
        return jsonify({"error": "Forbidden"}), 403
    if candidate.parse_status != "failed":
        return jsonify({"error": "只有解析失败的简历才能重试"}), 400

    svc = ResumeBatchService()
    try:
        candidate = svc.reparse_candidate(candidate)
    except Exception as e:
        return jsonify({
            "candidate_id": candidate_id,
            "parse_status": "failed",
            "parse_error": str(e)[:500],
        }), 422

    record_event(
        "resume.retry_parse",
        entity_id=candidate.id,
        entity_type="candidate",
    )
    return jsonify({
        "candidate_id": candidate.id,
        "name_masked": candidate.name_masked,
        "parse_status": candidate.parse_status,
        "parse_error": candidate.parse_error,
        "resume_json": candidate.resume_json,
        "tags": [{"tag": t.tag, "score": t.score} for t in candidate.tags],
    })


def _candidate_source_payload(candidate):
    from ..models import Job, UploadBatch

    if not candidate.upload_batch_id:
        return None
    batch = db.session.get(UploadBatch, candidate.upload_batch_id)
    if batch is None:
        return None
    target_job = db.session.get(Job, batch.target_job_id) if batch.target_job_id else None
    return {
        "batch_id": batch.id,
        "channel": normalize_resume_source_channel(batch.source_channel),
        "source_link": batch.source_link or "",
        "referrer": batch.referrer or "",
        "target_job_id": batch.target_job_id,
        "target_job_title": target_job.title if target_job else None,
        "target_job_city": target_job.city if target_job else "",
        "target_job_department": target_job.department if target_job else "",
        "note": batch.note or "",
        "created_at": batch.created_at.isoformat() if batch.created_at else None,
    }
