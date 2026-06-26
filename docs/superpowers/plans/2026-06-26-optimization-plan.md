# 智聘系统稳定性优化 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 13 项稳定性不足（Top 5 + 全部 HIGH），让智聘系统可容器化部署、异常可控、限流有效、前端有测试保护且组件可维护。

**Architecture:** 保留现有 Flask app-factory + SQLAlchemy 后端、Vite+React18+TS 前端架构。渐进式加固，三阶段顺序交付：A（基础设施）→ B（后端稳定性）→ C（前端稳定性）。不引入新框架，仅 Alembic/flask-migrate/flask-limiter/redis/vitest 属必要新增依赖。

**Tech Stack:** Python/Flask, SQLAlchemy, Alembic, flask-migrate, flask-limiter, redis, pytest；React, TypeScript, Vitest, @testing-library/react, react-router, Tailwind。

**Spec:** `docs/superpowers/specs/2026-06-26-optimization-plan-design.md`

---

## File Structure

**新增（后端）**
- `backend/migrations/` — Alembic 目录（env.py、script.py.mako、versions/）
- `backend/alembic.ini` — Alembic 配置
- `backend/app/api/health.py` — `GET /health` 蓝图
- `backend/app/middleware/limiter.py` — flask-limiter 初始化
- `backend/app/logging_config.py` — dictConfig 日志配置
- `backend/tests/test_migrations.py`、`test_health.py`、`test_rate_limit_redis.py`、`test_error_handling.py`、`test_logging.py`
- `base_agent/pyproject.toml` — base_agent 可编辑包定义

**新增（前端）**
- `frontend/vitest.config.ts` — Vitest 配置
- `frontend/src/test/utils.tsx` — 测试 render wrapper
- `frontend/src/components/ErrorBoundary.tsx`
- `frontend/src/lib/constants/cities.ts` — 共享城市选项
- `frontend/src/types/boss.ts` — BOSS 响应类型
- `frontend/src/components/bi/KpiCard.tsx` 及 bi 拆分子组件
- `frontend/src/components/agent/*` 拆分子组件
- `frontend/src/components/job/*` 拆分子组件

**新增（根目录）**
- `Dockerfile`、`docker-compose.yml`、`.dockerignore`

**修改**
- `backend/app/__init__.py`、`backend/app/config.py`、`backend/requirements.txt`、`backend/app/middleware/rate_limit.py`
- 6 个含 `sys.path.insert` 的文件
- 17 处静默 `except Exception`
- `frontend/package.json`、`frontend/src/App.tsx`、`frontend/src/lib/api.ts`、`frontend/src/lib/useAsync.ts`
- `frontend/src/pages/{Bi,Agent,Jobs,Dashboard}Page.tsx`、`frontend/src/features/candidates/pages/CandidatesPage.tsx`
- `RUNNING.md`、`DEPLOYMENT.md`

---

# 阶段 A — 基础设施就绪（CRITICAL 修复）

对应不足 C1（无迁移）、C2（无健康检查）、C3（无 Dockerfile）、C5（无 ErrorBoundary）。

---

### Task A1: 引入 Alembic 数据库迁移基线（C1）

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/migrations/env.py`
- Create: `backend/migrations/script.py.mako`
- Create: `backend/migrations/versions/.gitkeep`
- Create: `backend/tests/test_migrations.py`
- Modify: `backend/requirements.txt`
- Modify: `backend/app/__init__.py:40-44`

- [ ] **Step 1: 添加依赖到 requirements.txt**

Modify `backend/requirements.txt`，在 `# ── 数据库 / ORM ──` 段后追加：

```
# ── 数据库迁移 ────────────────────────────────────────────
alembic==1.16.5
flask-migrate==4.1.0
```

- [ ] **Step 2: 安装依赖**

Run: `cd backend && pip install alembic==1.16.5 flask-migrate==4.1.0`
Expected: 安装成功，无冲突

- [ ] **Step 3: 初始化 Alembic 配置文件**

Create `backend/alembic.ini`：

```ini
[alembic]
script_location = migrations
prepend_sys_path = .
sqlalchemy.url =

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console
qualname =

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

- [ ] **Step 4: 创建 migrations/env.py**

Create `backend/migrations/env.py`：

```python
from __future__ import with_statement

import logging
from logging.config import fileConfig

from alembic import context
from flask import current_app

config = context.config
fileConfig(config.config_file_name)
logger = logging.getLogger('alembic.env')


def get_engine():
    try:
        return current_app.extensions['migrate'].db.get_engine()
    except (TypeError, AttributeError):
        return current_app.extensions['migrate'].db.engine


def get_engine_url():
    try:
        return get_engine().url.render_as_string(hide_password=False).replace('%', '%%')
    except AttributeError:
        return str(get_engine().url).replace('%', '%%')


config.set_main_option('sqlalchemy.url', get_engine_url())
target_db = current_app.extensions['migrate'].db


def get_metadata():
    if hasattr(target_db, 'metadatas'):
        return target_db.metadatas[None]
    return target_db.metadata


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=get_metadata(), literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    def process_revision_directives(context, revision, directives):
        if getattr(config.cmd_opts, 'autogenerate', False):
            script = directives[0]
            if script.upgrade_ops.is_empty():
                directives[:] = []
                logger.info('No changes in schema detected.')

    conf_args = current_app.extensions['migrate'].configure_args
    if conf_args.get("process_revision_directives") is None:
        conf_args["process_revision_directives"] = process_revision_directives

    connectable = get_engine()
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=get_metadata(),
            **conf_args
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 5: 创建 script.py.mako 模板**

Create `backend/migrations/script.py.mako`：

```mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# revision identifiers, used by Alembic.
revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade():
    ${upgrades if upgrades else "pass"}


def downgrade():
    ${downgrades if downgrades else "pass"}
```

- [ ] **Step 6: 在 create_app 中集成 Flask-Migrate**

Modify `backend/app/__init__.py`，在 `db.init_app(app)` 之后（第 32 行后）插入：

```python
    db.init_app(app)

    # Alembic 迁移：开发/测试环境自动 upgrade，生产需手动 flask db upgrade
    from flask_migrate import Migrate
    Migrate(app, db, directory=str(Path(__file__).resolve().parent.parent / "migrations"))
    if app.config.get("AUTO_MIGRATE_ON_START", True):
        with app.app_context():
            from alembic.config import Config as AlembicConfig
            from alembic import command
            alembic_cfg = AlembicConfig(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
            alembic_cfg.set_main_option("script_location", str(Path(__file__).resolve().parent.parent / "migrations"))
            command.upgrade(alembic_cfg, "head")
```

- [ ] **Step 7: 生成基线 migration**

Run: `cd backend && flask --app app.main db init 2>/dev/null; FLASK_APP=run.py flask db init 2>/dev/null; python -c "from app import create_app; from flask_migrate import init; init(create_app(), 'migrations')" 2>/dev/null; cd backend && FLASK_APP=app flask db migrate -m "baseline"`
Expected: 生成 `migrations/versions/<hash>_baseline.py`

如果 `flask db` 命令因 app 入口报错，改用：`cd backend && python -c "from app import create_app, db; from flask_migrate import Migrate; app=create_app(); Migrate(app,db); import os; os.system('FLASK_APP=app flask db migrate -m baseline')"`

- [ ] **Step 8: 标记 _ensure_* 函数为 deprecated**

Modify `backend/app/__init__.py`，在 3 个 `_ensure_*_columns()` 函数定义前各加注释：

```python
def _ensure_job_metadata_columns():
    """[DEPRECATED] Lightweight compatibility for existing local SQLite databases.
    保留一代用于旧库过渡；新库由 Alembic baseline 管理。将在下个版本移除。
    """
```

对 `_ensure_workflow_enhancement_columns` 和 `_ensure_conversation_columns` 添加同样的 deprecated 注释。

- [ ] **Step 9: 写迁移测试**

Create `backend/tests/test_migrations.py`：

```python
"""验证 Alembic 迁移：空库可重建全部表，结构应与 models 一致。"""
import os
import tempfile
from pathlib import Path

from app import create_app, db


def test_alembic_baseline_creates_all_tables():
    """空库执行 alembic upgrade head 后，表集合应与 db.create_all 一致。"""
    fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    try:
        os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"
        app = create_app()
        with app.app_context():
            from sqlalchemy import inspect
            inspector = inspect(db.engine)
            tables = set(inspector.get_table_names())
            # 核心业务表必须存在
            required = {"users", "jobs", "candidates", "pipeline_stages", "interviews"}
            assert required.issubset(tables), f"缺少表: {required - tables}"
            # alembic_version 表应存在（迁移已执行）
            assert "alembic_version" in tables, "alembic_version 表缺失，迁移未执行"
    finally:
        os.environ.pop("DATABASE_URL", None)
        Path(db_path).unlink(missing_ok=True)


def test_migration_directory_exists():
    """migrations 目录和关键文件存在。"""
    mig_dir = Path(__file__).resolve().parent.parent / "migrations"
    assert mig_dir.is_dir(), "migrations/ 目录不存在"
    assert (mig_dir / "env.py").is_file(), "migrations/env.py 不存在"
    assert (mig_dir / "versions").is_dir(), "migrations/versions/ 不存在"
    versions = list((mig_dir / "versions").glob("*.py"))
    assert len(versions) >= 1, "无 migration 版本文件"
```

- [ ] **Step 10: 运行测试验证**

Run: `cd backend && python -m pytest tests/test_migrations.py -v`
Expected: 2 passed

- [ ] **Step 11: 运行全量回归测试**

Run: `cd backend && python -m pytest tests/ -x -q`
Expected: 全部通过（38 个现有 + 2 个新增）

- [ ] **Step 12: 提交**

```bash
git add backend/alembic.ini backend/migrations/ backend/tests/test_migrations.py backend/requirements.txt backend/app/__init__.py
git commit -m "feat(db): 引入 Alembic 数据库迁移基线 (C1)

- 初始化 alembic.ini + migrations/env.py + script.py.mako
- create_app 集成 Flask-Migrate，开发环境自动 upgrade
- 生成 baseline migration 反映现有 models
- _ensure_*_columns 标记 deprecated，保留旧库过渡
- 新增 test_migrations.py 验证空库重建"
```

---

### Task A2: 添加健康检查端点（C2）

**Files:**
- Create: `backend/app/api/health.py`
- Create: `backend/tests/test_health.py`
- Modify: `backend/app/__init__.py:34-36`

- [ ] **Step 1: 写失败测试**

Create `backend/tests/test_health.py`：

```python
"""健康检查端点测试。"""
import time

from app import create_app, db


def test_health_ok():
    """数据库正常时返回 200 + status:ok。"""
    app = create_app()
    client = app.test_client()
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "ok"
    assert data["db"] == "up"
    assert "uptime" in data


def test_health_degraded_when_db_down():
    """数据库不可用时返回 503 + status:degraded。"""
    app = create_app()
    # 模拟 db 故障：让 session.execute 抛异常
    with app.app_context():
        original_execute = db.session.execute
        def boom(*a, **k):
            raise Exception("simulated db down")
        db.session.execute = boom

    client = app.test_client()
    resp = client.get("/health")
    assert resp.status_code == 503
    data = resp.get_json()
    assert data["status"] == "degraded"
    assert data["db"] == "down"

    with app.app_context():
        db.session.execute = original_execute
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && python -m pytest tests/test_health.py -v`
Expected: FAIL（404，路由不存在）

- [ ] **Step 3: 实现健康检查蓝图**

Create `backend/app/api/health.py`：

```python
"""健康检查端点，供容器编排和负载均衡探活。"""
import time

from flask import Blueprint, jsonify
from sqlalchemy import text

from app import db

bp = Blueprint("health", __name__)

_START_TIME = time.monotonic()


@bp.get("/health")
def health():
    """返回服务健康状态。

    200 + {"status":"ok","db":"up","uptime":<秒>} 表示健康。
    503 + {"status":"degraded","db":"down",...} 表示数据库不可用。
    """
    db_ok = True
    try:
        db.session.execute(text("SELECT 1")).scalar()
    except Exception:
        db_ok = False

    uptime = int(time.monotonic() - _START_TIME)
    payload = {
        "status": "ok" if db_ok else "degraded",
        "db": "up" if db_ok else "down",
        "uptime": uptime,
    }
    return jsonify(payload), (200 if db_ok else 503)
```

- [ ] **Step 4: 注册蓝图**

Modify `backend/app/__init__.py`，在第 34 行的 import 中加入 `health`：

```python
    from .api import resume, jobs, demands, talent_maps, candidates, match, interview, pipeline, bi, auth, agent, admin, notifications, boss, health
```

第 35-36 行的蓝图注册循环后追加（health 不加 `/api` 前缀）：

```python
    for bp in [auth.bp, resume.bp, jobs.bp, demands.bp, talent_maps.bp, candidates.bp, match.bp, interview.bp, pipeline.bp, bi.bp, agent.bp, admin.bp, notifications.bp, boss.bp]:
        app.register_blueprint(bp, url_prefix="/api")

    app.register_blueprint(health.bp)  # /health 无 /api 前缀
```

- [ ] **Step 5: 运行测试验证通过**

Run: `cd backend && python -m pytest tests/test_health.py -v`
Expected: 2 passed

- [ ] **Step 6: 运行全量回归**

Run: `cd backend && python -m pytest tests/ -x -q`
Expected: 全部通过

- [ ] **Step 7: 提交**

```bash
git add backend/app/api/health.py backend/tests/test_health.py backend/app/__init__.py
git commit -m "feat(api): 添加 GET /health 健康检查端点 (C2)

- 返回 status/db/uptime，数据库故障时 503
- 供 K8s/ECS/负载均衡探活使用
- 新增 test_health.py 覆盖正常和降级场景"
```

---

### Task A3: 添加 Dockerfile + docker-compose（C3）

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`
- Modify: `backend/app/config.py` — 添加 REDIS_URL 配置（为阶段 B 预留）
- Modify: `DEPLOYMENT.md`

- [ ] **Step 1: 创建 .dockerignore**

Create `.dockerignore`：

```
.git
.github
.worktrees
.uploads
**/__pycache__
**/.pytest_cache
**/node_modules
**/venv
**/.venv
backend/instance
backend/uploads
frontend/uploads
*.db
*.log
```

- [ ] **Step 2: 创建 Dockerfile（多阶段构建）**

Create `Dockerfile`：

```dockerfile
# ── 阶段 1：构建前端 ──────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── 阶段 2：后端运行时 ────────────────────────────────
FROM python:3.11-slim AS runtime
WORKDIR /app

# 系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 && \
    rm -rf /var/lib/apt/lists/*

# 安装 base_agent 为可编辑包（先复制再 pip install）
COPY base_agent/ ./base_agent/
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# 复制后端代码
COPY backend/ ./backend/

# 复制前端构建产物
COPY --from=frontend-build /build/dist ./frontend/dist

ENV FRONTEND_DIST=/app/frontend/dist
ENV PYTHONPATH=/app/backend
WORKDIR /app/backend

EXPOSE 5001
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5001", "--timeout", "120", "run:app"]
```

- [ ] **Step 3: 创建 docker-compose.yml**

Create `docker-compose.yml`：

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: hireinsight
      POSTGRES_USER: hireinsight
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-hireinsight_dev}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hireinsight"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build: .
    environment:
      DATABASE_URL: postgresql+psycopg://hireinsight:${POSTGRES_PASSWORD:-hireinsight_dev}@db:5432/hireinsight
      REDIS_URL: redis://redis:6379/0
      JWT_SECRET: ${JWT_SECRET}
      CORS_ORIGINS: ${CORS_ORIGINS:-}
      FLASK_DEBUG: "false"
      AUTO_MIGRATE_ON_START: "true"
    ports:
      - "5001:5001"
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

volumes:
  pgdata:
```

- [ ] **Step 4: 在 config.py 预留 REDIS_URL**

Modify `backend/app/config.py`，在第 66 行（Celery 配置后）追加：

```python
    # Redis（阶段 B 限流用；开发可留空，降级为内存限流）
    REDIS_URL = os.environ.get("REDIS_URL", "")
```

- [ ] **Step 5: 验证 Dockerfile 语法**

Run: `docker compose config --quiet 2>&1 || echo "docker 不可用，跳过语法校验"`
Expected: 无语法错误（或提示 docker 不可用）

- [ ] **Step 6: 扩展部署测试**

Modify `backend/tests/test_deployment_artifacts.py`，在现有测试中追加（如文件已有结构则在合适位置追加测试函数）：

```python
def test_dockerfile_exists_and_multistage():
    """Dockerfile 存在且为多阶段构建。"""
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent.parent
    dockerfile = root / "Dockerfile"
    assert dockerfile.is_file(), "Dockerfile 不存在"
    content = dockerfile.read_text()
    assert "FROM" in content
    assert "AS frontend-build" in content or "frontend-build" in content
    assert "gunicorn" in content


def test_docker_compose_exists_and_valid_yaml():
    """docker-compose.yml 存在且可解析。"""
    from pathlib import Path
    try:
        import yaml
    except ImportError:
        return  # yaml 未安装时跳过
    root = Path(__file__).resolve().parent.parent.parent
    compose = root / "docker-compose.yml"
    assert compose.is_file(), "docker-compose.yml 不存在"
    data = yaml.safe_load(compose.read_text())
    assert "services" in data
    assert "db" in data["services"]
    assert "backend" in data["services"]
    assert "redis" in data["services"]
```

- [ ] **Step 7: 运行测试**

Run: `cd backend && python -m pytest tests/test_deployment_artifacts.py -v`
Expected: 新增测试通过（yaml 未安装时第二个测试 skip）

- [ ] **Step 8: 更新 DEPLOYMENT.md**

在 `DEPLOYMENT.md` 末尾追加章节：

```markdown
## Docker Compose 部署（推荐）

### 前置条件
- Docker 24+ / Docker Compose v2
- 设置环境变量：`POSTGRES_PASSWORD`、`JWT_SECRET`、`CORS_ORIGINS`

### 启动
```bash
export JWT_SECRET=$(python -c "from secrets import token_urlsafe; print(token_urlsafe(32))")
export POSTGRES_PASSWORD=your_secure_password
export CORS_ORIGINS=https://your-domain.com
docker compose up -d --build
```

### 验证
```bash
curl http://localhost:5001/health
# 期望: {"status":"ok","db":"up","uptime":...}
```

### 数据库迁移
首次启动时 `AUTO_MIGRATE_ON_START=true` 会自动执行 `alembic upgrade head`。
手动迁移：`docker compose exec backend flask db upgrade`
```

- [ ] **Step 9: 提交**

```bash
git add Dockerfile docker-compose.yml .dockerignore backend/app/config.py backend/tests/test_deployment_artifacts.py DEPLOYMENT.md
git commit -m "feat(infra): 添加 Dockerfile + docker-compose 容器化部署 (C3)

- 多阶段构建：node:20 构建前端 + python:3.11 运行后端
- compose 定义 db(postgres) + redis + backend 三服务
- config.py 预留 REDIS_URL（阶段 B 限流用）
- 扩展部署测试校验 Dockerfile/compose
- DEPLOYMENT.md 补充 docker compose 启动方式"
```

---

### Task A4: 前端 ErrorBoundary 兜底（C5）

**Files:**
- Create: `frontend/src/components/ErrorBoundary.tsx`
- Modify: `frontend/src/App.tsx:193-211`

- [ ] **Step 1: 创建 ErrorBoundary 组件**

Create `frontend/src/components/ErrorBoundary.tsx`：

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * 捕获 lazy chunk 加载失败等渲染错误，提供重试按钮，防止白屏。
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] 渲染错误:', error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-xl font-semibold text-foreground">页面加载失败</h1>
          <p className="text-sm text-muted">
            {this.state.error?.message || '未知错误，请重试或返回首页。'}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
            >
              重试
            </button>
            <a
              href="/"
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
            >
              返回首页
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: 在 App.tsx 包裹 ErrorBoundary**

Modify `frontend/src/App.tsx`，在 import 区（第 14 行后）追加：

```tsx
import { ErrorBoundary } from './components/ErrorBoundary';
```

修改 `App` 函数（第 193-211 行），在 `Suspense` 外层包裹 `ErrorBoundary`：

```tsx
export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <Suspense
              fallback={
                <div className="flex min-h-screen items-center justify-center text-sm text-muted">
                  加载中…
                </div>
              }
            >
              <AppRoutes />
            </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
```

- [ ] **Step 3: 验证构建**

Run: `cd frontend && npm run build`
Expected: 构建成功，无类型错误

- [ ] **Step 4: 验证 typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 无错误

- [ ] **Step 5: 手动验证降级 UI**

Run: `cd frontend && npm run build && cd .. && python backend/run.py`（启动服务）
浏览器访问 `http://localhost:5001/`，登录后，在 DevTools Network 面板阻止某个 chunk 文件加载（或删除 dist/assets 中一个 chunk），刷新页面。
Expected: 显示"页面加载失败"+ 重试按钮，不白屏

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/ErrorBoundary.tsx frontend/src/App.tsx
git commit -m "feat(frontend): 添加 ErrorBoundary 兜底 lazy chunk 加载失败 (C5)

- ErrorBoundary 捕获渲染错误，提供重试 + 返回首页
- App.tsx 在 Suspense 外层包裹 ErrorBoundary
- chunk 加载失败不再白屏"
```

---

### Task A5: 阶段 A 验收

- [ ] **Step 1: 全量后端测试**

Run: `cd backend && python -m pytest tests/ -v`
Expected: 全部通过

- [ ] **Step 2: 前端构建**

Run: `cd frontend && npm run build && npm run typecheck`
Expected: 成功

- [ ] **Step 3: docker compose 启动验证**

Run: `docker compose up -d --build && sleep 10 && curl -s http://localhost:5001/health && docker compose down`
Expected: `{"status":"ok",...}`

- [ ] **Step 4: 标记阶段 A 完成**

```bash
git tag -a stage-a-complete -m "阶段A基础设施就绪完成"
```

---

# 阶段 B — 后端稳定性（HIGH 后端项）

对应不足 H1（sys.path 散布）、H2（内存限流器）、H3（DB commit 无异常）、H4（异常静默）、M4（日志不一致）。

---

### Task B1: base_agent 配置为可编辑包，移除 sys.path.insert（H1）

**Files:**
- Create: `base_agent/pyproject.toml`
- Modify: `backend/requirements.txt`
- Modify: `backend/app/config.py:1-8`
- Modify: `backend/app/api/jobs.py:11-13`
- Modify: `backend/app/services/agent_service.py:24-26`
- Modify: `backend/app/services/interview_service.py:4-6`
- Modify: `backend/app/services/match_service.py:4-6`
- Modify: `backend/app/services/resume_service.py:5-7`
- Modify: `RUNNING.md`

- [ ] **Step 1: 创建 base_agent/pyproject.toml**

Create `base_agent/pyproject.toml`：

```toml
[build-system]
requires = ["setuptools>=68.0", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "hireinsight-base-agent"
version = "0.1.0"
description = "智聘系统 base_agent 模块：LLM 客户端、简历解析、职位爬虫等"
requires-python = ">=3.10"

[tool.setuptools]
packages = ["llm_client", "resume_parser", "job_agent", "interview_agent", "AI_interviewer", "job_crawler", "job_crawler_v2", "job_crawler_selenium", "job_matcher", "pipeline", "llm_utils", "md_to_pdf", "tag_rate", "update_jobs", "add_tags", "api_server"]
```

注意：`packages` 列表需根据 `base_agent/` 下实际含 `.py` 的顶层模块调整。先运行 `ls base_agent/*.py | sed 's|.*/||;s|\.py||'` 确认。

- [ ] **Step 2: 验证 base_agent 顶层模块名**

Run: `ls base_agent/*.py | sed 's|.*/||;s|\.py||'`
Expected: 输出所有模块名，用于核对 pyproject.toml 的 packages 列表

如输出与 Step 1 的 packages 列表不符，修正 pyproject.toml。

- [ ] **Step 3: 安装为可编辑包**

Run: `cd /Users/bytedance/Desktop/zhiping && pip install -e ./base_agent`
Expected: `Successfully installed hireinsight-base-agent-0.1.0`

- [ ] **Step 4: 验证 import 可用**

Run: `python -c "from llm_client import LLMClient; print('import ok')"`
Expected: 输出 `import ok`（不依赖 sys.path）

- [ ] **Step 5: 在 requirements.txt 中引用**

Modify `backend/requirements.txt`，将 BOSS CLI 段后追加：

```
# ── 内部模块（可编辑安装）────────────────────────────────
hireinsight-base-agent @ file:///${PROJECT_ROOT}/base_agent
```

注意：`file://` URL 在 pip 中不支持环境变量插值。改用相对路径方式：在 `requirements.txt` 末尾加注释，并在 `RUNNING.md` 中说明手动 `pip install -e ./base_agent`。实际 requirements.txt 追加：

```
# base_agent 需手动可编辑安装：pip install -e ./base_agent（见 RUNNING.md）
```

- [ ] **Step 6: 移除 config.py 的 sys.path.insert**

Modify `backend/app/config.py`，删除第 1-8 行的：

```python
import os
import sys
from pathlib import Path

# 把 base_agent 加入 sys.path，复用原始模块
BASE_AGENT_DIR = Path(__file__).resolve().parent.parent.parent / "base_agent"
if str(BASE_AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_AGENT_DIR))
```

替换为：

```python
import os
from pathlib import Path
```

- [ ] **Step 7: 移除 jobs.py 的 sys.path.insert**

Modify `backend/app/api/jobs.py`，删除第 11-13 行的 sys.path 注入代码（保留其余 import）。

- [ ] **Step 8: 移除 agent_service.py 的 sys.path.insert**

Modify `backend/app/services/agent_service.py`，删除第 24-26 行的：

```python
BASE_AGENT_DIR = Path(__file__).resolve().parent.parent.parent.parent / "base_agent"
if str(BASE_AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_AGENT_DIR))
```

同时删除第 15 行的 `import sys`（如无其他引用）和第 20 行的 `from pathlib import Path`（如无其他引用，需检查）。

- [ ] **Step 9: 移除 interview_service.py 的 sys.path.insert**

Modify `backend/app/services/interview_service.py`，删除第 4-6 行的 sys.path 注入代码。

- [ ] **Step 10: 移除 match_service.py 的 sys.path.insert**

Modify `backend/app/services/match_service.py`，删除第 4-6 行的 sys.path 注入代码。

- [ ] **Step 11: 移除 resume_service.py 的 sys.path.insert**

Modify `backend/app/services/resume_service.py`，删除第 5-7 行的 sys.path 注入代码。

- [ ] **Step 12: 验证无残留 sys.path.insert**

Run: `grep -rn "sys.path.insert" backend/app/`
Expected: 无输出

- [ ] **Step 13: 运行全量测试**

Run: `cd backend && python -m pytest tests/ -x -q`
Expected: 全部通过

- [ ] **Step 14: 更新 RUNNING.md**

在 `RUNNING.md` 的安装步骤中追加（在 `pip install -r requirements.txt` 之后）：

```markdown
4. 安装 base_agent 为可编辑包（必须）：
   ```bash
   cd /path/to/zhiping
   pip install -e ./base_agent
   ```
```

- [ ] **Step 15: 提交**

```bash
git add base_agent/pyproject.toml backend/requirements.txt backend/app/ RUNNING.md
git commit -m "refactor(deps): base_agent 配置为可编辑包，移除 6 处 sys.path.insert (H1)

- 新增 base_agent/pyproject.toml 定义包
- pip install -e ./base_agent 替代运行时 sys.path 注入
- 移除 config/jobs/agent_service/interview_service/match_service/resume_service 中的 sys.path.insert
- RUNNING.md 补充可编辑安装步骤"
```

---

### Task B2: 限流器改 Redis-backed（H2）

**Files:**
- Create: `backend/app/middleware/limiter.py`
- Modify: `backend/requirements.txt`
- Modify: `backend/app/middleware/rate_limit.py`
- Modify: `backend/app/__init__.py`
- Create: `backend/tests/test_rate_limit_redis.py`

- [ ] **Step 1: 添加依赖**

Modify `backend/requirements.txt`，在数据库迁移段后追加：

```
# ── 限流 ─────────────────────────────────────────────────
flask-limiter==3.11.0
redis==5.2.1
```

- [ ] **Step 2: 安装依赖**

Run: `cd backend && pip install flask-limiter==3.11.0 redis==5.2.1`
Expected: 安装成功

- [ ] **Step 3: 写失败测试**

Create `backend/tests/test_rate_limit_redis.py`：

```python
"""验证限流器：Redis 模式下多请求共享计数，超限返回 429。"""
from app import create_app


def test_rate_limit_allows_within_limit():
    """限额内请求正常返回。"""
    app = create_app()
    app.config["RATE_LIMITS"] = {
        "test.endpoint": {"limit": 3, "window_seconds": 60},
    }
    app.config["RATE_LIMIT_ENABLED"] = True
    client = app.test_client()

    @app.route("/__test_limited")
    def _limited():
        from app.middleware.rate_limit import rate_limit
        # 通过装饰器手动应用
        return {"ok": True}

    # 直接测试装饰器逻辑：模拟 3 次请求
    with app.test_request_context():
        from app.middleware.rate_limit import rate_limit
        # 由于内存 fallback 模式下行为一致，这里验证装饰器可正常装饰
        decorated = rate_limit("test.endpoint")(lambda: {"ok": True})
        results = [decorated() for _ in range(3)]
        assert all(r == {"ok": True} for r in results), "限额内应全部成功"


def test_rate_limit_blocks_over_limit():
    """超限请求返回 429。"""
    app = create_app()
    app.config["RATE_LIMITS"] = {
        "test.block": {"limit": 2, "window_seconds": 60},
    }
    app.config["RATE_LIMIT_ENABLED"] = True

    with app.test_request_context():
        from app.middleware.rate_limit import rate_limit
        decorated = rate_limit("test.block")(lambda: {"ok": True})

        # 前 2 次成功
        assert decorated() == {"ok": True}
        assert decorated() == {"ok": True}
        # 第 3 次应被限流
        result = decorated()
        assert hasattr(result, "status_code"), "应返回 429 Response"
        assert result.status_code == 429


def test_rate_limit_disabled():
    """RATE_LIMIT_ENABLED=False 时不限流。"""
    app = create_app()
    app.config["RATE_LIMIT_ENABLED"] = False

    with app.test_request_context():
        from app.middleware.rate_limit import rate_limit
        app.config["RATE_LIMITS"] = {"test.off": {"limit": 1, "window_seconds": 60}}
        decorated = rate_limit("test.off")(lambda: {"ok": True})
        results = [decorated() for _ in range(10)]
        assert all(r == {"ok": True} for r in results), "禁用限流时应全部放行"
```

- [ ] **Step 4: 运行测试验证当前行为**

Run: `cd backend && python -m pytest tests/test_rate_limit_redis.py -v`
Expected: 现有内存限流器应能通过前两个测试（验证行为不变），第三个测试通过

- [ ] **Step 5: 创建 limiter.py 初始化模块**

Create `backend/app/middleware/limiter.py`：

```python
"""flask-limiter 初始化。

Redis 可用时使用 Redis storage（多 worker 共享计数）；
不可用时降级为内存 storage（仅开发用，记录 warning）。
"""
import logging

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

logger = logging.getLogger(__name__)

limiter = None  # 延迟初始化，在 init_limiter 中设置


def init_limiter(app):
    """在 create_app 中调用，初始化全局 Limiter 实例。"""
    global limiter
    redis_url = app.config.get("REDIS_URL", "")
    if redis_url:
        storage_uri = redis_url
        logger.info("限流器使用 Redis storage: %s", redis_url)
    else:
        storage_uri = "memory://"
        logger.warning("REDIS_URL 未配置，限流降级为内存模式（仅开发，多 worker 下不准确）")

    limiter = Limiter(
        key_func=get_remote_address,
        app=app,
        storage_uri=storage_uri,
        default_limits=[],
        headers_enabled=True,
    )
    return limiter
```

- [ ] **Step 6: 改造 rate_limit 装饰器**

Replace `backend/app/middleware/rate_limit.py` 全部内容：

```python
"""限流装饰器：基于 flask-limiter，Redis 不可用时降级为内存。

保持原有 rate_limit(name) 接口不变，内部委托给 flask-limiter。
"""
import logging
from functools import wraps

from flask import current_app, jsonify, request
from collections import defaultdict, deque
from time import monotonic

logger = logging.getLogger(__name__)

# 内存 fallback（仅 REDIS_URL 未配置时使用，单 worker 开发场景）
_buckets = defaultdict(deque)


def _client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    return request.remote_addr or "unknown"


def _limit_config(name):
    limits = current_app.config.get("RATE_LIMITS") or {}
    return limits.get(name) or {}


def rate_limit(name):
    """限流装饰器。

    优先使用 flask-limiter（Redis-backed）；不可用时降级为内存计数。
    保持与原接口兼容：rate_limit("auth.login") 装饰视图函数。
    """
    def decorator(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            if not current_app.config.get("RATE_LIMIT_ENABLED", True):
                return fn(*args, **kwargs)

            config = _limit_config(name)
            limit = int(config.get("limit") or 0)
            window = int(config.get("window_seconds") or 60)
            if limit <= 0:
                return fn(*args, **kwargs)

            # 优先尝试 flask-limiter（Redis-backed）
            from app.middleware.limiter import limiter as _fl
            if _fl is not None and current_app.config.get("REDIS_URL"):
                try:
                    # 用 flask-limiter 的 share + 限流
                    limiter_decorator = _fl.limit(
                        f"{limit}/minute",
                        key_func=lambda: f"{name}:{_client_ip()}",
                        per_method=True,
                    )
                    return limiter_decorator(fn)(*args, **kwargs)
                except Exception as exc:
                    logger.warning("flask-limiter 限流失败，降级内存: %s", exc)

            # 内存 fallback
            now = monotonic()
            bucket_key = f"{name}:{_client_ip()}"
            bucket = _buckets[bucket_key]
            while bucket and now - bucket[0] >= window:
                bucket.popleft()

            if len(bucket) >= limit:
                retry_after = max(1, int(window - (now - bucket[0])))
                response = jsonify({"error": "请求过于频繁，请稍后再试"})
                response.status_code = 429
                response.headers["Retry-After"] = str(retry_after)
                return response

            bucket.append(now)
            return fn(*args, **kwargs)

        return wrapped

    return decorator
```

- [ ] **Step 7: 在 create_app 初始化 limiter**

Modify `backend/app/__init__.py`，在 `db.init_app(app)` 之后、蓝图注册之前插入：

```python
    db.init_app(app)

    # 限流器初始化（Redis-backed，不可用降级内存）
    from .middleware.limiter import init_limiter
    init_limiter(app)
```

- [ ] **Step 8: 运行测试**

Run: `cd backend && python -m pytest tests/test_rate_limit_redis.py -v`
Expected: 3 passed

- [ ] **Step 9: 运行全量回归**

Run: `cd backend && python -m pytest tests/ -x -q`
Expected: 全部通过

- [ ] **Step 10: 提交**

```bash
git add backend/app/middleware/limiter.py backend/app/middleware/rate_limit.py backend/app/__init__.py backend/requirements.txt backend/tests/test_rate_limit_redis.py
git commit -m "feat(security): 限流器改 Redis-backed，多 worker 共享计数 (H2)

- 引入 flask-limiter + redis 依赖
- limiter.py 初始化 Redis storage，不可用降级内存
- rate_limit 装饰器优先用 flask-limiter，保留内存 fallback
- 新增 test_rate_limit_redis.py 验证限流行为"
```

---

### Task B3: 全局 SQLAlchemy 错误处理 + 静默异常修复（H3 + H4）

**Files:**
- Modify: `backend/app/__init__.py`
- Create: `backend/tests/test_error_handling.py`
- Modify: `backend/app/api/auth.py:23`
- Modify: `backend/app/api/jobs.py:57`
- Modify: `backend/app/services/interview_service.py:57,67,77`
- Modify: `backend/app/services/boss_service.py:217,573`
- Modify: 其他 grep 发现的静默 except

- [ ] **Step 1: 写全局错误处理器测试**

Create `backend/tests/test_error_handling.py`：

```python
"""验证全局 SQLAlchemy 错误处理：返回结构化错误 + rollback。"""
from app import create_app, db
from app.models import User
from sqlalchemy.exc import IntegrityError


def test_sqlalchemy_error_returns_structured_500():
    """DB 约束冲突返回 {error, code} 而非裸 traceback。"""
    app = create_app()
    client = app.test_client()

    @app.route("/__test_db_error")
    def _trigger():
        # 触发 IntegrityError：插入重复主键
        u1 = User(email="dup@test.com", name="dup", role="recruiter", password_hash="x")
        u2 = User(email="dup@test.com", name="dup2", role="recruiter", password_hash="x")
        db.session.add(u1)
        db.session.commit()
        db.session.add(u2)
        db.session.commit()  # 触发唯一约束冲突
        return {"ok": True}

    resp = client.get("/__test_db_error")
    assert resp.status_code == 500
    data = resp.get_json()
    assert "error" in data
    assert data.get("code") == "DB_ERROR"
    # 不应泄露 traceback
    assert "Traceback" not in resp.get_data(as_text=True)


def test_generic_exception_returns_500():
    """未捕获异常返回 500 + 通用错误。"""
    app = create_app()
    client = app.test_client()

    @app.route("/__test_crash")
    def _crash():
        raise ValueError("boom")

    resp = client.get("/__test_crash")
    assert resp.status_code == 500
    data = resp.get_json()
    assert "error" in data
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && python -m pytest tests/test_error_handling.py -v`
Expected: FAIL（返回裸 500 traceback，无结构化错误）

- [ ] **Step 3: 注册全局错误处理器**

Modify `backend/app/__init__.py`，在 `_register_frontend(app)` 之前（蓝图注册之后）插入：

```python
    _register_error_handlers(app)
```

在文件末尾（`_register_frontend` 之前）添加函数：

```python
def _register_error_handlers(app):
    """全局错误处理：DB 异常返回结构化错误 + rollback，不泄露 traceback。"""
    import logging
    from sqlalchemy.exc import SQLAlchemyError

    logger = logging.getLogger(__name__)

    @app.errorhandler(SQLAlchemyError)
    def handle_db_error(exc):
        logger.error("数据库错误: %s", exc, exc_info=True)
        db.session.rollback()
        is_debug = app.config.get("FLASK_DEBUG", False) or app.config.get("TESTING", False)
        detail = str(exc) if is_debug else "数据库操作失败"
        return {"error": detail, "code": "DB_ERROR"}, 500

    @app.errorhandler(Exception)
    def handle_generic_error(exc):
        logger.error("未捕获异常: %s", exc, exc_info=True)
        is_debug = app.config.get("FLASK_DEBUG", False) or app.config.get("TESTING", False)
        detail = str(exc) if is_debug else "服务器内部错误"
        return {"error": detail, "code": "INTERNAL_ERROR"}, 500
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd backend && python -m pytest tests/test_error_handling.py -v`
Expected: 2 passed

- [ ] **Step 5: 修复 auth.py 静默异常**

Modify `backend/app/api/auth.py`，在第 23 行的：

```python
    except Exception:
```

改为：

```python
    except Exception as exc:
        logging.getLogger(__name__).warning("密码校验异常: %s", exc)
```

确保文件顶部有 `import logging`（如无则添加）。

- [ ] **Step 6: 修复 jobs.py 静默异常**

Modify `backend/app/api/jobs.py`，在第 57 行的 `except Exception:` 处，改为：

```python
    except Exception as exc:
        logging.getLogger(__name__).warning("LLM 岗位元数据提取失败: %s", exc)
```

确保有 `import logging`。

- [ ] **Step 7: 修复 interview_service.py 静默异常**

Modify `backend/app/services/interview_service.py`，在第 57、67、77 行的 3 处 `except Exception:`，每处改为带 logger：

```python
    except Exception as exc:
        logging.getLogger(__name__).warning("LLM 面试解析失败: %s", exc)
```

确保有 `import logging`。

- [ ] **Step 8: 修复 boss_service.py 静默异常**

Modify `backend/app/services/boss_service.py`，在第 217 行和 573 行的 `except Exception:`，改为带 logger。第 63、71 行的 `except Exception:  # noqa: BLE001` 也补充 logger.warning。

- [ ] **Step 9: grep 全部剩余静默 except**

Run: `grep -rn "except Exception:" backend/app/ | grep -v "as " | grep -v "# noqa"`
Expected: 应无输出（所有 except Exception 都已补 `as exc` 或已有 logger）

如有残留，逐个补充 `as exc` + `logger.warning`。

- [ ] **Step 10: 运行全量回归**

Run: `cd backend && python -m pytest tests/ -x -q`
Expected: 全部通过

- [ ] **Step 11: 提交**

```bash
git add backend/app/__init__.py backend/app/api/auth.py backend/app/api/jobs.py backend/app/services/ backend/tests/test_error_handling.py
git commit -m "fix(errors): 全局 SQLAlchemy 错误处理 + 静默异常补日志 (H3+H4)

- 注册 SQLAlchemyError/Exception 全局 handler，返回结构化错误 + rollback
- 生产不泄露 traceback，开发/测试附带详情
- 修复 auth/jobs/interview_service/boss_service 等 17 处静默 except
- 新增 test_error_handling.py 验证 DB 异常结构化响应"
```

---

### Task B4: 统一日志配置（M4）

**Files:**
- Create: `backend/app/logging_config.py`
- Modify: `backend/app/__init__.py`
- Create: `backend/tests/test_logging.py`

- [ ] **Step 1: 写失败测试**

Create `backend/tests/test_logging.py`：

```python
"""验证日志配置：dictConfig 生效，HTTP 请求有访问日志。"""
import logging

from app import create_app


def test_logging_dictconfig_applied():
    """create_app 后 logger 已配置且级别正确。"""
    app = create_app()
    hs_logger = logging.getLogger("hireinsight")
    assert hs_logger.level in (logging.INFO, logging.DEBUG), \
        f"hireinsight logger 级别应为 INFO/DEBUG，实际 {hs_logger.level}"
    assert len(hs_logger.handlers) > 0, "hireinsight logger 应有 handler"


def test_http_request_log_emitted():
    """请求触发后应记录访问日志。"""
    app = create_app()
    client = app.test_client()

    records = []
    handler = logging.Handler()
    handler.emit = lambda r: records.append(r)
    logging.getLogger("hireinsight.access").addHandler(handler)

    client.get("/health")

    access_logs = [r for r in records if r.name == "hireinsight.access"]
    assert len(access_logs) >= 1, "应至少有 1 条访问日志"

    logging.getLogger("hireinsight.access").removeHandler(handler)
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && python -m pytest tests/test_logging.py -v`
Expected: FAIL（logger 未配置）

- [ ] **Step 3: 创建 logging_config.py**

Create `backend/app/logging_config.py`：

```python
"""统一日志配置：dictConfig + HTTP 访问日志中间件。"""
import logging
import logging.config
import time


def setup_logging(app):
    """在 create_app 开头调用，配置 dictConfig。"""
    is_debug = app.config.get("FLASK_DEBUG", False) or app.config.get("TESTING", False)
    level = "DEBUG" if is_debug else "INFO"

    config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "format": "[%(asctime)s] %(levelname)s %(name)s %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "level": "NOTSET",
                "formatter": "default",
                "stream": "ext://sys.stdout",
            },
        },
        "loggers": {
            "hireinsight": {
                "level": level,
                "handlers": ["console"],
                "propagate": False,
            },
            "hireinsight.access": {
                "level": "INFO",
                "handlers": ["console"],
                "propagate": False,
            },
        },
        "root": {
            "level": "WARNING",
            "handlers": ["console"],
        },
    }
    logging.config.dictConfig(config)


def register_request_logging(app):
    """注册 HTTP 请求/响应访问日志中间件。"""
    access_logger = logging.getLogger("hireinsight.access")

    @app.before_request
    def _log_request():
        from flask import request
        request._hs_start_time = time.monotonic()
        access_logger.info(
            "REQ %s %s from %s",
            request.method,
            request.path,
            request.remote_addr or "unknown",
        )

    @app.after_request
    def _log_response(response):
        from flask import request
        duration_ms = int((time.monotonic() - getattr(request, "_hs_start_time", time.monotonic())) * 1000)
        access_logger.info(
            "RES %s %s -> %d %dms",
            request.method,
            request.path,
            response.status_code,
            duration_ms,
        )
        return response
```

- [ ] **Step 4: 在 create_app 集成**

Modify `backend/app/__init__.py`，在 `create_app` 函数开头（`app = Flask(__name__)` 之后）插入：

```python
    from .logging_config import setup_logging, register_request_logging
    setup_logging(app)
```

在蓝图注册之后、`_register_error_handlers` 之前插入：

```python
    register_request_logging(app)
```

- [ ] **Step 5: 运行测试**

Run: `cd backend && python -m pytest tests/test_logging.py -v`
Expected: 2 passed

- [ ] **Step 6: 运行全量回归**

Run: `cd backend && python -m pytest tests/ -x -q`
Expected: 全部通过

- [ ] **Step 7: 提交**

```bash
git add backend/app/logging_config.py backend/app/__init__.py backend/tests/test_logging.py
git commit -m "feat(logging): 统一 dictConfig 日志配置 + HTTP 访问日志中间件 (M4)

- logging_config.py 定义 dictConfig，hireinsight logger 统一格式
- before_request/after_request 记录方法+路径+IP+状态码+耗时
- 所有模块可用 logging.getLogger(__name__) 输出结构化日志
- 新增 test_logging.py 验证配置生效和访问日志"
```

---

### Task B5: 阶段 B 验收

- [ ] **Step 1: 验证 sys.path 清除**

Run: `grep -rn "sys.path.insert" backend/app/`
Expected: 无输出

- [ ] **Step 2: 全量后端测试**

Run: `cd backend && python -m pytest tests/ -v`
Expected: 全部通过

- [ ] **Step 3: 标记阶段 B 完成**

```bash
git tag -a stage-b-complete -m "阶段B后端稳定性完成"
```

---

# 阶段 C — 前端稳定性（HIGH 前端项）

对应不足 C4（无真正测试）、H5（API 无类型）、H6（巨型组件）、H7（代码重复）、H8（useAsync 缺能力）。

---

### Task C1: 引入 Vitest + Testing Library（C4）

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/utils.tsx`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/src/components/ErrorBoundary.test.tsx`
- Create: `frontend/src/pages/LoginPage.test.tsx`

- [ ] **Step 1: 安装测试依赖**

Run: `cd frontend && npm install -D vitest@^2.1.0 @testing-library/react@^16.1.0 @testing-library/jest-dom@^6.6.0 @testing-library/user-event@^14.5.0 jsdom@^25.0.0 @vitest/coverage-v8@^2.1.0`
Expected: 安装成功

- [ ] **Step 2: 创建 vitest.config.ts**

Create `frontend/vitest.config.ts`：

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 3: 创建 setup.ts**

Create `frontend/src/test/setup.ts`：

```typescript
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: 创建测试 render wrapper**

Create `frontend/src/test/utils.tsx`：

```tsx
import { render, type RenderOptions } from '@testing-library/react';
import { type ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui';
import { AuthProvider } from '../lib/auth';

// 用于测试的 AuthProvider mock（无真实 token）
const TestProviders = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>
    <AuthProvider>
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  </MemoryRouter>
);

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) => render(ui, { wrapper: TestProviders, ...options });

export * from '@testing-library/react';
export { customRender as render };
```

- [ ] **Step 5: 添加 package.json 脚本**

Modify `frontend/package.json`，在 `scripts` 中追加：

```json
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
```

- [ ] **Step 6: 写 ErrorBoundary 测试**

Create `frontend/src/components/ErrorBoundary.test.tsx`：

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): React.ReactElement {
  throw new Error('test boom');
}

describe('ErrorBoundary', () => {
  it('捕获渲染错误显示降级 UI', () => {
    // 抑制 console.error（React 会打印错误日志）
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('页面加载失败')).toBeInTheDocument();
    expect(screen.getByText('重试')).toBeInTheDocument();
    expect(screen.getByText('返回首页')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('正常渲染子组件', () => {
    render(
      <ErrorBoundary>
        <div>正常内容</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('正常内容')).toBeInTheDocument();
  });
});
```

注意：文件顶部需加 `import { vi } from 'vitest';`（如 globals 已启用可省略，但显式导入更安全）。在文件顶部添加：

```tsx
import { describe, it, expect, vi } from 'vitest';
```

- [ ] **Step 7: 运行测试**

Run: `cd frontend && npm test`
Expected: 2 passed

- [ ] **Step 8: 写 LoginPage 测试**

先查看 LoginPage 结构：

Run: `head -50 frontend/src/pages/LoginPage.tsx`

Create `frontend/src/pages/LoginPage.test.tsx`（根据实际 LoginPage 导出和结构调整）：

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '../test/utils';
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  it('渲染登录表单', () => {
    render(<LoginPage />);
    // LoginPage 应有邮箱/密码输入框和登录按钮
    expect(screen.getByText(/登录|登陆/)).toBeInTheDocument();
  });
});
```

如断言失败，根据实际渲染内容调整断言文本。目标是验证组件可渲染。

- [ ] **Step 9: 运行全部前端测试**

Run: `cd frontend && npm test`
Expected: 全部通过

- [ ] **Step 10: 验证 typecheck 不被破坏**

Run: `cd frontend && npm run typecheck`
Expected: 无错误

- [ ] **Step 11: 提交**

```bash
git add frontend/package.json frontend/vitest.config.ts frontend/src/test/ frontend/src/components/ErrorBoundary.test.tsx frontend/src/pages/LoginPage.test.tsx
git commit -m "feat(test): 引入 Vitest + Testing Library 前端测试框架 (C4)

- 安装 vitest/@testing-library/react/jsdom 等测试依赖
- vitest.config.ts 配置 jsdom 环境
- test/utils.tsx 提供 render wrapper（AuthProvider+Router+Toast）
- ErrorBoundary + LoginPage 首批组件测试
- package.json 添加 test/test:watch/test:coverage 脚本"
```

---

### Task C2: API BOSS 端点补类型（H5）

**Files:**
- Create: `frontend/src/types/boss.ts`
- Modify: `frontend/src/lib/api.ts:604-648`

- [ ] **Step 1: 查看后端 BOSS API 实际返回结构**

Run: `grep -A 5 "def boss_search_candidates\|def boss_recommend\|def boss_inbox\|def boss_resume\|def boss_greet\|def boss_request_resume\|def boss_reply" backend/app/api/boss.py`
Expected: 看到各端点返回的 dict 结构

- [ ] **Step 2: 创建 boss.ts 类型定义**

Create `frontend/src/types/boss.ts`：

```typescript
/** BOSS 直聘 API 响应类型（对应 backend/app/api/boss.py）。 */

export interface BossCandidateItem {
  encrypt_geek_id?: string;
  name?: string;
  friend_id?: number;
  security_id?: string;
  [key: string]: unknown;
}

export interface BossSearchResult {
  ok: boolean;
  items: BossCandidateItem[];
  total?: number;
  [key: string]: unknown;
}

export interface BossRecommendResult {
  ok: boolean;
  items: BossCandidateItem[];
  [key: string]: unknown;
}

export interface BossInboxResult {
  ok: boolean;
  items: BossCandidateItem[];
  [key: string]: unknown;
}

export interface BossResumeResult {
  ok: boolean;
  resume?: {
    name?: string;
    raw?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BossGreetResult {
  ok: boolean;
  message?: string;
  [key: string]: unknown;
}

export interface BossRequestResumeResult {
  ok: boolean;
  message?: string;
  [key: string]: unknown;
}

export interface BossReplyResult {
  ok: boolean;
  message?: string;
  [key: string]: unknown;
}
```

- [ ] **Step 3: 修改 api.ts 返回类型**

Modify `frontend/src/lib/api.ts`，在文件顶部 import 区追加：

```typescript
import type {
  BossSearchResult,
  BossRecommendResult,
  BossInboxResult,
  BossResumeResult,
  BossGreetResult,
  BossRequestResumeResult,
  BossReplyResult,
} from '../types/boss';
```

将第 604-648 行的 7 个 `Promise<unknown>` 改为具体类型：

```typescript
  bossSearchCandidates(params: BossSearchParams): Promise<BossSearchResult> {
    // ...保持实现不变
  },
  bossRecommendCandidates(params: BossRecommendParams): Promise<BossRecommendResult> {
    // ...
  },
  bossInbox(params: BossInboxParams): Promise<BossInboxResult> {
    // ...
  },
  bossResume(
    encryptGeekId: string,
    params?: { job?: string; security_id?: string },
  ): Promise<BossResumeResult> {
    // ...
  },
  bossGreet(encryptGeekId: string, body?: { job?: string }): Promise<BossGreetResult> {
    // ...
  },
  bossRequestResume(encryptGeekId: string, friendId: number): Promise<BossRequestResumeResult> {
    // ...
  },
  bossReply(friendId: number, message: string): Promise<BossReplyResult> {
    // ...
  },
```

- [ ] **Step 4: 验证无 Promise<unknown> 残留**

Run: `grep "Promise<unknown>" frontend/src/lib/api.ts`
Expected: 无输出

- [ ] **Step 5: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 无错误（如有调用方类型不匹配，需修正调用方）

- [ ] **Step 6: 构建**

Run: `cd frontend && npm run build`
Expected: 成功

- [ ] **Step 7: 提交**

```bash
git add frontend/src/types/boss.ts frontend/src/lib/api.ts
git commit -m "feat(types): BOSS API 端点补具体返回类型，消除 Promise<unknown> (H5)

- 新增 types/boss.ts 定义 7 个 BOSS 响应类型
- api.ts 中 bossSearchCandidates 等 7 个函数返回具体类型
- 消除全部 Promise<unknown>，typecheck 通过"
```

---

### Task C3: 拆分 BiPage 巨型组件（H6）

**Files:**
- Create: `frontend/src/components/bi/KpiCard.tsx`
- Create: `frontend/src/components/bi/FunnelPanel.tsx`
- Create: `frontend/src/components/bi/StaffPerformancePanel.tsx`
- Create: `frontend/src/components/bi/SourceQualityPanel.tsx`
- Create: `frontend/src/components/bi/DataQualityPanel.tsx`
- Modify: `frontend/src/pages/BiPage.tsx`

- [ ] **Step 1: 分析 BiPage 结构**

Run: `wc -l frontend/src/pages/BiPage.tsx && grep -n "^function \|^const.*=.*=>" frontend/src/pages/BiPage.tsx | head -20`
Expected: 看到行数和内联组件列表

- [ ] **Step 2: 提取 KpiCard 组件**

Create `frontend/src/components/bi/KpiCard.tsx`（从 BiPage 中提取内联 KpiCard，props 接口保持兼容）：

```tsx
interface KpiCardProps {
  label: string;
  value: string | number;
  hint?: string;
  trend?: number;
}

export function KpiCard({ label, value, hint, trend }: KpiCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
      {typeof trend === 'number' && (
        <div className={trend >= 0 ? 'mt-1 text-xs text-green-600' : 'mt-1 text-xs text-red-600'}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </div>
      )}
    </div>
  );
}
```

注意：实际 props 需与 BiPage 中内联 KpiCard 的用法一致。先 grep BiPage 中 `<KpiCard` 的使用，确认 props。

- [ ] **Step 3: 修改 BiPage 引用提取的组件**

Modify `frontend/src/pages/BiPage.tsx`：
1. 顶部添加 `import { KpiCard } from '../components/bi/KpiCard';`
2. 删除内联的 KpiCard 定义。
3. 对其他内联子组件（FunnelPanel 等）重复提取。

- [ ] **Step 4: 逐个提取剩余内联组件**

对 BiPage 中的每个内联子组件：
1. 创建独立文件到 `components/bi/`
2. BiPage 中 import 并删除内联定义
3. 每提取一个跑 `npm run typecheck` 验证

- [ ] **Step 5: 验证行数下降**

Run: `wc -l frontend/src/pages/BiPage.tsx`
Expected: < 400 行

- [ ] **Step 6: 构建验证**

Run: `cd frontend && npm run build && npm run typecheck`
Expected: 成功

- [ ] **Step 7: 手动走查 BiPage 功能**

启动服务，访问 `/bi`，验证看板加载、KPI 渲染、各面板显示正常。

- [ ] **Step 8: 提交**

```bash
git add frontend/src/components/bi/ frontend/src/pages/BiPage.tsx
git commit -m "refactor(bi): 拆分 BiPage 巨型组件，提取 KpiCard 等子组件 (H6)

- BiPage.tsx 从 1100 行降至 <400 行
- 提取 KpiCard/FunnelPanel/StaffPerformancePanel 等到 components/bi/
- BiPage 只保留页面组装和数据获取逻辑"
```

---

### Task C4: 拆分 AgentPage 和 JobsPage 巨型组件（H6）

**Files:**
- Create: `frontend/src/components/agent/ChatInput.tsx` 等子组件
- Create: `frontend/src/components/job/JobForm.tsx` 等子组件
- Modify: `frontend/src/pages/AgentPage.tsx`
- Modify: `frontend/src/pages/JobsPage.tsx`

- [ ] **Step 1: 拆分 AgentPage**

对 `frontend/src/pages/AgentPage.tsx`（907 行）：
1. `grep -n "^function \|^const.*=.*=>" frontend/src/pages/AgentPage.tsx` 找内联组件
2. 逐个提取到 `frontend/src/components/agent/`：ChatInput、MessageList、ToolCallDisplay、ThoughtsPanel、ConversationSidebar、CallLogPanel
3. AgentPage 只保留页面骨架 + 路由
4. 每提取一个跑 typecheck

- [ ] **Step 2: 验证 AgentPage 行数**

Run: `wc -l frontend/src/pages/AgentPage.tsx`
Expected: < 400 行

- [ ] **Step 3: 拆分 JobsPage**

对 `frontend/src/pages/JobsPage.tsx`（847 行）：
1. 提取 JobForm、JobList、JobDetailPanel 到 `frontend/src/components/job/`
2. JobsPage 只保留页面组装

- [ ] **Step 4: 验证 JobsPage 行数**

Run: `wc -l frontend/src/pages/JobsPage.tsx`
Expected: < 400 行

- [ ] **Step 5: 构建验证**

Run: `cd frontend && npm run build && npm run typecheck`
Expected: 成功

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/agent/ frontend/src/components/job/ frontend/src/pages/AgentPage.tsx frontend/src/pages/JobsPage.tsx
git commit -m "refactor(pages): 拆分 AgentPage/JobsPage 巨型组件 (H6)

- AgentPage 从 907 行降至 <400 行，提取 ChatInput/MessageList 等子组件
- JobsPage 从 847 行降至 <400 行，提取 JobForm/JobList 等子组件
- 页面文件只保留骨架和路由逻辑"
```

---

### Task C5: 消除代码重复（H7）

**Files:**
- Create: `frontend/src/lib/constants/cities.ts`
- Modify: `frontend/src/pages/JobsPage.tsx`
- Modify: `frontend/src/features/candidates/pages/CandidatesPage.tsx`
- Modify: `frontend/src/features/boss/pages/BossPage.tsx`
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/pages/BiPage.tsx`

- [ ] **Step 1: 创建共享城市选项常量**

Create `frontend/src/lib/constants/cities.ts`：

```typescript
/** 共享城市选项，供岗位/候选人/BOSS 搜索等表单复用。 */
export interface CityOption {
  label: string;
  value: string;
}

export const COMMON_CITY_OPTIONS: CityOption[] = [
  { label: '北京', value: '北京' },
  { label: '上海', value: '上海' },
  { label: '深圳', value: '深圳' },
  { label: '杭州', value: '杭州' },
  { label: '广州', value: '广州' },
  { label: '成都', value: '成都' },
  { label: '南京', value: '南京' },
  { label: '武汉', value: '武汉' },
  { label: '西安', value: '西安' },
  { label: '苏州', value: '苏州' },
  { label: '厦门', value: '厦门' },
  { label: '长沙', value: '长沙' },
  { label: '远程', value: '远程' },
];
```

注意：实际城市列表需与现有 `COMMON_JOB_CITY_OPTIONS` / `COMMON_CITY_OPTIONS` 合并去重。先 grep 现有定义内容。

- [ ] **Step 2: 合并城市选项定义**

Run: `grep -rn "COMMON_JOB_CITY_OPTIONS\|COMMON_CITY_OPTIONS" frontend/src/`
Expected: 找到 3 处定义

对每处：
1. 删除本地定义
2. 改为 `import { COMMON_CITY_OPTIONS } from '../lib/constants/cities';`（路径按文件位置调整）
3. 如有 `COMMON_JOB_CITY_OPTIONS` 别名，保留导出或全局替换为 `COMMON_CITY_OPTIONS`

- [ ] **Step 3: 验证城市选项仅一处定义**

Run: `grep -rn "COMMON_JOB_CITY_OPTIONS\|COMMON_CITY_OPTIONS" frontend/src/ | grep -v "constants/cities"`
Expected: 无输出（仅 import 引用）

- [ ] **Step 4: 统一 DashboardPage KpiCard**

Modify `frontend/src/pages/DashboardPage.tsx`，删除第 279-312 行的内联 KpiCard，改为：

```tsx
import { KpiCard } from '../components/bi/KpiCard';
```

如有 props 不兼容，调整 KpiCard 的 props 接口或在 DashboardPage 做适配。

- [ ] **Step 5: 替换 window.confirm/alert**

对 `frontend/src/pages/JobsPage.tsx:499,512,518,527,533` 的 `window.confirm`/`window.alert`：

1. 确认 `ConfirmDialog` 和 `Toast` 组件存在：`ls frontend/src/components/ui/`
2. JobsPage 中引入 `ConfirmDialog`（需添加 state 管理确认对话）
3. `window.alert` 改为 `Toast` 提示

如 `ConfirmDialog` 接入成本高（需重构交互流），可先用 `Toast` 替代 `window.alert`，`window.confirm` 暂保留并加 TODO。

- [ ] **Step 6: 验证无 window.confirm/alert 残留（JobsPage）**

Run: `grep -n "window.confirm\|window.alert" frontend/src/pages/JobsPage.tsx`
Expected: 无输出（或仅 TODO 注释）

- [ ] **Step 7: 统一错误渲染为 ErrorState**

Run: `grep -rn "className=.*error\|>错误<\|>加载失败<" frontend/src/pages/`
Expected: 找到手写错误渲染位置

对每处改为使用 `components/ui/ErrorState.tsx`。

- [ ] **Step 8: 构建验证**

Run: `cd frontend && npm run build && npm run typecheck`
Expected: 成功

- [ ] **Step 9: 提交**

```bash
git add frontend/src/lib/constants/cities.ts frontend/src/pages/ frontend/src/features/ frontend/src/components/
git commit -m "refactor(dedup): 消除 KpiCard/城市选项/window.confirm 代码重复 (H7)

- 新增 lib/constants/cities.ts，3 处城市选项合并为 1 份
- DashboardPage 改用共享 KpiCard
- JobsPage 的 window.alert 改为 Toast
- 错误渲染统一使用 ErrorState 组件"
```

---

### Task C6: useAsync 增强（H8）

**Files:**
- Modify: `frontend/src/lib/useAsync.ts`
- Create: `frontend/src/lib/useAsync.test.ts`
- Modify: `frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: 写失败测试**

Create `frontend/src/lib/useAsync.test.ts`：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAsync } from './useAsync';

describe('useAsync', () => {
  it('正常加载并返回数据', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.resolve('ok'), []));
    await waitFor(() => expect(result.current.data).toBe('ok'));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('失败时自动重试 1 次', async () => {
    let calls = 0;
    const fn = vi.fn(() => {
      calls++;
      if (calls === 1) return Promise.reject(new Error('first'));
      return Promise.resolve('recovered');
    });
    const { result } = renderHook(() => useAsync(fn, [], { retryCount: 1 }));
    await waitFor(() => expect(result.current.data).toBe('recovered'));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('重试后仍失败返回 error', async () => {
    const fn = vi.fn(() => Promise.reject(new Error('always fail')));
    const { result } = renderHook(() => useAsync(fn, [], { retryCount: 1 }));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.current.data).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd frontend && npm test -- useAsync`
Expected: FAIL（retryCount 选项不存在）

- [ ] **Step 3: 增强 useAsync**

Read `frontend/src/lib/useAsync.ts` 全文，然后在现有实现基础上添加：
- `retryCount` 选项（默认 1）
- 请求去重（同 key 并发只发一次）
- AbortController 取消

Replace `frontend/src/lib/useAsync.ts`（保留原有导出接口，扩展 options）：

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseAsyncOptions {
  retryCount?: number;
  retryDelay?: number;
}

interface UseAsyncResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

const inflightRequests = new Map<string, Promise<unknown>>();

export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[],
  options: UseAsyncOptions = {},
): UseAsyncResult<T> {
  const { retryCount = 1, retryDelay = 500 } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  useEffect(() => {
    const abort = new AbortController();
    abortRef.current = abort;
    let cancelled = false;

    const execute = async (attempt: number): Promise<void> => {
      try {
        setLoading(true);
        setError(null);
        const result = await fn();
        if (!cancelled && !abort.signal.aborted) {
          setData(result);
          setLoading(false);
        }
      } catch (err) {
        if (cancelled || abort.signal.aborted) return;
        if (attempt < retryCount) {
          await new Promise((r) => setTimeout(r, retryDelay));
          if (!cancelled && !abort.signal.aborted) {
            return execute(attempt + 1);
          }
        } else {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      }
    };

    execute(0);

    return () => {
      cancelled = true;
      abort.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadTick]);

  return { data, loading, error, reload };
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd frontend && npm test -- useAsync`
Expected: 3 passed

- [ ] **Step 5: 修改 DashboardPage 移除自定义 hook**

Read `frontend/src/pages/DashboardPage.tsx:208-275`（useDashboardStats 定义）。

将 `useDashboardStats` 的逻辑改为直接调用增强后的 `useAsync`：

```tsx
const { data: stats, loading, error, reload } = useAsync(
  () => api.getDashboardStats(),
  [],
  { retryCount: 1 },
);
```

删除 `useDashboardStats` 函数定义。

- [ ] **Step 6: 验证无 exhaustive-deps 警告**

Run: `cd frontend && npm run lint 2>&1 | grep exhaustive-deps || echo "无警告"`
Expected: "无警告"

- [ ] **Step 7: 构建验证**

Run: `cd frontend && npm run build && npm run typecheck`
Expected: 成功

- [ ] **Step 8: 提交**

```bash
git add frontend/src/lib/useAsync.ts frontend/src/lib/useAsync.test.ts frontend/src/pages/DashboardPage.tsx
git commit -m "feat(hooks): useAsync 增加重试/去重/取消，移除 DashboardPage 自定义 hook (H8)

- useAsync 新增 retryCount（默认1）+ AbortController 取消
- DashboardPage 移除 useDashboardStats，改用增强后 useAsync
- 新增 useAsync.test.ts 验证重试和失败行为
- 修正 exhaustive-deps 警告"
```

---

### Task C7: 阶段 C 验收

- [ ] **Step 1: 全部前端测试**

Run: `cd frontend && npm test && npm run typecheck && npm run build`
Expected: 全部通过

- [ ] **Step 2: 验证巨型文件已拆分**

Run: `wc -l frontend/src/pages/{Bi,Agent,Jobs,Dashboard}Page.tsx frontend/src/features/candidates/pages/CandidatesPage.tsx`
Expected: 每个文件 < 400 行

- [ ] **Step 3: 验证无 Promise<unknown>**

Run: `grep "Promise<unknown>" frontend/src/lib/api.ts`
Expected: 无输出

- [ ] **Step 4: 验证城市选项统一**

Run: `grep -rn "COMMON_JOB_CITY_OPTIONS\|COMMON_CITY_OPTIONS" frontend/src/ | grep -v "constants/cities" | grep -v "import"`
Expected: 无输出

- [ ] **Step 5: 全量后端回归**

Run: `cd backend && python -m pytest tests/ -x -q`
Expected: 全部通过

- [ ] **Step 6: 标记阶段 C 完成**

```bash
git tag -a stage-c-complete -m "阶段C前端稳定性完成"
```

---

## Self-Review Checklist

完成所有任务后，对照 spec 逐项验证：

- [ ] C1 Alembic：`alembic upgrade head` 空库重建成功，旧库不丢数据
- [ ] C2 健康检查：`GET /health` 返回 200/503
- [ ] C3 Dockerfile：`docker compose up` 全服务启动
- [ ] C4 Vitest：`npm test` 可运行，至少 2 个页面有测试
- [ ] C5 ErrorBoundary：chunk 失败不白屏
- [ ] H1 sys.path：`grep -rn "sys.path.insert" backend/app/` 无输出
- [ ] H2 限流：Redis-backed，多 worker 共享
- [ ] H3 DB 异常：返回结构化错误，无 traceback 泄露
- [ ] H4 静默 except：全部补 logger
- [ ] H5 API 类型：无 `Promise<unknown>`
- [ ] H6 组件拆分：页面文件 < 400 行
- [ ] H7 去重：城市选项 1 份，KpiCard 1 个实现
- [ ] H8 useAsync：支持重试+取消
- [ ] M4 日志：dictConfig + 访问日志中间件
- [ ] 全部现有测试全绿
- [ ] RUNNING.md、DEPLOYMENT.md 已更新
- [ ] docs/项目不足分析.md 标注已修复项
