from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models import (
    BloodRequest,
    BloodUnit,
    BloodUnitStatus,
    DonationCenter,
    InventoryTransaction,
    RequestPriority,
    RequestStatus,
    TransactionType,
    User,
    UserRole,
)
from app.security import hash_password


def seed_if_empty(db: Session) -> None:
    if db.query(User).first():
        return

    centers = [
        DonationCenter(
            id="c-dong-da",
            name="BV Đa khoa Đống Đa",
            address="Đống Đa, Hà Nội",
            lat=21.0167,
            lng=105.8310,
            capacity=40,
            hours="00:00-24:00",
            facility_type="hospital",
            transfer_success_rate=0.78,
            allowed_to_supply_others=False,
            has_supply_contract=False,
        ),
        DonationCenter(
            id="c-bach-mai",
            name="Bệnh viện Bạch Mai",
            address="Đống Đa, Hà Nội",
            lat=21.0020,
            lng=105.8400,
            capacity=80,
            hours="00:00-24:00",
            facility_type="hospital",
            transfer_success_rate=0.82,
            allowed_to_supply_others=True,
            has_supply_contract=True,
        ),
        DonationCenter(
            id="c-huyet-hoc",
            name="Viện Huyết học TW",
            address="Phạm Văn Bạch, Hà Nội",
            lat=21.0400,
            lng=105.7850,
            capacity=120,
            hours="00:00-24:00",
            facility_type="bank",
            transfer_success_rate=0.95,
            allowed_to_supply_others=True,
            has_supply_contract=True,
        ),
        DonationCenter(
            id="c-viet-duc",
            name="BV Việt Đức",
            address="Hoàn Kiếm, Hà Nội",
            lat=21.0288,
            lng=105.8470,
            capacity=60,
            hours="00:00-24:00",
            facility_type="hospital",
            transfer_success_rate=0.80,
            allowed_to_supply_others=True,
            has_supply_contract=False,
        ),
    ]
    db.add_all(centers)

    users = [
        User(
            id="u-admin",
            email="tanhoanganh2006a@gmail.com",
            full_name="BS. Trần Văn Minh",
            hashed_password=hash_password("Admin@123"),
            role=UserRole.admin,
            center_id="c-huyet-hoc",
        ),
        User(
            id="u-hospital",
            email="hospital@bloodbank.gov.vn",
            full_name="KTV. Lê Thu Trang",
            hashed_password=hash_password("Hospital@123"),
            role=UserRole.staff_hospital,
            center_id="c-dong-da",
        ),
        User(
            id="u-bank",
            email="bank@bloodbank.gov.vn",
            full_name="DS. Nguyễn Kho Máu",
            hashed_password=hash_password("Bank@123"),
            role=UserRole.staff_bank,
            center_id="c-huyet-hoc",
        ),
    ]
    db.add_all(users)

    now = datetime.utcnow()
    # Surplus at bank (esp. O-); sparse at Dong Da hospital to create shortage
    stocks = {"O-": 20, "O+": 40, "A-": 15, "A+": 35, "B-": 10, "B+": 28, "AB-": 6, "AB+": 16}
    unit_idx = 0
    for bt, qty in stocks.items():
        for j in range(qty):
            unit_idx += 1
            expires = now + timedelta(hours=18 if (bt == "O-" and j < 4) else 24 * (4 + j % 12))
            status = BloodUnitStatus.critical if (bt == "O-" and j < 2) else BloodUnitStatus.ready
            # Most units at bank; few at hospitals
            if j < 2 and bt == "O-":
                center = "c-dong-da"
            elif j % 5 == 0:
                center = "c-bach-mai"
            elif j % 7 == 0:
                center = "c-viet-duc"
            else:
                center = "c-huyet-hoc"
            db.add(
                BloodUnit(
                    id=f"bu-{unit_idx}",
                    barcode=f"W0123-25-{10000 + unit_idx}-01",
                    blood_type=bt,
                    product_type="PRBC",
                    volume_ml=350,
                    collected_at=now - timedelta(days=j % 20),
                    expires_at=expires,
                    status=status,
                    center_id=center,
                    location_label=f"Fridge 0{(j % 4) + 1} - Shelf B - Tray {j % 8}",
                    dss_status="Emergency Transfer" if status == BloodUnitStatus.critical else "Ready",
                )
            )

    db.add(
        InventoryTransaction(
            id="tx-1",
            unit_id="bu-1",
            type=TransactionType.in_,
            to_center_id="c-huyet-hoc",
            actor_id="u-bank",
            note="Nhập kho ngân hàng máu",
        )
    )

    req = BloodRequest(
        id="req-1",
        code="REQ-2025-0941",
        facility_name="BV Đa khoa Đống Đa",
        center_id="c-dong-da",
        blood_type="O-",
        product_type="PRBC",
        qty_needed=15,
        qty_fulfilled=2,
        priority=RequestPriority.flash,
        deadline=now + timedelta(hours=2, minutes=15),
        status=RequestStatus.open,
        department="Sản khoa",
        notes="Ưu tiên khẩn — thiếu đơn vị O-",
    )
    req2 = BloodRequest(
        id="req-2",
        code="REQ-2025-0942",
        facility_name="Bệnh viện Bạch Mai",
        center_id="c-bach-mai",
        blood_type="A-",
        qty_needed=10,
        qty_fulfilled=1,
        priority=RequestPriority.urgent,
        deadline=now + timedelta(hours=8),
        status=RequestStatus.open,
        department="Cấp cứu",
    )
    db.add_all([req, req2])
    db.commit()
