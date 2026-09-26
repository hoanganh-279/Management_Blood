"""Blood transfer lifecycle (TT 26-min): propose → confirm → export → transit → receive."""

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import (
    BloodRequest,
    BloodTransfer,
    BloodUnit,
    BloodUnitStatus,
    DonationCenter,
    InventoryTransaction,
    Notification,
    NotificationStatus,
    RequestStatus,
    TransactionType,
    TransferEvent,
    TransferStatus,
    User,
    UserRole,
)
from app.services.alerts import refresh_alerts_for_requests

# Product-type → suggested transport temp band (Điều 20 spirit — checklist only)
_TRANSPORT_TEMP_HINT = {
    "PRBC": "1_to_10C",
    "WB": "1_to_10C",
    "PLT": "20_to_24C",
    "WBC": "20_to_24C",
    "FFP": "le_minus_18C",
    "CRYO": "le_minus_18C",
}

_OPEN = {
    TransferStatus.proposed,
    TransferStatus.source_confirmed,
    TransferStatus.exported,
    TransferStatus.in_transit,
    TransferStatus.inbound_pending,
}


def transport_temp_hint(product_type: str) -> str:
    return _TRANSPORT_TEMP_HINT.get((product_type or "PRBC").upper(), "1_to_10C")


def _event(
    db: Session,
    transfer: BloodTransfer,
    actor: User,
    from_status: TransferStatus | None,
    to_status: TransferStatus,
    note: str = "",
) -> None:
    db.add(
        TransferEvent(
            transfer_id=transfer.id,
            actor_id=actor.id,
            from_status=from_status.value if from_status else None,
            to_status=to_status.value,
            note=note,
        )
    )


def _notify(db: Session, transfer: BloodTransfer, actor: User, template: str, body: str) -> None:
    db.add(
        Notification(
            user_id=None,
            center_id=transfer.dest_center_id,
            request_id=transfer.blood_request_id,
            channel="in_app",
            template=template,
            body=body,
            status=NotificationStatus.sent,
            created_by=actor.id,
        )
    )


def propose_transfer(
    db: Session,
    *,
    actor: User,
    unit_id: str,
    source_center_id: str | None,
    dest_center_id: str | None,
    blood_request_id: str | None,
    note: str = "",
    leadership_confirm: bool = False,
) -> BloodTransfer:
    if actor.role not in (UserRole.admin, UserRole.staff_bank):
        raise HTTPException(403, "Chỉ admin hoặc nhân viên kho nguồn được đề xuất điều chuyển")

    unit = db.get(BloodUnit, unit_id)
    if not unit:
        raise HTTPException(404, "Unit not found")
    if unit.status not in (BloodUnitStatus.ready, BloodUnitStatus.critical):
        raise HTTPException(400, "Đơn vị không ở trạng thái sẵn sàng để đề xuất")

    source_id = source_center_id or unit.center_id
    if unit.center_id != source_id:
        raise HTTPException(400, "Đơn vị không thuộc cơ sở nguồn đã chọn")

    source = db.get(DonationCenter, source_id)
    if not source:
        raise HTTPException(404, "Source center not found")
    if not source.allowed_to_supply_others:
        raise HTTPException(
            400,
            "Cơ sở nguồn chưa được cấu hình allowed_to_supply_others (tinh thần Điều 39.1)",
        )

    dest_id = dest_center_id
    req = None
    if blood_request_id:
        req = db.get(BloodRequest, blood_request_id)
        if not req:
            raise HTTPException(404, "Blood request not found")
        dest_id = dest_id or req.center_id
    if not dest_id:
        raise HTTPException(400, "Thiếu cơ sở đích")
    if dest_id == source_id:
        raise HTTPException(400, "Nguồn và đích phải khác nhau")

    leadership_by = None
    if not source.has_supply_contract:
        if not leadership_confirm and actor.role != UserRole.admin:
            raise HTTPException(
                400,
                "Cơ sở chưa có HĐ cung cấp: cần leadership_confirm (prototype: admin hoặc tick xác nhận)",
            )
        if leadership_confirm or actor.role == UserRole.admin:
            leadership_by = actor.id

    transfer = BloodTransfer(
        blood_request_id=blood_request_id,
        blood_unit_id=unit.id,
        source_center_id=source_id,
        dest_center_id=dest_id,
        status=TransferStatus.proposed,
        leadership_confirmed_by=leadership_by,
        note=note,
        created_by=actor.id,
        transport_checklist={},
        inbound_checklist={},
    )
    db.add(transfer)
    db.flush()
    _event(db, transfer, actor, None, TransferStatus.proposed, note or "Đề xuất điều chuyển (DSS hỗ trợ)")
    if req and req.status == RequestStatus.open:
        req.status = RequestStatus.matching
    _notify(
        db,
        transfer,
        actor,
        "Đề xuất điều chuyển",
        f"Đề xuất điều chuyển {unit.barcode} ({unit.blood_type}) từ {source.name}. "
        "Kết quả DSS không thay thẩm quyền chuyên môn/pháp lý.",
    )
    db.commit()
    db.refresh(transfer)
    return transfer


def confirm_source(db: Session, transfer: BloodTransfer, actor: User, note: str = "") -> BloodTransfer:
    if transfer.status != TransferStatus.proposed:
        raise HTTPException(400, f"Không thể xác nhận từ trạng thái {transfer.status.value}")
    _require_source_actor(transfer, actor)

    source = db.get(DonationCenter, transfer.source_center_id)
    if source and not source.has_supply_contract and not transfer.leadership_confirmed_by:
        if actor.role == UserRole.admin:
            transfer.leadership_confirmed_by = actor.id
        else:
            raise HTTPException(
                400,
                "Chưa có xác nhận ủy quyền/lãnh đạo (prototype) trong khi chưa có HĐ cung cấp",
            )

    unit = db.get(BloodUnit, transfer.blood_unit_id)
    if not unit or unit.center_id != transfer.source_center_id:
        raise HTTPException(400, "Đơn vị không còn tại nguồn")
    if unit.status not in (BloodUnitStatus.ready, BloodUnitStatus.critical):
        raise HTTPException(400, "Đơn vị không sẵn sàng để giữ chỗ")

    prev = transfer.status
    unit.status = BloodUnitStatus.reserved
    unit.dss_status = "Reserved for transfer"
    transfer.status = TransferStatus.source_confirmed
    transfer.updated_at = datetime.utcnow()
    _event(db, transfer, actor, prev, TransferStatus.source_confirmed, note or "Nguồn xác nhận")
    db.commit()
    db.refresh(transfer)
    return transfer


def export_transfer(db: Session, transfer: BloodTransfer, actor: User, note: str = "") -> BloodTransfer:
    if transfer.status != TransferStatus.source_confirmed:
        raise HTTPException(400, f"Không thể xuất từ trạng thái {transfer.status.value}")
    _require_source_actor(transfer, actor)

    unit = db.get(BloodUnit, transfer.blood_unit_id)
    if not unit:
        raise HTTPException(404, "Unit not found")

    prev = transfer.status
    unit.status = BloodUnitStatus.transferred
    unit.dss_status = "Exported"
    transfer.status = TransferStatus.exported
    transfer.updated_at = datetime.utcnow()
    db.add(
        InventoryTransaction(
            unit_id=unit.id,
            type=TransactionType.out,
            from_center_id=transfer.source_center_id,
            to_center_id=transfer.dest_center_id,
            blood_request_id=transfer.blood_request_id,
            transfer_id=transfer.id,
            actor_id=actor.id,
            note=note or "Xuất kho theo điều chuyển",
        )
    )
    _event(db, transfer, actor, prev, TransferStatus.exported, note or "Xuất kho nguồn")
    db.commit()
    db.refresh(transfer)
    return transfer


def start_transit(
    db: Session,
    transfer: BloodTransfer,
    actor: User,
    checklist: dict,
    note: str = "",
) -> BloodTransfer:
    if transfer.status != TransferStatus.exported:
        raise HTTPException(400, f"Không thể bắt đầu VC từ trạng thái {transfer.status.value}")
    _require_source_actor(transfer, actor)

    unit = db.get(BloodUnit, transfer.blood_unit_id)
    product = unit.product_type if unit else "PRBC"
    temp_band = checklist.get("temperature_band") or transport_temp_hint(product)
    ice_ok = checklist.get("ice_not_direct_contact")
    if ice_ok is not True:
        raise HTTPException(
            400,
            "Checklist Điều 20: cần xác nhận đá lạnh không tiếp xúc trực tiếp túi máu (ice_not_direct_contact=true)",
        )
    if not checklist.get("vehicle_ok"):
        raise HTTPException(400, "Checklist Điều 20: cần xác nhận phương tiện bảo quản phù hợp (vehicle_ok=true)")

    prev = transfer.status
    transfer.transport_checklist = {
        "temperature_band": temp_band,
        "ice_not_direct_contact": True,
        "vehicle_ok": True,
        "recorded_at": datetime.utcnow().isoformat() + "Z",
        "hint": transport_temp_hint(product),
    }
    transfer.status = TransferStatus.in_transit
    transfer.updated_at = datetime.utcnow()
    if unit:
        unit.dss_status = "In transit"
    _event(db, transfer, actor, prev, TransferStatus.in_transit, note or "Bắt đầu vận chuyển")
    # Auto-move to inbound_pending (MVP: no separate carrier handoff)
    prev2 = transfer.status
    transfer.status = TransferStatus.inbound_pending
    transfer.updated_at = datetime.utcnow()
    _event(
        db,
        transfer,
        actor,
        prev2,
        TransferStatus.inbound_pending,
        "Chờ đối chiếu nhập tại đích",
    )
    _notify(
        db,
        transfer,
        actor,
        "Chờ nhập kho",
        f"Đơn vị đang chờ đối chiếu nhập (tinh thần Điều 40). Transfer {transfer.id[:8]}…",
    )
    db.commit()
    db.refresh(transfer)
    return transfer


def receive_transfer(
    db: Session,
    transfer: BloodTransfer,
    actor: User,
    checklist: dict,
    note: str = "",
) -> BloodTransfer:
    if transfer.status != TransferStatus.inbound_pending:
        raise HTTPException(400, f"Không thể nhận từ trạng thái {transfer.status.value}")
    _require_dest_actor(transfer, actor)

    if not checklist.get("packaging_ok"):
        raise HTTPException(400, "Checklist Điều 40: cần đối chiếu bao gói (packaging_ok=true)")
    if not checklist.get("label_ok"):
        raise HTTPException(400, "Checklist Điều 40: cần đối chiếu nhãn (label_ok=true)")
    if not checklist.get("transport_condition_ok"):
        raise HTTPException(
            400,
            "Checklist Điều 40: cần xác nhận điều kiện bảo quản/VC (transport_condition_ok=true)",
        )

    unit = db.get(BloodUnit, transfer.blood_unit_id)
    if not unit:
        raise HTTPException(404, "Unit not found")

    prev = transfer.status
    transfer.inbound_checklist = {
        "packaging_ok": True,
        "label_ok": True,
        "transport_condition_ok": True,
        "anomaly_note": checklist.get("anomaly_note") or "",
        "recorded_at": datetime.utcnow().isoformat() + "Z",
    }
    unit.center_id = transfer.dest_center_id
    unit.status = BloodUnitStatus.ready
    unit.dss_status = "Received via transfer (verified)"
    transfer.status = TransferStatus.received
    transfer.updated_at = datetime.utcnow()

    db.add(
        InventoryTransaction(
            unit_id=unit.id,
            type=TransactionType.in_,
            from_center_id=transfer.source_center_id,
            to_center_id=transfer.dest_center_id,
            blood_request_id=transfer.blood_request_id,
            transfer_id=transfer.id,
            actor_id=actor.id,
            note=note or "Nhập kho sau đối chiếu",
        )
    )

    if transfer.blood_request_id:
        req = db.get(BloodRequest, transfer.blood_request_id)
        if req:
            req.qty_fulfilled = (req.qty_fulfilled or 0) + 1
            if req.qty_fulfilled >= req.qty_needed:
                req.status = RequestStatus.fulfilled

    _event(db, transfer, actor, prev, TransferStatus.received, note or "Đối chiếu nhập đạt")
    _notify(
        db,
        transfer,
        actor,
        "Điều chuyển hoàn tất",
        f"Đã nhận {unit.barcode} ({unit.blood_type}) sau đối chiếu nhập. "
        "DSS hỗ trợ quyết định — không thay thẩm quyền chuyên môn/pháp lý.",
    )
    db.commit()
    if transfer.blood_request_id:
        refresh_alerts_for_requests(db)
    db.refresh(transfer)
    return transfer


def reject_transfer(
    db: Session,
    transfer: BloodTransfer,
    actor: User,
    reason: str,
    checklist: dict | None = None,
) -> BloodTransfer:
    if transfer.status not in (
        TransferStatus.inbound_pending,
        TransferStatus.in_transit,
        TransferStatus.exported,
    ):
        raise HTTPException(400, f"Không thể từ chối từ trạng thái {transfer.status.value}")
    if transfer.status == TransferStatus.inbound_pending:
        _require_dest_actor(transfer, actor)
    else:
        _require_source_or_dest_or_admin(transfer, actor)

    unit = db.get(BloodUnit, transfer.blood_unit_id)
    prev = transfer.status
    if checklist:
        transfer.inbound_checklist = {**(transfer.inbound_checklist or {}), **checklist}
    transfer.cancel_reason = reason or "Rejected"
    transfer.status = TransferStatus.rejected
    transfer.updated_at = datetime.utcnow()
    if unit:
        unit.center_id = transfer.source_center_id
        unit.status = BloodUnitStatus.ready
        unit.dss_status = "Returned to source after reject"
    _event(db, transfer, actor, prev, TransferStatus.rejected, reason)
    db.commit()
    db.refresh(transfer)
    return transfer


def cancel_transfer(db: Session, transfer: BloodTransfer, actor: User, reason: str) -> BloodTransfer:
    if transfer.status not in _OPEN:
        raise HTTPException(400, f"Không thể hủy từ trạng thái {transfer.status.value}")
    if actor.role != UserRole.admin:
        if transfer.status == TransferStatus.proposed:
            _require_source_or_admin(transfer, actor)
        else:
            _require_source_actor(transfer, actor)

    unit = db.get(BloodUnit, transfer.blood_unit_id)
    prev = transfer.status
    transfer.cancel_reason = reason or "Cancelled"
    transfer.status = TransferStatus.cancelled
    transfer.updated_at = datetime.utcnow()
    if unit and unit.status in (BloodUnitStatus.reserved, BloodUnitStatus.transferred):
        unit.center_id = transfer.source_center_id
        unit.status = BloodUnitStatus.ready
        unit.dss_status = "Ready"
    _event(db, transfer, actor, prev, TransferStatus.cancelled, reason)
    db.commit()
    db.refresh(transfer)
    return transfer


def _require_source_actor(transfer: BloodTransfer, actor: User) -> None:
    if actor.role == UserRole.admin:
        return
    if actor.role == UserRole.staff_bank and actor.center_id == transfer.source_center_id:
        return
    # Hospital staff at a source hospital that is allowed to supply
    if (
        actor.role == UserRole.staff_hospital
        and actor.center_id == transfer.source_center_id
    ):
        return
    raise HTTPException(403, "Chỉ nhân viên cơ sở nguồn hoặc admin được thao tác bước này")


def _require_dest_actor(transfer: BloodTransfer, actor: User) -> None:
    if actor.role == UserRole.admin:
        return
    if actor.center_id == transfer.dest_center_id:
        return
    raise HTTPException(403, "Chỉ nhân viên cơ sở đích hoặc admin được đối chiếu nhập")


def _require_source_or_admin(transfer: BloodTransfer, actor: User) -> None:
    if actor.role == UserRole.admin:
        return
    if actor.center_id == transfer.source_center_id:
        return
    raise HTTPException(403, "Không có quyền")


def _require_source_or_dest_or_admin(transfer: BloodTransfer, actor: User) -> None:
    if actor.role == UserRole.admin:
        return
    if actor.center_id in (transfer.source_center_id, transfer.dest_center_id):
        return
    raise HTTPException(403, "Không có quyền")
