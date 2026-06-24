# HireInsight 关键功能补全 PRD（四角色全量盘点）

- **文档状态**：已实现（M1–M5 全部交付，2026-06-15）
- **日期**：2026-06-15
- **分支**：`feat/pipeline-stage-management`
- **作者**：研发
- **关联记忆**：后端 API 契约见 `hireinsight-api`，项目状态见 `hireinsight-state`

---

## 1. 背景与目标

HireInsight 是一套 HR / 经理面向的 AI 招聘系统，已跑通主链路：上传简历 → AI 解析打标 → 岗位 JD 结构化 → 智能匹配 → AI 预筛面试。但一次完整的"招聘业务流转"远不止这条链路。本次走查从四个角色（招聘专员 recruiter、面试官 interviewer、经理 manager、管理员 admin）各自的工位出发，逐页走完真实工作流，发现**状态流转、面试闭环、团队治理**三大类关键功能缺失，导致业务无法正常流转。

最初的用户诉求很具体：**"没有给候选人更改状态栏的地方"**——候选人通过了初筛、一面、二面，招聘流程管理里却无法推进。这是冰山一角。本 PRD 在解决该诉求的同时，系统性盘点全部缺口并排定优先级。

### 目标

1. 让候选人能在招聘流程中按**真实面试轮次**（初筛 / 一面 / 二面 / 终面）流转，且每次状态变更可追溯（谁、何时、为何）。
2. 打通 **AI 面试 / 面试官评分 → 流程状态**的闭环，结果不再各自孤立。
3. 补齐**团队治理**：关闭开放注册的安全漏洞，提供管理员的用户管理能力。
4. 让每个角色在自己的工位上都能完成本职工作的闭环。

### 非目标（本期不做）

- 候选人 C 端自助投递 / 自助作答门户（当前 AI 面试为 HR 代录，维持现状）。
- 邮件 / 短信 / 日历集成（面试邀约通知）。
- 多租户 / 企业隔离。
- 简历解析与匹配算法本身的优化（已有，且非本次痛点）。

---

## 2. 现状走查（四角色视角）

### 2.1 招聘专员 recruiter

可达页面：工作台、AI 助手、候选人、简历上传、岗位管理、招聘流程、AI 面试。

- ✅ 能上传简历、建岗位、跑匹配、在匹配页"加入流程"（M0 已补）、在看板就地改阶段（M0 已补）。
- ❌ **AI 面试与流程脱节**：在「AI 面试」跑完一次预筛、拿到通过建议后，候选人在招聘流程里的阶段**不会**因此变化，需要手动再去看板改——两套动作互不感知。
- ❌ **面试记录是孤儿**：`/interviews/:id` 报告页存在且有路由，但**没有任何入口能列出历史面试**并点进去。跑完一次面试、离开页面，报告就再也找不到了。
- ❌ 流程阶段只有一个笼统的"面试"，无法区分初筛 / 一面 / 二面 / 终面。

### 2.2 面试官 interviewer

可达页面：工作台、AI 助手、候选人、招聘流程、面试报告（仅当有 id）。

- ❌ **几乎是空角色**：导航里没有「AI 面试」(仅 recruiter 可见)，没有专属的面试工作台。
- ❌ **无法记录面试评价**：面试官的核心职责是面完一面/二面后给评分和评语，但系统里**没有任何录入评分反馈的地方**。他能在看板把候选人从"一面"拖到"二面"，却无法说明"为什么通过"。
- ❌ 看不到"分配给我面试的候选人"清单。

### 2.3 经理 manager

可达页面：全部 + 数据看板 BI。

- ✅ BI 漏斗与专员效能可用（漏斗重复计数 bug 已在 M0 修复）。
- ❌ **无法钻取单个候选人的旅程**：只能看聚合漏斗，点不进"某候选人在某岗位经历了哪些阶段、被谁推进、面试得分多少"。
- ❌ **无法转派候选人**：候选人 owner 固定为上传者，专员离职 / 调岗时无法移交。

### 2.4 管理员 admin

可达页面：全部。

- ❌ **完全没有用户 / 团队管理界面**：无法查看成员列表、改角色、停用账号。admin 这个角色除了能看 BI，和 manager 没有实质区别。
- 🔴 **安全漏洞：开放注册 + 可自选 admin 角色**。`POST /auth/register` 无鉴权，且 `role` 由请求体自带——任何人都能注册成 `admin` 接管系统。这是必须立刻堵的洞。

### 2.5 跨角色 / 数据层

- ❌ 阶段枚举 `interview` 是单值，无法表达多轮面试（本 PRD 核心）。
- ❌ 阶段变更无 `note`/原因字段，流转不可解释。
- ✅（M0 已修）`PipelineStage` 是 append-only 流水，旧逻辑按全部历史行分组导致漏斗/看板重复计数；已改为按 (candidate, job) 最新行去重。

---

## 3. 缺口清单与优先级

优先级定义：**P0** = 业务无法流转 / 安全，必须本期做；**P1** = 显著影响体验，本期尽量做；**P2** = 增强，可进 backlog。

| # | 缺口 | 角色 | 优先级 | 所属模块 | 状态 |
|---|------|------|--------|----------|------|
| G1 | 流程阶段无法表达多轮面试（初筛/一面/二面/终面） | recruiter, interviewer | P0 | M1 | ✅ 已实现 |
| G2 | 阶段变更无原因/备注，不可追溯 | 全部 | P0 | M1 | ✅ 已实现 |
| G3 | AI 面试结果不回写流程阶段 | recruiter | P0 | M2 | ✅ 已实现 |
| G4 | 面试官无法录入评分/评语（scorecard） | interviewer | P0 | M2 | ✅ 已实现 |
| G5 | 面试记录无列表入口，报告页是孤儿 | recruiter, interviewer | P0 | M2 | ✅ 已实现 |
| G6 | 开放注册 + 可自选 admin 角色（安全漏洞） | admin | P0(安全) | M3 | ✅ 已实现 |
| G7 | 无用户/团队管理界面 | admin | P0 | M3 | ✅ 已实现 |
| G8 | 候选人档案不显示其在各岗位的当前阶段/时间线 | 全部 | P1 | M4 | ✅ 已实现 |
| G9 | 经理无法钻取单候选人旅程 | manager | P1 | M5 | ✅ 已实现 |
| G10 | 候选人无法在专员间转派 | manager, admin | P2 | M5 | ✅ 已实现 |

> **M0（已实现，本分支已提交）**：修复当前阶段去重计数；新增 `/pipeline/<job>/board` 与 `/history`；看板改为按候选人卡片就地改状态；匹配页"加入流程"。M0 已经交付了 G 列表之外的基础设施，后续模块在其上叠加。

> **交付状态（2026-06-15）**：G1–G10 全部实现。Batch 1（M1/M2/M3，P0）+ Batch 2（M4/M5，P1/P2）均已合入本分支。后端 24 个 pytest 全绿，前端 tsc + 生产构建通过。剩余 backlog（非 PRD 缺口）：面试官显式指派、邮件/日历通知 —— 属第 2 节列出的"非目标"。

---

（续下一节：功能需求详述）

## 4. 功能需求详述

### M1 — 多轮次招聘流程流转（P0，含用户最初诉求）

**方案（评审已定）**：扩充阶段枚举承载轮次，而非引入独立"轮次"实体。新阶段序列：

```
pending(待筛选) → ai_screen(AI初筛) → interview_first(一面)
  → interview_second(二面) → interview_final(终面)
  → offer(Offer) → onboarded(已入职)        [终态]
                                rejected(淘汰) [终态，可从任意阶段进入]
```

> 取舍说明：相比"粗阶段 + 独立轮次表"，枚举展开改动最小、看板列即轮次、心智直观；代价是轮次固定（所有岗位同一套）。本期岗位差异不大，固定轮次可接受；若未来需要每岗位自定义轮次，再演进为独立轮次表（届时阶段枚举仍兼容）。

**需求**：

- **R1.1** `VALID_STAGES` 扩充为上述 8 值。`STAGE_ORDER`（主序列，不含 rejected）相应更新为：`pending, ai_screen, interview_first, interview_second, interview_final, offer, onboarded`。
- **R1.2** **数据迁移**：存量 `interview` 行一律改写为 `interview_first`（一面）。提供一次性迁移脚本，幂等可重跑。种子库 `hireinsight.db` 同步迁移。
- **R1.3** 看板（`PipelinePage`）按新阶段渲染列；列过多时支持横向滚动。阶段配色 / 标签集中在 `lib/pipelineStages.ts`（M0 已建），仅需扩充条目。
- **R1.4** "一键推进"逻辑（`CandidateCard` 的 `FORWARD` 映射）按新序列更新：一面→二面→终面→Offer→入职。
- **R1.5** **每次阶段变更可附原因/备注**（解决 G2）：`/pipeline/move` 接受可选 `note` 字段，写入 `PipelineStage.note`；`history` 时间线展示备注。看板改状态时弹出可选备注输入（留空允许）。
- **R1.6** 候选人时间线（`/history`，M0 已建）展示完整轮次流转，含每步 stage、时间、操作人、备注。

**验收**：看板出现"一面/二面/终面"三列；把候选人从一面推进到二面并填写备注后，时间线按序显示两条记录且含备注；旧 `interview` 数据在迁移后显示为"一面"。

---

### M2 — 面试闭环 + 面试官评分（P0）

打通"面试动作 → 流程状态 + 评价沉淀"，并让面试记录可追溯。

**需求**：

- **R2.1 AI 面试结果回写流程（G3）**：`/interview/submit` 生成报告后，把候选人在该 (candidate, job) 的流程阶段按结果推进，并写入 `PipelineStage`（updated_by = 当前 HR，note 记"AI 预筛通过/未通过，均分 X"）。明确规则：
  - **通过**（`pass_recommended=true`）：目标阶段 = `interview_first`（AI 预筛即 ai_screen 环节，通过即进入一面）。若当前阶段已 ≥ interview_first，则不回退、不重复写。
  - **不通过**：目标阶段 = `rejected`。
  - 候选人尚未加入本岗位流程时，先补一条 `ai_screen` 入流程，再按上述规则推进（确保时间线完整：ai_screen → interview_first / rejected）。
- **R2.2 面试官评分卡 scorecard（G4）**：新增「面试反馈」录入。面试官针对某 (candidate, job, round) 提交：综合评分（1-5）、是否通过、评语（优势/顾虑/备注）。一轮可由多位面试官分别评。
- **R2.3** 面试反馈与流程联动：面试官提交"通过"评分后，可一键将候选人推进到下一轮（沿用 M1 的 move + note）。
- **R2.4 面试记录列表（G5）**：修复 `/interviews/:id` 报告页的孤儿状态——目前没有任何入口能列出历史面试。**路由调整**：现有发起页（`InterviewsPage`，配置→录入→报告流程）从 `/interviews` 迁到 `/interviews/new`；`/interviews` 改为**面试记录列表页**。列表展示历史 AI 面试 + 面试官反馈，点击进入既有 `/interviews/:id` 报告页。导航「AI 面试」指向 `/interviews`（列表），列表页提供"发起新面试"按钮跳 `/interviews/new`。需新增后端"列出面试记录"端点（按角色过滤：recruiter 看自己发起的，interviewer 看分配给自己的，manager/admin 看全部）。
- **R2.5 面试官工作台（部分 G4）**：interviewer 角色导航新增「我的面试」，展示分配/待评的候选人（来源：处于 interview_* 阶段的候选人）。本期"分配"可简化为"所有处于面试阶段的候选人对所有面试官可见"，不引入显式指派（指派列为 P2）。

**验收**：AI 面试提交"通过"后，候选人在流程里自动从 AI初筛 进到 一面；面试官能对其录入一面评分与评语并推进到二面；`/interviews` 能列出这两条记录并点进报告。

---

### M3 — 用户/团队管理 + 注册安全（P0，含安全漏洞）

**需求**：

- **R3.1 堵注册漏洞（G6，最高优先）**：
  - `POST /auth/register` 不再接受请求体自带的 `role` 直接落库为特权角色。两选一（评审定）：(a) 注册一律固定为 `recruiter`，特权角色只能由 admin 在后台分配；(b) 注册需携带有效邀请码 / 由 admin 创建账号。**推荐 (a)**，改动小且安全。
  - 首个 admin 通过种子 / 一次性 bootstrap 脚本创建，不经开放注册。
- **R3.2 用户管理界面（G7）**：admin 专属页面 `/admin/users`，展示成员列表（姓名、邮箱、角色、创建时间），支持：改角色、停用/启用账号。
- **R3.3** 后端用户管理端点：列出用户、改角色、停用（均 admin-only，复用 `require_role("admin")`）。停用通过 `User` 增 `is_active` 字段，登录时校验。
- **R3.4** 审计：角色变更 / 停用写入既有 `Event` 或 `AuditLog` 表。

**验收**：用普通信息注册得到的账号一定是 recruiter，无法自封 admin；admin 能在 `/admin/users` 把某 recruiter 提为 manager，被停用账号无法登录。

---

### M4 — 候选人档案状态上下文（P1）

**需求**：

- **R4.1** 候选人档案页（`CandidateProfilePage`）新增"招聘进展"区块：展示该候选人在**各个岗位**的当前阶段（一个候选人可能同时在多个岗位流程中）。
- **R4.2** 每个岗位条目可展开看该岗位下的阶段时间线（复用 M0 的 `/history`）。
- **R4.3** 需后端按候选人聚合其所有 (job, current_stage) 的端点，或前端聚合（择简）。

**验收**：打开一个已进入两个岗位流程的候选人档案，能看到两条岗位进展及各自当前阶段。

---

### M5 — 经理钻取与转派（P1 / P2）

**需求**：

- **R5.1 单候选人旅程钻取（G9，P1）**：经理 / admin 从 BI 或候选人档案，能查看某候选人在某岗位的完整旅程（阶段时间线 + AI 面试得分 + 面试官评分），一页聚合。多数数据已有（history + interviews + feedback），主要是聚合展示。
- **R5.2 候选人转派（G10，P2）**：admin / manager 可改候选人 `owner_hr_id`，把候选人移交给另一专员；操作写审计。本期列为 backlog，不在 P0/P1 实现。

**验收（R5.1）**：经理点开某候选人在某岗位的旅程，一屏看到阶段流转、AI 均分、各面试官评分。

---

## 5. 数据模型变更

### 5.1 `VALID_STAGES`（修改，M1）

```python
VALID_STAGES = {
    "pending", "ai_screen",
    "interview_first", "interview_second", "interview_final",
    "offer", "onboarded", "rejected",
}
STAGE_ORDER = ["pending", "ai_screen", "interview_first",
               "interview_second", "interview_final", "offer", "onboarded"]
```

迁移：`UPDATE pipeline_stages SET stage='interview_first' WHERE stage='interview'`。脚本幂等（再跑无 `interview` 行则 0 改动）。BI 前端 `FUNNEL_STAGES` 同步扩充。

### 5.2 `PipelineStage`（增字段，M1-G2）

```python
note = db.Column(db.Text)   # 本次阶段变更的原因/备注，可空
```

### 5.3 `InterviewFeedback`（新表，M2-G4）

面试官评分卡。与 AI `Interview`（HR 代录的预筛）分开，因为这是人工面试评价。

```python
class InterviewFeedback(db.Model):
    __tablename__ = "interview_feedback"
    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"), nullable=False)
    round = db.Column(db.String(30), nullable=False)  # interview_first/second/final
    interviewer_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    score = db.Column(db.Integer)        # 1-5 综合评分
    passed = db.Column(db.Boolean)       # 是否建议通过
    strengths = db.Column(db.Text)       # 优势
    concerns = db.Column(db.Text)        # 顾虑
    note = db.Column(db.Text)            # 其他备注
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
```

### 5.4 `User`（增字段，M3-G7）

```python
is_active = db.Column(db.Boolean, default=True, nullable=False)  # 停用账号无法登录
```

---

## 6. API 变更

新增/修改端点（沿用现有 `/api` 前缀、Bearer JWT、`require_auth`/`require_role`）：

**Pipeline（M1）**
- `POST /pipeline/move`：请求体新增可选 `note`；阶段枚举改用新值。

**Interview（M2）**
- `POST /interview/submit`（修改）：评估后按 `pass_recommended` 回写流程阶段。
- `GET /interviews`（新增）：列出面试记录，按角色过滤。返回 `[{id, candidate_id, name_masked, job_id, job_title, type:'ai'|'feedback', score, pass, round?, created_at}]`。
- `POST /interview/feedback`（新增）：`{candidate_id, job_id, round, score, passed, strengths, concerns, note}` → 写 `InterviewFeedback`。interviewer/recruiter/manager/admin 可写。
- `GET /interview/feedback?candidate_id=&job_id=`（新增）：列出某候选人某岗位的面试官评分。

**Auth / Users（M3）**
- `POST /auth/register`（修改）：忽略请求体 `role`，强制 `recruiter`。
- `GET /admin/users`（新增，admin-only）：成员列表。
- `PATCH /admin/users/<id>`（新增，admin-only）：`{role?, is_active?}` 改角色/停用。
- `POST /auth/login`（修改）：拒绝 `is_active=false` 账号。

**Candidate journey（M4/M5）**
- `GET /candidates/<id>/pipelines`（新增）：该候选人在各岗位的当前阶段 `[{job_id, job_title, stage}]`。
- `GET /candidates/<id>/journey?job_id=`（新增，R5.1）：聚合阶段时间线 + AI 面试得分 + 面试官评分。

---

## 7. 权限矩阵（功能 × 角色）

| 功能 | recruiter | interviewer | manager | admin |
|------|:--:|:--:|:--:|:--:|
| 上传简历 / 建岗位 / 匹配 | ✅ | ❌ | ✅ | ✅ |
| 招聘流程看板 + 改阶段 | ✅ | ✅ | ✅ | ✅ |
| 发起 AI 面试 | ✅ | ❌ | ✅ | ✅ |
| 录入面试官评分（scorecard） | ✅ | ✅ | ✅ | ✅ |
| 面试记录列表 | 自己发起 | 分配/面试阶段 | 全部 | 全部 |
| 数据看板 BI | 仅本人效能 | ❌ | ✅ | ✅ |
| 单候选人旅程钻取 | 自己候选人 | ❌ | ✅ | ✅ |
| 用户/团队管理 | ❌ | ❌ | ❌ | ✅ |
| 候选人转派（P2） | ❌ | ❌ | ✅ | ✅ |

---

## 8. 验收标准（汇总，P0 必过）

1. **M1**：看板呈现 待筛选/AI初筛/一面/二面/终面/Offer/已入职/淘汰 列；候选人可从一面推进到二面并附备注；时间线含备注；旧 `interview` 数据迁移为"一面"。
2. **M2**：AI 面试提交"通过"→ 候选人在流程里自动进下一阶段；面试官能对其录入评分并推进；`/interviews` 列出 AI 面试 + 面试官反馈并可点进报告。
3. **M3**：普通注册只能得到 recruiter，无法自封 admin；admin 能改他人角色、停用账号；被停用账号登录被拒。
4. 全部改动后端启动无错、前端 `tsc --noEmit` 通过；种子库迁移后既有演示数据正常显示。

---

## 9. 分批实施建议

- **第 1 批（P0，本分支 `feat/pipeline-stage-management` 续作）**：M1 + M2 + M3。这三块解决"业务无法流转"和安全漏洞，含用户最初的状态栏诉求。建议拆成 3 个连续的实现计划（plan），各自独立验收。
- **第 2 批（P1）**：M4（候选人档案状态上下文）+ M5.1（经理旅程钻取）。依赖第 1 批的数据（轮次、面试反馈）就位。
- **Backlog（P2）**：M5.2 候选人转派、面试官显式指派、邮件通知。

> 每个 plan 进入实现前，按 `writing-plans` 拆解为带验收点的步骤；M3 的安全修复（R3.1）应作为第 1 批的第一个 plan 优先合入。
