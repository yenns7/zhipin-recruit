# Java Spring Boot + Vue 重构版 API 口径说明

> 日期：2026-07-08（更新）
> 目标：把当前重构壳层里”已经能用的最小接口””仍是 demo-only 的边界””不该再写成未实现的项”一次说清。
> 本轮 (2026-07-08) 新增 7 大模块约 51 个接口，覆盖招聘全流程关键路径。详见下方第 12 节。

## 1. Admin Users 最小契约

管理员用户治理页按下面这组最小 API 契约对齐：

| 方法 | 路径 | body | 说明 |
|---|---|---|---|
| `GET` | `/api/v1/admin/users` | - | 用户列表 |
| `POST` | `/api/v1/admin/users` | `{name,email,role,password,active}` | 创建试点账号 |
| `PATCH` | `/api/v1/admin/users/{userId}` | `{name,role,active}` | 编辑姓名、角色、启停状态 |
| `POST` | `/api/v1/admin/users/{userId}/reset-password` | `{newPassword}` | 重置密码 |

说明：

- `create / edit` 返回 admin user summary 时，前端直接刷新列表即可。
- `reset-password` 前端只显示成功提示，不展示密码明文。
- 该组接口属于 `demo-only` 账号治理壳层，不应写成“完整用户中心”。

## 2. Candidate 解析与入库口径

`CandidateListView` 的页面说明要与当前实现保持一致：

- 上传简历后会真实写入 Java rebuild PostgreSQL dev 数据库（当前为同步写入候选人记录，简历 JSON 暂以 `{}` 占位，尚未接真实异步解析链路）。
- “已解析候选人”指标当前等于已上传候选人数量，不代表简历内容已完成结构化解析；后续需补真实解析链路。
- 当前对外文案可写为“写入 Java rebuild PostgreSQL dev 数据库”，重点是**不再写成纯前端临时态或刷新即丢**。
- 候选人列表可调用 `POST /api/v1/pipeline/move` 将候选人加入岗位流程。

## 3. Pipeline 加入流程契约

候选人页“加入流程”使用现有流程推进接口：

| 方法 | 路径 | body | 说明 |
|---|---|---|---|
| `POST` | `/api/v1/pipeline/move` | `{candidateId,jobId,toStage}` | 将候选人加入或推进到指定阶段 |

试点默认动作：

```json
{
  "candidateId": 12,
  "jobId": 3,
  "toStage": "ai_screen"
}
```

前端成功提示必须说明：误推进后可去候选人流程看板查看历史并纠正。

## 4. Interview 契约与权限边界

### 4.1 安排面试

| 方法 | 路径 | body | 说明 |
|---|---|---|---|
| `POST` | `/api/v1/interviews/schedule` | `{candidateId,jobId,interviewerId}` | 创建面试草稿 |

权限：

- 仅 `recruiter / manager / admin` 可创建面试草稿。
- 返回 `{id,status}`，其中试点草稿状态为 `draft`。
- 当前前端使用 ID 输入；后续应升级为候选人、岗位、面试官的可搜索选择器。

### 4.2 面试官可见范围

`GET /api/v1/interviews` 的可见范围：

- `interviewer` 只返回本人 `interviewer_id` 的面试记录。
- `recruiter / manager / admin` 当前返回可管理范围内的面试记录；后续仍需补更细的岗位/团队范围过滤。

## 5. BI overview 统计范围

`GET /api/v1/bi/overview` 的当前口径：

| 角色 | activeJobs / candidateTotal / parsedCandidates 范围 |
|---|---|
| `recruiter` | 当前登录用户自己的 `owner_hr_id` 范围 |
| `manager` | 全局范围（demo 阶段未按团队细分） |
| `admin` | 全局范围（demo 阶段未按团队细分） |

说明：

- 招聘专员不能用全库总数，否则会出现“看得到但算不清”的试点偏差。
- 经理/管理员当前是 rule-based 全库汇总，尚未引入团队归属模型，不代表完整 BI 绩效体系；后续需补 `team_id` / `reports_to` 才能真正按团队细分。

## 6. Agent 相关口径

### 6.1 不应继续标成“未实现”的能力

以下两项在重构壳层里应按“已有演示能力”描述，不再写成未实现：

| 能力 | 当前口径 |
|---|---|
| 会话列表/详情 | 已有会话壳层，应按“可查看 demo conversation”描述 |
| 发送消息 | 已有 confirm-first demo 消息接口，写意图只返回确认卡 |

### 6.2 仍需保留的限制

- 会话当前仍是进程内存态，不是持久化会话中心，不应包装成生产级会话中心或完整 observability 平台。
- 即使有 confirm-first 确认卡，也不执行真实写操作，不等于 AI 写操作已经成为真实自动执行链路。
- 写意图只生成确认卡，并继续受当前账号权限约束。
- 面试官角色当前没有 AI 助手入口。

## 7. Pipeline 修正与终态边界

### 7.1 `revert-lite`

`revert-lite` 更适合被描述为：

> demo / legacy correction path

它用于：

- 演示环境里的轻量纠偏
- 历史样例数据修正
- 误推进后的最小回退说明

它不应被描述为：

- 任意节点都可靠的生产级撤回引擎
- 完整审批回滚系统
- 对 Offer、入职、淘汰等业务后果的全量逆操作保障

### 7.2 `offer / onboarded / rejected`

当前重构壳层里，这三个阶段应明确写清边界：

| 阶段 | 当前可以说明什么 | 当前不能包装成什么 |
|---|---|---|
| `offer` | 候选人已进入 Offer 阶段记录 | 完整 Offer 审批流、薪资审批流 |
| `onboarded` | 候选人已进入已入职终态记录 | 完整入职办理、账号/设备/合同闭环 |
| `rejected` | 候选人已进入淘汰终态记录 | 完整拒绝原因治理、通知合规、申诉修正闭环 |

## 8. 集成 demo 口径

- 当前集成壳层是非真实第三方授权，不代表 BOSS/猎聘/邮箱/日历已经完成在线授权。
- `V5__integration_persistence.sql` 只保留 `integration_accounts`、`integration_crawl_tasks` 等本地表结构说明。
- 对外只能描述为“写本地扩展上下文表”的目标口径；当前 Java `IntegrationDemoService` 仍是 demo / in-memory 快照。

## 9. 真实试点配置与健康检查口径

### 9.1 `pilot` profile

真实用户小范围试点使用 `pilot` profile，不使用 `dev` profile。`pilot` 启动前校验：

- `JWT_SECRET` 不能是默认弱值。
- `DATABASE_PASSWORD` 不能是 `hipass`。
- `CORS_ALLOWED_ORIGINS` 不能是 `*`。
- `PUBLIC_REGISTRATION_ENABLED=false`。
- `UPLOAD_FOLDER` 不能位于 `/tmp`。
- 数据库中不能残留 `demo.*@hireinsight.local` 账号。

### 9.2 公开注册

`POST /api/v1/auth/register` 受 `app.auth.public-registration-enabled` 控制：

- 本地演示默认允许注册 recruiter。
- 真实试点关闭后返回 `403`，提示 `Public registration disabled`。
- 真实账号由管理员在用户治理页创建。

### 9.3 健康检查

`GET /api/v1/health` 返回：

- `status`: `UP` 或 `DOWN`
- `database`: `UP` 或 `DOWN`
- `service`: `hireinsight-api`
- `version`
- `checkedAt`

数据库不可用时返回 HTTP `503`，用于试点期间快速区分“前端能打开但后端/数据库不可用”的问题。

## 10. 推荐写法

- `管理员账号治理最小闭环已可联调`
- `候选人上传后会写入 Java rebuild PostgreSQL dev 数据库（当前同步写入，简历 JSON 暂为占位，尚未接真实解析链路）`
- `候选人可从列表加入岗位流程，误推进可到流程看板纠正`
- `招聘专员、负责人、管理员可安排面试草稿；面试官只看本人面试`
- `BI overview 对招聘专员使用 owner_hr_id 范围，对负责人/管理员当前使用全局范围（demo 阶段未按团队细分）`
- `真实试点使用 pilot profile，dev demo 账号只用于本地演示`
- `健康检查会返回数据库状态，数据库不可用时返回 503`
- `AI 助手会话列表/详情/消息发送已具备 confirm-first 演示壳层`
- `revert-lite 仅作为 demo / legacy correction path`
- `Offer / Onboard / Reject 目前只代表重构壳层里的阶段记录边界`
- `集成账号与抓取任务只是非真实第三方 demo 壳层`

## 11. 不推荐写法

- `AdminUsersView 只支持 list/toggle`
- `候选人解析结果还没真实入库`
- `招聘专员看到的是全公司 BI 总数`
- `面试官可以看到所有候选人的面试`
- `真实试点继续使用 demo.* 固定密码账号`
- `health 只要返回 UP 就代表数据库正常`
- `AI 助手已经具备生产级会话中心`
- `AI 写操作会自动真实执行`
- `revert-lite 可作为完整回滚引擎`
- `Offer / Onboard / Reject 已具备完整业务闭环`
- `第三方集成已经真实授权打通`

## 12. 新增模块（2026-07-08 1:1 功能复现）

本轮大规模 1:1 功能复现新增以下模块（后端 129 测试全绿 / 前端 79 测试全绿）：

### 12.1 RecruitmentDemand（7 接口 + Flyway V10）

| 方法 | 路径 | body/说明 |
|---|---|---|
| `GET` | `/api/v1/demands` | 需求列表（支持分页/筛选） |
| `POST` | `/api/v1/demands` | `{title,description,jobId,priority,reason}` - 创建需求 |
| `GET` | `/api/v1/demands/{id}` | 需求详情 |
| `PATCH` | `/api/v1/demands/{id}` | `{title,description,jobId,priority}` - 更新需求 |
| `POST` | `/api/v1/demands/{id}/close` | 关闭需求（body: `{reason}`） |
| `POST` | `/api/v1/demands/{id}/restore` | 恢复需求（body: `{reason}`） |
| `POST` | `/api/v1/demands/{id}/downgrade` | 降级优先级（body: `{priority,reason}`） |

### 12.2 Match 匹配（3 接口 + 新包 `com.hireinsight.match`）

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/v1/match` | 通用匹配：按候选人/岗位计算匹配度 |
| `GET` | `/api/v1/match/jobs/{jobId}/preview` | 岗位匹配预览：返回候选人与该岗位的匹配排名 |
| `POST` | `/api/v1/match/jobs/{jobId}/match` | 匹配并加入流程：选定候选人直接进入岗位流程 |

### 12.3 AI Interview（5 接口 + Flyway V11 + `InterviewAIService`）

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/v1/interviews/start` | 开始面试：为候选人+岗位创建面试会话，返回题目列表 |
| `POST` | `/api/v1/interviews/submit` | 提交面试作答：候选人回答后生成评估报告 |
| `GET` | `/api/v1/interviews/guide` | 面试引导：返回按 JD 定制的结构化面试题目模板 |
| `GET` | `/api/v1/interviews/interviewers` | 面试官列表：返回可选面试官 |
| `GET` | `/api/v1/interviews/assignments` | 面试任务分配列表 |

### 12.4 Agent 调用日志 + Tools（7 接口 + Flyway V12）

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/v1/agent/call-logs` | 调用日志列表（支持分页/筛选/管理员看全部） |
| `GET` | `/api/v1/agent/call-logs/{id}` | 调用日志详情：输入输出/模型/token/耗时/工具链 |
| `GET` | `/api/v1/agent/tools` | Tools 列表：系统支持的 Agent 工具清单 |
| `POST` | `/api/v1/agent/execute` | 执行工具：触发指定工具并返回结果 |
| `POST` | `/api/v1/agent/conversations` | 创建会话（会话 data 暂存进程内存） |
| `PATCH` | `/api/v1/agent/conversations/{id}` | 更新会话（重命名等） |
| `DELETE` | `/api/v1/agent/conversations/{id}` | 删除/归档会话 |

### 12.5 BOSS 直聘 Demo Stub（17 接口 + `com.hireinsight.boss` + `BossDemoService`）

所有接口返回 in-memory 静态样例数据，不代表真实 BOSS 集成。

| 方向 | 接口数 | 说明 |
|---|---|---|
| 账号与认证 | 3 | 登录/状态/账号管理 |
| 岗位操作 | 4 | 列表/详情/创建/更新 |
| 候选人操作 | 4 | 搜索/详情/沟通/收藏 |
| 收件箱与消息 | 3 | 收件箱/发送消息/消息列表 |
| 面试与导出 | 3 | 邀请面试/确认面试/导出候选人 |

### 12.6 Job 生命周期 + Candidate 归属（10 接口）

| 方法 | 路径 | 说明 |
|---|---|---|
| `PUT` | `/api/v1/jobs/{id}` | 更新岗位基本信息 |
| `POST` | `/api/v1/jobs/{id}/close` | 关闭岗位 |
| `POST` | `/api/v1/jobs/{id}/restore` | 恢复岗位 |
| `GET` | `/api/v1/candidates/{id}/owner-options` | 候选人负责人可选列表 |
| `GET` | `/api/v1/candidates/{id}/pipelines` | 候选人在各岗位的流程状态 |
| `GET` | `/api/v1/candidates/{id}/journey` | 候选人流转轨迹 |
| `POST` | `/api/v1/candidates/{id}/reassign` | 转派候选人负责人 |
| `PATCH` | `/api/v1/talent-map/companies/{id}` | 更新人才地图公司信息 |
| `GET` | `/api/v1/pipeline/offer/{pipelineId}` | 获取 Offer 信息 |
| `PUT` | `/api/v1/pipeline/offer/{pipelineId}` | 更新 Offer 信息 |
| `GET` | `/api/v1/notifications/unread-count` | 未读通知数 |

### 12.7 BI 深度复现（2 接口）

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/v1/bi/staff/{hrId}` | HR 归因分析：该 HR 负责候选人的阶段分布/推进统计 |
| `GET` | `/api/v1/bi/job/{jobId}` | 岗位漏斗：该岗位各阶段候选人数量/转化率 |

### 12.8 各模块持久化状态

| 模块 | 持久化 | 说明 |
|---|---|---|
| RecruitmentDemand | ✅ Flyway V10 | `recruitment_demand` 表 |
| Match | ❌ demo 数据 | 算法已移植，数据为本地样例 |
| AI Interview | ✅ 实体 + ❌ 评估 | `interview_session` 表已建，评估为 rule-based |
| Agent Call Logs | ✅ Flyway V12 | `agent_call_logs` 表 |
| Agent 会话 | ❌ 进程内存 | `ConcurrentHashMap`，重启丢失 |
| BOSS 直聘 | ❌ in-memory | `BossDemoService` 静态样例 |
| BI 深度复现 | ⚡ JPA 聚合 | rule-based，非真实数仓 |
