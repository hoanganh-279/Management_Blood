from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    Alert,
    AlertSeverity,
    AlertStatus,
    BloodRequest,
    BloodUnit,
    BloodUnitStatus,
    RequestStatus,
)
from app.services.matching import compute_coverage, compute_shortage, inventory_count


def refresh_alerts_for_requests(db: Session) -> list[Alert]:
    """Create/update shortage alerts from open/matching blood requests (prototype)."""
    created: list[Alert] = []
    active_reqs = (
        db.query(BloodRequest)
        .filter(BloodRequest.status.in_([RequestStatus.open, RequestStatus.matching]))
        .all()
    )
    for req in active_reqs:
        inv = inventory_count(db, req.blood_type, req.center_id, req.product_type)
        remaining = max(0, req.qty_needed - req.qty_fulfilled)
        shortage = compute_shortage(remaining, inv)
        coverage = compute_coverage(inv, max(1, remaining))
        existing = (
            db.query(Alert)
            .filter(Alert.request_id == req.id, Alert.status != AlertStatus.resolved)
            .first()
        )
        if shortage <= 0 and coverage >= settings.coverage_warn:
            if existing:
                existing.status = AlertStatus.resolved
                existing.metrics = {
                    "demand": req.qty_needed,
                    "fulfilled": req.qty_fulfilled,
                    "available": inv,
                    "shortage": 0,
                    "coverage": round(coverage, 3),
                }
            continue
        severity = AlertSeverity.critical if coverage < settings.coverage_critical else AlertSeverity.warning
        metrics = {
            "demand": req.qty_needed,
            "fulfilled": req.qty_fulfilled,
            "available": inv,
            "shortage": shortage,
            "coverage": round(coverage, 3),
            "formula": (
                f"Shortage ({shortage}) = Remaining ({remaining}) - Available ({inv})"
            ),
        }
        title = f"Thiếu {req.blood_type} tại {req.facility_name} — coverage {coverage:.0%}"
        if existing:
            existing.severity = severity
            existing.metrics = metrics
            existing.title = title
            created.append(existing)
        else:
            code = f"ALT-{datetime.utcnow().strftime('%Y%m%d')}-{req.code[-4:]}"
            alert = Alert(
                code=code,
                type="shortage",
                severity=severity,
                title=title,
                blood_type=req.blood_type,
                center_id=req.center_id,
                request_id=req.id,
                metrics=metrics,
                status=AlertStatus.open,
            )
            db.add(alert)
            created.append(alert)

    # Resolve alerts for fulfilled/cancelled requests
    for alert in (
        db.query(Alert)
        .filter(Alert.type == "shortage", Alert.status != AlertStatus.resolved)
        .all()
    ):
        if not alert.request_id:
            continue
        req = db.get(BloodRequest, alert.request_id)
        if req and req.status in (RequestStatus.fulfilled, RequestStatus.cancelled):
            alert.status = AlertStatus.resolved

    # Expiry alerts
    soon = datetime.utcnow() + timedelta(hours=48)
    expiring = (
        db.query(BloodUnit)
        .filter(
            BloodUnit.expires_at <= soon,
            BloodUnit.status.in_([BloodUnitStatus.ready, BloodUnitStatus.critical]),
        )
        .count()
    )
    if expiring > 0:
        code = "ALT-EXPIRY-48H"
        existing = db.query(Alert).filter(Alert.code == code, Alert.status != AlertStatus.resolved).first()
        metrics = {"expiring_48h": expiring}
        title = f"{expiring} đơn vị máu gần hết hạn (<48h)"
        if existing:
            existing.metrics = metrics
            existing.title = title
            existing.severity = AlertSeverity.warning
        else:
            db.add(
                Alert(
                    code=code,
                    type="expiry",
                    severity=AlertSeverity.warning,
                    title=title,
                    blood_type="",
                    metrics=metrics,
                    status=AlertStatus.open,
                )
            )
    db.commit()
    return created
