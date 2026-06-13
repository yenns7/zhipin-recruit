# HireInsight — Dev Setup & Running Guide

## Prerequisites

- Python 3.9+ on PATH
- Node.js 18+ on PATH
- Backend dependencies already installed (`pip install -r backend/requirements.txt`)
- Frontend dependencies: run `npm install` once inside `frontend/` if `node_modules` is absent

---

## 1. Start the backend

```bash
cd backend
python run.py
```

Starts Flask on http://localhost:5000. The SQLite database (`backend/hireinsight.db`) is created automatically on first boot.

---

## 2. Seed demo data

Run once (or any time you want a clean reset — it wipes and re-seeds):

```bash
cd backend
python seed_dev.py
```

Prints a summary table of what was created and the login credentials. No LLM key required.

---

## 3. Start the frontend

```bash
cd frontend
npm install        # only needed once
npm run dev
```

Opens at http://localhost:5173. The Vite dev server proxies `/api` requests to `localhost:5000`, so both processes must be running.

---

## Demo login credentials

All accounts use password `demo1234`.

| Role         | Email                    | Name     |
|--------------|--------------------------|----------|
| admin        | admin@demo.com           | 系统管理员 |
| manager      | manager@demo.com         | 陈经理    |
| recruiter    | hr1@demo.com             | 张专员    |
| recruiter    | hr2@demo.com             | 李专员    |
| recruiter    | hr3@demo.com             | 王专员    |
| interviewer  | interviewer@demo.com     | 赵面试官  |

Log in as **manager@demo.com** to see the BI dashboard and pipeline overview.  
Log in as **hr1@demo.com** to see the recruiter view (candidates, jobs, pipeline).

---

## LLM-dependent features

The following features require a live LLM API key:

- **JD structuring** — parsing a job description into structured tags on job create
- **AI interview Q&A** — generating interview questions and evaluating answers
- **Live resume parsing** — extracting structured data from an uploaded PDF/DOCX

To enable them, set these environment variables (or create `backend/.env`):

```env
LLM_PROVIDER=openai          # or anthropic, etc.
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
# Optional — only needed for non-default API endpoints:
# LLM_API_URL=https://...
```

All other features (auth, candidate list, job list, pipeline Kanban, BI dashboard, interview reports, job matching) work fully offline with seeded data.

---

## Quick verification

```bash
# Backend boots
cd backend && python -c "from app import create_app; app=create_app(); print('OK')"

# Seed runs clean
cd backend && python seed_dev.py

# Frontend type-checks and builds
cd frontend && npm run typecheck && npm run build && npm run lint
```
