def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_owned_job_candidate(app, owner_id, title="后端", name="候选人"):
    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateTag, Job

        job = Job(
            title=title,
            jd_text="Python 后端",
            jd_structured={"skill_tags_raw": "Python , 5 | Flask , 4"},
            owner_hr_id=owner_id,
        )
        candidate = Candidate(
            owner_hr_id=owner_id,
            name_masked=name,
            resume_json={},
        )
        db.session.add_all([job, candidate])
        db.session.flush()
        db.session.add(CandidateTag(candidate_id=candidate.id, tag="Python", score=5))
        db.session.commit()
        return job.id, candidate.id


def test_match_results_are_scoped_to_recruiter_owned_candidates(client, make_user, app):
    owner_id, owner_token = make_user("match-owner@x.com", role="recruiter")
    other_id, _ = make_user("match-other@x.com", role="recruiter")
    job_id, owner_candidate_id = _seed_owned_job_candidate(
        app,
        owner_id,
        title="Python 后端",
        name="自有候选人",
    )
    _, other_candidate_id = _seed_owned_job_candidate(
        app,
        other_id,
        title="无关岗位",
        name="他人候选人",
    )

    response = client.post(f"/api/jobs/{job_id}/match", headers=_auth(owner_token))

    assert response.status_code == 200
    result_ids = {item["candidate_id"] for item in response.get_json()["results"]}
    assert owner_candidate_id in result_ids
    assert other_candidate_id not in result_ids


def test_match_preview_is_read_only(client, make_user, app):
    owner_id, owner_token = make_user("match-preview-owner@x.com", role="recruiter")
    job_id, candidate_id = _seed_owned_job_candidate(
        app,
        owner_id,
        title="Python 后端",
        name="预览候选人",
    )

    with app.app_context():
        from app.models import Match

        before_count = Match.query.count()

    response = client.get(f"/api/jobs/{job_id}/match-preview", headers=_auth(owner_token))

    assert response.status_code == 200
    result_ids = {item["candidate_id"] for item in response.get_json()["results"]}
    assert candidate_id in result_ids
    with app.app_context():
        from app.models import Match

        assert Match.query.count() == before_count


def test_recruiter_cannot_move_another_recruiters_candidate(client, make_user, app):
    owner_id, owner_token = make_user("pipeline-owner@x.com", role="recruiter")
    other_id, _ = make_user("pipeline-other@x.com", role="recruiter")
    job_id, _ = _seed_owned_job_candidate(app, owner_id)
    _, other_candidate_id = _seed_owned_job_candidate(app, other_id)

    response = client.post(
        "/api/pipeline/move",
        headers=_auth(owner_token),
        json={
            "candidate_id": other_candidate_id,
            "job_id": job_id,
            "stage": "pending",
        },
    )

    assert response.status_code == 403


def test_recruiter_cannot_read_another_recruiters_ai_interview(client, make_user, app):
    owner_id, owner_token = make_user("interview-owner@x.com", role="recruiter")
    other_id, _ = make_user("interview-other@x.com", role="recruiter")
    _seed_owned_job_candidate(app, owner_id)
    other_job_id, other_candidate_id = _seed_owned_job_candidate(app, other_id)

    with app.app_context():
        from app import db
        from app.models import Interview

        interview = Interview(
            candidate_id=other_candidate_id,
            job_id=other_job_id,
            qa_json=[],
            ai_report={"avg_score": 4},
            score=4,
            pass_recommended=True,
        )
        db.session.add(interview)
        db.session.commit()
        interview_id = interview.id

    response = client.get(f"/api/interview/{interview_id}", headers=_auth(owner_token))

    assert response.status_code == 403


def test_agent_read_tools_are_scoped_to_current_recruiter(app, make_user):
    owner_id, _ = make_user("agent-scope-owner@x.com", role="recruiter")
    other_id, _ = make_user("agent-scope-other@x.com", role="recruiter")
    _seed_owned_job_candidate(app, owner_id, name="自有候选人")
    _seed_owned_job_candidate(app, other_id, name="他人候选人")

    with app.app_context():
        from app.services.agent_service import _tool_list_candidates

        result = _tool_list_candidates(limit=20, _user_id=owner_id, _role="recruiter")

    names = {item["name_masked"] for item in result["candidates"]}
    assert names == {"自有候选人"}


def test_agent_team_bi_tool_rejects_recruiter_scope(app, make_user):
    recruiter_id, _ = make_user("agent-bi-recruiter@x.com", role="recruiter", name="招聘专员A")
    make_user("agent-bi-other@x.com", role="recruiter", name="招聘专员B")
    _seed_owned_job_candidate(app, recruiter_id, name="只属于专员A的候选人")

    with app.app_context():
        from app.services.agent_service import _tool_get_bi_overview

        result = _tool_get_bi_overview(days=30, _user_id=recruiter_id, _role="recruiter")

    assert result["error"] == "Forbidden"
    assert "团队 BI" in result["message"]


def test_agent_write_tool_rejects_cross_recruiter_pipeline_move(app, make_user):
    owner_id, _ = make_user("agent-write-owner@x.com", role="recruiter")
    other_id, _ = make_user("agent-write-other@x.com", role="recruiter")
    job_id, _ = _seed_owned_job_candidate(app, owner_id)
    _, other_candidate_id = _seed_owned_job_candidate(app, other_id)

    with app.app_context():
        from app.services.agent_service import execute_write_tool

        result = execute_write_tool(
            "move_pipeline",
            {
                "candidate_id": other_candidate_id,
                "job_id": job_id,
                "stage": "pending",
            },
            user_id=owner_id,
            role="recruiter",
        )

    assert result["ok"] is False
