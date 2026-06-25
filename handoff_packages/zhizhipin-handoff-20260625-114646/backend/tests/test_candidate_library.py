def _auth(t): return {"Authorization": f"Bearer {t}"}


def test_candidate_library_list_includes_resume_summary_and_top_tags(client, make_user, app):
    uid, token = make_user("hr@x.com", role="recruiter")
    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateTag

        candidate = Candidate(
            owner_hr_id=uid,
            name_masked="候选人A",
            email_masked="a@example.com",
            phone_masked="13800000000",
            resume_json={
                "extracted_info": {
                    "education": [
                        {"school": "复旦大学", "degree": "本科", "major": "计算机科学"}
                    ],
                    "experience": [
                        {"company": "某AI公司", "position": "NLP算法工程师", "duration": "2022-至今"}
                    ],
                }
            },
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add_all([
            CandidateTag(candidate_id=candidate.id, tag="Python", score=5),
            CandidateTag(candidate_id=candidate.id, tag="NLP", score=4),
            CandidateTag(candidate_id=candidate.id, tag="SQL", score=3),
        ])
        db.session.commit()

    response = client.get("/api/candidates", headers=_auth(token))

    assert response.status_code == 200
    body = response.get_json()
    assert body[0]["email_masked"] == "a@example.com"
    assert body[0]["phone_masked"] == "13800000000"
    assert body[0]["max_score"] == 5
    assert body[0]["top_tags"][0] == {"tag": "Python", "score": 5}
    assert body[0]["latest_experience"] == {
        "company": "某AI公司",
        "position": "NLP算法工程师",
        "duration": "2022-至今",
    }
    assert body[0]["education_summary"] == "复旦大学 · 本科 · 计算机科学"
