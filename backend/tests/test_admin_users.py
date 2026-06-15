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
