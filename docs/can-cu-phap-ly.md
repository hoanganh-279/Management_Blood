# Căn cứ & giới hạn pháp lý — Management Blood

**Phiên bản:** 1.2  
**Ngày:** 2026-10-06  
**Phạm vi:** MVP DSS điều phối BV ↔ NHM (hướng compliance tối thiểu)  
**Không phải** tư vấn pháp lý; dùng để neo khảo sát và giới hạn thiết kế hệ thống.

Khảo sát chính thức nên đối chiếu **toàn văn** trên [vbpl.vn](https://vbpl.vn) / Công báo. Một số trang tổng hợp (vd. thuvienphapluat) có thể bị Cloudflare chặn khi fetch tự động.

---

## 1. Bộ khung văn bản (mốc khảo sát)

| Văn bản | Vai trò với đề tài | Ghi chú |
| --- | --- | --- |
| **Thông tư 26/2013/TT-BYT** | Trục chính truyền máu: lấy–XN–điều chế–bảo quản–vận chuyển–quản lý–sử dụng; giao nhận giữa cơ sở; hồ sơ–báo cáo | Nền kỹ thuật hiện hành cho bài toán điều phối liên cơ sở |
| Thông tư 15/2023/TT-BYT | Giá tối đa / chi phí đơn vị máu, chế phẩm | Không thay quy trình điều phối; hữu ích nếu sau có module chi phí |
| Quyết định 937-BYT/QĐ (1992) | Điều lệ truyền máu cũ | Lịch sử; không xây nghiệp vụ theo 937 |
| Luật KCB 2023 + TT hướng dẫn | Khung KCB chung | Không thay TT 26 về kỹ thuật / giao nhận máu |
| Thông tư 53/2014/TT-BYT | Điều kiện hoạt động y tế trên môi trường mạng (ATTT, nhân lực CNTT) | Tham chiếu khảo sát cho admin-web — **không** quy định wizard điều phối máu |
| Nghị định 137/2024/NĐ-CP | Giao dịch điện tử CQNN / hệ thống thông tin: xác thực, toàn vẹn, tin cậy | Neo JWT/RBAC/audit; OTP/ký số = **production sau** (không MVP) |
| Quyết định 326/QĐ-BYT (2024) | Quy chế ATTT Bộ Y tế (xác thực mạnh, truyền thông an toàn) | Tham chiếu khảo sát — prototype không tuyên bố đủ compliance |

**Không tìm thấy** một “Luật hiến máu nhân đạo” riêng điều chỉnh điều phối liên bệnh viện. **Không** viết trong đề cương như thể luật đó đã tồn tại.

---

## 2. Điều khoản TT 26 gắn bài toán điều phối

| Điều | Ý nghĩa thiết kế hệ thống |
| --- | --- |
| **Điều 39** — Giao, nhận máu / chế phẩm | Cho phép giao nhận cơ sở cung cấp ↔ KCB hoặc giữa các KCB khi đủ điều kiện (quyền cung cấp, HĐ hoặc xác nhận lãnh đạo, phiếu dự trù, NVYT giao/nhận, phương tiện bảo quản/VC, hồ sơ). DSS **không** tự động điều chuyển có hiệu lực pháp lý — chỉ đề xuất → yêu cầu → xác nhận hai phía → ghi hồ sơ. |
| **Điều 20** — Vận chuyển | Nhiệt độ theo loại chế phẩm (MTP/HC 1–10°C; TC/BC 20–24°C; HT đông lạnh ≤ −18°C; đá không tiếp xúc trực tiếp túi). MVP: **checklist / ghi nhận trạng thái**, không bắt buộc IoT. |
| **Điều 40** — Nhập kho tại đơn vị phát máu KCB | Đối chiếu bao gói, nhãn, điều kiện bảo quản/VC trước khi nhập; bất thường báo phụ trách. Use case nhận kho = kiểm tra đối chiếu, không chỉ cộng tồn. |
| **Điều 38** — Nguyên tắc cấp phát | Matching score **không** thay quyết định cấp phát lâm sàng. |
| **Điều 59–62** — Hội đồng, hồ sơ, báo cáo | MatchingLog + lịch sử transfer + audit xuất/nhập là đúng hướng; prototype không tuyên bố đủ lưu trữ 10 năm production. |

---

## 3. Map pháp lý → module hệ thống

```text
BloodRequest / phiếu dự trù (tương thích tinh thần Phụ lục 8 — map chi tiết sau khi có bản vbpl)
        ↓
Facility nguồn (allowed_to_supply_others)  ↔  Facility nhận
        ↓
Xác nhận nguồn (+ xác nhận lãnh đạo/ủy quyền kèm lý do nếu chưa có HĐ — prototype)
        ↓
Xuất kho nguồn → bàn giao vận chuyển (checklist Điều 20) → đích xác nhận đã nhận hàng
        ↓
Đối chiếu nhập (Điều 40) → nhập kho | từ chối → đơn vị cách ly tại nguồn → xét duyệt
        ↓
Hồ sơ giao nhận (transfer_events / audit_logs)
```

### 3b. Ánh xạ tinh thần điều khoản → kiểm tra cụ thể trong hệ thống

Các kiểm tra dưới đây là **cấu hình hệ thống** ánh xạ tinh thần điều khoản — không phải văn bản quy phạm, không thay quy trình nội bộ của cơ sở.

| Điều (tinh thần) | Kiểm tra trong hệ thống | Nơi thực thi |
| --- | --- | --- |
| 39.1 — quyền cung cấp | Nguồn phải có `allowed_to_supply_others`; kiểm tra lại ở bước xác nhận | `propose_transfer`, `confirm_source`, matching |
| 39 — HĐ hoặc xác nhận lãnh đạo | Không có `has_supply_contract` → bắt buộc xác nhận + lý do; lưu người, thời điểm, lý do + sự kiện riêng | `propose_transfer`, `confirm_source` |
| 39 — NVYT giao / nhận | Lưu người bàn giao (`handed_over_by`), tên người vận chuyển (bắt buộc), người nhận (`received_by`); mỗi bước một người xác nhận | `start_transit`, `receive_transfer`, `reject_transfer` |
| 39 — đúng đối tượng nhu cầu | Mọi điều chuyển gắn nhu cầu; đích = cơ sở nhu cầu; khớp chặt nhóm ABO/Rh + chế phẩm; không vượt số lượng còn thiếu; một đơn vị chỉ thuộc một điều chuyển mở | `propose_transfer` |
| 20 — nhiệt độ vận chuyển | Dải nhiệt **khóa theo chế phẩm** (HC/máu toàn phần 1–10°C; TC/BC 20–24°C; HT đông lạnh/tủa ≤ −18°C); nhiệt độ đo (tùy chọn) ngoài dải → chặn bàn giao | `start_transit` |
| 20 — đá không tiếp xúc | Bắt buộc xác nhận; bắt buộc xác nhận phương tiện | `start_transit` |
| 40 — đối chiếu trước nhập | Bàn giao VC và "đã nhận hàng" là hai bước riêng; nhập kho chỉ sau đủ 3 mục đối chiếu; đơn vị hết hạn không nhập | `mark_arrived`, `receive_transfer` |
| 40 — bất thường báo phụ trách | Ghi chú bất thường → thông báo cả hai cơ sở; từ chối lưu đúng mục không đạt | `receive_transfer`, `reject_transfer` |
| 40 — không đưa đơn vị nghi vấn vào sử dụng | Đơn vị bị từ chối → `quarantine` tại nguồn; chỉ giải phóng (còn hạn) hoặc hủy bỏ sau xét duyệt có lý do | `reject_transfer`, `review_quarantine` |
| Hạn dùng (nguyên tắc an toàn chung) | Kiểm tra còn hạn ở đề xuất / xác nhận / xuất / nhận; tự chuyển `expired` cho đơn vị sẵn sàng quá hạn; không cấp phát đơn vị hết hạn | `services/transfers.py`, `services/inventory.py` |
| 61 — hồ sơ | `transfer_events` mọi chuyển trạng thái (người, thời điểm, ghi chú); `audit_logs` cho xem kho, báo cáo, matching, nhập/xuất, cách ly, nhu cầu, cấu hình cơ sở, user; lịch sử giao dịch theo đơn vị | `services/audit.py`, router |
| Toàn vẹn tồn kho | Nhập kho chỉ đơn vị **mới** (barcode duy nhất); không có đường "hồi sinh" đơn vị cũ; di chuyển liên cơ sở chỉ qua lifecycle; `qty_fulfilled` chỉ tăng khi `received` | `create_transaction`, `receive_new_unit`, `patch_demand` |

| Actor hệ thống | Ý nghĩa nghiệp vụ (prototype) |
| --- | --- |
| `staff_hospital` | NV đơn vị phát máu / điều phối tại KCB; xác nhận đã nhận hàng, đối chiếu nhập hoặc từ chối tại đích |
| `staff_bank` | NV cơ sở cung cấp / NHM; xác nhận nguồn, xuất, bàn giao VC, xét duyệt cách ly |
| `admin` | Điều phối mạng — **không** thay quyền lãnh đạo ký phiếu thật; trên prototype có thể xác nhận ủy quyền khi chưa có HĐ |

---

## 4. Tách lớp: tuân thủ quy trình vs thuật toán nghiên cứu

| Lớp | Nội dung | Gắn nhãn BYT? |
| --- | --- | --- |
| **Tuân thủ quy trình (MVP)** | Lifecycle đề xuất → xác nhận → xuất → VC checklist → nhập đối chiếu → audit; cờ `allowed_to_supply_others` | Ánh xạ **tinh thần** Điều 39/20/40/61 — không mô phỏng cấp phép |
| **Thuật toán DSS (nghiên cứu)** | Shortage, Coverage, Score B/D/T/A/R | **Không** — heuristic / cấu hình nhóm |

Công thức kiểu `TransferableStock = Inventory − SafetyStock − ReservedStock` **không** có trong TT 26 → chỉ dùng sau khi nhóm xác nhận ngưỡng.

---

## 5. Định vị đề tài (khuyến nghị khảo sát)

Hệ thống hỗ trợ quyết định (DSS) điều phối nguồn máu giữa các cơ sở KCB và cơ sở cung cấp máu, dựa trên dữ liệu tồn kho–nhu cầu–khoảng cách–hạn dùng; hỗ trợ lập yêu cầu điều chuyển và theo dõi giao nhận theo tinh thần Điều 39, 20, 40, 61 Thông tư 26/2013/TT-BYT.

Hệ thống **không** thay thế quyết định chuyên môn, hợp đồng cung cấp máu, hay thẩm quyền cấp phép của cơ quan quản lý.

---

## 5b. Lớp website / ATTT (tham chiếu khảo sát — không ảo hóa UX thành luật máu)

| Yêu cầu thiết kế UI/API | Nguồn tham chiếu | MVP |
| --- | --- | --- |
| Xác thực tài khoản, phân quyền | NĐ 137/2024 (tinh thần xác thực/toàn vẹn); JWT + RBAC hiện có | Có |
| Audit thao tác nhạy cảm | TT 26 Điều 61 + ATTT BYT | `transfer_events` / MatchingLog / `audit_logs` (màn `/system/audit`) |
| Modal xác nhận trước bước giao nhận | **Không** phải điều khoản TT 26 — biện pháp UX chống nhầm | Có (ConfirmModal) |
| OTP / chữ ký số / sinh trắc | NĐ 137 / TT 53 / QĐ 326 — hướng production | **Hook docs only** — chưa implement |
| Wizard UX / phím tắt / auto-save nháp | Không có trong TT 26 | Cấu hình UX nội bộ |

**Không** gắn nhãn “theo BYT” cho ConfirmModal, hotkey, hay checklist UI. Checklist VC/nhập chỉ **ánh xạ tinh thần** Điều 20/40.

---

## 6. Câu hỏi nghiệp vụ

### 6a. Đã được nghiệp vụ xác nhận (2026-10-06, P2d)

| Câu hỏi | Quyết định |
| --- | --- |
| Đơn vị bị từ chối sau xuất kho xử lý thế nào? | Về nguồn trạng thái **cách ly**; nguồn kiểm tra lại rồi giải phóng hoặc hủy bỏ, kèm lý do |
| Bước vận chuyển | Tách: nguồn bàn giao VC (`in_transit`) → đích bấm "Đã nhận hàng" (`inbound_pending`) → đối chiếu nhập |
| Ai xác nhận lãnh đạo khi chưa có HĐ (prototype)? | Admin **hoặc** NV nguồn; bắt buộc lưu người, thời điểm, lý do |
| Từ chối vs hủy | Sau xuất kho chỉ **đích** được từ chối; nguồn / admin chỉ hủy **trước** xuất kho |
| Tương thích đơn vị | Khớp chặt nhóm ABO/Rh + chế phẩm; còn hạn ở mọi bước; không vượt số lượng còn thiếu; một đơn vị một điều chuyển mở |
| Đơn vị hết hạn trước deadline nhu cầu | Cho phép đề xuất nếu còn hạn tại thời điểm thao tác (kiểm tra lại ở mọi bước); matching chỉ xếp hạng thấp hơn qua thành phần T — không chặn cứng |
| Dải nhiệt vận chuyển | Tự động theo chế phẩm, backend từ chối nếu lệch; ghi nhiệt độ đo (tùy chọn) và tên người vận chuyển |
| Màu tồn kho trên UI | Dùng Coverage backend với ngưỡng cấu hình — không tự đặt ngưỡng |

### 6b. Còn mở (không tự đặt)

1. Ngưỡng an toàn kho cho thành phần điểm **A**?
2. Ai được map “xác nhận lãnh đạo / ủy quyền” trên **production** (chức danh, ủy quyền văn bản)?
3. Có bắt buộc hợp đồng trước mọi transfer không?
4. Ưu tiên thực địa BV←NHM vs BV↔BV? (Hệ thống cho cả hai nếu cờ nguồn bật.)
5. Map chi tiết Phụ lục 8 → schema sau khi tải toàn văn TT 26 từ vbpl.
6. Thời hạn lưu trữ hồ sơ / audit log trên production.
