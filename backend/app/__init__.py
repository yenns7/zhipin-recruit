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

    CORS(app)
    db.init_app(app)

    from .api import resume, jobs, candidates, match, interview, pipeline, bi, auth, agent, admin
    for bp in [auth.bp, resume.bp, jobs.bp, candidates.bp, match.bp, interview.bp, pipeline.bp, bi.bp, agent.bp, admin.bp]:
        app.register_blueprint(bp, url_prefix="/api")

    with app.app_context():
        db.create_all()

    _register_frontend(app)

    return app


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
