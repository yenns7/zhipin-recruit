from datetime import date, datetime

from flask import Blueprint, g, jsonify, request

from .. import db
from ..middleware.auth import require_auth, require_role
from ..middleware.events import record_event
from ..models import Job, TalentMap, TalentMapCompany, TalentMapPerson
from .access import can_manage_job

bp = Blueprint("talent_maps", __name__)


def _clean(value, limit):
    return str(value or "").strip()[:limit]


def _parse_date(value):
    if not value:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _clean_tags(value):
    if isinstance(value, list):
        return [_clean(item, 40) for item in value if _clean(item, 40)][:12]
    if isinstance(value, str):
        return [_clean(item, 40) for item in value.split(",") if _clean(item, 40)][:12]
    return []


def _can_manage_map(talent_map):
    if g.role in ("manager", "admin"):
        return True
    return talent_map.owner_hr_id == g.user_id


def _map_query_for_current_user():
    query = TalentMap.query
    if g.role == "recruiter":
        query = query.filter(TalentMap.owner_hr_id == g.user_id)
    return query


def _map_payload(talent_map, people=None):
    people_items = people if people is not None else talent_map.people
    return {
        "id": talent_map.id,
        "name": talent_map.name,
        "job_id": talent_map.job_id,
        "job_title": talent_map.job.title if talent_map.job else "",
        "department": talent_map.department or "",
        "owner_hr_id": talent_map.owner_hr_id,
        "board_json": talent_map.board_json or {},
        "companies_count": len(talent_map.companies),
        "people_count": len(people_items),
        "companies": [_company_payload(item) for item in talent_map.companies],
        "people": [_person_payload(item) for item in people_items],
        "created_at": talent_map.created_at.isoformat() if talent_map.created_at else None,
        "updated_at": talent_map.updated_at.isoformat() if talent_map.updated_at else None,
    }


def _map_summary_payload(talent_map):
    return {
        "id": talent_map.id,
        "name": talent_map.name,
        "job_id": talent_map.job_id,
        "job_title": talent_map.job.title if talent_map.job else "",
        "department": talent_map.department or "",
        "owner_hr_id": talent_map.owner_hr_id,
        "companies_count": len(talent_map.companies),
        "people_count": len(talent_map.people),
        "updated_at": talent_map.updated_at.isoformat() if talent_map.updated_at else None,
    }


def _company_payload(company):
    return {
        "id": company.id,
        "map_id": company.map_id,
        "company_name": company.company_name,
        "city": company.city or "",
        "region": company.region or "",
        "industry": company.industry or "",
        "priority": company.priority or "medium",
        "note": company.note or "",
        "created_at": company.created_at.isoformat() if company.created_at else None,
        "updated_at": company.updated_at.isoformat() if company.updated_at else None,
    }


def _person_payload(person):
    return {
        "id": person.id,
        "map_id": person.map_id,
        "company_id": person.company_id,
        "company_name": person.company.company_name if person.company else "",
        "name": person.name,
        "title": person.title or "",
        "city": person.city or "",
        "tags": person.tags or [],
        "salary_range": person.salary_range or "",
        "contact_status": person.contact_status or "未接触",
        "evaluation": person.evaluation or "",
        "source": person.source or "",
        "next_follow_at": person.next_follow_at.isoformat() if person.next_follow_at else None,
        "note": person.note or "",
        "created_at": person.created_at.isoformat() if person.created_at else None,
        "updated_at": person.updated_at.isoformat() if person.updated_at else None,
    }


def _apply_map_fields(talent_map, data):
    if "name" in data:
        talent_map.name = _clean(data.get("name"), 200) or talent_map.name
    if "department" in data:
        talent_map.department = _clean(data.get("department"), 120)
    if "board_json" in data:
        talent_map.board_json = data.get("board_json") if isinstance(data.get("board_json"), dict) else {}
    if "job_id" in data:
        job_id = data.get("job_id")
        if job_id in ("", None):
            talent_map.job_id = None
        else:
            job = Job.query.get(job_id)
            if job is None:
                return "岗位不存在"
            if not can_manage_job(g.user_id, g.role, job):
                return "无权关联该岗位"
            talent_map.job_id = job.id
    return None


def _apply_company_fields(company, data):
    if "company_name" in data:
        company.company_name = _clean(data.get("company_name"), 200) or company.company_name
    if "city" in data:
        company.city = _clean(data.get("city"), 80)
    if "region" in data:
        company.region = _clean(data.get("region"), 80)
    if "industry" in data:
        company.industry = _clean(data.get("industry"), 120)
    if "priority" in data:
        company.priority = _clean(data.get("priority"), 40) or "medium"
    if "note" in data:
        company.note = _clean(data.get("note"), 2000)


def _apply_person_fields(person, data):
    if "company_id" in data:
        company_id = data.get("company_id")
        if company_id in ("", None):
            person.company_id = None
        else:
            company = TalentMapCompany.query.filter_by(id=company_id, map_id=person.map_id).first()
            if company is None:
                return "目标公司不存在"
            person.company_id = company.id
    if "name" in data:
        person.name = _clean(data.get("name"), 120) or person.name
    if "title" in data:
        person.title = _clean(data.get("title"), 160)
    if "city" in data:
        person.city = _clean(data.get("city"), 80)
    if "tags" in data:
        person.tags = _clean_tags(data.get("tags"))
    if "salary_range" in data:
        person.salary_range = _clean(data.get("salary_range"), 120)
    if "contact_status" in data:
        person.contact_status = _clean(data.get("contact_status"), 80) or "未接触"
    if "evaluation" in data:
        person.evaluation = _clean(data.get("evaluation"), 120)
    if "source" in data:
        person.source = _clean(data.get("source"), 160)
    if "next_follow_at" in data:
        person.next_follow_at = _parse_date(data.get("next_follow_at"))
    if "note" in data:
        person.note = _clean(data.get("note"), 2000)
    return None


def _filtered_people_query(talent_map):
    query = TalentMapPerson.query.filter_by(map_id=talent_map.id).outerjoin(TalentMapCompany)
    company = _clean(request.args.get("company"), 200)
    city = _clean(request.args.get("city"), 80)
    status = _clean(request.args.get("status"), 80)
    keyword = _clean(request.args.get("keyword"), 120)
    if company:
        query = query.filter(TalentMapCompany.company_name.ilike(f"%{company}%"))
    if city:
        query = query.filter(TalentMapPerson.city.ilike(f"%{city}%"))
    if status:
        query = query.filter(TalentMapPerson.contact_status == status)
    if keyword:
        query = query.filter(
            db.or_(
                TalentMapPerson.name.ilike(f"%{keyword}%"),
                TalentMapPerson.title.ilike(f"%{keyword}%"),
                TalentMapPerson.evaluation.ilike(f"%{keyword}%"),
            )
        )
    return query.order_by(TalentMapPerson.updated_at.desc(), TalentMapPerson.id.desc())


@bp.get("/talent-maps")
@require_auth
@require_role("recruiter", "manager", "admin")
def list_talent_maps():
    maps = _map_query_for_current_user().order_by(TalentMap.updated_at.desc(), TalentMap.id.desc()).all()
    return jsonify([_map_summary_payload(item) for item in maps])


@bp.post("/talent-maps")
@require_auth
@require_role("recruiter", "manager", "admin")
def create_talent_map():
    data = request.get_json() or {}
    name = _clean(data.get("name"), 200)
    if not name:
        return jsonify({"error": "name required"}), 400
    talent_map = TalentMap(name=name, owner_hr_id=g.user_id, board_json={})
    error = _apply_map_fields(talent_map, data)
    if error:
        return jsonify({"error": error}), 403 if "无权" in error else 404
    db.session.add(talent_map)
    db.session.commit()
    record_event("talent_map.created", entity_id=talent_map.id, entity_type="talent_map")
    return jsonify(_map_payload(talent_map)), 201


@bp.get("/talent-maps/<int:map_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def get_talent_map(map_id):
    talent_map = TalentMap.query.get_or_404(map_id)
    if not _can_manage_map(talent_map):
        return jsonify({"error": "Forbidden"}), 403
    people = _filtered_people_query(talent_map).all()
    return jsonify(_map_payload(talent_map, people=people))


@bp.patch("/talent-maps/<int:map_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def update_talent_map(map_id):
    talent_map = TalentMap.query.get_or_404(map_id)
    if not _can_manage_map(talent_map):
        return jsonify({"error": "Forbidden"}), 403
    error = _apply_map_fields(talent_map, request.get_json() or {})
    if error:
        return jsonify({"error": error}), 403 if "无权" in error else 404
    db.session.commit()
    record_event("talent_map.updated", entity_id=talent_map.id, entity_type="talent_map")
    return jsonify(_map_payload(talent_map))


@bp.post("/talent-maps/<int:map_id>/companies")
@require_auth
@require_role("recruiter", "manager", "admin")
def create_talent_map_company(map_id):
    talent_map = TalentMap.query.get_or_404(map_id)
    if not _can_manage_map(talent_map):
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json() or {}
    company_name = _clean(data.get("company_name"), 200)
    if not company_name:
        return jsonify({"error": "company_name required"}), 400
    company = TalentMapCompany(map_id=talent_map.id, company_name=company_name)
    _apply_company_fields(company, data)
    db.session.add(company)
    db.session.commit()
    record_event("talent_map_company.created", entity_id=company.id, entity_type="talent_map_company")
    return jsonify(_company_payload(company)), 201


@bp.patch("/talent-map-companies/<int:company_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def update_talent_map_company(company_id):
    company = TalentMapCompany.query.get_or_404(company_id)
    if not _can_manage_map(company.talent_map):
        return jsonify({"error": "Forbidden"}), 403
    _apply_company_fields(company, request.get_json() or {})
    db.session.commit()
    record_event("talent_map_company.updated", entity_id=company.id, entity_type="talent_map_company")
    return jsonify(_company_payload(company))


@bp.post("/talent-maps/<int:map_id>/people")
@require_auth
@require_role("recruiter", "manager", "admin")
def create_talent_map_person(map_id):
    talent_map = TalentMap.query.get_or_404(map_id)
    if not _can_manage_map(talent_map):
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json() or {}
    name = _clean(data.get("name"), 120)
    if not name:
        return jsonify({"error": "name required"}), 400
    person = TalentMapPerson(map_id=talent_map.id, name=name, tags=[])
    error = _apply_person_fields(person, data)
    if error:
        return jsonify({"error": error}), 404
    db.session.add(person)
    db.session.commit()
    record_event("talent_map_person.created", entity_id=person.id, entity_type="talent_map_person")
    return jsonify(_person_payload(person)), 201


@bp.patch("/talent-map-people/<int:person_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def update_talent_map_person(person_id):
    person = TalentMapPerson.query.get_or_404(person_id)
    if not _can_manage_map(person.talent_map):
        return jsonify({"error": "Forbidden"}), 403
    error = _apply_person_fields(person, request.get_json() or {})
    if error:
        return jsonify({"error": error}), 404
    db.session.commit()
    record_event("talent_map_person.updated", entity_id=person.id, entity_type="talent_map_person")
    return jsonify(_person_payload(person))
