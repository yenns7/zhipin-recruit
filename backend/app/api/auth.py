import hashlib
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, g
import jwt
from ..config import Config
from ..middleware.auth import require_auth
from .. import db
from ..models import User

bp = Blueprint("auth", __name__)


def _hash(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()


@bp.post("/auth/register")
def register():
    data = request.get_json()
    if User.query.filter_by(email=data.get("email")).first():
        return jsonify({"error": "Email already registered"}), 409
    user = User(
        name=data.get("name", ""),
        email=data["email"],
        role=data.get("role", "recruiter"),
        password_hash=_hash(data["password"]),
    )
    db.session.add(user)
    db.session.commit()
    return jsonify({"id": user.id, "email": user.email, "role": user.role}), 201


@bp.post("/auth/login")
def login():
    data = request.get_json()
    user = User.query.filter_by(email=data.get("email")).first()
    if not user or user.password_hash != _hash(data.get("password", "")):
        return jsonify({"error": "Invalid credentials"}), 401
    exp = datetime.utcnow() + timedelta(hours=Config.JWT_EXPIRY_HOURS)
    token = jwt.encode(
        {"user_id": user.id, "role": user.role, "exp": exp},
        Config.JWT_SECRET, algorithm="HS256"
    )
    return jsonify({"token": token, "role": user.role, "name": user.name})


@bp.get("/auth/me")
@require_auth
def me():
    """当前登录用户信息（前端刷新角色/姓名，不必只依赖 JWT 解析）。"""
    user = User.query.get(g.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({
        "id": user.id, "name": user.name, "email": user.email, "role": user.role,
    })


@bp.post("/auth/change-password")
@require_auth
def change_password():
    """修改当前用户密码：校验旧密码后更新。"""
    data = request.get_json() or {}
    old_pw = data.get("old_password") or data.get("old") or ""
    new_pw = data.get("new_password") or data.get("new") or ""
    if not old_pw or not new_pw:
        return jsonify({"error": "需要提供旧密码和新密码"}), 400
    if len(new_pw) < 6:
        return jsonify({"error": "新密码至少 6 位"}), 400
    user = User.query.get(g.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    if user.password_hash != _hash(old_pw):
        return jsonify({"error": "旧密码不正确"}), 400
    user.password_hash = _hash(new_pw)
    db.session.commit()
    return jsonify({"status": "ok"})
