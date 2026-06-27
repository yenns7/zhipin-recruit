# 智聘 · BOSS Cookie 采集器

Chrome 浏览器扩展，一键采集 BOSS 直聘 Cookie（含 `__zp_stoken__`），同步到智聘系统，解锁完整搜索能力。

## 安装步骤

1. 打开 Chrome，访问 `chrome://extensions/`
2. 右上角开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择智聘项目中的 `extension/` 目录
5. 扩展图标出现在工具栏

## 使用流程

1. 在 Chrome 中打开 BOSS 直聘（`zhipin.com`），确保已登录
2. 在智聘系统中登录（`localhost:5173`）
3. 点击扩展图标 → 自动检测 BOSS 登录状态
4. 点击「一键采集并同步到智聘」
5. 回到智聘系统，全功能已解锁

## 工作原理

```
┌─────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  Popup UI   │────>│ chrome.cookies   │────>│ POST /boss/login/  │
│  (点击图标) │     │ getAll({ url })  │     │ browser-cookie     │
└─────────────┘     │ + content.js     │     │ → 后端校验 → 保存  │
                    │ + executeScript  │     └────────────────────┘
                    └──────────────────┘
```

- **chrome.cookies.getAll({ url })** — 使用 URL 参数（而非 domain）读取所有 Cookie，含 HttpOnly 的 wt2/wbg/zp_at
- **content.js** — 注入所有 BOSS 直聘页面，从 document.cookie、localStorage、全局变量等多处兜底提取 `__zp_stoken__`
- **executeScript** — 从 BOSS 页面的 JS 上下文直接提取 stoken（JSON 全局变量搜索）
- **手动粘贴** — 自动检测失败时提供手动粘贴 Cookie 的兜底方案
- **后端校验** — 验证 Cookie 有效性，保存为激活账号

## `__zp_stoken__` 采集策略

`__zp_stoken__` 是 BOSS 直聘的客户端反爬 token，由页面 JS 运行时生成。扩展通过以下策略确保采集到：

1. **URL-based Cookie 查询** — `chrome.cookies.getAll({ url: 'https://www.zhipin.com/web/boss/' })` 比 domain 查询更可靠
2. **Content Script 注入** — 在 BOSS 页面上下文中从 `document.cookie`、`localStorage`、`sessionStorage`、全局变量（`__INITIAL_STATE__` 等）提取
3. **Scripting API 直接提取** — 通过 `chrome.scripting.executeScript` 在 BOSS 页面执行 JSON 搜索
4. **延迟重试** — 页面加载后 2s/5s 各尝试一次，等待页面 JS 生成 token
5. **手动粘贴兜底** — 自动检测失败时，用户可从浏览器开发者工具复制 Cookie 粘贴

## 权限说明

| 权限 | 用途 |
|------|------|
| `cookies` | 读取 zhipin.com 域的 Cookie |
| `activeTab` | 获取当前标签页信息 |
| `scripting` | 注入 Content Script 到 BOSS 页面 |
| `storage` | 缓存智聘登录凭证 |
| `host_permissions: zhipin.com` | 读取 BOSS 直聘 Cookie |
| `host_permissions: localhost:5001` | 发送 Cookie 到智聘后端 |
| `host_permissions: localhost:5173` | 读取智聘登录凭证 |

## 注意事项

- 扩展**仅**访问 `*.zhipin.com` 和 `localhost:5001/5173`，不访问其他网站
- Cookie 数据**仅**发送到本地智聘后端，不经第三方服务器
- 扩展不存储 Cookie，仅做中转
- 如 BOSS Cookie 过期，需重新登录后再次采集
