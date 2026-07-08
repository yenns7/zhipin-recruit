# Java Spring Boot + Vue 重构版 API 口径说明

> 日期：2026-07-07
> 目标：把当前重构壳层里“已经能用的最小接口”“仍是 demo-only 的边界”“不该再写成未实现的项”一次说清。

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
