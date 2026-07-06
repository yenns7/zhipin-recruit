# 智聘重构后端（Java Spring Boot）

> 路径：`rebuild/backend-java/`
> 口径目标：把“哪些能力已经落到本地 H2”“哪些仍是 demo / rule-based / 非生产壳层”分开说明，避免再把当前后端误写成纯 `in-memory`。

## 当前状态

当前重构后端已经不是“只有脚手架”的阶段，也不是“全部 demo / in-memory”：

- 默认数据源是**本地 H2 文件库**，见 `src/main/resources/application.yml`
  - 默认：`jdbc:h2:file:./data/hireinsight-demo`
  - `dev`：`jdbc:h2:file:./data/hireinsight-demo-dev`
  - 只有 `test` profile 才使用 `jdbc:h2:mem:testdb`
- 已存在 JPA Entity、Repository、Controller、Flyway migration，以及一批可跑通的 Spring Boot 测试。

## 已持久化到本地 H2 的能力

以下能力已经写入本地 H2 文件库，不应继续描述为“仅前端内存态”或“纯 in-memory”：

- Demo 登录账号与会话
  - 表：`users`、`demo_auth_sessions`
  - 迁移：`V8__create_demo_auth_tables.sql`
- 系统治理壳层
  - 表：`system_governance_parameters`
  - 表：`system_governance_models`
  - 表：`system_governance_audit_logs`
  - 迁移：`V6__create_system_governance_tables.sql`
- 通知待办的完成/归档覆盖状态
  - 表：`notification_todo_status_overrides`
  - 迁移：`V7__create_notification_todo_status_overrides.sql`
- 集成演示壳层
  - 表：`integration_accounts`
  - 表：`integration_extension_contexts`
  - 表：`integration_crawl_tasks`
  - 迁移：`V5__integration_persistence.sql`
- 招聘主流程基础实体
  - `Candidate`、`Job`、`PipelineStage`、`InterviewFeedback`、`Event`、`User`
  - 当前已通过 JPA Repository 提供最小读写能力

## 仍然是 demo / 非生产 / 非真实集成的部分

“已持久化到本地 H2”不等于“已经是真实生产系统”。当前仍需明确保留这些限制：

- **非生产环境**
  - 默认仍是本地 H2 + `ddl-auto: update`
  - 没有生产级备份、审计留痕策略、监控、运维治理
- **非真实第三方集成**
  - 集成模块只把账号、扩展上下文、抓取任务样例落到本地 H2
  - 没有真实 BOSS/猎聘在线授权、真实抓取、真实第三方回调
- **非真实配置中心**
  - 系统治理页展示的是本地治理壳层和演示参数表
  - 没有接入 Nacos / Apollo / Consul 一类真实配置中心
- **Agent 仍是进程内存态**
  - `AgentDemoService` 使用 `ConcurrentHashMap` 保存会话
  - 写操作只返回 `confirm-first` 确认卡片，不执行真实业务写入
- **BI 仍是 rule-based 演示口径**
  - `BiOverviewService` 当前按角色与用户偏移量生成摘要指标
  - 不是基于真实数仓、真实渠道或真实生产统计口径
- **匹配仍是 demo 服务**
  - 推荐结果由 `MatchDemoService` 提供演示数据
  - 不是生产匹配流水，也没有真实模型推理链路

## 推荐文案口径

前端和文档建议统一用下面这类表述：

- 可以说：`已持久化到本地 H2 的演示数据`
- 可以说：`本地重构库中的样例状态`
- 可以说：`非生产、非真实第三方、非真实配置中心`
- 可以说：`rule-based 演示指标`
- 不要再笼统写成：`全部仅 demo / in-memory`

## 运行提醒

- 这套重构后端适合本地联调、口径对齐、MVP 壳层演示
- 目前不应对外承诺为“生产可上线”或“真实第三方已打通”
