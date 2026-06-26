import functools
import jwt
from flask import request, jsonify, g, current_app
from .. import db


def require_auth(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        if not token:
            return jsonify({"error": "Missing token"}), 401
        try:
            payload = jwt.decode(token, current_app.config["JWT_SECRET"], algorithms=["HS256"])
            from ..models import User

            user_id = payload.get("user_id")
            if user_id is None:
                return jsonify({"error": "Invalid token"}), 401

            user = db.session.get(User, user_id)
            if not user:
                return jsonify({"error": "User not found"}), 401
            if not user.is_active:
                return jsonify({"error": "账号已停用，请联系管理员"}), 403
            try:
                token_version = int(payload.get("token_version", 0) or 0)
            except (TypeError, ValueError):
                return jsonify({"error": "Invalid token"}), 401
            if token_version != (user.token_version or 0):
                return jsonify({"error": "Token revoked"}), 401
            g.user_id = user.id
            g.role = user.role
            g.org_id = user.org_id or 1
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401
        return f(*args, **kwargs)
    return decorated


def require_role(*roles):
    def decorator(f):
        @functools.wraps(f)
        def decorated(*args, **kwargs):
            if not hasattr(g, "role") or g.role not in roles:
                return jsonify({"error": "Forbidden"}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator
