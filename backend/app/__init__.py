import hashlib
import os
import uuid
from pathlib import Path
import jwt
from flask import Flask, g, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

# 前端构建产物目录（npm run build 输出）。可用 FRONTEND_DIST 环境变量覆盖。
FRONTEND_DIST = os.environ.get(
    "FRONTEND_DIST",
    str(Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"),
)

def create_app(config=None):
    app = Flask(__name__)

    if config is None:
        from .config import Config
        app.config.from_object(Config)
    else:
        app.config.from_object(config)

    _enforce_production_security(app)

    cors_origins = app.config.get("CORS_ORIGINS") or []
    if cors_origins:
        CORS(app, origins=cors_origins, supports_credentials=True)
    else:
        # 未配置白名单：仅开发可接受，生产已被 _enforce_production_security 拦截
        CORS(app)
    db.init_app(app)

    from .api import resume, jobs, demands, talent_maps, candidates, match, interview, pipeline, bi, auth, agent, admin, notifications
    for bp in [auth.bp, resume.bp, jobs.bp, demands.bp, talent_maps.bp, candidates.bp, match.bp, interview.bp, pipeline.bp, bi.bp, agent.bp, admin.bp, notifications.bp]:
        app.register_blueprint(bp, url_prefix="/api")

    _register_request_audit(app)
    _register_idempotency(app)
    _register_security_headers(app)

    with app.app_context():
        db.create_all()
        _ensure_job_metadata_columns()
        _ensure_workflow_enhancement_columns()
        _normalize_legacy_feedback_reason_tags()
        _ensure_org_and_privacy_columns()
        _ensure_user_security_columns()

    _register_frontend(app)

    return app


def _register_security_headers(app):
    @app.after_request
    def add_security_headers(response):
        if not app.config.get("SECURITY_HEADERS_ENABLED", True):
            return response

        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        response.headers.setdefault(
            "Content-Security-Policy",
            "; ".join([
                "default-src 'self'",
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
                "style-src 'self' 'unsafe-inline'",
                "img-src 'self' data: https:",
                "font-src 'self' data:",
                "connect-src 'self'",
                "frame-ancestors 'none'",
                "base-uri 'self'",
                "form-action 'self'",
            ]),
        )
        return response


def _register_request_audit(app):
    @app.before_request
    def attach_request_id():
        incoming = (request.headers.get("X-Request-ID") or "").strip()
        g.request_id = incoming[:80] if incoming else uuid.uuid4().hex

    @app.after_request
    def add_request_id_and_forbidden_audit(response):
        if getattr(g, "request_id", None):
            response.headers.setdefault("X-Request-ID", g.request_id)

        if response.status_code == 403 and request.path.startswith("/api/"):
            try:
                _record_forbidden_request()
            except Exception:
                app.logger.exception("记录越权审计事件失败")
        return response


def _record_forbidden_request():
    from .middleware.events import record_event

    view_args = request.view_args or {}
    target_map = (
        ("candidate_id", "candidate"),
        ("job_id", "job"),
        ("user_id", "user"),
        ("demand_id", "demand"),
        ("map_id", "talent_map"),
        ("person_id", "talent_map_person"),
        ("conversation_id", "conversation"),
    )
    entity_type = "request"
    entity_id = None
    for key, candidate_type in target_map:
        if key in view_args:
            entity_type = candidate_type
            entity_id = view_args.get(key)
            break

    record_event(
        "security.forbidden",
        entity_id=entity_id,
        entity_type=entity_type,
        payload={
            "method": request.method,
            "path": request.path,
            "endpoint": request.endpoint or "",
        },
        result="denied",
        failure_reason="Forbidden",
        source="security",
        severity="warning",
    )


def _register_idempotency(app):
    """Cache successful write responses when the client supplies Idempotency-Key.

    This protects JSON/form write APIs from retry storms. Multipart uploads use
    endpoint-level file fingerprints instead, because hashing large request bodies
    in a generic middleware would create avoidable memory pressure.
    """
    write_methods = {"POST", "PUT", "PATCH", "DELETE"}
    max_key_length = 160
    max_body_bytes = 1024 * 1024

    @app.before_request
    def replay_idempotent_write():
        if request.method not in write_methods:
            return None
        key = (request.headers.get("Idempotency-Key") or "").strip()
        if not key:
            return None
        if len(key) > max_key_length:
            return jsonify({"error": f"Idempotency-Key 长度不能超过 {max_key_length}"}), 400
        if request.mimetype == "multipart/form-data":
            return None
        if request.content_length and request.content_length > max_body_bytes:
            return jsonify({"error": "请求体过大，不能使用通用 Idempotency-Key，请使用业务级去重"}), 413

        body = request.get_data(cache=True) or b""
        body_hash = hashlib.sha256(body).hexdigest()
        actor_scope = _idempotency_actor_scope(app)
        scope_key = hashlib.sha256(
            f"{actor_scope}:{request.method}:{request.path}:{key}".encode()
        ).hexdigest()
        g.idempotency_context = {
            "scope_key": scope_key,
            "idempotency_key": key[:max_key_length],
            "actor_scope": actor_scope,
            "method": request.method,
            "path": request.path[:500],
            "body_hash": body_hash,
        }

        from .models import IdempotencyRecord

        record = IdempotencyRecord.query.filter_by(scope_key=scope_key).first()
        if record is None:
            return None
        if record.body_hash != body_hash:
            return jsonify({
                "error": "Idempotency-Key 已被同一路径的不同请求体使用，请换一个 key",
            }), 409

        response = jsonify(record.response_json)
        response.status_code = record.status_code
        response.headers["X-Idempotent-Replay"] = "true"
        g.idempotency_replayed = True
        return response

    @app.after_request
    def remember_idempotent_write(response):
        context = getattr(g, "idempotency_context", None)
        if not context or getattr(g, "idempotency_replayed", False):
            return response
        if response.status_code < 200 or response.status_code >= 300:
            return response
        if not response.is_json:
            return response

        payload = response.get_json(silent=True)
        if payload is None:
            return response

        from sqlalchemy.exc import IntegrityError
        from .models import IdempotencyRecord

        try:
            if IdempotencyRecord.query.filter_by(scope_key=context["scope_key"]).first() is None:
                db.session.add(IdempotencyRecord(
                    scope_key=context["scope_key"],
                    idempotency_key=context["idempotency_key"],
                    actor_scope=context["actor_scope"],
                    method=context["method"],
                    path=context["path"],
                    body_hash=context["body_hash"],
                    status_code=response.status_code,
                    response_json=payload,
                ))
                db.session.commit()
        except IntegrityError:
            db.session.rollback()
        return response


def _idempotency_actor_scope(app):
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.replace("Bearer ", "", 1).strip()
    if token:
        try:
            payload = jwt.decode(token, app.config["JWT_SECRET"], algorithms=["HS256"])
            user_id = payload.get("user_id")
            if user_id is not None:
                return f"user:{user_id}"
        except jwt.PyJWTError:
            pass
        token_hash = hashlib.sha256(token.encode()).hexdigest()[:24]
        return f"token:{token_hash}"
    anonymous = request.remote_addr or "unknown"
    return f"anonymous:{anonymous}"


def _enforce_production_security(app):
    """生产模式（非 TESTING 且 FLASK_DEBUG=false）下，拒绝以不安全配置启动。

    校验项（任一不满足即 RuntimeError，阻止服务起来）：
    - JWT_SECRET 不能是默认/弱值，长度需 >= MIN_SECRET_LENGTH
    - CORS_ORIGINS 必须配置白名单，禁止生产全开放
    - AI 招聘能力必须显式完成合规确认、候选人隐私告知和人工复核承诺
    开发与测试不受影响（debug 默认 true / TESTING=true）。
    """
    if app.config.get("TESTING") or app.config.get("FLASK_DEBUG", True):
        return

    weak = app.config.get("WEAK_SECRETS", set())
    min_len = app.config.get("MIN_SECRET_LENGTH", 32)
    secret = app.config.get("JWT_SECRET", "")
    problems = []
    if secret in weak:
        problems.append("JWT_SECRET 仍为默认/弱密钥，请设置强随机值")
    elif len(secret) < min_len:
        problems.append(f"JWT_SECRET 长度 {len(secret)} < 生产要求 {min_len}")
    if not (app.config.get("CORS_ORIGINS") or []):
        problems.append("生产必须设置 CORS_ORIGINS 白名单，禁止全开放")
    if not app.config.get("AI_RECRUITMENT_COMPLIANCE_ACK", False):
        problems.append("AI_RECRUITMENT_COMPLIANCE_ACK 必须显式为 true，确认真实候选人数据的 AI 处理边界")
    if not str(app.config.get("CANDIDATE_PRIVACY_NOTICE_URL") or "").strip():
        problems.append("CANDIDATE_PRIVACY_NOTICE_URL 必须配置候选人隐私告知/授权说明地址")
    if not app.config.get("AI_HUMAN_REVIEW_REQUIRED", True):
        problems.append("AI_HUMAN_REVIEW_REQUIRED 必须为 true，AI 结论不得绕过人工复核")

    if problems:
        raise RuntimeError(
            "生产安全校验未通过，拒绝启动：\n  - " + "\n  - ".join(problems)
            + "\n（如为本地开发，请设置 FLASK_DEBUG=true）"
        )


def _ensure_job_metadata_columns():
    """Lightweight compatibility for existing local SQLite databases."""
    from sqlalchemy import inspect, text

    inspector = inspect(db.engine)
    if "jobs" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("jobs")}
    additions = {
        "city": "ALTER TABLE jobs ADD COLUMN city VARCHAR(80) DEFAULT ''",
        "department": "ALTER TABLE jobs ADD COLUMN department VARCHAR(120) DEFAULT ''",
        "job_code": "ALTER TABLE jobs ADD COLUMN job_code VARCHAR(80) DEFAULT ''",
    }

    changed = False
    for name, statement in additions.items():
        if name not in columns:
            db.session.execute(text(statement))
            changed = True

    if changed:
        db.session.commit()


def _ensure_workflow_enhancement_columns():
    """Lightweight compatibility for enhancement fields on existing SQLite DBs."""
    from sqlalchemy import inspect, text

    inspector = inspect(db.engine)
    if "candidates" not in inspector.get_table_names():
        return

    candidate_columns = {column["name"] for column in inspector.get_columns("candidates")}
    changed = False
    if "upload_batch_id" not in candidate_columns:
        db.session.execute(text("ALTER TABLE candidates ADD COLUMN upload_batch_id INTEGER"))
        changed = True
    if "parse_status" not in candidate_columns:
        db.session.execute(text("ALTER TABLE candidates ADD COLUMN parse_status VARCHAR(20) DEFAULT 'ok' NOT NULL"))
        changed = True
    if "parse_error" not in candidate_columns:
        db.session.execute(text("ALTER TABLE candidates ADD COLUMN parse_error TEXT"))
        changed = True

    if "interview_feedback" in inspector.get_table_names():
        feedback_columns = {column["name"] for column in inspector.get_columns("interview_feedback")}
        if "evaluation_json" not in feedback_columns:
            db.session.execute(text("ALTER TABLE interview_feedback ADD COLUMN evaluation_json JSON"))
            changed = True
        if "reason_tags" not in feedback_columns:
            db.session.execute(text("ALTER TABLE interview_feedback ADD COLUMN reason_tags JSON"))
            changed = True

    if changed:
        db.session.commit()


def _normalize_legacy_feedback_reason_tags():
    """Rename the old user-facing feedback reason before BI starts using it."""
    from .models import InterviewFeedback

    old_label = "岗位画像变化"
    new_label = "岗位要求变化"
    changed = False

    rows = InterviewFeedback.query.filter(InterviewFeedback.reason_tags.isnot(None)).all()
    for row in rows:
        if not isinstance(row.reason_tags, list):
            continue
        next_tags = []
        seen = set()
        for item in row.reason_tags:
            tag = new_label if item == old_label else item
            if not tag or tag in seen:
                continue
            next_tags.append(tag)
            seen.add(tag)
        if next_tags != row.reason_tags:
            row.reason_tags = next_tags
            changed = True

    if changed:
        db.session.commit()


def _ensure_org_and_privacy_columns():
    """Lightweight compatibility for org isolation and soft-delete fields."""
    from sqlalchemy import inspect, text

    inspector = inspect(db.engine)
    table_names = set(inspector.get_table_names())
    org_tables = {
        "users",
        "candidates",
        "upload_batches",
        "candidate_tags",
        "jobs",
        "recruitment_demands",
        "talent_maps",
        "talent_map_companies",
        "talent_map_people",
        "matches",
        "interviews",
        "pipeline_stages",
        "candidate_dispositions",
        "offer_records",
        "interview_assignments",
        "events",
        "audit_logs",
        "notifications",
        "conversations",
        "conversation_messages",
        "interview_feedback",
    }

    changed = False
    for table in sorted(org_tables & table_names):
        columns = {column["name"] for column in inspector.get_columns(table)}
        if "org_id" not in columns:
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN org_id INTEGER DEFAULT 1 NOT NULL"))
            changed = True

    if "candidates" in table_names:
        candidate_columns = {column["name"] for column in inspector.get_columns("candidates")}
        privacy_columns = {
            "deleted_at": "ALTER TABLE candidates ADD COLUMN deleted_at DATETIME",
            "deleted_by": "ALTER TABLE candidates ADD COLUMN deleted_by INTEGER",
            "anonymized_at": "ALTER TABLE candidates ADD COLUMN anonymized_at DATETIME",
        }
        for name, statement in privacy_columns.items():
            if name not in candidate_columns:
                db.session.execute(text(statement))
                changed = True

    if "events" in table_names:
        event_columns = {column["name"] for column in inspector.get_columns("events")}
        audit_columns = {
            "actor_role": "ALTER TABLE events ADD COLUMN actor_role VARCHAR(20)",
            "request_id": "ALTER TABLE events ADD COLUMN request_id VARCHAR(80)",
            "ip": "ALTER TABLE events ADD COLUMN ip VARCHAR(80)",
            "user_agent": "ALTER TABLE events ADD COLUMN user_agent TEXT",
            "result": "ALTER TABLE events ADD COLUMN result VARCHAR(20) DEFAULT 'success' NOT NULL",
            "failure_reason": "ALTER TABLE events ADD COLUMN failure_reason VARCHAR(240)",
            "source": "ALTER TABLE events ADD COLUMN source VARCHAR(20) DEFAULT 'ui' NOT NULL",
            "severity": "ALTER TABLE events ADD COLUMN severity VARCHAR(20) DEFAULT 'info' NOT NULL",
        }
        for name, statement in audit_columns.items():
            if name not in event_columns:
                db.session.execute(text(statement))
                changed = True

    if changed:
        db.session.commit()


def _ensure_user_security_columns():
    """Lightweight compatibility for account lifecycle security fields."""
    from sqlalchemy import inspect, text

    inspector = inspect(db.engine)
    if "users" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("users")}
    if "token_version" not in columns:
        db.session.execute(text("ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0 NOT NULL"))
        db.session.commit()


def _register_frontend(app):
    """让 Flask 同时托管前端 SPA 静态产物（单端口部署）。

    - /assets/* 等真实文件直接返回；
    - 其余路径（SPA 前端路由，如 /bi、/candidates）回退到 index.html，由前端路由接管；
    - /api/* 不受影响，已由蓝图处理。
    """
    dist = Path(FRONTEND_DIST)

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_frontend(path):
        # API 路径不该走到这里（蓝图已注册），保险起见放行给 404。
        if path.startswith("api/"):
            return {"error": "Not Found"}, 404

        target = dist / path
        if path and target.is_file():
            return send_from_directory(str(dist), path)

        # SPA 回退：交给前端路由（含深链刷新）。
        index = dist / "index.html"
        if index.is_file():
            return send_from_directory(str(dist), "index.html")
        return {"error": "frontend not built", "hint": "run npm run build in frontend/"}, 503
