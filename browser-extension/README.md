# 智聘 · BOSS Cookie 采集器（浏览器扩展）

云部署的智聘后端运行在服务器上，**读不到使用者本机浏览器的登录态**。而 BOSS 直聘招聘端鉴权需要一组完整 Cookie：

```
__zp_stoken__   # 页面 JS 生成，非 HttpOnly
wt2 / wbg / zp_at  # 服务端下发的会话 Cookie，通常带 HttpOnly
```

其中 HttpOnly 的 Cookie **无法被网页 JS / bookmarklet（`document.cookie`）读取**，只能由浏览器扩展通过 `chrome.cookies` API 读取。本扩展即为此而生。

## 工作方式

1. 用户先在本机浏览器登录 BOSS 直聘招聘端（zhipin.com）。
2. 点击扩展图标 → 「一键采集并复制」：扩展用 `chrome.cookies` 读取 zhipin.com 全部 Cookie（含 HttpOnly），拼成 `k=v; k=v` 复制到剪贴板。
3. 回到智聘平台「从浏览器导入账号」对话框，粘贴提交。
4. 平台后端 `POST /api/boss/login/browser-cookie` 校验：必需 Cookie 齐全 + `boss status` 登录态有效，才加密保存并激活。

剪贴板 + 同源粘贴方案的好处：扩展无需保存平台 JWT、无需把后端加入 `chrome-extension://` 的 CORS 白名单，安全面最小。

## 安装（开发者模式）

- Chrome/Edge：打开 `chrome://extensions`（或 `edge://extensions`）→ 打开「开发者模式」→「加载已解压的扩展程序」→ 选择本 `browser-extension` 目录。

## 安全提示

- 采集到的 Cookie 等同 BOSS 登录态，仅复制到本机剪贴板，不上传任何第三方。
- 平台侧仅 Fernet 加密落库、不写日志，请通过 HTTPS 提交。
