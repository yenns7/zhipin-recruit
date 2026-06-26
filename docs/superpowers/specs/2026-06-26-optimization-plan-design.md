# 智聘系统稳定性优化计划 — 设计文档（Spec）

- **文档状态**：设计中，待用户审阅
- **日期**：2026-06-26
- **分支**：`main`（实现时切 `feat/stability-optimization`）
- **作者**：研发
- **关联文档**：`docs/项目不足分析.md`（39 项不足清单）
- **范围**：Top 5 优先修复（C1-C6 中的 5 项）+ 全部 HIGH（H1-H8），共 13 项
- **交付节奏**：三阶段顺序交付，每阶段独立可验收、独立绿色提交

---

## 1. 背景与目标

### 1.1 背景

`docs/项目不足分析.md` 盘点了 39 项不足。其中 6 项 CRITICAL 阻塞上线，8 项 HIGH 严重影响可维护性。本计划聚焦其中 13 项（C1-C6 + H1-H8），采用渐进式加固策略，不引入新框架，在现有 Flask/React 架构上补齐缺失能力。

### 1.2 目标

1. **基础设施就绪**：服务可容器化启动，schema 可迁移管理，健康可探活，前端不白屏。
2. **后端稳定性**：异常可控、限流有效、依赖清晰、日志可查。
3. **前端稳定性**：有测试保护、类型完整、组件可维护、数据获取有容错。

### 1.3 非目标（本期不做）

- MEDIUM/LOW 项（models 拆分、bi.py 拆分、输入验证框架、i18n、Storybook 等）留后续迭代。
- 不引入 marshmallow / pydantic / SWR 等新框架（Redis 限流用 flask-limiter，属轻量替换）。
- 不改动数据库 schema 结构，Alembic 仅做基线迁移。
- 不改动业务逻辑和 API 契约。

---

## 2. 总体架构

### 2.1 策略：渐进式加固

保留现有 Flask app-factory + SQLAlchemy/SQLite 后端、Vite+React18+TS 前端架构。在现有结构上补齐缺失能力，不重构架构、不替换框架。

**关键约束**：
- 每个阶段产出可验收的工作软件，结尾绿色提交后进入下一阶段。
- 不破坏现有功能：所有改动需通过现有测试 + 新增测试验证。
- Alembic 基线从现有 `db.create_all()` 表结构生成，不改动 schema。

### 2.2 三阶段划分

```
阶段 A（基础设施就绪）─→ 阶段 B（后端稳定性）─→ 阶段 C（前端稳定性）
   3-4 天                   3-4 天                 4-5 天
   C1 C2 C3 C5              H1 H2 H3 H4 +M4        C4 H5 H6 H7 H8
```

每阶段独立分支或独立提交序列，阶段间可回滚。

---

## 3. 阶段 A — 基础设施就绪（CRITICAL 修复）

**对应不足**：C1（无数据库迁移）、C2（无健康检查）、C3（无 Dockerfile）、C5（无 ErrorBoundary）
**预计工作量**：3-4 天

### 3.1 引入 Alembic 数据库迁移（C1）

**现状**：`backend/app/__init__.py:41` 用 `db.create_all()` + 3 个 `_ensure_*_columns()` 手写 `ALTER TABLE`。

**方案**：
1. 安装 `alembic`、`flask-migrate`，加入 `requirements.txt`。
2. 在 `backend/` 初始化 `migrations/` 目录，配置 `alembic.ini` + `env.py`（使用 Flask-Migrate 集成 Flask-SQLAlchemy）。
3. 生成基线 migration：`flask db init` + `flask db migrate -m "baseline"`。基线反映当前 `models.py` 定义的全部表。
4. `create_app()` 中将 `db.create_all()` 替换为 `flask db upgrade`（开发/测试环境自动执行，生产需手动 `flask db upgrade`）。
5. 3 个 `_ensure_*_columns()` 函数标记为 deprecated，保留一代版本用于旧库过渡，下个版本移除。
6. 新增测试：`backend/tests/test_migrations.py` — 验证空库 `alembic upgrade head` 后表结构与 `models.py` 一致。

**验收标准**：
- `alembic upgrade head` 在空 SQLite 库可重建全部表。
- `alembic upgrade head` 在已有数据的旧库可平滑升级（不丢数据）。
- 现有测试全绿。
- `grep -r "db.create_all" backend/app/` 仅在 deprecated 过渡逻辑中存在。

### 3.2 添加健康检查端点（C2）

**方案**：
1. 新建 `backend/app/api/health.py`，注册蓝图 `health.bp`，路由 `GET /health`。
2. 端点逻辑：
   - 探活数据库：`db.session.execute(text("SELECT 1")).scalar()`，捕获异常标记 `db: "down"`。
   - 返回 `{"status": "ok"|"degraded", "db": "up"|"down", "uptime": <秒>}`。
   - db down 时 HTTP 503，否则 200。
3. `__init__.py` 注册 health 蓝图（不需要 `/api` 前缀，直接根路径 `/health`）。

**验收标准**：
- `GET /health` 正常返回 200 + `{"status":"ok","db":"up",...}`。
- 数据库关闭时返回 503 + `{"status":"degraded","db":"down"}`。
- 新增测试 `test_health.py` 覆盖两种情况。

### 3.3 添加 Dockerfile + docker-compose（C3）

**方案**：
1. 项目根目录新建 `Dockerfile`（多阶段构建）：
   - 阶段 1：`node:20-alpine` 构建前端 `npm run build`。
   - 阶段 2：`python:3.11-slim` 安装后端依赖，复制前端 dist，`CMD gunicorn`。
2. 新建 `docker-compose.yml`：
   - `db` 服务：`postgres:16`，持久化 volume。
   - `backend` 服务：构建 Dockerfile，依赖 db，环境变量指向 postgres。
   - `redis` 服务（为阶段 B 限流预留）：`redis:7-alpine`。
3. 新建 `.dockerignore`。
4. 更新 `DEPLOYMENT.md`：补充 docker-compose 启动方式。

**验收标准**：
- `docker compose up --build` 可启动全部服务。
- `curl localhost:<port>/health` 返回 200。
- 前端页面可访问。
- 新增测试 `test_deployment_artifacts.py` 扩展：校验 Dockerfile 和 compose 文件存在且语法可解析。

### 3.4 前端 ErrorBoundary（C5）

**现状**：`App.tsx:198-206` 的 `Suspense` 无 ErrorBoundary 兜底。

**方案**：
1. 新建 `frontend/src/components/ErrorBoundary.tsx`：class 组件，捕获 lazy chunk 加载错误，提供"重试"按钮（重置内部 state 触发重新加载）。
2. `App.tsx` 在 `Suspense` 外层包裹 `ErrorBoundary`。
3. 降级 UI：显示"页面加载失败"+ 重试按钮 + 返回首页链接。

**验收标准**：
- 模拟 chunk 加载失败（删除 dist 中某个 chunk 文件）时，显示降级 UI 而非白屏。
- 点击重试可重新加载。
- 新增测试 `error_boundary.test.tsx`（Vitest，阶段 C 引入后补；阶段 A 先手动验证）。

### 3.5 阶段 A 验收门禁

- [ ] `alembic upgrade head` 空库重建成功
- [ ] 旧库升级不丢数据
- [ ] `GET /health` 返回 200/503 正确
- [ ] `docker compose up` 全服务启动
- [ ] 前端 chunk 失败不白屏
- [ ] 现有 `pytest` 全绿
- [ ] 现有前端 `npm run build` 成功
- [ ] `DEPLOYMENT.md` 已更新
- [ ] 绿色提交

---

## 4. 阶段 B — 后端稳定性（HIGH 后端项）

**对应不足**：H1（sys.path 散布）、H2（内存限流器）、H3（DB commit 无异常）、H4（异常静默）、M4（日志不一致，随 H3/H4 一并解决）
**预计工作量**：3-4 天

### 4.1 限流器改 Redis-backed（H2）

**现状**：`backend/app/middleware/rate_limit.py:8` 用 `defaultdict(deque)` 进程内计数，gunicorn `-w 4` 下限流失效。

**方案**：
1. 引入 `flask-limiter` + `redis` 依赖，加入 `requirements.txt`。
2. 新建 `backend/app/middleware/limiter.py`：初始化 `Limiter` 实例，storage_uri 从 `REDIS_URL` 环境变量读取。
3. 改造 `rate_limit(name)` 装饰器：改为调用 `limiter.limit()`，保留现有 `RATE_LIMITS` 配置映射。
4. 保留内存 fallback：Redis 不可用时降级为内存限流（开发环境），并记录 warning。
5. `create_app()` 中初始化 limiter 并 init_app。

**验收标准**：
- `gunicorn -w 4` 下 4 个 worker 共享限流计数，阈值准确。
- 新增测试 `test_rate_limit_redis.py`：mock Redis，验证多 worker 场景限流生效。
- Redis 不可用时降级为内存限流，不阻断服务。

### 4.2 全局 SQLAlchemy 错误处理 + 静默异常修复（H3 + H4）

**方案**：

**A. 全局错误处理器（H3）**：
1. `create_app()` 中注册 `@app.errorhandler(SQLAlchemyError)`：
   - 记录 `logger.error`（含 traceback）。
   - 回滚 `db.session.rollback()`。
   - 返回结构化 `{"error": "数据库错误", "code": "DB_ERROR"}` + 500。
   - 生产环境不泄露 traceback，开发环境可附带。
2. 注册 `@app.errorhandler(Exception)` 兜底：记录日志，返回 500 + 通用错误。

**B. 静默异常修复（H4，17 处）**：
1. 全局 grep `except Exception:` + 无 `logger` 的位置。
2. 逐个补充 `logger.warning` 或 `logger.error`，记录异常类型和上下文。
3. 保留原有返回值（不改变业务行为），仅补充日志。
4. 关键位置清单：
   - `api/auth.py:23` — 密码校验失败
   - `api/jobs.py:57` — LLM 提取失败
   - `services/interview_service.py:57,67,77` — LLM 解析失败
   - `services/boss_service.py:217,573` — subprocess/解密错误
   - 其余 grep 结果逐个处理

**验收标准**：
- 触发 DB 约束冲突时返回结构化错误，无 traceback 泄露。
- 静默异常路径触发时有日志记录（可 grep 到）。
- 新增测试 `test_error_handling.py`：验证 SQLAlchemyError 返回结构化响应 + rollback。
- 现有测试全绿（行为不变，仅补日志）。

### 4.3 base_agent 配置为可编辑包（H1）

**现状**：6 个文件重复 `sys.path.insert(0, str(BASE_AGENT_DIR))`。

**方案**：
1. 在 `base_agent/` 添加 `setup.py` 或 `pyproject.toml`，定义包名 `hireinsight-base-agent`。
2. `backend/requirements.txt` 改为 `-e ../base_agent`（可编辑安装）。
3. 移除 6 个文件中的 `sys.path.insert` 代码：
   - `app/config.py:6-8`
   - `app/api/jobs.py:11-13`
   - `app/services/agent_service.py:24-26`
   - `app/services/interview_service.py:4-6`
   - `app/services/match_service.py:4-6`
   - `app/services/resume_service.py:5-7`
4. 确认 import 路径不变（base_agent 内部模块名保持）。
5. 更新 `RUNNING.md`：安装步骤增加 `pip install -e ./base_agent`。

**验收标准**：
- `grep -r "sys.path.insert" backend/app/` 无结果。
- `pip install -e ./base_agent` 后后端正常启动。
- 现有测试全绿。
- `RUNNING.md` 已更新。

### 4.4 统一日志配置（M4，随 H3/H4 一并解决）

**方案**：
1. 新建 `backend/app/logging_config.py`：定义 `dictConfig`，包含：
   - Root logger：INFO 级别，输出到 stdout。
   - `hireinsight` logger：DEBUG 级别（开发）/ INFO（生产）。
   - 格式：`[%(asctime)s] %(levelname)s %(name)s %(message)s`。
   - 生产环境不输出 debug。
2. `create_app()` 开头调用 `setup_logging(app.config)`。
3. 所有 API 和 service 文件顶部添加 `logger = logging.getLogger(__name__)`（替换无日志的文件）。
4. 添加 HTTP 请求日志中间件：`before_request` 记录方法+路径+IP，`after_request` 记录状态码+耗时。

**验收标准**：
- 所有模块通过 `logging.getLogger(__name__)` 输出日志。
- HTTP 请求有统一访问日志。
- 新增测试 `test_logging.py`：验证请求日志中间件输出格式。

### 4.5 阶段 B 验收门禁

- [ ] `grep -r "sys.path.insert" backend/app/` 无结果
- [ ] gunicorn -w 4 下限流阈值准确
- [ ] DB 异常返回结构化错误，无 traceback 泄露
- [ ] 静默 except 路径有日志
- [ ] HTTP 请求有访问日志
- [ ] 现有 `pytest` 全绿
- [ ] `RUNNING.md` 已更新
- [ ] 绿色提交

---

## 5. 阶段 C — 前端稳定性（HIGH 前端项）

**对应不足**：C4（无真正测试）、H5（API 无类型）、H6（巨型组件）、H7（代码重复）、H8（useAsync 缺能力）
**预计工作量**：4-5 天

### 5.1 引入 Vitest + Testing Library（C4）

**现状**：`frontend/tests/` 50 个 `.mjs` 文件全是 `fs.readFileSync` + 正则，无组件渲染测试。

**方案**：
1. 安装依赖：`vitest`、`@testing-library/react`、`@testing-library/jest-dom`、`jsdom`、`@vitest/coverage-v8`。
2. 配置 `vitest.config.ts`：环境 jsdom，setup 文件引入 `@testing-library/jest-dom`。
3. `package.json` 添加 `"test": "vitest"`、`"test:run": "vitest run"`、`"test:coverage": "vitest run --coverage"`。
4. 迁移现有 `tests/*.mjs` 中的有效断言为真正组件测试（保留有价值的字符串检查作为辅助）。
5. 优先覆盖 5 个核心页面的关键路径：
   - `LoginPage` — 登录表单提交、错误提示
   - `JobsPage` — 岗位列表、创建
   - `PipelinePage` — 候选人流转
   - `BiPage` — 看板加载、KPI 渲染
   - `AgentPage` — 对话发送
6. 新增 `frontend/src/test/` 目录放测试工具（render wrapper、mock providers）。

**验收标准**：
- `npm test` 可运行，全部通过。
- 至少 5 个核心页面有渲染测试。
- 覆盖率报告可生成（不设硬性阈值，建立基线）。
- 现有 `.mjs` 测试保留可运行（或迁移完毕后删除）。

### 5.2 API BOSS 端点补类型（H5）

**现状**：`frontend/src/lib/api.ts:604-648` 7 个 BOSS 端点返回 `Promise<unknown>`。

**方案**：
1. 在 `frontend/src/types/index.ts` 或新建 `types/boss.ts` 定义响应类型：
   - `BossSearchResult`（搜索候选人列表）
   - `BossRecommendResult`（推荐候选人列表）
   - `BossInboxResult`（收件箱列表）
   - `BossResumeResult`（简历详情）
   - `BossGreetResult`（打招呼结果）
   - `BossRequestResumeResult`（请求简历结果）
   - `BossReplyResult`（回复结果）
2. 类型定义参考后端 `backend/app/api/boss.py` 实际返回结构。
3. `api.ts` 中 7 个函数返回类型从 `Promise<unknown>` 改为具体类型。
4. 调用方如有 `as` 强转，移除。

**验收标准**：
- `grep "Promise<unknown>" frontend/src/lib/api.ts` 无结果。
- `npm run typecheck` 通过。
- 调用方无 `as any` 或 `as unknown` 强转。

### 5.3 拆分巨型页面组件（H6）

**现状**：BiPage 1100 行、AgentPage 907 行、JobsPage 847 行、CandidatesPage 793 行、DashboardPage 695 行。

**方案**：
按页面逐个拆分，每个文件目标 < 400 行：

**BiPage.tsx（1100 行 → 多文件）**：
- 提取 `components/bi/KpiCard.tsx`
- 提取 `components/bi/FunnelChart.tsx`、`StaffPerformancePanel.tsx`、`SourceQualityPanel.tsx`、`DemandHealthPanel.tsx`、`InterviewAccountabilityPanel.tsx`、`ManagerAlertsPanel.tsx`、`DataQualityPanel.tsx`
- BiPage.tsx 只保留页面组装 + 数据获取

**AgentPage.tsx（907 行 → 多文件）**：
- 提取 `components/agent/ChatInput.tsx`、`MessageList.tsx`、`ToolCallDisplay.tsx`、`ThoughtsPanel.tsx`、`ConversationSidebar.tsx`、`CallLogPanel.tsx`
- AgentPage.tsx 只保留页面骨架 + 路由

**JobsPage.tsx（847 行 → 多文件）**：
- 提取 `components/job/JobForm.tsx`、`JobList.tsx`、`JobDetailPanel.tsx`、`JobMetadataExtractor.tsx`

**CandidatesPage.tsx / DashboardPage.tsx**：类似拆分，优先提取内联子组件。

**约束**：
- 拆分不改业务逻辑，仅移动代码 + 调整 import。
- 每拆完一个页面跑一次 `npm run build` + `npm run typecheck`。
- 优先用现有 `features/` 和 `components/` 目录结构。

**验收标准**：
- 拆分后每个页面文件 < 400 行（`wc -l` 验证）。
- `npm run build` + `npm run typecheck` 通过。
- 前端功能不变（手动走查 5 个页面核心路径）。
- 新增 Vitest 测试覆盖拆分出的关键组件。

### 5.4 消除代码重复（H7）

**方案**：

**A. KpiCard 统一**：
- 保留 `components/bi/KpiCard.tsx`（5.3 拆分时创建）作为唯一实现。
- `DashboardPage.tsx:279-312` 的内联 KpiCard 改为引用 `components/bi/KpiCard.tsx`。
- 如 props 不兼容，统一 props 接口（向后兼容）。

**B. 城市选项统一**：
- 新建 `frontend/src/lib/constants/cities.ts`，导出 `COMMON_CITY_OPTIONS`。
- `JobsPage.tsx`、`CandidatesPage.tsx`、`BossPage.tsx` 三处删除各自定义，改为 import。

**C. 错误渲染统一**：
- 所有手写错误 div 改为使用 `components/ui/ErrorState.tsx`。
- grep `<div.*error` 或 `错误` 定位手写位置，逐个替换。

**D. window.confirm 替换**：
- `JobsPage.tsx:499,512,518,527,533` 的 `window.confirm`/`window.alert` 改为 `ConfirmDialog` + `Toast` 组件。

**验收标准**：
- `grep "COMMON_JOB_CITY_OPTIONS\|COMMON_CITY_OPTIONS" frontend/src/` 仅 `constants/cities.ts` 一处定义。
- `grep "window.confirm\|window.alert" frontend/src/` 无结果。
- KpiCard 只有一个实现。
- `npm run build` 通过，功能不变。

### 5.5 useAsync 增强（H8）

**现状**：`frontend/src/lib/useAsync.ts` 无缓存、无重试、无去重。`DashboardPage.tsx:208-275` 另起炉灶。

**方案**：
1. 增强 `useAsync`：
   - 添加 `retryCount` 选项（默认 1）：失败自动重试。
   - 添加请求去重：同一 key 的并发请求只发一次。
   - 添加 `cancelOnUnmount`：组件卸载时取消进行中请求（AbortController）。
2. 移除 `eslint-disable react-hooks/exhaustive-deps`，修正依赖数组。
3. `DashboardPage.tsx` 的 `useDashboardStats` 改为使用增强后的 `useAsync`。
4. 不引入 SWR（保持轻量，避免新依赖）。

**验收标准**：
- `useAsync` 支持重试 + 去重 + 取消。
- `DashboardPage` 不再有独立数据获取 hook。
- 新增测试 `useAsync.test.ts`：验证重试、去重、取消行为。
- `npm run lint` 无 `exhaustive-deps` 警告。

### 5.6 阶段 C 验收门禁

- [ ] `npm test` 可运行且通过
- [ ] 5 个核心页面有渲染测试
- [ ] `grep "Promise<unknown>" frontend/src/lib/api.ts` 无结果
- [ ] `npm run typecheck` 通过
- [ ] 拆分后每个页面文件 < 400 行
- [ ] 城市选项、KpiCard、错误渲染、window.confirm 统一
- [ ] `useAsync` 支持重试+去重+取消
- [ ] `npm run build` 成功
- [ ] 绿色提交

---

## 6. 文件结构

### 6.1 新增文件

**阶段 A**：
- `backend/migrations/` — Alembic 目录（env.py、versions/）
- `backend/alembic.ini`
- `backend/app/api/health.py` — 健康检查蓝图
- `backend/tests/test_migrations.py`
- `backend/tests/test_health.py`
- `Dockerfile`（项目根）
- `docker-compose.yml`（项目根）
- `.dockerignore`（项目根）
- `frontend/src/components/ErrorBoundary.tsx`

**阶段 B**：
- `backend/app/middleware/limiter.py` — Redis 限流初始化
- `backend/app/logging_config.py` — dictConfig 配置
- `backend/tests/test_rate_limit_redis.py`
- `backend/tests/test_error_handling.py`
- `backend/tests/test_logging.py`
- `base_agent/setup.py`（或 pyproject.toml）

**阶段 C**：
- `frontend/vitest.config.ts`
- `frontend/src/test/utils.tsx` — 测试 render wrapper
- `frontend/src/lib/constants/cities.ts`
- `frontend/src/types/boss.ts`（或合并到 types/index.ts）
- `frontend/src/components/bi/KpiCard.tsx` 及各拆分子组件
- `frontend/src/components/agent/*` 拆分子组件
- `frontend/src/components/job/*` 拆分子组件
- 各组件对应测试文件

### 6.2 修改文件

**阶段 A**：
- `backend/app/__init__.py` — 替换 create_all 为 db upgrade、注册 health 蓝图
- `backend/requirements.txt` — 加 alembic、flask-migrate
- `DEPLOYMENT.md` — 补充 docker-compose 部署
- `frontend/src/App.tsx` — 包裹 ErrorBoundary

**阶段 B**：
- `backend/app/middleware/rate_limit.py` — 改用 flask-limiter
- `backend/app/__init__.py` — 注册错误处理器、初始化 limiter、配置日志
- `backend/app/config.py` — 移除 sys.path.insert、加 REDIS_URL
- `backend/app/api/jobs.py` — 移除 sys.path.insert
- `backend/app/services/{agent,interview,match,resume}_service.py` — 移除 sys.path.insert
- `backend/app/api/{auth,jobs}.py`、`backend/app/services/{interview,boss}_service.py` 等 — 补日志
- `backend/requirements.txt` — 加 flask-limiter、redis
- `RUNNING.md` — 补充 pip install -e ./base_agent

**阶段 C**：
- `frontend/package.json` — 加 vitest 等依赖、test 脚本
- `frontend/src/lib/api.ts` — 7 个 BOSS 端点补类型
- `frontend/src/pages/{Bi,Agent,Jobs,Dashboard}Page.tsx` — 拆分
- `frontend/src/features/candidates/pages/CandidatesPage.tsx` — 拆分
- `frontend/src/lib/useAsync.ts` — 增强
- `frontend/src/pages/DashboardPage.tsx` — 移除 useDashboardStats

---

## 7. 测试策略

### 7.1 后端测试

- **阶段 A**：`test_migrations.py`（空库重建、旧库升级）、`test_health.py`（200/503）、扩展 `test_deployment_artifacts.py`（Dockerfile 校验）。
- **阶段 B**：`test_rate_limit_redis.py`（多 worker 限流）、`test_error_handling.py`（SQLAlchemyError 结构化响应）、`test_logging.py`（请求日志）。
- **回归**：每阶段跑全量 `pytest`，现有 42 个测试文件必须全绿。

### 7.2 前端测试

- **阶段 C**：Vitest + @testing-library/react。
- 核心页面渲染测试（5 个）：验证关键元素渲染、交互、错误状态。
- useAsync 单元测试：重试、去重、取消。
- ErrorBoundary 测试：模拟 chunk 失败。
- 覆盖率基线建立，不设硬性阈值。

### 7.3 手动验收

每阶段结尾，按 AGENTS.md 的"用户视角验收规则"走查：
- 阶段 A：docker compose up → 访问首页 → 登录 → 触发健康检查 → 模拟 chunk 失败。
- 阶段 B：触发 DB 异常 → 看结构化错误 → 看日志 → 多 worker 限流验证。
- 阶段 C：5 个核心页面走查 → 拆分后功能不变 → 测试通过。

---

## 8. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| Alembic 基线与旧库不一致 | 中 | 高 | 旧库先备份；`_ensure_*` 保留一代过渡；测试覆盖旧库升级 |
| Redis 限流引入新依赖故障 | 低 | 中 | 内存 fallback；Redis 不可用时降级不阻断 |
| 前端组件拆分引入 bug | 中 | 中 | 逐页面拆分，每拆完跑 build+typecheck+手动走查 |
| base_agent 打包后 import 路径变 | 低 | 中 | 保持包内模块名不变；先验证 import 再移除 sys.path |
| Vitest 与现有 .mjs 测试冲突 | 低 | 低 | .mjs 保留可运行，新测试用 .test.tsx 隔离 |

---

## 9. 文档同步

根据 AGENTS.md 文档同步规则，本计划涉及以下文档更新：

| 文档 | 更新内容 | 阶段 |
|------|----------|------|
| `RUNNING.md` | pip install -e ./base_agent、docker compose 启动方式 | B |
| `DEPLOYMENT.md` | Dockerfile、docker-compose 部署流程 | A |
| `README.md` | 如涉及快速启动方式变化 | A/B |
| `docs/项目不足分析.md` | 标注已修复项 | 每阶段结尾 |

`AGENTS.md` 不修改（本次变更非项目执行规范变化）。

---

## 10. 成功标准

本计划完成后，以下条件全部满足：

1. **可容器化部署**：`docker compose up` 一键启动，`/health` 探活通过。
2. **schema 可迁移**：Alembic 管理全部 schema 变更，`db.create_all()` deprecated。
3. **后端异常可控**：DB 异常返回结构化错误，无 traceback 泄露，静默 except 有日志。
4. **限流有效**：多 worker 下限流阈值准确。
5. **依赖清晰**：无 sys.path.insert，base_agent 为可编辑包。
6. **前端有测试保护**：Vitest 可运行，5 个核心页面有渲染测试。
7. **前端类型完整**：无 `Promise<unknown>`，typecheck 通过。
8. **前端组件可维护**：页面文件 < 400 行，无代码重复。
9. **前端不白屏**：ErrorBoundary 兜底 chunk 加载失败。
10. **全部现有测试全绿**，新增测试全绿。

---

*本设计文档待用户审阅批准后，将调用 writing-plans skill 生成详细实施计划。*
