# Java Spring Boot + Vue 重构版口径修正 PRD

> 日期：2026-07-07
> 目标：把前端页面、README 与说明文档里最容易误导协作者的几处口径收口到同一套事实。

## 1. 这次要修正的四处不一致

1. `AdminUsersView` 不能再被写成只有 `list / toggle`。
2. `CandidateListView` 不能再写“异步解析还没真实入库”。
3. API 文档不能再把“创建新会话”“AI 调用日志查询”标成未实现。
4. `revert-lite`、`Offer / Onboard / Reject` 的 demo-only 边界要写清楚。

## 2. 目标口径

### 2.1 Admin Users

管理员用户治理页的最小闭环口径统一为：

- 可列出账号
- 可创建试点账号
- 可编辑姓名 / 角色 / 启停状态
- 可重置密码
- 但它仍是 `demo-only` 账号治理壳层，不是完整 IAM

### 2.2 Candidate List

候选人列表页统一为：

- 上传后进入异步解析
- 解析成功后真实写入本地 rebuild 演示库
- 页面不再暗示“只在前端临时显示”

### 2.3 Agent

Agent 口径统一为：

- “创建新会话”属于已存在的会话壳层能力
- “AI 调用日志查询”属于已存在的管理员审计壳层能力
- 但两者都仍是演示壳层，不等于生产级会话中心与可观测平台

### 2.4 Pipeline 边界

- `revert-lite` 写成 demo / legacy correction path
- `offer / onboarded / rejected` 写成当前重构壳层里的阶段记录边界
- 不再把它们包装成完整 Offer 审批、入职办理、淘汰治理闭环

## 3. 非目标

- 不新增后端接口
- 不把 demo 壳层升级为完整账号中心
- 不把 Agent 演示壳层升级为生产 observability
- 不承诺完整 Offer / Onboard / Reject 业务治理已经完成

## 4. 推荐对外表述

- `管理员用户治理最小闭环已可联调`
- `候选人异步解析成功后会真实写入本地 rebuild 演示库`
- `创建新会话与 AI 调用日志查询已具备演示壳层`
- `revert-lite 仅用于 demo / legacy correction`
- `Offer / Onboard / Reject 当前只表示阶段记录边界`

## 5. 验收标准

- 页面文案、README 与说明文档不再互相打架。
- 前端测试覆盖 Admin Users create / edit / reset-password 与 CandidateList 新说明文案。
- 文档里不再出现“创建新会话未实现”“AI 调用日志查询未实现”这类旧表述。
