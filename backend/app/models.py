import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    JSON,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class UserRole(str, enum.Enum):
    staff_hospital = "staff_hospital"
    staff_bank = "staff_bank"
    admin = "admin"


class BloodUnitStatus(str, enum.Enum):
    ready = "ready"
    reserved = "reserved"
    transferred = "transferred"
    used = "used"
    expired = "expired"
    critical = "critical"
    quarantine = "quarantine"
    discarded = "discarded"


AVAILABLE_UNIT_STATUSES = (BloodUnitStatus.ready, BloodUnitStatus.critical)

BLOOD_TYPES = ("O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+")
PRODUCT_TYPES = ("PRBC", "WB", "PLT", "WBC", "FFP", "CRYO")


class TransactionType(str, enum.Enum):
    in_ = "in"
    out = "out"
    transfer = "transfer"  # legacy; blocked on API — use BloodTransfer lifecycle


class TransferStatus(str, enum.Enum):
    proposed = "proposed"
    source_confirmed = "source_confirmed"
    exported = "exported"
    in_transit = "in_transit"
    inbound_pending = "inbound_pending"
    received = "received"
    rejected = "rejected"
    cancelled = "cancelled"


class RequestPriority(str, enum.Enum):
    normal = "normal"
    urgent = "urgent"
    flash = "flash"


class RequestStatus(str, enum.Enum):
    open = "open"
    matching = "matching"
    fulfilled = "fulfilled"
    cancelled = "cancelled"


class AlertSeverity(str, enum.Enum):
    info = "info"
    warning = "warning"
    critical = "critical"


class AlertStatus(str, enum.Enum):
    open = "open"
    processing = "processing"
    resolved = "resolved"


class NotificationStatus(str, enum.Enum):
    draft = "draft"
    sent = "sent"
    read = "read"
    failed = "failed"


class DonationCenter(Base):
    __tablename__ = "donation_centers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    address: Mapped[str] = mapped_column(String(300), default="")
    lat: Mapped[float] = mapped_column(Float, default=21.0285)
    lng: Mapped[float] = mapped_column(Float, default=105.8542)
    capacity: Mapped[int] = mapped_column(Integer, default=50)
    hours: Mapped[str] = mapped_column(String(100), default="07:30-17:00")
    facility_type: Mapped[str] = mapped_column(String(50), default="hospital")  # hospital|bank
    transfer_success_rate: Mapped[float] = mapped_column(Float, default=0.85)
    # Config flags (TT 26 Điều 39.1 spirit) — not a licensing workflow simulator
    allowed_to_supply_others: Mapped[bool] = mapped_column(Boolean, default=False)
    has_supply_contract: Mapped[bool] = mapped_column(Boolean, default=False)

    users: Mapped[list["User"]] = relationship(back_populates="center")
    blood_units: Mapped[list["BloodUnit"]] = relationship(back_populates="center")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    center_id: Mapped[str | None] = mapped_column(ForeignKey("donation_centers.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    center: Mapped[DonationCenter | None] = relationship(back_populates="users")


class BloodUnit(Base):
    __tablename__ = "blood_units"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    barcode: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    blood_type: Mapped[str] = mapped_column(String(5), nullable=False, index=True)
    product_type: Mapped[str] = mapped_column(String(50), default="PRBC")
    volume_ml: Mapped[int] = mapped_column(Integer, default=350)
    collected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[BloodUnitStatus] = mapped_column(
        Enum(BloodUnitStatus), default=BloodUnitStatus.ready
    )
    center_id: Mapped[str] = mapped_column(ForeignKey("donation_centers.id"), nullable=False)
    location_label: Mapped[str] = mapped_column(String(100), default="")
    dss_status: Mapped[str] = mapped_column(String(50), default="Ready")

    center: Mapped[DonationCenter] = relationship(back_populates="blood_units")


class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    unit_id: Mapped[str] = mapped_column(ForeignKey("blood_units.id"), nullable=False)
    type: Mapped[TransactionType] = mapped_column(Enum(TransactionType), nullable=False)
    from_center_id: Mapped[str | None] = mapped_column(ForeignKey("donation_centers.id"), nullable=True)
    to_center_id: Mapped[str | None] = mapped_column(ForeignKey("donation_centers.id"), nullable=True)
    blood_request_id: Mapped[str | None] = mapped_column(ForeignKey("blood_requests.id"), nullable=True)
    transfer_id: Mapped[str | None] = mapped_column(ForeignKey("blood_transfers.id"), nullable=True)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    # receipt | issued | discarded | expired | transfer_out | transfer_in
    reason: Mapped[str] = mapped_column(String(40), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class BloodTransfer(Base):
    __tablename__ = "blood_transfers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    blood_request_id: Mapped[str | None] = mapped_column(ForeignKey("blood_requests.id"), nullable=True)
    blood_unit_id: Mapped[str] = mapped_column(ForeignKey("blood_units.id"), nullable=False)
    source_center_id: Mapped[str] = mapped_column(ForeignKey("donation_centers.id"), nullable=False)
    dest_center_id: Mapped[str] = mapped_column(ForeignKey("donation_centers.id"), nullable=False)
    status: Mapped[TransferStatus] = mapped_column(
        Enum(TransferStatus), default=TransferStatus.proposed
    )
    leadership_confirmed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    leadership_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    leadership_reason: Mapped[str] = mapped_column(Text, default="")
    handed_over_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    carrier_name: Mapped[str] = mapped_column(String(200), default="")
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    received_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    transport_checklist: Mapped[dict] = mapped_column(JSON, default=dict)
    inbound_checklist: Mapped[dict] = mapped_column(JSON, default=dict)
    cancel_reason: Mapped[str] = mapped_column(Text, default="")
    note: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    events: Mapped[list["TransferEvent"]] = relationship(back_populates="transfer")


class TransferEvent(Base):
    __tablename__ = "transfer_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    transfer_id: Mapped[str] = mapped_column(ForeignKey("blood_transfers.id"), nullable=False)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    from_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    to_status: Mapped[str] = mapped_column(String(40), nullable=False)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    transfer: Mapped["BloodTransfer"] = relationship(back_populates="events")


class BloodRequest(Base):
    __tablename__ = "blood_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    facility_name: Mapped[str] = mapped_column(String(200), nullable=False)
    center_id: Mapped[str | None] = mapped_column(ForeignKey("donation_centers.id"), nullable=True)
    blood_type: Mapped[str] = mapped_column(String(5), nullable=False)
    product_type: Mapped[str] = mapped_column(String(50), default="PRBC")
    qty_needed: Mapped[int] = mapped_column(Integer, nullable=False)
    qty_fulfilled: Mapped[int] = mapped_column(Integer, default=0)
    priority: Mapped[RequestPriority] = mapped_column(
        Enum(RequestPriority), default=RequestPriority.urgent
    )
    deadline: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[RequestStatus] = mapped_column(Enum(RequestStatus), default=RequestStatus.open)
    department: Mapped[str] = mapped_column(String(100), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    cancel_reason: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    type: Mapped[str] = mapped_column(String(50), default="shortage")
    severity: Mapped[AlertSeverity] = mapped_column(Enum(AlertSeverity), default=AlertSeverity.warning)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    blood_type: Mapped[str] = mapped_column(String(5), default="")
    center_id: Mapped[str | None] = mapped_column(ForeignKey("donation_centers.id"), nullable=True)
    request_id: Mapped[str | None] = mapped_column(ForeignKey("blood_requests.id"), nullable=True)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[AlertStatus] = mapped_column(Enum(AlertStatus), default=AlertStatus.open)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    center_id: Mapped[str | None] = mapped_column(ForeignKey("donation_centers.id"), nullable=True)
    request_id: Mapped[str | None] = mapped_column(ForeignKey("blood_requests.id"), nullable=True)
    channel: Mapped[str] = mapped_column(String(30), default="in_app")
    template: Mapped[str] = mapped_column(String(100), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[NotificationStatus] = mapped_column(
        Enum(NotificationStatus), default=NotificationStatus.sent
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class MatchingLog(Base):
    __tablename__ = "matching_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    request_id: Mapped[str] = mapped_column(ForeignKey("blood_requests.id"), nullable=False)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    weights: Mapped[dict] = mapped_column(JSON, default=dict)
    candidates: Mapped[list] = mapped_column(JSON, default=list)
    top_k: Mapped[int] = mapped_column(Integer, default=20)
    radius_km: Mapped[float] = mapped_column(Float, default=30.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AuditLog(Base):
    """Sensitive actions outside transfer_events (inventory views, exports, matching, admin changes)."""

    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    entity: Mapped[str] = mapped_column(String(60), default="")
    entity_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
