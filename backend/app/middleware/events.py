from flask import g
from .. import db
from ..models import Event


def record_event(action: str, entity_id: int = None, entity_type: str = None, payload: dict = None):
    """写操作埋点到 events 表，供 BI 聚合"""
    actor_id = getattr(g, "user_id", None)
    ev = Event(
        actor_id=actor_id,
        action=action,
        entity_id=entity_id,
        entity_type=entity_type,
        payload=payload or {}
    )
    db.session.add(ev)
    db.session.commit()
