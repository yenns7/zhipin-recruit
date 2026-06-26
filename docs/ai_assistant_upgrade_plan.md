# AI 助手模块高可用改造计划

> 把 AI 助手从"能跑但简陋"改造成高可用 Agent：会话不丢、调用有 log、能审计、能引用全系统功能（含 BOSS CLI）、能按已登录 BOSS 账号选择、前端丰富好看。
> v1.0 ｜ 2026-06-26 ｜ 关联 [01 PRD](./01_PRD.md)、[02 改造实施计划](./02_改造实施计划.md)

---

## 0. 背景与现状定位

基于代码级调研，AI 助手模块当前问题分三类（每条均带代码证据，见 [附录 A](#附录-a问题定位证据清单)）：

- **A 类 历史会话管理缺失**（用户最直接感知的"切换后数据丢失"）：前端无会话列表/切换/新建 UI；`messages` 只存内存不持久化；恢复逻辑只认单个 conversationId，其它历史会话不可达；无删除/重命名。
- **B 类 AI 调用日志完全缺失**：无任何输入/输出/工具/耗时/成本记录，事后无法审计排障（后端 `agent_service.py:580` 自承待办）；多轮上下文只回传纯文本，丢失 tool_calls/thoughts。
- **C 类 功能简陋 + 健壮性/体验问题**：BOSS CLI 闭环功能 AI 不可触达（工具表无 BOSS 工具）；AI 助手不感知 BOSS 账号；前端工具元信息与后端不同步（`web_search` 缺标签）；写操作确认逻辑脆弱；限流按 IP。

**改造目标**：阶段 0-2 先解决 A、B 两类（数据不丢 + 调用有 log + 可审计），阶段 3-5 再解决 C 类（BOSS 接入 + 账号选择 + 前端重设计 + 健壮性）。本次先落地 P0（阶段 0-2）。

---

## 1. 改造原则

1. **不改已上线契约的语义**：现有 `GET /api/agent/conversations`、`GET /api/agent/conversations/<id>`、`POST /api/agent/chat`、`POST /api/agent/execute` 行为保持兼容，只新增字段/接口。
2. **log 是基础设施**：先建表 + 写入点，再做查询/展示。所有 AI 调用（LLM 调用、工具调用、写操作确认执行）都落 log。
3. **前端会话状态以"后端为唯一事实源"**：内存只做缓存，切换/刷新一律以后端会话列表 + 详情接口为准，彻底解决"切了就丢"。
4. **遵循 AGENTS.md**：涉及 AI 助手行为、接口字段变化时，同步更新 `README.md` / `RUNNING.md` / `DEPLOYMENT.md` / `docs/01_PRD.md`。
5. **TDD + 两阶段 review**：用 subagent-driven-development 执行，每个任务先写测试再实现，再过 spec 合规 + 代码质量两道 review。

---

## 2. 数据模型设计

### 2.1 新增 `AgentCallLog` 表（阶段 0）

记录每一次 AI 调用，用于审计、排障、统计。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | int PK | |
| `conversation_id` | int FK→conversations | 所属会话（可为空，异常场景） |
| `message_id` | int FK→conversation_messages | 关联的 assistant 消息（可为空） |
| `user_id` | int FK→users | 发起人 |
| `role` | varchar | 发起人角色（快照） |
| `kind` | varchar | `chat` / `tool_read` / `tool_write` |
| `input_text` | text | 输入（用户消息 / 工具入参，截断超长） |
| `output_text` | text | 输出（assistant 文本 / 工具结果，截断超长） |
| `tool_calls` | json | 工具调用链（name/args/result 摘要） |
| `thoughts` | json | 思考过程摘要 |
| `model` | varchar | 实际使用的模型名（含 route_model 路由结果） |
| `prompt_tokens` | int | 输入 token |
| `completion_tokens` | int | 输出 token |
| `duration_ms` | int | 耗时 |
| `status` | varchar | `ok` / `error` / `timeout` |
| `error_msg` | text | 失败原因 |
| `created_at` | datetime | 默认 now |

索引：`(user_id, created_at)`、`(conversation_id, created_at)`、`(status)`。

### 2.2 `Conversation` 表扩展（阶段 0）

- 新增 `archived` boolean 默认 false（归档而非删除，便于审计追溯）。
- 新增 `title_source` varchar：`auto_first`（首条截断，现状）/ `auto_llm`（LLM 生成）/ `manual`（用户改名）。
- `title` 更新策略：首条消息后用 `auto_first`；阶段 5 改为 LLM 异步生成 `auto_llm`。

---

## 3. 阶段 0：数据层与日志基础设施（P0 地基）

> 目标：建表 + 写入点，让每一次 AI 调用都留痕。本阶段不改前端。

### 任务 0.1 新增 `AgentCallLog` 模型与迁移

- **动作**：`backend/app/models.py` 新增 `AgentCallLog` 类（字段见 2.1）；按项目现有迁移方式（Alembic 或 `migrations/`）生成迁移脚本；`seed_dev.py` 不预置（log 运行期产生）。
- **为什么**：审计/排障/统计的前提是有结构化数据，先建表。
- **验收**：迁移可正向执行；`AgentCallLog.query` 可用；单测覆盖字段与默认值。

### 任务 0.2 `Conversation` 扩展 `archived` / `title_source` + 迁移

- **动作**：`models.py` 的 `Conversation` 加两字段（默认值见 2.2）；迁移脚本；现有数据 `title_source` 回填为 `auto_first`。
- **验收**：迁移正向执行；现有会话默认未归档、标题来源为 `auto_first`。

### 任务 0.3 LLM 调用埋点（成功 + 失败）

- **动作**：`base_agent/llm_client.py` 在 `chat`/`route_model` 出口记录 `model / prompt_tokens / completion_tokens / duration_ms / status / error_msg`，封装成一个 `_log_call` 辅助函数（不直接写库，返回结构化 dict，由调用方决定入库时机，避免环形依赖）。
- **关键**：DeepSeek/OpenAI 兼容响应的 `usage` 字段已含 token，直接取；失败时 `prompt_tokens` 可能为 0，记 `status=error` + `error_msg`。
- **为什么**：`LLMClient` 当前只在失败 `logging.warning`（`llm_client.py:261,291`），成功调用零记录。
- **验收**：单测 mock 一次成功 + 一次失败调用，断言返回的 log dict 字段完整。

### 任务 0.4 `/agent/chat` 流式 done 后写 `AgentCallLog`

- **动作**：`backend/app/api/agent.py:170-186` 在写 `ConversationMessage` 之后，聚合本次 `LLMClient` 返回的 log dict + ReAct 循环里的 tool_calls/thoughts，写一条 `AgentCallLog(kind="chat")`。
- **注意 token 预算**：`input_text`/`output_text` 超过阈值（如 8KB）截断并标记 `…(truncated)`。
- **验收**：集成测试发起一次 chat，断言 `AgentCallLog` 有对应记录且字段非空；异常路径（`agent.py:166-168` error 事件）也写一条 `status=error`。

### 任务 0.5 工具调用与写操作执行埋点

- **动作**：
  - 只读工具：`agent_service.py` 的 `_tools_node`（`agent_service.py:756`）执行后，把工具名/入参/结果摘要/耗时收进本次会话的 tool_calls（最终随 0.4 的 chat log 一起入库，无需单独表）。
  - 写工具：`execute_write_tool`（`agent_service.py:586`）执行后单独写一条 `AgentCallLog(kind="tool_write")`，含 RBAC 校验结果、执行结果。
- **为什么**：现有 `record_event` 只记业务事件（`agent_service.py:395,422,425,450,469`），不记 AI 调用细节。
- **验收**：单测覆盖只读工具结果聚合 + 写工具 log 写入。

### 任务 0.6 新增会话管理接口（新建/删除/重命名/归档）

- **动作**：`backend/app/api/agent.py` 新增：
  - `POST /api/agent/conversations` → 新建空会话，返回 `{id, title:"新对话", archived:false}`。
  - `DELETE /api/agent/conversations/<id>` → 软删（`archived=true`），按 `user_id` 鉴权。
  - `PATCH /api/agent/conversations/<id>` → 改 `title`（`title_source="manual"`）/ 归档/取消归档。
  - `GET /api/agent/conversations` 补 `archived` 过滤参数 + 分页 + 按 `updated_at` 倒序。
- **鉴权**：均 `@require_auth` + `@require_role("recruiter","manager","admin")`，按 `user_id` 隔离（跨用户 403，复用 `agent.py:60-61` 模式）。
- **为什么**：现状会话只增不减、不可改名（`agent.py` 无 DELETE/rename），历史无限累积。
- **验收**：测试覆盖新建/删除/重命名/跨用户 403/归档过滤。

### 任务 0.7 `AgentCallLog` 查询接口

- **动作**：`backend/app/api/agent.py` 新增：
  - `GET /api/agent/call-logs` → 列表，支持 `conversation_id` / `status` / `kind` / 时间范围筛选 + 分页；管理员看全部、非管理员只看自己的。
  - `GET /api/agent/call-logs/<id>` → 详情（含完整 input/output/tool_calls/thoughts）；鉴权同上。
- **鉴权模式**：复用 `admin.py:101` 的 `audit-logs` 思路。
- **验收**：测试覆盖筛选/分页/跨用户隔离。

---

## 4. 阶段 1：历史会话不丢失 + 多轮上下文完整（P0，解决 A 类）

> 目标：前端能看/切/建/删历史会话，刷新不丢，多轮上下文带工具调用。

### 任务 1.1 前端 API 封装补齐

- **动作**：`frontend/src/lib/api.ts` 新增 agent 会话与 log 相关方法：`listConversations(params)`、`createConversation()`、`deleteConversation(id)`、`renameConversation(id, title)`、`archiveConversation(id, archived)`、`getConversation(id)`（已有逻辑迁出 `agentChat.tsx:139`）、`listCallLogs(params)`、`getCallLog(id)`。
- **为什么**：现状 `api.ts` 无 agent 会话封装（`api.ts:487` 只有 `getAdminAiArchitecture`），前端从未调列表接口。
- **验收**：`api.ts` 类型完整；`AgentPage` 改造前先迁好。

### 任务 1.2 会话侧边栏（左侧抽屉）

- **动作**：`frontend/src/pages/AgentPage.tsx` 左侧新增可折叠会话列表，数据来自 `listConversations`：
  - 每条：标题、最近更新时间、消息数；操作：点击切换、双击/菜单重命名、菜单删除（二次确认）、归档。
  - 顶部"+ 新建会话" → `createConversation()` → 切到新会话。
  - 空态引导"开始第一段对话"。
  - 当前会话高亮；流式生成中禁用切换或弹二次确认。
- **切换逻辑**：调 `getConversation(id)`（后端详情接口）刷新 `messages` + 写 localStorage `conversationId`。
- **为什么**：`AgentPage.tsx`（696 行）全文无侧边栏/列表/新建按钮，多会话对用户不可达。
- **验收**：能看历史列表、切换、新建、删除、重命名；切换后消息正确恢复。

### 任务 1.3 会话状态持久化增强

- **动作**：`frontend/src/lib/agentChat.tsx`：
  - `messages` 仍主存内存，但新增"会话级内存缓存"：切到某会话先从缓存读，无则后端拉。
  - localStorage 存"最近会话 id 列表"（而非单个），刷新后恢复列表 + 当前选中。
  - 修复 `agentChat.tsx:180-184`：读不到 conversationId 时不清空 messages，改为引导新建或选历史。
  - `loadConversationMessages`/`hydrateMessagesFromDb`（已 export，`agentChat.tsx:81`）接进侧边栏切换流程。
- **为什么**：现状 `messages` 不写 localStorage、只认单个 conversationId，清缓存/换浏览器即丢。
- **验收**：刷新页面后历史列表与当前会话均恢复；清 localStorage 后引导新建而非白屏。

### 任务 1.4 多轮上下文回传 tool_calls/thoughts

- **动作**：
  - 前端 `AgentPage.tsx:79-89` `buildHistory` 改为回传结构化 history：含上一轮 assistant 的 tool_calls 摘要 + thoughts 摘要（控 token，超长截断）。
  - 后端 `agent_service.py:867-868` 接收结构化 history，拼进 LLM messages（工具结果以 `tool` 角色或 system 摘要注入）。
  - token 预算：历史工具结果超长时只保留最近 N 轮 + 摘要。
- **为什么**：现状 history 只回传纯文本（`AgentPage.tsx:79-89`），DB 里的 tool_calls/thoughts（`agent.py:178-184`）不参与 LLM 上下文，导致重复调工具/上下文断裂。
- **验收**：多轮对话中 AI 能引用上一轮工具结果；token 用量可观测（从阶段 0 的 log 看）。

---

## 5. 阶段 2：AI 调用 log 审计面板（P0，解决 B 类可见性）

> 目标：让管理员/用户能看到 AI 调用记录与统计。

### 任务 2.1 前端 AI 审计面板（管理员）

- **动作**：在管理员区新增"AI 调用日志"页（或在 `AiArchitecturePage` 加 tab），数据来自 `listCallLogs`：
  - 列表：时间、用户、会话、模型、token、耗时、状态、工具调用数；支持筛选与分页。
  - 点击展开详情：完整 input/output/tool_calls/thoughts（复用 `components/agent/ThoughtTrace.tsx`、`ToolCallCard.tsx`）。
  - 统计卡：今日调用数、平均耗时、总 token、错误率、各工具调用频次（前端聚合或后端口子）。
- **为什么**：当前 `AiArchitecturePage` 只展示静态提示词/工具清单（`api.ts:487`），无运行时调用记录，无法审计排障。
- **验收**：管理员可见全部调用日志；非管理员只能看自己；详情可展开。

### 任务 2.2 用户自己的调用记录入口（可选，P0 收尾）

- **动作**：普通用户在 AI 助手页可看"我最近的 AI 调用"（精简版，只看自己），便于自查。
- **验收**：recruiter 只能看到自己的 log。

---

## 6. 后续阶段概览（本次 P0 不实施，先记录方向）

- **阶段 3 BOSS CLI 接入 AI 助手（P1）**：后端把 BOSS 只读/写工具注册进 `_TOOL_DEFS`/`_WRITE_TOOL_DEFS`（复用 `BossService`/`BossPipelineService`）；`AgentState` 加 `boss_account_id`；`/agent/chat` 接收账号参数；`BossService` 补 `cookies_header_for_account(user_id, account_id)`。前端 `AgentPage` 加 BOSS 账号选择器（复用 `api.bossAccounts()` + `BossAccountManager` 扫码逻辑）。
- **阶段 4 前端重设计（P1）**：三栏布局（会话列表 + 对话区 + 上下文面板）；空态能力云按分类展示；输入区 `/` 快捷指令 + `@` 引用候选人/岗位；写操作确认卡片用独立 proposalStore 修复快照脆弱问题（`AgentPage.tsx:233-241`）。
- **阶段 5 健壮性收尾（P2）**：限流按 user（`rate_limit.py:37`）；`web_search` 未配置降级提示；会话标题 LLM 异步生成；错误体可读提示。

---

## 7. 风险与应对

| 风险 | 等级 | 应对 |
|---|---|---|
| `AgentCallLog` 写入失败影响主流程 | 高 | log 写入失败只记 `logging.error`，不阻断 chat 返回；事务与主业务隔离 |
| log 表增长过快 | 中 | `input_text`/`output_text` 截断；后续可加 TTL 清理策略 |
| 多轮 history 回传工具结果 token 超限 | 中 | 只保留最近 N 轮 + 摘要；从阶段 0 log 观察 token 用量调参 |
| 前端会话侧边栏改动大、回归风险 | 中 | TDD + 分任务 review；先不改写操作确认逻辑（留阶段 4） |
| 迁移脚本在已有数据上失败 | 中 | 迁移脚本提供回滚；先在 dev 数据库验证 |

---

## 8. 文档同步计划

本计划落地将触及 AI 助手行为、接口字段、运行配置，须同步：
- `docs/01_PRD.md`：AI 助手章节补"会话管理 / 调用日志 / 审计面板"。
- `README.md` / `RUNNING.md`：试用账号下 AI 助手新能力说明。
- `DEPLOYMENT.md`：新增 `AgentCallLog` 表的迁移与存储说明。
- `docs/06_试点上线检查清单.md`：补"AI 调用日志可审计"检查项。

阶段 0-2 完成后统一更新（避免频繁改文档）。

---

## 9. 执行方式

采用 subagent-driven-development：
1. 按任务 0.1 → 0.7 → 1.1 → 1.2 → 1.3 → 1.4 → 2.1 → 2.2 顺序拆解（数据层先行，前端依赖后端接口）。
2. 每个任务：派 implementer 子 agent（TDD）→ spec 合规 review → 代码质量 review → 标记完成。
3. 全部完成后派最终 code reviewer 通审，再用 `finishing-a-development-branch` 收尾。
4. 分支策略：新建 `feat/ai-assistant-high-availability` 分支，不在 main 直接改。

---

## 附录 A：问题定位证据清单

### A 类 历史会话管理缺失

| 编号 | 问题 | 证据 |
|---|---|---|
| A1 | 前端无会话列表/切换/新建 UI | `AgentPage.tsx`（696 行）全文无侧边栏/列表/新建按钮；后端有 `GET /api/agent/conversations`（`agent.py:36-52`）但前端从未调用（全 `frontend/src` 仅 `agentChat.tsx:139` 命中按 id 取单条）；`api.ts` 无封装（仅 `getAdminAiArchitecture`，`api.ts:487`） |
| A2 | 切换/刷新后内存态丢失 | `messages` 仅 `useState`（`agentChat.tsx:122`）不写 localStorage；仅 `conversationId` 写 localStorage（`agentChat.tsx:18,98-108`）；恢复只读一个 id（`agentChat.tsx:168-188`），失败即清空（`agentChat.tsx:180-184`）；`loadConversationMessages`/`hydrateMessagesFromDb` 已 export 但无主动调用方 |
| A3 | 无删除/重命名，会话只增不减 | `agent.py`（5 接口）无 DELETE/rename（`agent.py:28-201`）；新建只在 chat 不带 id 时隐式创建（`agent.py:122-126`）；标题首条消息截断 30 字（`agent.py:199-201`）创建后不更新 |

### B 类 AI 调用日志缺失

| 编号 | 问题 | 证据 |
|---|---|---|
| B1 | 无任何 AI 调用日志 | `backend/app` 搜 `record_event("agent` / `record_event("ai.` / `llm_call` 零命中；`record_event` 仅业务事件（`agent_service.py:395,422,425,450,469`）；`LLMClient` 仅失败 `logging.warning`（`llm_client.py:261,291`）；后端自承待办（`agent_service.py:580`） |
| B2 | 多轮上下文丢工具/thoughts | 前端 `buildHistory` 只取纯文本（`AgentPage.tsx:79-89`）；后端用此拼 messages（`agent_service.py:867-868`）；DB 的 tool_calls/thoughts（`agent.py:178-184`）不参与 LLM 上下文 |

### C 类 功能简陋 + 健壮性（本次 P0 不修，记录备查）

| 编号 | 问题 | 证据 |
|---|---|---|
| C1 | BOSS CLI 闭环 AI 不可达 | `_TOOL_DEFS`/`_WRITE_TOOL_DEFS`（`agent_service.py:320,475`）无 BOSS 工具，全文件 grep `boss` 零命中；`BossPipelineService` 闭环仅前端可触发 |
| C2 | AI 不感知 BOSS 账号 | `AgentState` 只 `user_id/role`（`agent_service.py:609-619`）；`/agent/chat` 只接 `user_id/role`（`agent.py:131-132`）；`AgentPage` 无账号选择器。注：BOSS 多账号基础设施已就绪（`BossAccount` `models.py:318-335`、`BossService.list_accounts/activate_account` `boss_service.py:459-590`） |
| C3 | 前端工具元信息与后端不同步 | 后端 8 只读工具含 `web_search`（`agent_service.py:363-368`）；前端 `TOOL_META` 漏 `web_search`（`agent.ts:66-79`），fallback 英文原名 + wrench |
| C4 | 写操作确认逻辑脆弱 | `resolveProposal` 注释自述曾卡死（`AgentPage.tsx:233-236`），现读 `messages` 闭包快照（`AgentPage.tsx:237-241,294`），streaming 期间可能过期 |
| C5 | 限流按 IP 而非用户 | `rate_limit.py:37` `bucket_key=f"{name}:{_client_ip()}"`，未用 `g.user_id` |
| C6 | web_search 未配置即报错 | `_tool_web_search` 找不到 anysearch CLI 即 error（`agent_service.py:282-286`），无降级提示 |
