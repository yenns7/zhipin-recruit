# 智聘重构后端（Java Spring Boot）

> 路径：`rebuild/backend-java/`
> 口径目标：把“哪些能力已经落到本地数据库”“哪些仍是 demo / rule-based / 非生产壳层”分开说明，避免再把当前后端误写成纯 `in-memory`。

## 当前状态

当前重构后端已经不是“只有脚手架”的阶段，也不是“全部 demo / in-memory”：

- 默认数据源按 `src/main/resources/application.yml` 连接**本机 PostgreSQL**
  - 默认：`jdbc:postgresql://localhost:5432/hireinsight`
  - 默认账号：`hi`
  - 默认密码：`hipass`
  - 本地空库首次联调用 `dev` profile 让 JPA 创建/更新表结构
  - 只有 `test` profile 使用 `jdbc:h2:mem:testdb`
- JWT 本地默认密钥只是可启动占位值；真实试点或生产必须通过 `JWT_SECRET` 设置 32 字符以上强随机值
- 已存在 JPA Entity、Repository、Controller、少量迁移说明文件，以及一批可跑通的 Spring Boot 测试。
- `dev` profile 会初始化四类本地演示账号，便于招聘专员、负责人、面试官、管理员直接试跑角色路径。
- `pilot` profile 不创建 demo 账号，会在启动前校验 JWT、数据库密码、CORS、上传目录、公开注册和 demo 账号残留。

## 已持久化到本地数据库的能力

以下能力已经写入本地数据库，不应继续描述为“仅前端内存态”或“纯 in-memory”：

- 登录账号
  - 表：`users`
  - demo token 会话状态目前由 `DemoAuthSessionService` 进程内存维护，退出登录只作为本地演示提示。
- 招聘主流程基础实体
  - `Candidate`、`Job`、`PipelineStage`、`InterviewFeedback`、`Event`、`User`
  - 当前已通过 JPA Repository 提供最小读写能力
  - `/api/v1/pipeline/move` 可把候选人加入或推进到指定阶段
  - `/api/v1/interviews/schedule` 可创建面试草稿，限制 `recruiter / manager / admin` 使用
  - `/api/v1/interviews` 对 `interviewer` 按本人 `interviewer_id` 收敛
- 人才地图与管理员用户治理
  - `TalentMap` / `TalentMapCompany` / `TalentMapPerson` 已有 JPA 实体和 `V9__create_talent_map_tables.sql`
  - 管理员用户治理复用 `users` 表完成 create / edit / reset-password demo 闭环

## 仍然是 demo / 非生产 / 非真实集成的部分

“已持久化到本地数据库”不等于“已经是真实生产系统”。当前仍需明确保留这些限制：

- **非生产环境**
  - 默认仍是本机 PostgreSQL + `ddl-auto: validate`
  - 没有生产级备份、审计留痕策略、监控、运维治理
- **非真实第三方集成**
  - `V5__integration_persistence.sql` 记录了集成账号和抓取任务目标表结构
  - 当前 `IntegrationDemoService` 仍是 demo / in-memory 快照，不代表真实授权或真实抓取
  - 没有真实 BOSS/猎聘在线授权、真实抓取、真实第三方回调
- **非真实配置中心**
  - 系统设置里的系统治理壳层通过 `/api/v1/admin/system/**` 返回 demo / in-memory 参数、模型和审计日志
  - 没有接入 Nacos / Apollo / Consul 一类真实配置中心
- **通知待办仍是进程内存覆盖状态**
  - `/api/v1/notifications/todos` 的完成/归档只保存在当前 Java 进程
  - 重启服务后会恢复默认演示待办
- **Agent 仍是进程内存态**
  - `AgentDemoService` 使用 `ConcurrentHashMap` 保存会话
  - 写操作只返回 `confirm-first` 确认卡片，不执行真实业务写入
- **BI 仍是 rule-based 演示口径**
  - `BiController` 当前按 JPA Repository 做最小聚合
  - 招聘专员按自己的 `owner_hr_id` 范围统计岗位和候选人
  - 负责人/管理员按团队范围统计
  - 不是基于真实数仓、真实渠道或真实生产统计口径
- **匹配仍是 demo 服务**
  - 推荐结果由 `MatchDemoService` 提供演示数据
  - 不是生产匹配流水，也没有真实模型推理链路

## 推荐文案口径

前端和文档建议统一用下面这类表述：

- 可以说：`已持久化到本地数据库的演示数据`
- 可以说：`本地重构库中的样例状态`
- 可以说：`非生产、非真实第三方、非真实配置中心`
- 可以说：`rule-based 演示指标`
- 不要再笼统写成：`全部仅 demo / in-memory`

## 运行提醒

- 这套重构后端适合本地联调、口径对齐、MVP 壳层演示
- 本地空库启动命令：`mvn spring-boot:run -Dspring-boot.run.profiles=dev`
- 本地演示账号与原 Python 版 `backend/seed_dev.py` 对齐，密码统一为 `Zhipin2026`：
  - `admin01@mvp.local`
  - `manager01@mvp.local`
  - `lead01@mvp.local`
  - `hr01@mvp.local`
  - `hr02@mvp.local`
  - `hr03@mvp.local`
  - `interviewer01@mvp.local`
- 真实用户小范围试点启动命令：`mvn spring-boot:run -Dspring-boot.run.profiles=pilot`
- 真实试点账号由一次性 bootstrap 管理员创建，不使用固定 demo 账号。
- 真实试点备份/恢复脚本位于 `rebuild/scripts/backup_pilot_data.py` 和 `rebuild/scripts/restore_pilot_data.py`
- 目前不应对外承诺为“生产可上线”或“真实第三方已打通”
