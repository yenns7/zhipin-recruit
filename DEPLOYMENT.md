# 智聘·招聘管理系统 — 部署文档

> **版本**：2026-06-14  
> **适用环境**：Windows 10/11、Linux（Ubuntu 20.04+）、macOS 13+  
> **架构**：Flask 单进程 + SQLite（开发）/ PostgreSQL（生产）+ Vite React SPA

---

## 目录

1. [系统架构](#1-系统架构)
2. [环境要求](#2-环境要求)
3. [快速启动（本地开发）](#3-快速启动本地开发)
4. [演示数据初始化](#4-演示数据初始化)
5. [LLM API 配置](#5-llm-api-配置)
6. [生产部署](#6-生产部署)
7. [公网穿透（cloudflared）](#7-公网穿透cloudflared)
8. [演示账号](#8-演示账号)
9. [功能模块说明](#9-功能模块说明)
10. [常见问题](#10-常见问题)

---

## 1. 系统架构

```
前端 (Vite + React + TS + Tailwind)
    │  开发模式: localhost:5173  →  /api 代理到 :5000
    │  生产模式: Flask 直接托管 frontend/dist (SPA)
    ▼
后端 (Flask + SQLAlchemy)  localhost:5000
    ├── /api/auth          认证 (JWT + RBAC)
    ├── /api/resume        简历上传/解析 (PDF + Word)
    ├── /api/candidates    候选人管理
    ├── /api/jobs          岗位管理 + JD 智能解析
    ├── /api/match         候选人-岗位匹配
    ├── /api/interview     AI 面试题生成 + 评估
    ├── /api/pipeline      招聘流程看板
    ├── /api/bi            数据看板 (漏斗 + 专员效能)
    └── /api/agent         LangGraph AI 助手 (SSE 流式)
    │
    ├── base_agent/        LLM 客户端 / 简历解析 / 匹配算法
    └── hireinsight.db     SQLite 数据库 (生产换 PostgreSQL)
```

**角色权限**：

| 角色 | 权限范围 |
|------|---------|
| admin | 全量管理 + BI 看板 |
| manager | BI 看板 + 团队漏斗 |
| recruiter | 候选人 + 岗位 + 匹配 + AI 面试 |
| interviewer | 候选人查看 + 流程查看 |

---

## 2. 环境要求

| 组件 | 最低版本 | 备注 |
|------|---------|------|
| Python | 3.9+ | 推荐 3.11 |
| Node.js | 18+ | 推荐 20 LTS |
| npm | 9+ | 随 Node.js 附带 |
| Git | 任意 | 可选 |

---

## 3. 快速启动（本地开发）

### 3.1 克隆/解压项目

```bash
# 解压后进入项目根目录
cd 智聘-招聘管理系统
```

### 3.2 安装后端依赖

```bash
cd backend
pip install -r requirements.txt
```

### 3.3 配置环境变量

```bash
cp backend/.env.example backend/.env
```

编辑 `backend/.env`，至少填写：
```env
# LLM 配置（必填，否则 AI 功能不可用）
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-v4-flash
LLM_API_URL=https://api.deepseek.com/v1/chat/completions
OPENAI_API_KEY=sk-your-deepseek-key-here   # DeepSeek 也用此字段

# JWT 密钥（生产环境请修改）
JWT_SECRET=change-me-in-production
```

### 3.4 启动后端

```bash
cd backend
python run.py
```

输出 `✓ 智聘 · 招聘管理系统 后端已启动 http://localhost:5000` 即启动成功。

### 3.5 安装前端依赖并启动

**Windows PowerShell**（推荐，npm 仅在 PowerShell 可用）：
```powershell
cd frontend
npm install
npm run dev
```

**Linux / macOS**：
```bash
cd frontend
npm install
npm run dev
```

访问 **http://localhost:5173** 即可使用。

---

## 4. 演示数据初始化

运行一次后会创建全套演示数据（候选人 / 岗位 / 流程 / 面试报告），可多次运行（每次清空重建）：

```bash
cd backend
python seed_dev.py
```

**无需 LLM API Key**，所有 AI 生成字段已预填。

---

## 5. LLM API 配置

系统支持 DeepSeek（推荐）和 OpenAI 兼容接口：

### DeepSeek（推荐，默认）

```env
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-v4-flash
LLM_API_URL=https://api.deepseek.com/v1/chat/completions
LLM_MAX_TOKENS=8192
OPENAI_API_KEY=sk-your-deepseek-key
```

### OpenAI

```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
LLM_API_URL=https://api.openai.com/v1/chat/completions
OPENAI_API_KEY=sk-your-openai-key
```

### 依赖 LLM 的功能

| 功能 | 离线可用 |
|------|---------|
| 简历 AI 解析 (PDF/Word) | ❌ 需要 LLM |
| JD 结构化 + 澄清追问 | ❌ 需要 LLM |
| AI 面试题生成 + 评估 | ❌ 需要 LLM |
| LangGraph AI 助手对话 | ❌ 需要 LLM |
| 候选人列表 / 岗位管理 / 流程看板 / BI 看板 | ✅ 离线可用 |

---

## 6. 生产部署

### 方案 A：Flask 托管前端静态文件（单进程，推荐小团队）

1. 构建前端：
```powershell
cd frontend
npm run build    # 生成 frontend/dist/
```

2. 修改 `.env`：
```env
FLASK_DEBUG=false
JWT_SECRET=your-strong-random-secret-here
DATABASE_URL=sqlite:///hireinsight.db   # 或 postgresql://user:pass@host:5432/db
```

3. 启动（Flask 会自动托管 `frontend/dist`）：
```bash
cd backend
python run.py
```

访问 `http://your-server:5000` 即为完整系统。

### 方案 B：gunicorn（多 worker，Linux 生产）

```bash
cd backend
gunicorn -w 2 -b 0.0.0.0:5000 \
  --timeout 120 \
  --keep-alive 5 \
  "run:app"
```

> ⚠️ AI 助手的 SSE 流式响应需要 `--timeout` 设置足够大（推荐 120s+）

### 方案 C：systemd 服务（Linux 开机自启）

创建 `/etc/systemd/system/zhipin.service`：

```ini
[Unit]
Description=智聘招聘管理系统
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/project/backend
EnvironmentFile=/path/to/project/backend/.env
ExecStart=/usr/bin/python3 run.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable zhipin
systemctl start zhipin
```

---

## 7. 公网穿透（cloudflared）

无需域名 / 公网 IP，使用 Cloudflare Tunnel 快速对外暴露：

```bash
# Windows
tools\cloudflared.exe tunnel --url http://localhost:5000 --no-autoupdate

# Linux/macOS (需先下载 cloudflared)
cloudflared tunnel --url http://localhost:5000 --no-autoupdate
```

启动后输出类似：
```
https://ward-mounted-concerning-fans.trycloudflare.com
```

> ⚠️ 免费隧道链接每次重启会变化，不适合生产。生产用途请注册 Cloudflare 账号配置命名隧道（Named Tunnel）。

---

## 8. 演示账号

所有账号密码：`demo1234`

| 角色 | 邮箱 | 说明 |
|------|------|------|
| 管理员 | admin@demo.com | 全量权限 + BI 看板 |
| 经理 | manager@demo.com | 团队漏斗 + 专员效能 |
| 招聘专员 | hr1@demo.com | 候选人 / 岗位 / AI 面试 |
| 招聘专员 | hr2@demo.com | 候选人 / 岗位 / AI 面试 |
| 招聘专员 | hr3@demo.com | 候选人 / 岗位 / AI 面试 |
| 面试官 | interviewer@demo.com | 候选人查看 / 流程查看 |

---

## 9. 功能模块说明

| 模块 | 路径 | 说明 |
|------|------|------|
| 工作台 | `/` | 角色化欢迎页 + KPI 看板 + 快速入口 |
| AI 助手 | `/agent` | LangGraph ReAct 智能体，自然语言查询系统数据 |
| 候选人 | `/candidates` | 简历库 + 技能标签 + 档案详情 |
| 简历上传 | `/upload` | 拖拽上传 PDF/Word，AI 自动解析技能标签 |
| 岗位管理 | `/jobs` | 创建岗位，AI 追问补全 JD，智能解析技能要求 |
| 候选人匹配 | `/jobs/:id/match` | 按岗位 AI 匹配并排名候选人 |
| 招聘流程 | `/pipeline` | 看板式阶段管理（待筛选→AI初筛→面试→Offer→入职）|
| AI 面试 | `/interviews` | 生成定制题目，录入作答，AI 评估报告 |
| 数据看板 | `/bi` | 团队漏斗 + 专员效能（经理/管理员）/ 个人漏斗（其他角色）|

---

## 10. 常见问题

### Q：简历上传失败，提示 EOF marker not found？

A：已修复（2026-06-14）。确保运行的是最新代码。`.docx` 和 PDF 均已支持，旧版 `.doc` 格式请另存为 `.docx` 后上传。

### Q：AI 功能不可用，提示 LLM 调用失败？

A：检查 `backend/.env` 中的 API Key 是否填写正确，网络是否能访问 LLM API 端点。

### Q：前端页面空白？

A：
1. 确认后端已启动（`http://localhost:5000` 可访问）
2. 生产模式：确认已运行 `npm run build` 生成 `frontend/dist/`
3. 开发模式：确认 `npm run dev` 在 PowerShell 中运行（不是 Git Bash）

### Q：数据库如何重置？

A：删除 `backend/hireinsight.db`，重启后端（自动重建），再运行 `python seed_dev.py`。

### Q：端口冲突怎么办？

A：修改 `backend/.env` 中的 `PORT=5000` 为其他端口，前端 `vite.config.ts` 中的 proxy 也需同步修改。

### Q：Windows 下 npm 命令找不到？

A：必须在 **PowerShell** 中运行 npm 命令，不要在 Git Bash 中运行。

---

## 快速验证清单

```bash
# 1. 后端启动验证
cd backend && python -c "from app import create_app; app=create_app(); print('后端 OK')"

# 2. 种子数据
cd backend && python seed_dev.py

# 3. 前端构建验证（PowerShell）
cd frontend; npm run typecheck; npm run build

# 4. 接口验证
curl http://localhost:5000/api/jobs   # → 401 (未登录，正常)
```

---

*智聘·招聘管理系统 © 2026 — AI 驱动的企业招聘管理平台*
