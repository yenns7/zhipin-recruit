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

## 2. Candidate 异步解析口径

`CandidateListView` 的页面说明要与当前实现保持一致：

- 上传简历后进入异步解析链路。
- 解析成功后会真实写入本地 rebuild 演示库。
- 当前对外文案可写为“写入本地 rebuild H2”，重点是**不再写成纯前端临时态或刷新即丢**。

## 3. Agent 相关口径

### 3.1 不应继续标成“未实现”的能力

以下两项在重构壳层里应按“已有演示能力”描述，不再写成未实现：

| 能力 | 当前口径 |
|---|---|
| 创建新会话 | 已有会话壳层，应按“可创建新的 demo conversation”描述 |
| AI 调用日志查询 | 已有管理员侧查询壳层，应按“可查看演示调用日志列表/详情”描述 |

### 3.2 仍需保留的限制

- 会话与调用日志当前仍是演示壳层口径，不应包装成生产级会话中心或完整 observability 平台。
- 即使有“创建新会话”“日志查询”，也不等于 AI 写操作已经成为真实自动执行链路。

## 4. Pipeline 修正与终态边界

### 4.1 `revert-lite`

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

### 4.2 `offer / onboarded / rejected`

当前重构壳层里，这三个阶段应明确写清边界：

| 阶段 | 当前可以说明什么 | 当前不能包装成什么 |
|---|---|---|
| `offer` | 候选人已进入 Offer 阶段记录 | 完整 Offer 审批流、薪资审批流 |
| `onboarded` | 候选人已进入已入职终态记录 | 完整入职办理、账号/设备/合同闭环 |
| `rejected` | 候选人已进入淘汰终态记录 | 完整拒绝原因治理、通知合规、申诉修正闭环 |

## 5. 推荐写法

- `管理员账号治理最小闭环已可联调`
- `候选人异步解析成功后会写入本地 rebuild 演示库`
- `创建新会话与 AI 调用日志查询已具备演示壳层`
- `revert-lite 仅作为 demo / legacy correction path`
- `Offer / Onboard / Reject 目前只代表重构壳层里的阶段记录边界`

## 6. 不推荐写法

- `AdminUsersView 只支持 list/toggle`
- `候选人解析结果还没真实入库`
- `创建新会话未实现`
- `AI 调用日志查询未实现`
- `revert-lite 可作为完整回滚引擎`
- `Offer / Onboard / Reject 已具备完整业务闭环`
