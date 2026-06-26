from datetime import datetime, timezone
import math
import bcrypt

from flask import Blueprint, request, jsonify, g
from ..middleware.auth import require_auth, require_role
from ..middleware.events import record_event
from .. import db
from ..models import Event, User
from ..services.agent_service import get_agent_architecture_dashboard

bp = Blueprint("admin", __name__)
VALID_ROLES = {"recruiter", "interviewer", "manager", "admin"}


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _clean_text(value, limit):
    return str(value or "").strip()[:limit]


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


@bp.post("/admin/users")
@require_auth
@require_role("admin")
def create_user():
    data = request.get_json(silent=True) or {}
    email = _clean_text(data.get("email"), 100).lower()
    name = _clean_text(data.get("name"), 100)
    password = str(data.get("password") or "")
    role = _clean_text(data.get("role") or "recruiter", 20)

    if not email or "@" not in email:
        return jsonify({"error": "需要提供有效邮箱"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "邮箱已存在"}), 409
    if len(password) < 6:
        return jsonify({"error": "密码至少 6 位"}), 400
    if role not in VALID_ROLES:
        return jsonify({"error": f"无效角色。可选：{sorted(VALID_ROLES)}"}), 400

    user = User(
        name=name or email.split("@")[0],
        email=email,
        role=role,
        password_hash=_hash_password(password),
        is_active=True,
    )
    db.session.add(user)
    db.session.commit()
    record_event("user.created", entity_id=user.id, entity_type="user",
                 payload={"role": user.role})
    return jsonify({
        "id": user.id, "name": user.name, "email": user.email, "role": user.role,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }), 201


@bp.get("/admin/ai-architecture")
@require_auth
@require_role("admin")
def ai_architecture():
    return jsonify(get_agent_architecture_dashboard())


def _positive_int_arg(name, default, max_value=None):
    value = request.args.get(name, default, type=int)
    value = max(1, value or default)
    if max_value is not None:
        value = min(value, max_value)
    return value


def _parse_datetime_arg(name):
    raw = request.args.get(name, "").strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


@bp.get("/admin/audit-logs")
@require_auth
@require_role("admin")
def audit_logs():
    actor_id = request.args.get("actor_id", type=int)
    action = request.args.get("action", "").strip()
    entity_type = request.args.get("entity_type", "").strip()
    page = _positive_int_arg("page", 1)
    per_page = _positive_int_arg("per_page", 50, max_value=200)
    from_dt = _parse_datetime_arg("from")
    to_dt = _parse_datetime_arg("to")

    query = Event.query
    if actor_id is not None:
        query = query.filter(Event.actor_id == actor_id)
    if action:
        query = query.filter(Event.action == action)
    if entity_type:
        query = query.filter(Event.entity_type == entity_type)
    if from_dt:
        query = query.filter(Event.ts >= from_dt)
    if to_dt:
        query = query.filter(Event.ts <= to_dt)

    query = query.order_by(Event.ts.desc(), Event.id.desc())
    total = query.count()
    logs = query.offset((page - 1) * per_page).limit(per_page).all()

    actor_ids = {log.actor_id for log in logs if log.actor_id is not None}
    actor_names = {}
    if actor_ids:
        users = User.query.filter(User.id.in_(actor_ids)).all()
        actor_names = {user.id: user.name for user in users}

    return jsonify({
        "logs": [{
            "id": log.id,
            "source": "event",
            "actor_id": log.actor_id,
            "actor_name": actor_names.get(log.actor_id),
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "payload": log.payload or {},
            "ts": log.ts.isoformat() if log.ts else None,
        } for log in logs],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, math.ceil(total / per_page)),
    })


@bp.patch("/admin/users/<int:user_id>")
@require_auth
@require_role("admin")
def update_user(user_id):
    data = request.get_json() or {}
    user = db.session.get(User, user_id)
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


@bp.post("/admin/users/<int:user_id>/reset-password")
@require_auth
@require_role("admin")
def reset_user_password(user_id):
    data = request.get_json(silent=True) or {}
    password = str(data.get("password") or "")
    if len(password) < 6:
        return jsonify({"error": "密码至少 6 位"}), 400
    user = db.session.get(User, user_id)
    if user is None:
        return jsonify({"error": "用户不存在"}), 404
    user.password_hash = _hash_password(password)
    db.session.commit()
    record_event("user.password_reset", entity_id=user_id, entity_type="user")
    return jsonify({"status": "ok", "id": user.id})
