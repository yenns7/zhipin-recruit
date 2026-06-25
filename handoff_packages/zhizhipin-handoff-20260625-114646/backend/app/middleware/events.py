from flask import g, has_request_context, request
from .. import db
from ..models import Event


SENSITIVE_KEYS = ("password", "token", "authorization", "secret", "api_key")


def _client_ip():
    if not has_request_context():
        return None
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()[:80]
    return (request.remote_addr or "")[:80] or None


def _sanitize_payload(payload):
    if not isinstance(payload, dict):
        return {}
    cleaned = {}
    for key, value in payload.items():
        key_text = str(key)
        if any(marker in key_text.lower() for marker in SENSITIVE_KEYS):
            cleaned[key_text] = "[已脱敏]"
        elif isinstance(value, str):
            cleaned[key_text] = value[:1000]
        elif isinstance(value, dict):
            cleaned[key_text] = _sanitize_payload(value)
        else:
            cleaned[key_text] = value
    return cleaned


def record_event(
    action: str,
    entity_id: int = None,
    entity_type: str = None,
    payload: dict = None,
    result: str = "success",
    failure_reason: str = None,
    source: str = None,
    severity: str = "info",
):
    """写操作和试点审计事件埋点到 events 表。"""
    actor_id = getattr(g, "user_id", None)
    ev = Event(
        org_id=getattr(g, "org_id", 1) or 1,
        actor_id=actor_id,
        actor_role=getattr(g, "role", None),
        action=action,
        entity_id=entity_id,
        entity_type=entity_type,
        payload=_sanitize_payload(payload or {}),
        request_id=getattr(g, "request_id", None),
        ip=_client_ip(),
        user_agent=(request.headers.get("User-Agent", "")[:1000] if has_request_context() else None),
        result=result or "success",
        failure_reason=(failure_reason or "")[:240] if failure_reason else None,
        source=source or getattr(g, "audit_source", "ui"),
        severity=severity or "info",
    )
    db.session.add(ev)
    db.session.commit()
    return ev
