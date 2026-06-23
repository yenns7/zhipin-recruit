<div align="center">

# 智聘 · AI 招聘管理系统

**AI-Powered Recruitment Management System**

用自然语言驱动的企业招聘平台 — 简历解析、智能匹配、AI 面试、数据看板，一站式闭环

[![Backend](https://img.shields.io/badge/backend-Flask%203.1-000000)](https://flask.palletsprojects.com/)
[![Frontend](https://img.shields.io/badge/frontend-React%2018%20%2B%20Vite%208-61dafb)](https://react.dev/)
[![AI](https://img.shields.io/badge/AI-LangGraph%20%2B%20DeepSeek-ff6b6b)](https://langchain-ai.github.io/langgraph/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

</div>

---

## 📖 项目简介

**智聘** 是一套面向 HR 与招聘管理者的全流程招聘管理系统，核心亮点是把 **LangGraph 智能体**深度嵌入业务：HR 用自然语言即可完成查询与操作 —— 从「系统里有多少候选人」到「帮我创建一个后端工程师岗位」，AI 自主决策、调用工具、确认执行。

系统覆盖招聘全闭环：**简历入库 → 岗位发布 → 智能匹配 → AI 面试 → 流程流转 → 数据洞察**，并提供基于角色（RBAC）的差异化视图。

## ✨ 核心特性

### 🤖 AI 智能助手（炫技核心）
- **LangGraph ReAct 智能体** —— 手搓决策↔工具循环，自主规划多步任务
- **15 个工具**：7 个查询（候选人/岗位/匹配/流程/BI）+ 4 个写操作（建岗/推进/面试/匹配）+ 联网搜索 + 系统概览
- **写操作确认机制** —— AI 只「提议」，用户确认后才执行，服务端强制 RBAC
- **联网搜索** —— 集成实时搜索，查询薪资行情、技能趋势等外部信息
- **SSE 流式对话** —— 实时展示「思考 → 调用工具 → 拿到数据 → 流式回答」全过程
- **跨页面会话保留** —— 切换页面对话历史不丢失
- **角色化示例问题** —— 招聘专员、经理/负责人、管理员看到各自权限内的推荐问法，避免点到无权限的团队看板或治理入口

### 📄 简历智能解析
- 支持 **PDF / Word(.docx)** —— pdfplumber + python-docx 双引擎
- LLM 提取结构化信息（姓名/教育/经历）+ 自动技能标签评分
- 批量上传、ZIP 压缩包解压（防 zip 炸弹）
- 上传后统一先保存到简历库，后续在简历库用“目标岗位”查看岗位适配，并按“入流程状态”筛选后加入岗位流程
- 候选人来源、内推人/猎头联系人和批次备注默认作为选填信息收起，减少上传主流程干扰

### 💼 岗位全生命周期
- AI 结构化 JD + **澄清追问**（缺失信息主动追问，提升画像准确度）
- 详情查看 / 编辑（改 JD 自动重新结构化）/ 关闭下线 / 查看已关闭岗位并恢复在招
- 用人需求、简历上传、候选人流程和面试安排在岗位缺失时提供新建岗位入口；用人需求支持误关闭后恢复、优先级调整，关键动作使用站内弹窗填写业务原因

### 🎯 智能匹配 & AI 面试
- 岗位-候选人技能匹配排名（命中/欠缺标签可视化），匹配页支持“AI 推荐 / 全部候选人”两种视角；HR 可按姓名、公司、学校、岗位或技能搜索全库，AI 没推荐到的人也能人工补找并加入流程
- AI 生成定制面试题 → 录入作答 → AI 评估报告
- 面试不再作为招聘角色的重复一级工作台；招聘专员从工作台待办或候选人流程进入面试任务，面试官从“我的面试”任务卡点击“填写反馈”后自动定位到对应反馈表
- 候选人流程支持按待办直达阶段，默认避开空阶段；“修正阶段”用于误推进或误淘汰补救，必须填写修正原因，历史流水保留，当前阶段和 BI 当前存量按最新阶段计算
- 候选人负责人转派改为选择招聘专员姓名并填写转派原因，不再要求输入用户 ID

### 📊 数据看板
- 团队当前阶段分布（当前流程人数不含已入职/已淘汰，全流程入职占比按活跃流程 + 归档结果去重计算）
- 专员效能、渠道质量、简历消化和面试责任归因，周期指标按本期入库简历 cohort 统计
- 岗位级/专员级 BI 按角色权限开放；协作招聘专员只看自己负责候选人的岗位漏斗，并展示分子大于分母等数据质量提醒
- AI 助手同样遵守 BI 权限：团队 BI 只允许经理/管理员查看，招聘专员不能通过自然语言绕过看板权限
- BI 页面提供“协同归属”说明：HR 负责候选人推进，推进人只看操作留痕，面试官负责反馈闭环，用人部门按岗位部门聚合

### 🔐 权限与账户
- JWT 认证 + RBAC（admin / manager / recruiter / interviewer）
- 公开注册默认关闭，试点账号由管理员创建并分配
- 面试官账号只保留工作台和“我的面试”主入口，只能填写分配给自己的面试反馈，不开放全量简历库、候选人流程、AI 助手主入口，也不能直接推进 Offer 或淘汰
- 管理员系统设置按账号管理、审计日志、AI 边界分区；账号创建默认收起，优先查看成员列表和账号状态
- 个人信息、自助改密


## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────┐
│  前端 SPA  (React 18 + Vite 8 + TS + Tailwind + GSAP)    │
│  12 页面 · recharts 图表 · 近黑 Cal.com 设计语言           │
└──────────────────────────┬──────────────────────────────┘
                           │ /api (Vite 代理 / Flask 同源托管)
┌──────────────────────────▼──────────────────────────────┐
│  后端  Flask 3.1 + SQLAlchemy + JWT/RBAC  (27 路由)       │
│  ┌────────────┬────────────┬──────────────────────────┐  │
│  │ auth       │ resume     │ jobs / match / pipeline   │  │
│  │ interview  │ bi         │ agent (LangGraph SSE)     │  │
│  └────────────┴────────────┴──────────────────────────┘  │
└──────────────────────────┬──────────────────────────────┘
                           │ 复用
┌──────────────────────────▼──────────────────────────────┐
│  base_agent/  LLM 客户端(DeepSeek) · 简历解析 · 匹配算法   │
└──────────────────────────────────────────────────────────┘
```

**技术栈**

| 层 | 技术 |
|----|------|
| 前端 | React 18.3 · Vite 8 · TypeScript 5.9 · Tailwind 3.4 · GSAP 3.15 · recharts 3.8 · React Router 6 |
| 后端 | Flask 3.1 · SQLAlchemy 2.0 · SQLite/PostgreSQL · PyJWT |
| AI | LangGraph 1.2 · DeepSeek v4 (OpenAI 兼容) · pdfplumber · python-docx |
| 数据 | SQLite（开发）/ PostgreSQL（生产） |

## 🚀 快速开始

### 环境要求
- Python 3.9+ · Node.js 18+ · npm 9+

### 1. 后端
```bash
cd backend
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
cp .env.example .env          # 填入 LLM API Key
PORT=5001 python run.py       # 开发联调后端：http://localhost:5001
```

### 2. 演示数据（可选，无需 LLM Key）
```bash
cd backend && python seed_dev.py
```

真实 HR 试点前不要带演示数据。先预览清理范围：

```bash
python backend/scripts/cleanup_demo_data.py --dry-run
```

确认备份和清理范围后，再执行：

```bash
python backend/scripts/cleanup_demo_data.py --confirm
```

### 3. 前端
```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173，代理到 :5001
```

### MVP 内部试用账号（统一密码 `Zhipin2026`）
| 角色 | 邮箱 |
|------|------|
| 管理员 | admin01@mvp.local |
| 招聘经理 | manager01@mvp.local |
| 招聘负责人 | lead01@mvp.local |
| 招聘专员 | hr01@mvp.local |
| 招聘专员 | hr02@mvp.local |
| 招聘专员 | hr03@mvp.local |
| 面试官 | interviewer01@mvp.local |

面试官账号用于查看分配给自己的面试任务、候选人详情和填写反馈；不会显示“推进 Offer/淘汰”等流程按钮，招聘流程推进仍由 HR/经理/管理员完成。

> 完整部署指南（生产/gunicorn/systemd/公网穿透）见 [DEPLOYMENT.md](DEPLOYMENT.md)

## 📁 项目结构

```
.
├── backend/          Flask 后端（app-factory + 蓝图）
│   ├── app/api/      9 个 API 蓝图
│   ├── app/services/ 业务服务（agent / match / resume / interview）
│   └── run.py        启动入口
├── frontend/         Vite + React 前端
│   └── src/
│       ├── pages/    12 个页面
│       ├── components/ UI 基元 + 业务组件
│       └── lib/      api 客户端 / auth / agent 流式
├── base_agent/       复用的 LLM/解析/匹配模块
├── docs/             需求 / PRD / 设计文档
├── README.md
└── DEPLOYMENT.md     部署文档
```

## 🤖 AI 助手用法示例

```
你：系统里有多少候选人和岗位？
AI：[调用 count_summary] 当前 14 位候选人、8 个岗位…

你：帮我创建一个后端工程师岗位，要求3年经验，熟悉Java和Spring
AI：[提议 create_job] → 弹出确认卡片（含解析的技能要求）
你：[点击确认] → 岗位创建成功 #12

你：联网查一下2025年后端工程师的市场薪资
AI：[调用 web_search] 根据最新数据…
```

AI 助手首页示例会按角色变化：招聘专员优先看到“我负责的候选人卡在哪”，经理/负责人看到“团队招聘漏斗”，管理员看到“审计、权限和 AI 边界”相关问题。

## 📄 许可证

MIT License

---

<div align="center">
<sub>智聘 · AI 招聘管理系统 — 让招聘流程被 AI 理解、被自然语言驱动</sub>
</div>
