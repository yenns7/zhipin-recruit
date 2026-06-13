import os, uuid, zipfile
from pathlib import Path, PurePosixPath
from flask import Blueprint, request, jsonify, g
from werkzeug.utils import secure_filename
from ..middleware.auth import require_auth
from ..middleware.events import record_event
from ..services.resume_service import ResumeBatchService
from .. import db

bp = Blueprint("resume", __name__)

# 简历文件白名单
RESUME_EXTS = {"pdf", "doc", "docx"}
# 上传白名单：简历文件 + zip 压缩包
ALLOWED = RESUME_EXTS | {"zip"}

# ---- zip 解压安全限制（防 zip 炸弹）----
ZIP_MAX_ENTRIES = 100              # zip 内最多处理的文件条目数
ZIP_MAX_FILE_SIZE = 20 * 1024 * 1024     # 单个解压文件上限 20MB
ZIP_MAX_TOTAL_SIZE = 200 * 1024 * 1024   # 解压总大小上限 200MB


def _ext(filename):
    """取小写扩展名（不含点）；无扩展名返回空串"""
    return filename.rsplit(".", 1)[1].lower() if "." in filename else ""


def _allowed(filename):
    return _ext(filename) in ALLOWED


def _is_resume(filename):
    return _ext(filename) in RESUME_EXTS


def _process_resume(svc, fpath, display_name, results):
    """解析单份简历并入库，把结果（成功/失败）追加到 results。
    display_name 用于结果展示（zip 内文件会带 "xxx.zip → 文件名" 前缀）。"""
    try:
        candidate = svc.parse_and_save(fpath, owner_hr_id=g.user_id)
        record_event("resume.uploaded", entity_id=candidate.id, entity_type="candidate")
        results.append({"file": display_name, "status": "ok", "candidate_id": candidate.id})
    except Exception as e:
        results.append({"file": display_name, "status": "error", "reason": str(e)})


def _process_zip(svc, zip_path, zip_display_name, folder, results):
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
                _process_resume(svc, str(out_path), f"{zip_display_name} → {base}", results)
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
def upload():
    files = request.files.getlist("files")
    if not files or all(f.filename == "" for f in files):
        return jsonify({"error": "No files provided"}), 400

    from flask import current_app
    folder = current_app.config.get("UPLOAD_FOLDER", "/tmp/hi_uploads")
    Path(folder).mkdir(parents=True, exist_ok=True)

    svc = ResumeBatchService()
    results = []
    for f in files:
        if not f.filename:
            continue
        if not _allowed(f.filename):
            results.append({"file": f.filename, "status": "skipped", "reason": "unsupported format"})
            continue

        # 落盘（普通简历直接落盘并保留路径供 raw_file_path 使用）
        fname = f"{uuid.uuid4()}_{secure_filename(f.filename)}"
        fpath = str(Path(folder) / fname)
        f.save(fpath)

        if _ext(f.filename) == "zip":
            # zip：解压后逐个解析其中的简历
            _process_zip(svc, fpath, f.filename, folder, results)
            # 原始 zip 不再需要，删除（解压出的简历文件已单独保留）
            try:
                os.remove(fpath)
            except OSError:
                pass
        else:
            # 普通简历文件，逐个解析
            _process_resume(svc, fpath, f.filename, results)

    # total 改为实际产生的简历结果条数（zip 会展开成多条）
    return jsonify({"total": len(results), "results": results}), 202


@bp.get("/resume/<int:candidate_id>")
@require_auth
def get_resume(candidate_id):
    from ..models import Candidate
    c = Candidate.query.get_or_404(candidate_id)
    # 专员只能看自己负责的
    if g.role == "recruiter" and c.owner_hr_id != g.user_id:
        return jsonify({"error": "Forbidden"}), 403
    return jsonify({
        "id": c.id,
        "name_masked": c.name_masked,
        "resume_json": c.resume_json,
        "tags": [{"tag": t.tag, "score": t.score} for t in c.tags],
        "created_at": c.created_at.isoformat(),
    })
