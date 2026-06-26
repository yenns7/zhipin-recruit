"""T5 测试：会话管理接口（新建/删除/重命名/归档/列表过滤分页）。"""
from app import db
from app.models import Conversation


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_create_conversation(app, client, make_user):
    """POST 新建空会话，返回 201 + id/title/archived。"""
    _, token = make_user("t5-create@example.com", role="recruiter")
    resp = client.post(
        "/api/agent/conversations", headers=_auth(token),
        json={"title": "我的新会话"},
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["id"]
    assert body["title"] == "我的新会话"
    assert body["archived"] is False
    assert body["title_source"] == "manual"


def test_create_conversation_default_title(app, client, make_user):
    """不传 title 时默认"新对话"。"""
    _, token = make_user("t5-default@example.com", role="recruiter")
    resp = client.post("/api/agent/conversations", headers=_auth(token), json={})
    assert resp.status_code == 201
    assert resp.get_json()["title"] == "新对话"


def test_rename_conversation(app, client, make_user):
    """PATCH 重命名，title_source 变 manual。"""
    _, token = make_user("t5-rename@example.com", role="recruiter")
    create = client.post("/api/agent/conversations", headers=_auth(token), json={}).get_json()
    cid = create["id"]

    resp = client.patch(
        f"/api/agent/conversations/{cid}", headers=_auth(token),
        json={"title": "改后的标题"},
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["title"] == "改后的标题"
    assert body["title_source"] == "manual"


def test_archive_and_unarchive_conversation(app, client, make_user):
    """PATCH 归档 / 取消归档。"""
    _, token = make_user("t5-archive@example.com", role="recruiter")
    cid = client.post("/api/agent/conversations", headers=_auth(token), json={}).get_json()["id"]

    # 归档
    resp = client.patch(f"/api/agent/conversations/{cid}", headers=_auth(token), json={"archived": True})
    assert resp.status_code == 200
    assert resp.get_json()["archived"] is True

    # 取消归档
    resp = client.patch(f"/api/agent/conversations/{cid}", headers=_auth(token), json={"archived": False})
    assert resp.get_json()["archived"] is False


def test_delete_conversation_soft_deletes(app, client, make_user):
    """DELETE 软删（archived=True），不是物理删除。"""
    _, token = make_user("t5-delete@example.com", role="recruiter")
    cid = client.post("/api/agent/conversations", headers=_auth(token), json={}).get_json()["id"]

    resp = client.delete(f"/api/agent/conversations/{cid}", headers=_auth(token))
    assert resp.status_code == 200
    assert resp.get_json()["archived"] is True

    with app.app_context():
        conv = db.session.get(Conversation, cid)
        assert conv is not None  # 物理还在
        assert conv.archived is True


def test_list_conversations_archived_filter(app, client, make_user):
    """列表默认只看未归档；archived=true 看归档的。"""
    _, token = make_user("t5-list@example.com", role="recruiter")

    # 建 3 个，归档 1 个
    c1 = client.post("/api/agent/conversations", headers=_auth(token), json={"title": "a"}).get_json()["id"]
    client.post("/api/agent/conversations", headers=_auth(token), json={"title": "b"})
    c3 = client.post("/api/agent/conversations", headers=_auth(token), json={"title": "c"}).get_json()["id"]
    client.patch(f"/api/agent/conversations/{c3}", headers=_auth(token), json={"archived": True})

    # 默认（未归档）
    resp = client.get("/api/agent/conversations", headers=_auth(token))
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["total"] == 2
    titles = [i["title"] for i in body["items"]]
    assert "a" in titles and "b" in titles and "c" not in titles

    # archived=true
    resp = client.get("/api/agent/conversations?archived=true", headers=_auth(token))
    assert resp.get_json()["total"] == 1
    assert resp.get_json()["items"][0]["id"] == c3


def test_list_conversations_pagination(app, client, make_user):
    """分页：per_page 限制 + page 翻页。"""
    _, token = make_user("t5-page@example.com", role="recruiter")
    for i in range(5):
        client.post("/api/agent/conversations", headers=_auth(token), json={"title": f"p{i}"})

    resp = client.get("/api/agent/conversations?per_page=2&page=1", headers=_auth(token))
    body = resp.get_json()
    assert body["total"] == 5
    assert body["per_page"] == 2
    assert len(body["items"]) == 2

    resp2 = client.get("/api/agent/conversations?per_page=2&page=2", headers=_auth(token))
    assert len(resp2.get_json()["items"]) == 2


def test_conversation_management_is_user_scoped(app, client, make_user):
    """跨用户访问会话返回 403。"""
    _, owner_token = make_user("t5-owner@example.com", role="recruiter")
    _, other_token = make_user("t5-other@example.com", role="recruiter")

    cid = client.post("/api/agent/conversations", headers=_auth(owner_token), json={}).get_json()["id"]

    assert client.patch(f"/api/agent/conversations/{cid}", headers=_auth(other_token),
                        json={"title": "hack"}).status_code == 403
    assert client.delete(f"/api/agent/conversations/{cid}", headers=_auth(other_token)).status_code == 403
    assert client.get(f"/api/agent/conversations/{cid}", headers=_auth(other_token)).status_code == 403
