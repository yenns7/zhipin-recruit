from datetime import UTC, datetime, timedelta

from app import db
from app import models


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_notifications_are_user_scoped_and_require_auth(app, client, make_user):
    assert hasattr(models, "Notification"), "Notification model should exist"
    Notification = models.Notification

    user_id, user_token = make_user("notify-user@example.com", role="recruiter")
    other_id, _ = make_user("notify-other@example.com", role="manager")

    with app.app_context():
        db.session.add_all([
            Notification(
                user_id=user_id,
                type="stage_change",
                title="候选人进入一面",
                body="张三已进入一面",
                link="/pipeline",
                is_read=False,
                created_at=datetime.now(UTC).replace(tzinfo=None),
            ),
            Notification(
                user_id=user_id,
                type="feedback_added",
                title="面试反馈已提交",
                is_read=True,
                created_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=5),
            ),
            Notification(
                user_id=other_id,
                type="candidate_uploaded",
                title="别人账号的通知",
                is_read=False,
                created_at=datetime.now(UTC).replace(tzinfo=None),
            ),
        ])
        db.session.commit()

    missing_auth = client.get("/api/notifications")
    assert missing_auth.status_code == 401

    response = client.get("/api/notifications", headers=_auth(user_token))
    assert response.status_code == 200
    body = response.get_json()
    assert body["total"] == 2
    assert body["unread_count"] == 1
    assert [item["title"] for item in body["notifications"]] == [
        "候选人进入一面",
        "面试反馈已提交",
    ]


def test_mark_notifications_read_only_updates_current_user(app, client, make_user):
    assert hasattr(models, "Notification"), "Notification model should exist"
    Notification = models.Notification

    user_id, user_token = make_user("notify-mark@example.com", role="recruiter")
    other_id, _ = make_user("notify-mark-other@example.com", role="manager")

    with app.app_context():
        own = Notification(user_id=user_id, type="stage_change", title="自己的通知")
        other = Notification(user_id=other_id, type="stage_change", title="别人的通知")
        db.session.add_all([own, other])
        db.session.commit()
        own_id = own.id
        other_id_value = other.id

    response = client.post(
        "/api/notifications/mark-read",
        headers=_auth(user_token),
        json={"ids": [own_id, other_id_value]},
    )
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"

    with app.app_context():
        assert db.session.get(Notification, own_id).is_read is True
        assert db.session.get(Notification, other_id_value).is_read is False

    count_response = client.get("/api/notifications/unread-count", headers=_auth(user_token))
    assert count_response.status_code == 200
    assert count_response.get_json()["unread_count"] == 0
