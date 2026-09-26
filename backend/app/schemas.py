from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field

from app.models import (
    AlertSeverity,
    AlertStatus,
    BloodUnitStatus,
    NotificationStatus,
    RequestPriority,
    RequestStatus,
    TransactionType,
    TransferStatus,
    UserRole,
)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleLoginRequest(BaseModel):
    id_token: str = Field(min_length=20)


class GoogleAuthConfig(BaseModel):
    enabled: bool
    client_id: str | None = None


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: UserRole
    center_id: str | None
    is_active: bool

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str = Field(min_length=6)
    role: UserRole
    center_id: str | None = None


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: UserRole | None = None
    center_id: str | None = None
    is_active: bool | None = None
    password: str | None = None


class CenterOut(BaseModel):
    id: str
    name: str
    address: str
    lat: float
    lng: float
    capacity: int
    hours: str
    facility_type: str
    transfer_success_rate: float = 0.85
    allowed_to_supply_others: bool = False
    has_supply_contract: bool = False

    model_config = {"from_attributes": True}


class CenterPatch(BaseModel):
    allowed_to_supply_others: bool | None = None
    has_supply_contract: bool | None = None
    transfer_success_rate: float | None = None
    name: str | None = None
    address: str | None = None
    hours: str | None = None
    capacity: int | None = None


class BloodUnitOut(BaseModel):
    id: str
    barcode: str
    blood_type: str
    product_type: str
    volume_ml: int
    collected_at: datetime
    expires_at: datetime
    status: BloodUnitStatus
    center_id: str
    location_label: str
    dss_status: str

    model_config = {"from_attributes": True}


class TransactionCreate(BaseModel):
    unit_id: str
    type: TransactionType
    from_center_id: str | None = None
    to_center_id: str | None = None
    blood_request_id: str | None = None
    note: str = ""


class TransferCreate(BaseModel):
    unit_id: str
    source_center_id: str | None = None
    dest_center_id: str | None = None
    blood_request_id: str | None = None
    note: str = ""
    leadership_confirm: bool = False


class TransferTransitBody(BaseModel):
    temperature_band: str | None = None
    ice_not_direct_contact: bool = False
    vehicle_ok: bool = False
    note: str = ""


class TransferReceiveBody(BaseModel):
    packaging_ok: bool = False
    label_ok: bool = False
    transport_condition_ok: bool = False
    anomaly_note: str = ""
    note: str = ""


class TransferRejectBody(BaseModel):
    reason: str = Field(min_length=1)
    packaging_ok: bool | None = None
    label_ok: bool | None = None
    transport_condition_ok: bool | None = None
    anomaly_note: str = ""


class TransferCancelBody(BaseModel):
    reason: str = Field(min_length=1)


class TransferConfirmBody(BaseModel):
    note: str = ""


class TransferEventOut(BaseModel):
    id: str
    transfer_id: str
    actor_id: str | None
    from_status: str | None
    to_status: str
    note: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TransferOut(BaseModel):
    id: str
    blood_request_id: str | None
    blood_unit_id: str
    source_center_id: str
    dest_center_id: str
    status: TransferStatus
    leadership_confirmed_by: str | None
    transport_checklist: dict[str, Any]
    inbound_checklist: dict[str, Any]
    cancel_reason: str
    note: str
    created_by: str | None
    created_at: datetime
    updated_at: datetime
    events: list[TransferEventOut] = []
    disclaimer: str = (
        "DSS hỗ trợ quyết định điều phối — không thay thẩm quyền chuyên môn hay pháp lý."
    )

    model_config = {"from_attributes": True}


class DemandCreate(BaseModel):
    facility_name: str
    center_id: str | None = None
    blood_type: str
    product_type: str = "PRBC"
    qty_needed: int
    priority: RequestPriority = RequestPriority.urgent
    deadline: datetime
    department: str = ""
    notes: str = ""


class DemandOut(BaseModel):
    id: str
    code: str
    facility_name: str
    center_id: str | None
    blood_type: str
    product_type: str
    qty_needed: int
    qty_fulfilled: int
    priority: RequestPriority
    deadline: datetime
    status: RequestStatus
    department: str
    notes: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DemandPatch(BaseModel):
    status: RequestStatus | None = None
    qty_fulfilled: int | None = None


class AlertOut(BaseModel):
    id: str
    code: str
    type: str
    severity: AlertSeverity
    title: str
    blood_type: str
    center_id: str | None
    request_id: str | None
    metrics: dict[str, Any]
    status: AlertStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class AlertPatch(BaseModel):
    status: AlertStatus


class MatchingRunRequest(BaseModel):
    request_id: str
    top_k: int | None = None
    radius_km: float = 30.0


class MatchingCandidate(BaseModel):
    rank: int
    center_id: str
    center_name: str
    facility_type: str
    distance_km: float
    score: float
    components: dict[str, float]
    available_units: int
    transfer_success_rate: float = 0.0


class MatchingRunResponse(BaseModel):
    request_id: str
    log_id: str
    weights: dict[str, float]
    candidates: list[MatchingCandidate]
    disclaimer: str = (
        "Kết quả DSS (facility matching) chỉ hỗ trợ quyết định vận hành, "
        "không thay thế chuyên môn y tế hay thẩm quyền pháp lý."
    )


class MatchingLogOut(BaseModel):
    id: str
    request_id: str
    actor_id: str | None
    weights: dict[str, Any]
    candidates: list[Any]
    top_k: int
    radius_km: float
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationCreate(BaseModel):
    user_id: str | None = None
    center_id: str | None = None
    request_id: str | None = None
    channel: str = "in_app"
    template: str = "Điều phối nội bộ"
    body: str


class NotificationOut(BaseModel):
    id: str
    user_id: str | None
    center_id: str | None
    request_id: str | None
    channel: str
    template: str
    body: str
    status: NotificationStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class DashboardSummary(BaseModel):
    active_alerts: int
    critical_alerts: int
    warning_alerts: int
    network_coverage_pct: float
    open_requests: int
    transfers_today: int
    units_expiring_48h: int
    matching_runs: int
    critical_banner: str | None = None
