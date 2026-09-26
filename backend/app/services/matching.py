import math
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.config import settings
from app.models import BloodRequest, BloodUnit, BloodUnitStatus, DonationCenter

# Prototype safety stock at source — not a clinical threshold
_SOURCE_SAFETY_UNITS = 5


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def inventory_count(db: Session, blood_type: str, center_id: str | None = None) -> int:
    q = db.query(BloodUnit).filter(
        BloodUnit.blood_type == blood_type,
        BloodUnit.status.in_([BloodUnitStatus.ready, BloodUnitStatus.critical]),
    )
    if center_id:
        q = q.filter(BloodUnit.center_id == center_id)
    return q.count()


def compute_shortage(demand: int, inventory: int) -> int:
    return max(0, demand - inventory)


def compute_coverage(inventory: int, expected_demand: int) -> float:
    if expected_demand <= 0:
        return 1.0
    return inventory / expected_demand


def units_expiring_within(db: Session, hours: int = 48) -> int:
    deadline = datetime.utcnow() + timedelta(hours=hours)
    return (
        db.query(BloodUnit)
        .filter(
            BloodUnit.expires_at <= deadline,
            BloodUnit.status.in_(
                [BloodUnitStatus.ready, BloodUnitStatus.critical, BloodUnitStatus.reserved]
            ),
        )
        .count()
    )


def _ready_units_at_center(db: Session, center_id: str, blood_type: str) -> list[BloodUnit]:
    return (
        db.query(BloodUnit)
        .filter(
            BloodUnit.center_id == center_id,
            BloodUnit.blood_type == blood_type,
            BloodUnit.status.in_([BloodUnitStatus.ready, BloodUnitStatus.critical]),
        )
        .order_by(BloodUnit.expires_at)
        .all()
    )


def score_facility(
    center: DonationCenter,
    units: list[BloodUnit],
    request: BloodRequest,
    dest_lat: float,
    dest_lng: float,
    needed: int,
    now: datetime | None = None,
) -> dict:
    now = now or datetime.utcnow()
    available = len(units)
    # B: enough matching units at source
    b_raw = min(1.0, available / max(1, needed)) if available > 0 else 0.0

    dist = haversine_km(center.lat, center.lng, dest_lat, dest_lng)
    d_raw = max(0.0, 1.0 - dist / 30.0)

    # T: soonest-expiring unit still usable relative to deadline
    if units:
        soonest = min(u.expires_at for u in units)
        hours_to_expiry = max(0.0, (soonest - now).total_seconds() / 3600.0)
        hours_to_deadline = max(0.0, (request.deadline - now).total_seconds() / 3600.0)
        # Prefer units that outlive the deadline with buffer
        t_raw = min(1.0, hours_to_expiry / max(1.0, hours_to_deadline + 6.0))
    else:
        t_raw = 0.0

    # A: surplus above safety stock (avoid draining source)
    surplus = max(0, available - _SOURCE_SAFETY_UNITS)
    a_raw = min(1.0, surplus / max(1, needed + _SOURCE_SAFETY_UNITS))

    r_raw = min(1.0, max(0.0, float(center.transfer_success_rate or 0.0)))

    w = {
        "B": settings.weight_b,
        "D": settings.weight_d,
        "T": settings.weight_t,
        "A": settings.weight_a,
        "R": settings.weight_r,
    }
    components = {
        "B": round(w["B"] * 100 * b_raw, 1),
        "D": round(w["D"] * 100 * d_raw, 1),
        "T": round(w["T"] * 100 * t_raw, 1),
        "A": round(w["A"] * 100 * a_raw, 1),
        "R": round(w["R"] * 100 * r_raw, 1),
    }
    return {
        "components": components,
        "score": round(sum(components.values()), 1),
        "distance_km": round(dist, 1),
        "available_units": available,
        "weights": w,
    }


def run_matching(
    db: Session,
    request: BloodRequest,
    dest_lat: float,
    dest_lng: float,
    top_k: int,
    radius_km: float,
) -> tuple[list[dict], dict[str, float]]:
    centers = db.query(DonationCenter).all()
    needed = max(1, request.qty_needed - request.qty_fulfilled)
    weights = {
        "B": settings.weight_b,
        "D": settings.weight_d,
        "T": settings.weight_t,
        "A": settings.weight_a,
        "R": settings.weight_r,
    }
    scored: list[dict] = []
    for center in centers:
        if request.center_id and center.id == request.center_id:
            continue
        if not center.allowed_to_supply_others:
            continue
        units = _ready_units_at_center(db, center.id, request.blood_type)
        if not units:
            continue
        dist = haversine_km(center.lat, center.lng, dest_lat, dest_lng)
        if dist > radius_km:
            continue
        result = score_facility(center, units, request, dest_lat, dest_lng, needed)
        if result["components"]["B"] <= 0:
            continue
        scored.append(
            {
                "center_id": center.id,
                "center_name": center.name,
                "facility_type": center.facility_type,
                "distance_km": result["distance_km"],
                "score": result["score"],
                "components": result["components"],
                "available_units": result["available_units"],
                "transfer_success_rate": center.transfer_success_rate,
            }
        )
    scored.sort(key=lambda x: x["score"], reverse=True)
    top = scored[:top_k]
    for i, c in enumerate(top, start=1):
        c["rank"] = i
    return top, weights
