from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import (
    BLOOD_TYPES,
    PRODUCT_TYPES,
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


def _check_blood_type(v: str) -> str:
    v = (v or "").strip().upper()
    if v not in BLOOD_TYPES:
        raise ValueError(f"Nhóm máu không hợp lệ (cho phép: {', '.join(BLOOD_TYPES)})")
    return v


def _check_product_type(v: str) -> str:
    v = (v or "").strip().upper()
    if v not in PRODUCT_TYPES:
        raise ValueError(f"Loại chế phẩm không hợp lệ (cho phép: {', '.join(PRODUCT_TYPES)})")
    return v


OutReason = Literal["issued", "discarded", "expired"]


class TransactionCreate(BaseModel):
    """`in` = receipt of a NEW unit at the actor's facility; `out` = issue/discard/expire a ready unit.

    Movement between facilities is only possible through /transfers.
    """

    type: TransactionType
    # out
    unit_id: str | None = None
    reason: OutReason | None = None
    # in (new unit)
    barcode: str | None = None
    blood_type: str | None = None
    product_type: str | None = None
    volume_ml: int | None = Field(default=None, gt=0, le=1000)
    collected_at: datetime | None = None
    expires_at: datetime | None = None
    location_label: str = ""
    center_id: str | None = None
    note: str = ""


class UnitInventoryEvent(BaseModel):
    id: str
    type: str
    reason: str
    from_center_id: str | None
    to_center_id: str | None
    transfer_id: str | None
    actor_name: str | None = None
    note: str
    created_at: datetime


class QuarantineReviewBody(BaseModel):
    decision: Literal["release", "discard"]
    reason: str = Field(min_length=3)


class TransferCreate(BaseModel):
    unit_id: str
    source_center_id: str | None = None
    dest_center_id: str | None = None
    blood_request_id: str = Field(min_length=1)
    note: str = ""
    leadership_confirm: bool = False
    leadership_reason: str = ""


class TransferTransitBody(BaseModel):
    temperature_band: str
    ice_not_direct_contact: bool = False
    vehicle_ok: bool = False
    carrier_name: str = Field(min_length=2, max_length=200)
    measured_temp_c: float | None = Field(default=None, ge=-60, le=60)
    note: str = ""


class TransferArriveBody(BaseModel):
    note: str = ""


class TransferReceiveBody(BaseModel):
    packaging_ok: bool = False
    label_ok: bool = False
    transport_condition_ok: bool = False
    anomaly_note: str = ""
    note: str = ""


class TransferRejectBody(BaseModel):
    reason: str = Field(min_length=3)
    packaging_ok: bool | None = None
    label_ok: bool | None = None
    transport_condition_ok: bool | None = None
    anomaly_note: str = ""


class TransferCancelBody(BaseModel):
    reason: str = Field(min_length=3)


class TransferConfirmBody(BaseModel):
    note: str = ""
    leadership_confirm: bool = False
    leadership_reason: str = ""


class TransferEventOut(BaseModel):
    id: str
    transfer_id: str
    actor_id: str | None
    actor_name: str | None = None
    from_status: str | None
    to_status: str
    note: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TransferUnitSummary(BaseModel):
    id: str
    barcode: str
    blood_type: str
    product_type: str
    expires_at: datetime
    status: BloodUnitStatus


class TransferOut(BaseModel):
    id: str
    blood_request_id: str | None
    blood_unit_id: str
    source_center_id: str
    dest_center_id: str
    status: TransferStatus
    leadership_confirmed_by: str | None
    leadership_confirmed_by_name: str | None = None
    leadership_confirmed_at: datetime | None = None
    leadership_reason: str = ""
    handed_over_by: str | None = None
    handed_over_by_name: str | None = None
    carrier_name: str = ""
    arrived_at: datetime | None = None
    received_by: str | None = None
    received_by_name: str | None = None
    transport_checklist: dict[str, Any]
    inbound_checklist: dict[str, Any]
    cancel_reason: str
    note: str
    created_by: str | None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime
    unit: TransferUnitSummary | None = None
    required_temperature_band: str | None = None
    events: list[TransferEventOut] = []
    disclaimer: str = (
        "DSS hỗ trợ quyết định điều phối — không thay thẩm quyền chuyên môn hay pháp lý."
    )

    model_config = {"from_attributes": True}


class DemandCreate(BaseModel):
    facility_name: str = ""
    center_id: str | None = None
    blood_type: str
    product_type: str = "PRBC"
    qty_needed: int = Field(gt=0, le=500)
    priority: RequestPriority = RequestPriority.urgent
    deadline: datetime
    department: str = ""
    notes: str = ""

    _bt = field_validator("blood_type")(_check_blood_type)
    _pt = field_validator("product_type")(_check_product_type)


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
    cancel_reason: str = ""
    created_at: datetime

    model_config = {"from_attributes": True}


class DemandPatch(BaseModel):
    """Only cancellation is allowed; qty_fulfilled changes exclusively via received transfers."""

    status: Literal["cancelled"]
    cancel_reason: str = Field(min_length=3)


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
    component_max: dict[str, float] = {}
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
    units_quarantine: int = 0
    matching_runs: int
    critical_banner: str | None = None


class CoverageCell(BaseModel):
    center_id: str
    blood_type: str
    available: int
    open_demand: int
    coverage: float | None
    level: Literal["critical", "warning", "ok", "no_demand"]


class CoverageResponse(BaseModel):
    cells: list[CoverageCell]
    coverage_warn: float
    coverage_critical: float
    note: str = (
        "Coverage = Tồn khả dụng / Nhu cầu mở còn lại (Product §5.2). "
        "Ngưỡng là cấu hình prototype — không phải ngưỡng y tế."
    )


class AuditLogOut(BaseModel):
    id: str
    actor_id: str | None
    actor_name: str | None = None
    action: str
    entity: str
    entity_id: str | None
    details: dict[str, Any]
    created_at: datetime
