import hashlib
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
import jwt
from ..config import Config
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
