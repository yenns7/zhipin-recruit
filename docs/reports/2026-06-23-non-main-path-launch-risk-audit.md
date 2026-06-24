# 智聘非主路径高频上线风险专项审查

日期：2026-06-23

本次审查范围：账号生命周期、邀请/重置密码、session 失效、CORS/CSRF、多租户隔离、批量导入/批量操作、幂等性、异步任务、webhook、通知误发、日历排期、搜索泄露、性能、备份恢复、发布回滚、依赖供应链、AI 招聘合规、空状态和错误状态。

## 验证摘要

- 两企业/两部门/两招聘负责人造数：Alpha 企业（研发部/市场部，招聘负责人 A/B）与 Beta 企业（研发部，招聘负责人 C）。
- 隔离验证通过：岗位列表、候选人搜索、候选人导出、BI、通知列表、匹配后台写入、批量加入流程均未发现跨企业串数据。
- 2026-06-23 修复进展：流程推进、面试排期、面试反馈、简历上传重复请求已补业务级复用；普通 JSON/表单写接口已补 `Idempotency-Key`；同一面试官同一时间冲突已拦截；误导入已支持按上传批次撤回；旧版 OLE `.doc` 因宏风险改为跳过；生产 AI 合规门禁和恢复脚本已补。
- 仍有限制：轻量试点仍不提供导出审批/水印、不可变审计、外部日历真实同步、webhook 签名入口和异步队列；损坏/加密 PDF 仍按解析失败候选人保留，后续建议接入杀毒和隔离区。
- 备份恢复演练：SQLite 本地演练可通过 `restore_pilot_data.py` 恢复数据库和 uploads；生产 PostgreSQL 仍需在真实服务器临时库执行一次 `--dry-run` + `--confirm` 并记录 RTO/RPO。

已跑验证：

```bash
.venv312/bin/python -m pytest backend/tests/test_auth_security.py backend/tests/test_pilot_hardening.py backend/tests/test_production_org_access_hardening.py backend/tests/test_access_control_hardening.py backend/tests/test_candidate_search_pagination.py backend/tests/test_job_match_batch_pipeline.py backend/tests/test_notifications.py backend/tests/test_resume_parse_retry.py backend/tests/test_admin_audit_logs.py backend/tests/test_bi_metrics.py
# 61 passed

.venv312/bin/python -m pytest backend/tests/test_audit_trail_pilot.py backend/tests/test_production_org_access_hardening.py backend/tests/test_auth_security.py backend/tests/test_pilot_hardening.py
# 26 passed

node frontend/tests/candidate_export_audit.test.mjs
node frontend/tests/workflow_empty_state_guidance.test.mjs
node frontend/tests/pilot_reverse_acceptance_matrix.test.mjs
node frontend/tests/pilot_account_feedback_readiness.test.mjs
# all passed

cd frontend && npm audit --audit-level=moderate
# found 0 vulnerabilities

.venv312/bin/python -m pip_audit --vulnerability-service osv
# No known vulnerabilities found
```

限制说明：`pip_audit -r backend/requirements.txt` 在本机临时 venv `ensurepip` 阶段崩溃，因此改扫当前 `.venv312` 已安装环境。`backend/scripts/check_pilot_readiness.py` 按当前本地 `backend/.env` 失败 11 项，详见 P0-2。

## 数据隔离证明

本次造数后验证结果：

- `GET /api/jobs?status=all`：Alpha 负责人只看到 `Alpha研发后端`、`Alpha市场增长`。
- `GET /api/jobs/<Beta岗位>`：Alpha 负责人返回 404。
- `GET /api/candidates?search=secret-beta`：Alpha 负责人 total=0。
- `GET /api/candidates`：招聘负责人 A 只看到 `Alpha候选人研发`。
- `GET /api/candidates/<Beta候选人>/export`：Alpha 用户返回 404。
- `GET /api/bi/overview`：staff 只包含招聘负责人 A/B，不含 Beta 用户。
- `GET /api/notifications`：招聘负责人 A 只看到 Alpha 通知。
- `POST /api/jobs/<Alpha岗位>/match`：匹配候选人 ID 只来自 Alpha 企业。
- `POST /api/jobs/<Alpha岗位>/batch-pipeline` 携带 Beta 候选人 ID：返回 `skipped_missing=1`，且 `pipeline_stages` 无跨企业行。

当前没有 webhook API；Celery 配置存在但当前业务入口主要同步执行，未发现真实异步 worker 或 webhook 重放入口。该范围不能证明未来 webhook/异步任务安全，只能说明当前代码无对应上线能力。

## 问题清单

### P0-1 AI 招聘合规和外部模型数据边界未闭环

- 风险等级：P0
- 复现步骤：上传真实简历或创建 JD 后触发简历解析、岗位结构化、AI 面试题/报告生成；代码会把简历文本/JD/问答内容交给 LLM 客户端处理。
- 涉及页面/API/数据表：简历上传 `/api/resume/upload`，岗位创建 `/api/jobs`，AI 面试 `/api/interview/start`、`/api/interview/submit`，AI 助手 `/api/agent/chat`；`candidates`、`jobs`、`interviews`、`conversation_messages`。
- 真实用户影响：候选人 PII 和评价数据可能进入外部模型链路；缺少候选人授权、数据最小化、保留周期、人工复核、不利决定解释与申诉说明。
- 是否阻断试点：是。使用虚构/demo 数据不阻断；使用真实候选人数据前阻断。
- 修复建议：上线配置中明确模型供应商和数据处理边界；增加候选人授权和隐私告知；简历传模前做 PII 最小化或脱敏；AI 结论不得直接作为淘汰唯一依据；记录人工复核人和复核理由；补充模型输出偏见/歧视词检查。
- 是否需要补文档：需要，同步 `docs/01_PRD.md`、`docs/SDD-智聘招聘系统-v1.0.md`、`RUNNING.md`、`DEPLOYMENT.md` 的 AI 合规、隐私和试点限制。

### P0-2 当前本地部署配置未通过试点硬门槛

- 风险等级：P0
- 复现步骤：运行 `.venv312/bin/python backend/scripts/check_pilot_readiness.py`。
- 涉及页面/API/数据表：部署配置 `backend/.env`，启动配置 `backend/app/config.py`。
- 真实用户影响：当前本地配置存在弱 JWT、debug、SQLite、CORS 白名单缺失、限流/备份/公开注册显式配置缺失等问题，不能承载真实用户试点。
- 是否阻断试点：是，阻断以当前本地配置开放真实用户。
- 修复建议：按 `DEPLOYMENT.md` 和 `docs/06_试点上线检查清单.md` 切换 PostgreSQL、强 JWT、`FLASK_DEBUG=false`、CORS 白名单、显式限流、关闭公开注册、配置备份目录，并在服务器重跑自检。
- 是否需要补文档：不需要新增口径，现有部署文档已有要求；需要在试点执行记录里贴自检通过结果。

### P1-1 重置密码不废止旧 JWT，会话撤销能力不足

- 风险等级：P1
- 复现步骤：同企业管理员重置招聘专员密码；旧密码登录返回 401，新密码登录返回 200，但重置前签发的旧 token 调 `/api/auth/me` 仍返回 200，直到 JWT 自然过期。
- 涉及页面/API/数据表：管理员用户管理、`POST /api/admin/users/<id>/reset-password`、`GET /api/auth/me`；`users`。
- 真实用户影响：离职、误发密码、疑似泄露后，管理员重置密码不能立即踢下线；风险窗口等于 `JWT_EXPIRY_HOURS`。
- 是否阻断试点：不阻断小范围内部试点；真实用户/外部候选人数据前建议修复。
- 修复建议：增加 `users.token_version` 或 `password_changed_at`；JWT 写入版本/签发时间；`require_auth` 校验版本或签发时间；重置密码、停用账号、角色变更时强制旧 token 失效。
- 是否需要补文档：需要，同步 `RUNNING.md` 管理员账号生命周期说明和 `docs/SDD-智聘招聘系统-v1.0.md` 认证模型。

### P1-2 缺少邀请流程，管理员只能手工设置初始密码

- 风险等级：P1
- 复现步骤：查看账号接口，仅有 `POST /api/admin/users` 直接创建用户并写入密码、`reset-password` 重置密码；未发现邀请 token、首次登录改密强制或邀请过期机制。
- 涉及页面/API/数据表：用户管理、`/api/admin/users`、`/api/admin/users/<id>/reset-password`；`users`。
- 真实用户影响：初始密码需要通过人工渠道传递，容易泄露；无法审计邀请是否过期/被谁接受。
- 是否阻断试点：不阻断封闭内部试点；不建议直接开放给真实企业外部用户。
- 修复建议：增加一次性邀请 token、过期时间、首次登录强制改密、邀请发送审计；禁止管理员查看明文密码。
- 是否需要补文档：需要，同步账号开通和试点账号发放说明。

### P1-3 重复点击/超时重试会重复推进流程、安排面试、提交反馈、上传候选人

- 风险等级：P1
- 复现步骤：对同一请求连续提交两次：
  - `POST /api/pipeline/move` 新增 2 条 `pipeline_stages`。
  - `POST /api/interview/assignments` 新增 2 条 `interview_assignments`。
  - `POST /api/interview/feedback` 新增 2 条 `interview_feedback`。
  - 同一异常简历重复上传两次新增 2 条解析失败 `candidates`。
- 涉及页面/API/数据表：流程看板、面试安排、面试反馈、简历上传；`pipeline_stages`、`interview_assignments`、`interview_feedback`、`candidates`、`events`。
- 真实用户影响：用户网络抖动或双击会造成重复面试、重复反馈、重复候选人和审计噪音；未来接入通知/日历后会放大为重复通知和重复日历邀请。
- 是否阻断试点：是，至少在面试排期和简历批量导入高频场景会阻断真实试点体验。
- 修复建议：支持 `Idempotency-Key`；给 `(candidate_id, job_id, stage, request_key)`、`(candidate_id, job_id, round, interviewer_id, scheduled_at)`、`(candidate_id, job_id, round, interviewer_id)` 增加去重策略；前端按钮 loading 期间禁用只能作为辅助，后端必须兜底。
- 是否需要补文档：需要，同步 API 幂等约定和前端重试策略。

### P1-4 面试排期缺少冲突检测、重复检测和真实日历同步边界

- 风险等级：P1
- 复现步骤：同一候选人、岗位、轮次、面试官、时间重复调用 `/api/interview/assignments`，两次均返回 201。
- 涉及页面/API/数据表：面试记录/面试安排，`POST /api/interview/assignments`；`interview_assignments`。
- 真实用户影响：面试官可能收到重复安排；同一面试官同一时间多场面试也不会被拦；没有日历会议链接状态或外部日历失败补偿。
- 是否阻断试点：是，若试点要真实排面试。
- 修复建议：排期前校验面试官时间冲突和同候选人同轮次重复；增加取消/改期接口；接入日历前先定义外部日历创建失败、重试和撤销策略。
- 是否需要补文档：需要，同步面试排期限制和暂不支持的日历能力。

### P1-5 候选人导出权限不串租户，但导出治理不足

- 风险等级：P1
- 复现步骤：招聘专员导出自己候选人 `/api/candidates/<id>/export` 返回 CSV，包含邮箱、电话和完整 `resume_json`；跨企业导出返回 404，权限隔离通过。
- 涉及页面/API/数据表：候选人详情“导出简历”，`GET /api/candidates/<id>/export`；`candidates`、`events`。
- 真实用户影响：真实简历 PII 可被普通招聘专员直接下载，缺少导出原因、审批、水印、字段脱敏、下载次数限制和留痕可读说明。
- 是否阻断试点：若导出按钮对真实简历开放，则阻断；若试点临时隐藏导出或只给管理员，则不阻断。
- 修复建议：增加导出原因必填、导出字段最小化、CSV 注入防护、文件水印/操作者信息、导出频控、导出审批或仅管理员可导出。
- 是否需要补文档：需要，同步数据导出权限、审计字段和已知限制。

### P1-6 异常/恶意简历只做基础格式校验，失败文件仍落盘保留

- 风险等级：P1
- 复现步骤：
  - 超大 PDF：返回 skipped，未新增候选人。
  - 伪装 `.pdf`：返回“文件内容与扩展名不匹配”，未新增候选人。
  - 损坏 PDF/加密 PDF/OLE `.doc`：返回 error，新增解析失败候选人，并保留 `raw_file_path`。
- 涉及页面/API/数据表：简历上传 `/api/resume/upload`；`upload_batches`、`candidates`。
- 真实用户影响：恶意文件不会被执行，但会被保存到服务器；缺少杀毒、宏检测、隔离目录、失败文件保留期限和清理任务。
- 是否阻断试点：不阻断内部小范围试点；真实外部简历来源接入前应修复。
- 修复建议：接入 ClamAV/对象存储扫描；失败文件放隔离区；旧版 `.doc` 直接跳过不落候选人；为失败候选人增加清理/删除策略；上传批次只在至少一个文件可处理时创建或标记空批次。
- 是否需要补文档：需要，同步上传支持格式、异常文件处理和数据保留策略。

### P1-7 批量导入缺少批次级撤回/恢复，误导入补救成本高

- 风险等级：P1
- 复现步骤：上传接口每次创建 `upload_batches`，解析成功/失败逐条写候选人；未发现按 `upload_batch_id` 撤回、批量删除或恢复接口。重复上传同一文件会重复创建候选人。
- 涉及页面/API/数据表：简历上传、候选人库；`upload_batches`、`candidates`、`candidate_tags`、`pipeline_stages`。
- 真实用户影响：HR 误导入一批错误简历后，只能逐个删除或人工查库；可能污染搜索、BI 和人才库。
- 是否阻断试点：不阻断小批量试点；批量导入真实简历前建议修复。
- 修复建议：增加上传批次详情、批次撤回、批次恢复、批次影响预览；删除前显示影响候选人/流程/匹配/BI；导入时支持文件 hash 去重。
- 是否需要补文档：需要，同步误导入补救流程。

### P1-8 备份可生成，但生产恢复流程、权限和 RTO/RPO 未工程化

- 风险等级：P1
- 复现步骤：本地 SQLite 演练中，`backup_pilot_data.py` 可备份数据库和 uploads；手工复制 SQLite 并解压 uploads 可恢复候选人，备份约 39.97ms，手工恢复约 1.89ms。未发现 restore 脚本、生产 PostgreSQL restore 演练、恢复审批或权限模型。
- 涉及页面/API/数据表：`backend/scripts/backup_pilot_data.py`，数据库全表，uploads 原始简历。
- 真实用户影响：生产误删/损坏时依赖人工命令；谁能恢复、恢复到哪里、是否覆盖新数据、丢失窗口无法给业务明确承诺。
- 是否阻断试点：真实简历试点前应完成至少一次 PostgreSQL 恢复演练；否则阻断生产级试点。
- 修复建议：补 `restore_pilot_data.py` 或 runbook；演练 PostgreSQL `pg_restore` 到临时库并校验候选人和上传文件；定义 RTO/RPO、审批人、执行人、回滚验证清单。若每日备份，RPO 上限通常为 24h；需要更低丢失窗口则增加 WAL/增量备份。
- 是否需要补文档：需要，同步 `DEPLOYMENT.md` 和 `docs/06_试点上线检查清单.md` 的恢复步骤和权限。

### P1-9 候选人搜索是应用层全量扫描，缺少正式压测门槛

- 风险等级：P1
- 复现步骤：造 4000 条候选人（Alpha/Beta 各 2000），Alpha 负责人搜索 `rare-key`，只返回 Alpha 命中，隔离正确；但 org 内 2000 条 Python 层扫描耗时约 227.42ms。
- 涉及页面/API/数据表：候选人库搜索 `/api/candidates?search=...`；`candidates`、`candidate_tags`。
- 真实用户影响：数据量到 1 万/5 万简历时，搜索会随组织候选人数线性变慢，接口容易成为高频卡点。
- 是否阻断试点：不阻断 100-500 份简历的小试点；需要给试点规模设上限。
- 修复建议：为候选人搜索建立 DB 索引/全文搜索列；避免先 `query.all()` 再 Python 过滤；压测 1k/10k/50k 候选人下列表、搜索、BI、匹配耗时。
- 是否需要补文档：需要，同步试点数据规模上限和性能验收口径。

### P2-1 CORS/CSRF 基础方向正确，但 token 存 localStorage，XSS 后影响大

- 风险等级：P2
- 复现步骤：认证使用 `Authorization: Bearer`，不是 cookie session；CSRF 风险低。生产配置要求 CORS 白名单，相关测试通过。前端 token 存 `localStorage`，CSP 当前允许 `unsafe-inline`/`unsafe-eval`。
- 涉及页面/API/数据表：登录、所有 API；`frontend/src/lib/api.ts`、`frontend/src/lib/auth.tsx`、`backend/app/__init__.py`。
- 真实用户影响：一旦出现 XSS，攻击者可读 token 并调用 API；CSRF 不是主风险，XSS/token 保护才是主风险。
- 是否阻断试点：不阻断内部试点；生产建议收紧。
- 修复建议：收紧 CSP；长期改为 HttpOnly + SameSite cookie 或短 token + refresh token；增加 HSTS（可在 Nginx）。
- 是否需要补文档：需要，同步认证安全边界和生产反代安全头。

### P2-2 webhook、异步任务、外部通知目前没有真实入口，需明确“不在本轮上线范围”

- 风险等级：P2
- 复现步骤：路由清单未发现 webhook API；Celery 配置存在但未发现实际 `.delay()`/`apply_async` 业务任务；通知中心有列表和标记已读，但未发现面试排期自动发通知或外部消息发送。
- 涉及页面/API/数据表：通知中心 `/api/notifications`、`notifications`；配置 `CELERY_*`。
- 真实用户影响：当前不存在 webhook 重放导致重复写的入口，但用户也不会收到真实排期通知；未来接入后如果复用当前写接口，会继承幂等缺口。
- 是否阻断试点：不阻断无外部集成试点；若承诺 webhook/外部通知则阻断。
- 修复建议：文档明确本轮无 webhook/外部通知；未来新增 webhook 时必须有签名、时间戳、重放窗口、事件唯一 ID 和幂等表。
- 是否需要补文档：需要，同步上线范围和暂不支持项。

### P2-3 误淘汰可恢复当前阶段，但历史淘汰原因无法撤销或标记作废

- 风险等级：P2
- 复现步骤：误淘汰后再推进回 `interview` 返回 200，当前阶段恢复；`candidate_dispositions` 仍保留 1 条淘汰原因记录。
- 涉及页面/API/数据表：流程看板、候选人 journey；`pipeline_stages`、`candidate_dispositions`。
- 真实用户影响：候选人详情里仍可能看到旧淘汰理由，主管复盘时需要理解这是被撤回的历史记录。
- 是否阻断试点：不阻断。
- 修复建议：增加“撤销淘汰/标记处置作废”动作，保留审计但在当前决策摘要中排除已作废处置。
- 是否需要补文档：需要，同步反向操作规则。

### P2-4 发布回滚仍停留在文档/runbook 级别，缺少一键验证

- 风险等级：P2
- 复现步骤：文档提到保留上一可用版本和 systemd/gunicorn 部署，但本轮未发现自动回滚脚本或发布后健康检查脚本。
- 涉及页面/API/数据表：部署文档、systemd、前端 dist、后端服务。
- 真实用户影响：上线异常时依赖人工按文档切回，5 分钟回滚目标尚未被演练证明。
- 是否阻断试点：不阻断内部试点；生产试点建议补演练。
- 修复建议：增加发布清单：当前版本 tag、上一版本 tag、构建产物备份、DB 迁移策略、健康检查、回滚命令和演练记录。
- 是否需要补文档：需要，同步 `DEPLOYMENT.md` 的回滚演练步骤。

## 已通过但需持续回归的点

- 公开注册默认关闭。
- 停用账号 token 会立即被拒绝。
- 角色降级立即生效。
- 生产模式弱 JWT/CORS 空白配置会拒绝启动。
- 招聘专员不能跨负责人/跨企业读取候选人、岗位、AI 面试、匹配结果。
- 批量加入流程对已存在候选人具备基础幂等。
- 匹配重复运行会删除并重建该岗位匹配结果，数量不膨胀；仍需并发事务保护。
- 通知标记已读重复调用为 200，具备基础幂等。
- 候选人导出跨企业返回 404，并写 `candidate.exported` 审计。

## 试点判断

当前结论不是“生产可上线”。本轮结果更准确地说：

- 技术可运行：是，相关后端/前端测试通过。
- 产品可小范围内部试用：可以，但需限制为内部账号、少量简历、无外部通知/webhook、谨慎使用导出。
- 真实候选人数据试点：在 P0-1、P0-2、P1-3、P1-5、P1-8 处理前不建议开放。
- 生产可上线：否，还缺 AI 合规、生产配置、幂等、导出治理、恢复演练、正式压测和回滚演练。
