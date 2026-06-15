from flask import Blueprint, request, jsonify, g
from ..middleware.auth import require_auth, require_role
from ..middleware.events import record_event
from .. import db
from ..models import User

bp = Blueprint("admin", __name__)
VALID_ROLES = {"recruiter", "interviewer", "manager", "admin"}


@bp.get("/admin/users")
@require_auth
@require_role("admin")
def list_users():
    users = User.query.order_by(User.id.asc()).all()
    return jsonify([{
        "id": u.id, "name": u.name, "email": u.email, "role": u.role,
        "is_active": u.is_active,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    } for u in users])


@bp.patch("/admin/users/<int:user_id>")
@require_auth
@require_role("admin")
def update_user(user_id):
    data = request.get_json() or {}
    user = User.query.get(user_id)
    if user is None:
        return jsonify({"error": "用户不存在"}), 404
    if user_id == g.user_id:
        if data.get("is_active") is False or ("role" in data and data["role"] != "admin"):
            return jsonify({"error": "不能停用或降级自己的账号"}), 400
    if "role" in data:
        if data["role"] not in VALID_ROLES:
            return jsonify({"error": f"无效角色。可选：{sorted(VALID_ROLES)}"}), 400
        user.role = data["role"]
        record_event("user.role_changed", entity_id=user_id, entity_type="user",
                     payload={"role": data["role"]})
    if "is_active" in data:
        if not isinstance(data["is_active"], bool):
            return jsonify({"error": "is_active 必须是布尔值"}), 400
        user.is_active = data["is_active"]
        record_event("user.active_changed", entity_id=user_id, entity_type="user",
                     payload={"is_active": user.is_active})
    db.session.commit()
    return jsonify({"id": user.id, "name": user.name, "email": user.email,
                    "role": user.role, "is_active": user.is_active})
