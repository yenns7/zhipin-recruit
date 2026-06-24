# HireInsight 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `FindJobs-Agent` 改造为 HR 视角的 AI 招聘管理系统，交付批量简历处理+AI 预筛+招聘流水线+BI 看板四条主链。

**Architecture:** Flask 分层服务（api/service/repository）+ Celery 异步队列处理批量简历，PostgreSQL 存结构化数据，复用 `resume_parser`/`tag_rate`/`job_agent`/`AI_interviewer` 四个核心模块（反转评估方向），`events` 表自产 BI 数据，React+ECharts 展现三层下钻看板。

**Tech Stack:** Python 3.9+, Flask, Celery, Redis, PostgreSQL, React 18 + TypeScript, ECharts, JWT, Docker Compose

---

## 文件结构（改造+新增清单）

```
HireInsight/
├── backend/
│   ├── app/
│   │   ├── __init__.py              新建 Flask app factory
│   │   ├── config.py                新建 环境配置
│   │   ├── api/
│   │   │   ├── resume.py            新建 批量上传/解析 endpoints
│   │   │   ├── jobs.py              新建 JD 管理 endpoints
│   │   │   ├── candidates.py        新建 候选人画像 endpoints
│   │   │   ├── match.py             新建 岗找人匹配 endpoints
│   │   │   ├── interview.py         新建 AI 预筛 endpoints
│   │   │   ├── pipeline.py          新建 流水线 Kanban endpoints
│   │   │   └── bi.py                新建 BI 看板 endpoints
│   │   ├── services/
│   │   │   ├── resume_service.py    新建 包装 resume_parser
│   │   │   ├── tag_service.py       新建 包装 tag_rate
│   │   │   ├── profile_service.py   新建 候选人画像
│   │   │   ├── job_service.py       新建 包装 job_agent
│   │   │   ├── match_service.py     新建 反转匹配
│   │   │   ├── interview_service.py 新建 反转 AI_interviewer
│   │   │   ├── pipeline_service.py  新建 状态机+埋点
│   │   │   └── bi_service.py        新建 指标聚合
│   │   ├── middleware/
│   │   │   ├── auth.py              新建 JWT 鉴权
│   │   │   └── events.py            新建 操作埋点
│   │   └── workers/
│   │       └── resume_worker.py     新建 Celery 异步任务
│   ├── models/
│   │   └── schema.sql               新建 PostgreSQL 建表 DDL
│   └── tests/
│       ├── test_resume_service.py
│       ├── test_tag_service.py
│       ├── test_match_service.py
│       ├── test_interview_service.py
│       ├── test_bi_service.py
│       └── test_api.py
├── [从 FindJobs-Agent 复制]
│   ├── resume_parser.py             复用
│   ├── tag_rate.py                  复用
│   ├── job_agent.py                 复用
│   ├── AI_interviewer.py            复用+反转
│   ├── llm_client.py                扩展
│   ├── tech_taxonomy.json           直接用
│   └── all_labels.csv               直接用
├── FrontEnd/src/components/
│   ├── UploadPage.tsx               新增 批量上传
│   ├── CandidateList.tsx            新增 候选人列表+匹配分
│   ├── KanbanBoard.tsx              新增 流水线看板
│   ├── PreScreenReport.tsx          新增 AI 预筛报告
│   └── BIDashboard.tsx              新增 BI 三层下钻
├── docker-compose.yml               新建
├── requirements.txt                 扩展
└── .env.example                     新建
```

---

## Task 1：地基 — Docker + PostgreSQL Schema + 骨架

**Files:**
- Create: `docker-compose.yml`
- Create: `backend/models/schema.sql`
- Create: `backend/app/config.py`
- Create: `backend/app/__init__.py`

- [ ] **Step 1: 写 docker-compose.yml**

```yaml
version: "3.9"
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: hireinsight
      POSTGRES_USER: hi
      POSTGRES_PASSWORD: hipass
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
  api:
    build: ./backend
    ports: ["5000:5000"]
    depends_on: [db, redis]
    env_file: .env
  worker:
    build: ./backend
    command: celery -A app.workers.resume_worker worker --loglevel=info
    depends_on: [db, redis]
    env_file: .env
volumes:
  pgdata:
```

- [ ] **Step 2: 写 backend/models/schema.sql**

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin','manager','recruiter','interviewer')),
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE candidates (
  id SERIAL PRIMARY KEY,
  owner_hr_id INT REFERENCES users(id),
  name_masked VARCHAR(100),
  email_masked VARCHAR(100),
  phone_masked VARCHAR(20),
  resume_json JSONB NOT NULL,
  raw_file_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE candidate_tags (
  id SERIAL PRIMARY KEY,
  candidate_id INT REFERENCES candidates(id) ON DELETE CASCADE,
  tag VARCHAR(100) NOT NULL,
  score INT CHECK (score BETWEEN 1 AND 5)
);

CREATE TABLE jobs (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  jd_text TEXT NOT NULL,
  jd_structured JSONB,
  owner_hr_id INT REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE matches (
  id SERIAL PRIMARY KEY,
  job_id INT REFERENCES jobs(id),
  candidate_id INT REFERENCES candidates(id),
  score FLOAT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE interviews (
  id SERIAL PRIMARY KEY,
  candidate_id INT REFERENCES candidates(id),
  job_id INT REFERENCES jobs(id),
  qa_json JSONB,
  ai_report JSONB,
  score FLOAT,
  pass_recommended BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pipeline_stages (
  id SERIAL PRIMARY KEY,
  candidate_id INT REFERENCES candidates(id),
  job_id INT REFERENCES jobs(id),
  stage VARCHAR(50) NOT NULL,
  updated_by INT REFERENCES users(id),
  ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  actor_id INT REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_id INT,
  entity_type VARCHAR(50),
  payload JSONB,
  ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  actor_id INT REFERENCES users(id),
  target_table VARCHAR(50),
  target_id INT,
  action VARCHAR(50),
  ts TIMESTAMPTZ DEFAULT NOW()
);
```

- [ ] **Step 3: 写 backend/app/config.py**

```python
import os

class Config:
    DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://hi:hipass@db/hireinsight")
    REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
    JWT_SECRET = os.environ.get("JWT_SECRET", "change-me-in-prod")
    JWT_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", "8"))
    LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "openai")
    LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
    LLM_MODEL = os.environ.get("LLM_MODEL", "gpt-4o-mini")
    UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER", "/tmp/hireinsight_uploads")
    MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB
```

- [ ] **Step 4: 写 backend/app/__init__.py**

```python
from flask import Flask
from .config import Config

def create_app(config=Config):
    app = Flask(__name__)
    app.config.from_object(config)

    from .api import resume, jobs, candidates, match, interview, pipeline, bi
    for bp in [resume.bp, jobs.bp, candidates.bp, match.bp, interview.bp, pipeline.bp, bi.bp]:
        app.register_blueprint(bp, url_prefix="/api")

    return app
```

- [ ] **Step 5: 启动验证**

```bash
docker-compose up db redis -d
docker-compose exec db psql -U hi -d hireinsight -f /docker-entrypoint-initdb.d/schema.sql
```
Expected: 建表成功，无 ERROR。

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml backend/models/schema.sql backend/app/
git commit -m "chore: scaffold Flask app + PostgreSQL schema + Docker"
```

---

## Task 2：LLM 客户端抽象层（可换模型）

**Files:**
- Modify: `llm_client.py`（来自 FindJobs-Agent，扩展支持多 provider）
- Create: `backend/tests/test_llm_client.py`

- [ ] **Step 1: 写失败测试**

```python
# backend/tests/test_llm_client.py
import pytest
from unittest.mock import patch, MagicMock
from llm_client import LLMClient

def test_openai_provider_calls_correct_model():
    client = LLMClient(provider="openai", api_key="fake", model="gpt-4o-mini")
    with patch("llm_client.openai.ChatCompletion.create") as mock:
        mock.return_value = MagicMock(choices=[MagicMock(message=MagicMock(content="ok"))])
        result = client.chat([{"role": "user", "content": "hello"}])
    assert result == "ok"
    assert mock.call_args[1]["model"] == "gpt-4o-mini"

def test_unsupported_provider_raises():
    with pytest.raises(ValueError, match="Unsupported provider"):
        LLMClient(provider="unknown_llm", api_key="x", model="x")
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend && pytest tests/test_llm_client.py -v
```
Expected: FAIL — `LLMClient` 不存在或不接受 `provider` 参数。

- [ ] **Step 3: 扩展 llm_client.py**

```python
import os
import openai

class LLMClient:
    def __init__(self, provider: str = None, api_key: str = None, model: str = None):
        self.provider = provider or os.environ.get("LLM_PROVIDER", "openai")
        self.api_key = api_key or os.environ.get("LLM_API_KEY", "")
        self.model = model or os.environ.get("LLM_MODEL", "gpt-4o-mini")
        if self.provider not in ("openai", "deepseek", "qwen"):
            raise ValueError(f"Unsupported provider: {self.provider}")
        openai.api_key = self.api_key
        if self.provider == "deepseek":
            openai.api_base = "https://api.deepseek.com/v1"
        elif self.provider == "qwen":
            openai.api_base = "https://dashscope.aliyuncs.com/compatible-mode/v1"

    def chat(self, messages: list, **kwargs) -> str:
        resp = openai.ChatCompletion.create(model=self.model, messages=messages, **kwargs)
        return resp.choices[0].message.content
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pytest tests/test_llm_client.py -v
```
Expected: 2 PASSED。

- [ ] **Step 5: Commit**

```bash
git add llm_client.py backend/tests/test_llm_client.py
git commit -m "feat: LLM client abstraction supporting openai/deepseek/qwen"
```

---

## Task 3：简历批量解析服务

**Files:**
- Create: `backend/app/services/resume_service.py`
- Create: `backend/workers/resume_worker.py`
- Modify: `resume_parser.py`（添加 `parse_single` 返回 dict 而非 print）
- Create: `backend/tests/test_resume_service.py`

- [ ] **Step 1: 写失败测试**

```python
# backend/tests/test_resume_service.py
import pytest
from unittest.mock import patch, MagicMock
from app.services.resume_service import ResumeBatchService

def test_parse_single_pdf_returns_structured_dict(tmp_path):
    pdf = tmp_path / "resume.pdf"
    pdf.write_bytes(b"%PDF-1.4 fake content")
    svc = ResumeBatchService(llm_client=MagicMock())
    with patch("resume_parser.extract_text_from_pdf", return_value="张三 Python 5年"):
        with patch.object(svc.llm, "chat", return_value='{"name":"张三","skills":["Python"]}'):
            result = svc.parse_single(str(pdf))
    assert result["name"] == "张三"
    assert "Python" in result["skills"]

def test_parse_batch_returns_list_of_dicts(tmp_path):
    files = [str(tmp_path / f"r{i}.pdf") for i in range(3)]
    for f in files:
        open(f, "wb").write(b"%PDF fake")
    svc = ResumeBatchService(llm_client=MagicMock())
    with patch.object(svc, "parse_single", return_value={"name": "test"}):
        results = svc.parse_batch(files)
    assert len(results) == 3
    assert all(r["name"] == "test" for r in results)
```

- [ ] **Step 2: 运行确认失败**

```bash
pytest backend/tests/test_resume_service.py -v
```
Expected: FAIL — `ResumeBatchService` 不存在。

- [ ] **Step 3: 实现 resume_service.py**

```python
# backend/app/services/resume_service.py
import json, os, zipfile, tempfile
from pathlib import Path
from resume_parser import extract_text_from_pdf, extract_text_from_docx

PARSE_PROMPT = """从以下简历文本提取结构化信息，返回 JSON：
{{"name": "", "email": "", "phone": "", "education": [], "experience": [], "skills": []}}
简历文本：
{text}"""

class ResumeBatchService:
    def __init__(self, llm_client):
        self.llm = llm_client

    def parse_single(self, file_path: str) -> dict:
        ext = Path(file_path).suffix.lower()
        if ext == ".pdf":
            text = extract_text_from_pdf(file_path)
        elif ext in (".doc", ".docx"):
            text = extract_text_from_docx(file_path)
        else:
            raise ValueError(f"Unsupported file type: {ext}")
        raw = self.llm.chat([{"role": "user", "content": PARSE_PROMPT.format(text=text[:3000])}])
        return json.loads(raw)

    def parse_batch(self, file_paths: list) -> list:
        results = []
        for fp in file_paths:
            try:
                results.append({"file": fp, "status": "ok", **self.parse_single(fp)})
            except Exception as e:
                results.append({"file": fp, "status": "error", "error": str(e)})
        return results

    def extract_zip(self, zip_path: str) -> list:
        out = tempfile.mkdtemp()
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(out)
        return [str(p) for p in Path(out).rglob("*") if p.suffix.lower() in (".pdf",".docx",".doc")]
```

- [ ] **Step 4: 实现 resume_worker.py（Celery 任务）**

```python
# backend/workers/resume_worker.py
from celery import Celery
from app.config import Config
from app.services.resume_service import ResumeBatchService
from app.services.tag_service import TagService
import psycopg2, json

celery = Celery("hireinsight", broker=Config.REDIS_URL, backend=Config.REDIS_URL)

@celery.task(bind=True, max_retries=3)
def process_resume(self, file_path: str, owner_hr_id: int):
    from llm_client import LLMClient
    llm = LLMClient()
    svc = ResumeBatchService(llm_client=llm)
    tag_svc = TagService(llm_client=llm)
    try:
        parsed = svc.parse_single(file_path)
        tags = tag_svc.extract_tags(parsed)
        conn = psycopg2.connect(Config.DATABASE_URL)
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO candidates (owner_hr_id, resume_json, raw_file_path) VALUES (%s, %s, %s) RETURNING id",
            (owner_hr_id, json.dumps(parsed), file_path)
        )
        cid = cur.fetchone()[0]
        for tag, score in tags:
            cur.execute("INSERT INTO candidate_tags (candidate_id, tag, score) VALUES (%s, %s, %s)", (cid, tag, score))
        conn.commit()
        cur.close(); conn.close()
        return {"candidate_id": cid, "status": "done"}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=5)
```

- [ ] **Step 5: 运行测试确认通过**

```bash
pytest backend/tests/test_resume_service.py -v
```
Expected: 2 PASSED。

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/resume_service.py backend/workers/resume_worker.py backend/tests/test_resume_service.py
git commit -m "feat: resume batch parse service + celery worker"
```

---

## Task 4：技能打标服务（复用 tag_rate.py）

**Files:**
- Create: `backend/app/services/tag_service.py`
- Create: `backend/tests/test_tag_service.py`

- [ ] **Step 1: 写失败测试**

```python
# backend/tests/test_tag_service.py
from app.services.tag_service import TagService
from unittest.mock import MagicMock

def test_extract_tags_returns_list_of_tuples():
    svc = TagService(llm_client=MagicMock())
    resume = {"skills": ["Python", "SQL"], "experience": [{"desc": "5年后端开发"}]}
    # tag_rate 的真实输出格式: [("Python", 5), ("SQL", 3)]
    result = svc.extract_tags(resume)
    assert isinstance(result, list)
    assert all(isinstance(t, tuple) and len(t) == 2 for t in result)
    assert all(1 <= score <= 5 for _, score in result)

def test_extract_tags_handles_various_formats():
    # 原仓库兼容 "Python , 5 , AI" / "Python: 5" 两种格式
    svc = TagService(llm_client=MagicMock())
    raw_labels = ["Python , 5 , AI", "SQL: 3", "Go %> 4 , backend"]
    result = svc._parse_label_strings(raw_labels)
    assert ("Python", 5) in result
    assert ("SQL", 3) in result
    assert ("Go", 4) in result
```

- [ ] **Step 2: 运行确认失败**

```bash
pytest backend/tests/test_tag_service.py -v
```
Expected: FAIL — `TagService` 不存在。

- [ ] **Step 3: 实现 tag_service.py**

```python
# backend/app/services/tag_service.py
import re
from tag_rate import rate_tags  # 复用原仓库

class TagService:
    def __init__(self, llm_client):
        self.llm = llm_client

    def _parse_label_strings(self, raw: list) -> list:
        """兼容原仓库三种标签格式: 'Python , 5 , AI' / 'Python: 5' / 'Python %> 4 , AI'"""
        result = []
        for s in raw:
            m = re.search(r'(\w[\w\s]*?)\s*[,:%>]+\s*(\d)', s)
            if m:
                tag = m.group(1).strip()
                score = min(5, max(1, int(m.group(2))))
                result.append((tag, score))
        return result

    def extract_tags(self, resume_dict: dict) -> list:
        """调用 tag_rate 对候选人简历打标签并评分，返回 [(tag, score), ...]"""
        raw = rate_tags(resume_dict, self.llm)  # tag_rate.py 原函数
        if raw and isinstance(raw[0], str):
            return self._parse_label_strings(raw)
        return raw  # 若已是 (tag, score) 格式直接返回
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pytest backend/tests/test_tag_service.py -v
```
Expected: 2 PASSED。

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/tag_service.py backend/tests/test_tag_service.py
git commit -m "feat: tag service wrapping tag_rate.py with format normalization"
```

---

## Task 5：岗找人匹配服务（反转）

**Files:**
- Create: `backend/app/services/match_service.py`
- Create: `backend/tests/test_match_service.py`

- [ ] **Step 1: 写失败测试**

```python
# backend/tests/test_match_service.py
from app.services.match_service import MatchService
from unittest.mock import MagicMock, patch

def test_match_returns_sorted_candidates():
    svc = MatchService(llm_client=MagicMock())
    jd_tags = [("Python", 5), ("SQL", 3)]
    candidates = [
        {"id": 1, "tags": [("Python", 4), ("Go", 3)]},
        {"id": 2, "tags": [("Python", 5), ("SQL", 4)]},
        {"id": 3, "tags": [("Java", 5)]},
    ]
    results = svc.rank_candidates(jd_tags, candidates)
    assert results[0]["id"] == 2   # 最高匹配
    assert results[-1]["id"] == 3  # 最低匹配
    assert all("score" in r for r in results)

def test_match_generates_reason_via_llm():
    llm = MagicMock()
    llm.chat.return_value = "候选人 Python 技能突出，SQL 评分达标"
    svc = MatchService(llm_client=llm)
    reason = svc.generate_reason(
        jd_structured={"skills": ["Python:5", "SQL:3"]},
        candidate_resume={"name": "张三", "skills": ["Python", "SQL"]}
    )
    assert "Python" in reason
    assert llm.chat.called
```

- [ ] **Step 2: 运行确认失败**

```bash
pytest backend/tests/test_match_service.py -v
```
Expected: FAIL。

- [ ] **Step 3: 实现 match_service.py**

```python
# backend/app/services/match_service.py

REASON_PROMPT = """你是一位招聘专家。根据以下 JD 要求和候选人简历，用 2-3 句话说明：
1. 候选人哪些方面符合要求  2. 哪些方面有差距
JD 要求：{jd}
候选人：{candidate}
直接输出分析，不要加前缀。"""

class MatchService:
    def __init__(self, llm_client):
        self.llm = llm_client

    def _tag_score(self, jd_tags: list, candidate_tags: list) -> float:
        """基于标签重合度+评分加权计算匹配分(0-100)"""
        jd_map = {t.lower(): s for t, s in jd_tags}
        total, matched = sum(jd_map.values()), 0.0
        for tag, score in candidate_tags:
            if tag.lower() in jd_map:
                matched += min(score, jd_map[tag.lower()])
        return round((matched / total * 100) if total else 0, 1)

    def rank_candidates(self, jd_tags: list, candidates: list) -> list:
        """输入 JD 标签 + 候选人列表，输出按匹配分倒序排列的列表"""
        scored = []
        for c in candidates:
            score = self._tag_score(jd_tags, c.get("tags", []))
            scored.append({**c, "score": score})
        return sorted(scored, key=lambda x: x["score"], reverse=True)

    def generate_reason(self, jd_structured: dict, candidate_resume: dict) -> str:
        return self.llm.chat([{
            "role": "user",
            "content": REASON_PROMPT.format(jd=jd_structured, candidate=candidate_resume)
        }])
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pytest backend/tests/test_match_service.py -v
```
Expected: 2 PASSED。

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/match_service.py backend/tests/test_match_service.py
git commit -m "feat: match service - job-to-candidate ranking with LLM reason"
```

---

## Task 6：AI 预筛面试服务（反转 AI_interviewer.py）

**Files:**
- Create: `backend/app/services/interview_service.py`
- Create: `backend/tests/test_interview_service.py`

- [ ] **Step 1: 写失败测试**

```python
# backend/tests/test_interview_service.py
from app.services.interview_service import PreScreenService
from unittest.mock import MagicMock

def test_generate_questions_uses_jd():
    llm = MagicMock()
    llm.chat.return_value = '["请描述你最复杂的 Python 项目", "如何优化 SQL 查询性能"]'
    svc = PreScreenService(llm_client=llm)
    questions = svc.generate_questions(jd_text="需要 Python 和 SQL 技能", count=2)
    assert len(questions) == 2
    assert all(isinstance(q, str) for q in questions)

def test_evaluate_answer_returns_report():
    llm = MagicMock()
    llm.chat.return_value = '{"score": 4, "highlight": "思路清晰", "concern": "无", "pass_recommended": true}'
    svc = PreScreenService(llm_client=llm)
    report = svc.evaluate_answer(
        question="请描述你最复杂的 Python 项目",
        answer="我开发了一个分布式爬虫系统…",
        jd_text="需要 Python 分布式经验"
    )
    assert report["score"] == 4
    assert report["pass_recommended"] is True
    assert "highlight" in report and "concern" in report
```

- [ ] **Step 2: 运行确认失败**

```bash
pytest backend/tests/test_interview_service.py -v
```
Expected: FAIL。

- [ ] **Step 3: 实现 interview_service.py**

```python
# backend/app/services/interview_service.py
import json
from AI_interviewer import generate_interview_questions  # 复用原仓库

EVAL_PROMPT = """你是一位严格的技术面试官。评估候选人的回答，返回 JSON：
{{"score": 1-5, "highlight": "亮点", "concern": "疑点或包装迹象", "pass_recommended": true/false}}
岗位要求：{jd}
面试题：{question}
候选人回答：{answer}
只返回 JSON，不要其他文字。"""

class PreScreenService:
    def __init__(self, llm_client):
        self.llm = llm_client

    def generate_questions(self, jd_text: str, count: int = 5) -> list:
        """复用 AI_interviewer 的出题能力，按 JD 生成面试题"""
        raw = generate_interview_questions(jd_text, count, self.llm)
        if isinstance(raw, list):
            return raw
        return json.loads(raw)

    def evaluate_answer(self, question: str, answer: str, jd_text: str) -> dict:
        """反转：从帮候选人改进 → 对候选人评分，识别包装简历"""
        raw = self.llm.chat([{
            "role": "user",
            "content": EVAL_PROMPT.format(jd=jd_text, question=question, answer=answer)
        }])
        return json.loads(raw)

    def build_report(self, qa_pairs: list, jd_text: str) -> dict:
        """对完整问答组生成预筛报告"""
        evals = [self.evaluate_answer(q, a, jd_text) for q, a in qa_pairs]
        avg_score = sum(e["score"] for e in evals) / len(evals) if evals else 0
        return {
            "avg_score": round(avg_score, 1),
            "pass_recommended": avg_score >= 3.5,
            "details": evals
        }
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pytest backend/tests/test_interview_service.py -v
```
Expected: 2 PASSED。

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/interview_service.py backend/tests/test_interview_service.py
git commit -m "feat: pre-screen interview service - reversed evaluator from AI_interviewer"
```

---

## Task 7：流水线状态机 + 埋点中间件

**Files:**
- Create: `backend/app/services/pipeline_service.py`
- Create: `backend/app/middleware/events.py`
- Create: `backend/tests/test_pipeline_service.py`

- [ ] **Step 1: 写失败测试**

```python
# backend/tests/test_pipeline_service.py
from unittest.mock import MagicMock, patch
from app.services.pipeline_service import PipelineService

VALID_STAGES = ["pending", "ai_screen", "interview", "offer", "onboarded", "rejected"]

def test_move_stage_valid_transition():
    db = MagicMock()
    db.execute.return_value = None
    svc = PipelineService(db=db)
    svc.move(candidate_id=1, job_id=1, to_stage="ai_screen", actor_id=2)
    assert db.execute.called
    call_sql = db.execute.call_args[0][0]
    assert "pipeline_stages" in call_sql

def test_move_stage_invalid_raises():
    svc = PipelineService(db=MagicMock())
    import pytest
    with pytest.raises(ValueError, match="Invalid stage"):
        svc.move(candidate_id=1, job_id=1, to_stage="nonexistent", actor_id=2)
```

- [ ] **Step 2: 运行确认失败**

```bash
pytest backend/tests/test_pipeline_service.py -v
```
Expected: FAIL。

- [ ] **Step 3: 实现 pipeline_service.py**

```python
# backend/app/services/pipeline_service.py
VALID_STAGES = {"pending", "ai_screen", "interview", "offer", "onboarded", "rejected"}

class PipelineService:
    def __init__(self, db):
        self.db = db

    def move(self, candidate_id: int, job_id: int, to_stage: str, actor_id: int):
        if to_stage not in VALID_STAGES:
            raise ValueError(f"Invalid stage: {to_stage}. Valid: {VALID_STAGES}")
        self.db.execute(
            "INSERT INTO pipeline_stages (candidate_id, job_id, stage, updated_by) VALUES (%s,%s,%s,%s)",
            (candidate_id, job_id, to_stage, actor_id)
        )
        self.db.execute(
            "INSERT INTO events (actor_id, action, entity_id, entity_type, payload) VALUES (%s,%s,%s,%s,%s)",
            (actor_id, "pipeline.moved", candidate_id, "candidate",
             f'{{"job_id":{job_id},"to":"{to_stage}"}}')
        )
```

- [ ] **Step 4: 实现埋点中间件 events.py**

```python
# backend/app/middleware/events.py
from flask import request, g
import psycopg2, json
from app.config import Config

def record_event(action: str, entity_id: int = None, entity_type: str = None, payload: dict = None):
    actor_id = getattr(g, "user_id", None)
    conn = psycopg2.connect(Config.DATABASE_URL)
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO events (actor_id, action, entity_id, entity_type, payload) VALUES (%s,%s,%s,%s,%s)",
        (actor_id, action, entity_id, entity_type, json.dumps(payload or {}))
    )
    conn.commit()
    cur.close(); conn.close()
```

- [ ] **Step 5: 运行测试确认通过**

```bash
pytest backend/tests/test_pipeline_service.py -v
```
Expected: 2 PASSED。

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/pipeline_service.py backend/app/middleware/events.py backend/tests/test_pipeline_service.py
git commit -m "feat: pipeline state machine + event tracking middleware"
```

---

## Task 8：BI 服务（指标聚合）

**Files:**
- Create: `backend/app/services/bi_service.py`
- Create: `backend/tests/test_bi_service.py`

- [ ] **Step 1: 写失败测试**

```python
# backend/tests/test_bi_service.py
from unittest.mock import MagicMock, patch
from app.services.bi_service import BIService

def test_funnel_returns_all_stages():
    db = MagicMock()
    db.fetchall.return_value = [
        ("pending", 100), ("ai_screen", 60),
        ("interview", 30), ("offer", 10), ("onboarded", 8)
    ]
    svc = BIService(db=db)
    funnel = svc.get_funnel(hr_id=None, days=30)
    assert "pending" in funnel
    assert funnel["pending"] == 100
    assert "conversion_rate" in funnel

def test_staff_metrics_returns_per_hr():
    db = MagicMock()
    db.fetchall.return_value = [
        (1, "张HR", 50, 20, 5),   # (hr_id, name, resumes, screens, onboarded)
        (2, "李HR", 30, 15, 3),
    ]
    svc = BIService(db=db)
    metrics = svc.get_staff_metrics(days=30)
    assert len(metrics) == 2
    assert metrics[0]["name"] == "张HR"
    assert "conversion_rate" in metrics[0]
```

- [ ] **Step 2: 运行确认失败**

```bash
pytest backend/tests/test_bi_service.py -v
```
Expected: FAIL。

- [ ] **Step 3: 实现 bi_service.py**

```python
# backend/app/services/bi_service.py

FUNNEL_SQL = """
SELECT stage, COUNT(*) FROM pipeline_stages
WHERE ts >= NOW() - INTERVAL '{days} days'
{hr_filter}
GROUP BY stage
"""

STAFF_SQL = """
SELECT u.id, u.name,
  COUNT(DISTINCT CASE WHEN e.action='resume.uploaded' THEN e.entity_id END) AS resumes,
  COUNT(DISTINCT CASE WHEN e.action='interview.started' THEN e.entity_id END) AS screens,
  COUNT(DISTINCT CASE WHEN e.action='candidate.onboarded' THEN e.entity_id END) AS onboarded
FROM users u
LEFT JOIN events e ON e.actor_id = u.id AND e.ts >= NOW() - INTERVAL '{days} days'
WHERE u.role = 'recruiter'
GROUP BY u.id, u.name
"""

class BIService:
    def __init__(self, db):
        self.db = db

    def get_funnel(self, hr_id: int = None, days: int = 30) -> dict:
        hr_filter = f"AND updated_by = {hr_id}" if hr_id else ""
        self.db.execute(FUNNEL_SQL.format(days=days, hr_filter=hr_filter))
        rows = self.db.fetchall()
        stages = {stage: cnt for stage, cnt in rows}
        top = stages.get("pending", 1)
        stages["conversion_rate"] = round(stages.get("onboarded", 0) / top * 100, 1)
        return stages

    def get_staff_metrics(self, days: int = 30) -> list:
        self.db.execute(STAFF_SQL.format(days=days))
        rows = self.db.fetchall()
        result = []
        for hr_id, name, resumes, screens, onboarded in rows:
            result.append({
                "hr_id": hr_id, "name": name,
                "resumes": resumes, "screens": screens, "onboarded": onboarded,
                "conversion_rate": round(onboarded / resumes * 100, 1) if resumes else 0
            })
        return result
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pytest backend/tests/test_bi_service.py -v
```
Expected: 2 PASSED。

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/bi_service.py backend/tests/test_bi_service.py
git commit -m "feat: BI service - funnel metrics + staff performance aggregation"
```

---

## Task 9：批量上传 + 匹配 API 端点 + JWT 鉴权

**Files:**
- Create: `backend/app/api/resume.py`
- Create: `backend/app/api/match.py`
- Create: `backend/app/middleware/auth.py`
- Create: `backend/tests/test_api.py`

- [ ] **Step 1: 实现 JWT 鉴权中间件**

```python
# backend/app/middleware/auth.py
import jwt, functools
from flask import request, jsonify, g
from app.config import Config

def require_auth(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        if not token:
            return jsonify({"error": "Missing token"}), 401
        try:
            payload = jwt.decode(token, Config.JWT_SECRET, algorithms=["HS256"])
            g.user_id = payload["user_id"]
            g.role = payload["role"]
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401
        return f(*args, **kwargs)
    return decorated

def require_role(*roles):
    def decorator(f):
        @functools.wraps(f)
        def decorated(*args, **kwargs):
            if g.role not in roles:
                return jsonify({"error": "Forbidden"}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator
```

- [ ] **Step 2: 实现批量上传端点**

```python
# backend/app/api/resume.py
import os
from flask import Blueprint, request, jsonify, g
from app.middleware.auth import require_auth
from backend.workers.resume_worker import process_resume

bp = Blueprint("resume", __name__)

@bp.post("/resume/upload")
@require_auth
def upload():
    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "No files provided"}), 400
    folder = os.environ.get("UPLOAD_FOLDER", "/tmp/hireinsight_uploads")
    os.makedirs(folder, exist_ok=True)
    task_ids = []
    for f in files:
        path = os.path.join(folder, f.filename)
        f.save(path)
        task = process_resume.delay(path, g.user_id)
        task_ids.append({"file": f.filename, "task_id": task.id})
    return jsonify({"queued": len(task_ids), "tasks": task_ids}), 202
```

- [ ] **Step 3: 实现岗找人匹配端点**

```python
# backend/app/api/match.py
import psycopg2, json
from flask import Blueprint, request, jsonify
from app.middleware.auth import require_auth
from app.services.match_service import MatchService
from app.services.tag_service import TagService
from app.config import Config
from llm_client import LLMClient

bp = Blueprint("match", __name__)

@bp.post("/match")
@require_auth
def match_job():
    data = request.get_json()
    job_id = data.get("job_id")
    if not job_id:
        return jsonify({"error": "job_id required"}), 400
    conn = psycopg2.connect(Config.DATABASE_URL)
    cur = conn.cursor()
    cur.execute("SELECT jd_structured FROM jobs WHERE id = %s", (job_id,))
    row = cur.fetchone()
    if not row:
        return jsonify({"error": "Job not found"}), 404
    jd = row[0]
    cur.execute("SELECT c.id, array_agg(ct.tag || ':' || ct.score) FROM candidates c JOIN candidate_tags ct ON ct.candidate_id=c.id GROUP BY c.id")
    candidates_raw = cur.fetchall()
    cur.close(); conn.close()
    llm = LLMClient()
    tag_svc = TagService(llm_client=llm)
    match_svc = MatchService(llm_client=llm)
    jd_tags = tag_svc._parse_label_strings(jd.get("skills", []))
    candidates = [{"id": r[0], "tags": tag_svc._parse_label_strings(r[1] or [])} for r in candidates_raw]
    ranked = match_svc.rank_candidates(jd_tags, candidates)
    return jsonify({"job_id": job_id, "results": ranked[:20]}), 200
```

- [ ] **Step 4: 写 API 集成测试**

```python
# backend/tests/test_api.py
import pytest
from unittest.mock import patch, MagicMock
from app import create_app

@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    return app.test_client()

def test_upload_without_token_returns_401(client):
    resp = client.post("/api/resume/upload")
    assert resp.status_code == 401

def test_match_without_token_returns_401(client):
    resp = client.post("/api/match", json={"job_id": 1})
    assert resp.status_code == 401
```

- [ ] **Step 5: 运行测试**

```bash
pytest backend/tests/test_api.py -v
```
Expected: 2 PASSED。

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/ backend/app/middleware/auth.py backend/tests/test_api.py
git commit -m "feat: resume upload + match API endpoints with JWT auth"
```

---

## Task 10：BI 看板 API + 全量测试通过

**Files:**
- Create: `backend/app/api/bi.py`

- [ ] **Step 1: 实现 BI 端点**

```python
# backend/app/api/bi.py
import psycopg2
from flask import Blueprint, request, jsonify
from app.middleware.auth import require_auth, require_role
from app.services.bi_service import BIService
from app.config import Config

bp = Blueprint("bi", __name__)

def get_db():
    conn = psycopg2.connect(Config.DATABASE_URL)
    return conn.cursor()

@bp.get("/bi/overview")
@require_auth
@require_role("manager", "admin")
def overview():
    days = int(request.args.get("days", 30))
    cur = get_db()
    svc = BIService(db=cur)
    return jsonify({
        "funnel": svc.get_funnel(days=days),
        "staff": svc.get_staff_metrics(days=days)
    })

@bp.get("/bi/staff/<int:hr_id>")
@require_auth
def staff_detail(hr_id):
    from flask import g
    # 专员只能看自己
    if g.role == "recruiter" and g.user_id != hr_id:
        return jsonify({"error": "Forbidden"}), 403
    days = int(request.args.get("days", 30))
    cur = get_db()
    svc = BIService(db=cur)
    funnel = svc.get_funnel(hr_id=hr_id, days=days)
    return jsonify({"hr_id": hr_id, "funnel": funnel})
```

- [ ] **Step 2: 运行全量测试**

```bash
pytest backend/tests/ -v --tb=short
```
Expected: 全部 PASSED，无 ERROR。

- [ ] **Step 3: 最终 Commit**

```bash
git add backend/app/api/bi.py
git commit -m "feat: BI dashboard API with role-based access control"
```

---

## 自检清单（Self-Review）

**Spec 覆盖：**
- [x] 批量简历上传 → Task 3（解析）+ Task 9（API）
- [x] 打标评分 → Task 4
- [x] 候选人画像 → Task 3 的 `resume_json` + Task 4 的 `candidate_tags`
- [x] 岗找人匹配 → Task 5 + Task 9 的 `/api/match`
- [x] AI 预筛面试（反转）→ Task 6
- [x] 招聘流水线 → Task 7
- [x] BI 看板 → Task 8 + Task 10
- [x] JWT 鉴权 + RBAC → Task 9 的 `auth.py`
- [x] 操作埋点 → Task 7 的 `events.py` + `pipeline_service.py`
- [x] LLM 可换模型 → Task 2

**类型/命名一致性：**
- `ResumeBatchService` → Task 3 定义，Task 9 `resume_worker` 使用 ✓
- `TagService._parse_label_strings()` → Task 4 定义，Task 5/9 使用 ✓
- `MatchService.rank_candidates()` → Task 5 定义，Task 9 使用 ✓
- `BIService.get_funnel()` / `get_staff_metrics()` → Task 8 定义，Task 10 使用 ✓
