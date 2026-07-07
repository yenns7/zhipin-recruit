# 智聘重构 MVP（Java Spring Boot + Vue）

`rebuild/` 不是“只有脚手架”的空目录，也还不是生产可上线版本。当前更准确的口径是：**Java + Vue 重构版已经进入可本地联调的 MVP 壳层收口阶段**。

## 当前前端壳层

- `AdminUsersView`：管理员最小闭环已收口到 `list + create + edit + reset-password`
  - 创建：`POST /api/v1/admin/users`
  - 编辑：`PATCH /api/v1/admin/users/{userId}`
  - 重置密码：`POST /api/v1/admin/users/{userId}/reset-password`
  - 该页仍是 `demo-only` 账号治理壳层，不是完整 IAM / SSO / 审批系统
- `CandidateListView`：页面说明已统一为当前事实
  - 上传简历后会进入异步解析
  - 解析成功后会真实写入 Java rebuild PostgreSQL dev 数据库
  - 不再写成“只是前端临时态 / 刷新即丢”
  - 候选人列表提供“加入流程”入口，可把候选人加入有效岗位的 AI 初筛
- `ResumeUploadView`：已接入 `/upload` 路由与侧边栏入口
  - 候选人空数据时会引导用户去上传简历
- `InterviewListView`：已提供安排面试草稿入口
  - 招聘专员、负责人、管理员可填写候选人 ID、岗位 ID、面试官账号 ID 创建面试草稿
  - 面试官列表由后端按 interviewer_id 收敛到本人范围
- `DashboardView`：经理/负责人视角补充团队看板提示
  - 覆盖岗位进展、候选人归属、招聘专员绩效、流程卡点
- 本地演示账号已对齐原 Python 版 `backend/seed_dev.py`
  - 邮箱使用 `admin01@mvp.local`、`manager01@mvp.local`、`lead01@mvp.local`、`hr01@mvp.local`、`hr02@mvp.local`、`hr03@mvp.local`、`interviewer01@mvp.local`
  - 统一密码为 `Zhipin2026`
- 侧边栏核心入口文案已对齐原 Python 版常用叫法
  - `简历库`、`招聘管理`、`候选人流程`、`数据看板`、`系统设置`
- AI 助手壳层：会话列表、会话详情和 confirm-first 消息发送已有 Java demo API
  - 写操作只生成确认卡片，并继续受当前账号权限约束
  - 仍不应包装成生产级会话中心、真实自动写操作或完整可观测平台
- 通知待办 / 系统设置里的系统治理：已有 Vue 入口和 Java demo API
  - 相关状态当前明确标注为 demo / in-memory，不代表真实配置中心或生产审计
- Pipeline 壳层：`offer / onboarded / rejected` 可用于演示阶段流转与样例数据校验
  - 但不代表完整 Offer 审批、入职办理、淘汰合规闭环已经完成
  - 误推进已有历史查看与纠正入口；误淘汰、误关闭、负责人分错仍是试点风险

## 本轮需要特别注意的边界

- `revert-lite` 应视为**demo / legacy correction path**
  - 用于演示环境中的轻量纠偏、旧数据修正或误推进后的最小回退说明
  - 不应对外宣称为生产级“任意节点撤回引擎”
- `offer / onboarded / rejected` 在重构壳层里更接近**阶段记录与 demo 演示边界**
  - `offer`：仅表示进入 Offer 阶段，不等于完整审批流
  - `onboarded`：仅表示流程终态记录，不等于入职手续、账号开通、设备/合同闭环
  - `rejected`：仅表示流程终态记录，不等于原因治理、通知合规、申诉修正全闭环
- 试点账号只在 Spring Boot `dev` profile 自动初始化，不覆盖已存在账号
  - 四类角色账号见 [RUNNING.md](./RUNNING.md)
- 真实用户小范围试点必须使用 `pilot` profile，不使用固定 demo 账号
  - `pilot` 会校验 JWT、数据库密码、CORS、上传目录、公开注册和 demo 账号残留
  - 首次管理员通过一次性 bootstrap 环境变量创建，之后删除该变量
- 当前判断只能到**真实用户小范围试点可进入**，不能包装成生产上线
  - 生产上线仍缺真实数据安全、备份、合规、审计、监控和运维保障

## 文档入口

- 运行说明见 [RUNNING.md](./RUNNING.md)
- 真实试点部署说明见 [DEPLOYMENT.md](./DEPLOYMENT.md)
- API 口径见 [../docs/superpowers/specs/2026-07-06-java-springboot-vue-rebuild-api.md](../docs/superpowers/specs/2026-07-06-java-springboot-vue-rebuild-api.md)
- PRD 口径见 [../docs/superpowers/specs/2026-07-06-java-springboot-vue-rebuild-prd.md](../docs/superpowers/specs/2026-07-06-java-springboot-vue-rebuild-prd.md)
- 状态报告见 [../docs/15_JavaSpringBootVue重构MVP状态报告.md](../docs/15_JavaSpringBootVue重构MVP状态报告.md)
- 试点交付包见 [../docs/16_JavaVue真实用户小范围试点交付包.md](../docs/16_JavaVue真实用户小范围试点交付包.md)
- 试点前落地准备清单见 [../docs/17_JavaVue真实试点前落地准备清单.md](../docs/17_JavaVue真实试点前落地准备清单.md)
