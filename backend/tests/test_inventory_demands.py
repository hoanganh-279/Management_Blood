from datetime import datetime, timedelta

from app.models import AuditLog, BloodRequest, BloodUnit, BloodUnitStatus

API = "/api/v1"


def new_unit_body(**over):
    body = {
        "type": "in",
        "barcode": "NEW-BAG-0001",
        "blood_type": "A+",
        "product_type": "PRBC",
        "volume_ml": 350,
        "collected_at": (datetime.utcnow() - timedelta(days=1)).isoformat(),
        "expires_at": (datetime.utcnow() + timedelta(days=30)).isoformat(),
    }
    body.update(over)
    return body


# --- inventory receipt / issue ------------------------------------------------


def test_receive_new_unit_at_own_center(client, db, bank):
    r = client.post(f"{API}/inventory/transactions", json=new_unit_body(), headers=bank)
    assert r.status_code == 200, r.text
    assert r.json()["center_id"] == "c-huyet-hoc"
    assert r.json()["status"] == "ready"
    assert db.query(AuditLog).filter_by(action="inventory.receive").count() == 1


def test_inventory_in_refuses_existing_unit(client, bank):
    r = client.post(f"{API}/inventory/transactions", json={"type": "in", "unit_id": "bu-1"}, headers=bank)
    assert r.status_code == 400


def test_inventory_in_refuses_duplicate_barcode(client, bank):
    assert client.post(f"{API}/inventory/transactions", json=new_unit_body(), headers=bank).status_code == 200
    assert client.post(f"{API}/inventory/transactions", json=new_unit_body(), headers=bank).status_code == 409


def test_inventory_in_refuses_expired_or_invalid(client, bank):
    expired = new_unit_body(barcode="EXP-1", expires_at=(datetime.utcnow() - timedelta(hours=1)).isoformat())
    assert client.post(f"{API}/inventory/transactions", json=expired, headers=bank).status_code == 400
    bad_type = new_unit_body(barcode="BAD-1", blood_type="C+")
    assert client.post(f"{API}/inventory/transactions", json=bad_type, headers=bank).status_code == 400


def test_bank_cannot_receive_into_other_center(client, bank):
    r = client.post(f"{API}/inventory/transactions", json=new_unit_body(center_id="c-viet-duc"), headers=bank)
    assert r.status_code == 403


def test_hospital_cannot_post_inventory_transactions(client, hospital):
    assert client.post(f"{API}/inventory/transactions", json=new_unit_body(), headers=hospital).status_code == 403


def test_atomic_transfer_type_disabled(client, admin):
    assert client.post(f"{API}/inventory/transactions", json={"type": "transfer", "unit_id": "bu-1"}, headers=admin).status_code == 400


def test_issue_out_requires_note_and_available_unit(client, db, bank, pick_unit):
    uid = pick_unit("c-huyet-hoc", blood_type="A+")
    r = client.post(f"{API}/inventory/transactions", json={"type": "out", "unit_id": uid, "reason": "issued", "note": ""}, headers=bank)
    assert r.status_code == 400
    r = client.post(f"{API}/inventory/transactions",
                    json={"type": "out", "unit_id": uid, "reason": "issued", "note": "Cấp cho khoa HSCC"}, headers=bank)
    assert r.status_code == 200
    assert r.json()["status"] == "used"
    r = client.post(f"{API}/inventory/transactions",
                    json={"type": "out", "unit_id": uid, "reason": "issued", "note": "Cấp lại"}, headers=bank)
    assert r.status_code == 400


def test_cannot_issue_expired_unit(client, db, bank, pick_unit):
    uid = pick_unit("c-huyet-hoc", blood_type="A+")
    db.get(BloodUnit, uid).expires_at = datetime.utcnow() - timedelta(minutes=5)
    db.commit()
    r = client.post(f"{API}/inventory/transactions",
                    json={"type": "out", "unit_id": uid, "reason": "issued", "note": "Thử cấp"}, headers=bank)
    assert r.status_code == 400


def test_hospital_cannot_view_other_center_inventory(client, hospital):
    assert client.get(f"{API}/inventory/units", params={"center_id": "c-huyet-hoc"}, headers=hospital).status_code == 403
    assert client.get(f"{API}/inventory/units", headers=hospital).status_code == 200


def test_inventory_view_is_audited(client, db, admin):
    assert client.get(f"{API}/inventory/units", headers=admin).status_code == 200
    db.expire_all()
    assert db.query(AuditLog).filter_by(action="inventory.view").count() == 1


def test_coverage_uses_configured_thresholds(client, admin):
    r = client.get(f"{API}/inventory/coverage", headers=admin)
    assert r.status_code == 200
    data = r.json()
    assert data["cells"]
    assert {c["level"] for c in data["cells"]} <= {"critical", "warning", "ok", "no_demand"}


# --- demands ------------------------------------------------------------------


def test_hospital_demand_bound_to_own_center(client, hospital):
    r = client.post(f"{API}/demands", json={
        "center_id": "c-viet-duc", "blood_type": "B+", "product_type": "PRBC", "qty_needed": 2,
        "deadline": (datetime.utcnow() + timedelta(hours=3)).isoformat(), "department": "Cấp cứu",
    }, headers=hospital)
    assert r.status_code == 200, r.text
    assert r.json()["center_id"] == "c-dong-da"


def test_demand_validation(client, hospital):
    base = {"blood_type": "B+", "product_type": "PRBC", "qty_needed": 2,
            "deadline": (datetime.utcnow() + timedelta(hours=3)).isoformat()}
    assert client.post(f"{API}/demands", json={**base, "blood_type": "Z"}, headers=hospital).status_code == 422
    assert client.post(f"{API}/demands", json={**base, "qty_needed": 0}, headers=hospital).status_code == 422
    past = {**base, "deadline": (datetime.utcnow() - timedelta(hours=1)).isoformat()}
    assert client.post(f"{API}/demands", json=past, headers=hospital).status_code == 400


def test_patch_demand_cannot_set_qty_fulfilled(client, db, hospital):
    r = client.patch(f"{API}/demands/req-1", json={"qty_fulfilled": 15}, headers=hospital)
    assert r.status_code == 422
    db.expire_all()
    assert db.get(BloodRequest, "req-1").qty_fulfilled == 2


def test_cancel_demand_requires_reason_and_no_open_transfers(client, db, hospital, bank, pick_unit):
    assert client.patch(f"{API}/demands/req-1", json={"status": "cancelled", "cancel_reason": ""}, headers=hospital).status_code == 422
    client.post(f"{API}/transfers", json={"unit_id": pick_unit("c-huyet-hoc"), "blood_request_id": "req-1"}, headers=bank)
    r = client.patch(f"{API}/demands/req-1", json={"status": "cancelled", "cancel_reason": "Bệnh nhân chuyển viện"}, headers=hospital)
    assert r.status_code == 400


def test_cancel_demand_ok(client, db, hospital):
    r = client.patch(f"{API}/demands/req-1", json={"status": "cancelled", "cancel_reason": "Bệnh nhân chuyển viện"}, headers=hospital)
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"
    assert db.query(AuditLog).filter_by(action="demand.cancel").count() == 1


def test_hospital_cannot_cancel_other_center_demand(client, hospital):
    r = client.patch(f"{API}/demands/req-2", json={"status": "cancelled", "cancel_reason": "Không cần"}, headers=hospital)
    assert r.status_code in (403, 404)


# --- users ------------------------------------------------------------------


def test_staff_user_requires_center(client, admin):
    r = client.post(f"{API}/users", json={"email": "x@example.com", "full_name": "X", "password": "secret1",
                                          "role": "staff_bank"}, headers=admin)
    assert r.status_code == 400


def test_admin_cannot_lock_self(client, admin):
    assert client.patch(f"{API}/users/u-admin", json={"is_active": False}, headers=admin).status_code == 400


def test_audit_logs_admin_only(client, admin, bank):
    assert client.get(f"{API}/audit-logs", headers=admin).status_code == 200
    assert client.get(f"{API}/audit-logs", headers=bank).status_code == 403
