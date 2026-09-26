from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import load_settings, settings
from app.database import get_db
from app.deps import get_current_user, require_roles
from app.models import (
    Alert,
    AlertStatus,
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
    BloodUnitOut,
    CenterOut,
    CenterPatch,
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
    TokenResponse,
    TransactionCreate,
    TransferCancelBody,
    TransferConfirmBody,
    TransferCreate,
    TransferEventOut,
    TransferOut,
    TransferReceiveBody,
    TransferRejectBody,
    TransferTransitBody,
    UserCreate,
    UserOut,
    UserUpdate,
)
from app.security import create_access_token, hash_password, verify_password
from app.services.alerts import refresh_alerts_for_requests
from app.services.matching import inventory_count, run_matching, units_expiring_within
from app.services import transfers as transfer_svc

router = APIRouter()


def _transfer_out(t: BloodTransfer, db: Session) -> TransferOut:
    events = (
        db.query(TransferEvent)
        .filter(TransferEvent.transfer_id == t.id)
        .order_by(TransferEvent.created_at)
        .all()
    )
    return TransferOut(
        id=t.id,
        blood_request_id=t.blood_request_id,
        blood_unit_id=t.blood_unit_id,
        source_center_id=t.source_center_id,
        dest_center_id=t.dest_center_id,
        status=t.status,
        leadership_confirmed_by=t.leadership_confirmed_by,
        transport_checklist=t.transport_checklist or {},
        inbound_checklist=t.inbound_checklist or {},
        cancel_reason=t.cancel_reason or "",
        note=t.note or "",
        created_by=t.created_by,
        created_at=t.created_at,
        updated_at=t.updated_at,
        events=[TransferEventOut.model_validate(e) for e in events],
    )


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
        inv = inventory_count(db, req.blood_type, req.center_id)
        remaining = max(1, req.qty_needed - req.qty_fulfilled)
        coverages.append(inv / remaining if remaining else 1.0)
    cov_pct = round(100 * (sum(coverages) / len(coverages) if coverages else 0.8), 1)
    banner = critical[0].title if critical else None
    return DashboardSummary(
        active_alerts=len(alerts),
        critical_alerts=len(critical),
        warning_alerts=len(warning),
        network_coverage_pct=cov_pct,
        open_requests=open_reqs,
        transfers_today=transfers,
        units_expiring_48h=units_expiring_within(db, 48),
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
    for k, v in data.items():
        setattr(center, k, v)
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
    q = db.query(BloodUnit)
    if user.role == UserRole.staff_hospital and user.center_id and not center_id:
        q = q.filter(BloodUnit.center_id == user.center_id)
    if blood_type:
        q = q.filter(BloodUnit.blood_type == blood_type)
    if status:
        q = q.filter(BloodUnit.status == status)
    if center_id:
        q = q.filter(BloodUnit.center_id == center_id)
    if expiring_hours is not None:
        q = q.filter(BloodUnit.expires_at <= datetime.utcnow() + timedelta(hours=expiring_hours))
    return q.order_by(BloodUnit.expires_at).limit(500).all()


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

    unit = db.get(BloodUnit, body.unit_id)
    if not unit:
        raise HTTPException(404, "Unit not found")

    if body.blood_request_id:
        req = db.get(BloodRequest, body.blood_request_id)
        if not req:
            raise HTTPException(404, "Blood request not found")

    to_center = body.to_center_id
    tx = InventoryTransaction(
        unit_id=body.unit_id,
        type=body.type,
        from_center_id=body.from_center_id or unit.center_id,
        to_center_id=to_center,
        blood_request_id=body.blood_request_id,
        actor_id=user.id,
        note=body.note,
    )
    db.add(tx)

    if body.type == TransactionType.out:
        unit.status = BloodUnitStatus.used
        unit.dss_status = "Used"
    elif body.type == TransactionType.in_:
        unit.status = BloodUnitStatus.ready
        unit.dss_status = "Ready"
        if to_center:
            unit.center_id = to_center

    db.commit()
    db.refresh(unit)
    return unit


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
    t = db.get(BloodTransfer, transfer_id)
    if not t:
        raise HTTPException(404, "Transfer not found")
    return _transfer_out(t, db)


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
    t = db.get(BloodTransfer, transfer_id)
    if not t:
        raise HTTPException(404, "Transfer not found")
    t = transfer_svc.confirm_source(db, t, user, body.note)
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
    t = db.get(BloodTransfer, transfer_id)
    if not t:
        raise HTTPException(404, "Transfer not found")
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
    t = db.get(BloodTransfer, transfer_id)
    if not t:
        raise HTTPException(404, "Transfer not found")
    t = transfer_svc.start_transit(
        db,
        t,
        user,
        {
            "temperature_band": body.temperature_band,
            "ice_not_direct_contact": body.ice_not_direct_contact,
            "vehicle_ok": body.vehicle_ok,
        },
        body.note,
    )
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
    t = db.get(BloodTransfer, transfer_id)
    if not t:
        raise HTTPException(404, "Transfer not found")
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
    t = db.get(BloodTransfer, transfer_id)
    if not t:
        raise HTTPException(404, "Transfer not found")
    checklist = None
    if body.packaging_ok is not None or body.label_ok is not None:
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
    t = db.get(BloodTransfer, transfer_id)
    if not t:
        raise HTTPException(404, "Transfer not found")
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
    center_id = body.center_id
    facility_name = body.facility_name
    if user.role == UserRole.staff_hospital:
        center_id = user.center_id
        if center_id:
            c = db.get(DonationCenter, center_id)
            if c:
                facility_name = c.name
    code = f"REQ-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"
    req = BloodRequest(
        code=code,
        facility_name=facility_name,
        center_id=center_id,
        blood_type=body.blood_type,
        product_type=body.product_type,
        qty_needed=body.qty_needed,
        priority=body.priority,
        deadline=body.deadline,
        department=body.department,
        notes=body.notes,
        status=RequestStatus.open,
    )
    db.add(req)
    db.commit()
    refresh_alerts_for_requests(db)
    db.refresh(req)
    return req


@router.patch("/demands/{demand_id}", response_model=DemandOut)
def patch_demand(
    demand_id: str,
    body: DemandPatch,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles(UserRole.admin, UserRole.staff_hospital, UserRole.staff_bank)
    ),
):
    req = db.get(BloodRequest, demand_id)
    if not req:
        raise HTTPException(404, "Demand not found")
    if user.role == UserRole.staff_hospital and req.center_id != user.center_id:
        raise HTTPException(403, "Không có quyền sửa nhu cầu cơ sở khác")
    if body.status is not None:
        req.status = body.status
    if body.qty_fulfilled is not None:
        req.qty_fulfilled = body.qty_fulfilled
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
    db.commit()
    db.refresh(log)
    out_cands = [MatchingCandidate(**c) for c in candidates]
    return MatchingRunResponse(
        request_id=req.id, log_id=log.id, weights=weights, candidates=out_cands
    )


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
    units = db.query(BloodUnit).all()
    ready = [u for u in units if u.status in (BloodUnitStatus.ready, BloodUnitStatus.critical)]
    expired = [u for u in units if u.status == BloodUnitStatus.expired]
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
    u = User(
        email=body.email,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        role=body.role,
        center_id=body.center_id,
    )
    db.add(u)
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
