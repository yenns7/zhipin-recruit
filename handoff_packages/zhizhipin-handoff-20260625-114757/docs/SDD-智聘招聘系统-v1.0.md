# 智聘招聘系统 As-built SDD v1.0

> As-built SDD = 根据当前已实现系统反推的系统设计文档。
> 本文用于后续迭代开发、模块定位、影响范围评估和交接，不等同于最初立项时的需求文档。

## 1. 文档基准

| 项目 | 内容 |
|---|---|
| 系统名称 | 智聘 · 招聘管理系统 |
| 文档类型 | As-built System Design Document |
| 代码基准 | 以当前工作区代码和实际测试结果为准；本文初版生成时曾参考 `6a26afe`，后续迭代不再依赖固定旧提交号 |
| 本地项目路径 | `/Users/yenns/Desktop/智聘` |
| 主要用途 | 后续按模块指定改动时，用来快速判断要改哪些文件、影响哪些接口/表/流程 |
| 文档生成日期 | 2026-06-19 |

### 1.1 本地兼容补丁说明

当前本地代码除云端 `main` 外，还保留了几处运行兼容补丁：

| 文件 | 目的 |
|---|---|
| `backend/app/api/auth.py` | 兼容旧演示数据库中的 SHA256 密码；公开注册默认关闭，试点账号由 admin 分配 |
| `base_agent/llm_client.py` | 支持 `keychain:<service>` 形式读取 macOS 钥匙串中的 API Key |
| `base_agent/resume_parser.py` | 简历解析器也支持钥匙串 API Key，避免上传简历时把 `keychain:` 字符串当作真实 key |
| `backend/tests/test_auth_passwords.py` | 覆盖 bcrypt 与旧 SHA256 密码兼容 |
| `base_agent/tests/test_llm_client_secrets.py` | 覆盖钥匙串密钥解析和简历解析器密钥路径 |
| `backend/migrate_stages.py` | 将历史一面/二面/终面主流程阶段归并为当前 MVP 的 `interview` |

这些补丁是为了让本地演示环境稳定运行。若后续要推到云端，应作为单独 PR 合入，并同步更新 `.env.example` / 部署文档。

## 2. 系统目标

智聘是一个面向招聘团队的内部招聘管理系统，核心目标是把“简历进入、岗位管理、候选人匹配、流程推进、AI 面试、BI 看板”串成一条可操作的招聘闭环。

### 2.1 核心能力

| 能力 | 当前状态 | 说明 |
|---|---|---|
| 登录与角色权限 | 已实现 | JWT + RBAC，角色包括 admin / manager / recruiter / interviewer |
| 候选人库 | 已实现 | 列表、详情、候选人判断卡片、辅助雷达、折叠全量技能标签、候选人归属、受控 CSV 导出 |
| 简历上传解析 | 已实现 | PDF / DOCX / ZIP 批量上传，旧版 DOC 因宏风险跳过，AI 解析入库 |
| 岗位管理 | 已实现 | 创建、编辑、关闭岗位，JD AI 结构化与澄清追问 |
| 智能匹配 | 已实现 | 岗位找候选人，生成匹配分、命中标签、缺失标签 |
| 候选人流程 | 已实现 | pending → ai_screen → business_review → interview → offer → onboarded/rejected |
| AI 面试 | 已实现 | 生成题目、提交回答、AI 评分、报告落库、预筛后回写流程 |
| 面试官反馈 | 已实现 | 按轮次写反馈，支持固定原因分类，进入候选人 journey |
| BI 看板 | 已实现 | 团队漏斗、专员效能、岗位漏斗 |
| AI 助手 | 已实现 | LangGraph ReAct 工具调用，支持读工具与用户确认后的写工具 |
| 用户管理 | 已实现 | admin 管理用户角色、启停、创建账号与重置密码 |

### 2.2 明确不做或尚未工程化的能力

| 项目 | 当前状态 |
|---|---|
| 多组织隔离 | 已实现核心 `org_id` 隔离；一期不提供前端组织管理后台 |
| 试点审计 | 已实现试点版 | 关键查看、导出、写操作、AI 写操作和越权 403 记录到 `events`；管理员页对越权和高频导出告警标红 |
| 异步任务队列 | 配置了 Celery eager，但当前上传/AI 多为同步处理 |
| 搜索索引 | 未实现，主要通过数据库查询 |
| 大规模批量导入队列 | 未实现，当前批量上传在请求中同步解析 |
| 文件对象存储 | 未实现，简历原文件保存在本地上传目录 |

术语说明：本文中的“多组织隔离”指核心业务数据通过 `org_id` 做服务端过滤和越权拦截。“不做 SaaS 式多租户”指一期不做前端组织管理后台、租户自助开通、跨组织运营管理、计费/套餐等能力；不应理解为当前没有组织级数据隔离。

## 3. 总体架构

```mermaid
flowchart LR
  Browser["浏览器 / React SPA"] --> Flask["Flask API + 静态托管 :5000"]
  Flask --> SQLite["SQLite hireinsight.db"]
  Flask --> Uploads["本地 uploads/ 简历文件"]
  Flask --> Services["Backend Services"]
  Services --> BaseAgent["base_agent AI 能力"]
  BaseAgent --> DeepSeek["DeepSeek / OpenAI兼容接口"]

  subgraph Frontend["frontend/"]
    Pages["pages"]
    Components["components"]
    ApiClient["lib/api.ts"]
  end

  subgraph Backend["backend/"]
    APIs["app/api/*.py"]
    Models["app/models.py"]
    BizServices["app/services/*.py"]
  end

  Browser --> Frontend
  Frontend --> ApiClient
  ApiClient --> APIs
  APIs --> BizServices
  APIs --> Models
  BizServices --> BaseAgent
```

### 3.1 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React, TypeScript, Vite, Tailwind CSS, lucide-react, GSAP |
| 后端 | Flask, Flask-SQLAlchemy, Flask-CORS, PyJWT, bcrypt |
| 数据库 | SQLite 开发/演示；文档预留 PostgreSQL 生产替换 |
| AI | `base_agent/llm_client.py`，OpenAI 兼容 Chat Completions，当前配置 DeepSeek |
| 智能体 | LangGraph ReAct 循环，SSE 流式输出 |
| 部署 | Flask 单端口托管 `frontend/dist`；也支持 gunicorn |

### 3.2 单端口部署模式

后端 `backend/app/__init__.py` 注册了 API 蓝图，同时把 `frontend/dist` 作为 SPA 静态文件托管：

| 路径 | 处理方式 |
|---|---|
| `/api/*` | Flask 蓝图 API |
| `/assets/*` | 返回前端构建产物 |
| `/login`、`/candidates` 等前端路由 | 回退 `frontend/dist/index.html` |

这意味着本地生产式运行只需要：

```bash
cd frontend
npm run build

cd ../backend
python run.py
```

或使用 gunicorn：

```bash
cd backend
gunicorn -w 2 -b 0.0.0.0:5000 --timeout 120 --keep-alive 5 "run:app"
```

## 4. 目录结构与职责

| 路径 | 责任 |
|---|---|
| `frontend/src/App.tsx` | 前端路由与角色级页面守卫 |
| `frontend/src/lib/api.ts` | 所有前端 API 调用、JWT 注入、401 处理 |
| `frontend/src/lib/auth.tsx` | 登录态、token、角色信息 |
| `frontend/src/lib/nav.ts` | 侧边导航与角色可见性 |
| `frontend/src/pages/*` | 页面级功能 |
| `frontend/src/components/*` | 通用 UI、业务组件、看板组件 |
| `backend/run.py` | 后端启动入口 |
| `backend/app/__init__.py` | Flask app、蓝图注册、前端静态托管 |
| `backend/app/config.py` | 环境变量、数据库、上传目录、JWT、Celery 配置 |
| `backend/app/models.py` | 数据模型定义 |
| `backend/app/api/*.py` | REST API 层 |
| `backend/app/services/*.py` | 业务服务层，封装匹配、简历、面试、AI 助手等 |
| `backend/app/middleware/auth.py` | JWT 校验与 RBAC 装饰器 |
| `backend/app/middleware/events.py` | 写操作事件埋点 |
| `base_agent/llm_client.py` | LLM 请求、模型路由、密钥读取 |
| `base_agent/resume_parser.py` | 简历解析与技能标签抽取 |
| `base_agent/job_matcher.py` | 岗位-候选人匹配算法 |
| `backend/seed_dev.py` | 演示数据重置脚本 |
| `frontend/dist/` | 前端生产构建产物，由 Flask 托管 |

## 5. 角色与权限模型

中文角色名以 `docs/README.md` 的“角色名口径”为准。代码和权限判断只认 `admin`、`manager`、`recruiter`、`interviewer` 四类技术角色；旧称或业务别名里的“招聘主管 / HRD / 招聘负责人 / 用人部门负责人”在权限上统一按 `manager` 理解，“HR 专员”按 `recruiter` 理解，“系统管理员”按 `admin` 理解。

| 角色 | 可见模块 | 主要权限 |
|---|---|---|
| `admin` | 工作台、AI 助手、候选人、上传、岗位、流程、BI、系统设置 | 当前组织内用户管理、BI、候选人、岗位、流程、AI 助手；面试任务通过工作台待办或候选人流程深链进入 |
| `manager` | 工作台、AI 助手、候选人、上传、岗位、流程、BI | 当前组织内团队视角管理、候选人转派、BI 查看；面试任务通过工作台待办或候选人流程深链进入 |
| `recruiter` | 工作台、AI 助手、候选人、上传、岗位、流程 | 仅负责自己的候选人和岗位；不能查看或操作别人负责的岗位；面试任务通过工作台待办或候选人流程深链进入 |
| `interviewer` | 工作台、我的面试、候选人详情 | 只处理分配给自己的面试安排与反馈；不浏览全量简历库、不推进候选人流程、不使用 AI 助手 |

### 5.1 前端路由守卫

前端入口：`frontend/src/App.tsx`

| 路由 | 页面 | 角色 |
|---|---|---|
| `/login` | `LoginPage` | 未登录 |
| `/` | `DashboardPage` | 全部登录角色 |
| `/agent` | `AgentPage` | recruiter / manager / admin |
| `/candidates` | `CandidatesPage` | recruiter / manager / admin |
| `/candidates/:id` | `CandidateProfilePage` | recruiter / manager / admin / interviewer |
| `/upload` | `UploadPage` | recruiter / manager / admin |
| `/jobs` | `JobsPage` | recruiter / manager / admin |
| `/jobs/:id/match` | `JobMatchPage` | recruiter / manager / admin |
| `/pipeline` | `PipelinePage` | recruiter / manager / admin |
| `/interviews` | `InterviewListPage` | recruiter / interviewer / manager / admin |
| `/interviews/new` | `InterviewsPage` | recruiter / manager / admin |
| `/interviews/:id` | `InterviewReportPage` | recruiter / manager / admin / interviewer |
| `/bi` | `BiPage` | manager / admin |
| `/admin/users` | `UsersPage` | admin |

### 5.2 后端权限

后端使用 `require_auth` 解 JWT，再从数据库读取用户，把 `user_id`、`role` 与 `org_id` 写入 Flask `g`。部分接口通过 `require_role(...)` 限制角色。

需要注意：

- 前端隐藏菜单不是安全边界，后端 RBAC 才是安全边界。
- `recruiter` 在岗位、候选人、流程、面试、BI、AI 写工具上都受负责人限制；不能通过修改 `job_id`、`candidate_id` 访问别人数据。
- `manager`、`admin` 只能看当前组织内数据；一期不提供跨组织管理后台。
- 关闭岗位只允许查看历史和恢复在招，后端拒绝上传候选人、推进流程、发 Offer、安排/提交面试、AI 预筛写回和 AI 助手改状态。
- `admin` 不能停用或降级自己的账号。

## 6. 数据模型

源文件：`backend/app/models.py`

| 表 | 模型 | 关键字段 | 用途 |
|---|---|---|---|
| `users` | `User` | `org_id`, `name`, `email`, `role`, `password_hash`, `is_active`, `token_version` | 用户、角色、启停；`org_id` 是多组织隔离边界；改密/重置密码递增 `token_version` 让旧 token 失效 |
| `candidates` | `Candidate` | `org_id`, `owner_hr_id`, `name_masked`, `resume_json`, `raw_file_path`, `deleted_at`, `deleted_by`, `anonymized_at` | 候选人主档与简历结构化结果；支持软删除与匿名化 |
| `upload_batches` | `UploadBatch` | `org_id`, `owner_hr_id`, `source_channel`, `target_job_id`, `note` | 批量上传元数据；误导入撤回按批次定位候选人 |
| `candidate_tags` | `CandidateTag` | `org_id`, `candidate_id`, `tag`, `score` | 简历技能标签及评分 |
| `jobs` | `Job` | `org_id`, `title`, `jd_text`, `jd_structured`, `owner_hr_id`, `status` | 岗位主档与结构化 JD |
| `matches` | `Match` | `org_id`, `job_id`, `candidate_id`, `score`, `reason` | 持久化的岗位匹配结果 |
| `interviews` | `Interview` | `org_id`, `candidate_id`, `job_id`, `qa_json`, `ai_report`, `score`, `pass_recommended` | AI 面试记录与评分 |
| `pipeline_stages` | `PipelineStage` | `org_id`, `candidate_id`, `job_id`, `stage`, `updated_by`, `note`, `ts` | 招聘流程流水，append-only |
| `events` | `Event` | `org_id`, `actor_id`, `actor_role`, `action`, `entity_id`, `entity_type`, `payload`, `request_id`, `ip`, `user_agent`, `result`, `failure_reason`, `source`, `severity` | 写操作事件与试点审计基础；`source` 区分页面、AI、安全拦截 |
| `audit_logs` | `AuditLog` | `org_id`, `actor_id`, `target_table`, `target_id`, `action` | 预留审计表，当前使用较少 |
| `interview_feedback` | `InterviewFeedback` | `org_id`, `candidate_id`, `job_id`, `round`, `interviewer_id`, `score`, `passed`, `reason_tags`, `note` | 面试官反馈与原因分类 |
| `idempotency_records` | `IdempotencyRecord` | `scope_key`, `idempotency_key`, `actor_scope`, `method`, `path`, `body_hash`, `status_code`, `response_json` | 普通 JSON/表单写接口的 `Idempotency-Key` 重试保护 |

### 6.1 招聘阶段枚举

当前合法阶段：

```text
pending
ai_screen
business_review
interview
offer
onboarded
rejected
```

主流程顺序定义在 `backend/app/api/pipeline.py` 和 `frontend/src/lib/pipelineStages.ts`。新增阶段时必须两边同步。

历史兼容：`interview_first` / `interview_second` / `interview_final` 仍可被后端读取并归并展示为 `interview`，但新写入的候选人主流程不应再生成这些旧阶段。面试第几轮通过 `interview_feedback.round`、面试安排和面试记录表达，不再作为流程主阶段。

### 6.2 PipelineStage 的重要设计

`pipeline_stages` 是 append-only 流水表，不是“当前状态表”。候选人每推进一次就新增一行。查询当前阶段时必须取每个 `(candidate_id, job_id)` 的最新一行。

影响点：

| 改动 | 风险 |
|---|---|
| 直接按 `stage` group by | 会把历史阶段重复计入漏斗 |
| 删除历史阶段 | 会破坏 candidate journey 与 BI |
| 新增阶段 | 必须同步 `VALID_STAGES`、`STAGE_ORDER`、前端阶段配置、测试 |

## 7. 核心 API 清单

所有接口都挂在 `/api` 下。

写接口重试约定：

- 普通 JSON/表单写接口可带 `Idempotency-Key`。同一用户、同一路径、同一请求体、同一个 key 的重试会返回第一次 2xx JSON 结果，并带 `X-Idempotent-Replay: true`。
- 同一个 key 如果换了请求体，返回 409，避免“重试”变成另一次业务操作。
- multipart 简历上传不走通用请求体缓存，避免大文件内存压力；它使用文件指纹、来源信息和目标岗位做 10 分钟内业务级去重。
- 流程推进、面试排期、面试反馈有额外自然幂等逻辑，防止用户连点或接口重试产生重复业务记录。

### 7.1 Auth

| 方法 | 路径 | 权限 | 作用 |
|---|---|---|---|
| `POST` | `/auth/register` | 无 | 公开注册入口，默认关闭；试点账号由 admin 创建 |
| `POST` | `/auth/login` | 无 | 登录，返回 JWT、角色、姓名 |
| `GET` | `/auth/me` | 登录 | 获取当前用户 |
| `POST` | `/auth/change-password` | 登录 | 修改当前用户密码 |

### 7.2 Resume / Candidate

| 方法 | 路径 | 权限 | 作用 |
|---|---|---|---|
| `POST` | `/resume/upload` | recruiter/manager/admin | 批量上传 PDF / DOCX / ZIP 简历，AI 解析入库；旧版 `.doc` 跳过；旧调用若带 `target_job_id`，后端会校验岗位负责人、组织和在招状态；同一用户 10 分钟内重复上传同一批文件和来源信息时复用首次结果 |
| `POST` | `/resume/batches/<batch_id>/rollback` | 批次上传人/manager/admin | 撤回误导入批次，候选人软删除、匿名化、删除原文件并写审计 |
| `GET` | `/resume/<candidate_id>` | 登录 + 候选人可见权限 | 候选人简历详情与技能标签，返回 `owner_hr_id` 供负责人展示与转派 |
| `GET` | `/candidates` | 登录 | 候选人列表，recruiter 只看当前组织内自己负责的；`search` 会覆盖姓名、邮箱、电话、技能标签和简历解析 JSON 中的公司、岗位、学校等文本；软删除候选人不返回 |
| `GET` | `/candidates/owner-options` | manager/admin | 获取启用中的招聘专员下拉选项 |
| `GET` | `/candidates/<id>/pipelines` | 登录 | 候选人参与的招聘需求流程 |
| `GET` | `/candidates/<id>/journey?job_id=` | 登录 | 候选人某招聘需求流程下的完整时间线、AI 面试、面试官反馈；当前以岗位画像 `job_id` 定位 |
| `PATCH` | `/candidates/<id>/owner` | manager/admin | 转派候选人负责人，`reason` 必填并写入事件流水 |
| `GET` | `/candidates/<id>/export` | owner/manager/admin | 导出单个候选人 CSV，并写入 `candidate.exported` 审计事件；同一账号 10 分钟内第 6 次起标记 `severity=warning` |
| `DELETE` | `/candidates/<id>` | owner/manager/admin | 候选人软删除与匿名化，`reason` 必填；清空 PII、简历 JSON、原文件路径并删除原简历文件 |

### 7.3 Jobs / Match

| 方法 | 路径 | 权限 | 作用 |
|---|---|---|---|
| `POST` | `/jobs/clarify` | recruiter/manager/admin | AI 根据 JD 生成澄清追问，不落库 |
| `POST` | `/jobs` | recruiter/manager/admin | 创建岗位，AI 结构化 JD；岗位写入当前 `org_id` 且负责人为当前用户 |
| `GET` | `/jobs?status=active\|closed\|all` | 登录 | 岗位列表，默认 active；recruiter 仅看自己负责或历史未分配岗位 |
| `GET` | `/jobs/<job_id>` | 登录 | 岗位详情；跨组织返回不存在，非负责人 recruiter 返回 403 |
| `PUT` | `/jobs/<job_id>` | owner/manager/admin | 编辑岗位，JD 变化时重新结构化 |
| `POST` | `/jobs/<job_id>/close` | owner/manager/admin | 关闭岗位 |
| `POST` | `/jobs/<job_id>/restore` | owner/manager/admin | 将已关闭岗位恢复为在招 |
| `GET` | `/jobs/<job_id>/match-preview?candidate_ids=` | owner/manager/admin | 简历库和岗位匹配页的只读匹配预览，不写入 `matches` |
| `POST` | `/jobs/<job_id>/match` | owner/manager/admin | 运行岗位候选人匹配并持久化；关闭岗位拒绝 |
| `POST` | `/match` | owner/manager/admin | 兼容旧入口，按 `job_id` 运行匹配；关闭岗位拒绝 |

### 7.4 Recruitment Demands

| 方法 | 路径 | 权限 | 作用 |
|---|---|---|---|
| `GET` | `/demands` | recruiter/manager/admin | 查询当前账号可管理的用人需求 |
| `POST` | `/demands` | recruiter/manager/admin | 创建用人需求；可传 `job_id` 复用已有岗位画像，也可传 `job_title` + `jd_text` 自动创建岗位画像 |
| `PATCH` | `/demands/<demand_id>` | owner/manager/admin | 更新需求字段，包含优先级调整 |
| `POST` | `/demands/<demand_id>/close` | owner/manager/admin | 关闭、完成或暂停需求；完成/取消会同步关闭岗位 |
| `POST` | `/demands/<demand_id>/restore` | owner/manager/admin | 恢复误关闭/误暂停的需求，并同步恢复岗位画像为在招 |
| `POST` | `/demands/<demand_id>/downgrade` | owner/manager/admin | 兼容旧降级入口，记录降级原因 |

### 7.5 Pipeline

| 方法 | 路径 | 权限 | 作用 |
|---|---|---|---|
| `POST` | `/pipeline/move` | recruiter/manager/admin；interviewer 禁止 | 推进候选人到某阶段，写流水与事件；重复推进到同一阶段和备注时返回已有结果，不追加重复流水 |
| `POST` | `/pipeline/transfer` | recruiter/manager/admin；interviewer 禁止 | 将候选人从当前招聘需求转入另一个招聘需求；必须填写原因，原需求追加 `rejected` 转出历史，目标需求追加 `pending` 当前记录，并写 `pipeline.transferred` 事件 |
| `GET` | `/pipeline/<job_id>` | 登录 | 某招聘需求流程当前阶段人数；当前以岗位画像 `job_id` 定位 |
| `GET` | `/pipeline/<job_id>/board` | 登录 | 某招聘需求流程看板候选人卡片数据；当前以岗位画像 `job_id` 定位 |
| `GET` | `/pipeline/<job_id>/history/<candidate_id>` | 登录 | 候选人某招聘需求流程历史；当前以岗位画像 `job_id` 定位 |

### 7.6 Interview

| 方法 | 路径 | 权限 | 作用 |
|---|---|---|---|
| `POST` | `/interview/start` | recruiter/manager/admin + 岗位管理权限 | 生成 AI 面试题；面试官禁止；关闭岗位拒绝 |
| `POST` | `/interview/submit` | recruiter/manager/admin + 岗位管理权限 | 提交回答，AI 评分，报告落库，并可能回写流程；关闭岗位拒绝 |
| `GET` | `/interview/<interview_id>` | 登录 | AI 面试报告详情 |
| `POST` | `/interview/feedback` | 登录且有候选人/面试权限 | 面试官提交反馈，可带 `reason_tags` 原因分类；`score` 必须是 1-5；关闭岗位拒绝；同一面试官重复提交同一候选人/岗位/轮次时返回已有反馈 |
| `GET` | `/interview/feedback` | 登录 | 查询反馈，返回原因分类 |
| `GET` | `/interviews` | 登录 | 面试记录列表，按角色过滤 |
| `GET` | `/interview/interviewers` | 登录 | 返回启用中的面试官/经理/管理员选项 |
| `POST` | `/interview/assignments` | recruiter/manager/admin + 岗位管理权限 | 创建面试安排；同一安排重复请求返回已有记录；同一面试官同一时间已有其他安排时返回 409 |

### 7.7 BI / Admin / Agent

| 方法 | 路径 | 权限 | 作用 |
|---|---|---|---|
| `GET` | `/bi/overview` | manager/admin | 团队漏斗、专员效能、面试反馈跟进、部门协同情况 |
| `GET` | `/bi/staff/<hr_id>` | 登录，recruiter 仅自己 | 单专员漏斗 + `performance` 个人绩效行 |
| `GET` | `/bi/job/<job_id>` | manager/admin 或岗位负责人 recruiter | 单岗位漏斗；非岗位负责人 recruiter 和 interviewer 禁止 |
| `GET` | `/admin/users` | admin | 用户列表 |
| `POST` | `/admin/users` | admin | 创建试点账号 |
| `PATCH` | `/admin/users/<user_id>` | admin | 修改角色、启停 |
| `POST` | `/admin/users/<user_id>/reset-password` | admin | 重置用户密码 |
| `GET` | `/agent/tools` | recruiter/manager/admin | AI 助手工具清单 |
| `GET` | `/agent/conversations` | recruiter/manager/admin | 当前用户 AI 对话列表 |
| `GET` | `/agent/conversations/<conversation_id>` | recruiter/manager/admin，且仅本人会话 | AI 对话详情 |
| `POST` | `/agent/chat` | recruiter/manager/admin | SSE 流式 AI 对话 |
| `POST` | `/agent/execute` | recruiter/manager/admin + 工具 RBAC | 执行 AI 助手提议的写操作 |

## 8. 核心业务流程

### 8.1 登录流程

```mermaid
sequenceDiagram
  participant U as User
  participant FE as React LoginPage
  participant API as /api/auth/login
  participant DB as users

  U->>FE: 输入邮箱和密码
  FE->>API: POST email/password
  API->>DB: 查找用户
  API->>API: 校验 bcrypt 或旧 SHA256
  API->>FE: 返回 JWT + role + name
  FE->>FE: localStorage 保存 token
  FE->>U: 跳转工作台
```

后续所有 API 请求由 `frontend/src/lib/api.ts` 注入 `Authorization: Bearer <token>`。

### 8.2 简历批量导入流程

入口：

- 前端：`frontend/src/pages/UploadPage.tsx`
- API client：`frontend/src/lib/api.ts` 的 `uploadResumes(files)`
- 后端：`backend/app/api/resume.py`
- 服务：`backend/app/services/resume_service.py`
- AI：`base_agent/resume_parser.py`

前端上传页只暴露一条主路径：

- 上传成功后先写候选人和标签，统一沉淀到简历库；后续由用户在简历库选择目标岗位查看适配候选人，再加入招聘需求流程。

候选人来源、内推人/猎头联系人和本次上传备注是选填信息，默认收起。后端仍兼容 `source_link` 字段，但当前前端不展示该输入项。

```mermaid
flowchart TD
  A["HR 选择多个 PDF/DOCX 或 ZIP"] --> B["POST /api/resume/upload files[]"]
  B --> C{"文件类型"}
  C -->|"pdf/docx"| D["保存到 uploads/"]
  C -->|"doc"| X["跳过: 旧版 DOC 宏风险"]
  C -->|"zip"| E["安全解压: 数量/大小/路径限制"]
  E --> D
  D --> F["ResumeBatchService.parse_and_save"]
  F --> G["ResumeParser 调 LLM 解析结构化信息"]
  G --> H["写 candidates"]
  G --> I["写 candidate_tags"]
  H --> J["写 resume.uploaded event"]
  I --> K["返回每个文件 ok/skipped/error"]
```

安全限制：

| 项目 | 限制 |
|---|---|
| 支持格式 | `.pdf`, `.docx`, `.zip`；`.doc` 返回跳过原因，不进入解析 |
| ZIP 文件条目 | 最多 100 条 |
| ZIP 内单文件 | 20MB |
| ZIP 解压总大小 | 200MB |
| Flask 单请求大小 | 100MB |

风险边界：

- 该流程会调用 LLM，会写入候选人库和标签表。
- 当前前端不会发送 `target_job_id`；后端 legacy 兼容逻辑仍会校验岗位权限，避免旧调用绕过权限。
- 当前是同步解析，大批量简历可能导致请求等待较久。
- 个别文件失败不影响同批其他文件。
- 同一账号短时间重复上传同一批文件会按文件指纹复用第一次结果。
- 误导入可调用 `POST /api/resume/batches/<batch_id>/rollback` 按批次撤回，候选人软删除、匿名化、原文件删除，审计写 `resume.upload_batch.rolled_back`。

### 8.3 岗位创建与 JD 结构化

入口：

- 前端：`frontend/src/pages/JobsPage.tsx`
- 后端：`backend/app/api/jobs.py`
- AI：`base_agent/llm_client.py`

流程：

1. 用户输入岗位名称与 JD。
2. 可先调用 `/jobs/clarify` 生成澄清追问，不落库。
3. 创建岗位时，后端将 JD 与澄清补充合并。
4. LLM 输出结构化 JD，写入 `jobs.jd_structured`。
5. 岗位默认 `status=active`。

影响面：

- `jd_structured.skill_tags_raw` 直接影响后续匹配。
- 修改 JD 会重新结构化。
- 关闭岗位只改 `status=closed`，不物理删除；招聘岗位页可切换查看已关闭岗位，并通过 `/jobs/<id>/restore` 恢复在招。
- 关闭岗位画像进入冻结态：上传、匹配写入、加入需求流程、推进、Offer、面试安排、面试反馈、AI 预筛写回、AI 助手改状态都会被后端拒绝。
- 用人需求恢复会把 `recruitment_demands.status` 改回 `active`，清空关闭原因，并同步把岗位画像 `jobs.status` 改回 `active`。
- 招聘需求是业务主线，岗位/JD 是需求下的匹配画像。`POST /demands` 没有传 `job_id` 时，后端会用 `job_title`、`jd_text`、`requester_department` 自动创建 `jobs` 记录，再创建 `recruitment_demands`。
- 用人需求、简历上传、候选人流程、面试安排等入口在没有可选岗位画像时引导用户先新建招聘需求或岗位画像，避免下拉框为空时卡住。

### 8.4 岗位候选人匹配

入口：

- 前端：`frontend/src/pages/JobsPage.tsx`、`frontend/src/pages/JobMatchPage.tsx`
- 后端：`backend/app/services/match_service.py`
- 算法：`base_agent/job_matcher.py`

流程：

1. 从 `jobs.jd_structured.skill_tags_raw` 解析岗位技能要求。
2. 从 `candidate_tags` 读取候选人技能。
3. 计算匹配分、命中标签、缺失标签。
4. 结果按分数降序。
5. 招聘需求卡片和岗位画像列表都可作为匹配入口；需求卡片是业务主入口，岗位列表保留给复用画像和维护 JD。
6. 岗位匹配页提供“AI 推荐 / 全部候选人”视角。AI 推荐使用 `/jobs/<id>/match` 的持久化排序；全部候选人使用 `/candidates?search=` 在当前账号权限范围内搜索，再调用 `/jobs/<id>/match-preview?candidate_ids=` 展示当前搜索结果与岗位的命中标签、缺失标签和匹配分。
7. 页面筛选支持匹配度、入需求流程状态、匹配技能和缺失技能；批量加入只作用于当前筛选后已勾选且尚未进入该需求流程的候选人。
8. 简历库筛选区使用“目标岗位 / 加入招聘需求”触发岗位适配预览，调用 `/jobs/<id>/match-preview`，只返回当前页候选人的命中标签、缺失标签和匹配分，不写入 `matches`；“入需求流程状态”只区分候选人是否已进入需求流程。
9. `/jobs/<id>/match` 会清理该岗位旧 match 记录并写入新的 top N。

风险边界：

- 修改标签结构会影响匹配。
- 修改 `job_matcher.py` 会影响岗位匹配页面和 AI 助手工具。
- 只读匹配和持久化匹配要区分：AI 助手读工具使用只读模式。

### 8.5 候选人流程推进

入口：

- 前端：`frontend/src/pages/PipelinePage.tsx`
- 看板组件：`frontend/src/components/pipeline/*`
- 后端：`backend/app/api/pipeline.py`

流程：

1. 用户选择当前招聘需求；当前技术实现以岗位画像 `job_id` 定位。
2. 拉取 `/pipeline/<job_id>/board`。
3. 看板按最新阶段渲染候选人。
4. 用户移动阶段，调用 `/pipeline/move`。
5. 后端向 `pipeline_stages` append 新流水，并写 `pipeline.moved` 事件。
6. 如果目标为 `onboarded`，额外写 `candidate.onboarded` 事件。
7. 如果候选人更适合其他招聘需求，右侧详情调用 `/pipeline/transfer`，原需求追加 `rejected` 转出记录，目标需求追加 `pending` 记录，页面切换到目标需求继续推进。

重要约束：

- `rejected` 是终态，但当前代码没有强限制不允许再次移动。
- 主流程阶段为 `pending → ai_screen → business_review → interview → offer → onboarded/rejected`。
- 历史一面/二面/终面阶段只做兼容读取，新写入统一使用 `interview`。
- 阶段移动由 HR/经理/管理员完成；面试官账号即使被分配了面试，也不能调用 `/pipeline/move` 直接推进 Offer 或淘汰。
- 前端反馈表通过 `canMovePipeline` 控制按钮显示，后端 `/pipeline/move` 和 `/pipeline/transfer` 也会兜底拦截面试官账号、非岗位负责人、跨组织数据和关闭目标需求。
- 误推进或误淘汰用前端“修正阶段”处理，本质仍调用 `/pipeline/move` 追加一条新流水，备注以 `阶段修正：` 开头；候选人详情时间线显示“阶段修正”，当前阶段和 BI 当前存量按最新流水计算，历史记录不删除。
- 需求转入用前端“转入其他招聘需求”处理，必须选择目标需求并填写原因；当前实现不改候选人负责人，只改变该候选人在两个需求流程里的最新阶段流水。

### 8.6 AI 面试与流程回写

入口：

- 前端：`frontend/src/pages/InterviewsPage.tsx`
- 后端：`backend/app/api/interview.py`
- 服务：`backend/app/services/interview_service.py`

流程：

1. `/interview/start` 根据岗位 JD 生成题目。
2. 用户提交问答对到 `/interview/submit`。
3. LLM 对每个回答评分。
4. 生成平均分与 `pass_recommended`。
5. 写入 `interviews`。
6. 若通过且候选人尚未到面试中或更后阶段，流程推进到 `interview`。
7. 若不通过，流程推进到 `rejected`。

关键规则：

- AI 通过时不会把已经在面试中或更后阶段的候选人回退。
- AI 未通过会写 `rejected`。
- 这是会自动写主流程状态的 AI 行为，风险高于只读建议型 AI。
- AI 助手写工具与普通接口使用同一权限边界：招聘专员只能写自己负责岗位，关闭岗位拒绝写入；每次确认执行都会写 `events.action=agent.write`，记录工具名、目标 ID、成功/失败和错误原因，并将 `source` 标记为 `ai`。

### 8.7 面试官反馈

入口：

- 前端：`frontend/src/components/interview/FeedbackForm.tsx`
- 后端：`backend/app/api/interview.py`

面试官反馈写入 `interview_feedback`，候选人详情 journey 会聚合展示流程时间线、AI 面试记录和面试官反馈。面试官在“我的面试”中只提交反馈；候选人是否进入 Offer 或淘汰，由 HR/经理/管理员在候选人流程中处理。

面试安排由 HR/经理/管理员创建。后端会兜底校验：目标岗位必须存在且 `status=active`，当前用户必须有岗位管理权限，面试官账号必须存在于当前组织、已启用，且角色为面试官/经理/管理员。这样即使前端下拉数据过期，也不会把新面试分配给已关闭岗位、别人的岗位或停用账号。

`reason_tags` 用于 MVP 试点阶段的责任归因，前端提供固定原因分类，例如专业能力不匹配、项目经验不足、薪资期望不匹配、候选人已接受其他机会、面试时间无法协调、岗位要求变化、部门内部意见不一致、面试标准变化、HC 暂缓或冻结、岗位暂停招聘、需要加面确认等。后端只保存白名单内原因，启动兼容迁移会把历史同义标签归并到标准标签，避免自由文本和旧口径污染后续 BI。

### 8.8 BI 看板

入口：

- 前端：`frontend/src/pages/BiPage.tsx`
- 后端：`backend/app/api/bi.py`

BI 主要从两类数据计算：

| 来源 | 用途 |
|---|---|
| `pipeline_stages` 最新阶段 | 漏斗各阶段人数 |
| `candidates.owner_hr_id` + `pipeline_stages` | 招聘专员有效推荐、推荐成功面试、Offer、入职等个人绩效 |
| `interview_assignments` | 面试安排、面试官、轮次、待补反馈 |
| `interview_feedback` | 面试通过/拒绝、评分、面试官反馈 |
| `jobs.department` | 用人部门协同归属 |

注意：BI 使用最新阶段去重，不能直接统计所有历史流水。
所有 BI 查询都先按 `org_id` 隔离；招聘专员只能访问自己负责的岗位和候选人，不再支持通过“协作候选人”查看别人岗位漏斗。
面试轮次只作为面试事实明细参与 BI 责任归因，不重新拆回候选人主流程。
招聘专员工作台的“我的本月业绩”和“今日待办”复用 `/bi/staff/<hr_id>` 的 `performance` 字段；主管 BI 的专员列表也使用同一套公开绩效字段。
前端 BI 页面首屏优先展示业务数字，标题区右侧只保留周期筛选，不再提供“怎么看数据”入口。指标口径与协同归属说明沉淀在 BI 设计文档：HR 负责候选人推进，面试官负责反馈闭环，用人部门负责岗位协同，推进人只看操作留痕。候选人负责人转派后，后续绩效归新负责人；历史推进人和面试反馈人不重写。阶段修正只影响最新阶段和当前存量，不删除历史流水。

### 8.9 AI 助手

入口：

- 前端：`frontend/src/pages/AgentPage.tsx`
- 后端 API：`backend/app/api/agent.py`
- 服务：`backend/app/services/agent_service.py`

AI 助手分两类工具：

| 类型 | 示例 | 是否直接写库 |
|---|---|---|
| 只读工具 | list_candidates, get_candidate, list_jobs, match_candidates_for_job, get_pipeline, get_bi_overview, count_summary, web_search | 否 |
| 写工具 | create_job, move_pipeline, start_interview, run_match | 是，但需要 `/agent/execute` 与 RBAC |

设计原则：

- 对话用 SSE 流式返回。
- 后端入口同前端角色一致，仅 recruiter/manager/admin 可访问；interviewer 直接请求 `/api/agent/*` 返回 403。
- AI 可提议写操作，但写操作应由用户确认后调用 `/agent/execute`。
- 写工具内部做 RBAC 校验。

## 9. AI 模块边界

### 9.1 依赖 LLM 的功能

| 功能 | 入口 | 写库 | 风险等级 |
|---|---|---:|---|
| 简历解析 | `/resume/upload` | 是 | 高 |
| JD 结构化 | `/jobs`, `/jobs/<id>` 更新 | 是 | 中 |
| JD 澄清追问 | `/jobs/clarify` | 否 | 低 |
| AI 面试题生成 | `/interview/start` | 只写 event | 中 |
| AI 面试评分 | `/interview/submit` | 是，且可能改流程 | 高 |
| AI 助手问答 | `/agent/chat` | 否 | 中 |
| AI 助手写工具 | `/agent/execute` | 是 | 高 |

AI 助手的只读工具也必须走服务端权限边界，不能只依赖前端入口隐藏。当前团队 BI 工具只允许 `manager` / `admin` 使用；`recruiter` 调用会返回 `Forbidden`，避免通过自然语言绕过 BI 页面权限。候选人、流程、匹配等工具继续按候选人负责人或面试官指派范围收敛。

### 9.2 密钥与模型配置

配置入口：

- `backend/.env`
- `base_agent/llm_client.py`
- `base_agent/llm_config.json`

当前本地目标配置：

```env
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-v4-flash
LLM_THINKING=disabled
OPENAI_API_KEY=keychain:zhipin-deepseek-api-key
DEEPSEEK_API_KEY=keychain:zhipin-deepseek-api-key
API_KEY=keychain:zhipin-deepseek-api-key
LLM_API_KEY=keychain:zhipin-deepseek-api-key
AI_RECRUITMENT_COMPLIANCE_ACK=true
CANDIDATE_PRIVACY_NOTICE_URL=https://zhipin.内网域名/privacy
AI_HUMAN_REVIEW_REQUIRED=true
```

原则：

- 不把真实 API Key 写入仓库。
- 生产模式必须显式配置 AI 合规确认、候选人隐私告知地址和人工复核要求，否则 Flask 拒绝启动。
- `keychain:` 是本地兼容扩展，合入云端前应更新文档。
- DeepSeek v4 flash 默认给 `max_tokens=8192`，避免推理模型空输出。

### 9.3 新增 AI 行为的安全分级

| 类型 | 建议实现方式 |
|---|---|
| 只读分析 | 新增独立接口或 AI 助手只读工具，不写库 |
| 生成建议 | 返回给前端展示，用户确认后再保存 |
| 写入主数据 | 新增测试，明确影响表，保留回滚路径 |
| 改流程状态 | 必须写业务规则测试，避免自动回退或误淘汰 |
| 改简历解析结构 | 同步候选人详情、匹配、BI、历史数据兼容 |
| 读取团队级数据 | 必须复用或等价实现页面 API 的角色权限，避免 AI 助手越权 |

## 10. 后续改动定位表

### 10.1 只改前端风格

通常只动：

| 需求 | 文件 |
|---|---|
| 全局颜色、字体、间距 | `frontend/src/index.css`, Tailwind 配置 |
| 页面布局 | `frontend/src/pages/*.tsx` |
| 通用按钮/卡片/表单 | `frontend/src/components/ui/*` |
| 侧边导航 | `frontend/src/components/AppShell.tsx`, `frontend/src/lib/nav.ts` |
| 构建产物 | `frontend/dist/*`，由 `npm run build` 生成 |

不应触碰：

- `backend/app/*`
- `base_agent/*`
- `backend/hireinsight.db`
- `backend/.env`

### 10.2 常见功能改动索引

| 想改的地方 | 前端入口 | 后端入口 | 数据/AI 影响 |
|---|---|---|---|
| 登录页视觉 | `frontend/src/pages/LoginPage.tsx` | 无 | 无 |
| 导航菜单 | `frontend/src/lib/nav.ts`, `AppShell.tsx` | 可能无 | 若新路由需同步权限 |
| 候选人列表 | `CandidatesPage.tsx` | `api/candidates.py` | `candidates`, `candidate_tags` |
| 候选人详情 | `CandidateProfilePage.tsx` | `api/resume.py`, `api/candidates.py` | `resume_json`, tags, journey |
| 简历批量上传 | `UploadPage.tsx` | `api/resume.py`, `services/resume_service.py` | 会调用 `resume_parser.py` 并写候选人；招聘需求流程加入放在简历库完成 |
| 简历解析字段 | `CandidateProfilePage.tsx` | `services/resume_service.py` | 高风险，影响 `resume_json` 兼容 |
| 岗位列表/编辑 | `JobsPage.tsx` | `api/jobs.py` | `jobs.jd_structured` |
| JD AI 澄清 | `JobsPage.tsx` | `api/jobs.py` | LLM，只读或写结构化 |
| 岗位匹配 | `JobsPage.tsx`, `JobMatchPage.tsx` | `services/match_service.py` | `candidate_tags`, `matches`, `job_matcher.py` |
| 候选人流程 | `PipelinePage.tsx`, `components/pipeline/*` | `api/pipeline.py` | `pipeline_stages`, `events` |
| 新增招聘阶段 | `frontend/src/lib/pipelineStages.ts` | `models.py`, `api/pipeline.py` | 高风险，需测试 |
| AI 面试 | `InterviewsPage.tsx`, `InterviewReportPage.tsx` | `api/interview.py`, `services/interview_service.py` | LLM + `interviews` + 流程回写 |
| 面试官反馈 | `FeedbackForm.tsx` | `api/interview.py` | `interview_feedback.reason_tags` |
| BI 看板 | `BiPage.tsx`, `components/bi/*` | `api/bi.py` | `events`, `pipeline_stages` |
| AI 助手 | `AgentPage.tsx`, `lib/agent.ts` | `api/agent.py`, `services/agent_service.py` | 取决于工具，写工具风险高 |
| 用户管理 | `pages/admin/UsersPage.tsx` | `api/admin.py` | `users` |

## 11. 变更影响矩阵

| 改动类型 | 风险 | 是否可能牵动后端 | 是否可能牵动数据库 | 必须验证 |
|---|---:|---:|---:|---|
| 颜色/字体/间距 | 低 | 否 | 否 | 前端 build + 页面检查 |
| 页面排版 | 低-中 | 否 | 否 | 前端 build + 角色页面检查 |
| 多显示已有字段 | 中 | 可能 | 否 | 对应 API 返回字段 |
| 新增筛选/排序 | 中 | 可能 | 否 | API 查询 + 列表页面 |
| 新增保存字段 | 中-高 | 是 | 是 | 迁移/seed/API/页面 |
| 新增招聘阶段 | 高 | 是 | 可能 | pipeline 全链路测试 |
| 修改简历解析结构 | 高 | 是 | 可能 | 上传、候选人详情、匹配 |
| 修改匹配算法 | 高 | 是 | 否 | 匹配单测 + 岗位匹配页 |
| 新增只读 AI 建议 | 中 | 是 | 否 | LLM fallback + 前端展示 |
| AI 自动写库/改流程 | 高 | 是 | 是/间接 | 业务规则测试 + 回滚策略 |

## 12. 数据基线与当前偏差

### 12.1 文档/seed/本地库现状

| 来源 | 观察 |
|---|---|
| `RUNNING.md` | 描述 seed 后应有 29 用户、20 候选人、14 岗位 |
| 当前 `backend/seed_dev.py` 静态定义 | 6 用户、10 候选人、4 岗位 |
| 当前本地 `backend/hireinsight.db` 快照 | 30 用户、21 候选人、14 岗位，13 active + 1 closed |

这说明当前演示数据存在历史恢复与本地使用痕迹。后续若要让“新克隆仓库直接可用”，需要明确选择一种方案：

1. 提交标准演示数据库文件。
2. 或修正 `seed_dev.py`，让它真的生成目标数据。
3. 或在部署脚本里从固定 artifact 恢复数据库。

不要在未确认的情况下随意运行 `seed_dev.py`，因为它会清空并重建 seeded tables。

### 12.2 当前本地数据库快照

生成本文时，本地库统计为：

| 项 | 数量 |
|---|---:|
| users | 30 |
| candidates | 21 |
| jobs | 14 |
| pipeline_stages | 40 |
| interviews | 4 |
| interview_feedback | 0 |
| events | 53 |
| matches | 59 |

这些数字只是当前本地环境快照，不应被视为产品设计约束。

## 13. 非功能需求

| 类别 | 当前实现 | 后续建议 |
|---|---|---|
| 性能 | 中小规模内部工具可用；AI 请求同步等待 | 上传/AI 改为异步任务，前端轮询或 SSE |
| 可用性 | 单进程/单机运行 | 生产使用 gunicorn + supervisor/systemd |
| 数据可靠性 | SQLite 本地文件 | 生产换 PostgreSQL，增加备份 |
| 安全 | JWT + RBAC + 密钥隐藏；弱 demo 密码 | 生产更换 JWT_SECRET、禁用弱密码、加 HTTPS |
| 可观测性 | access log + 带 request_id / 来源 / 结果的 events 表 | 增加错误监控、慢请求监控 |
| 扩展性 | 模块清晰，但部分业务同步耦合 | AI 与批处理拆异步队列 |
| 合规 | 简历包含个人信息；已支持软删除、候选人导出留痕、详情查看留痕和越权告警 | 增加导出审批、水印、字段级权限和更完整留存策略 |

## 14. 关键架构决策 ADR 摘要

### ADR-001: 使用 Flask 单端口托管 API 与前端 SPA

| 项 | 内容 |
|---|---|
| 状态 | Accepted |
| 决策 | Flask 同时提供 `/api/*` 和 `frontend/dist` 静态文件 |
| 好处 | 部署简单、本地演示稳定、避免 CORS 与多端口切换 |
| 代价 | 静态资源托管和 API 共进程，生产伸缩粒度较粗 |

### ADR-002: 使用 SQLite 作为开发/演示数据库

| 项 | 内容 |
|---|---|
| 状态 | Accepted for dev/demo |
| 决策 | 默认 `backend/hireinsight.db`，生产可改 `DATABASE_URL` |
| 好处 | 启动简单、无需外部数据库 |
| 代价 | 并发、备份、迁移、远程部署能力有限 |

### ADR-003: 复用 base_agent 承载 AI 能力

| 项 | 内容 |
|---|---|
| 状态 | Accepted |
| 决策 | 后端服务通过 `sys.path` 引入 `base_agent` 中的 LLM、简历解析、匹配算法 |
| 好处 | 复用已有算法与提示词，开发快 |
| 代价 | 包边界不够干净，测试和部署时需保证路径一致 |

### ADR-004: Pipeline 使用 append-only 流水表

| 项 | 内容 |
|---|---|
| 状态 | Accepted |
| 决策 | 每次阶段变化新增 `pipeline_stages` 一行 |
| 好处 | 能保留完整 journey，支持审计与 BI |
| 代价 | 当前状态查询必须取最新行，统计容易踩坑 |

### ADR-005: AI 写操作必须经过显式执行接口

| 项 | 内容 |
|---|---|
| 状态 | Accepted |
| 决策 | AI 助手只提议写操作，前端确认后调用 `/agent/execute` |
| 好处 | 降低 AI 误操作风险 |
| 代价 | 前端需要维护确认交互，工具参数要更严谨 |

## 15. 测试与验证

### 15.1 当前测试入口

| 命令 | 用途 |
|---|---|
| `cd backend && ../.venv/bin/python -m pytest tests -q` | 后端 API 与业务规则测试 |
| `cd base_agent && ../.venv/bin/python -m pytest tests -q` | base_agent 算法/密钥相关测试 |
| `cd frontend && npm run build` | 前端类型与构建验证 |

### 15.2 重要已有测试

| 测试文件 | 覆盖内容 |
|---|---|
| `backend/tests/test_auth_security.py` | 注册角色限制、停用用户登录、空请求 |
| `backend/tests/test_auth_passwords.py` | bcrypt 与旧 SHA256 密码兼容 |
| `backend/tests/test_admin_users.py` | 用户管理权限与自我保护 |
| `backend/tests/test_candidate_journey.py` | 候选人 journey、转派、归属限制 |
| `backend/tests/test_pipeline_rounds.py` | 阶段推进、备注、非法阶段 |
| `backend/tests/test_interview_loop.py` | AI 面试回写流程、面试官反馈 |
| `backend/tests/test_security_hardening_next.py` | 试点权限边界、面试官禁止上传/重解析/推进流程 |
| `frontend/tests/interviewer_role_scope.test.mjs` | 面试官导航、路由、面试任务与反馈按钮边界 |
| `base_agent/tests/test_job_matcher.py` | 岗位匹配算法 |
| `base_agent/tests/test_llm_client_secrets.py` | keychain 密钥解析 |

### 15.3 改动前验证建议

| 改动 | 至少跑 |
|---|---|
| 只改前端样式 | `npm run build` |
| 改登录/权限 | `pytest tests/test_auth_security.py tests/test_auth_passwords.py -q` |
| 改角色页面/面试官权限 | `pytest tests/test_security_hardening_next.py -q` + `node frontend/tests/interviewer_role_scope.test.mjs` |
| 改候选人/流程 | `pytest tests/test_candidate_journey.py tests/test_pipeline_rounds.py -q` |
| 改 AI 面试 | `pytest tests/test_interview_loop.py -q` |
| 改匹配算法 | `pytest ../base_agent/tests/test_job_matcher.py -q` 或在 base_agent 目录跑 |
| 改密钥/LLMClient | `cd base_agent && ../.venv/bin/python -m pytest tests/test_llm_client_secrets.py -q` |
| 改部署/静态托管 | `npm run build` + 访问 `/login`、登录、打开核心页面 |

## 16. 已知风险与技术债

| 风险 | 影响 | 建议 |
|---|---|---|
| seed 文档、seed 脚本、当前 DB 数量不一致 | 新人部署可能拿不到预期演示数据 | 统一数据策略：提交 DB 或修正 seed |
| 当前上传/AI 解析同步执行 | 批量简历或 LLM 慢时请求等待久 | 引入任务队列与进度接口 |
| SQLite 用作演示库 | 并发和备份能力有限 | 生产使用 PostgreSQL |
| JWT_SECRET 默认值弱 | 生产安全风险 | 生产必须配置强随机密钥 |
| demo 密码弱 | 公网演示风险 | 公网演示后关闭服务或强制改密 |
| AI 面试会自动改流程状态 | 误判会影响主流程 | 保留人工确认或加规则开关 |
| `base_agent` 通过 sys.path 复用 | 包边界不清晰 | 后续可整理为 Python package |
| 试点审计不是企业合规完整版 | 缺导出审批、水印、字段级权限和不可变日志 | 生产合规版再接入专用审计存储与审批策略 |
| ZIP 批量导入仍会逐份同步 AI | 大量简历导入慢 | 异步导入、批次 ID、失败重试 |

## 17. 后续文档建议

以下是未来可选新增文档，不是当前必读入口；当前没有这些文件也不影响开发：

1. 更细的接口请求/响应示例。
2. 按“我要改什么”组织的改动手册。
3. 把本文 ADR 摘要拆成独立决策记录，放到现有 `docs/adr/` 目录。

## 18. 快速结论

这个系统当前已经具备初版完整闭环。后续迭代时，最安全的策略是：

1. UI 风格改动只动 `frontend/`。
2. 新增只读展示优先复用现有 API。
3. 新增保存字段必须同时设计模型、接口、前端、测试。
4. 新增 AI 行为默认做成旁路建议，不直接写主数据。
5. 如果 AI 要写库或改流程，必须先定义人工确认、回滚方式和测试用例。
