def test_register_ignores_role_forces_recruiter(client):
    r = client.post("/api/auth/register", json={
        "name": "Mallory", "email": "m@x.com", "password": "pw123456", "role": "admin"})
    assert r.status_code == 201
    assert r.get_json()["role"] == "recruiter"  # 自封 admin 被拒绝，落库为 recruiter

def test_deactivated_user_cannot_login(client, make_user):
    make_user("dead@x.com", role="recruiter", password="pw123456", is_active=False)
    r = client.post("/api/auth/login", json={"email": "dead@x.com", "password": "pw123456"})
    assert r.status_code == 403
    assert "停用" in r.get_json()["error"]

def test_active_user_can_login(client, make_user):
    make_user("ok@x.com", role="manager", password="pw123456")
    r = client.post("/api/auth/login", json={"email": "ok@x.com", "password": "pw123456"})
    assert r.status_code == 200
    assert r.get_json()["role"] == "manager"

def test_register_empty_body_returns_400(client):
    r = client.post("/api/auth/register", json={})
    assert r.status_code == 400


def test_deactivated_user_token_is_rejected(client, make_user, app):
    user_id, token = make_user("token-dead@x.com", role="recruiter")

    with app.app_context():
        from app import db
        from app.models import User

        user = User.query.get(user_id)
        user.is_active = False
        db.session.commit()

    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 403


def test_role_change_takes_effect_without_waiting_for_token_expiry(client, make_user, app):
    user_id, token = make_user("token-role@x.com", role="admin")

    with app.app_context():
        from app import db
        from app.models import User

        user = User.query.get(user_id)
        user.role = "recruiter"
        db.session.commit()

    r = client.get("/api/admin/users", headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 403
