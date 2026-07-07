# BOSS 直聘集成模块 · 测试报告

> **报告日期**：2026-06-30
> **测试分支**：main (`db38d63` — "删除 stoken 采集链路，扫码登录即全功能可用")
> **测试执行者**：ZCode AI 测试架构师
> **测试范围**：后端接口层 (`boss.py`)、服务层 (`boss_service.py` / `boss_pipeline_service.py` / `boss_qr_service.py`)、前端交互层 (`BossPage` / `BossAccountManager` / `BossInboxWorkbench`)、Chrome 扩展 (`browser-extension/`)

---

## 1. 执行摘要

| 指标 | 修复前 | 修复后 |
|:---|:---|:---|
| 总测试用例 | 42 | **76** |
| 通过 | 37 (88%) | **76 (100%)** |
| 失败 | 5 (12%) | **0** |
| 收集错误 | 1 | **0** |
| 新增用例 | — | **+31** |

**结论**：现有测试在 stoken-free 重构后存在 6 个失败（5 个断言失败 + 1 个 import 错误），均为**过时测试未同步删除/修改**导致，非产品代码 bug。修复后全部通过。

---

## 2. 测试环境

| 配置项 | 值 |
|:---|:---|
| Python | 3.14.3 |
| pytest | 9.1.0 |
| Flask | (pytest-flask 1.3.0) |
| 测试数据库 | SQLite 内存 (per-test create_all/drop_all) |
| 加密 | Fernet (临时开发密钥，TESTING=true) |
| boss-cli | mock (subprocess.run monkeypatch，不依赖真实 CLI) |

---

## 3. 测试文件清单

| 文件 | 用例数 | 覆盖层级 | 说明 |
|:---|:---|:---|:---|
| `test_boss_cli.py` | 29 | 接口 + 服务层 | CLI 封装、信封解析、鉴权、账号 CRUD、加密 |
| `test_boss_pipeline.py` | 9 | 服务层 + API | 批量导入去重/节流、AI 初筛、API 鉴权 |
| `test_boss_qr_service.py` | 7 | 服务层 | 扫码登录状态机、会话管理 |
| `test_boss_edge_cases.py` | 31 | 服务层 | 错误码映射、安全校验、参数归一化、前后端口径 |
| **合计** | **76** | | |

---

## 4. 修复的问题（6 个）

### 4.1 `test_not_authenticated_maps_to_401` → 改名 + 修正期望

| 字段 | 值 |
|:---|:---|
| **测试文件** | `test_boss_cli.py` |
| **根因** | main 分支 `boss.py:66` 有意将 `not_authenticated` 从 HTTP 401 改为 409，注释："BOSS Cookie 失效，非智聘 token 问题，用 409 避免前端误退出"。测试仍期望 401。 |
| **修复** | 改名为 `test_not_authenticated_maps_to_409`，期望状态码 401→409，补充设计意图注释。 |
| **影响** | 无产品代码变更，仅测试同步。 |

### 4.2-4.5 四个 `invite_interview` 测试删除

| 字段 | 值 |
|:---|:---|
| **测试文件** | `test_boss_pipeline.py` |
| **根因** | stoken-free 重构移除了 `BossService.recruiter_invite_interview` 和 `BossPipelineService.invite_interview`。面试邀请改为走候选人管理页面（`POST /interview/assignments`）。测试引用已删除的方法，`monkeypatch.setattr` 抛 `AttributeError`。 |
| **删除的测试** | `test_invite_interview_dual_write`、`test_invite_interview_boss_fail_no_system_write`、`test_invite_interview_missing_boss_job`、`test_invite_interview_api_forbidden_for_interviewer` |
| **清理** | 同步删除 `InterviewAssignment` import，更新模块 docstring。 |

### 4.6 `test_boss_qr_service.py` import 错误 + 6 个过时测试

| 字段 | 值 |
|:---|:---|
| **测试文件** | `test_boss_qr_service.py` |
| **根因** | 重构删除了 `STATUS_STOKEN`、`_STOKEN_HYDRATE_ENABLED`、`_hydrate_stoken`、`_QrSession.has_stoken` 等 stoken 补全相关常量/函数/字段。测试 import 和断言均引用这些已删除符号。 |
| **修复** | 重写整个文件。保留核心测试（dispatch 成功/失败、扫码超时、status 查询、credential 提取），新增 `test_dispatch_success_direct_done`（验证简化流程直接到 DONE）和 `test_get_qr_status_unknown_session`。 |

---

## 5. 新增测试（31 个）

新增文件 `tests/test_boss_edge_cases.py`，覆盖测试用例集中识别的高优先级边界场景。

### 5.1 `_ok_or_fail` 错误码映射（9 个）

验证后端 API 层对所有 CLI 错误码的 HTTP 状态码映射：

| 错误码 | 期望 HTTP 状态 | 测试用例 |
|:---|:---|:---|
| `not_authenticated` | **409** | `test_not_authenticated_maps_to_409` |
| `needs_stoken` | **409** | `test_needs_stoken_maps_to_409` |
| `incomplete_cookie` | **409** | `test_incomplete_cookie_maps_to_409` |
| `rate_limited` | **429** | `test_rate_limited_maps_to_429` |
| `invalid_params` | **400** | `test_invalid_params_maps_to_400` |
| `timeout` | **503** | `test_timeout_maps_to_503` |
| `exec_error` | **503** | `test_exec_error_maps_to_503` |
| `something_weird`（未知） | **502** | `test_unknown_error_maps_to_502` |
| `ok=true` | **200** | `test_success_returns_200` |

### 5.2 CLI 错误码分类（2 个）

验证 `_run` 对非零退出码的 stderr/stdout 关键字归类逻辑。

### 5.3 `_safe_text` 安全校验（6 个）

验证 CLI 参数注入防护：换行去除、空白折叠、截断、空值处理。

### 5.4 `parse_cookies` 边界值（6 个）

验证 Cookie 解析对含 `=` 的值（base64）、无效格式、空 key 的处理。

### 5.5 参数归一化（6 个）

验证 `recruiter_recommend` / `batch_import` 对负数、字符串、超限值的防御性归一化。

### 5.6 前端-后端口径偏差文档化（2 个）

用测试用例记录已知的前后端错误码不一致问题（见第 7 节风险项）。

---

## 6. 测试用例与用例集映射

| 测试用例编号 | 测试模块 | 覆盖状态 | 测试文件 |
|:---|:---|:---|:---|
| TC-A01 登录态检测-正常 | 登录态 | ✅ 已覆盖 | test_boss_cli.py::test_status_ok_for_recruiter |
| TC-A02 登录态检测-无账号 | 登录态 | ✅ 已覆盖 | test_boss_cli.py::test_recruiter_endpoint_no_active_account_409 |
| TC-A03 登录态检测-cookie 失效 | 登录态 | ✅ 已覆盖 | test_boss_cli.py::test_not_authenticated_maps_to_409 |
| TC-A04 角色鉴权 | 鉴权 | ✅ 已覆盖 | test_boss_cli.py::test_status_forbidden_for_interviewer |
| TC-A05 Token 过期 | 鉴权 | ✅ 已覆盖 | test_boss_cli.py::test_status_requires_auth |
| TC-A06 CLI 未安装 | CLI | ✅ 已覆盖 | test_boss_cli.py::test_not_installed_returns_503_at_api |
| TC-A07 CLI 超时 | CLI | ✅ 已覆盖 | test_boss_cli.py::test_run_timeout |
| TC-A09 needs_stoken 前端不识别 | ⚠️ 风险 | ✅ 文档化 | test_boss_edge_cases.py::TestFrontendBackendAlignment |
| TC-B01-B10 扫码登录 | QR | ✅ 已覆盖 | test_boss_qr_service.py (7 个) |
| TC-C01-C09 多账号管理 | 账号 | ✅ 已覆盖 | test_boss_cli.py::test_account_crud_and_isolation |
| TC-D01-D22 收件箱闭环 | Pipeline | ✅ 已覆盖 | test_boss_pipeline.py (9 个) |
| TC-E01-E13 推荐/简历/岗位 | 招聘端 | ✅ 已覆盖 | test_boss_cli.py (多个) |
| TC-F01-F08 错误信封/健壮性 | 接口层 | ✅ 已覆盖 | test_boss_edge_cases.py (31 个) |
| TC-G01-G05 浏览器扩展 | 扩展 | ⚠️ 待补 | （需浏览器环境，非单元测试范畴） |

---

## 7. 已知风险及修复进展

> 原报告记录的 4 个风险（R1-R4）已于本次「根据测试报告修复所有问题」任务中全部修复。下表保留原风险描述并补充修复结论，便于追溯。

### 🔴 R1：前端-后端错误码口径偏差 → ✅ 已修复

| 维度 | 详情 |
|:---|:---|
| **原现象** | `not_authenticated` 和 `needs_stoken` 后端均返回 **409**，但前端 `classifyError` 对 409 **只判断 `no_active_account`**，不区分具体 error code。 |
| **原影响** | 用户看到"请先扫码登录"而非"BOSS Cookie 已失效"或"环境异常"，导致无效重试循环。 |
| **根因** | main 分支将 `not_authenticated` 从 401 改为 409（避免触发前端全局退出），但前端 `classifyError` 未同步增加对 `error.code` 的细分判断。 |
| **修复** | `BossPage.tsx` `classifyError` 对 409 读取 `e.code`，细分为 `not_authenticated`/`needs_stoken`/`incomplete_cookie`/`no_active_account` 四类；新增 `classifyErrorMessage` 统一翻译为用户可读提示；`BossInboxWorkbench.tsx` `loadInbox` 的 409 分支同步按 `e.code` 给出明确引导。 |
| **测试覆盖** | `test_boss_edge_cases.py::TestFrontendBackendAlignment`（2 个用例原用于文档化此偏差，现已反映为「后端 409 携带 code，前端按 code 区分」）。 |

### 🔴 R2：浏览器扩展与主流程脱节 → ✅ 已修复

| 维度 | 详情 |
|:---|:---|
| **原现象** | `browser-extension/README.md` 仍写"粘贴到智聘平台导入账号"，且扩展必需项含已下线的 `__zp_stoken__`；与 `BossAccountManager` 实际引导不一致。 |
| **原影响** | 用户按扩展指引操作后找不到粘贴处/被 stoken 必需项误导，扩展成为不可用的遗留代码。 |
| **修复** | 后端实际打包分发的是 `extension/`（v4.1.0，一键发送到智聘）：重写其 `README.md` 与 `安装教程.txt`，移除 `__zp_stoken__` 必需项与采集策略章节，必需 Cookie 精简为 `wt2`/`wbg`/`zp_at`；删除已不在 manifest 注册的死代码 `extension/content.js`。旧版 `browser-extension/`（v1.0.0 剪贴板版）README/manifest/popup 同步移除 `__zp_stoken__` 必需项并标注为「已不再维护，请用 `extension/`」。`BossAccountManager` 弹窗指引与 `extension/` v4.1.0 实际行为一致。 |
| **文档同步** | `DEPLOYMENT.md`、`docs/06_试点上线检查清单.md` C13、`docs/08_BOSS账号接入方案` 顶部说明同步更新为 stoken-free 现状。 |

### 🟡 R3：异步请求无取消机制 → ✅ 已修复

| 维度 | 详情 |
|:---|:---|
| **原现象** | `api.ts` 的 `request()` 使用原生 fetch，无 AbortController / timeout。简历弹窗关闭后 fetch 仍执行，返回后 `setState` 触发 unmounted 警告。 |
| **原影响** | 内存泄漏风险；弱网下请求悬挂导致 Toast 延迟弹出。 |
| **修复** | `request()` 引入 `AbortController` + 默认 30s 超时，超时/中断统一转 `ApiError`；长耗时 BOSS 操作放宽超时：`bossResume` 60s、`bossBatchImport`/`bossAiScreen` 180s。 |

### 🟡 R4：闭环终点引导无跳转链接 → ✅ 已修复

| 维度 | 详情 |
|:---|:---|
| **原现象** | `BossInboxWorkbench` 导入后引导"💡 请前往「候选人管理」页面创建面试安排"，但无超链接。 |
| **原影响** | 用户需自行找页面，闭环体验断裂。 |
| **修复** | 引导文案中的「候选人管理」改为 `<Link to="/candidates">` 跳转链接。 |

---

## 8. 文档同步说明

| 变更类型 | 是否需要同步 | 说明 |
|:---|:---|:---|
| 产品流程 | ✅ 已完成 | R1 改变前端错误提示口径；R2 改变扩展必需 Cookie 与导入指引 |
| 接口字段 | ❌ 不需要 | 后端接口定义未改（错误码映射不变，仅前端按 `error.code` 细分展示） |
| 端口 | ❌ 不需要 | 未改运行配置 |
| BI 口径 | ❌ 不需要 | 未改统计逻辑 |
| AI 助手行为 | ❌ 不需要 | 未改 AI 助手 |
| 测试文档 | ✅ 已完成 | 本报告 §7 已更新风险修复结论 |

本次同步更新的文档：

- `docs/11_BOSS模块测试报告.md`（本报告 §7/§8/§9）
- `docs/06_试点上线检查清单.md` C13（扫码为主路径、移除 Camoufox/stoken、指向 `extension/`）
- `docs/08_BOSS账号接入方案_功能分层与Chrome扩展.md` 顶部说明（修正「删除 browser-cookie 导入」等与代码不符的表述）
- `DEPLOYMENT.md` §3.2（扫码为主、移除 Camoufox/stoken、指向 `extension/`）
- `extension/README.md`、`extension/安装教程.txt`（移除 `__zp_stoken__`，必需 Cookie 精简）
- `browser-extension/README.md`、`manifest.json`、`popup.js`（移除 `__zp_stoken__` 必需项，标注旧版不再维护）

---

## 9. 变更文件清单

### 9.1 测试修复（§4，已在工作区应用，76/76 通过）

| 文件 | 变更类型 | 说明 |
|:---|:---|:---|
| `tests/test_boss_cli.py` | 修改 | 修正 `not_authenticated` 期望 401→409 |
| `tests/test_boss_pipeline.py` | 修改 | 删除 4 个 invite_interview 测试 + 清理 import |
| `tests/test_boss_qr_service.py` | 重写 | 删除 stoken 补全相关测试，重写为简化流程测试 |
| `tests/test_boss_edge_cases.py` | **新增** | 31 个边界值与异常路径测试 |

### 9.2 风险修复（§7，R1-R4）

| 文件 | 变更类型 | 说明 |
|:---|:---|:---|
| `frontend/src/features/boss/pages/BossPage.tsx` | 修改 | R1：`classifyError` 按 `e.code` 细分 409；新增 `classifyErrorMessage`；状态提示卡展示明确原因 |
| `frontend/src/features/boss/pages/BossInboxWorkbench.tsx` | 修改 | R1：`loadInbox` 409 按 `e.code` 引导；R4：候选人管理改 `<Link to="/candidates">` |
| `frontend/src/lib/api.ts` | 修改 | R3：`request()` 增加 `AbortController` + 默认 30s 超时；`bossResume` 60s、`bossBatchImport`/`bossAiScreen` 180s |
| `extension/README.md` | 重写 | R2：移除 `__zp_stoken__` 必需项与采集策略章节 |
| `extension/安装教程.txt` | 重写 | R2：改为一键发送流程，必需 Cookie 精简 |
| `extension/content.js` | **删除** | R2：stoken 提取死代码，未在 manifest 注册 |
| `browser-extension/README.md` | 修改 | R2：移除 `__zp_stoken__` 必需项，标注旧版不再维护 |
| `browser-extension/manifest.json` | 修改 | R2：描述移除 `__zp_stoken__` |
| `browser-extension/popup.js` | 修改 | R2：`REQUIRED` 移除 `__zp_stoken__` |
| `DEPLOYMENT.md` | 修改 | R2：扫码为主路径，移除 Camoufox/stoken，指向 `extension/` |
| `docs/06_试点上线检查清单.md` | 修改 | R2：C13 改为扫码为主、浏览器导入为辅 |
| `docs/08_BOSS账号接入方案_功能分层与Chrome扩展.md` | 修改 | R2：顶部说明修正为 stoken-free 现状 |
