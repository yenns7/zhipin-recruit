from app import db
from app.models import Job


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_talent_map_can_save_companies_people_and_filter_by_company(client, make_user, app):
    hr_id, token = make_user("talent-map-hr@example.com", role="recruiter", name="地图HR")

    with app.app_context():
        job = Job(
            title="省总经理",
            city="广东",
            department="销售中心",
            jd_text="负责省区销售团队管理",
            owner_hr_id=hr_id,
        )
        db.session.add(job)
        db.session.commit()
        job_id = job.id

    created = client.post(
        "/api/talent-maps",
        headers=_auth(token),
        json={
            "name": "省总人才地图",
            "job_id": job_id,
            "department": "销售中心",
            "board_json": {"columns": ["目标公司", "潜在人选", "重点关注"]},
        },
    )
    assert created.status_code == 201
    talent_map = created.get_json()
    assert talent_map["name"] == "省总人才地图"
    assert talent_map["job_id"] == job_id
    assert talent_map["job_title"] == "省总经理"
    assert talent_map["board_json"]["columns"] == ["目标公司", "潜在人选", "重点关注"]

    company = client.post(
        f"/api/talent-maps/{talent_map['id']}/companies",
        headers=_auth(token),
        json={
            "company_name": "竞品科技",
            "city": "深圳",
            "region": "华南",
            "industry": "企业服务",
            "priority": "high",
            "note": "销售团队规模大",
        },
    )
    assert company.status_code == 201
    company_body = company.get_json()
    assert company_body["company_name"] == "竞品科技"

    other_company = client.post(
        f"/api/talent-maps/{talent_map['id']}/companies",
        headers=_auth(token),
        json={"company_name": "标杆集团", "city": "广州", "priority": "medium"},
    )
    assert other_company.status_code == 201

    person = client.post(
        f"/api/talent-maps/{talent_map['id']}/people",
        headers=_auth(token),
        json={
            "company_id": company_body["id"],
            "name": "张三",
            "title": "省区负责人",
            "city": "深圳",
            "tags": ["大客户销售", "团队管理"],
            "salary_range": "40-60万",
            "contact_status": "重点关注",
            "evaluation": "高匹配",
            "source": "业务推荐",
            "next_follow_at": "2026-07-01",
            "note": "优先接触",
        },
    )
    assert person.status_code == 201
    person_body = person.get_json()
    assert person_body["company_name"] == "竞品科技"
    assert person_body["tags"] == ["大客户销售", "团队管理"]

    client.post(
        f"/api/talent-maps/{talent_map['id']}/people",
        headers=_auth(token),
        json={
            "company_id": other_company.get_json()["id"],
            "name": "李四",
            "title": "区域经理",
            "city": "广州",
            "contact_status": "未接触",
        },
    )

    updated = client.patch(
        f"/api/talent-maps/{talent_map['id']}",
        headers=_auth(token),
        json={
            "board_json": {
                "columns": ["目标公司", "潜在人选", "重点关注", "已接触"],
                "cards": [{"type": "person", "id": person_body["id"], "column": "重点关注"}],
            }
        },
    )
    assert updated.status_code == 200
    assert updated.get_json()["board_json"]["cards"][0]["column"] == "重点关注"

    filtered = client.get(
        f"/api/talent-maps/{talent_map['id']}?company=竞品科技",
        headers=_auth(token),
    )
    assert filtered.status_code == 200
    filtered_body = filtered.get_json()
    assert filtered_body["people_count"] == 1
    assert [item["name"] for item in filtered_body["people"]] == ["张三"]
    assert filtered_body["people"][0]["company_name"] == "竞品科技"


def test_talent_maps_are_scoped_to_owner_unless_manager_or_admin(client, make_user, app):
    owner_id, owner_token = make_user("talent-owner@example.com", role="recruiter", name="地图负责人")
    _, other_token = make_user("talent-other@example.com", role="recruiter", name="其他HR")
    _, manager_token = make_user("talent-manager@example.com", role="manager", name="招聘经理")

    with app.app_context():
        job = Job(title="销售总监", jd_text="x", owner_hr_id=owner_id)
        db.session.add(job)
        db.session.commit()
        job_id = job.id

    created = client.post(
        "/api/talent-maps",
        headers=_auth(owner_token),
        json={"name": "销售总监人才地图", "job_id": job_id},
    )
    assert created.status_code == 201
    talent_map_id = created.get_json()["id"]

    forbidden = client.get(f"/api/talent-maps/{talent_map_id}", headers=_auth(other_token))
    assert forbidden.status_code == 403

    forbidden_company = client.post(
        f"/api/talent-maps/{talent_map_id}/companies",
        headers=_auth(other_token),
        json={"company_name": "不可写公司"},
    )
    assert forbidden_company.status_code == 403

    manager_detail = client.get(f"/api/talent-maps/{talent_map_id}", headers=_auth(manager_token))
    assert manager_detail.status_code == 200
    assert manager_detail.get_json()["name"] == "销售总监人才地图"
