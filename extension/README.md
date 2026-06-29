# 智聘 · BOSS Cookie 采集器

Chrome 浏览器扩展，一键采集 BOSS 直聘 Cookie（含 `__zp_stoken__`），直接发送到智聘系统，解锁完整搜索能力。

## 功能特性

- 🚀 **一键发送**：采集 Cookie 后直接发送到智聘平台，无需手动复制粘贴
- 📋 **剪贴板复制**：兼容模式，支持复制到剪贴板后手动粘贴
- 🔒 **安全可靠**：Cookie 仅发送到您配置的智聘平台地址
- ⚙️ **灵活配置**：支持自定义服务器地址和登录 Token

## 安装步骤

1. 打开 Chrome，访问 `chrome://extensions/`
2. 右上角开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择智聘项目中的 `extension/` 目录
5. 扩展图标出现在工具栏

## 使用流程

### 方式一：一键发送（推荐）

1. 在 Chrome 中打开 BOSS 直聘（`zhipin.com`），确保已登录
2. 点击扩展图标 → 自动检测 BOSS 登录状态
3. 点击「一键发送到智聘」
4. Cookie 将自动发送到智聘平台并激活账号

### 方式二：剪贴板复制

1. 按上述步骤 1-2 操作
2. 点击「复制到剪贴板」按钮
3. 回到智聘平台「从浏览器导入账号」弹窗
4. 粘贴 Cookie 并保存

## 配置说明

点击扩展弹窗底部的「⚙️ 服务器设置」，可以配置：

- **智聘平台地址**：您的智聘平台部署地址
  - 本地开发：`http://localhost:5000`
  - 生产环境：您的实际部署地址
- **登录 Token**：从智聘平台复制的 JWT Token
  - 在智聘平台登录后，打开浏览器开发者工具
  - 在 Network 标签中找到任意 API 请求
  - 复制请求头中的 `Authorization: Bearer <token>` 部分的 token

## 测试账号

智聘平台提供以下测试账号供体验（所有账号密码均为 `Zhipin2026`）：

| 角色 | 邮箱 | 姓名 | 权限说明 |
|------|------|------|----------|
| 管理员 | admin01@mvp.local | 系统管理员 | 全部功能 |
| 招聘经理 | manager01@mvp.local | 招聘经理01 | 招聘+管理功能 |
| 招聘负责人 | lead01@mvp.local | 招聘负责人01 | 招聘+管理功能 |
| 招聘专员 | hr01@mvp.local | 招聘专员01 | 招聘相关功能 |
| 招聘专员 | hr02@mvp.local | 招聘专员02 | 招聘相关功能 |
| 招聘专员 | hr03@mvp.local | 招聘专员03 | 招聘相关功能 |
| 面试官 | interviewer01@mvp.local | 面试官01 | 面试相关功能 |

> ⚠️ 测试账号仅用于功能体验，请勿在生产环境使用。
> 
> 💡 运行 `cd backend && python seed_dev.py` 可重置测试数据。

## 工作原理

```
┌─────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  Popup UI   │────>│ webRequest 监听  │────>│ POST /boss/login/  │
│  (点击图标) │     │ Cookie 请求头    │     │ browser-cookie     │
└─────────────┘     │ + content.js     │     │ → 后端校验 → 保存  │
                    └──────────────────┘     └────────────────────┘
```

- **webRequest 监听** — 监听发往 zhipin.com 的请求，从请求头中抓取完整 Cookie
- **content.js** — 注入 BOSS 直聘页面，兜底提取 `__zp_stoken__`
- **HTTP 直发** — 使用 fetch API 直接发送 Cookie 到智聘后端
- **后端校验** — 验证 Cookie 有效性，保存为激活账号

## `__zp_stoken__` 采集策略

`__zp_stoken__` 是 BOSS 直聘的客户端反爬 token，由页面 JS 运行时生成。扩展通过以下策略确保采集到：

1. **webRequest 监听** — 从请求头中抓取包含 `__zp_stoken__` 的 Cookie
2. **Content Script 注入** — 在 BOSS 页面上下文中从 `document.cookie`、`localStorage`、`sessionStorage`、全局变量等多处提取
3. **延迟重试** — 页面加载后 2s/5s 各尝试一次，等待页面 JS 生成 token
4. **手动粘贴兜底** — 自动检测失败时，用户可从浏览器开发者工具复制 Cookie 粘贴

## 权限说明

| 权限 | 用途 |
|------|------|
| `webRequest` | 监听 zhipin.com 请求，抓取 Cookie 头 |
| `activeTab` | 获取当前标签页信息 |
| `scripting` | 注入 Content Script 到 BOSS 页面 |
| `storage` | 缓存服务器配置和登录 Token |
| `host_permissions: zhipin.com` | 监听 BOSS 直聘请求 |

## 常见问题

### Q: 提示"未检测到 BOSS 直聘标签页"

A: 请先在浏览器中打开 BOSS 直聘招聘端（zhipin.com）并登录。

### Q: 提示"缺少必需 Cookie"

A: 请在 BOSS 招聘端页面刷新一次，或点击「推荐」/「沟通」触发网络请求，然后点「刷新状态」。

### Q: 发送失败，提示"网络错误"

A: 请检查：
1. 智聘平台地址是否正确
2. 智聘平台是否已启动
3. 登录 Token 是否有效

### Q: 发送失败，提示"未登录或已失效"

A: Token 可能已过期，请重新从智聘平台获取 Token。

## 注意事项

- 扩展**仅**访问 `*.zhipin.com`，不访问其他网站
- Cookie 数据**仅**发送到您配置的智聘平台地址，不经第三方服务器
- 扩展不持久化存储 Cookie，仅在内存中缓存
- 如 BOSS Cookie 过期，需重新登录后再次采集

## 更新日志

### v4.0.0
- 新增一键发送功能，支持直接发送 Cookie 到智聘平台
- 新增服务器配置，支持自定义平台地址和 Token
- 优化 UI 界面，提升用户体验
- 保留剪贴板复制功能作为兼容模式
- 从 cookies API 迁移到 webRequest API，更稳定可靠

### v3.0.0
- 初始版本
- 支持 Cookie 采集和剪贴板复制
