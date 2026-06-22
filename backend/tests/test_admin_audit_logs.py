from datetime import UTC, datetime, timedelta

from app import db
from app.models import Event


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_audit_logs_admin_only(client, make_user):
    _, recruiter_token = make_user("recruiter-audit@example.com", role="recruiter")

    response = client.get("/api/admin/audit-logs", headers=_auth(recruiter_token))

    assert response.status_code == 403


def test_admin_lists_audit_events_with_actor_and_pagination(app, client, make_user):
    admin_id, admin_token = make_user("admin-audit@example.com", role="admin", name="Admin")
    manager_id, _ = make_user("manager-audit@example.com", role="manager", name="Manager")

    with app.app_context():
        db.session.add_all([
            Event(
                actor_id=admin_id,
                action="job.created",
                entity_type="job",
                entity_id=10,
                payload={"title": "增长产品经理"},
                ts=datetime.now(UTC).replace(tzinfo=None),
            ),
            Event(
                actor_id=manager_id,
                action="pipeline.moved",
                entity_type="candidate",
                entity_id=22,
                payload={"stage": "interview_first"},
                ts=datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=5),
            ),
        ])
        db.session.commit()

    response = client.get(
        "/api/admin/audit-logs?page=1&per_page=1",
        headers=_auth(admin_token),
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["total"] == 2
    assert body["page"] == 1
    assert body["per_page"] == 1
    assert body["pages"] == 2
    assert len(body["logs"]) == 1
    assert body["logs"][0]["action"] == "job.created"
    assert body["logs"][0]["actor_name"] == "Admin"
    assert body["logs"][0]["source"] == "event"
    assert body["logs"][0]["payload"] == {"title": "增长产品经理"}

    filtered = client.get(
        "/api/admin/audit-logs?action=pipeline.moved&entity_type=candidate",
        headers=_auth(admin_token),
    )

    assert filtered.status_code == 200
    filtered_body = filtered.get_json()
    assert filtered_body["total"] == 1
    assert filtered_body["logs"][0]["actor_name"] == "Manager"
