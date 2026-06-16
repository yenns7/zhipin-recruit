from datetime import datetime, timedelta


def test_demo_readiness_service_cleans_demo_data_idempotently(app):
    with app.app_context():
        from app import db
        from app.models import Candidate, Job, PipelineStage, User
        from app.services.demo_readiness_service import prepare_demo_readiness

        admin = User(
            name="系统管理员",
            email="demo-admin@example.com",
            role="admin",
            password_hash="x",
        )
        interviewer = User(
            name="赵面试官",
            email="demo-interviewer@example.com",
            role="interviewer",
            password_hash="x",
        )
        recruiter = User(
            name="张专员",
            email="demo-hr@example.com",
            role="recruiter",
            password_hash="x",
        )
        job = Job(
            title="高级Python后端工程师",
            city="深圳",
            department="技术研发部",
            job_code="SZ-BE-001",
            jd_text="负责 Python 后端开发",
            owner_hr_id=1,
        )
        db.session.add_all([admin, interviewer, recruiter, job])
        db.session.flush()

        first = Candidate(
            owner_hr_id=recruiter.id,
            name_masked="张伟",
            email_masked="zhangwei.demo@example.com",
            phone_masked="13800001111",
            resume_json={"extracted_info": {"summary": "Python 后端"}},
        )
        second = Candidate(
            owner_hr_id=recruiter.id,
            name_masked="张伟",
            email_masked="zhangwei.demo@example.com",
            phone_masked="13800001111",
            resume_json={"extracted_info": {"summary": "React 前端"}},
        )
        third = Candidate(
            owner_hr_id=recruiter.id,
            name_masked="张伟-99",
            email_masked="孙七@example.com",
            phone_masked="13800001111",
            resume_json={"extracted_info": {"summary": "数据分析"}},
        )
        db.session.add_all([first, second, third])
        db.session.flush()
        db.session.add(PipelineStage(
            candidate_id=first.id,
            job_id=job.id,
            stage="interview_first",
            updated_by=admin.id,
            ts=datetime.utcnow() - timedelta(days=1),
        ))
        db.session.commit()

        result = prepare_demo_readiness()
        second_result = prepare_demo_readiness()

        refreshed = Candidate.query.order_by(Candidate.id.asc()).all()
        refreshed_names = [c.name_masked for c in refreshed]
        assert len(set(refreshed_names)) == 3
        assert not any(name in {"张伟", "测试候选人"} for name in refreshed_names)
        assert not any(name.startswith("候选人") for name in refreshed_names)
        assert not any("-" in name for name in refreshed_names)
        assert len({c.email_masked for c in refreshed}) == 3
        assert not any(any(ord(char) > 127 for char in c.email_masked or "") for c in refreshed)
        assert len({c.phone_masked for c in refreshed}) == 3
        assert all(c.upload_batch_id for c in refreshed)
        assert result["candidates_linked"] == 3
        assert result["candidate_names_cleaned"] == 3
        assert result["candidate_contacts_cleaned"] == 6
        assert result["assignments_created"] == 1
        assert second_result["assignments_created"] == 0
