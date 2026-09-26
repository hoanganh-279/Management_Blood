# Checklist kiểm thử thủ công — Transfer lifecycle TT26-min + UX Confirm (P2c)

**Ngày:** 2026-09-24 · **Phạm vi:** MVP hướng A + ConfirmModal

## Chuẩn bị

1. Xóa SQLite cũ trong `backend/` nếu thiếu schema mới.
2. Chạy backend + admin-web (xem README).
3. Đăng nhập lần lượt: `admin` / `bank` / `hospital`.

## Luồng hạnh phúc

| Bước | Vai trò | Hành động | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | admin | Matching → Đề xuất | **Review modal**: chọn unit; tick xác nhận; tạo `proposed`; **không** tăng `qty_fulfilled`; điều hướng `/transfers` |
| 2 | bank (nguồn) | Điều chuyển → Xác nhận nguồn | ConfirmModal → Unit `reserved` |
| 3 | bank | Xuất kho | ConfirmModal → Unit `transferred`; có txn `out` |
| 4 | bank | Checklist VC (Điều 20) → Bắt đầu VC | ConfirmModal + câu xác nhận Điều 20 → `inbound_pending` |
| 5 | hospital (đích) | Đối chiếu nhập (Điều 40) | ConfirmModal + câu xác nhận Điều 40 → `received`; unit `ready` tại đích; `qty_fulfilled++` |
| 6 | any | Xem audit events + step indicator | Đủ các bước chuyển trạng thái |

## UX Confirm / phủ định

- Hủy / Từ chối: ConfirmModal **bắt buộc lý do**; không gọi API nếu bấm Hủy trên modal.
- Esc trên ConfirmModal = Hủy; Enter = Xác nhận khi hợp lệ.
- Inventory: **không** còn modal atomic “Điều chuyển liên viện”; deep-link Matching / Transfers.
- Non-admin: không thấy nút Matching trên Transfers / topbar; route `/matching` redirect.
- Cảnh báo “Xử lý”: toast **Hoàn tác** trong ~6s (đưa lại `open` nếu Undo).
- Centers: đổi cờ → ConfirmModal trước khi PATCH.
- Users / Notifications / Demands: Confirm trước submit; validate inline.

## Phủ định / RBAC

- `POST /inventory/transactions` type=`transfer` → **400**.
- Matching **không** liệt kê cơ sở `allowed_to_supply_others=false` (vd. Đống Đa seed).
- Hospital đích không được Confirm/Export nguồn (403).
- Bank nguồn không được Receive tại đích (403) trừ khi cùng center / admin.
- Nguồn không HĐ: đề xuất yêu cầu tick leadership (prototype) trên Review.

## Câu hỏi nghiệp vụ còn mở

Xem [can-cu-phap-ly.md](can-cu-phap-ly.md) §6.
