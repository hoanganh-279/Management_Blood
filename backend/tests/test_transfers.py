from datetime import datetime, timedelta

from app.models import AuditLog, BloodRequest, BloodUnit, BloodUnitStatus, InventoryTransaction, TransferEvent

API = "/api/v1"
TRANSIT_OK = {
    "temperature_band": "1_to_10C",
    "ice_not_direct_contact": True,
    "vehicle_ok": True,
    "carrier_name": "Nguyễn Văn Tài",
    "measured_temp_c": 4.0,
}
RECEIVE_OK = {"packaging_ok": True, "label_ok": True, "transport_condition_ok": True}


def propose(client, headers, unit_id, request_id="req-1", **extra):
    return client.post(f"{API}/transfers", json={"unit_id": unit_id, "blood_request_id": request_id, **extra}, headers=headers)


def advance_to(client, tid, target, *, src, dst):
    steps = [
        ("source_confirmed", "confirm", src, {}),
        ("exported", "export", src, {}),
        ("in_transit", "transit", src, TRANSIT_OK),
        ("inbound_pending", "arrive", dst, {}),
        ("received", "receive", dst, RECEIVE_OK),
    ]
    for status, path, h, body in steps:
        r = client.post(f"{API}/transfers/{tid}/{path}", json=body, headers=h)
        assert r.status_code == 200, (path, r.text)
        assert r.json()["status"] == status
        if status == target:
            return r.json()
    raise AssertionError(target)


# --- full lifecycle ---------------------------------------------------------


def test_full_lifecycle_fulfils_only_on_received(client, db, bank, hospital, pick_unit):
    uid = pick_unit("c-huyet-hoc")
    r = propose(client, bank, uid)
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["status"] == "proposed"
    assert t["dest_center_id"] == "c-dong-da"
    assert t["required_temperature_band"] == "1_to_10C"

    for path, h, body in (
        ("confirm", bank, {}),
        ("export", bank, {}),
        ("transit", bank, TRANSIT_OK),
        ("arrive", hospital, {}),
    ):
        assert client.post(f"{API}/transfers/{t['id']}/{path}", json=body, headers=h).status_code == 200, path
        db.expire_all()
        assert db.get(BloodRequest, "req-1").qty_fulfilled == 2, f"qty changed before received ({path})"

    r = client.post(f"{API}/transfers/{t['id']}/receive", json=RECEIVE_OK, headers=hospital)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "received"
    assert body["received_by_name"]
    assert body["carrier_name"] == TRANSIT_OK["carrier_name"]
    assert [e["to_status"] for e in body["events"]] == [
        "proposed", "source_confirmed", "exported", "in_transit", "inbound_pending", "received",
    ]
    assert all(e["actor_name"] for e in body["events"])

    db.expire_all()
    unit = db.get(BloodUnit, uid)
    assert unit.center_id == "c-dong-da" and unit.status == BloodUnitStatus.ready
    assert db.get(BloodRequest, "req-1").qty_fulfilled == 3
    reasons = {tx.reason for tx in db.query(InventoryTransaction).filter_by(transfer_id=t["id"])}
    assert reasons == {"transfer_out", "transfer_in"}


def test_transit_does_not_skip_arrival(client, bank, hospital, pick_unit):
    t = propose(client, bank, pick_unit("c-huyet-hoc")).json()
    out = advance_to(client, t["id"], "in_transit", src=bank, dst=hospital)
    assert out["status"] == "in_transit"
    r = client.post(f"{API}/transfers/{t['id']}/receive", json=RECEIVE_OK, headers=hospital)
    assert r.status_code == 400


def test_invalid_transitions(client, bank, hospital, pick_unit):
    t = propose(client, bank, pick_unit("c-huyet-hoc")).json()
    for path, body in (("export", {}), ("transit", TRANSIT_OK), ("arrive", {}), ("receive", RECEIVE_OK)):
        h = hospital if path in ("arrive", "receive") else bank
        assert client.post(f"{API}/transfers/{t['id']}/{path}", json=body, headers=h).status_code == 400, path


# --- RBAC -------------------------------------------------------------------


def test_hospital_cannot_propose(client, hospital, pick_unit):
    assert propose(client, hospital, pick_unit("c-huyet-hoc")).status_code == 403


def test_bank_cannot_propose_from_other_center(client, bank, pick_unit):
    uid = pick_unit("c-viet-duc")
    r = propose(client, bank, uid, leadership_confirm=True, leadership_reason="Khẩn cấp")
    assert r.status_code == 403


def test_destination_cannot_do_source_steps(client, bank, hospital, pick_unit):
    t = propose(client, bank, pick_unit("c-huyet-hoc")).json()
    assert client.post(f"{API}/transfers/{t['id']}/confirm", json={}, headers=hospital).status_code == 403
    advance_to(client, t["id"], "source_confirmed", src=bank, dst=hospital)
    assert client.post(f"{API}/transfers/{t['id']}/export", json={}, headers=hospital).status_code == 403


def test_source_cannot_do_destination_steps(client, bank, hospital, pick_unit):
    t = propose(client, bank, pick_unit("c-huyet-hoc")).json()
    advance_to(client, t["id"], "in_transit", src=bank, dst=hospital)
    assert client.post(f"{API}/transfers/{t['id']}/arrive", json={}, headers=bank).status_code == 403
    assert client.post(
        f"{API}/transfers/{t['id']}/reject", json={"reason": "Không đạt"}, headers=bank
    ).status_code == 403


def test_transfer_not_visible_to_unrelated_center(client, db, admin, pick_unit):
    from app.models import User, UserRole
    from app.security import create_access_token

    db.add(User(id="u-vd", email="vd@example.com", full_name="NV Việt Đức", hashed_password="x",
                role=UserRole.staff_hospital, center_id="c-viet-duc"))
    db.commit()
    t = propose(client, admin, pick_unit("c-huyet-hoc")).json()
    h = {"Authorization": f"Bearer {create_access_token('u-vd')}"}
    assert client.get(f"{API}/transfers/{t['id']}", headers=h).status_code == 403


# --- proposal safety rules --------------------------------------------------


def test_blood_type_mismatch_rejected(client, bank, pick_unit):
    r = propose(client, bank, pick_unit("c-huyet-hoc", blood_type="O+"))
    assert r.status_code == 400
    assert "Nhóm máu" in r.json()["detail"]


def test_product_mismatch_rejected(client, db, bank):
    db.add(BloodUnit(id="bu-plt", barcode="PLT-0001", blood_type="O-", product_type="PLT", volume_ml=250,
                     collected_at=datetime.utcnow() - timedelta(days=1),
                     expires_at=datetime.utcnow() + timedelta(days=3),
                     status=BloodUnitStatus.ready, center_id="c-huyet-hoc"))
    db.commit()
    r = propose(client, bank, "bu-plt")
    assert r.status_code == 400
    assert "chế phẩm" in r.json()["detail"]


def test_expired_unit_rejected(client, db, bank, pick_unit):
    uid = pick_unit("c-huyet-hoc")
    db.get(BloodUnit, uid).expires_at = datetime.utcnow() - timedelta(minutes=1)
    db.commit()
    assert propose(client, bank, uid).status_code == 400


def test_unit_expiring_mid_flow_blocks_export(client, db, bank, hospital, pick_unit):
    uid = pick_unit("c-huyet-hoc")
    t = propose(client, bank, uid).json()
    advance_to(client, t["id"], "source_confirmed", src=bank, dst=hospital)
    db.get(BloodUnit, uid).expires_at = datetime.utcnow() - timedelta(minutes=1)
    db.commit()
    assert client.post(f"{API}/transfers/{t['id']}/export", json={}, headers=bank).status_code == 400


def test_duplicate_open_transfer_for_unit(client, db, bank, pick_unit):
    uid = pick_unit("c-huyet-hoc")
    assert propose(client, bank, uid).status_code == 200
    db.get(BloodUnit, uid).status = BloodUnitStatus.ready  # even if status were reset, the open transfer blocks
    db.commit()
    assert propose(client, bank, uid).status_code == 409


def test_quantity_cap(client, db, bank, pick_unit):
    req = db.get(BloodRequest, "req-1")
    req.qty_needed = 3  # 2 already fulfilled → only 1 more allowed
    db.commit()
    first = pick_unit("c-huyet-hoc")
    assert propose(client, bank, first).status_code == 200
    second = pick_unit("c-huyet-hoc", exclude=(first,))
    r = propose(client, bank, second)
    assert r.status_code == 400


def test_source_not_allowed_to_supply(client, admin, db):
    db.add(BloodRequest(id="req-vd", code="REQ-VD", facility_name="BV Việt Đức", center_id="c-viet-duc",
                        blood_type="O-", product_type="PRBC", qty_needed=2,
                        deadline=datetime.utcnow() + timedelta(hours=4)))
    db.commit()
    uid = db.query(BloodUnit).filter_by(center_id="c-dong-da", blood_type="O-").first().id
    r = propose(client, admin, uid, request_id="req-vd")
    assert r.status_code == 400


def test_leadership_reason_required_without_contract(client, admin, db, pick_unit):
    uid = pick_unit("c-viet-duc")
    assert propose(client, admin, uid).status_code == 400
    assert propose(client, admin, uid, leadership_confirm=True, leadership_reason="").status_code == 400
    r = propose(client, admin, uid, leadership_confirm=True, leadership_reason="Cấp cứu sản khoa")
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["leadership_confirmed_by_name"]
    assert t["leadership_confirmed_at"]
    assert t["leadership_reason"] == "Cấp cứu sản khoa"


def test_contract_source_needs_no_leadership(client, bank, pick_unit):
    r = propose(client, bank, pick_unit("c-huyet-hoc"))
    assert r.status_code == 200
    assert r.json()["leadership_confirmed_by"] is None


# --- transport checklist (Điều 20 spirit) -----------------------------------


def test_temperature_band_locked_to_product(client, bank, hospital, pick_unit):
    t = propose(client, bank, pick_unit("c-huyet-hoc")).json()
    advance_to(client, t["id"], "exported", src=bank, dst=hospital)
    wrong = {**TRANSIT_OK, "temperature_band": "20_to_24C"}
    assert client.post(f"{API}/transfers/{t['id']}/transit", json=wrong, headers=bank).status_code == 400


def test_measured_temperature_out_of_band(client, bank, hospital, pick_unit):
    t = propose(client, bank, pick_unit("c-huyet-hoc")).json()
    advance_to(client, t["id"], "exported", src=bank, dst=hospital)
    hot = {**TRANSIT_OK, "measured_temp_c": 15.0}
    assert client.post(f"{API}/transfers/{t['id']}/transit", json=hot, headers=bank).status_code == 400


def test_transit_requires_ice_vehicle_and_carrier(client, bank, hospital, pick_unit):
    t = propose(client, bank, pick_unit("c-huyet-hoc")).json()
    advance_to(client, t["id"], "exported", src=bank, dst=hospital)
    for patch in ({"ice_not_direct_contact": False}, {"vehicle_ok": False}, {"carrier_name": "x"}):
        r = client.post(f"{API}/transfers/{t['id']}/transit", json={**TRANSIT_OK, **patch}, headers=bank)
        assert r.status_code in (400, 422), patch


def test_receive_requires_full_checklist(client, bank, hospital, pick_unit):
    t = propose(client, bank, pick_unit("c-huyet-hoc")).json()
    advance_to(client, t["id"], "inbound_pending", src=bank, dst=hospital)
    r = client.post(f"{API}/transfers/{t['id']}/receive", json={**RECEIVE_OK, "label_ok": False}, headers=hospital)
    assert r.status_code == 400


# --- reject → quarantine → review --------------------------------------------


def test_reject_sends_unit_to_quarantine_then_review(client, db, bank, hospital, pick_unit):
    uid = pick_unit("c-huyet-hoc")
    t = propose(client, bank, uid).json()
    advance_to(client, t["id"], "inbound_pending", src=bank, dst=hospital)
    r = client.post(
        f"{API}/transfers/{t['id']}/reject",
        json={"reason": "Nhãn bị rách", "packaging_ok": True, "label_ok": False, "transport_condition_ok": True},
        headers=hospital,
    )
    assert r.status_code == 200, r.text
    assert r.json()["inbound_checklist"]["result"] == "rejected"
    db.expire_all()
    unit = db.get(BloodUnit, uid)
    assert unit.status == BloodUnitStatus.quarantine and unit.center_id == "c-huyet-hoc"
    assert db.get(BloodRequest, "req-1").qty_fulfilled == 2

    # quarantined unit cannot be proposed or issued
    assert propose(client, bank, uid).status_code == 400
    r = client.post(f"{API}/inventory/transactions",
                    json={"type": "out", "unit_id": uid, "reason": "issued", "note": "Thử cấp"}, headers=bank)
    assert r.status_code == 400

    # destination staff cannot review the source's quarantine
    assert client.post(f"{API}/inventory/units/{uid}/quarantine-review",
                       json={"decision": "release", "reason": "Kiểm tra đạt"}, headers=hospital).status_code == 403

    r = client.post(f"{API}/inventory/units/{uid}/quarantine-review",
                    json={"decision": "release", "reason": "Kiểm tra lại đạt"}, headers=bank)
    assert r.status_code == 200
    assert r.json()["status"] == "ready"


def test_quarantine_discard(client, db, bank, hospital, pick_unit):
    uid = pick_unit("c-huyet-hoc")
    t = propose(client, bank, uid).json()
    advance_to(client, t["id"], "in_transit", src=bank, dst=hospital)
    assert client.post(f"{API}/transfers/{t['id']}/reject", json={"reason": "Nhiệt độ sai"}, headers=hospital).status_code == 200
    r = client.post(f"{API}/inventory/units/{uid}/quarantine-review",
                    json={"decision": "discard", "reason": "Không đạt bảo quản"}, headers=bank)
    assert r.status_code == 200
    assert r.json()["status"] == "discarded"


def test_reject_not_allowed_before_shipment(client, bank, hospital, pick_unit):
    t = propose(client, bank, pick_unit("c-huyet-hoc")).json()
    assert client.post(f"{API}/transfers/{t['id']}/reject", json={"reason": "Không cần"}, headers=hospital).status_code == 400


# --- cancel -------------------------------------------------------------------


def test_cancel_before_export_returns_unit_to_ready(client, db, bank, hospital, pick_unit):
    uid = pick_unit("c-huyet-hoc")
    t = propose(client, bank, uid).json()
    advance_to(client, t["id"], "source_confirmed", src=bank, dst=hospital)
    db.expire_all()
    assert db.get(BloodUnit, uid).status == BloodUnitStatus.reserved
    r = client.post(f"{API}/transfers/{t['id']}/cancel", json={"reason": "Đổi nguồn"}, headers=bank)
    assert r.status_code == 200
    db.expire_all()
    assert db.get(BloodUnit, uid).status == BloodUnitStatus.ready


def test_cancel_after_export_forbidden(client, bank, hospital, admin, pick_unit):
    t = propose(client, bank, pick_unit("c-huyet-hoc")).json()
    advance_to(client, t["id"], "exported", src=bank, dst=hospital)
    for h in (bank, admin):
        assert client.post(f"{API}/transfers/{t['id']}/cancel", json={"reason": "Thôi"}, headers=h).status_code == 400


def test_cancel_requires_reason(client, bank, pick_unit):
    t = propose(client, bank, pick_unit("c-huyet-hoc")).json()
    assert client.post(f"{API}/transfers/{t['id']}/cancel", json={"reason": ""}, headers=bank).status_code == 422


# --- audit ------------------------------------------------------------------


def test_every_transition_is_logged(client, db, bank, hospital, pick_unit):
    t = propose(client, bank, pick_unit("c-huyet-hoc")).json()
    advance_to(client, t["id"], "received", src=bank, dst=hospital)
    db.expire_all()
    events = db.query(TransferEvent).filter_by(transfer_id=t["id"]).all()
    assert len(events) == 6
    assert all(e.actor_id for e in events)


def test_matching_run_writes_audit(client, db, admin):
    r = client.post(f"{API}/matching/run", json={"request_id": "req-1", "radius_km": 30, "top_k": 5}, headers=admin)
    assert r.status_code == 200, r.text
    assert "component_max" in r.json()
    db.expire_all()
    assert db.query(AuditLog).filter_by(action="matching.run").count() == 1
