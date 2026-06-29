# `__zp_stoken__` 过期原因与功能可用性分析

> 版本：v1.0 | 日期：2026-06-29
> 背景：为什么刚采集的 Cookie 很快就失效，以及过期后哪些功能仍然可用。

> **2026-06-29 更新：stoken 采集链路已从系统中移除**
>
> 本分析直接驱动了系统简化决策：stoken 无法稳定持有 → 删除所有依赖 stoken 的功能 →
> 扫码登录成为唯一登录方式，登录后全功能可用。本文件保留作为技术参考。

---

## 一、`__zp_stoken__` 是什么

BOSS 直聘的鉴权体系分两层，这两层 Cookie 的生成方式完全不同：

| Cookie | 生成方 | 方式 | 特性 |
|--------|--------|------|------|
| `wt2` / `wbg` / `zp_at` | 服务端 | 登录成功后由 HTTP 响应 `Set-Cookie` 写入 | HttpOnly，浏览器不可用 JS 读取，随登录会话有效，有效期较长（数天到数周） |
| `__zp_stoken__` | 客户端浏览器 | 页面 JS 在浏览器环境中动态生成，写入 `document.cookie` | **非 HttpOnly，有效期极短**，是 BOSS 反爬机制的核心 |

---

## 二、为什么刚采集的 stoken 很快就过期

### 2.1 根本原因：stoken 是浏览器行为指纹，不是登录凭证

`__zp_stoken__` 不是"账号登录成功后颁发的 token"，而是 BOSS 反爬系统为了证明"当前请求来自真实浏览器用户"而生成的**短效行为令牌**。其核心逻辑如下：

```
浏览器打开 BOSS 页面
  → 加载页面 JS
    → JS 收集当前浏览器环境特征（时间戳 + 指纹 + 行为熵）
      → 生成 stoken 并写入 document.cookie
        → stoken 跟随后续请求头发给 BOSS 服务端
          → 服务端校验 stoken 合法性 + 时效性
```

它的短效性是**故意设计**的：

1. **时间戳绑定**：stoken 内嵌生成时刻的时间戳，服务端校验时会比较"距生成时刻过了多久"，超过窗口（通常几分钟到十几分钟）即判为过期。
2. **会话绑定**：stoken 与当时的浏览器 Session 上下文绑定，脱离原浏览器后，服务端对比上下文会失败。
3. **页面交互触发刷新**：用户每次在 BOSS 工作台点击、翻页、刷新，JS 都会重新生成一个新的 stoken 覆盖旧值。采集到的那一刻是最新的，但几分钟后浏览器已经刷新为更新的值，服务端也同步更新了期望值，旧值就失效了。

### 2.2 采集时机放大了这个问题

Chrome 扩展的采集流程是：

```
用户打开扩展弹窗
  → background.js 返回 webRequest 最近一次抓到的 Cookie 请求头
    → 用户点「采集并复制」
      → 粘贴到智聘平台导入
```

这个流程有 **2～5 分钟的时间差**（操作 + 粘贴 + 保存）。在这段时间内，只要用户在 BOSS 页面有任何翻页/刷新动作，stoken 就已经被更新了。导入时保存的是旧值，立即用就可能已经过期。

### 2.3 为什么服务端 Cookie 不受影响

`wt2` / `wbg` / `zp_at` 是服务端签发的会话凭证，类似传统的 Session Token：

- 由服务端决定过期时间，通常数天到数周
- 不依赖浏览器环境，只要账号没退出登录就持续有效
- 这就是为什么 Tier-1 功能（纯查看类）即使 stoken 过期也能正常使用

---

## 三、stoken 过期后哪些功能还能用

### ✅ Tier-1：stoken 过期后完全可用

这些接口 BOSS 服务端只校验 `wt2`/`wbg`/`zp_at`（会话合法性），**不验证 stoken**。

| 功能 | CLI 命令 | API 端点 | 说明 |
|------|----------|----------|------|
| 状态检测 | `boss status` | `GET /api/boss/status` | 检测账号是否在线 |
| 职位列表 | `boss recruiter jobs` | `GET /api/boss/jobs` | 查看自己发布的岗位 |
| 收件箱/沟通列表 | `boss recruiter inbox` | `GET /api/boss/candidates/inbox` | 查看谁投递/沟通过，105 人正常返回 |
| 候选人标签 | `boss recruiter labels` | — | 全部标签列表 |
| 推荐候选人列表 | `boss recruiter recommend` | `GET /api/boss/candidates/recommend` | 104 人正常返回 |
| 查看简历详情 | `boss recruiter resume <gid>` | `GET /api/boss/candidates/:id/resume` | 完整 JSON 简历 |
| 下载简历 Markdown | `boss recruiter resume-download <gid>` | `GET /api/boss/candidates/:id/resume/download` | 导出 .md 文件 |
| 查看聊天记录 | `boss recruiter chat <fid>` | — | 历史消息记录 |
| 导出全量候选人 | `boss recruiter export` | — | JSON/CSV 全量导出 |
| 候选人详情(legacy) | `boss recruiter geek <gid>` | — | 旧版详情命令 |
| 账号管理 CRUD | — | `GET/POST/DELETE /api/boss/accounts/*` | 添加/切换/删除账号 |
| 登录指引 | — | `GET /api/boss/login/guide` | 安装说明、CLI 路径 |

**实测数据（2026-06-29，stoken 过期状态下）**：以上全部接口 100% 通过，无失败。

### ❌ Tier-2：stoken 过期后完全不可用

这些接口 BOSS 服务端校验 `__zp_stoken__`，缺失或过期时返回 `code=37`（环境异常）或 `code=2`（非法参数）。

| 功能 | CLI 命令 | API 端点 | 失败表现 |
|------|----------|----------|----------|
| 搜索候选人 | `boss recruiter search "关键词"` | `GET /api/boss/candidates/search` | 返回空结果，`code=37` |
| 打招呼 | `boss recruiter greet <gid>` | `POST /api/boss/candidates/:id/greet` | `code=2` 未知非法参数 |
| 发送消息 | `boss recruiter reply <fid> <msg>` | `POST /api/boss/chat/:id/reply` | 缺少必要参数 |
| 请求简历 | `boss recruiter request-resume <fid>` | `POST /api/boss/candidates/:id/request-resume` | 缺少必要参数 |
| 邀请面试 | `boss recruiter invite-interview <gid>` | `POST /api/boss/candidates/invite-interview` | `code=-1` Unknown error |
| 关闭职位 | `boss recruiter job-close <jid>` | `POST /api/boss/jobs/:id/close` | 需 stoken（未实际测试） |
| 开启职位 | `boss recruiter job-reopen <jid>` | `POST /api/boss/jobs/:id/reopen` | 需 stoken（未实际测试） |
| 批量查看 | `boss recruiter batch-view <kw>` | — | 内部依赖 search，间接失败 |
| 标记不合适 | `boss recruiter mark-unsuitable` | — | 需 stoken |
| AI 筛选 + 批量导入 | — | `POST /api/boss/candidates/batch-import` | 批量导入本身可执行，但后续打招呼动作失败 |

**规律总结**：所有**写操作**（打招呼、发消息、邀面试、改变状态）和**主动外联操作**（搜索新候选人）都需要 stoken，所有**被动查看操作**（查收件箱、看简历、下载记录）不需要。

---

## 四、如何恢复 Tier-2 功能

stoken 的有效窗口很短，**建议采集后立即导入，不要超过 2 分钟**。

### 方法一：Chrome 扩展重新采集（推荐）

1. 在浏览器打开 BOSS 招聘端 → `https://www.zhipin.com/web/chat/recommend`
2. 在页面上点一下「推荐」或「沟通」（触发网络请求，让 background.js 抓到最新 Cookie）
3. 立即点击扩展图标 → 「采集并复制」
4. 在 30 秒内粘贴到智聘「账号管理 → 导入 Cookie」

### 方法二：补充 Cookie（stoken 单独更新）

如果已有账号，只需补充 stoken，不必重新完整导入：

```bash
# 只把最新的 __zp_stoken__ 值提交给补充接口
POST /api/boss/accounts/<account_id>/supplement-cookie
{
  "cookies": "__zp_stoken__=<最新值>; wt2=<原值>; wbg=<原值>; zp_at=<原值>"
}
```

### 方法三：油猴脚本手动复制

安装 Tampermonkey 脚本，在 BOSS 页面点击「复制 Cookie」，操作窗口比扩展更短，建议采集后**立即**回到智聘平台粘贴。

---

## 五、运营建议

| 场景 | 建议 |
|------|------|
| 每天批量打招呼/邀面试 | 操作前先刷新 stoken，建议设置"操作前检查"提示 |
| 日常查看收件箱/简历 | 无需关心 stoken，Tier-1 功能全天可用 |
| stoken 失效提示 | 前端收到 `code=needs_stoken`（HTTP 409）时，弹出引导扩展采集的 banner，而不是直接报错 |
| 多账号场景 | 每个账号独立存储 stoken，切换账号需单独校验有效性 |
| 自动化流水线 | 批量导入 + AI 筛选可在 stoken 有效期内一次性完成，避免中途过期 |

---

## 六、技术摘要

```
Cookie 有效期对比
─────────────────────────────────────────────────────────
wt2 / wbg / zp_at   服务端会话 Cookie   有效期：数天～数周
__zp_stoken__        客户端行为指纹      有效期：数分钟（业务操作触发刷新）
─────────────────────────────────────────────────────────

Tier-1（只需会话 Cookie）：查看类操作全部可用
Tier-2（需 stoken）       ：所有写操作 + 主动搜索
```

**结论**：stoken 过期是 BOSS 反爬机制的预期行为，无法绕过。系统已按功能分层设计，Tier-1 日常使用不受影响；Tier-2 操作前刷新一次 stoken 即可恢复，整个操作耗时不超过 1 分钟。
