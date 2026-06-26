def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_ai_architecture_dashboard_admin_only(client, make_user):
    _, rec_token = make_user("r@x.com", role="recruiter")
    r = client.get("/api/admin/ai-architecture", headers=_auth(rec_token))
    assert r.status_code == 403


def test_admin_ai_architecture_dashboard_describes_prompt_tools_and_permissions(client, make_user):
    _, admin_token = make_user("a@x.com", role="admin")

    r = client.get("/api/admin/ai-architecture", headers=_auth(admin_token))

    assert r.status_code == 200
    body = r.get_json()
    assert "你是「智聘·招聘管理系统」的 AI 助手" in body["system_prompt"]
    assert "查询工具" in body["system_prompt"]
    assert "写操作工具" in body["system_prompt"]
    assert {t["name"] for t in body["read_tools"]} >= {
        "list_candidates",
        "get_candidate",
        "count_summary",
    }
    assert {t["name"] for t in body["write_tools"]} >= {
        "create_job",
        "move_pipeline",
        "start_interview",
        "run_match",
    }
    assert body["permission_model"]["database_access"] is True
    assert body["permission_model"]["write_requires_confirmation"] is True
    assert body["permission_model"]["read_tools_available_to_authenticated_users"] is False
    assert "面试官" in body["permission_model"]["read_scope_note"]
