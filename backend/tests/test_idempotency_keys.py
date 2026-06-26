def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_json_write_replay_with_same_idempotency_key_returns_first_result(client, make_user, app):
    _, admin_token = make_user("idem-admin@example.com", role="admin")
    headers = {
        **_auth(admin_token),
        "Idempotency-Key": "create-user:idem-replay",
    }
    payload = {
        "name": "幂等用户",
        "email": "idem-user@example.com",
        "password": "pw123456",
        "role": "recruiter",
    }

    first = client.post("/api/admin/users", headers=headers, json=payload)
    second = client.post("/api/admin/users", headers=headers, json=payload)

    assert first.status_code == 201
    assert second.status_code == 201
    assert second.headers["X-Idempotent-Replay"] == "true"
    assert second.get_json()["id"] == first.get_json()["id"]
    with app.app_context():
        from app.models import User

        assert User.query.filter_by(email="idem-user@example.com").count() == 1


def test_same_idempotency_key_with_different_body_is_rejected(client, make_user, app):
    _, admin_token = make_user("idem-admin-conflict@example.com", role="admin")
    headers = {
        **_auth(admin_token),
        "Idempotency-Key": "create-user:idem-conflict",
    }
    first_payload = {
        "name": "第一位",
        "email": "idem-conflict-a@example.com",
        "password": "pw123456",
        "role": "recruiter",
    }
    second_payload = {
        "name": "第二位",
        "email": "idem-conflict-b@example.com",
        "password": "pw123456",
        "role": "recruiter",
    }

    first = client.post("/api/admin/users", headers=headers, json=first_payload)
    second = client.post("/api/admin/users", headers=headers, json=second_payload)

    assert first.status_code == 201
    assert second.status_code == 409
    assert "Idempotency-Key" in second.get_json()["error"]
    with app.app_context():
        from app.models import User

        assert User.query.filter_by(email="idem-conflict-a@example.com").count() == 1
        assert User.query.filter_by(email="idem-conflict-b@example.com").count() == 0
