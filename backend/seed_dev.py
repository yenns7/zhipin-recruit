#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
HireInsight dev seed script
Usage: cd backend && python seed_dev.py

Strategy: wipe-and-reseed — deletes all rows from seeded tables each run,
then inserts fresh data.  Safe to re-run; does NOT drop tables.

All LLM-derived fields (resume_json, jd_structured, ai_report, qa_json)
are pre-populated inline so NO LLM key is required.
"""

import sys
import os
import bcrypt
from datetime import datetime, timedelta
from pathlib import Path

# Windows 控制台默认 GBK 编码，无法输出中文/✓，强制 UTF-8
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# Make sure we can import the app from the backend directory
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app import create_app, db
from app.models import (
    User, Candidate, CandidateTag, Job, Match,
    Interview, PipelineStage, Event, AuditLog
)

app = create_app()


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def _dt(days_ago: int = 0, hours_ago: int = 0) -> datetime:
    return datetime.utcnow() - timedelta(days=days_ago, hours=hours_ago)


def wipe():
    """Delete all rows from seeded tables in FK-safe order."""
    db.session.query(AuditLog).delete()
    db.session.query(Event).delete()
    db.session.query(PipelineStage).delete()
    db.session.query(Interview).delete()
    db.session.query(Match).delete()
    db.session.query(CandidateTag).delete()
    db.session.query(Candidate).delete()
    db.session.query(Job).delete()
    db.session.query(User).delete()
    db.session.commit()


def seed():
    with app.app_context():
        wipe()

        # ── 1. USERS ──────────────────────────────────────────────────────────
        pw = _hash("demo1234")

        manager = User(name="陈经理", email="manager@demo.com", role="manager", password_hash=pw, created_at=_dt(60))
        hr1     = User(name="张专员", email="hr1@demo.com",      role="recruiter", password_hash=pw, created_at=_dt(55))
        hr2     = User(name="李专员", email="hr2@demo.com",      role="recruiter", password_hash=pw, created_at=_dt(50))
        hr3     = User(name="王专员", email="hr3@demo.com",      role="recruiter", password_hash=pw, created_at=_dt(45))
        ivr     = User(name="赵面试官", email="interviewer@demo.com", role="interviewer", password_hash=pw, created_at=_dt(40))
        adm     = User(name="系统管理员", email="admin@demo.com", role="admin", password_hash=pw, created_at=_dt(60))

        db.session.add_all([manager, hr1, hr2, hr3, ivr, adm])
        db.session.flush()  # get IDs

        # ── 2. JOBS ───────────────────────────────────────────────────────────
        # jd_structured must contain skill_tags_raw in pipe-separated format
        # that parse_job_skills() understands: "技能名 , 分数 | 技能名 , 分数 | ..."

        job1 = Job(
            title="高级Python后端工程师",
            jd_text=(
                "负责核心业务系统的后端开发，技术栈 Python/Flask/FastAPI，"
                "熟悉 SQLAlchemy、Redis、Celery，具备良好的系统设计能力。"
                "3年以上Python开发经验，有大规模分布式系统经验优先。"
            ),
            jd_structured={
                "title": "高级Python后端工程师",
                "required_skills": ["Python", "Flask", "SQLAlchemy", "Redis", "Celery"],
                "skill_tags_raw": "Python , 5 | Flask , 4 | SQLAlchemy , 4 | Redis , 3 | Celery , 3 | 系统设计 , 4 | Docker , 3",
                "experience_years": 3,
                "education": "本科",
                "department": "技术部",
            },
            owner_hr_id=hr1.id,
            status="active",
            created_at=_dt(30),
        )

        job2 = Job(
            title="前端开发工程师（React）",
            jd_text=(
                "负责公司产品前端开发，技术栈 React18/TypeScript/Tailwind CSS，"
                "熟悉 Vite 构建工具，有 echarts/recharts 可视化经验优先。"
                "2年以上前端开发经验。"
            ),
            jd_structured={
                "title": "前端开发工程师（React）",
                "required_skills": ["React", "TypeScript", "Tailwind CSS", "Vite"],
                "skill_tags_raw": "React , 5 | TypeScript , 4 | Tailwind CSS , 3 | Vite , 3 | JavaScript , 4 | CSS , 3 | recharts , 2",
                "experience_years": 2,
                "education": "本科",
                "department": "产品部",
            },
            owner_hr_id=hr2.id,
            status="active",
            created_at=_dt(25),
        )

        job3 = Job(
            title="AI算法工程师",
            jd_text=(
                "负责NLP/LLM相关算法研发，熟悉 Transformers、PyTorch，"
                "有大模型微调（Fine-tuning）经验，了解 LangChain/LlamaIndex。"
                "硕士及以上学历，2年以上算法岗位经验。"
            ),
            jd_structured={
                "title": "AI算法工程师",
                "required_skills": ["Python", "PyTorch", "Transformers", "NLP"],
                "skill_tags_raw": "Python , 5 | PyTorch , 5 | Transformers , 5 | NLP , 4 | LangChain , 4 | Fine-tuning , 4 | CUDA , 3",
                "experience_years": 2,
                "education": "硕士",
                "department": "AI研究院",
            },
            owner_hr_id=hr1.id,
            status="active",
            created_at=_dt(20),
        )

        job4 = Job(
            title="数据分析师",
            jd_text=(
                "负责业务数据分析与报表，熟悉 SQL、Python（Pandas/Numpy），"
                "有 Tableau 或 Power BI 经验，能独立完成数据看板搭建。"
                "1年以上数据分析经验。"
            ),
            jd_structured={
                "title": "数据分析师",
                "required_skills": ["SQL", "Python", "Pandas", "Tableau"],
                "skill_tags_raw": "SQL , 5 | Python , 4 | Pandas , 4 | Numpy , 3 | Tableau , 3 | Power BI , 3 | 数据可视化 , 3",
                "experience_years": 1,
                "education": "本科",
                "department": "数据部",
            },
            owner_hr_id=manager.id,
            status="active",
            created_at=_dt(15),
        )

        db.session.add_all([job1, job2, job3, job4])
        db.session.flush()

        # ── 3. CANDIDATES + TAGS ──────────────────────────────────────────────
        def make_candidate(owner_id, name_masked, email_masked, phone_masked, resume_json, created_days_ago):
            c = Candidate(
                owner_hr_id=owner_id,
                name_masked=name_masked,
                email_masked=email_masked,
                phone_masked=phone_masked,
                resume_json=resume_json,
                raw_file_path=None,
                created_at=_dt(created_days_ago),
            )
            db.session.add(c)
            db.session.flush()
            return c

        def add_tags(candidate, tags):
            for tag, score in tags:
                db.session.add(CandidateTag(candidate_id=candidate.id, tag=tag, score=score))

        # Candidate 1 — strong Python backend
        c1 = make_candidate(
            hr1.id, "候选人001", "c***1@email.com", "138****0001",
            {
                "name": "候选人001",
                "education": [{"school": "复旦大学", "degree": "本科", "major": "计算机科学", "year": 2019}],
                "experience": [
                    {"company": "某互联网公司A", "title": "Python工程师", "years": 3,
                     "desc": "负责核心API开发，Flask + SQLAlchemy + Celery"},
                    {"company": "某创业公司B", "title": "初级工程师", "years": 1,
                     "desc": "Django REST Framework开发"},
                ],
                "skills": ["Python", "Flask", "SQLAlchemy", "Redis", "Celery", "Docker"],
                "summary": "4年Python后端经验，熟悉微服务架构",
            },
            28,
        )
        add_tags(c1, [("Python", 5), ("Flask", 4), ("SQLAlchemy", 4), ("Redis", 4), ("Celery", 3), ("Docker", 3), ("系统设计", 3)])

        # Candidate 2 — React frontend
        c2 = make_candidate(
            hr1.id, "候选人002", "c***2@email.com", "138****0002",
            {
                "name": "候选人002",
                "education": [{"school": "上海交通大学", "degree": "本科", "major": "软件工程", "year": 2021}],
                "experience": [
                    {"company": "某科技公司C", "title": "前端工程师", "years": 2,
                     "desc": "React18 + TypeScript + Tailwind CSS，负责管理后台"},
                ],
                "skills": ["React", "TypeScript", "JavaScript", "Tailwind CSS", "Vite", "CSS"],
                "summary": "2年React前端经验，TypeScript熟练",
            },
            25,
        )
        add_tags(c2, [("React", 5), ("TypeScript", 4), ("JavaScript", 4), ("Tailwind CSS", 3), ("Vite", 3), ("CSS", 3)])

        # Candidate 3 — AI/NLP specialist
        c3 = make_candidate(
            hr2.id, "候选人003", "c***3@email.com", "139****0003",
            {
                "name": "候选人003",
                "education": [{"school": "清华大学", "degree": "硕士", "major": "人工智能", "year": 2022}],
                "experience": [
                    {"company": "某AI公司D", "title": "NLP算法工程师", "years": 2,
                     "desc": "大模型微调、RAG系统搭建，PyTorch + Transformers"},
                ],
                "skills": ["Python", "PyTorch", "Transformers", "NLP", "LangChain", "Fine-tuning", "CUDA"],
                "summary": "2年NLP/LLM经验，有大模型微调项目落地经验",
            },
            22,
        )
        add_tags(c3, [("Python", 5), ("PyTorch", 5), ("Transformers", 5), ("NLP", 4), ("LangChain", 4), ("Fine-tuning", 4), ("CUDA", 3)])

        # Candidate 4 — data analyst
        c4 = make_candidate(
            hr2.id, "候选人004", "c***4@email.com", "139****0004",
            {
                "name": "候选人004",
                "education": [{"school": "北京大学", "degree": "本科", "major": "统计学", "year": 2020}],
                "experience": [
                    {"company": "某咨询公司E", "title": "数据分析师", "years": 3,
                     "desc": "SQL+Python数据分析，Tableau看板，业务报表"},
                ],
                "skills": ["SQL", "Python", "Pandas", "Numpy", "Tableau", "Power BI", "数据可视化"],
                "summary": "3年数据分析经验，擅长业务数据洞察",
            },
            20,
        )
        add_tags(c4, [("SQL", 5), ("Python", 4), ("Pandas", 4), ("Numpy", 3), ("Tableau", 4), ("Power BI", 3), ("数据可视化", 4)])

        # Candidate 5 — mixed Python + data
        c5 = make_candidate(
            hr3.id, "候选人005", "c***5@email.com", "137****0005",
            {
                "name": "候选人005",
                "education": [{"school": "浙江大学", "degree": "本科", "major": "信息系统", "year": 2018}],
                "experience": [
                    {"company": "某金融公司F", "title": "后端工程师", "years": 5,
                     "desc": "Python Flask API开发，MySQL/Redis，数据管道"},
                ],
                "skills": ["Python", "Flask", "SQL", "Redis", "Pandas", "Docker"],
                "summary": "5年后端经验，Python全栈能力",
            },
            18,
        )
        add_tags(c5, [("Python", 5), ("Flask", 4), ("SQL", 4), ("Redis", 3), ("Pandas", 3), ("Docker", 4)])

        # Candidate 6 — junior frontend
        c6 = make_candidate(
            hr3.id, "候选人006", "c***6@email.com", "137****0006",
            {
                "name": "候选人006",
                "education": [{"school": "同济大学", "degree": "本科", "major": "数字媒体", "year": 2023}],
                "experience": [
                    {"company": "某广告公司G", "title": "前端实习生", "years": 1,
                     "desc": "Vue3 + JavaScript，HTML/CSS页面开发"},
                ],
                "skills": ["JavaScript", "CSS", "Vue", "HTML", "React"],
                "summary": "1年前端经验，转React方向中",
            },
            15,
        )
        add_tags(c6, [("JavaScript", 3), ("CSS", 3), ("React", 2), ("Vue", 3), ("HTML", 3)])

        # Candidate 7 — senior AI researcher
        c7 = make_candidate(
            hr1.id, "候选人007", "c***7@email.com", "136****0007",
            {
                "name": "候选人007",
                "education": [{"school": "中科院", "degree": "博士", "major": "计算机视觉", "year": 2021}],
                "experience": [
                    {"company": "某大厂AI部门H", "title": "高级算法工程师", "years": 3,
                     "desc": "多模态大模型，PyTorch CUDA优化，Fine-tuning"},
                ],
                "skills": ["Python", "PyTorch", "CUDA", "Transformers", "Fine-tuning", "NLP", "计算机视觉"],
                "summary": "3年顶级AI研究经验，多篇顶会论文",
            },
            12,
        )
        add_tags(c7, [("Python", 5), ("PyTorch", 5), ("CUDA", 5), ("Transformers", 5), ("Fine-tuning", 5), ("NLP", 4), ("LangChain", 3)])

        # Candidate 8 — DevOps/backend
        c8 = make_candidate(
            hr2.id, "候选人008", "c***8@email.com", "136****0008",
            {
                "name": "候选人008",
                "education": [{"school": "华中科技大学", "degree": "本科", "major": "网络工程", "year": 2019}],
                "experience": [
                    {"company": "某云服务公司I", "title": "DevOps工程师", "years": 4,
                     "desc": "Docker/K8s，CI/CD，Python自动化脚本，Redis"},
                ],
                "skills": ["Docker", "Python", "Redis", "Celery", "SQL", "系统设计"],
                "summary": "4年DevOps+后端经验，基础设施扎实",
            },
            10,
        )
        add_tags(c8, [("Docker", 5), ("Python", 4), ("Redis", 4), ("Celery", 3), ("SQL", 3), ("系统设计", 3)])

        # Candidate 9 — full-stack leaning backend
        c9 = make_candidate(
            hr3.id, "候选人009", "c***9@email.com", "135****0009",
            {
                "name": "候选人009",
                "education": [{"school": "南京大学", "degree": "本科", "major": "软件工程", "year": 2020}],
                "experience": [
                    {"company": "某电商公司J", "title": "全栈工程师", "years": 3,
                     "desc": "Python FastAPI + React，TypeScript，Tailwind CSS"},
                ],
                "skills": ["Python", "React", "TypeScript", "Tailwind CSS", "SQL", "Docker"],
                "summary": "3年全栈经验，前后端均可",
            },
            8,
        )
        add_tags(c9, [("Python", 4), ("React", 4), ("TypeScript", 4), ("Tailwind CSS", 3), ("SQL", 3), ("Docker", 3)])

        # Candidate 10 — pure data scientist
        c10 = make_candidate(
            hr1.id, "候选人010", "c***10@email.com", "135****0010",
            {
                "name": "候选人010",
                "education": [{"school": "中国人民大学", "degree": "硕士", "major": "应用统计", "year": 2022}],
                "experience": [
                    {"company": "某银行K", "title": "数据科学家", "years": 2,
                     "desc": "Python Pandas分析，SQL数据仓库，Power BI报表"},
                ],
                "skills": ["Python", "SQL", "Pandas", "Numpy", "Power BI", "数据可视化", "Tableau"],
                "summary": "2年金融数据分析经验",
            },
            6,
        )
        add_tags(c10, [("Python", 4), ("SQL", 5), ("Pandas", 5), ("Numpy", 4), ("Power BI", 4), ("数据可视化", 4), ("Tableau", 3)])

        all_candidates = [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10]
        db.session.flush()

        # ── 4. PIPELINE STAGES ────────────────────────────────────────────────
        # Spread candidates across stages for interesting Kanban + BI funnel
        pipeline_data = [
            # (candidate, job, stage, updated_by, days_ago)
            (c1,  job1, "pending",    hr1.id, 28),
            (c1,  job1, "ai_screen",  hr1.id, 26),
            (c1,  job1, "interview",  hr1.id, 22),
            (c1,  job1, "offer",      manager.id, 18),
            (c1,  job1, "onboarded",  manager.id, 10),

            (c2,  job2, "pending",    hr1.id, 25),
            (c2,  job2, "ai_screen",  hr1.id, 23),
            (c2,  job2, "interview",  hr1.id, 19),
            (c2,  job2, "offer",      manager.id, 14),

            (c3,  job3, "pending",    hr2.id, 22),
            (c3,  job3, "ai_screen",  hr2.id, 20),
            (c3,  job3, "interview",  hr2.id, 16),
            (c3,  job3, "onboarded",  manager.id, 8),

            (c4,  job4, "pending",    hr2.id, 20),
            (c4,  job4, "ai_screen",  hr2.id, 18),
            (c4,  job4, "interview",  hr2.id, 14),

            (c5,  job1, "pending",    hr3.id, 18),
            (c5,  job1, "ai_screen",  hr3.id, 16),
            (c5,  job1, "rejected",   hr3.id, 12),

            (c6,  job2, "pending",    hr3.id, 15),
            (c6,  job2, "ai_screen",  hr3.id, 13),
            (c6,  job2, "rejected",   hr3.id, 9),

            (c7,  job3, "pending",    hr1.id, 12),
            (c7,  job3, "ai_screen",  hr1.id, 10),
            (c7,  job3, "interview",  hr1.id, 7),
            (c7,  job3, "offer",      manager.id, 4),
            (c7,  job3, "onboarded",  manager.id, 2),

            (c8,  job1, "pending",    hr2.id, 10),
            (c8,  job1, "ai_screen",  hr2.id, 8),
            (c8,  job1, "interview",  hr2.id, 5),

            (c9,  job2, "pending",    hr3.id, 8),
            (c9,  job2, "ai_screen",  hr3.id, 6),

            (c10, job4, "pending",    hr1.id, 6),
            (c10, job4, "ai_screen",  hr1.id, 4),
            (c10, job4, "interview",  hr1.id, 2),
            (c10, job4, "offer",      manager.id, 1),
        ]

        for cand, job, stage, updated_by, days_ago in pipeline_data:
            db.session.add(PipelineStage(
                candidate_id=cand.id,
                job_id=job.id,
                stage=stage,
                updated_by=updated_by,
                ts=_dt(days_ago),
            ))

        db.session.flush()

        # ── 5. INTERVIEWS ─────────────────────────────────────────────────────
        interview1 = Interview(
            candidate_id=c1.id,
            job_id=job1.id,
            qa_json=[
                {"q": "请介绍你在Flask项目中最有挑战性的一个经历。",
                 "a": "我们需要在高并发场景下将API响应时间从800ms优化至150ms，通过引入Redis缓存层和异步Celery任务实现。"},
                {"q": "如何设计一个分布式任务队列？",
                 "a": "基于Celery+Redis/RabbitMQ，使用优先级队列和结果后端，配合监控保障可靠性。"},
                {"q": "SQLAlchemy中如何避免N+1查询？",
                 "a": "使用joinedload或subqueryload进行预加载，或者用selectin加载关联对象。"},
            ],
            ai_report={
                "avg_score": 4.2,
                "pass_recommended": True,
                "summary": "候选人技术扎实，Python后端经验丰富，系统设计能力较强，建议录用。",
                "details": [
                    {"question": "Flask挑战经历", "score": 4, "highlight": "实际优化经验具体，有数据支撑", "concern": "未提及监控方案", "pass_recommended": True},
                    {"question": "分布式任务队列设计", "score": 5, "highlight": "方案完整，覆盖可靠性", "concern": "无", "pass_recommended": True},
                    {"question": "N+1查询避免", "score": 4, "highlight": "知道主流方案", "concern": "未提及二级缓存", "pass_recommended": True},
                ],
            },
            score=4.2,
            pass_recommended=True,
            created_at=_dt(22),
        )

        interview2 = Interview(
            candidate_id=c3.id,
            job_id=job3.id,
            qa_json=[
                {"q": "介绍一个你做过的大模型微调项目。",
                 "a": "基于LLaMA-2-7B做领域微调，使用LoRA+QLoRA技术，训练集约50k条，最终在下游任务提升12%。"},
                {"q": "RAG与Fine-tuning的适用场景区别？",
                 "a": "RAG适合知识频繁更新、需要精确引用的场景；Fine-tuning适合风格/格式统一、特定领域能力强化。"},
                {"q": "如何评估LLM输出质量？",
                 "a": "结合自动指标（BLEU/ROUGE/BERTScore）和人工评估，对于实际业务用LLM-as-judge打分。"},
            ],
            ai_report={
                "avg_score": 4.7,
                "pass_recommended": True,
                "summary": "候选人AI能力突出，大模型微调经验丰富，理论与实践结合好，强烈推荐录用。",
                "details": [
                    {"question": "大模型微调项目", "score": 5, "highlight": "有完整项目落地经验，指标具体", "concern": "无", "pass_recommended": True},
                    {"question": "RAG vs Fine-tuning", "score": 5, "highlight": "理解深刻，对比清晰", "concern": "无", "pass_recommended": True},
                    {"question": "LLM质量评估", "score": 4, "highlight": "方法全面，提到LLM-as-judge", "concern": "未提及人工标注成本控制", "pass_recommended": True},
                ],
            },
            score=4.7,
            pass_recommended=True,
            created_at=_dt(16),
        )

        interview3 = Interview(
            candidate_id=c6.id,
            job_id=job2.id,
            qa_json=[
                {"q": "请介绍你的React项目经验。",
                 "a": "主要做Vue3，React只用过基础的hooks，没有大型项目经验。"},
                {"q": "TypeScript的泛型如何使用？",
                 "a": "了解基本语法，但实际项目中用得不多，通常用any绕过类型检查。"},
            ],
            ai_report={
                "avg_score": 1.8,
                "pass_recommended": False,
                "summary": "候选人React经验不足，TypeScript掌握较弱，与岗位要求差距较大，暂不推荐。",
                "details": [
                    {"question": "React项目经验", "score": 2, "highlight": "了解前端基础", "concern": "主要经验是Vue，React经验不足", "pass_recommended": False},
                    {"question": "TypeScript泛型", "score": 2, "highlight": "知道基本概念", "concern": "实际项目中回避类型安全，用any绕过", "pass_recommended": False},
                ],
            },
            score=1.8,
            pass_recommended=False,
            created_at=_dt(13),
        )

        db.session.add_all([interview1, interview2, interview3])
        db.session.flush()

        # ── 6. EVENTS ─────────────────────────────────────────────────────────
        # BI overview counts:
        #   resumes  = COUNT(DISTINCT entity_id WHERE action='resume.uploaded')
        #   screens  = COUNT(DISTINCT entity_id WHERE action='interview.started')
        #   onboarded= COUNT(DISTINCT entity_id WHERE action='candidate.onboarded')
        # We attribute events to recruiters (actor_id = hr1/hr2/hr3)

        events_data = [
            # hr1 — 4 resumes, 3 screens, 2 onboarded
            (hr1.id, "resume.uploaded",     c1.id,  "candidate", 28),
            (hr1.id, "resume.uploaded",     c2.id,  "candidate", 25),
            (hr1.id, "resume.uploaded",     c7.id,  "candidate", 12),
            (hr1.id, "resume.uploaded",     c10.id, "candidate", 6),
            (hr1.id, "interview.started",   c1.id,  "candidate", 22),
            (hr1.id, "interview.started",   c7.id,  "candidate", 7),
            (hr1.id, "interview.started",   c10.id, "candidate", 2),
            (hr1.id, "candidate.onboarded", c1.id,  "candidate", 10),
            (hr1.id, "candidate.onboarded", c7.id,  "candidate", 2),

            # hr2 — 3 resumes, 2 screens, 1 onboarded
            (hr2.id, "resume.uploaded",     c3.id,  "candidate", 22),
            (hr2.id, "resume.uploaded",     c4.id,  "candidate", 20),
            (hr2.id, "resume.uploaded",     c8.id,  "candidate", 10),
            (hr2.id, "interview.started",   c3.id,  "candidate", 16),
            (hr2.id, "interview.started",   c8.id,  "candidate", 5),
            (hr2.id, "candidate.onboarded", c3.id,  "candidate", 8),

            # hr3 — 3 resumes, 0 screens, 0 onboarded (poor conversion — adds contrast)
            (hr3.id, "resume.uploaded",     c5.id,  "candidate", 18),
            (hr3.id, "resume.uploaded",     c6.id,  "candidate", 15),
            (hr3.id, "resume.uploaded",     c9.id,  "candidate", 8),
        ]

        for actor_id, action, entity_id, entity_type, days_ago in events_data:
            db.session.add(Event(
                actor_id=actor_id,
                action=action,
                entity_id=entity_id,
                entity_type=entity_type,
                payload={"seeded": True},
                ts=_dt(days_ago),
            ))

        db.session.commit()

        # ── 7. MATCH ROWS (seed first 2 jobs via MatchService) ───────────────
        from app.services.match_service import MatchService
        svc = MatchService()
        for seed_job in [job1, job2]:
            svc.rank_for_job(seed_job.id)

        # ── SUMMARY ───────────────────────────────────────────────────────────
        print("\n" + "="*60)
        print("  HireInsight Dev Seed — Complete")
        print("="*60)
        print("\nLogin Credentials (password: demo1234 for all):")
        print(f"  {'Role':<12} {'Email':<30} {'Name'}")
        print(f"  {'-'*12} {'-'*30} {'-'*10}")
        creds = [
            ("admin",       "admin@demo.com",       "系统管理员"),
            ("manager",     "manager@demo.com",     "陈经理"),
            ("recruiter",   "hr1@demo.com",         "张专员"),
            ("recruiter",   "hr2@demo.com",         "李专员"),
            ("recruiter",   "hr3@demo.com",         "王专员"),
            ("interviewer", "interviewer@demo.com", "赵面试官"),
        ]
        for role, email, name in creds:
            print(f"  {role:<12} {email:<30} {name}")

        print("\nData created:")
        print(f"  Users        : {db.session.query(User).count()}")
        print(f"  Jobs         : {db.session.query(Job).count()}")
        print(f"  Candidates   : {db.session.query(Candidate).count()}")
        print(f"  CandidateTags: {db.session.query(CandidateTag).count()}")
        print(f"  Interviews   : {db.session.query(Interview).count()}")
        print(f"  PipelineStages: {db.session.query(PipelineStage).count()}")
        print(f"  Events       : {db.session.query(Event).count()}")
        print(f"  Matches      : {db.session.query(Match).count()}")
        print("="*60 + "\n")


if __name__ == "__main__":
    seed()
