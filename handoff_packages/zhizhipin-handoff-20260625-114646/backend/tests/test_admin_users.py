def _auth(token):
    return {"Authorization": f"Bearer {token}"}

def test_list_users_admin_only(client, make_user):
    _, rec_token = make_user("r@x.com", role="recruiter")
    r = client.get("/api/admin/users", headers=_auth(rec_token))
    assert r.status_code == 403  # 非 admin 禁止

def test_admin_lists_and_updates_role(client, make_user):
    _, admin_token = make_user("a@x.com", role="admin")
    target_id, _ = make_user("r@x.com", role="recruiter")
    r = client.get("/api/admin/users", headers=_auth(admin_token))
    assert r.status_code == 200
    assert "r@x.com" in [u["email"] for u in r.get_json()]
    r = client.patch(f"/api/admin/users/{target_id}", headers=_auth(admin_token),
                     json={"role": "manager"})
    assert r.status_code == 200
    assert r.get_json()["role"] == "manager"

def test_admin_creates_user_and_new_user_can_login(client, make_user):
    _, admin_token = make_user("a@x.com", role="admin")
    r = client.post("/api/admin/users", headers=_auth(admin_token), json={
        "name": "业务面试官",
        "email": "interviewer-new@x.com",
        "password": "pw123456",
        "role": "interviewer",
    })
    assert r.status_code == 201
    body = r.get_json()
    assert body["email"] == "interviewer-new@x.com"
    assert body["role"] == "interviewer"
    assert body["is_active"] is True

    login = client.post("/api/auth/login", json={
        "email": "interviewer-new@x.com",
        "password": "pw123456",
    })
    assert login.status_code == 200


def test_admin_resets_user_password(client, make_user):
    _, admin_token = make_user("a@x.com", role="admin")
    target_id, _ = make_user("reset@x.com", role="recruiter", password="oldpw123")

    r = client.post(
        f"/api/admin/users/{target_id}/reset-password",
        headers=_auth(admin_token),
        json={"password": "newpw123"},
    )
    assert r.status_code == 200
    assert r.get_json()["status"] == "ok"

    old_login = client.post("/api/auth/login", json={
        "email": "reset@x.com",
        "password": "oldpw123",
    })
    assert old_login.status_code == 401

    new_login = client.post("/api/auth/login", json={
        "email": "reset@x.com",
        "password": "newpw123",
    })
    assert new_login.status_code == 200


def test_admin_reset_password_revokes_existing_token(client, make_user):
    _, admin_token = make_user("a@x.com", role="admin")
    target_id, target_token = make_user("reset-token@x.com", role="recruiter", password="oldpw123")

    before = client.get("/api/auth/me", headers=_auth(target_token))
    assert before.status_code == 200

    r = client.post(
        f"/api/admin/users/{target_id}/reset-password",
        headers=_auth(admin_token),
        json={"password": "newpw123"},
    )
    assert r.status_code == 200

    after = client.get("/api/auth/me", headers=_auth(target_token))
    assert after.status_code == 401

    new_login = client.post("/api/auth/login", json={
        "email": "reset-token@x.com",
        "password": "newpw123",
    })
    assert new_login.status_code == 200

def test_admin_deactivates_user(client, make_user):
    _, admin_token = make_user("a@x.com", role="admin")
    target_id, _ = make_user("r@x.com", role="recruiter")
    r = client.patch(f"/api/admin/users/{target_id}", headers=_auth(admin_token),
                     json={"is_active": False})
    assert r.status_code == 200
    assert r.get_json()["is_active"] is False

def test_invalid_role_rejected(client, make_user):
    _, admin_token = make_user("a@x.com", role="admin")
    target_id, _ = make_user("r@x.com", role="recruiter")
    r = client.patch(f"/api/admin/users/{target_id}", headers=_auth(admin_token),
                     json={"role": "superuser"})
    assert r.status_code == 400

def test_patch_user_not_found(client, make_user):
    _, admin_token = make_user("a@x.com", role="admin")
    r = client.patch("/api/admin/users/99999", headers=_auth(admin_token),
                     json={"role": "manager"})
    assert r.status_code == 404

def test_patch_forbidden_for_non_admin(client, make_user):
    _, rec_token = make_user("r@x.com", role="recruiter")
    target_id, _ = make_user("t@x.com", role="recruiter")
    r = client.patch(f"/api/admin/users/{target_id}", headers=_auth(rec_token),
                     json={"role": "manager"})
    assert r.status_code == 403

def test_admin_cannot_self_deactivate(client, make_user):
    admin_id, admin_token = make_user("a@x.com", role="admin")
    r = client.patch(f"/api/admin/users/{admin_id}", headers=_auth(admin_token),
                     json={"is_active": False})
    assert r.status_code == 400
