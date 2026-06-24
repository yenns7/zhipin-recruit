# 内网穿透部署说明

> 历史临时演示文档：本文件只适用于一次性公网试看，不适用于公司内网试点或生产部署。给研发/IT 部署时以 `DEPLOYMENT.md`、`docs/06_试点上线检查清单.md` 和 `docs/07_上线部署前TOP10清单_给AI执行.md` 为准。

智聘 · 招聘管理系统的公网访问部署。**单端口架构**:Flask（:5000）同时托管前端静态产物 + /api 接口，cloudflared 把 :5000 穿透到公网。

## 公网访问

当前临时链接（cloudflared 每次重启会变）：

> https://ward-mounted-concerning-fans.trycloudflare.com

演示账号（弱密码，仅供演示）：
- 经理：`manager@demo.com` / `demo1234`
- 其余角色账号见 seed 数据。

## 架构

```
公网用户 → cloudflared 隧道 → localhost:5000 (Flask)
                                  ├─ /            → frontend/dist/index.html (SPA)
                                  ├─ /assets/*    → 前端 JS/CSS
                                  ├─ /<spa-route> → 回退 index.html（深链刷新可用）
                                  └─ /api/*       → 后端蓝图（含 SSE /api/agent/chat）
```

为什么不用 nginx：本机安全软件干扰回环网络，nginx 后台化（daemonize）后 worker 的 socket 句柄失效（监听存在但连接全部 RST）。nginx 配置本身已验证正确（前台模式三路径全 200），但环境不稳。Flask 单进程托管避开了该问题，且活动部件最少。

## 启动步骤（重启后按序执行）

1. **后端（含前端托管）**
   ```
   cd backend
   python run.py          # 监听 0.0.0.0:5000，自动托管 ../frontend/dist
   ```
   前端如有改动需先 `cd frontend && npm run build` 重新生成 dist。

2. **cloudflared 隧道**
   ```
   tools/cloudflared.exe tunnel --url http://localhost:5000 --no-autoupdate
   ```
   启动后输出里找 `https://*.trycloudflare.com` 即公网链接。

## 关键实现

- 前端 `src/lib/api.ts`：`API_BASE = '/api'`（相对路径），同源部署天然可用，无需改 API 地址、无 CORS 问题。
- 后端 `app/__init__.py`：`_register_frontend()` 注册 catch-all 路由，真实文件直接返回、其余回退 index.html、/api/* 留给蓝图。可用 `FRONTEND_DIST` 环境变量覆盖 dist 路径。
- SSE 流式（AI 对话）已验证公网逐条实时下发，无缓冲堆积。

## 安全提醒（重要）

- 公网链接 = 任何人可访问登录/注册页。演示账号弱密码，**仅限临时演示，用完关掉 cloudflared**。
- trycloudflare 免费隧道无鉴权、链接重启即变，不要长期挂载或放真实数据。
- 如需长期/带域名，改用 cloudflare 命名隧道（需登录 + 配置 ingress）。
