import bcrypt
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, g, current_app
import jwt
from ..middleware.auth import require_auth
from .. import db
from ..models import User

bp = Blueprint("auth", __name__)


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def _verify(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


@bp.post("/auth/register")
def register():
    data = request.get_json()
    if User.query.filter_by(email=data.get("email")).first():
        return jsonify({"error": "Email already registered"}), 409
    user = User(
        name=data.get("name", ""),
        email=data["email"],
        role="recruiter",  # 安全：注册一律为 recruiter，特权角色由 admin 分配
        password_hash=_hash(data["password"]),
    )
    db.session.add(user)
    db.session.commit()
    return jsonify({"id": user.id, "email": user.email, "role": user.role}), 201


@bp.post("/auth/login")
def login():
    data = request.get_json()
    user = User.query.filter_by(email=data.get("email")).first()
    if not user or not _verify(data.get("password", ""), user.password_hash):
        return jsonify({"error": "Invalid credentials"}), 401
    if not user.is_active:
        return jsonify({"error": "账号已停用，请联系管理员"}), 403
    exp = datetime.utcnow() + timedelta(hours=current_app.config["JWT_EXPIRY_HOURS"])
    token = jwt.encode(
        {"user_id": user.id, "role": user.role, "exp": exp},
        current_app.config["JWT_SECRET"], algorithm="HS256"
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
    if not _verify(old_pw, user.password_hash):
        return jsonify({"error": "旧密码不正确"}), 400
    user.password_hash = _hash(new_pw)
    db.session.commit()
    return jsonify({"status": "ok"})
