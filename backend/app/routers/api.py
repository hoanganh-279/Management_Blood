from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import load_settings, settings
from app.database import get_db
from app.deps import get_current_user, require_roles
from app.models import (
    BLOOD_TYPES,
    Alert,
    AlertStatus,
    AuditLog,
    BloodRequest,
    BloodTransfer,
    BloodUnit,
    BloodUnitStatus,
    DonationCenter,
    InventoryTransaction,
    MatchingLog,
    Notification,
    NotificationStatus,
    RequestStatus,
    TransactionType,
    TransferEvent,
    TransferStatus,
    User,
    UserRole,
)
from app.schemas import (
    AlertOut,
    AlertPatch,
    AuditLogOut,
    BloodUnitOut,
    CenterOut,
    CenterPatch,
    CoverageCell,
    CoverageResponse,
    DashboardSummary,
    DemandCreate,
    DemandOut,
    DemandPatch,
    GoogleAuthConfig,
    GoogleLoginRequest,
    LoginRequest,
    MatchingCandidate,
    MatchingLogOut,
    MatchingRunRequest,
    MatchingRunResponse,
    NotificationCreate,
    NotificationOut,
    QuarantineReviewBody,
    TokenResponse,
    TransactionCreate,
    TransferArriveBody,
    TransferCancelBody,
    TransferConfirmBody,
    TransferCreate,
    TransferEventOut,
    TransferOut,
    TransferReceiveBody,
    TransferRejectBody,
    TransferTransitBody,
    TransferUnitSummary,
    UnitInventoryEvent,
    UserCreate,
    UserOut,
    UserUpdate,
)
from app.security import create_access_token, hash_password, verify_password
from app.services import audit
from app.services import inventory as inventory_svc
from app.services import transfers as transfer_svc
from app.services.alerts import refresh_alerts_for_requests
from app.services.matching import (
    compute_coverage,
    eligible_units,
    inventory_count,
    run_matching,
    units_expiring_within,
)

router = APIRouter()


def _user_names(db: Session, ids: set[str | None]) -> dict[str, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {u.id: u.full_name for u in db.query(User).filter(User.id.in_(ids)).all()}


def _transfer_out(t: BloodTransfer, db: Session) -> TransferOut:
    events = (
        db.query(TransferEvent)
        .filter(TransferEvent.transfer_id == t.id)
        .order_by(TransferEvent.created_at)
        .all()
    )
    names = _user_names(
        db,
        {t.leadership_confirmed_by, t.handed_over_by, t.received_by, t.created_by}
        | {e.actor_id for e in events},
    )
    unit = db.get(BloodUnit, t.blood_unit_id)
    unit_summary = (
        TransferUnitSummary(
            id=unit.id,
            barcode=unit.barcode,
            blood_type=unit.blood_type,
            product_type=unit.product_type,
            expires_at=unit.expires_at,
            status=unit.status,
        )
        if unit
        else None
    )
    return TransferOut(
        id=t.id,
        blood_request_id=t.blood_request_id,
        blood_unit_id=t.blood_unit_id,
        source_center_id=t.source_center_id,
        dest_center_id=t.dest_center_id,
        status=t.status,
        leadership_confirmed_by=t.leadership_confirmed_by,
        leadership_confirmed_by_name=names.get(t.leadership_confirmed_by or ""),
        leadership_confirmed_at=t.leadership_confirmed_at,
        leadership_reason=t.leadership_reason or "",
        handed_over_by=t.handed_over_by,
        handed_over_by_name=names.get(t.handed_over_by or ""),
        carrier_name=t.carrier_name or "",
        arrived_at=t.arrived_at,
        received_by=t.received_by,
        received_by_name=names.get(t.received_by or ""),
        transport_checklist=t.transport_checklist or {},
        inbound_checklist=t.inbound_checklist or {},
        cancel_reason=t.cancel_reason or "",
        note=t.note or "",
        created_by=t.created_by,
        created_by_name=names.get(t.created_by or ""),
        created_at=t.created_at,
        updated_at=t.updated_at,
        unit=unit_summary,
        required_temperature_band=transfer_svc.transport_temp_hint(unit.product_type) if unit else None,
        events=[
            TransferEventOut(
                id=e.id,
                transfer_id=e.transfer_id,
                actor_id=e.actor_id,
                actor_name=names.get(e.actor_id or ""),
                from_status=e.from_status,
                to_status=e.to_status,
                note=e.note or "",
                created_at=e.created_at,
            )
            for e in events
        ],
    )


def _get_transfer_scoped(db: Session, transfer_id: str, user: User) -> BloodTransfer:
    t = db.get(BloodTransfer, transfer_id)
    if not t:
        raise HTTPException(404, "Không tìm thấy điều chuyển")
    if user.role != UserRole.admin and user.center_id not in (t.source_center_id, t.dest_center_id):
        raise HTTPException(403, "Không có quyền xem điều chuyển của cơ sở khác")
    return t


@router.post("/auth/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=401,
            detail="Sai thông tin đăng nhập. Vui lòng kiểm tra lại email hoặc mật khẩu.",
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Tài khoản đã bị khóa")
    token = create_access_token(user.id, {"role": user.role.value, "email": user.email})
    return TokenResponse(access_token=token)


@router.get("/auth/google/config", response_model=GoogleAuthConfig)
def google_auth_config():
    cfg = load_settings()
    client_id = (cfg.google_client_id or "").strip() or None
    return GoogleAuthConfig(enabled=bool(client_id), client_id=client_id)


@router.post("/auth/google", response_model=TokenResponse)
def login_google(body: GoogleLoginRequest, db: Session = Depends(get_db)):
    cfg = load_settings()
    client_id = (cfg.google_client_id or "").strip()
    if not client_id:
        raise HTTPException(status_code=503, detail="Đăng nhập Google chưa được cấu hình.")

    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token

        idinfo = google_id_token.verify_oauth2_token(
            body.id_token,
            google_requests.Request(),
            client_id,
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Token Google không hợp lệ hoặc đã hết hạn.") from None
    except Exception:
        raise HTTPException(status_code=401, detail="Không xác minh được đăng nhập Google.") from None

    email = (idinfo.get("email") or "").strip().lower()
    if not email or not idinfo.get("email_verified", True):
        raise HTTPException(status_code=401, detail="Tài khoản Google chưa xác minh email.")

    from sqlalchemy import func

    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user:
        raise HTTPException(
            status_code=403,
            detail="Email Google chưa được cấp quyền truy cập hệ thống. Liên hệ quản trị viên.",
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Tài khoản đã bị khóa")

    token = create_access_token(user.id, {"role": user.role.value, "email": user.email})
    return TokenResponse(access_token=token)


@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    inventory_svc.expire_overdue_units(db)
    refresh_alerts_for_requests(db)
    alerts = db.query(Alert).filter(Alert.status != AlertStatus.resolved).all()
    critical = [a for a in alerts if a.severity.value == "critical"]
    warning = [a for a in alerts if a.severity.value == "warning"]
    today0 = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    transfers = (
        db.query(BloodTransfer)
        .filter(
            BloodTransfer.status == TransferStatus.received,
            BloodTransfer.updated_at >= today0,
        )
        .count()
    )
    open_reqs = (
        db.query(BloodRequest)
        .filter(BloodRequest.status.in_([RequestStatus.open, RequestStatus.matching]))
        .count()
    )
    coverages = []
    for req in (
        db.query(BloodRequest)
        .filter(BloodRequest.status.in_([RequestStatus.open, RequestStatus.matching]))
        .all()
    ):
        inv = inventory_count(db, req.blood_type, req.center_id, req.product_type)
        remaining = max(1, req.qty_needed - req.qty_fulfilled)
        coverages.append(compute_coverage(inv, remaining))
    cov_pct = round(100 * (sum(coverages) / len(coverages) if coverages else 1.0), 1)
    banner = critical[0].title if critical else None
    return DashboardSummary(
        active_alerts=len(alerts),
        critical_alerts=len(critical),
        warning_alerts=len(warning),
        network_coverage_pct=cov_pct,
        open_requests=open_reqs,
        transfers_today=transfers,
        units_expiring_48h=units_expiring_within(db, 48),
        units_quarantine=db.query(BloodUnit).filter(BloodUnit.status == BloodUnitStatus.quarantine).count(),
        matching_runs=db.query(MatchingLog).count(),
        critical_banner=banner,
    )


@router.get("/centers", response_model=list[CenterOut])
def list_centers(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(DonationCenter).all()


@router.patch("/centers/{center_id}", response_model=CenterOut)
def patch_center(
    center_id: str,
    body: CenterPatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    center = db.get(DonationCenter, center_id)
    if not center:
        raise HTTPException(404, "Center not found")
    data = body.model_dump(exclude_unset=True)
    before = {k: getattr(center, k) for k in data}
    for k, v in data.items():
        setattr(center, k, v)
    audit.record(db, user, "center.update", "donation_center", center.id, {"before": before, "after": data})
    db.commit()
    db.refresh(center)
    return center


@router.get("/inventory/units", response_model=list[BloodUnitOut])
def list_units(
    blood_type: str | None = None,
    status: BloodUnitStatus | None = None,
    center_id: str | None = None,
    expiring_hours: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles(UserRole.admin, UserRole.staff_bank, UserRole.staff_hospital)
    ),
):
    inventory_svc.expire_overdue_units(db)
    q = db.query(BloodUnit)
    if user.role == UserRole.staff_hospital and user.center_id:
        if center_id and center_id != user.center_id:
            raise HTTPException(403, "Nhân viên BV chỉ xem tồn kho cơ sở mình")
        q = q.filter(BloodUnit.center_id == user.center_id)
    if blood_type:
        q = q.filter(BloodUnit.blood_type == blood_type)
    if status:
        q = q.filter(BloodUnit.status == status)
    if center_id:
        q = q.filter(BloodUnit.center_id == center_id)
    if expiring_hours is not None:
        q = q.filter(BloodUnit.expires_at <= datetime.utcnow() + timedelta(hours=expiring_hours))
    rows = q.order_by(BloodUnit.expires_at).limit(500).all()
    audit.record(
        db,
        user,
        "inventory.view",
        "blood_unit",
        None,
        {
            "center_id": center_id,
            "blood_type": blood_type,
            "status": status.value if status else None,
            "rows": len(rows),
        },
        commit=True,
    )
    return rows


@router.get("/inventory/units/{unit_id}/history", response_model=list[UnitInventoryEvent])
def unit_history(
    unit_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    unit = db.get(BloodUnit, unit_id)
    if not unit:
        raise HTTPException(404, "Không tìm thấy đơn vị máu")
    txs = (
        db.query(InventoryTransaction)
        .filter(InventoryTransaction.unit_id == unit_id)
        .order_by(InventoryTransaction.created_at)
        .all()
    )
    if user.role == UserRole.staff_hospital and user.center_id != unit.center_id and not any(
        user.center_id in (t.from_center_id, t.to_center_id) for t in txs
    ):
        raise HTTPException(403, "Không có quyền xem lịch sử đơn vị này")
    names = _user_names(db, {t.actor_id for t in txs})
    return [
        UnitInventoryEvent(
            id=t.id,
            type=t.type.value,
            reason=t.reason or "",
            from_center_id=t.from_center_id,
            to_center_id=t.to_center_id,
            transfer_id=t.transfer_id,
            actor_name=names.get(t.actor_id or ""),
            note=t.note or "",
            created_at=t.created_at,
        )
        for t in txs
    ]


@router.get("/inventory/coverage", response_model=CoverageResponse)
def inventory_coverage(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Coverage per facility × blood group (Product §5.2) with configured thresholds."""
    inventory_svc.expire_overdue_units(db)
    centers = db.query(DonationCenter).all()
    if user.role == UserRole.staff_hospital and user.center_id:
        centers = [c for c in centers if c.id == user.center_id]
    open_reqs = (
        db.query(BloodRequest)
        .filter(BloodRequest.status.in_([RequestStatus.open, RequestStatus.matching]))
        .all()
    )
    cells: list[CoverageCell] = []
    for c in centers:
        for bt in BLOOD_TYPES:
            available = inventory_count(db, bt, c.id)
            demand = sum(
                max(0, r.qty_needed - r.qty_fulfilled)
                for r in open_reqs
                if r.center_id == c.id and r.blood_type == bt
            )
            if demand <= 0:
                cells.append(
                    CoverageCell(
                        center_id=c.id, blood_type=bt, available=available,
                        open_demand=0, coverage=None, level="no_demand",
                    )
                )
                continue
            cov = compute_coverage(available, demand)
            level = (
                "critical" if cov < settings.coverage_critical
                else "warning" if cov < settings.coverage_warn
                else "ok"
            )
            cells.append(
                CoverageCell(
                    center_id=c.id, blood_type=bt, available=available,
                    open_demand=demand, coverage=round(cov, 3), level=level,
                )
            )
    return CoverageResponse(
        cells=cells,
        coverage_warn=settings.coverage_warn,
        coverage_critical=settings.coverage_critical,
    )


@router.post("/inventory/transactions", response_model=BloodUnitOut)
def create_transaction(
    body: TransactionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin, UserRole.staff_bank)),
):
    if body.type == TransactionType.transfer:
        raise HTTPException(
            400,
            "Atomic transfer đã ngừng hỗ trợ. Dùng POST /transfers (lifecycle TT26-min).",
        )
    if body.type == TransactionType.in_:
        if body.unit_id:
            raise HTTPException(
                400,
                "Nhập kho chỉ dành cho đơn vị MỚI. Đơn vị đã có trong hệ thống chỉ vào kho qua "
                "điều chuyển (đối chiếu nhập) hoặc xét duyệt cách ly.",
            )
        return inventory_svc.receive_new_unit(db, user, body.model_dump())
    if not body.unit_id or not body.reason:
        raise HTTPException(400, "Xuất kho cần unit_id và lý do (issued | discarded | expired)")
    return inventory_svc.issue_out(db, user, body.unit_id, body.reason, body.note)


@router.post("/inventory/units/{unit_id}/quarantine-review", response_model=BloodUnitOut)
def quarantine_review(
    unit_id: str,
    body: QuarantineReviewBody,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles(UserRole.admin, UserRole.staff_bank, UserRole.staff_hospital)
    ),
):
    return inventory_svc.review_quarantine(db, user, unit_id, body.decision, body.reason)


@router.get("/transfers", response_model=list[TransferOut])
def list_transfers(
    status: TransferStatus | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(BloodTransfer)
    if user.role == UserRole.staff_hospital and user.center_id:
        q = q.filter(
            (BloodTransfer.dest_center_id == user.center_id)
            | (BloodTransfer.source_center_id == user.center_id)
        )
    elif user.role == UserRole.staff_bank and user.center_id:
        q = q.filter(
            (BloodTransfer.source_center_id == user.center_id)
            | (BloodTransfer.dest_center_id == user.center_id)
        )
    if status:
        q = q.filter(BloodTransfer.status == status)
    rows = q.order_by(BloodTransfer.created_at.desc()).limit(200).all()
    return [_transfer_out(t, db) for t in rows]


@router.get("/transfers/{transfer_id}", response_model=TransferOut)
def get_transfer(
    transfer_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _transfer_out(_get_transfer_scoped(db, transfer_id, user), db)


@router.post("/transfers", response_model=TransferOut)
def create_transfer(
    body: TransferCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin, UserRole.staff_bank)),
):
    t = transfer_svc.propose_transfer(
        db,
        actor=user,
        unit_id=body.unit_id,
        source_center_id=body.source_center_id,
        dest_center_id=body.dest_center_id,
        blood_request_id=body.blood_request_id,
        note=body.note,
        leadership_confirm=body.leadership_confirm,
        leadership_reason=body.leadership_reason,
    )
    return _transfer_out(t, db)


@router.post("/transfers/{transfer_id}/confirm", response_model=TransferOut)
def confirm_transfer(
    transfer_id: str,
    body: TransferConfirmBody,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles(UserRole.admin, UserRole.staff_bank, UserRole.staff_hospital)
    ),
):
    t = _get_transfer_scoped(db, transfer_id, user)
    t = transfer_svc.confirm_source(
        db, t, user, body.note, body.leadership_confirm, body.leadership_reason
    )
    return _transfer_out(t, db)


@router.post("/transfers/{transfer_id}/export", response_model=TransferOut)
def export_transfer(
    transfer_id: str,
    body: TransferConfirmBody,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles(UserRole.admin, UserRole.staff_bank, UserRole.staff_hospital)
    ),
):
    t = _get_transfer_scoped(db, transfer_id, user)
    t = transfer_svc.export_transfer(db, t, user, body.note)
    return _transfer_out(t, db)


@router.post("/transfers/{transfer_id}/transit", response_model=TransferOut)
def transit_transfer(
    transfer_id: str,
    body: TransferTransitBody,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles(UserRole.admin, UserRole.staff_bank, UserRole.staff_hospital)
    ),
):
    t = _get_transfer_scoped(db, transfer_id, user)
    t = transfer_svc.start_transit(
        db,
        t,
        user,
        {
            "temperature_band": body.temperature_band,
            "ice_not_direct_contact": body.ice_not_direct_contact,
            "vehicle_ok": body.vehicle_ok,
            "carrier_name": body.carrier_name,
            "measured_temp_c": body.measured_temp_c,
        },
        body.note,
    )
    return _transfer_out(t, db)


@router.post("/transfers/{transfer_id}/arrive", response_model=TransferOut)
def arrive_transfer(
    transfer_id: str,
    body: TransferArriveBody,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles(UserRole.admin, UserRole.staff_hospital, UserRole.staff_bank)
    ),
):
    t = _get_transfer_scoped(db, transfer_id, user)
    t = transfer_svc.mark_arrived(db, t, user, body.note)
    return _transfer_out(t, db)


@router.post("/transfers/{transfer_id}/receive", response_model=TransferOut)
def receive_transfer(
    transfer_id: str,
    body: TransferReceiveBody,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles(UserRole.admin, UserRole.staff_hospital, UserRole.staff_bank)
    ),
):
    t = _get_transfer_scoped(db, transfer_id, user)
    t = transfer_svc.receive_transfer(
        db,
        t,
        user,
        {
            "packaging_ok": body.packaging_ok,
            "label_ok": body.label_ok,
            "transport_condition_ok": body.transport_condition_ok,
            "anomaly_note": body.anomaly_note,
        },
        body.note,
    )
    return _transfer_out(t, db)


@router.post("/transfers/{transfer_id}/reject", response_model=TransferOut)
def reject_transfer(
    transfer_id: str,
    body: TransferRejectBody,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles(UserRole.admin, UserRole.staff_hospital, UserRole.staff_bank)
    ),
):
    t = _get_transfer_scoped(db, transfer_id, user)
    checklist = {
        "packaging_ok": body.packaging_ok,
        "label_ok": body.label_ok,
        "transport_condition_ok": body.transport_condition_ok,
        "anomaly_note": body.anomaly_note,
    }
    t = transfer_svc.reject_transfer(db, t, user, body.reason, checklist)
    return _transfer_out(t, db)


@router.post("/transfers/{transfer_id}/cancel", response_model=TransferOut)
def cancel_transfer(
    transfer_id: str,
    body: TransferCancelBody,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles(UserRole.admin, UserRole.staff_bank, UserRole.staff_hospital)
    ),
):
    t = _get_transfer_scoped(db, transfer_id, user)
    t = transfer_svc.cancel_transfer(db, t, user, body.reason)
    return _transfer_out(t, db)


@router.get("/demands", response_model=list[DemandOut])
def list_demands(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(BloodRequest)
    if user.role == UserRole.staff_hospital and user.center_id:
        q = q.filter(BloodRequest.center_id == user.center_id)
    return q.order_by(BloodRequest.deadline).all()


@router.post("/demands", response_model=DemandOut)
def create_demand(
    body: DemandCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin, UserRole.staff_hospital)),
):
    center_id = user.center_id if user.role == UserRole.staff_hospital else body.center_id
    if not center_id:
        raise HTTPException(400, "Nhu cầu phải gắn cơ sở nhận")
    center = db.get(DonationCenter, center_id)
    if not center:
        raise HTTPException(404, "Không tìm thấy cơ sở")
    deadline = body.deadline.replace(tzinfo=None)
    if deadline <= datetime.utcnow():
        raise HTTPException(400, "Hạn cần máu phải ở tương lai")
    facility_name = center.name
    code = f"REQ-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"
    req = BloodRequest(
        code=code,
        facility_name=facility_name,
        center_id=center_id,
        blood_type=body.blood_type,
        product_type=body.product_type,
        qty_needed=body.qty_needed,
        priority=body.priority,
        deadline=deadline,
        department=body.department,
        notes=body.notes,
        status=RequestStatus.open,
        created_by=user.id,
    )
    db.add(req)
    db.flush()
    audit.record(
        db, user, "demand.create", "blood_request", req.id,
        {"blood_type": req.blood_type, "product_type": req.product_type, "qty": req.qty_needed},
    )
    db.commit()
    refresh_alerts_for_requests(db)
    db.refresh(req)
    return req


@router.patch("/demands/{demand_id}", response_model=DemandOut)
def patch_demand(
    demand_id: str,
    body: DemandPatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin, UserRole.staff_hospital)),
):
    """Cancel only. qty_fulfilled / fulfilled status change exclusively on a received transfer."""
    req = db.get(BloodRequest, demand_id)
    if not req:
        raise HTTPException(404, "Demand not found")
    if user.role == UserRole.staff_hospital and req.center_id != user.center_id:
        raise HTTPException(403, "Không có quyền sửa nhu cầu cơ sở khác")
    if req.status not in (RequestStatus.open, RequestStatus.matching):
        raise HTTPException(400, "Nhu cầu đã đóng")
    open_transfers = (
        db.query(BloodTransfer)
        .filter(
            BloodTransfer.blood_request_id == req.id,
            BloodTransfer.status.in_(transfer_svc.OPEN_STATUSES),
        )
        .count()
    )
    if open_transfers:
        raise HTTPException(
            400,
            f"Còn {open_transfers} điều chuyển đang mở cho nhu cầu này — hủy/từ chối các điều chuyển trước",
        )
    req.status = RequestStatus.cancelled
    req.cancel_reason = body.cancel_reason.strip()
    audit.record(db, user, "demand.cancel", "blood_request", req.id, {"reason": req.cancel_reason})
    db.commit()
    refresh_alerts_for_requests(db)
    db.refresh(req)
    return req


@router.get("/alerts", response_model=list[AlertOut])
def list_alerts(
    severity: str | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    refresh_alerts_for_requests(db)
    q = db.query(Alert).filter(Alert.status != AlertStatus.resolved)
    if user.role == UserRole.staff_hospital and user.center_id:
        q = q.filter(Alert.center_id == user.center_id)
    if severity:
        q = q.filter(Alert.severity == severity)
    return q.order_by(Alert.created_at.desc()).all()


@router.patch("/alerts/{alert_id}", response_model=AlertOut)
def patch_alert(
    alert_id: str,
    body: AlertPatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin, UserRole.staff_bank)),
):
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(404, "Alert not found")
    alert.status = body.status
    db.commit()
    db.refresh(alert)
    return alert


@router.post("/matching/run", response_model=MatchingRunResponse)
def matching_run(
    body: MatchingRunRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    req = db.get(BloodRequest, body.request_id)
    if not req:
        raise HTTPException(404, "Request not found")
    if req.status not in (RequestStatus.open, RequestStatus.matching):
        raise HTTPException(400, "Nhu cầu đã đóng — không chạy matching")
    inventory_svc.expire_overdue_units(db)
    center = db.get(DonationCenter, req.center_id) if req.center_id else None
    lat = center.lat if center else 21.0285
    lng = center.lng if center else 105.8542
    top_k = body.top_k or settings.matching_top_k
    candidates, weights = run_matching(db, req, lat, lng, top_k, body.radius_km)
    log = MatchingLog(
        request_id=req.id,
        actor_id=user.id,
        weights=weights,
        candidates=candidates,
        top_k=top_k,
        radius_km=body.radius_km,
    )
    db.add(log)
    if req.status == RequestStatus.open:
        req.status = RequestStatus.matching
    db.flush()
    audit.record(
        db, user, "matching.run", "blood_request", req.id,
        {"log_id": log.id, "top_k": top_k, "radius_km": body.radius_km, "candidates": len(candidates)},
    )
    db.commit()
    db.refresh(log)
    out_cands = [MatchingCandidate(**c) for c in candidates]
    return MatchingRunResponse(
        request_id=req.id,
        log_id=log.id,
        weights=weights,
        component_max={k: round(v * 100, 1) for k, v in weights.items()},
        candidates=out_cands,
    )


@router.get("/matching/units", response_model=list[BloodUnitOut])
def matching_units(
    request_id: str,
    center_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin, UserRole.staff_bank)),
):
    """Units at a source eligible for a demand: exact ABO/Rh + product, not expired, not in an open transfer."""
    req = db.get(BloodRequest, request_id)
    if not req:
        raise HTTPException(404, "Request not found")
    if user.role == UserRole.staff_bank and user.center_id != center_id:
        raise HTTPException(403, "Chỉ xem đơn vị của cơ sở mình")
    return eligible_units(db, req, center_id)


@router.get("/matching/logs", response_model=list[MatchingLogOut])
def matching_logs(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin, UserRole.staff_bank)),
):
    return db.query(MatchingLog).order_by(MatchingLog.created_at.desc()).limit(50).all()


@router.get("/notifications", response_model=list[NotificationOut])
def list_notifications(
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles(UserRole.admin, UserRole.staff_hospital, UserRole.staff_bank)
    ),
):
    q = db.query(Notification)
    if user.role == UserRole.staff_hospital and user.center_id:
        q = q.filter(
            (Notification.center_id == user.center_id) | (Notification.user_id == user.id)
        )
    return q.order_by(Notification.created_at.desc()).limit(100).all()


@router.post("/notifications", response_model=NotificationOut)
def create_notification(
    body: NotificationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin, UserRole.staff_bank)),
):
    n = Notification(
        user_id=body.user_id,
        center_id=body.center_id,
        request_id=body.request_id,
        channel=body.channel,
        template=body.template,
        body=body.body,
        status=NotificationStatus.sent,
        created_by=user.id,
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return n


@router.get("/reports/kpis")
def reports_kpis(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    inventory_svc.expire_overdue_units(db)
    audit.record(db, user, "report.view", "reports", "kpis", {}, commit=True)
    units = db.query(BloodUnit).all()
    ready = [u for u in units if u.status in (BloodUnitStatus.ready, BloodUnitStatus.critical)]
    expired = [u for u in units if u.status in (BloodUnitStatus.expired, BloodUnitStatus.discarded)]
    demands = db.query(BloodRequest).all()
    total_demand = sum(d.qty_needed for d in demands)
    fulfilled = sum(d.qty_fulfilled for d in demands)
    transfers = (
        db.query(BloodTransfer).filter(BloodTransfer.status == TransferStatus.received).count()
    )
    logs = db.query(MatchingLog).all()
    return {
        "inventory_available": len(ready),
        "inventory_target_pct": round(100 * len(ready) / max(1, 200), 1),
        "wastage_rate_pct": round(100 * len(expired) / max(1, len(units)), 2),
        "near_expiry_48h": units_expiring_within(db, 48),
        "total_demand": total_demand,
        "fulfilled_supply": fulfilled,
        "net_deficit": fulfilled - total_demand,
        "transfers_total": transfers,
        "open_requests": sum(
            1 for d in demands if d.status in (RequestStatus.open, RequestStatus.matching)
        ),
        "fulfilled_requests": sum(1 for d in demands if d.status == RequestStatus.fulfilled),
        "matching_runs": len(logs),
        "precision_at_3_pct": 88.5,
        "precision_at_5_pct": 81.2,
        "by_blood_type": {
            bt: inventory_count(db, bt)
            for bt in ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"]
        },
        "note": "Một số KPI Precision@K là giá trị minh họa prototype khi chưa đủ log phản hồi.",
    }


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), user: User = Depends(require_roles(UserRole.admin))):
    return db.query(User).order_by(User.full_name).all()


@router.post("/users", response_model=UserOut)
def create_user(
    body: UserCreate, db: Session = Depends(get_db), user: User = Depends(require_roles(UserRole.admin))
):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(400, "Email already exists")
    if body.role != UserRole.admin:
        if not body.center_id or not db.get(DonationCenter, body.center_id):
            raise HTTPException(400, "Nhân viên bệnh viện / ngân hàng máu phải gắn với một cơ sở hợp lệ")
    u = User(
        email=body.email,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        role=body.role,
        center_id=body.center_id,
    )
    db.add(u)
    db.flush()
    audit.record(
        db, user, "user.create", "user", u.id,
        {"email": u.email, "role": u.role.value, "center_id": u.center_id},
    )
    db.commit()
    db.refresh(u)
    return u


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: str,
    body: UserUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if u.id == user.id and (body.is_active is False or (body.role and body.role != UserRole.admin)):
        raise HTTPException(400, "Không thể tự khóa hoặc tự hạ quyền tài khoản đang đăng nhập")
    changes = body.model_dump(exclude_unset=True, exclude={"password"})
    if body.password:
        changes["password_changed"] = True
    audit.record(db, user, "user.update", "user", u.id, changes)
    if body.full_name is not None:
        u.full_name = body.full_name
    if body.role is not None:
        u.role = body.role
    if body.center_id is not None:
        u.center_id = body.center_id
    if body.is_active is not None:
        u.is_active = body.is_active
    if body.password:
        u.hashed_password = hash_password(body.password)
    db.commit()
    db.refresh(u)
    return u


@router.get("/audit-logs", response_model=list[AuditLogOut])
def list_audit_logs(
    action: str | None = None,
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action == action)
    rows = q.order_by(AuditLog.created_at.desc()).limit(limit).all()
    names = _user_names(db, {r.actor_id for r in rows})
    return [
        AuditLogOut(
            id=r.id,
            actor_id=r.actor_id,
            actor_name=names.get(r.actor_id or ""),
            action=r.action,
            entity=r.entity or "",
            entity_id=r.entity_id,
            details=r.details or {},
            created_at=r.created_at,
        )
        for r in rows
    ]
