"""Audit log for sensitive actions (TT 26 Điều 61 spirit — records; not a legal archive)."""

from sqlalchemy.orm import Session

from app.models import AuditLog, User


def record(
    db: Session,
    actor: User | None,
    action: str,
    entity: str = "",
    entity_id: str | None = None,
    details: dict | None = None,
    *,
    commit: bool = False,
) -> AuditLog:
    entry = AuditLog(
        actor_id=actor.id if actor else None,
        action=action,
        entity=entity,
        entity_id=entity_id,
        details=details or {},
    )
    db.add(entry)
    if commit:
        db.commit()
    return entry
