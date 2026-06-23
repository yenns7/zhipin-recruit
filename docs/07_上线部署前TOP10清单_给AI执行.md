# 07 · 上线部署前 TOP 10 清单（AI 可执行版）

> 版本：2026-06-22 ｜ 状态：待执行
> 读者：执行型 AI（Codex 等）+ 人类负责人（李小明 / 公司 IT）
> 目标：把当前内测基线安全部署到公司服务器，供少数 HR 用**真实数据**小范围试点。
> 关联：本清单是 `docs/06_试点上线检查清单.md`（C1–C12）的 AI 执行视图，逐项给出**判定依据、命令、验收标准、红线**。

## 给 AI 的执行总则（务必先读）

1. **红线不可破**（见 06 清单 §0 / ADR-0001）：架构保持模块化单体；部署形态为 1 个 Flask 后端 + 1 个前端 SPA（Flask 同源托管 `frontend/dist`）；技术栈锁定（Flask 3.1 / SQLAlchemy 2.0 / PyJWT / React18+Vite8+TS / LangGraph+DeepSeek）；不改 API 契约与业务逻辑去迁就部署；只允许 SQLite→PostgreSQL 引擎切换，不做高风险 schema 迁移。
2. **不提交密钥**：任何真实密钥、API Key 只写进服务器 `backend/.env`，绝不进 git。确认 `.env` 在 `.gitignore` 内。
3. **改动可逆优先**：配置类改动先改 `.env`，不改 `config.py` 读取逻辑。涉及代码处只做已被 06 清单认可的安全加固。
4. **每项必须验收**：完成一项后运行该项「验收命令」，把实际输出贴回，再进入下一项。
5. **遇到需要人类判断的项（标 🧑 HUMAN）**：不要自行决定，停下并向负责人报告所需信息。

## 当前实测状态（2026-06-22 核实，作为执行基线）

- `JWT_SECRET` 实测 17 字符 < 生产要求 32 → 不达标
- `FLASK_DEBUG=true` → 开发态，生产安全校验被跳过
- `DATABASE_URL` 仍为 SQLite 且指向本地 Desktop 路径 → 无法搬迁
- `backend/.env` 缺失键：`CORS_ORIGINS`、`SECURITY_HEADERS_ENABLED`、`RATE_LIMIT_ENABLED`、`RATE_LIMIT_LOGIN`、`BACKUP_DIR`、`ALLOW_PUBLIC_REGISTRATION`（代码默认值见下）
- 自检脚本当前结果：13 项检查里 11 项 FAIL，只有 `JWT_EXPIRY_HOURS` 和 `.env gitignore` 通过；这些 FAIL 是服务器侧必填配置，不是已完成项
- 演示数据/运行态文件：`backend/uploads/` 有本地上传文件，`backend/hireinsight.db` 为本地 SQLite 数据库；交接包和 git 不应包含这些运行态文件
- 工作区已从上一轮大量变更收口到当前分支变更；交接前仍需以 `git status --short` 最终确认
- AI 助手团队 BI 权限已加服务端防线：`recruiter` 调用团队 BI 工具返回 `Forbidden`，经理/管理员权限不变

> 关键机制：`backend/app/__init__.py::_enforce_production_security` 仅在「非 TESTING 且 `FLASK_DEBUG=false`」时触发。它会强制 `JWT_SECRET` 非弱值且 `len>=32`、`CORS_ORIGINS` 非空，否则 `raise RuntimeError` 拒绝启动。**因此 FLASK_DEBUG 一旦设 false，下面 1/4 两项不达标会直接启动失败——这是设计好的护栏。**

---

## TOP 10（按优先级，1–5 为硬门槛，缺一不可对真实用户开放）

### 1. 生成强随机 JWT_SECRET〔配置 · 对应 C1〕
- **为什么**：当前 17 字符，弱密钥可被伪造令牌，等于无认证。
- **AI 动作**：
  ```bash
  python3 -c "import secrets; print(secrets.token_urlsafe(48))"
  ```
  将输出写入服务器 `backend/.env`：`JWT_SECRET=<生成串>`，并设 `JWT_EXPIRY_HOURS=8`。
- **验收**：`python3 -c "import os;from dotenv import load_dotenv;load_dotenv('backend/.env');s=os.environ['JWT_SECRET'];print(len(s)>=32 and s not in {'dev-secret-change-in-prod','dev-secret','test-secret','change-me-in-production',''})"` 输出 `True`。
- **红线**：只改 `.env` 取值，不改 `config.py` 读取逻辑（R5）。

### 2. 关闭调试模式〔配置 · 对应 C1〕
- **为什么**：`FLASK_DEBUG=true` 会暴露堆栈、开启交互式调试器（可远程执行代码）。
- **AI 动作**：`backend/.env` 设 `FLASK_DEBUG=false`。
- **验收**：启动后访问不存在路由返回标准 401/404 JSON，不出现 Werkzeug 调试页。
- **依赖**：设 false 会激活生产安全校验，须确保第 1、4 项已达标，否则启动报 RuntimeError（预期行为）。

### 3. 切换 PostgreSQL + 定时备份〔部署 · 对应 C3 · 🧑 HUMAN 协同 IT〕
- **为什么**：SQLite 单文件且指向本地 Desktop，无法搬到服务器、无并发与备份保障。
- **AI 动作**：`backend/.env` 设 `DATABASE_URL=postgresql://<user>:<pass>@<host>:5432/<db>`（连接串由 IT 提供）；配 `BACKUP_DIR=/var/backups/zhipin` 并交付一个每日 `pg_dump` 的 cron/systemd-timer 示例。
- **验收**：`python3 -c "from backend.app import create_app; create_app()"` 正常建表；`/api/jobs` 读写正常；备份目录出现当日 dump。
- **红线**：仅引擎切换，不改 schema 结构（R4）。

### 4. CORS 收紧到公司域名〔配置 · 对应 C2〕
- **为什么**：`CORS_ORIGINS` 当前为空；生产校验要求非空白名单。
- **AI 动作**：`backend/.env` 设 `CORS_ORIGINS=https://<公司前端内网域名>`（多个用逗号分隔）。若用同源托管 dist 方案，也须填该域名以通过校验。
- **验收**：非白名单域名的浏览器跨域请求被拦；同源页面正常。

### 5. 启用 HTTPS（公司证书 + Nginx 反代）〔部署 · 对应 C4 · 🧑 HUMAN 协同 IT〕
- **为什么**：简历含个人隐私，明文 HTTP 传输不合规。
- **AI 动作**：交付 Nginx 反代配置示例（443 → gunicorn 5000，含证书路径占位与安全头）。证书由 IT 提供。
- **验收**：`https://<域名>` 锁标正常；HTTP 自动跳 HTTPS。

### 6. 启用安全响应头与限流〔配置 · 对应 C10〕
- **为什么**：防点击劫持/嗅探、防登录爆破与接口滥用。功能已在代码内置（`config.py` 默认 `SECURITY_HEADERS_ENABLED=true`、`RATE_LIMIT_ENABLED=true`），但生产 `.env` 应显式写明以防误关。
- **AI 动作**：`backend/.env` 显式设：
  ```env
  SECURITY_HEADERS_ENABLED=true
  RATE_LIMIT_ENABLED=true
  RATE_LIMIT_LOGIN=10
  RATE_LIMIT_AGENT_CHAT=20
  RATE_LIMIT_RESUME_UPLOAD=8
  ```
- **验收**：连续登录失败超过阈值返回 429；响应含 `X-Frame-Options` / `X-Content-Type-Options` 等头。

### 7. 确认关闭公开注册〔配置 · 对应 C6/权限〕
- **为什么**：v0.5 改为管理员发号；不能让外部自助注册。代码默认 `ALLOW_PUBLIC_REGISTRATION=false`，但生产应显式写明。
- **AI 动作**：`backend/.env` 设 `ALLOW_PUBLIC_REGISTRATION=false`。
- **验收**：调用注册接口返回禁用提示；仅管理员可建号。

### 8. 清理演示数据 + 建真账号〔数据 · 对应 C6 · 🧑 HUMAN 确认后执行〕
- **为什么**：现库内仍有 demo 账号、样例候选人/岗位/流程和大量测试简历文件，混入真实数据会污染 BI。
- **AI 动作**：使用 `backend/scripts/cleanup_demo_data.py`。默认先跑 dry-run：
  ```bash
  python backend/scripts/cleanup_demo_data.py --dry-run
  ```
  人类负责人确认备份目录、数据库和清理范围后，才允许执行：
  ```bash
  python backend/scripts/cleanup_demo_data.py --confirm
  ```
  脚本幂等，执行删除前会先调用备份逻辑，删除 `@mvp.local` demo 账号及其关联业务数据，清空 `uploads/`、`backend/uploads/` 文件，保留 schema。
- **验收**：`uploads/` 和 `backend/uploads/` 无演示文件；DB 中无 `@mvp.local` demo 账号；候选人、岗位、流程、面试、通知、AI 对话等 demo 业务行已清理；BI 各指标归零或仅反映真实数据。
- **安全**：删除不可逆；没有负责人确认、没有备份结果，不得加 `--confirm`。

### 9. 收尾未提交改动 + 跑通验收门禁〔验收 · 对应 C7〕
- **为什么**：当前工作区有 80+ 个未提交/未跟踪文件，不能带半成品上线。
- **AI 动作**：按部署自检、权限收口、试点体验、文档同步、数据清理脚本等主题分类提交；然后按 05 收口计划 §4 全门禁执行（注意 `.venv312` 为 Mac 编译，Linux 环境需用本机 venv 重建）：
  ```bash
  python backend/scripts/check_pilot_readiness.py
  python -m pytest backend/tests base_agent/tests -q
  cd frontend && npm run lint && npm run typecheck && npm run build
  for f in frontend/tests/*.test.mjs; do node "$f" || exit $?; done
  python3 -m pip_audit -r backend/requirements.txt
  cd frontend && npm audit --audit-level=moderate
  ```
- **验收**：自检脚本不打印密钥且退出码 0；全部命令退出码 0；无未提交业务改动（`git status` 干净）。

### 10. 部署执行 + 上线后观察〔部署/运维 · 对应 C8/C9 · 🧑 HUMAN 协同 IT〕
- **为什么**：固定部署形态与回滚预案。
- **AI 动作**：按 `DEPLOYMENT.md §6` 用 `gunicorn -w 2 -b 0.0.0.0:5000` + systemd 自启；前端 `npm run build` 后由 Flask 同源托管 `frontend/dist`；交付日志位置、每日备份校验、回滚到上一个 tag 的步骤说明。
- **验收**：真人冒烟 10 步全过（登录→建职位→传简历→识别入库→加入管道→推进→面试→反馈→Offer→报表）；服务异常可在 5 分钟内回滚。

---

## 合规提醒（🧑 HUMAN 必须拍板，AI 不得代为决定）

简历经 DeepSeek/LLM 解析会把**真实候选人个人信息外发给第三方 API**。上线前须由公司/法务确认数据外发合规边界（对应 C5）。AI 只负责提示，不对合规做判断。

## 完成定义（DoD）

1–5 全绿 → 允许对真实用户开放；6–7 同批完成；8 在备份后执行；9 门禁全绿且 git 干净；10 冒烟通过且回滚预案就位。任一硬门槛（1–5）未达，禁止放真实用户进入。
