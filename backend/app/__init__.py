import os
from pathlib import Path
from flask import Flask, send_from_directory
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

    _register_security_headers(app)

    with app.app_context():
        db.create_all()
        _ensure_job_metadata_columns()
        _ensure_workflow_enhancement_columns()

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


def _enforce_production_security(app):
    """生产模式（非 TESTING 且 FLASK_DEBUG=false）下，拒绝以不安全配置启动。

    校验项（任一不满足即 RuntimeError，阻止服务起来）：
    - JWT_SECRET 不能是默认/弱值，长度需 >= MIN_SECRET_LENGTH
    - CORS_ORIGINS 必须配置白名单，禁止生产全开放
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

    if changed:
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
