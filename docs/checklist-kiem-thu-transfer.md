# Checklist kiểm thử — Transfer lifecycle TT26-min (P2d: tuân thủ nghiêm ngặt)

**Ngày:** 2026-10-06 · **Phạm vi:** lifecycle tách bước VC / nhận hàng, cách ly, khớp chặt, audit log, UI một CTA/bước.

## Kiểm thử tự động (bắt buộc trước khi demo / merge)

```powershell
cd backend
.\.venv\Scripts\pip install -r requirements-dev.txt
.\.venv\Scripts\python -m pytest -q
```

Bộ test (`backend/tests/`) dùng SQLite tạm + seed synthetic; bao phủ: lifecycle đầy đủ, chuyển trạng thái sai, RBAC từng vai trò, lệch nhóm máu / chế phẩm, hết hạn (trước và giữa luồng), trùng điều chuyển mở cho một đơn vị, giới hạn số lượng còn thiếu, lý do lãnh đạo khi không có HĐ, từ chối → cách ly → xét duyệt, hủy chỉ trước xuất, khóa dải nhiệt theo chế phẩm + nhiệt độ đo, `PATCH /demands` không sửa được `qty_fulfilled`, nhập kho từ chối đơn vị cũ / trùng barcode, audit log.

## Chuẩn bị kiểm thử thủ công (E2E ba vai trò)

1. Backend khởi động sẽ tự thêm cột thiếu cho SQLite cũ (`upgrade_sqlite_schema`). Nếu dữ liệu demo lỗi, xóa `backend/management_blood.db` để seed lại.
2. Chạy backend + admin-web (xem README).
3. Đăng nhập lần lượt: admin / NV ngân hàng máu (`c-huyet-hoc`) / NV bệnh viện (`c-dong-da`). Thông tin đăng nhập seed nằm trong `backend/app/seed.py` — **không** điền sẵn trên trang đăng nhập.

## Luồng hạnh phúc

| Bước | Vai trò | Màn hình / CTA | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | NV bệnh viện | Nhu cầu → **Tạo nhu cầu cấp máu** | Cơ sở cố định theo tài khoản; bắt buộc khoa, nhóm máu, chế phẩm, số lượng, hạn tương lai; ConfirmModal → nhu cầu `Mở` |
| 2 | admin | Matching → chọn nhu cầu → **Chạy matching** | Top-K cơ sở nguồn (chỉ `allowed_to_supply_others`), điểm thành phần + thang tối đa; audit `matching.run` |
| 3 | admin | **Xem xét đề xuất** → chọn đơn vị (đúng nhóm + chế phẩm, còn hạn, chưa thuộc điều chuyển mở) | Nguồn không HĐ: bắt buộc lý do lãnh đạo/ủy quyền; ConfirmModal → `Đề xuất`; mở trang chi tiết; `qty_fulfilled` **không** đổi |
| 4 | NV kho nguồn | Chi tiết điều chuyển → **Xác nhận nguồn** | Đơn vị `Đã giữ chỗ` |
| 5 | NV kho nguồn | **Xuất kho** | Đơn vị `Đang điều chuyển`; giao dịch `transfer_out` |
| 6 | NV kho nguồn | **Bàn giao vận chuyển** | Dải nhiệt hiển thị **chỉ đọc** theo chế phẩm; bắt buộc tên người VC, tick đá không tiếp xúc + phương tiện; nhiệt độ đo (tùy chọn) phải trong dải → `Đang vận chuyển` (**không** tự nhảy bước) |
| 7 | NV bệnh viện đích | **Đã nhận hàng** | `Đã tới — chờ đối chiếu`; ghi `arrived_at` |
| 8 | NV bệnh viện đích | **Đối chiếu nhập** (bao gói, nhãn, điều kiện VC; ghi chú bất thường tùy chọn) | `Đã nhận`; đơn vị `Sẵn sàng` tại đích; `qty_fulfilled + 1`; giao dịch `transfer_in`; có bất thường → thông báo hai phía |
| 9 | mọi vai trò liên quan | Dòng thời gian audit + step indicator | Đủ 6 sự kiện, mỗi sự kiện có **tên người thao tác** và thời điểm |

## Luồng thay thế

| Tình huống | Vai trò | Kỳ vọng |
| --- | --- | --- |
| Hủy trước xuất (`Đề xuất` / `Nguồn đã xác nhận`) | nguồn / admin | Bắt buộc lý do ≥ 3 ký tự; đơn vị về `Sẵn sàng` (hoặc `Hết hạn` nếu đã quá hạn) |
| Hủy sau xuất | bất kỳ | **400** — UI không hiện nút Hủy |
| Từ chối (`Đang vận chuyển` / `Chờ đối chiếu`) | đích / admin | Đánh dấu mục không đạt + lý do; đơn vị về nguồn trạng thái **Cách ly**; giao dịch `return_quarantine`; thông báo nguồn; `qty_fulfilled` không đổi |
| Xét duyệt cách ly | NV nguồn / admin | Kho → **Xét duyệt cách ly…** → Giải phóng (chỉ khi còn hạn) hoặc Hủy bỏ, kèm lý do; audit `inventory.quarantine_review` |
| Đơn vị hết hạn giữa luồng | — | Xác nhận / xuất / nhận đều bị chặn; đích dùng Từ chối |
| Hủy nhu cầu | NV bệnh viện (cơ sở mình) / admin | Bắt buộc lý do; bị chặn nếu còn điều chuyển mở |

## Phủ định / RBAC

- `POST /inventory/transactions` type=`transfer` → **400**; type=`in` kèm `unit_id` → **400**; barcode trùng → **409**.
- NV bệnh viện không đề xuất điều chuyển, không nhập/xuất kho (403); không xem kho cơ sở khác (403).
- NV kho chỉ đề xuất từ tồn kho cơ sở mình (403).
- Đích không làm bước nguồn (xác nhận / xuất / bàn giao) — 403; nguồn không làm bước đích (đã nhận hàng / đối chiếu / từ chối) — 403.
- Cơ sở không liên quan không xem được chi tiết điều chuyển (403).
- `PATCH /demands` chỉ nhận `status=cancelled` + lý do; gửi `qty_fulfilled` → **422**.
- Tạo NV không gắn cơ sở → 400; admin không tự khóa / tự hạ quyền.
- `/audit-logs` chỉ admin.

## UX

- ConfirmModal: **không** xác nhận bằng Enter; Esc = Hủy; lý do bắt buộc hiển thị lỗi inline.
- Mỗi trang có trạng thái đang tải / lỗi (nút Thử lại) / rỗng.
- Danh sách điều chuyển: bộ lọc "Cần tôi xử lý" mặc định; mỗi dòng hiện bước tiếp theo hoặc đang chờ bên nào.
- Màu: đỏ chỉ dùng cho nguy hiểm (cách ly, từ chối, nghiêm trọng); bước hiện tại dùng màu chính.

## Câu hỏi nghiệp vụ còn mở

Xem [can-cu-phap-ly.md](can-cu-phap-ly.md) §6.
