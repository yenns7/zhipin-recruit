# 智聘 Java+React 重构优化与多 Agent 协同方案

> 状态：BE-1~BE-7 已完成，FE-0 已完成；FE-1~FE-8 待验证
> 日期：2026-07-08
> 基线分支：`Java`（当前 HEAD `501df95`）
> 关联文档：`docs/15_JavaSpringBootReact重构MVP状态报告.md`、`docs/17_JavaReact真实试点前落地准备清单.md`、`rebuild/README.md`

---

## 0. 文档定位与关键结论

本文档面向「Java 后端 + 前端重构」的收尾优化，基于对三个代码库的逐文件调查：

| 代码库 | 路径 | 技术栈 | 角色 |
|---|---|---|---|
| 原后端 | `backend/` | Python Flask + SQLAlchemy | 重构前参考（功能基准） |
| 原前端 | `frontend/` | **React 18 + TS（160 .tsx）** | 重构前参考（功能基准 + 目标前端栈） |
| 新后端 | `rebuild/backend-java/` | Java 21 + Spring Boot 3.2 | 当前重构产物 |
| 新前端 | `rebuild/frontend-vue/` | **Vue 3 + TS（23 .vue）** | 当前重构产物（需替换为 React） |

### 三条关键结论（纠正认知偏差）

1. **「前端架构都一致」不成立。** 原前端是 React 18（160 个 .tsx 文件，约 12400 行页面代码 + 16 组件 UI Kit），重构后另起炉灶改写为 Vue 3（23 个 .vue 文件，约 4500 行，无共享 UI Kit）。两者技术栈、页面覆盖都不一致。
2. **前端统一为 React，并删除 Vue。** 经核实，React 前端 `frontend/src/lib/api.ts:86` 的 `API_BASE` **已经是 `/api/v1`**（早已切换到对接 Java 后端），且已调用 `/users/me`、`/resumes/upload`、`/auth/logout` 等 Java 新增端点。因此「复用 React」近乎即用，无需 API base 切换；本方案的明确动作是：**删除 `rebuild/frontend-vue/` 目录**，以 `frontend/`（React 18）为唯一前端基线，仅补齐缺失页面与少量契约适配。
3. **后端接口已基本对齐，但存在大量「桩」实现。** Java 后端 105 端点 vs Python 94 路由，数量对齐；但 AI/LLM、BOSS 真集成、简历解析、字段加密、Agent SSE 流式、通知/审计持久化等均为 demo/in-memory 桩，需逐项补真实实现。

### 文档同步说明

- 本次为「分析与计划」产出，未改动代码，**无需同步产品/运行/部署文档**。
- 后续执行任一优化项时，须按 `AGENTS.md` 同步对应文档（接口字段→API.md/RUNNING.md；BI 口径→docs/03；AI 助手行为→docs/ai_assistant_upgrade_plan；端口/部署→rebuild/DEPLOYMENT.md）。

---

## 1. 差距总览：重构前 vs 重构后

### 1.1 后端差距（Python Flask → Java Spring Boot）

> 注：以下差距表为基线 `501df95` 时的状态；BE-1~BE-7 已全部落地真实实现，本表仅作历史对照。

| 维度 | 原后端（Python） | 新后端（Java） | 差距 |
|---|---|---|---|
| 路由数 | 94 | 105 | ✅ 数量对齐 |
| 数据模型 | 20 个模型 | 12 个实体 | ⚠️ 缺 `UploadBatch`/`CandidateTag`/`Match`/`CandidateDisposition`/`OfferRecord`/`InterviewAssignment`/`AuditLog`/`Notification`/`Conversation`/`ConversationMessage` 等 8+ 张表（部分用 in-memory 替代） |
| AI/LLM | LangGraph ReAct Agent + DeepSeek 真调用 + SSE 流式 | 规则/桩（`InterviewAIService` 关键词正则，`AgentController.mockExecuteTool`） | ❌ 无真实 LLM |
| 简历解析 | pypdf/docx + LLM 结构化抽取 + 技能评分 | 仅写文件，`resumeJson="{}"` 占位 | ❌ 无解析 |
| BOSS 集成 | 真实 `boss-cli` 子进程 + Cookie 加密 + 批量导入 + AI 筛选 | `BossDemoService` 全 in-memory 桩 | ❌ 无真集成 |
| BI | 1100 行，8 类指标（漏斗/员工/渠道/面试问责/经理告警/需求健康/简历消费/数据质量） | 规则聚合，3 端点，指标大幅精简 | ⚠️ 口径不全 |
| Agent | 会话/消息持久化 + 写工具 RBAC 确认 + 调用日志 + 流式 token | 会话 in-memory，确认卡片无 `@click`，无流式 | ❌ 不可用 |
| 通知 | DB 持久化 + 已读/未读 | in-memory「todo」模型 | ❌ 不持久 |
| 审计 | `Event` + `AuditLog` 双表 DB 持久化 | `Event` 持久化，`AuditLog` in-memory | ⚠️ 部分持久 |
| Offer/Disposition | `OfferRecord`/`CandidateDisposition` 表持久化 | Offer in-memory `ConcurrentHashMap`，无 Disposition | ❌ 不持久 |
| 字段加密 | Fernet 加密 BOSS Cookie | 无（`FIELD_ENCRYPTION_KEY` 未生效） | ❌ 缺失 |
| 测试 | — | 136 `@Test`，全绿 | ✅ |

### 1.2 前端差距（React → Vue，且应回归 React）

> 关键决策：**前端统一为 React，删除 `rebuild/frontend-vue/`。** 经核实 React 前端 `API_BASE` 已是 `/api/v1`，近乎即用；以 `frontend/` 为唯一前端基线。

| 维度 | 原前端（React，保留） | 新前端（Vue，待删除） | 差距 |
|---|---|---|---|
| 技术栈 | React 18 + react-router | Vue 3 + vue-router | ❌ 栈不一致 |
| 页面数 | 28 页（含 6 feature 页） | 15 视图 | ⚠️ Vue 少 13 页（但 React 已有） |
| 代码量 | ~12400 行页面 + UI Kit | ~4500 行，无 UI Kit | ⚠️ Vue 缺组件库 |
| API base | **`/api/v1`（已切换）** | `/api/v1` | ✅ 已一致 |
| Agent | SSE 流式 + 思考链 + 工具卡 + 确认卡可用 | 请求/响应，确认卡无点击 | ❌ Vue 降级 |
| 缺失页面（Vue 无，React 有） | — | Demands、BOSS(4页)、JobMatch、AI预筛 `/interviews/new`、Agent日志、AI架构、审计日志、富 Dashboard、富 BI | ❌ 见 §2.2 |

---

## 2. 优化任务分解与多 Agent 分配

### 2.1 分配原则

- **按模块垂直切分**：每个 Agent 负责一个完整模块（后端实体+接口+前端页面+测试+文档），减少跨 Agent 冲突。
- **前后端可并行**：后端 Agent 先定接口契约（DTO/路径），前端 Agent 按契约对接。
- **有依赖的串行**：API 契约 → 前端对接；简历解析 → 匹配；LLM 接入 → Agent/面试/BOSS AI 筛选。
- **每个 Agent 产出**：代码 + 测试 + 文档同步说明（遵循 `AGENTS.md`）。

### 2.2 前端栈对齐（最高优先级，阻塞所有前端功能项）

> 这一项解决「Vue→React」的技术栈回归。**先做，再并行功能项。**

#### Agent-FE-0：删除 Vue + 确认 React 基线

- **目标**：删除 `rebuild/frontend-vue/` 目录（git 跟踪 69 文件）；以 `frontend/`（React 18）为唯一前端基线。经核实 `API_BASE` 已是 `/api/v1`，无需切换 base，仅做少量端点契约适配与冒烟验证。
- **关键上下文**：
  - API 层入口：`frontend/src/lib/api.ts:86` `const API_BASE = '/api/v1';`（**已是 `/api/v1`，无需改**）
  - Agent 流式：`frontend/src/lib/agent.ts`（SSE，需对接 Java 后端，见 Agent-BE-3）
  - 路由：`frontend/src/App.tsx` + `frontend/src/app/featureRegistry.ts`
  - 已知契约差异（须逐一适配）：
    - 简历上传：`POST /resume/upload` → `POST /resumes/upload`（Java）
    - 简历详情：`GET /resume/{id}` → 复用 `GET /interviews/{id}`（Java 偏离，建议后端改回，见 Agent-BE-1）
    - 当前用户：`GET /auth/me` → `GET /users/me`（Java）
    - 改密：`POST /auth/change-password` → `PUT /users/me/password`（Java）
    - 通知：`GET /notifications` → `GET /notifications/todos`（Java 模型不同，建议后端对齐，见 Agent-BE-5）
    - 登出：Java 新增 `POST /auth/logout`（demo session，前端可接）
- **验收**：`npm run build` 0 错误；4 角色（招聘专员/经理/面试官/管理员）登录后主流程跑通；TypeScript 0 错误。
- **文档同步**：`rebuild/RUNNING.md` 前端启动章节改为 React。
- **依赖**：无（先行）。**阻塞**：所有 Agent-FE-*。

---

### 2.3 后端补真实实现（并行）

#### Agent-BE-1：简历解析与匹配（LLM 接入）

- **缺口**：Java 后端 `resumeJson="{}"` 占位，无解析；匹配算法已移植但依赖解析结果。
- **任务**：
  1. 新增 `ResumeParserService`：PDF/DOCX 文本抽取（Apache PDFBox + Apache POI）→ 调用 LLM 结构化抽取（姓名/邮箱/电话/教育/经历/技能）→ 技能评分（1-5）→ 写入 `resumeJson` + `CandidateTag`。
  2. 补 `UploadBatch` 实体（批次来源/渠道/备注）+ `CandidateTag` 实体。
  3. 异步解析（`@Async` 或 Spring Events），状态 `processing→ok/failed`，支持 `retry-parse`。
  4. LLM 客户端封装（参考 `base_agent/llm_client.py` 的 fast/think/pro 路由），配置 DeepSeek/OpenAI key。
- **关键上下文**：
  - 原实现：`backend/app/services/resume_service.py` + `base_agent/resume_parser.py` + `base_agent/tech_taxonomy.json`
  - Java 入口：`rebuild/backend-java/src/main/java/com/hireinsight/resume/ResumeController.java:33`（当前仅写文件）
  - 配置项：`app.llm.*`（新增）、`app.upload.folder`（已有）
- **验收**：上传 PDF 后 30s 内 `parse_status=ok`，`resumeJson` 含结构化字段；`/candidates` 搜索能按技能命中。
- **文档同步**：`rebuild/backend-java/API.md` 简历相关；`rebuild/RUNNING.md` LLM 配置。
- **依赖**：无。**阻塞**：Agent-BE-2（匹配依赖解析结果）。

#### Agent-BE-2：BOSS 真集成

- **缺口**：`BossDemoService` 全 in-memory，无真实 `boss-cli` 调用、无 Cookie 加密、无批量导入。
- **任务**：
  1. 封装 `boss-cli` 子进程调用（`ProcessBuilder`），解析 JSON 输出；自动安装/版本探测。
  2. Cookie 加密存储（`BossAccount` 实体 + JCE/AES-GCM，对标 Fernet），`FIELD_ENCRYPTION_KEY` 真正生效。
  3. 批量导入链路：inbox 限流下载（默认 1.5s 间隔，max 50）→ 去重（geek_id）→ 落盘 `uploads/boss/<uid>/` → 建 Candidate → 可选入池。
  4. AI 筛选：批量 LLM 评估 → Interview 记录 → 推进 `ai_screen`。
  5. 错误分类：`boss_cli_not_installed`/`not_authenticated`/`rate_limited` 等码。
- **关键上下文**：
  - 原实现：`backend/app/services/boss_service.py`（601 行）、`boss_pipeline_service.py`（363 行）
  - Java 入口：`rebuild/backend-java/.../boss/BossController.java`（19 端点已就位，换实现）
  - 浏览器扩展：`extension/`（Cookie 采集，`/boss/extension/download` 打包）
- **验收**：导入浏览器 Cookie 后 `status` 通过；inbox 能拉到真实候选人并入库；`rate_limited` 时中断可恢复。
- **文档同步**：`docs/08_BOSS账号接入方案`、`docs/11_BOSS_CLI数据集成计划`、`rebuild/DEPLOYMENT.md` 加密 key 配置。
- **依赖**：Agent-BE-1（AI 筛选复用 LLM）。

#### Agent-BE-3：Agent AI 助手（LLM + SSE 流式 + 持久化）

- **缺口**：会话 in-memory；无真实 LLM；无 SSE 流式；确认卡无逻辑；写工具无 RBAC 执行。
- **任务**：
  1. 新增 `Conversation`/`ConversationMessage` 实体（Flyway 迁移），持久化会话/消息。
  2. LLM ReAct Agent（Java 可用 LangChain4j 或自研 StateGraph），8 读工具 + 4 写工具，写工具走「提议→用户确认→`/agent/execute`」。
  3. SSE 流式：`POST /api/v1/agent/chat`，事件 `conversation_started/thought/tool_call/tool_result/token/confirm_required/done/error`。
  4. 调用日志：`AgentCallLog` 已持久化（V12），补 model/tokens/duration/status 完整字段。
  5. AI 架构看板：`GET /api/v1/admin/ai-architecture`（系统提示/工具/权限/安全）。
- **关键上下文**：
  - 原实现：`backend/app/services/agent_service.py`（962 行，LangGraph）
  - Java 入口：`rebuild/backend-java/.../agent/AgentController.java`
  - 前端 SSE 消费：`frontend/src/lib/agent.ts`（React 端已实现，需对接）
- **验收**：流式 token 实时输出；写工具触发确认卡，确认后真正执行；重启后会话不丢。
- **文档同步**：`docs/ai_assistant_upgrade_plan.md`、`rebuild/backend-java/API.md` Agent 章节。
- **依赖**：Agent-BE-1（LLM 客户端）。

#### Agent-BE-4：BI 口径对齐

- **缺口**：Java BI 仅 3 端点基础聚合，缺渠道质量/面试问责/经理告警/需求健康/简历消费/数据质量告警 6 类指标。
- **任务**：
  1. 按 `docs/03_BI看板设计.md` 口径补齐 8 类指标（漏斗/员工绩效/渠道质量/面试问责/经理告警/需求健康/简历消费/数据质量）。
  2. 时间窗参数 `days ∈ {7,30,90}`。
  3. recruiter 仅看自己，manager/admin 看全局（注意：原系统 BI 是全局口径，非团队拆分——见 `docs/03` 与 commit `fd27a5e`）。
- **关键上下文**：
  - 原实现：`backend/app/api/bi.py`（1100 行）
  - Java 入口：`rebuild/backend-java/.../bi/BiService.java`
- **验收**：与原系统同输入下指标数值一致（抽样校验）。
- **文档同步**：`docs/03_BI看板设计.md`（若口径有调整）。
- **依赖**：Agent-BE-1（需简历/匹配数据填充）。

#### Agent-BE-5：持久化收口（通知/Offer/Disposition/审计）

- **缺口**：通知 in-memory「todo」、Offer in-memory Map、无 `CandidateDisposition`、`AuditLog` in-memory。
- **任务**：
  1. `Notification` 实体（已读/未读，对标原 `/notifications` 契约），前端 React 已按此契约实现。
  2. `OfferRecord` 实体（薪资/入职日/审批状态），持久化替代 in-memory。
  3. `CandidateDisposition` 实体（reject 时记录原因/入池/下次联系）。
  4. `AuditLog` 实体持久化（actor/target/action/ts）。
  5. 契约对齐：通知从 `/notifications/todos` 回归 `/notifications`（已读/未读模型），与 React 前端一致。
- **关键上下文**：原模型 `backend/app/models.py`；Java 模型目录 `rebuild/backend-java/.../model/`
- **验收**：重启后通知/Offer/审计不丢；reject 流程产生 Disposition 记录。
- **文档同步**：`rebuild/backend-java/API.md` 通知/Offer 章节。
- **依赖**：无。

#### Agent-BE-6：面试全链路（LLM 预筛 + 指南 + 调度）

- **缺口**：AI 面试规则正则而非 LLM；调度用 ID 输入非搜索选择；缺 `InterviewAssignment` 持久化。
- **任务**：
  1. `InterviewAIService` 改 LLM：`generateQuestions`（JD 生成题）→ `evaluateAnswers`（LLM 评分/亮点/顾虑/pass）→ `buildReport`（均分≥3.5 pass）。
  2. `InterviewAssignment` 实体（轮次/面试官/时间/地点/状态），调度接口支持按姓名搜索面试官。
  3. 面试指南 `GET /interviews/guide`（按轮次焦点/问题/风险）。
  4. 反馈 `InterviewFeedback` 已持久化，补 reason_tags/evaluation_json 完整字段。
- **关键上下文**：原实现 `backend/app/services/interview_service.py`；Java `.../interview/InterviewAIService.java:28`
- **验收**：AI 预筛产出真实个性化题目与评分；调度可选面试官。
- **文档同步**：`rebuild/backend-java/API.md` 面试章节。
- **依赖**：Agent-BE-1（LLM）。

#### Agent-BE-7：安全与试点加固

- **缺口**：字段加密未生效；JWT 无真实吊销；CORS 默认 `*`；缺生产安全头。
- **任务**：
  1. 字段加密生效（BOSS Cookie 用，与 Agent-BE-2 协同）。
  2. JWT 吊销：登出加入 token 黑名单或短有效期+refresh。
  3. 安全头：CSP/X-Frame-Options/X-Content-Type-Options/Referrer-Policy（对标原 `app/__init__.py:51-75`）。
  4. 限流：`auth.login`/`agent.chat`/`resume.upload` 滑动窗（对标原配置）。
  5. `pilot` profile 启动校验（JWT 强密钥/CORS 非空/上传持久目录/禁公开注册）——已有 `PilotReadinessValidator`，补全。
- **关键上下文**：原实现 `backend/app/__init__.py:51-104`、`backend/app/middleware/rate_limit.py`
- **验收**：`pilot` 启动弱配置即拒绝；登出后 token 失效；限流命中返回 429。
- **文档同步**：`rebuild/DEPLOYMENT.md` 安全配置章节。
- **依赖**：无。

---

### 2.4 前端补齐（依赖 Agent-FE-0 完成）

> 所有前端任务以 `frontend/`（React）为基线。原 React 前端已实现大部分页面且 API 已对齐 `/api/v1`，主要工作是 **冒烟验证 + 缺失页面对接 + 少量契约适配**。

#### Agent-FE-1：Demands 招聘需求管理页

- **现状**：React `features/demands/pages/DemandsPage.tsx`（741 行）已存在；Java 后端 `/api/v1/demands` 7 端点已就位。
- **任务**：API 已是 `/api/v1`，验证创建/关闭/降级/恢复/风险标记/岗位关联全链路冒烟通过。
- **依赖**：Agent-FE-0。

#### Agent-FE-2：BOSS 工作台（4 页）

- **现状**：React `features/boss/pages/`（BossPage/BossInboxWorkbench/BossAccountManager/BossCliTestPage）已存在。
- **任务**：API 已对齐，对接 Agent-BE-2 真集成后的 Cookie 导入/inbox/批量导入/AI 筛选；浏览器扩展下载。
- **依赖**：Agent-FE-0、Agent-BE-2。

#### Agent-FE-3：岗位匹配页 `/jobs/:id/match`

- **现状**：React `pages/JobMatchPage.tsx`（696 行）已存在；Java 后端 `POST /api/v1/match/jobs/{jobId}/match` + `GET /match/jobs/{jobId}/preview` 已就位。
- **任务**：API 已对齐，验证 AI 匹配 + 手动选库 + 批量入池。
- **依赖**：Agent-FE-0、Agent-BE-1（匹配依赖解析）。

#### Agent-FE-4：AI 预筛面试流 `/interviews/new`

- **现状**：React `pages/InterviewsPage.tsx`（467 行，三阶段 setup→answer→report）已存在。
- **任务**：API 已对齐，对接 Agent-BE-6 的 LLM 题目生成与评分。
- **依赖**：Agent-FE-0、Agent-BE-6。

#### Agent-FE-5：Agent AI 助手页（SSE 流式）

- **现状**：React `pages/AgentPage.tsx`（907 行）+ `lib/agent.ts`（SSE）+ 8 个 agent 组件已存在且功能完整。
- **任务**：API 已对齐，对接 Agent-BE-3 的 `/api/v1/agent/chat` SSE 端点；验证思考链/工具卡/确认卡/停止按钮。
- **依赖**：Agent-FE-0、Agent-BE-3。

#### Agent-FE-6：管理后台补齐（Agent 日志/AI 架构/审计）

- **现状**：React `pages/admin/`（AgentCallLogsPage/AiArchitecturePage/AuditLogPage）已存在。
- **任务**：API 已对齐，对接 Agent-BE-3 的 `/admin/ai-architecture`、Agent-BE-5 的审计日志持久化。
- **依赖**：Agent-FE-0、Agent-BE-3、Agent-BE-5。

#### Agent-FE-7：Dashboard + BI 富化

- **现状**：React `pages/DashboardPage.tsx`（695 行）+ `pages/BiPage.tsx`（1100 行）+ 14 个 BI 组件已存在。
- **任务**：API 已对齐，对接 Agent-BE-4 补齐的 BI 指标；验证员工下钻/漏斗/渠道质量/数据质量告警。
- **依赖**：Agent-FE-0、Agent-BE-4。

#### Agent-FE-8：通知中心

- **现状**：React `pages/NotificationCenterPage.tsx` 已存在（已读/未读模型）。
- **任务**：API 已对齐，对接 Agent-BE-5 回归的 `/notifications` 契约。
- **依赖**：Agent-FE-0、Agent-BE-5。

---

## 3. 执行时序与并行图

```
阶段 0（先行，阻塞前端）
  Agent-FE-0  删除 Vue + 确认 React 基线
  ├─ 同时启动无依赖后端 ─┐
  │                      │
阶段 1（并行后端）         │
  Agent-BE-1 简历解析(LLM)─┼─→ Agent-BE-2 BOSS真集成
  │                        │   Agent-BE-3 Agent(LLM+SSE)  ← 依赖 BE-1 的 LLM 客户端
  │                        │   Agent-BE-4 BI 口径         ← 依赖 BE-1 数据
  │                        │   Agent-BE-5 持久化收口
  │                        │   Agent-BE-6 面试全链路       ← 依赖 BE-1 的 LLM
  │                        │   Agent-BE-7 安全加固
  │                        │
阶段 2（前端功能并行，依赖 FE-0 + 对应后端）
  Agent-FE-1 Demands       ← FE-0
  Agent-FE-2 BOSS 工作台    ← FE-0, BE-2
  Agent-FE-3 岗位匹配       ← FE-0, BE-1
  Agent-FE-4 AI 预筛        ← FE-0, BE-6
  Agent-FE-5 Agent 助手     ← FE-0, BE-3
  Agent-FE-6 管理后台       ← FE-0, BE-3, BE-5
  Agent-FE-7 Dashboard+BI  ← FE-0, BE-4
  Agent-FE-8 通知中心       ← FE-0, BE-5

阶段 3（收尾）
  全链路冒烟（4 角色 × 关键路径）
  文档同步检查（AGENTS.md 规则）
  试点 Go/No-Go（按 docs/17 清单）
```

---

## 4. 验收口径（遵循 AGENTS.md）

本方案所有任务的「完成」须同时满足：

1. **技术可运行**：编译/构建 0 错误，自动化测试全绿。
2. **产品可试用**（关键）：
   - 招聘专员：上传简历→解析→建岗位→匹配→入池→推进→offer 全链路。
   - 经理/负责人：看 BI 能解释「谁做了什么/推进多少/卡在哪/责任在谁」。
   - 面试官：能收到面试任务→提交反馈。
   - 管理员：能建账号/看审计/管 AI 架构。
3. **缺口入口审查**：缺数据/空列表/无权限时有明确提示和下一步入口。
4. **反向操作审查**：关闭能恢复、推进能撤回/修正、错误数据能补救；暂不支持的写进风险。
5. **数据归属审查**：候选人负责人/推进人/反馈人/岗位归属/BI 口径一致。
6. **文档同步**：接口字段/端口/BI 口径/AI 行为变更已同步对应文档。

> 在以上审查完成前，不得对外承诺「可上线」或「已完善」，只能说「技术主流程可运行」或「仍需补产品试点检查」。

---

## 5. 已知风险与限制

| 风险 | 说明 | 缓解 |
|---|---|---|
| Vue 前端删除 | `rebuild/frontend-vue/` 已有 23 视图 + 79 测试，删除有沉没成本 | 已确认 React 前端功能更全且 API 已对齐 `/api/v1`，删除 Vue；如需交互参考可在删除前留存快照 |
| LLM 成本与密钥 | 真实 LLM 调用产生费用，需 key 管理 | dev 用低成本模型（fast 路由）；pilot 限流；密钥不入库 |
| BOSS CLI 外部依赖 | `boss-cli` 为外部仓库，可能失效/改版 | 错误分类 + 降级提示；版本探测 |
| Offer/推进误操作 | `revert-lite` 仅 demo，误推进需人工修 | 阶段 2 前补 rollback/revise 真实持久化（Agent-BE-5） |
| 前后端契约分歧 | Java 后端部分路径偏离原契约（如 `/resumes` vs `/resume`） | 优先后端对齐原契约，减少前端改动量 |
| BI 全局 vs 团队 | 原系统 BI 为全局口径（commit `fd27a5e`），勿误拆团队 | 以 `docs/03` 为准 |

---

## 6. 关键上下文索引（给各 Agent 的导航）

### 6.1 后端
- Java 入口：`rebuild/backend-java/src/main/java/com/hireinsight/`
- 控制器：`.../controller/` 或 `.../{module}/` 下 `*Controller.java`
- 模型：`.../model/`（12 实体）
- 迁移：`src/main/resources/db/migration/`（V5,V9,V10,V11,V12）
- API 文档：`rebuild/backend-java/API.md`（105 端点，注意 BOSS 实为 19 非文档标的 18）
- 原参考：`backend/app/api/*.py`（14 blueprint）、`backend/app/models.py`（20 模型）、`backend/app/services/*.py`

### 6.2 前端（React 基线）
- 路由：`frontend/src/App.tsx` + `frontend/src/app/featureRegistry.ts`
- API 层：`frontend/src/lib/api.ts`（`API_BASE='/api/v1'`，line 86，已对接 Java）、`frontend/src/lib/agent.ts`（SSE）
- 页面：`frontend/src/pages/`（28）+ `frontend/src/features/{candidates,demands,boss}/pages/`（6）
- UI Kit：`frontend/src/components/ui/`（16 组件）
- BI 组件：`frontend/src/components/bi/`（14）
- Agent 组件：`frontend/src/components/agent/`（8）

### 6.3 文档
- 重构状态：`docs/15_JavaSpringBootReact重构MVP状态报告.md`（最新，2026-07-08）
- 试点清单：`docs/17_JavaReact真实试点前落地准备清单.md`
- BI 口径：`docs/03_BI看板设计.md`
- AI 助手：`docs/ai_assistant_upgrade_plan.md`
- BOSS：`docs/08_BOSS账号接入方案`、`docs/11_BOSS_CLI数据集成计划`
- 部署：`rebuild/DEPLOYMENT.md`
- 运行：`rebuild/RUNNING.md`
- 执行规范：`AGENTS.md`

---

## 附：任务分配速查表

| Agent | 类型 | 任务 | 依赖 | 优先级 |
|---|---|---|---|---|
| FE-0 | 前端 | 删除 Vue + 确认 React 基线（API 已 `/api/v1`） | 无 | P0（阻塞） |
| BE-1 | 后端 | 简历解析（LLM）+ UploadBatch/CandidateTag | 无 | P0 |
| BE-2 | 后端 | BOSS 真集成 + Cookie 加密 | BE-1 | P1 |
| BE-3 | 后端 | Agent LLM + SSE + 会话持久化 | BE-1 | P1 |
| BE-4 | 后端 | BI 8 类口径对齐 | BE-1 | P1 |
| BE-5 | 后端 | 通知/Offer/Disposition/审计持久化 | 无 | P1 |
| BE-6 | 后端 | 面试 LLM + 调度 + 指南 | BE-1 | P1 |
| BE-7 | 后端 | 字段加密/JWT 吊销/安全头/限流 | 无 | P1 |
| FE-1 | 前端 | Demands 页对接 | FE-0 | P2 |
| FE-2 | 前端 | BOSS 4 页对接 | FE-0,BE-2 | P2 |
| FE-3 | 前端 | 岗位匹配页对接 | FE-0,BE-1 | P2 |
| FE-4 | 前端 | AI 预筛流对接 | FE-0,BE-6 | P2 |
| FE-5 | 前端 | Agent SSE 页对接 | FE-0,BE-3 | P2 |
| FE-6 | 前端 | 管理后台 3 页对接 | FE-0,BE-3,BE-5 | P2 |
| FE-7 | 前端 | Dashboard+BI 富化对接 | FE-0,BE-4 | P2 |
| FE-8 | 前端 | 通知中心对接 | FE-0,BE-5 | P2 |
