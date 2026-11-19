<div align="center">

# Zhipin · AI Recruitment Management System

**智聘 · AI 招聘管理系统**

A recruitment platform driven by natural language — resume parsing, smart matching, AI interviews and BI dashboards in one closed loop

[![Backend](https://img.shields.io/badge/backend-Flask%203.1-000000)](https://flask.palletsprojects.com/)
[![Frontend](https://img.shields.io/badge/frontend-React%2018%20%2B%20Vite%208-61dafb)](https://react.dev/)
[![AI](https://img.shields.io/badge/AI-LangGraph%20%2B%20DeepSeek-ff6b6b)](https://langchain-ai.github.io/langgraph/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

English · [中文](README.md)

</div>

---

## 📖 Overview

**Zhipin** is an end-to-end recruitment management system for HR teams and hiring managers. Its core idea is to embed a **LangGraph agent** deep into the business: HR can query and act in natural language — from "how many candidates are in the system" to "create a backend engineer role for me" — while the agent plans, calls tools and asks for confirmation before writing anything.

The system covers the full hiring loop: **resume intake → job posting → smart matching → AI interview → pipeline movement → analytics**, with role-based (RBAC) views for each type of user.

## ✨ Highlights

### 🤖 AI assistant (the centrepiece)
- **LangGraph ReAct agent** — a hand-built decision ↔ tool loop that plans multi-step tasks
- **15 tools**: 7 read tools (candidates / jobs / matching / pipeline / BI) + 4 write tools (create job / advance stage / schedule interview / match) + web search + system overview
- **Write confirmation** — the agent only *proposes*; nothing is written until the user confirms, and RBAC is enforced on the server
- **Web search** — pulls live market data such as salary ranges and skill trends
- **SSE streaming** — shows the whole chain: thinking → tool call → data → streamed answer
- **Conversation survives navigation** — switching pages does not lose chat history
- **Role-aware suggested prompts** — recruiters, managers and admins each see questions they are allowed to ask, so nobody is offered a dashboard or governance page they cannot open

### 📄 Resume parsing
- **PDF / Word (.docx)** through pdfplumber and python-docx
- LLM extraction of structured fields (name, education, experience) plus automatic skill tagging
- Batch upload and ZIP unpacking (with zip-bomb protection)
- Uploads land in the resume library first; jobs then show fit per target role, and candidates can be filtered by pipeline status before being added
- Candidate source, referral/agency contacts and batch notes stay collapsed as optional fields so the main upload flow stays short

### 💼 Job lifecycle
- AI-structured job descriptions with **clarifying follow-up questions** when information is missing
- View / edit (editing the JD re-structures it) / close / reopen a closed job
- Hiring requests, resume uploads, candidate pipelines and interviews all offer a "create job" entry point when a job is missing; hiring requests can be restored after an accidental close, priorities can be changed, and key actions require a business reason in an in-page dialog

### 🎯 Matching and AI interviews
- Job-to-candidate skill ranking with hit/missing tags, switchable between "AI recommended" and "all candidates"; HR can search the whole library by name, company, school, job or skill and add candidates the AI did not recommend
- AI-generated interview questions → recorded answers → AI evaluation report
- Interviews are no longer a duplicate top-level workbench for recruiters: recruiters reach interview tasks from their todo list or the candidate pipeline, and interviewers jump straight to the feedback form from a "my interviews" task card
- The pipeline can jump straight to a stage from a todo and skips empty stages by default; a "correct stage" action fixes an accidental advance or rejection, requires a reason, keeps the audit trail, and computes current stage and BI stock from the latest stage
- Candidate reassignment now picks a recruiter by name and asks for a reason instead of requiring a user ID

### 📊 Dashboards
- Current stage distribution across the team (active pipeline excludes hired and rejected candidates; the overall hire rate is de-duplicated across active pipelines and archived outcomes)
- Recruiter effectiveness, channel quality, resume throughput and interview attribution, with period metrics based on the resumes that entered during the period
- Job-level and recruiter-level BI respect role permissions; collaborating recruiters only see the funnel for the candidates they own, and data-quality warnings appear when a numerator exceeds its denominator
- The AI assistant obeys the same BI permissions: team BI is limited to managers and admins, and a recruiter cannot bypass the dashboard rules with natural language
- BI pages explain "collaboration ownership": HR drives candidates forward, the advancing user only leaves an audit trail, interviewers close the feedback loop, and hiring departments are aggregated by job department

### 🔐 Permissions and accounts
- JWT authentication + RBAC (admin / manager / recruiter / interviewer)
- Public sign-up is off by default; pilot accounts are created and assigned by an admin
- Interviewer accounts only see the workbench and "my interviews"; they can submit feedback for interviews assigned to them but cannot open the full resume library, candidate pipelines or the AI assistant, and cannot move a candidate to offer or rejection
- Admin settings are grouped into account management, audit logs and AI boundaries; account creation is collapsed by default so the member list and account status come first
- Profile editing and self-service password change

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Frontend SPA  (React 18 + Vite 8 + TS + Tailwind + GSAP)│
│  12 pages · recharts · near-black Cal.com design language│
└──────────────────────────┬──────────────────────────────┘
                           │ /api (Vite proxy / Flask same-origin)
┌──────────────────────────▼──────────────────────────────┐
│  Backend  Flask 3.1 + SQLAlchemy + JWT/RBAC  (27 routes) │
│  ┌────────────┬────────────┬──────────────────────────┐  │
│  │ auth       │ resume     │ jobs / match / pipeline   │  │
│  │ interview  │ bi         │ agent (LangGraph SSE)     │  │
│  └────────────┴────────────┴──────────────────────────┘  │
└──────────────────────────┬──────────────────────────────┘
                           │ reused
┌──────────────────────────▼──────────────────────────────┐
│  base_agent/  LLM client (DeepSeek) · parsing · matching │
└──────────────────────────────────────────────────────────┘
```

**Stack**

| Layer | Technology |
|-------|------------|
| Frontend | React 18.3 · Vite 8 · TypeScript 5.9 · Tailwind 3.4 · GSAP 3.15 · recharts 3.8 · React Router 6 |
| Backend | Flask 3.1 · SQLAlchemy 2.0 · SQLite/PostgreSQL · PyJWT |
| AI | LangGraph 1.2 · DeepSeek v4 (OpenAI-compatible) · pdfplumber · python-docx |
| Data | SQLite (development) / PostgreSQL (production) |

## 🚀 Quick start

### Requirements
- Python 3.9+ · Node.js 18+ · npm 9+

### 1. Backend
```bash
cd backend
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
cp .env.example .env          # add your LLM API key
PORT=5001 python run.py       # development backend: http://localhost:5001
```

### 2. Demo data (optional, no LLM key needed)
```bash
cd backend && python seed_dev.py
```

Do not ship demo data into a real HR pilot. Preview what would be removed first:

```bash
python backend/scripts/cleanup_demo_data.py --dry-run
```

After confirming the backup and the scope:

```bash
python backend/scripts/cleanup_demo_data.py --confirm
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173, proxied to :5001
```

### MVP pilot accounts (shared password `Zhipin2026`)
| Role | Email |
|------|-------|
| Admin | admin01@mvp.local |
| Hiring manager | manager01@mvp.local |
| Hiring lead | lead01@mvp.local |
| Recruiter | hr01@mvp.local |
| Recruiter | hr02@mvp.local |
| Recruiter | hr03@mvp.local |
| Interviewer | interviewer01@mvp.local |

Interviewer accounts see the interviews assigned to them, the candidate details and the feedback form; pipeline buttons such as "move to offer / reject" are hidden, and pipeline movement stays with HR, managers and admins.

> Full deployment guide (production / gunicorn / systemd / tunnelling) is in [DEPLOYMENT.md](DEPLOYMENT.md)

## 📁 Project layout

```
.
├── backend/          Flask backend (app factory + blueprints)
│   ├── app/api/      9 API blueprints
│   ├── app/services/ business services (agent / match / resume / interview)
│   └── run.py        entry point
├── frontend/         Vite + React frontend
│   └── src/
│       ├── pages/    12 pages
│       ├── components/ UI primitives + business components
│       └── lib/      api client / auth / agent streaming
├── base_agent/       reusable LLM / parsing / matching modules
├── docs/             requirements / PRD / design documents
├── README.md
└── DEPLOYMENT.md     deployment guide
```

## 🤖 Assistant examples

```
You: How many candidates and jobs are in the system?
AI:  [calls count_summary] 14 candidates and 8 jobs right now…

You: Create a backend engineer role, 3 years of experience, Java and Spring
AI:  [proposes create_job] → confirmation card with the parsed requirements
You: [confirm] → job #12 created

You: Search the web for 2025 backend engineer salaries
AI:  [calls web_search] based on the latest data…
```

The suggested prompts on the assistant home page change per role: recruiters see "where are my candidates stuck", managers see "team hiring funnel", and admins see "audit, permissions and AI boundaries".

The assistant supports **multiple conversations**: the sidebar lets you create, switch, rename and delete conversations, and switching or reloading never loses content (the backend is the source of truth). Every AI call — chat or write confirmation — is recorded, and admins can audit inputs, outputs, model, tokens, latency and the tool chain on the "AI call log" page.

## 📄 License

MIT License

---

<div align="center">
<sub>Zhipin · AI Recruitment Management System — hiring that AI understands and natural language drives</sub>
</div>
