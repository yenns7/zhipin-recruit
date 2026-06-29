# 08 BOSS 账号接入方案：功能分层与 Chrome 浏览器扩展

> 版本：v1.0 | 日期：2026-06-27 | 状态：实施完成

> **2026-06-29 重大更新：stoken 采集链路已全部移除**
>
> 经分析，`__zp_stoken__` 是短效 JS 指纹（数分钟有效），云端环境无法稳定持有。
> 已删除 Tier-2 功能和整条 stoken 采集链路（Chrome 扩展、油猴脚本、browser-cookie 导入、supplement-cookie 补全、Camoufox 补全）。
> 扫码登录成为唯一登录方式，登录后 Tier-1 功能全可用。
> 下文 Tier-1/Tier-2 分层说明保留作为技术参考。

### 变更记录

| 日期 | 变更 |
|------|------|
| 2026-06-27 | 初始版本：功能分层 + Chrome 扩展 + 实施 |
| 2026-06-29 | 新增油猴脚本（Tampermonkey）采集路径，不连服务器、复制粘贴导入；规避 Chrome 扩展写死 localhost 的部署限制 |
| 2026-06-29 | 扩展 v3.0.0：采集机制改为 `chrome.webRequest` 抓请求头（绕开受管控环境 `chrome.cookies` 失效问题），数据流改为复制到剪贴板、用户粘贴导入，不再连后端 |
| 2026-06-29 | 收敛为单一采集路径：移除油猴脚本及其下载接口/前端入口，产品 UI 只保留 Chrome 扩展；前端导入弹窗简化为三步指引 |

## 1. 背景与问题

### 1.1 现状

BOSS 直聘账号接入有两条路径：

| 路径 | 方式 | 优势 | 问题 |
|------|------|------|------|
| 扫码登录 | 手机 BOSS App 扫码 → 服务端 HTTP 获取 cookie | 用户体验好、无需装插件 | **拿不到 `__zp_stoken__`**（由浏览器 JS 动态生成），导致搜索/打招呼/邀面试等核心写操作被 BOSS `code=37 环境异常` 拦截 |
| 浏览器导入 | 手动复制 Cookie 粘贴到智聘 | 能拿到完整 Cookie（含 stoken） | 用户操作繁琐，需打开 DevTools |

### 1.2 根因分析

BOSS 直聘的反爬机制分两层：

1. **会话 Cookie**（`wt2`/`wbg`/`zp_at`）：服务端 HttpOnly，纯 HTTP 扫码即可获取
2. **`__zp_stoken__`**：由页面 JavaScript 在浏览器环境中动态生成，无法通过纯 HTTP 获取

没有 stoken 时，BOSS 对搜索、打招呼、发消息、邀面试等接口返回 `code=37`，即「环境异常」。

### 1.3 目标

**扫码登录即可用核心查看功能，扩展补全后解锁全部能力。** 不再因缺 stoken 阻断整个流程。

---

## 2. 功能分级

### 2.1 分级原则

- **Tier-1（扫码可用）**：仅依赖会话 cookie 鉴权，BOSS 不校验 stoken
- **Tier-2（需完整 Cookie）**：BOSS 校验 `__zp_stoken__`，缺失返回 `code=37`

### 2.2 功能分级表

#### 🟢 Tier-1：扫码登录即可用

| 能力 | API 路由 | 说明 |
|------|----------|------|
| 查看我的职位列表 | `GET /boss/jobs` | 查自己发布的岗位 |
| 查看收件箱/沟通列表 | `GET /boss/candidates/inbox` | 谁投递/沟通过 |
| 查看候选人简历详情 | `GET /boss/candidates/:id/resume` | 被动查看（候选人收到「被查看」） |
| 下载简历 Markdown | `GET /boss/candidates/:id/resume/download` | 导出简历 |
| 查看面试列表 | `boss_cli interview-list` | 已安排的面试 |
| 查看候选人标签 | `boss_cli labels` | 标签管理 |
| 查看沟通记录 | `boss_cli chat` | 聊天历史 |
| 账号管理/切换/校验/删除 | `CRUD /boss/accounts/*` | 多账号管理 |

**技术依据**：这些接口走 BOSS wapi 会话鉴权（wt2/wbg/zp_at），BOSS 服务端不校验 stoken。

#### 🔴 Tier-2：需要完整 Cookie（含 `__zp_stoken__`）

| 能力 | API 路由 | 失败表现 |
|------|----------|----------|
| 搜索候选人 | `GET /boss/candidates/search` | 返回空结果或 code=37 |
| 推荐候选人 | `GET /boss/candidates/recommend` | code=37 |
| 打招呼 | `POST /boss/candidates/:id/greet` | code=37 |
| 发消息/回复 | `POST /boss/chat/:id/reply` | code=37 |
| 邀请面试 | `POST /boss/candidates/invite-interview` | code=37 |
| 请求交换简历 | `POST /boss/candidates/:id/request-resume` | code=37 |
| 关闭/开启职位 | `POST /boss/jobs/:id/close\|reopen` | code=37 |
| 批量导入候选人 | `POST /boss/candidates/batch-import` | code=37 |
| AI 筛选 | `POST /boss/candidates/ai-screen` | code=37 |

**技术依据**：boss_cli 源码中这些命令挂了 `_chat_action_hint`（stoken 提示），BOSS 服务端对这些接口校验 `__zp_stoken__` 防爬。

### 2.3 用户体验流程

```
用户首次接入
    │
    ▼
┌─────────────────┐
│  扫码登录        │ ← 推荐方式，体验最好
│  (手机 BOSS 扫码) │
└────────┬────────┘
         │ 扫码成功
         ▼
┌─────────────────┐
│  账号已保存      │ ← has_stoken=False，Tier-1 立即可用
│  Tier-1 功能解锁  │
└────────┬────────┘
         │ 用户需要 Tier-2 功能（如搜索/打招呼）
         ▼
┌─────────────────┐
│  引导安装扩展    │ ← 前端灰显 Tier-2 + 提示「安装扩展解锁」
│  (一键采集 Cookie) │
└────────┬────────┘
         │ 安装扩展 → 在 BOSS 页面点击扩展
         ▼
┌─────────────────┐
│  Cookie 补全     │ ← has_stoken=True，全功能解锁
│  全功能解锁      │
└─────────────────┘
```

---

## 3. 技术方案：Chrome 浏览器扩展

> v3.0.0 起，扩展采集机制从 `chrome.cookies` 改为 `chrome.webRequest` 抓请求头，
> 数据流从「POST 到后端」改为「复制到剪贴板，用户手动粘贴」。原因见 3.1。

### 3.1 采集机制演进与选型

| 方案 | 可行性 | 问题 |
|------|--------|------|
| camoufox 无头浏览器 | ❌ | BOSS 反爬检测，stoken 生成不稳定（已验证失败） |
| 油猴脚本 `GM_cookie` | ⚠️ | 读 HttpOnly 依赖脚本管理器权限，部分环境拿不到 wt2/wbg/zp_at（已验证失败） |
| 扩展 `chrome.cookies.getAll` | ⚠️ | **部分环境（企业策略/安全管控）下 API 读不到任何 cookie，`getAll({})` 返回 0**（已在实测机器验证） |
| **扩展 `chrome.webRequest` 抓请求头** | ✅ | **从页面发出的请求头里抓完整 Cookie（含 HttpOnly），是浏览器原生行为，不受 cookies API 限制，最可靠** |

关键认知：`wt2`/`wbg`/`zp_at` 是 HttpOnly 会话 cookie，网页脚本（`document.cookie`）读不到；而 `chrome.cookies` API 在受管控环境下可能整体失效。浏览器**发请求时请求头 `Cookie:` 里天然带全部 cookie**（否则无法维持登录），因此监听请求头是唯一不受这两类限制的采集方式。

### 3.2 扩展架构（v3.0.0）

```
┌──────────────────────────────────────────────────────────────┐
│                    Chrome 扩展 MV3                           │
├──────────────────────────────────────────────────────────────┤
│  ┌─────────────┐         ┌──────────────────────────────┐   │
│  │  Popup UI   │────────>│ Background Service Worker     │   │
│  │  (点击图标) │ 取缓存  │ webRequest.onBeforeSendHeaders│   │
│  └──────┬──────┘         │ 监听 *.zhipin.com 请求        │   │
│         │                │ → 抓 Cookie 请求头并缓存      │   │
│         │                │   (含 HttpOnly wt2/wbg/zp_at) │   │
│         │                └──────────────────────────────┘   │
│         │                ┌──────────────────────────────┐   │
│         │  stoken 兜底   │ content.js（注入 BOSS 页）    │   │
│         │<───────────────│ document.cookie 读 stoken     │   │
│         ▼                └──────────────────────────────┘   │
│  校验 4 个必需 cookie → navigator.clipboard 复制到剪贴板    │
│         │                                                    │
│         ▼                                                    │
│  用户粘贴到智聘「从浏览器导入账号」→ 后端校验 → 保存账号   │
└──────────────────────────────────────────────────────────────┘
```

### 3.3 核心技术点

1. **`chrome.webRequest.onBeforeSendHeaders`** + `['requestHeaders','extraHeaders']` — 抓发往 `*.zhipin.com` 请求的 `Cookie` 头，含 HttpOnly 的 `wt2`/`wbg`/`zp_at`。仅缓存含 `zp_at`/`wt2` 的请求头（确保是登录态）。
2. **`__zp_stoken__`** — 由 BOSS 页面 JS 动态生成，请求头里通常已带；缺失时由 content.js 从 `document.cookie`/页面 JS 上下文兜底提取。
3. **不连服务器** — 采集结果经 `navigator.clipboard` 复制到剪贴板，由用户粘贴到智聘平台，扩展不发任何网络请求。因此 host_permissions 仅用于「读 cookie/监听请求」授权，与后端地址无关，**任意部署环境通用**。
4. **触发要求** — webRequest 靠截获页面请求工作，用户需在 BOSS 页面刷新或点开「推荐/沟通」产生请求，扩展才能抓到 Cookie 头。

### 3.4 文件结构

```
extension/
├── manifest.json          # MV3 配置（permissions: cookies, host_permissions: *.zhipin.com）
├── popup.html             # 弹出页面 UI
├── popup.js               # 读取 Cookie → POST 到后端
├── background.js          # Service Worker（监听 Cookie 变化 + 自动同步）
├── content.js             # 注入 BOSS 页面读 stoken（兜底方案）
├── popup.css              # 样式
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 3.5 备选采集方式

产品 UI 只保留 Chrome 扩展一条采集路径（已实测最稳）。极端情况下（如插件实在无法加载）可手动兜底：

- **DevTools 手动复制**：BOSS 页面按 F12 → Network → 点任一请求 → 复制请求头 `Cookie:` 整行（含 `__zp_stoken__`），粘贴到「从浏览器导入账号」。门槛较高，仅作应急。

> 历史方案说明：曾实现过油猴脚本（Tampermonkey `GM_cookie`）采集路径，但实测在受管控环境下 `GM_cookie` 读不到 HttpOnly 会话 cookie，且用户门槛高于扩展，已移除，统一以扩展 webRequest 方案为准。

---

## 4. 实施计划

### 阶段 1：功能分层（后端 + 前端）

**目标**：扫码成功即保存账号，Tier-1 功能立即可用

**后端改动**（`boss_qr_service.py` + `boss.py`）：
- `boss_qr_login_confirm`：移除缺 stoken 时的 409 拦截，改为 200 保存（`has_stoken=False`）
- 新增 `has_stoken` 字段标记账号 cookie 完整度
- Tier-2 接口调用时，若缺 stoken 返回友好提示（而非 502 原始错误）

**前端改动**（`BossAccountManager.tsx`）：
- 扫码账号列表显示 `has_stoken` 状态标记
- Tier-2 功能按钮在 `has_stoken=False` 时灰显 + tooltip 提示
- 移除 QrLoginModal 中的 409 错误拦截逻辑

**预估工时**：~2 小时

### 阶段 2：Chrome 扩展开发

**目标**：一键采集 BOSS Cookie（含 stoken）

**文件清单**：
1. `manifest.json` — MV3 权限配置
2. `popup.html/js` — 用户界面，一键采集
3. `background.js` — 监听 Cookie 变化，自动同步
4. `content.js` — 注入 BOSS 页面读 stoken（兜底）
5. `popup.css` + 图标

**预估工时**：~3 小时

### 阶段 3：前端集成

**目标**：扫码账号旁显示「安装扩展」引导，扩展采集后自动刷新

**改动**：
- BossAccountManager：`has_stoken=False` 时显示「安装扩展补全 Cookie」按钮
- 点击后显示扩展安装指引（步骤 + 截图）
- 扩展采集成功后前端轮询账号状态，自动刷新 `has_stoken`
- 全功能解锁动画反馈

**预估工时**：~1 小时

### 阶段 4：端到端验证

**验证清单**：
- [ ] 扫码 → 账号保存（`has_stoken=False`）→ Tier-1 功能可用
- [ ] Tier-2 功能灰显 + 引导文案正确
- [ ] 安装扩展 → 在 BOSS 页面点击扩展 → Cookie 采集成功
- [ ] 后端 `import_browser_cookie` 校验通过 → `has_stoken=True`
- [ ] Tier-2 功能解锁（搜索/打招呼/邀面试）
- [ ] 多账号场景：扫码账号 + 扩展账号共存
- [ ] 扩展卸载/重装后 Cookie 重新采集

**预估工时**：~1 小时

---

## 5. 风险与注意事项

### 5.1 `__zp_stoken__` 可访问性

从用户 DevTools 截图看，Cookie 列表中**未显示** `__zp_stoken__`。可能原因：
- DevTools Cookie 过滤器未显示全部
- `__zp_stoken__` 是 session cookie（浏览器关闭即失效）
- 非标准 cookie 存储方式

**应对**：
- 扩展优先用 `chrome.cookies.getAll()` 尝试
- 若读不到，用 content script 注入 BOSS 页面从 `document.cookie` 提取
- 兜底：引导用户在 BOSS 招聘端页面手动操作触发 stoken 生成

### 5.2 Cookie 过期

BOSS 会话 cookie 有有效期，过期后 Tier-1/Tier-2 均不可用。

**应对**：
- 后端定期校验（`/boss/accounts/:id/verify`）
- 扩展监听 Cookie 变化，自动重新采集
- 前端 Tier-1 功能调用失败时提示「Cookie 已过期，请重新扫码或用扩展采集」

### 5.3 安全性

- 扩展仅访问 `*.zhipin.com` 域，仅 POST 到 `localhost:5001`
- Cookie 在传输中不经第三方服务器
- 后端对提交的 Cookie 做 `boss status` 校验后才落库
- 扩展不存储 Cookie，仅做中转

---

## 6. 相关文档

- `RUNNING.md` — 启动指南（含 BOSS_QR_STOKEN_HYDRATE 环境变量）
- `DEPLOYMENT.md` — 部署文档（含 camoufox 说明）
- `docs/06_试点上线检查清单.md` — C13 节 BOSS 账号接入验收标准
- `docs/01_PRD.md` — 产品需求（招聘端集成部分）
