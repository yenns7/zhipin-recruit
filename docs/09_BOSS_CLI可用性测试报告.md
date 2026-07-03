# BOSS CLI 可用性测试报告

> 测试时间: 2026-06-29
> 测试环境: macOS arm64, Python 3.14.3, boss-cli (GitHub HEAD)
> 测试 Cookie: 仅需 `wt2` + `wbg` + `zp_at`（不需要 `__zp_stoken__`）

---

## 一、BOSS CLI 全部能力清单

### 1.1 Tier-1 功能（✅ 可用，仅需 session cookies）

| # | CLI 命令 | 功能 | API 端点 | 测试结果 |
|---|----------|------|----------|----------|
| 1 | `boss status` | 登录态检测 | `GET /api/boss/status` | ✅ |
| 2 | `boss recruiter jobs` | 岗位列表 | `GET /api/boss/jobs` | ✅ |
| 3 | `boss recruiter inbox` | 收件箱/沟通列表 | `GET /api/boss/candidates/inbox` | ✅ |
| 4 | `boss recruiter recommend` | 推荐候选人 | `GET /api/boss/candidates/recommend` | ✅ |
| 5 | `boss recruiter labels` | 候选人标签列表 | - | ✅ |
| 6 | `boss recruiter resume` | 查看简历 | `GET /api/boss/candidates/<id>/resume` | ✅ |
| 7 | `boss recruiter resume-download` | 下载简历 Markdown | `GET /api/boss/candidates/<id>/resume/download` | ✅ |
| 8 | `boss recruiter chat` | 聊天记录 | - | ✅ |
| 9 | `boss recruiter export` | 导出候选人列表 | - | ✅ |
| 10 | `boss recruiter geek` | 候选人详情 | - | ✅ |

### 1.2 Tier-2 功能（❌ 不可用，需要 `__zp_stoken__`）

| # | CLI 命令 | 功能 | 错误码 | 说明 |
|---|----------|------|--------|------|
| 11 | `boss recruiter search` | 搜索候选人 | `code=37` | 反爬机制拦截 |
| 12 | `boss recruiter greet` | 打招呼 | `code=37` | 需要客户端 token |
| 13 | `boss recruiter reply` | 发送消息 | `code=37` | 需要客户端 token |
| 14 | `boss recruiter request-resume` | 请求简历 | `code=37` | 需要客户端 token |
| 15 | `boss recruiter invite-interview` | 邀请面试 | `code=37` | 需要客户端 token |
| 16 | `boss recruiter job-close` | 关闭职位 | `code=37` | 需要客户端 token |
| 17 | `boss recruiter job-reopen` | 开启职位 | `code=37` | 需要客户端 token |
| 18 | `boss recruiter mark-unsuitable` | 标记不合适 | `code=37` | 需要客户端 token |
| 19 | `boss recruiter batch-view` | 批量查看 | `code=37` | 依赖 search |
| 20 | `boss recruiter exchange-phone` | 交换手机号 | `code=37` | 需要客户端 token |
| 21 | `boss recruiter exchange-wechat` | 交换微信 | `code=37` | 需要客户端 token |

---

## 二、前端功能页面

### 2.1 当前保留的页面（全部可用）

| 页面 | 功能 | 状态 |
|------|------|------|
| `BossPage.tsx` | BOSS 直聘主页面 | ✅ 保留 |
| ├─ 收件箱·闭环 | 拉取→批量导入→AI初筛 | ✅ 可用 |
| ├─ 推荐候选人 | 查看推荐列表、简历 | ✅ 可用 |
| └─ 岗位列表 | 查看在招岗位 | ✅ 可用 |
| `BossInboxWorkbench.tsx` | 收件箱工作台 | ✅ 保留 |
| `BossAccountManager.tsx` | 账号管理+能力展示 | ✅ 保留 |

### 2.2 已移除的功能（无需代码）

以下功能在前端和后端均无实现代码：

- ❌ 搜索候选人（前端无搜索页面）
- ❌ 打招呼/发消息（前端无消息发送功能）
- ❌ 请求简历（前端无此功能）
- ❌ 邀请面试（前端使用系统内安排，不调用 BOSS API）
- ❌ 关闭/开启职位（前端无此功能）
- ❌ 标记不合适（前端无此功能）
- ❌ 交换手机号/微信（前端无此功能）

---

## 三、后端 API 端点

### 3.1 当前保留的端点（全部可用）

| 端点 | 方法 | 功能 | 状态 |
|------|------|------|------|
| `/api/boss/status` | GET | 登录态检测 | ✅ |
| `/api/boss/login/browser-cookie` | POST | Cookie 导入 | ✅ |
| `/api/boss/jobs` | GET | 岗位列表 | ✅ |
| `/api/boss/candidates/recommend` | GET | 推荐候选人 | ✅ |
| `/api/boss/candidates/inbox` | GET | 收件箱 | ✅ |
| `/api/boss/candidates/<id>/resume` | GET | 简历详情 | ✅ |
| `/api/boss/candidates/<id>/resume/download` | GET | 简历下载 | ✅ |
| `/api/boss/candidates/batch-import` | POST | 批量导入 | ✅ |
| `/api/boss/candidates/ai-screen` | POST | AI 初筛 | ✅ |
| `/api/boss/accounts` | GET | 账号列表 | ✅ |
| `/api/boss/accounts/<id>/activate` | POST | 切换账号 | ✅ |
| `/api/boss/accounts/<id>` | DELETE | 删除账号 | ✅ |
| `/api/boss/accounts/<id>/verify` | POST | 校验账号 | ✅ |
| `/api/boss/extension/download` | GET | 扩展下载 | ✅ |

### 3.2 未实现的端点（对应不可用功能）

以下端点不存在（因为功能不可用）：

- ❌ `/api/boss/candidates/search` — 搜索候选人
- ❌ `/api/boss/candidates/<id>/greet` — 打招呼
- ❌ `/api/boss/candidates/<id>/reply` — 发送消息
- ❌ `/api/boss/candidates/<id>/request-resume` — 请求简历
- ❌ `/api/boss/candidates/<id>/invite-interview` — 邀请面试
- ❌ `/api/boss/jobs/<id>/close` — 关闭职位
- ❌ `/api/boss/jobs/<id>/reopen` — 开启职位

---

## 四、功能可用性总览表

| 功能类别 | 功能名称 | 可用状态 | 说明 |
|----------|----------|----------|------|
| **账号管理** | 导入 Cookie | ✅ | 直接保存，无需验证 |
| **账号管理** | 切换账号 | ✅ | 多账号切换 |
| **账号管理** | 删除账号 | ✅ | - |
| **账号管理** | 校验登录态 | ✅ | - |
| **账号管理** | 下载扩展 | ✅ | ZIP 包下载 |
| **招聘管理** | 查看岗位列表 | ✅ | 返回在招岗位 |
| **候选人管理** | 查看收件箱 | ✅ | 沟通中的候选人 |
| **候选人管理** | 查看推荐候选人 | ✅ | 推荐列表 |
| **候选人管理** | 查看候选人简历 | ✅ | JSON 格式 |
| **候选人管理** | 下载简历 | ✅ | Markdown 文件 |
| **候选人管理** | 导出候选人列表 | ✅ | JSON/CSV 格式 |
| **候选人管理** | 批量导入候选人 | ✅ | 导入到系统 |
| **候选人管理** | AI 简历初筛 | ✅ | LLM 评估 |
| **候选人管理** | 搜索候选人 | ❌ | 需要 `__zp_stoken__` |
| **沟通管理** | 查看聊天记录 | ✅ | - |
| **沟通管理** | 发送消息 | ❌ | 需要 `__zp_stoken__` |
| **沟通管理** | 打招呼 | ❌ | 需要 `__zp_stoken__` |
| **沟通管理** | 交换手机号 | ❌ | 需要 `__zp_stoken__` |
| **沟通管理** | 交换微信 | ❌ | 需要 `__zp_stoken__` |
| **流程管理** | 邀请面试 | ❌ | 需要 `__zp_stoken__`，系统内安排替代 |
| **流程管理** | 请求简历 | ❌ | 需要 `__zp_stoken__` |
| **流程管理** | 关闭职位 | ❌ | 需要 `__zp_stoken__` |
| **流程管理** | 开启职位 | ❌ | 需要 `__zp_stoken__` |
| **流程管理** | 标记不合适 | ❌ | 需要 `__zp_stoken__` |

---

## 五、统计汇总

| 分类 | 数量 | 占比 |
|------|------|------|
| ✅ 可用功能 | 14 项 | 56% |
| ❌ 不可用功能 | 11 项 | 44% |
| **Tier-1 通过率** | **14/14** | **100%** |
| **Tier-2 通过率** | **0/11** | **0%** |

---

## 六、前端代码现状

经检查，前端和后端代码中**不存在任何不可用功能的实现**：

- ✅ 无搜索候选人页面/组件
- ✅ 无消息发送功能
- ✅ 无请求简历功能
- ✅ 无邀请面试功能（使用系统内安排）
- ✅ 无关闭/开启职位功能
- ✅ 无标记不合适功能
- ✅ 无交换手机号/微信功能

**结论：无需移除任何代码，当前实现仅包含可用功能。**

---

## 七、Cookie 需求

| Cookie | 必需 | 说明 |
|--------|------|------|
| `wt2` | ✅ | 服务端会话 cookie |
| `wbg` | ✅ | 登录标识 |
| `zp_at` | ✅ | 访问 token |
| `__zp_stoken__` | ❌ | 不再需要，客户端 JS 生成的短效 token |

---

## 八、结论

| 维度 | 评估 |
|------|------|
| **Tier-1 功能** | ✅ 100% 可用（14/14） |
| **Tier-2 功能** | ❌ 不可用（需要 `__zp_stoken__`） |
| **前端代码** | ✅ 仅包含可用功能，无需移除 |
| **后端代码** | ✅ 仅包含可用功能，无需移除 |
| **用户体验** | ✅ 核心招聘流程完整可用 |

**总体评估**: 当前实现已完成代码瘦身，仅保留可用功能。Tier-1 功能覆盖招聘专员核心工作流程（查看岗位、收件箱、推荐候选人、简历管理、批量导入、AI 初筛），可以进行试点上线。
