# 智聘 · 快速上手（交付包说明）

本包是智聘招聘管理系统的完整可运行源码包，已排除所有运行态文件（数据库、密钥、上传文件、依赖、日志），拿到后按下方步骤即可在本地或服务器跑起来。

> 详细文档：项目总览看 `README.md`；本地运行/试用账号看 `RUNNING.md`；服务器部署看 `DEPLOYMENT.md`；能否试点上线看 `docs/06_试点上线检查清单.md` 和 `docs/07_上线部署前TOP10清单_给AI执行.md`。

---

## 一、环境要求

- Python 3.9+（推荐 3.11）
- Node.js 18+（推荐 20 LTS）+ npm 9+
- Windows 需用 PowerShell 运行 npm 命令（不要用 Git Bash）

---

## 二、本地试用（最快，同事自己电脑可跑）

### 1. 后端

```bash
cd backend
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
cp .env.example .env          # 本地试用可不填 LLM Key，离线功能照常可用
PORT=5001 python run.py       # 启动在 http://localhost:5001
```

### 2. 演示数据（可选，无需 LLM Key）

```bash
cd backend
python seed_dev.py            # 写入 7 个试用账号、10 个候选人、4 个岗位
```

### 3. 前端

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173，自动代理到 :5001
```

### 4. 试用账号（统一密码 `Zhipin2026`）

| 展示角色 | 技术角色 | 邮箱 |
|------|------|------|
| 管理员 | `admin` | admin01@mvp.local |
| 招聘经理 | `manager` | manager01@mvp.local |
| 招聘负责人 | `manager` | lead01@mvp.local |
| 招聘专员 | `recruiter` | hr01@mvp.local |
| 招聘专员 | `recruiter` | hr02@mvp.local |
| 招聘专员 | `recruiter` | hr03@mvp.local |
| 面试官 | `interviewer` | interviewer01@mvp.local |

> 权限只认 `admin` / `manager` / `recruiter` / `interviewer` 四类技术角色。"招聘负责人"是 `manager` 的业务展示名，不是新角色。

### 5. 需要 LLM Key 才能用的功能

简历 AI 解析、JD 结构化、AI 面试出题评分、AI 助手对话。其余功能（登录、候选人、岗位、流程、BI、面试报告）完全离线可用。

在 `backend/.env` 填（参考 `.env.example`）：

```env
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-v4-flash
LLM_API_URL=https://api.deepseek.com/v1/chat/completions
OPENAI_API_KEY=sk-你的key
```

---

## 三、服务器部署（给研发/IT）

完整步骤见 `DEPLOYMENT.md` §6，关键点：

1. 构建前端：`cd frontend && npm run build`（生成 `frontend/dist/`，由 Flask 同源托管）
2. 配置生产 `.env`：可从 `backend/lightweight-pilot.env.example` 复制起步，替换 JWT_SECRET（≥32字符强随机）、DATABASE_URL（PostgreSQL）、CORS_ORIGINS、LLM Key
3. 启动前自检（只读，不打印密钥）：`python backend/scripts/check_pilot_readiness.py`
4. 启动：`cd backend && gunicorn -w 2 -b 0.0.0.0:5000 --timeout 120 "run:app"`，访问 `http://服务器:5000`
5. 上线前必读：`docs/06_试点上线检查清单.md`（C1–C12）和 `docs/07_上线部署前TOP10清单_给AI执行.md`

> 真实候选人数据进 LLM 前必须经公司合规确认（见 06 清单 C5）。

---

## 四、本包已排除的内容（拿到后需自行生成）

| 排除项 | 原因 | 如何获得 |
|---|---|---|
| `backend/.env` | 含密钥，绝不打包 | `cp backend/.env.example backend/.env` 后填值 |
| `backend/hireinsight.db` | 运行态数据库 | 启动后端自动建表；演示数据跑 `python seed_dev.py` |
| `node_modules/` | 依赖体积大 | `cd frontend && npm install` |
| `frontend/dist/` | 构建产物 | `cd frontend && npm run build`（仅部署需要） |
| `backend/uploads/` | 用户上传的简历文件 | 运行时自动创建 |

---

## 五、目录说明

```
zhipin-deploy-YYYYMMDD/
├── README.md            项目总览、技术栈、快速开始
├── RUNNING.md           本地运行、试用账号、试用说明（本地试用看这个）
├── DEPLOYMENT.md        服务器部署、环境变量、备份恢复（部署看这个）
├── AGENTS.md            AI/开发执行规则
├── QUICKSTART.md        本文件
├── backend/             Flask 后端（app/api 蓝图 + services 服务层 + scripts 部署脚本）
├── frontend/            React + Vite 前端
├── base_agent/          复用的 LLM/简历解析/匹配模块（后端通过 sys.path 引入）
├── deploy/nginx/        Nginx 反代样例配置
└── docs/                PRD、SDD、BI 设计、试点上线检查清单
```
