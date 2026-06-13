from flask import Blueprint, jsonify, g
from ..middleware.auth import require_auth
from ..models import Candidate

bp = Blueprint("candidates", __name__)


@bp.get("/candidates")
@require_auth
def list_candidates():
    if g.role == "recruiter":
        candidates = Candidate.query.filter_by(owner_hr_id=g.user_id).all()
    else:
        candidates = Candidate.query.all()
    return jsonify([{
        "id": c.id,
        "name_masked": c.name_masked,
        "owner_hr_id": c.owner_hr_id,
        "created_at": c.created_at.isoformat(),
        "tag_count": len(c.tags),
    } for c in candidates])
