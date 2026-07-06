# Java Spring Boot + Vue 重构版 API 口径说明

> 日期：2026-07-06
> 目标：按接口和落库事实说明“哪些数据已持久化到本地 H2，哪些仍是 demo / in-memory / rule-based”。

## 1. 数据源总则

- 默认运行数据源：`jdbc:h2:file:./data/hireinsight-demo`
- `dev` profile：`jdbc:h2:file:./data/hireinsight-demo-dev`
- `test` profile：`jdbc:h2:mem:testdb`

因此，**开发默认态不是纯内存库**；只有测试态才是 H2 memory。

## 2. 已落本地 H2 的接口/能力

| 接口 / 能力 | 当前事实 | 备注 |
|---|---|---|
| `POST /api/auth/login` / demo 会话 | 登录关联 `users`、`demo_auth_sessions` 本地落库 | 本地演示登录，不代表生产 SSO |
| `GET /api/v1/admin/system/overview` | 读取本地治理参数表与模型表 | 非真实配置中心 |
| `GET /api/v1/admin/system/audit-logs` | 读取本地治理审计表 | 仅演示审计壳层 |
| `POST /api/v1/admin/system/parameters/{key}/toggle` | 写本地治理参数表并追加本地审计日志 | 非生产治理动作 |
| `POST /api/v1/admin/system/models/{id}/toggle-status` | 写本地模型表并追加本地审计日志 | 不落真实供应商密钥 |
| `POST /api/v1/notifications/todos/{todoId}/complete` | 写 `notification_todo_status_overrides` | 待办内容本身仍是演示生成 |
| `POST /api/v1/notifications/todos/{todoId}/archive` | 写 `notification_todo_status_overrides` | 刷新服务后不会因为前端重载而丢状态 |
| `GET /api/v1/integrations/accounts` / `POST /api/v1/integrations/accounts` | 读写本地集成账号表 | 非真实第三方授权 |
| `POST /api/v1/integrations/extension/context` | 写本地扩展上下文表 | 仅保存样例 payload |
| `POST /api/v1/integrations/crawl-tasks` | 写本地抓取任务表 | 非真实爬取执行链路 |
| 候选人/岗位/流程/面试最小接口 | 通过 JPA Repository 读写本地表 | 仍属 MVP 范围 |

## 3. 仍不是“真实业务落库”的接口/能力

| 接口 / 能力 | 当前事实 | 对外口径 |
|---|---|---|
| `GET /api/v1/bi/overview` | 由 `BiOverviewService` 根据角色/用户偏移量生成指标 | rule-based 演示 BI，不代表真实统计 |
| Agent 对话接口 | `AgentDemoService` 使用 `ConcurrentHashMap` 保存会话 | 进程内存态，不是持久化会话中心 |
| Agent 写操作意图 | 返回确认卡片，不真正推进候选人/岗位/流程 | confirm-first 演示，不执行真实写操作 |
| 匹配推荐接口 | 使用 `MatchDemoService` 演示数据 | 非真实模型链路与非真实生产推荐 |

## 4. 前端文案建议

### 4.1 适合放在页面说明里的表述

- `当前状态已写入本地 H2 演示库`
- `本页展示重构版本地样例数据`
- `仍为非生产、非真实第三方、非真实配置中心`
- `BI 指标为 rule-based 演示口径`
- `Agent 写操作仅返回确认卡片`

### 4.2 不应继续使用的表述

- `当前全部只保存在 demo / in-memory 中`
- `刷新服务后所有状态都会恢复初始值`
- `当前已接真实第三方`
- `当前已接真实配置中心`

## 5. 对齐结论

最准的接口级口径是：

> 当前重构版已经具备“本地 H2 持久化的演示状态”，但仍不是生产环境，也没有接入真实第三方、真实配置中心或真实 BI 统计链路。
