"""Blood transfer lifecycle (TT 26 spirit — Điều 20, 39, 40, 61).

proposed → source_confirmed → exported → in_transit → inbound_pending → received
                                         in_transit | inbound_pending → rejected (dest)
proposed | source_confirmed → cancelled (source / admin)

DSS only supports the decision; every step is a human confirmation recorded in transfer_events.
"""

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import (
    AVAILABLE_UNIT_STATUSES,
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

# Product-type → required transport temperature band (Điều 20 spirit — recorded checklist, no IoT)
_TRANSPORT_TEMP_BAND = {
    "PRBC": "1_to_10C",
    "WB": "1_to_10C",
    "PLT": "20_to_24C",
    "WBC": "20_to_24C",
    "FFP": "le_minus_18C",
    "CRYO": "le_minus_18C",
}

_BAND_LIMITS = {
    "1_to_10C": (1.0, 10.0),
    "20_to_24C": (20.0, 24.0),
    "le_minus_18C": (None, -18.0),
}

OPEN_STATUSES = (
    TransferStatus.proposed,
    TransferStatus.source_confirmed,
    TransferStatus.exported,
    TransferStatus.in_transit,
    TransferStatus.inbound_pending,
)

_CANCELLABLE = (TransferStatus.proposed, TransferStatus.source_confirmed)
_REJECTABLE = (TransferStatus.in_transit, TransferStatus.inbound_pending)


def transport_temp_hint(product_type: str) -> str:
    return _TRANSPORT_TEMP_BAND.get((product_type or "PRBC").upper(), "1_to_10C")


def _now() -> datetime:
    return datetime.utcnow()


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


def _notify(
    db: Session,
    transfer: BloodTransfer,
    actor: User,
    template: str,
    body: str,
    center_id: str | None = None,
) -> None:
    db.add(
        Notification(
            user_id=None,
            center_id=center_id or transfer.dest_center_id,
            request_id=transfer.blood_request_id,
            channel="in_app",
            template=template,
            body=body,
            status=NotificationStatus.sent,
            created_by=actor.id,
        )
    )


def _locked_unit(db: Session, unit_id: str) -> BloodUnit | None:
    # Row lock on PostgreSQL; SQLite serialises writes anyway.
    return db.query(BloodUnit).filter(BloodUnit.id == unit_id).with_for_update().first()


def _require_not_expired(unit: BloodUnit, step: str) -> None:
    if unit.expires_at <= _now():
        raise HTTPException(
            400,
            f"Đơn vị {unit.barcode} đã hết hạn dùng — không thể {step}.",
        )


def _open_transfer_for_unit(db: Session, unit_id: str, exclude_id: str | None = None) -> BloodTransfer | None:
    q = db.query(BloodTransfer).filter(
        BloodTransfer.blood_unit_id == unit_id,
        BloodTransfer.status.in_(OPEN_STATUSES),
    )
    if exclude_id:
        q = q.filter(BloodTransfer.id != exclude_id)
    return q.first()


def _open_count_for_request(db: Session, request_id: str) -> int:
    return (
        db.query(BloodTransfer)
        .filter(
            BloodTransfer.blood_request_id == request_id,
            BloodTransfer.status.in_(OPEN_STATUSES),
        )
        .count()
    )


def propose_transfer(
    db: Session,
    *,
    actor: User,
    unit_id: str,
    source_center_id: str | None,
    dest_center_id: str | None,
    blood_request_id: str,
    note: str = "",
    leadership_confirm: bool = False,
    leadership_reason: str = "",
) -> BloodTransfer:
    if actor.role not in (UserRole.admin, UserRole.staff_bank):
        raise HTTPException(403, "Chỉ admin hoặc nhân viên kho nguồn được đề xuất điều chuyển")

    unit = _locked_unit(db, unit_id)
    if not unit:
        raise HTTPException(404, "Không tìm thấy đơn vị máu")
    if unit.status not in AVAILABLE_UNIT_STATUSES:
        raise HTTPException(400, "Đơn vị không ở trạng thái sẵn sàng để đề xuất")
    _require_not_expired(unit, "đề xuất điều chuyển")

    source_id = source_center_id or unit.center_id
    if unit.center_id != source_id:
        raise HTTPException(400, "Đơn vị không thuộc cơ sở nguồn đã chọn")
    if actor.role == UserRole.staff_bank and actor.center_id != source_id:
        raise HTTPException(403, "Nhân viên kho chỉ được đề xuất từ tồn kho của cơ sở mình")

    source = db.get(DonationCenter, source_id)
    if not source:
        raise HTTPException(404, "Không tìm thấy cơ sở nguồn")
    if not source.allowed_to_supply_others:
        raise HTTPException(
            400,
            "Cơ sở nguồn chưa được cấu hình allowed_to_supply_others (tinh thần Điều 39.1)",
        )

    req = db.get(BloodRequest, blood_request_id)
    if not req:
        raise HTTPException(404, "Không tìm thấy nhu cầu máu")
    if req.status not in (RequestStatus.open, RequestStatus.matching):
        raise HTTPException(400, "Nhu cầu đã đóng (đã đáp ứng hoặc đã hủy)")
    if not req.center_id:
        raise HTTPException(400, "Nhu cầu chưa gắn cơ sở nhận")
    if dest_center_id and dest_center_id != req.center_id:
        raise HTTPException(400, "Cơ sở đích phải là cơ sở tạo nhu cầu")
    dest_id = req.center_id
    if dest_id == source_id:
        raise HTTPException(400, "Nguồn và đích phải khác nhau")

    if unit.blood_type != req.blood_type:
        raise HTTPException(
            400,
            f"Nhóm máu không khớp nhu cầu ({unit.blood_type} ≠ {req.blood_type}). "
            "DSS chỉ đề xuất đúng nhóm; truyền thay thế là quyết định lâm sàng ngoài hệ thống.",
        )
    if (unit.product_type or "").upper() != (req.product_type or "").upper():
        raise HTTPException(
            400,
            f"Loại chế phẩm không khớp nhu cầu ({unit.product_type} ≠ {req.product_type})",
        )

    if _open_transfer_for_unit(db, unit.id):
        raise HTTPException(409, "Đơn vị này đã thuộc một điều chuyển đang mở")

    remaining = req.qty_needed - (req.qty_fulfilled or 0) - _open_count_for_request(db, req.id)
    if remaining <= 0:
        raise HTTPException(
            400,
            "Số đơn vị đang điều chuyển + đã nhận đã đủ số lượng nhu cầu — không đề xuất thêm",
        )

    leadership_by = None
    leadership_at = None
    reason = (leadership_reason or "").strip()
    if not source.has_supply_contract:
        if not leadership_confirm or len(reason) < 3:
            raise HTTPException(
                400,
                "Cơ sở nguồn chưa có HĐ cung cấp: cần xác nhận lãnh đạo/ủy quyền kèm lý do (tinh thần Điều 39)",
            )
        leadership_by = actor.id
        leadership_at = _now()

    transfer = BloodTransfer(
        blood_request_id=req.id,
        blood_unit_id=unit.id,
        source_center_id=source_id,
        dest_center_id=dest_id,
        status=TransferStatus.proposed,
        leadership_confirmed_by=leadership_by,
        leadership_confirmed_at=leadership_at,
        leadership_reason=reason if leadership_by else "",
        note=note,
        created_by=actor.id,
        transport_checklist={},
        inbound_checklist={},
    )
    db.add(transfer)
    db.flush()
    _event(db, transfer, actor, None, TransferStatus.proposed, note or "Đề xuất điều chuyển (DSS hỗ trợ)")
    if leadership_by:
        db.add(
            TransferEvent(
                transfer_id=transfer.id,
                actor_id=actor.id,
                from_status=TransferStatus.proposed.value,
                to_status=TransferStatus.proposed.value,
                note=f"Xác nhận lãnh đạo/ủy quyền (chưa có HĐ): {reason}",
            )
        )
    if req.status == RequestStatus.open:
        req.status = RequestStatus.matching
    msg = (
        f"Đề xuất điều chuyển {unit.barcode} ({unit.blood_type} {unit.product_type}) từ {source.name}. "
        "Kết quả DSS không thay thẩm quyền chuyên môn/pháp lý."
    )
    _notify(db, transfer, actor, "Đề xuất điều chuyển", msg)
    _notify(db, transfer, actor, "Đề xuất điều chuyển — chờ nguồn xác nhận", msg, center_id=source_id)
    db.commit()
    db.refresh(transfer)
    return transfer


def confirm_source(
    db: Session,
    transfer: BloodTransfer,
    actor: User,
    note: str = "",
    leadership_confirm: bool = False,
    leadership_reason: str = "",
) -> BloodTransfer:
    if transfer.status != TransferStatus.proposed:
        raise HTTPException(400, f"Không thể xác nhận từ trạng thái {transfer.status.value}")
    _require_source_actor(transfer, actor)

    source = db.get(DonationCenter, transfer.source_center_id)
    if not source or not source.allowed_to_supply_others:
        raise HTTPException(400, "Cơ sở nguồn không còn được phép cung cấp (allowed_to_supply_others)")
    if not source.has_supply_contract and not transfer.leadership_confirmed_by:
        reason = (leadership_reason or "").strip()
        if not leadership_confirm or len(reason) < 3:
            raise HTTPException(
                400,
                "Chưa có HĐ cung cấp và chưa có xác nhận lãnh đạo/ủy quyền: cần xác nhận kèm lý do",
            )
        transfer.leadership_confirmed_by = actor.id
        transfer.leadership_confirmed_at = _now()
        transfer.leadership_reason = reason

    unit = _locked_unit(db, transfer.blood_unit_id)
    if not unit or unit.center_id != transfer.source_center_id:
        raise HTTPException(400, "Đơn vị không còn tại nguồn")
    if unit.status not in AVAILABLE_UNIT_STATUSES:
        raise HTTPException(400, "Đơn vị không sẵn sàng để giữ chỗ")
    _require_not_expired(unit, "giữ chỗ")
    if _open_transfer_for_unit(db, unit.id, exclude_id=transfer.id):
        raise HTTPException(409, "Đơn vị đã thuộc một điều chuyển khác đang mở")

    prev = transfer.status
    unit.status = BloodUnitStatus.reserved
    unit.dss_status = "Reserved for transfer"
    transfer.status = TransferStatus.source_confirmed
    transfer.updated_at = _now()
    _event(db, transfer, actor, prev, TransferStatus.source_confirmed, note or "Nguồn xác nhận, giữ chỗ đơn vị")
    db.commit()
    db.refresh(transfer)
    return transfer


def export_transfer(db: Session, transfer: BloodTransfer, actor: User, note: str = "") -> BloodTransfer:
    if transfer.status != TransferStatus.source_confirmed:
        raise HTTPException(400, f"Không thể xuất từ trạng thái {transfer.status.value}")
    _require_source_actor(transfer, actor)

    unit = _locked_unit(db, transfer.blood_unit_id)
    if not unit:
        raise HTTPException(404, "Không tìm thấy đơn vị máu")
    if unit.status != BloodUnitStatus.reserved or unit.center_id != transfer.source_center_id:
        raise HTTPException(400, "Đơn vị không ở trạng thái giữ chỗ tại nguồn")
    _require_not_expired(unit, "xuất kho")

    prev = transfer.status
    unit.status = BloodUnitStatus.transferred
    unit.dss_status = "Exported"
    transfer.status = TransferStatus.exported
    transfer.updated_at = _now()
    db.add(
        InventoryTransaction(
            unit_id=unit.id,
            type=TransactionType.out,
            reason="transfer_out",
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
    """Handover to transport (Điều 20 checklist). Stops at in_transit — arrival is a separate step."""
    if transfer.status != TransferStatus.exported:
        raise HTTPException(400, f"Không thể bàn giao vận chuyển từ trạng thái {transfer.status.value}")
    _require_source_actor(transfer, actor)

    unit = db.get(BloodUnit, transfer.blood_unit_id)
    product = unit.product_type if unit else "PRBC"
    required_band = transport_temp_hint(product)
    temp_band = checklist.get("temperature_band")
    if temp_band != required_band:
        raise HTTPException(
            400,
            f"Checklist Điều 20: dải nhiệt cho chế phẩm {product} phải là {required_band} (nhận {temp_band})",
        )
    measured = checklist.get("measured_temp_c")
    if measured is not None:
        lo, hi = _BAND_LIMITS[required_band]
        if (lo is not None and measured < lo) or (hi is not None and measured > hi):
            raise HTTPException(
                400,
                f"Nhiệt độ đo {measured}°C nằm ngoài dải {required_band} — không bàn giao vận chuyển",
            )
    if checklist.get("ice_not_direct_contact") is not True:
        raise HTTPException(
            400,
            "Checklist Điều 20: cần xác nhận đá lạnh không tiếp xúc trực tiếp túi máu",
        )
    if checklist.get("vehicle_ok") is not True:
        raise HTTPException(400, "Checklist Điều 20: cần xác nhận phương tiện bảo quản phù hợp")
    carrier = (checklist.get("carrier_name") or "").strip()
    if len(carrier) < 2:
        raise HTTPException(400, "Cần ghi tên người vận chuyển (Điều 39 — NVYT giao/nhận)")

    prev = transfer.status
    transfer.transport_checklist = {
        "temperature_band": temp_band,
        "required_temperature_band": required_band,
        "measured_temp_c": measured,
        "ice_not_direct_contact": True,
        "vehicle_ok": True,
        "carrier_name": carrier,
        "recorded_at": _now().isoformat() + "Z",
    }
    transfer.carrier_name = carrier
    transfer.handed_over_by = actor.id
    transfer.status = TransferStatus.in_transit
    transfer.updated_at = _now()
    if unit:
        unit.dss_status = "In transit"
    _event(
        db,
        transfer,
        actor,
        prev,
        TransferStatus.in_transit,
        note or f"Bàn giao vận chuyển cho {carrier}",
    )
    _notify(
        db,
        transfer,
        actor,
        "Đang vận chuyển",
        f"Đơn vị đang được vận chuyển bởi {carrier}. Khi hàng tới, xác nhận 'Đã nhận hàng' rồi đối chiếu nhập. "
        f"Điều chuyển {transfer.id[:8]}…",
    )
    db.commit()
    db.refresh(transfer)
    return transfer


def mark_arrived(db: Session, transfer: BloodTransfer, actor: User, note: str = "") -> BloodTransfer:
    if transfer.status != TransferStatus.in_transit:
        raise HTTPException(400, f"Không thể xác nhận đã nhận hàng từ trạng thái {transfer.status.value}")
    _require_dest_actor(transfer, actor)

    prev = transfer.status
    transfer.status = TransferStatus.inbound_pending
    transfer.arrived_at = _now()
    transfer.updated_at = _now()
    _event(
        db,
        transfer,
        actor,
        prev,
        TransferStatus.inbound_pending,
        note or "Hàng đã tới cơ sở đích — chờ đối chiếu nhập",
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

    if checklist.get("packaging_ok") is not True:
        raise HTTPException(400, "Checklist Điều 40: cần đối chiếu bao gói (packaging_ok=true)")
    if checklist.get("label_ok") is not True:
        raise HTTPException(400, "Checklist Điều 40: cần đối chiếu nhãn (label_ok=true)")
    if checklist.get("transport_condition_ok") is not True:
        raise HTTPException(
            400,
            "Checklist Điều 40: cần xác nhận điều kiện bảo quản/VC (transport_condition_ok=true)",
        )

    unit = _locked_unit(db, transfer.blood_unit_id)
    if not unit:
        raise HTTPException(404, "Không tìm thấy đơn vị máu")
    if unit.status != BloodUnitStatus.transferred:
        raise HTTPException(400, "Đơn vị không ở trạng thái đang điều chuyển")
    if unit.expires_at <= _now():
        raise HTTPException(
            400,
            "Đơn vị đã hết hạn dùng khi tới đích — không nhập kho; hãy dùng 'Từ chối' kèm lý do.",
        )

    anomaly = (checklist.get("anomaly_note") or "").strip()
    prev = transfer.status
    transfer.inbound_checklist = {
        "result": "accepted",
        "packaging_ok": True,
        "label_ok": True,
        "transport_condition_ok": True,
        "anomaly_note": anomaly,
        "recorded_at": _now().isoformat() + "Z",
    }
    transfer.received_by = actor.id
    unit.center_id = transfer.dest_center_id
    unit.status = BloodUnitStatus.ready
    unit.dss_status = "Received via transfer (verified)"
    transfer.status = TransferStatus.received
    transfer.updated_at = _now()

    db.add(
        InventoryTransaction(
            unit_id=unit.id,
            type=TransactionType.in_,
            reason="transfer_in",
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
        if req and req.status != RequestStatus.cancelled:
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
        center_id=transfer.source_center_id,
    )
    if anomaly:
        # Điều 40 spirit: anomalies are reported to the persons in charge on both sides.
        for cid in (transfer.source_center_id, transfer.dest_center_id):
            _notify(
                db,
                transfer,
                actor,
                "Bất thường khi nhập kho",
                f"Ghi nhận bất thường khi đối chiếu nhập {unit.barcode}: {anomaly}",
                center_id=cid,
            )
    db.commit()
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
    """Destination refuses the delivery. The unit goes to quarantine at the source, never back to ready."""
    if transfer.status not in _REJECTABLE:
        raise HTTPException(400, f"Không thể từ chối từ trạng thái {transfer.status.value}")
    _require_dest_actor(transfer, actor)

    unit = _locked_unit(db, transfer.blood_unit_id)
    prev = transfer.status
    cl = checklist or {}
    transfer.inbound_checklist = {
        "result": "rejected",
        "packaging_ok": cl.get("packaging_ok"),
        "label_ok": cl.get("label_ok"),
        "transport_condition_ok": cl.get("transport_condition_ok"),
        "anomaly_note": (cl.get("anomaly_note") or "").strip(),
        "recorded_at": _now().isoformat() + "Z",
    }
    transfer.cancel_reason = reason
    transfer.received_by = actor.id
    transfer.status = TransferStatus.rejected
    transfer.updated_at = _now()
    if unit:
        unit.center_id = transfer.source_center_id
        unit.status = BloodUnitStatus.quarantine
        unit.dss_status = "Quarantine — chờ kiểm tra lại tại nguồn"
        db.add(
            InventoryTransaction(
                unit_id=unit.id,
                type=TransactionType.in_,
                reason="return_quarantine",
                from_center_id=transfer.dest_center_id,
                to_center_id=transfer.source_center_id,
                blood_request_id=transfer.blood_request_id,
                transfer_id=transfer.id,
                actor_id=actor.id,
                note=f"Trả về nguồn, cách ly sau từ chối: {reason}",
            )
        )
    _event(db, transfer, actor, prev, TransferStatus.rejected, reason)
    _notify(
        db,
        transfer,
        actor,
        "Điều chuyển bị từ chối — đơn vị cách ly",
        f"Cơ sở đích từ chối nhận ({reason}). Đơn vị chuyển trạng thái cách ly tại nguồn, "
        "cần kiểm tra lại trước khi sử dụng hoặc hủy bỏ.",
        center_id=transfer.source_center_id,
    )
    db.commit()
    refresh_alerts_for_requests(db)
    db.refresh(transfer)
    return transfer


def cancel_transfer(db: Session, transfer: BloodTransfer, actor: User, reason: str) -> BloodTransfer:
    """Only before export. After export the destination must reject so the unit is quarantined."""
    if transfer.status not in _CANCELLABLE:
        raise HTTPException(
            400,
            "Chỉ hủy được trước khi xuất kho. Sau khi xuất, cơ sở đích dùng 'Từ chối' để đơn vị được cách ly.",
        )
    _require_source_actor(transfer, actor)

    unit = _locked_unit(db, transfer.blood_unit_id)
    prev = transfer.status
    transfer.cancel_reason = reason
    transfer.status = TransferStatus.cancelled
    transfer.updated_at = _now()
    if unit and unit.status == BloodUnitStatus.reserved:
        if unit.expires_at <= _now():
            unit.status = BloodUnitStatus.expired
            unit.dss_status = "Expired"
        else:
            unit.status = BloodUnitStatus.ready
            unit.dss_status = "Ready"
    _event(db, transfer, actor, prev, TransferStatus.cancelled, reason)
    _notify(
        db,
        transfer,
        actor,
        "Điều chuyển đã hủy",
        f"Điều chuyển {transfer.id[:8]}… đã hủy trước khi xuất kho: {reason}",
    )
    db.commit()
    db.refresh(transfer)
    return transfer


def _require_source_actor(transfer: BloodTransfer, actor: User) -> None:
    if actor.role == UserRole.admin:
        return
    if actor.role in (UserRole.staff_bank, UserRole.staff_hospital) and actor.center_id == transfer.source_center_id:
        return
    raise HTTPException(403, "Chỉ nhân viên cơ sở nguồn hoặc admin được thao tác bước này")


def _require_dest_actor(transfer: BloodTransfer, actor: User) -> None:
    if actor.role == UserRole.admin:
        return
    if actor.center_id and actor.center_id == transfer.dest_center_id:
        return
    raise HTTPException(403, "Chỉ nhân viên cơ sở đích hoặc admin được thao tác bước này")
