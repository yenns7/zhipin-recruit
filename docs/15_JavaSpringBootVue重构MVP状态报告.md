# 15 · Java Spring Boot + Vue 重构 MVP 状态报告

> 日期：2026-07-06
> 目标：记录 `rebuild/` 目录下 Java Spring Boot + Vue 重构版的当前真实状态，并修正“全部仅 demo / in-memory”的过时口径。

---

## 1. 结论先行

当前 `rebuild/` 已经不是“只有脚手架”的阶段，也不能被笼统写成“纯 in-memory demo”。

- **后端已有一批真实可落库的本地能力**：默认数据源是本地 H2 文件库，且已有 JPA Entity、Repository、Controller、Flyway migration 与 Spring Boot 测试。
- **部分演示壳层已写入本地 H2**：系统治理参数/模型/审计日志、通知待办覆盖状态、集成账号/扩展上下文/抓取任务、demo 登录会话都已持久化到本地 H2。
- **同时仍保留明确限制**：这套重构版依旧是非生产壳层，未接真实第三方、未接真实配置中心；BI 仍是 rule-based 演示口径，Agent 会话仍是进程内存态，匹配推荐仍是 demo 数据。
- **前端已不止“空骨架”**：现有 `views/`、`components/`、测试文件已经覆盖系统治理、通知待办、匹配推荐、管理员用户治理等页面壳层，但路由接线并未全部收口。

**更准确的结论是：重构版已经进入“本地可联调的演示壳层 / MVP 收口中”阶段，而不是“只有脚手架”，也还不是“可生产上线”。**

---

## 2. 当前已实现的能力

### 2.1 后端基础与主流程

| 模块 | 当前状态 | 证据 |
|---|---|---|
| Spring Boot 基础设施 | 已完成 | `rebuild/backend-java/pom.xml`、`HireInsightApplication.java`、`WebSecurityConfig.java`、`GlobalExceptionHandler.java` |
| 默认数据源 | 已配置本地 H2 文件库 | `application.yml` 默认 `jdbc:h2:file:./data/hireinsight-demo`，`dev` 也为 file 模式；仅 `test` profile 为 `jdbc:h2:mem:testdb` |
| 认证 | 已有 demo 账号、JWT、会话落库 | `AuthController.java`、`DemoAuthSessionService.java`、`V8__create_demo_auth_tables.sql` |
| 候选人/岗位 | 已有 Entity + Repository + 最小读写接口 | `Candidate.java`、`Job.java`、`CandidateController.java`、`JobController.java` |
| 流程推进 | 已有流程看板、推进/回退、历史接口 | `PipelineController.java`、`PipelineBoardService.java` |
| 面试反馈 | 已有反馈提交与列表查询 | `InterviewController.java`、`InterviewFeedback.java` |

### 2.2 已持久化到本地 H2 的演示壳层

| 能力 | 当前状态 | 证据 |
|---|---|---|
| 系统治理参数/模型/审计日志 | **已持久化到本地 H2** | `SystemGovernanceService.java` + `V6__create_system_governance_tables.sql` |
| 通知待办完成/归档状态 | **已持久化到本地 H2** | `NotificationTodoService.java` + `V7__create_notification_todo_status_overrides.sql` |
| 集成账号/扩展上下文/抓取任务 | **已持久化到本地 H2** | `IntegrationDemoService.java` + `V5__integration_persistence.sql` |
| Demo 登录会话 | **已持久化到本地 H2** | `DemoAuthSessionService.java` + `V8__create_demo_auth_tables.sql` |

### 2.3 仍是演示口径而非真实生产能力

| 能力 | 当前状态 | 证据 |
|---|---|---|
| BI 概览 | **rule-based 演示指标**，不是生产 BI | `BiOverviewService.java` 按角色与用户偏移量生成摘要值 |
| Agent 工作台 | **进程内存态会话**，写操作只给确认卡片 | `AgentDemoService.java` 使用 `ConcurrentHashMap` |
| 匹配推荐 | **demo 数据**，不是生产匹配流水 | `MatchDemoService.java`、`MatchRecommendationController.java` |
| 系统治理配置中心 | **本地治理壳层**，非真实配置中心 | `SystemGovernanceService.java` 只读写本地参数/模型/审计表 |
| 第三方集成 | **本地演示账户与任务状态**，非真实第三方联通 | `IntegrationDemoService.java` 的 seed 数据与本地表结构 |

### 2.4 前端当前真实状态

| 模块 | 当前状态 | 证据 |
|---|---|---|
| Vue 基础设施 | 已完成 | `rebuild/frontend-vue/package.json`、`main.ts`、`router/index.ts`、`stores/auth.ts` |
| 页面壳层 | 已有一批视图与组件 | `views/admin/`、`views/match/`、`views/notifications/`、`components/admin/`、`components/notifications/` |
| 前端测试 | 已存在多组 Vitest | `src/views/admin/SystemAdminView.test.ts`、`src/views/match/MatchRecommendationsView.test.ts`、`src/views/notifications/NotificationTodoView.test.ts` |
| 路由收口 | **未全部接线** | 当前 router 只显式注册 Login / Dashboard / Candidates / Jobs / Pipeline / Interviews；Agent/Admin/Notifications/Match 视图与测试已存在，但路由尚未完全并入现有 `router/index.ts` |

---

## 3. 本次重点修正的口径

之前把重构版写成“项目脚手架阶段”“无 Entity/Repository/Service/Controller”“全部 demo / in-memory”，已经与当前代码事实不一致。本次统一改成以下口径：

- **可以说**：`已持久化到本地 H2 的演示数据 / 本地重构库状态`
- **可以说**：`非生产、非真实第三方、非真实配置中心`
- **可以说**：`BI 为 rule-based 演示指标`
- **可以说**：`Agent 会话仍是进程内存态`
- **不要再笼统写**：`全部仅 demo / in-memory`

---

## 4. 仍然存在的缺口与风险

1. **不是生产可上线形态**：当前默认仍是本地 H2，未补齐生产数据库、备份、审计策略、监控和运维体系。
2. **真实第三方未打通**：集成模块目前只证明“本地可存演示账号与任务状态”，不代表真实 BOSS/猎聘联通。
3. **真实配置中心未接入**：系统治理页展示的是本地参数壳层，不代表已有 Nacos / Apollo / Consul 级别配置治理。
4. **BI 口径仍偏演示**：`BiOverviewService` 当前不是从真实业务明细、真实归因和真实 BI 口径推导出的数据。
5. **Agent 仍不落真实业务写入**：写操作统一改写为 confirm-first 建议，不直接推进候选人、岗位或流程。
6. **前端接线未收口**：现有视图、测试与路由并非完全一致，存在“页面文件已做、路由尚未挂上”的状态。

---

## 5. 建议对外描述

如果需要给协作者或评审同步当前状态，建议用下面这句话：

> `rebuild/` 已经具备本地可联调的 Java + Vue 演示壳层；部分系统治理、通知、集成与 demo 会话状态已持久化到本地 H2，但整体仍是非生产、非真实第三方、非真实配置中心的 MVP 收口阶段，BI 与 Agent 仍保留 rule-based / in-memory 的演示限制。

---

## 6. 证据摘要

| 证据 | 路径 |
|---|---|
| 默认 H2 文件库配置 | `rebuild/backend-java/src/main/resources/application.yml` |
| 本地持久化迁移 | `rebuild/backend-java/src/main/resources/db/migration/V5__integration_persistence.sql` |
| 本地持久化迁移 | `rebuild/backend-java/src/main/resources/db/migration/V6__create_system_governance_tables.sql` |
| 本地持久化迁移 | `rebuild/backend-java/src/main/resources/db/migration/V7__create_notification_todo_status_overrides.sql` |
| 本地持久化迁移 | `rebuild/backend-java/src/main/resources/db/migration/V8__create_demo_auth_tables.sql` |
| Agent 仍是进程内存态 | `rebuild/backend-java/src/main/java/com/zhiping/rebuild/agent/AgentDemoService.java` |
| BI 仍是 rule-based 生成 | `rebuild/backend-java/src/main/java/com/hireinsight/bi/BiOverviewService.java` |
| 前端现有视图与测试 | `rebuild/frontend-vue/src/views/`、`rebuild/frontend-vue/src/components/`、`rebuild/frontend-vue/src/tests/` |

> 说明：本报告以当前仓库可见代码、配置、迁移与测试文件为唯一依据，不包含未落库的计划项。
