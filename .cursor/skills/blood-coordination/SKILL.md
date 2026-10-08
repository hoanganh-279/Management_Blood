---
name: blood-coordination
description: >-
  Guides implementation of the blood supply coordination DSS (facility matching,
  shortage detection, inventory transfer lifecycle, hospital/bank RBAC). Use when adding
  features, APIs, React admin screens, Supabase schema, or matching logic for
  Management_Blood / điều phối máu BV ↔ NHM.
---

# Blood coordination — Agent Skill

## Khi nào dùng

- Thêm hoặc sửa FR (tài khoản, cơ sở, kho, nhu cầu, matching cơ sở, điều chuyển lifecycle, cảnh báo, thông báo, báo cáo).
- Viết API FastAPI, màn React admin, hoặc migration Supabase.
- Chạm logic Shortage / Coverage / Facility Matching score / forecasting / transfer states.
- Chỉnh UI/UX hoặc đồng bộ tài liệu nghiệp vụ sau thay đổi hệ thống.

## Đọc trước

1. [Product.md](../../../Product.md) — yêu cầu, FR, flows, KPI, tách DSS vs quy trình.
2. [docs/can-cu-phap-ly.md](../../../docs/can-cu-phap-ly.md) — TT 26 & giới hạn pháp lý.
3. [docs/thiet-ke-he-thong.md](../../../docs/thiet-ke-he-thong.md) — state machine, API.
4. [docs/ke-hoach-chinh-sua.md](../../../docs/ke-hoach-chinh-sua.md) — giai đoạn chỉnh sửa, UI, quy trình duyệt.
5. [README.md](../../../README.md) / [AGENTS.md](../../../AGENTS.md) — stack và thứ tự đọc.
6. Rules: `legal-tt26-coordination.mdc`, `agent-change-policy.mdc`, `ui-ux-design.mdc`, và rule theo thư mục đang sửa.

## Cổng duyệt bắt buộc

1. **Xin duyệt:** mô tả thay đổi → chờ người dùng đồng ý trước khi sửa lớn.
2. **Đọc đủ miền:** đọc toàn bộ file nghiệp vụ liên quan trước khi sửa.
3. **Hỏi nghiệp vụ:** không đoán ngưỡng, trọng số matching, RBAC, điều khoản pháp lý — hỏi và dừng nếu chưa rõ.
4. **Đồng bộ tài liệu:** hỏi đúng câu trong `agent-change-policy.mdc` khi lệch nghiệp vụ.

## Quy trình triển khai tính năng

1. **Xác định** mã FR, vai trò (`staff_hospital` / `staff_bank` / `admin`), và hợp đồng API.
2. **Schema:** nếu bảng mới → migration + RLS.
3. **Backend:** Pydantic schema → service → router; JWT + RBAC.
4. **Thuật toán:** shortage/facility matching ở service; ghi MatchingLog / giải thích điểm Top-K.
5. **Transfer:** chỉ qua service lifecycle; fulfill khi `received`.
6. **UI:** admin-web (Bootstrap) chỉ gọi API — không nhúng engine.
7. **Đóng:** cập nhật Product.md / ke-hoach / can-cu-phap-ly nếu đổi scope; không commit `.env`.

## Invariant domain

- Công thức Shortage / Coverage / Score: **chỉ copy** từ Product §5 — không bịa, không gắn “theo BYT”.
- Matching lọc nguồn `allowed_to_supply_others = true`.
- Transfer: `proposed → source_confirmed → exported → in_transit → inbound_pending → received|rejected|cancelled`.
  - `transit` dừng ở `in_transit`; đích gọi `/arrive` để sang `inbound_pending`.
  - `reject`: chỉ đích/admin, từ `in_transit`|`inbound_pending` → unit `quarantine` tại nguồn → `POST /inventory/units/{id}/quarantine-review`.
  - `cancel`: chỉ nguồn/admin, từ `proposed`|`source_confirmed`.
- Đề xuất: khớp chặt nhóm + chế phẩm, còn hạn, không vượt số lượng còn thiếu, một đơn vị một điều chuyển mở; không HĐ → lý do lãnh đạo.
- `qty_fulfilled` + refresh alerts **chỉ khi** `received`; `PATCH /demands` chỉ hủy kèm lý do.
- Checklist VC (Điều 20: dải nhiệt khóa theo chế phẩm) và nhập (Điều 40) bắt buộc trước các bước tương ứng — ghi nhận, không IoT MVP.
- Thao tác nhạy cảm ngoài lifecycle ghi `audit_logs` qua `app/services/audit.py`.
- Chạy `backend/tests` (pytest) sau mọi thay đổi lifecycle / RBAC / kho.

## Cấm

- Coi kết quả matching / transfer DSS là quyết định y tế **hoặc** có hiệu lực pháp lý tự động.
- Atomic one-shot transfer (teleport unit + fulfill).
- Lộ `SUPABASE_SERVICE_ROLE_KEY` ra client hoặc commit secret.
- Bỏ qua RBAC trên endpoint nghiệp vụ.
- Thêm ML forecasting khi chưa có baseline và dữ liệu đủ.
- Nhân đôi logic matching trên React thay vì backend.
- Tự hành động thay đổi lớn hoặc đoán nghiệp vụ khi chưa hỏi.
