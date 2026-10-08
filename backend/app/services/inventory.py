"""Inventory receipt / issue / quarantine review — never moves units between facilities.

Inter-facility movement is only possible through the transfer lifecycle (services/transfers.py).
"""

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import (
    AVAILABLE_UNIT_STATUSES,
    BLOOD_TYPES,
    PRODUCT_TYPES,
    BloodUnit,
    BloodUnitStatus,
    DonationCenter,
    InventoryTransaction,
    TransactionType,
    User,
    UserRole,
)
from app.services import audit

_OUT_STATUS = {
    "issued": (BloodUnitStatus.used, "Issued"),
    "discarded": (BloodUnitStatus.discarded, "Discarded"),
    "expired": (BloodUnitStatus.expired, "Expired"),
}


def expire_overdue_units(db: Session) -> int:
    """Available units past expiry can never be matched or issued."""
    now = datetime.utcnow()
    rows = (
        db.query(BloodUnit)
        .filter(BloodUnit.status.in_(AVAILABLE_UNIT_STATUSES), BloodUnit.expires_at <= now)
        .all()
    )
    for u in rows:
        u.status = BloodUnitStatus.expired
        u.dss_status = "Expired"
    if rows:
        db.commit()
    return len(rows)


def _actor_center(actor: User, requested: str | None) -> str:
    if actor.role == UserRole.admin:
        if not requested:
            raise HTTPException(400, "Admin cần chọn cơ sở nhập kho")
        return requested
    if not actor.center_id:
        raise HTTPException(403, "Tài khoản chưa gắn cơ sở")
    if requested and requested != actor.center_id:
        raise HTTPException(403, "Chỉ được thao tác kho của cơ sở mình")
    return actor.center_id


def receive_new_unit(db: Session, actor: User, data: dict) -> BloodUnit:
    center_id = _actor_center(actor, data.get("center_id"))
    if not db.get(DonationCenter, center_id):
        raise HTTPException(404, "Không tìm thấy cơ sở")

    barcode = (data.get("barcode") or "").strip()
    if len(barcode) < 4:
        raise HTTPException(400, "Mã túi máu (barcode) bắt buộc")
    if db.query(BloodUnit).filter(BloodUnit.barcode == barcode).first():
        raise HTTPException(
            409,
            "Mã túi máu đã tồn tại trong hệ thống — không nhập lại đơn vị cũ. "
            "Đơn vị từ cơ sở khác phải nhận qua quy trình điều chuyển.",
        )
    blood_type = (data.get("blood_type") or "").strip().upper()
    if blood_type not in BLOOD_TYPES:
        raise HTTPException(400, "Nhóm máu không hợp lệ")
    product = (data.get("product_type") or "").strip().upper()
    if product not in PRODUCT_TYPES:
        raise HTTPException(400, "Loại chế phẩm không hợp lệ")
    expires_at = data.get("expires_at")
    collected_at = data.get("collected_at") or datetime.utcnow()
    if not expires_at:
        raise HTTPException(400, "Hạn dùng bắt buộc")
    expires_at = expires_at.replace(tzinfo=None)
    collected_at = collected_at.replace(tzinfo=None)
    if expires_at <= datetime.utcnow():
        raise HTTPException(400, "Không nhập kho đơn vị đã hết hạn")
    if collected_at > datetime.utcnow() or collected_at >= expires_at:
        raise HTTPException(400, "Ngày lấy máu không hợp lệ")
    note = (data.get("note") or "").strip()

    unit = BloodUnit(
        barcode=barcode,
        blood_type=blood_type,
        product_type=product,
        volume_ml=data.get("volume_ml") or 350,
        collected_at=collected_at,
        expires_at=expires_at,
        status=BloodUnitStatus.ready,
        center_id=center_id,
        location_label=data.get("location_label") or "",
        dss_status="Ready",
    )
    db.add(unit)
    db.flush()
    db.add(
        InventoryTransaction(
            unit_id=unit.id,
            type=TransactionType.in_,
            reason="receipt",
            to_center_id=center_id,
            actor_id=actor.id,
            note=note or "Nhập đơn vị mới",
        )
    )
    audit.record(
        db,
        actor,
        "inventory.receive",
        "blood_unit",
        unit.id,
        {"barcode": barcode, "blood_type": blood_type, "product_type": product, "center_id": center_id},
    )
    db.commit()
    db.refresh(unit)
    return unit


def issue_out(db: Session, actor: User, unit_id: str, reason: str, note: str) -> BloodUnit:
    if reason not in _OUT_STATUS:
        raise HTTPException(400, "Lý do xuất phải là: issued | discarded | expired")
    note = (note or "").strip()
    if len(note) < 3:
        raise HTTPException(400, "Cần ghi chú lý do xuất kho")
    unit = db.query(BloodUnit).filter(BloodUnit.id == unit_id).with_for_update().first()
    if not unit:
        raise HTTPException(404, "Không tìm thấy đơn vị máu")
    _actor_center(actor, unit.center_id)
    if unit.status not in AVAILABLE_UNIT_STATUSES and not (
        reason == "expired" and unit.status == BloodUnitStatus.expired
    ):
        raise HTTPException(
            400,
            "Chỉ xuất được đơn vị đang sẵn sàng tại kho. Đơn vị đang giữ chỗ / điều chuyển / cách ly "
            "phải xử lý qua quy trình tương ứng.",
        )
    if reason == "issued" and unit.expires_at <= datetime.utcnow():
        raise HTTPException(400, "Đơn vị đã hết hạn — không cấp phát; chọn lý do 'hết hạn' hoặc 'hủy bỏ'")

    status, label = _OUT_STATUS[reason]
    unit.status = status
    unit.dss_status = label
    db.add(
        InventoryTransaction(
            unit_id=unit.id,
            type=TransactionType.out,
            reason=reason,
            from_center_id=unit.center_id,
            actor_id=actor.id,
            note=note,
        )
    )
    audit.record(db, actor, "inventory.out", "blood_unit", unit.id, {"reason": reason, "note": note})
    db.commit()
    db.refresh(unit)
    return unit


def review_quarantine(db: Session, actor: User, unit_id: str, decision: str, reason: str) -> BloodUnit:
    unit = db.query(BloodUnit).filter(BloodUnit.id == unit_id).with_for_update().first()
    if not unit:
        raise HTTPException(404, "Không tìm thấy đơn vị máu")
    if unit.status != BloodUnitStatus.quarantine:
        raise HTTPException(400, "Đơn vị không ở trạng thái cách ly")
    _actor_center(actor, unit.center_id)

    if decision == "release":
        if unit.expires_at <= datetime.utcnow():
            raise HTTPException(400, "Đơn vị đã hết hạn — chỉ có thể hủy bỏ")
        unit.status = BloodUnitStatus.ready
        unit.dss_status = "Ready (released from quarantine)"
    else:
        unit.status = BloodUnitStatus.discarded
        unit.dss_status = "Discarded after quarantine"
        db.add(
            InventoryTransaction(
                unit_id=unit.id,
                type=TransactionType.out,
                reason="discarded",
                from_center_id=unit.center_id,
                actor_id=actor.id,
                note=f"Hủy bỏ sau cách ly: {reason}",
            )
        )
    audit.record(
        db,
        actor,
        "inventory.quarantine_review",
        "blood_unit",
        unit.id,
        {"decision": decision, "reason": reason},
    )
    db.commit()
    db.refresh(unit)
    return unit
