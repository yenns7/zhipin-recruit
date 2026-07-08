# 智聘重构后端（Java Spring Boot）

> 路径：`rebuild/backend-java/`
> 口径目标：把”哪些能力已经落到本地数据库””哪些仍是 demo / rule-based / 非生产壳层”分开说明，避免再把当前后端误写成纯 `in-memory`。
> 测试状态：**129 tests, 0 failures**（从最初 39 个增长到 129 个）| Flyway: V1~V12

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

以下能力已经写入本地数据库，不应继续描述为”仅前端内存态”或”纯 in-memory”：

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
- **RecruitmentDemand 用人需求**（Flyway V10）
  - 新实体 `RecruitmentDemand` + `V10__create_recruitment_demand_table.sql`
  - 7 个接口：列表/创建/详情/更新/关闭/恢复/降级
  - 完整生命周期管理：需求状态流转 (`active → closed`, `closed → active`, 优先级 A/B/C 调整)
  - 业务原因弹窗记录：关闭/恢复/降级操作强制填写原因
- **Match 匹配模块**（Flyway 已有表，新增服务层）
  - 新包 `com.hireinsight.match`，移植 Python `job_matcher.py` → Java `JobMatcher`
  - 3 个接口：通用匹配、岗位匹配预览、匹配并加入流程
  - 提供候选人-岗位技能匹配排名（命中/欠缺标签可视化）
- **AI Interview 面试扩充**（Flyway V11）
  - 新实体 `InterviewSession` + `V11__create_interview_sessions_table.sql`
  - `InterviewAIService` (rule-based) 生成面试题目与评估报告
  - 5 个接口：开始面试/提交作答/面试引导/面试官列表/面试任务分配
  - 面试引导返回按 JD 定制的结构化题目，候选人作答后生成分项评分报告
- **Agent 调用日志 + Tools**（Flyway V12）
  - 新实体 `AgentCallLog` + `V12__create_agent_call_logs_table.sql`
  - 7 个接口：调用日志列表/详情、Tools 列表/执行、会话 CRUD
  - 记录每次 AI 调用的输入输出/模型/token/耗时/工具链，支持管理员审计
- **BOSS 直聘 Demo Stub**（in-memory）
  - 新包 `com.hireinsight.boss` + `BossDemoService`
  - 17 个接口覆盖 BOSS 全部功能场景：账号/岗位/候选人/收件箱/消息/面试邀请/导出等
  - 所有数据为 in-memory 静态样例，不代表真实 BOSS 集成
- **Job 生命周期 + Candidate 归属**（扩展已有表）
  - Job: PUT 更新岗位 + POST close/restore
  - Candidate: owner-options 归属选项 + pipelines 流程列表 + journey 轨迹 + reassign 转派负责人
  - TalentMap: 3 个 PATCH 端点（更新公司/人员信息）
  - Pipeline Offer: GET/PUT Offer 信息
  - Notifications: GET unread-count 未读数
- **BI 深度复现**（基于已有表聚合）
  - `GET /api/v1/bi/staff/{hrId}` — HR 归因分析
  - `GET /api/v1/bi/job/{jobId}` — 岗位级漏斗

## 仍然是 demo / 非生产 / 非真实集成的部分

“已持久化到本地数据库”不等于”已经是真实生产系统”。当前仍需明确保留这些限制：

- **非生产环境**
  - 默认仍是本机 PostgreSQL + `ddl-auto: validate`
  - 没有生产级备份、审计留痕策略、监控、运维治理
- **非真实第三方集成**
  - `V5__integration_persistence.sql` 记录了集成账号和抓取任务目标表结构
  - 当前 `IntegrationDemoService` 仍是 demo / in-memory 快照，不代表真实授权或真实抓取
  - 没有真实 BOSS/猎聘在线授权、真实抓取、真实第三方回调
- **BOSS 直聘为 demo-stub**
  - `BossDemoService` + `com.hireinsight.boss` 包提供 17 个 BOSS 风格接口，但所有数据为 in-memory 静态样例
  - 不代表真实 BOSS 直聘在线授权、真实抓取、真实消息收发或真实面试邀请回调
  - Chrome 扩展 / Cookie 采集 / 扫码登录等生产级 BOSS 集成链路暂未接入
- **AI 面试为 rule-based demo**
  - `InterviewAIService` 使用规则模板生成面试题和评估报告
  - 不是真实 LLM 驱动的 AI 面试引擎，评估报告不涉及自然语言推理
  - 面试会话状态保存在 `InterviewSession` 表中，但评估逻辑为规则而非 AI
- **非真实配置中心**
  - 系统设置里的系统治理壳层通过 `/api/v1/admin/system/**` 返回 demo / in-memory 参数、模型和审计日志
  - 没有接入 Nacos / Apollo / Consul 一类真实配置中心
- **通知待办仍是进程内存覆盖状态**
  - `/api/v1/notifications/todos` 的完成/归档只保存在当前 Java 进程
  - 重启服务后会恢复默认演示待办
- **Agent 会话仍是进程内存态（但调用日志已持久化）**
  - 会话由 `AgentDemoService` 使用 `ConcurrentHashMap` 保存，重启后丢失
  - **调用日志已写入 `agent_call_logs` 表**（Flyway V12），支持管理员审计查询
  - Tools 列表和执行通过 `AgentToolService` 管理，但写操作只返回 `confirm-first` 确认卡片，不执行真实业务写入
- **BI 仍是 rule-based 演示口径**
  - `BiController` 当前按 JPA Repository 做最小聚合
  - 招聘专员按自己的 `owner_hr_id` 范围统计岗位和候选人
  - 负责人/管理员当前按全局范围统计（demo 阶段未引入团队归属模型，未按团队细分）
  - 新增 `GET /bi/staff/{hrId}` HR 归因和 `GET /bi/job/{jobId}` 岗位漏斗，均为 rule-based 聚合
  - 不是基于真实数仓、真实渠道或真实生产统计口径
- **匹配引擎已移植但仍是 demo 数据**
  - Java `JobMatcher` 已移植 Python `job_matcher.py` 的匹配算法逻辑
  - 但推荐结果基于本地样例数据，不是基于真实简历池的生产推理流水线

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
