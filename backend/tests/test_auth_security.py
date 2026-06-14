def test_register_ignores_role_forces_recruiter(client):
    r = client.post("/api/auth/register", json={
        "name": "Mallory", "email": "m@x.com", "password": "pw123456", "role": "admin"})
    assert r.status_code == 201
    assert r.get_json()["role"] == "recruiter"  # 自封 admin 被拒绝，落库为 recruiter

def test_deactivated_user_cannot_login(client, make_user, app):
    make_user("dead@x.com", role="recruiter", password="pw123456", is_active=False)
    r = client.post("/api/auth/login", json={"email": "dead@x.com", "password": "pw123456"})
    assert r.status_code == 403

def test_active_user_can_login(client, make_user):
    make_user("ok@x.com", role="manager", password="pw123456")
    r = client.post("/api/auth/login", json={"email": "ok@x.com", "password": "pw123456"})
    assert r.status_code == 200
    assert r.get_json()["role"] == "manager"
