from flask import Blueprint, jsonify, request, g

from .. import db
from ..middleware.auth import require_auth
from ..models import Notification

bp = Blueprint("notifications", __name__)


def _positive_int_arg(name, default, max_value=None):
    value = request.args.get(name, default, type=int)
    value = max(1, value or default)
    if max_value is not None:
        value = min(value, max_value)
    return value


def _serialize(notification):
    return {
        "id": notification.id,
        "type": notification.type,
        "title": notification.title,
        "body": notification.body,
        "link": notification.link,
        "is_read": notification.is_read,
        "created_at": notification.created_at.isoformat() if notification.created_at else None,
    }


@bp.get("/notifications")
@require_auth
def list_notifications():
    page = _positive_int_arg("page", 1)
    per_page = _positive_int_arg("per_page", 20, max_value=50)

    query = (
        Notification.query
        .filter(Notification.user_id == g.user_id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
    )
    total = query.count()
    notifications = query.offset((page - 1) * per_page).limit(per_page).all()
    unread_count = Notification.query.filter(
        Notification.user_id == g.user_id,
        Notification.is_read.is_(False),
    ).count()

    return jsonify({
        "notifications": [_serialize(item) for item in notifications],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, (total + per_page - 1) // per_page),
        "unread_count": unread_count,
    })


@bp.get("/notifications/unread-count")
@require_auth
def unread_count():
    count = Notification.query.filter(
        Notification.user_id == g.user_id,
        Notification.is_read.is_(False),
    ).count()
    return jsonify({"unread_count": count})


@bp.post("/notifications/mark-read")
@require_auth
def mark_read():
    data = request.get_json(silent=True) or {}
    ids = data.get("ids")

    query = Notification.query.filter(
        Notification.user_id == g.user_id,
        Notification.is_read.is_(False),
    )
    if ids:
        query = query.filter(Notification.id.in_(ids))

    query.update({"is_read": True}, synchronize_session=False)
    db.session.commit()
    return jsonify({"status": "ok"})
