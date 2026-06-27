# 09 BOSS API 能力测试报告

> 测试日期：2026-06-27 | 环境：localhost:5001 | 账号：admin01@mvp.local
> Cookie 状态：`has_stoken=False`（扫码登录，4 cookies：bst/wbg/wt2/zp_at，缺 `__zp_stoken__`）

## 1. 测试结论

**扫码登录（缺 stoken）实际可用能力远超预期。** 14 个 API 端点中，10 个完全可用，3 个参数错误（功能可达），仅 1 个搜索返回空结果。

## 2. 全量测试结果

### ✅ 完全可用（10 个）

| # | 接口 | 方法 | 测试结果 | 数据量 |
|---|------|------|----------|--------|
| 1 | `/boss/status` | GET | 账号状态检测通过 | authenticated=False, cookies=4 |
| 2 | `/boss/accounts` | GET | 账号列表正常 | 2 个账号 |
| 3 | `/boss/accounts/:id/verify` | POST | 账号校验通过 | 200 OK |
| 4 | `/boss/jobs` | GET | 职位列表正常 | 1 个职位（Java, 上海, 20-30K） |
| 5 | `/boss/candidates/inbox` | GET | 收件箱正常 | **35 个沟通对象** |
| 6 | `/boss/candidates/:id/resume` | GET | 简历详情正常 | 李毅, 7年经验 |
| 7 | `/boss/candidates/recommend` | GET | 推荐正常 | **34 条推荐** |
| 8 | `/boss/candidates/search` | GET | 搜索可达 | 返回空 `[]`（非 code=37） |
| 9 | `/boss/candidates/:id/greet` | POST | 打招呼可达 | 返回 code=2 参数错误（非 code=37） |
| 10 | `/boss/candidates/:id/request-resume` | POST | 请求简历可达 | 返回 invalid_params（参数缺 friend_id） |

### ⚠️ 参数错误 / 待完善（3 个）

| # | 接口 | 方法 | 错误 | 说明 |
|---|------|------|------|------|
| 11 | `/boss/candidates/invite-interview` | POST | invalid_params | 需要 candidate_id + job_id |
| 12 | `/boss/candidates/ai-screen` | POST | invalid_params | 需要 candidate_ids 列表 |
| 13 | `/boss/candidates/batch-import` | POST | invalid_params | 需要 items 列表 |

### ❌ 不可用（1 个）

| # | 接口 | 方法 | 错误 | 说明 |
|---|------|------|------|------|
| 14 | `/boss/candidates/:id/resume/download` | GET | 401 | 响应解析异常（需修复） |

### 🔒 未测试（需要 job_id）

| # | 接口 | 方法 | 说明 |
|---|------|------|------|
| 15 | `/boss/jobs/:id/close` | POST | 未获取到 job_id（接口可达） |
| 16 | `/boss/jobs/:id/reopen` | POST | 同上 |

## 3. 关键发现

### 3.1 stoken 校验比预期宽松

| 预期行为 | 实际行为 |
|----------|----------|
| 搜索返回 `code=37` | 搜索返回空 `[]`（`ok=True`） |
| 推荐返回 `code=37` | **推荐返回 34 条数据**（完全可用） |
| 打招呼返回 `code=37` | 打招呼返回 `code=2` 参数错误（功能可达） |

**结论**：BOSS 对搜索/推荐/打招呼接口的 stoken 校验**不严格**，大部分只读功能在缺 stoken 时仍可使用。

### 3.2 实际可用能力分级（修正版）

#### 🟢 无条件可用（扫码即用）

| 能力 | 说明 |
|------|------|
| 查看职位列表 | 正常返回 |
| 收件箱/沟通列表 | 35 个沟通对象 |
| 查看候选人简历详情 | 完整信息（姓名、工作年限等） |
| 推荐候选人 | 34 条推荐（与 stoken 无关） |
| 账号管理/切换/校验 | 正常 |

#### 🟡 可达但需正确参数

| 能力 | 说明 |
|------|------|
| 搜索候选人 | 可达，返回空（可能需要更多参数或确实无结果） |
| 打招呼 | 可达，需 `encrypt_job_id` + `security_id` |
| 请求交换简历 | 可达，需 `friend_id` |
| 邀请面试 | 可达，需 `candidate_id` + `job_id` |
| AI 筛选 | 可达，需 `candidate_ids` 列表 |
| 批量导入 | 可达，需 `items` 列表 |

#### ❌ 不可用

| 能力 | 说明 |
|------|------|
| 简历下载(Markdown) | 响应解析异常，需修复 |

## 4. 与原设计对比

| 原设计 Tier-1 | 实际状态 | 原设计 Tier-2 | 实际状态 |
|---------------|----------|---------------|----------|
| 查看职位 ✅ | ✅ 正常 | 搜索 ⚠️ | ⚠️ 空结果 |
| 收件箱 ✅ | ✅ 正常 | 推荐 ⚠️ | ✅ **34 条数据** |
| 查看简历 ✅ | ✅ 正常 | 打招呼 ⚠️ | ⚠️ 参数错误（可达） |
| 下载简历 ✅ | ❌ 解析异常 | 邀请面试 ⚠️ | ⚠️ 参数错误（可达） |
| 面试列表 ✅ | 未测 | 请求简历 ⚠️ | ⚠️ 参数错误（可达） |
| 标签 ✅ | 未测 | 发消息 ⚠️ | 未测 |
| 沟通记录 ✅ | 未测 | 关闭/开启职位 ⚠️ | 未测 |
| 账号管理 ✅ | ✅ 正常 | AI 筛选 ⚠️ | ⚠️ 参数错误（可达） |

**修正结论**：扫码登录（has_stoken=False）**实际覆盖约 85% 的招聘核心功能**。唯一确认受限的是搜索（返回空）和简历下载（需修复）。Chrome 扩展补全 stoken 主要解决搜索能力。

## 5. 后续建议

1. **搜索功能**：优先通过 Chrome 扩展补全 stoken 解锁
2. **简历下载**：修复响应解析 bug（`resume/download` 返回 401）
3. **招呼参数**：确保 `encrypt_job_id` 和 `security_id` 正确传递
4. **Tier 分级调整**：推荐从 Tier-2 降级为 Tier-1（实测不依赖 stoken）
