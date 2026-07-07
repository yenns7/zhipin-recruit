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
  - 解析成功后会真实写入本地 rebuild 演示库（当前对外口径写作本地 rebuild H2）
  - 不再写成“只是前端临时态 / 刷新即丢”
- Agent 壳层：会话列表、会话详情、“创建新会话”、管理员侧 AI 调用日志查询都应按“已存在的演示壳层”描述
  - 仍不应包装成生产级会话中心或完整可观测平台
- Pipeline 壳层：`offer / onboarded / rejected` 可用于演示阶段流转与样例数据校验
  - 但不代表完整 Offer 审批、入职办理、淘汰合规闭环已经完成

## 本轮需要特别注意的边界

- `revert-lite` 应视为**demo / legacy correction path**
  - 用于演示环境中的轻量纠偏、旧数据修正或误推进后的最小回退说明
  - 不应对外宣称为生产级“任意节点撤回引擎”
- `offer / onboarded / rejected` 在重构壳层里更接近**阶段记录与 demo 演示边界**
  - `offer`：仅表示进入 Offer 阶段，不等于完整审批流
  - `onboarded`：仅表示流程终态记录，不等于入职手续、账号开通、设备/合同闭环
  - `rejected`：仅表示流程终态记录，不等于原因治理、通知合规、申诉修正全闭环

## 文档入口

- 运行说明见 [RUNNING.md](./RUNNING.md)
- API 口径见 [../docs/superpowers/specs/2026-07-06-java-springboot-vue-rebuild-api.md](../docs/superpowers/specs/2026-07-06-java-springboot-vue-rebuild-api.md)
- PRD 口径见 [../docs/superpowers/specs/2026-07-06-java-springboot-vue-rebuild-prd.md](../docs/superpowers/specs/2026-07-06-java-springboot-vue-rebuild-prd.md)
- 状态报告见 [../docs/15_JavaSpringBootVue重构MVP状态报告.md](../docs/15_JavaSpringBootVue重构MVP状态报告.md)
