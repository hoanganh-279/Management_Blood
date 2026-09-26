# Căn cứ & giới hạn pháp lý — Management Blood

**Phiên bản:** 1.1  
**Ngày:** 2026-09-24  
**Phạm vi:** MVP DSS điều phối BV ↔ NHM (hướng compliance tối thiểu)  
**Không phải** tư vấn pháp lý; dùng để neo khảo sát và giới hạn thiết kế hệ thống.

Khảo sát chính thức nên đối chiếu **toàn văn** trên [vbpl.vn](https://vbpl.vn) / Công báo. Một số trang tổng hợp (vd. thuvienphapluat) có thể bị Cloudflare chặn khi fetch tự động.

---

## 1. Bộ khung văn bản (mốc khảo sát)

| Văn bản | Vai trò với đề tài | Ghi chú |
| --- | --- | --- |
| **Thông tư 26/2013/TT-BYT** | Trục chính truyền máu: lấy–XN–điều chế–bảo quản–vận chuyển–quản lý–sử dụng; giao nhận giữa cơ sở; hồ sơ–báo cáo | Nền kỹ thuật hiện hành cho bài toán điều phối liên cơ sở |
| Thông tư 15/2023/TT-BYT | Giá tối đa / chi phí đơn vị máu, chế phẩm | Không thay quy trình điều phối; hữu ích nếu sau có module chi phí |
| Thông tư 04/2014/TT-BYT | Điều kiện cơ sở hiến máu CTĐ | Ngoài trọng tâm MVP (không module hiến) |
| Quyết định 43/2000/QĐ-TTg | Vận động hiến máu tình nguyện | Ngoài phạm vi DSS kho |
| Luật HĐ chữ thập đỏ + NĐ 03/2011/NĐ-CP | Khung hoạt động CTĐ | Hữu ích nếu có actor CTĐ; không phải luật điều phối BV–BV |
| Quyết định 235/QĐ-TTg | Ban Chỉ đạo vận động hiến máu | Tổ chức vận động — không quy định workflow transfer |
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
Xác nhận nguồn (+ leadership_confirmed nếu chưa có HĐ — prototype)
        ↓
Xuất kho nguồn → vận chuyển (checklist Điều 20) → đối chiếu nhập (Điều 40)
        ↓
Hồ sơ giao nhận (transfer_events / audit)
```

| Actor hệ thống | Ý nghĩa nghiệp vụ (prototype) |
| --- | --- |
| `staff_hospital` | NV đơn vị phát máu / điều phối tại KCB; đối chiếu nhập tại đích |
| `staff_bank` | NV cơ sở cung cấp / NHM; xác nhận nguồn, xuất, checklist VC |
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
| Audit thao tác nhạy cảm | TT 26 Điều 61 + ATTT BYT | `transfer_events` / MatchingLog |
| Modal xác nhận trước bước giao nhận | **Không** phải điều khoản TT 26 — biện pháp UX chống nhầm | Có (ConfirmModal) |
| OTP / chữ ký số / sinh trắc | NĐ 137 / TT 53 / QĐ 326 — hướng production | **Hook docs only** — chưa implement |
| Wizard UX / phím tắt / auto-save nháp | Không có trong TT 26 | Cấu hình UX nội bộ |

**Không** gắn nhãn “theo BYT” cho ConfirmModal, hotkey, hay checklist UI. Checklist VC/nhập chỉ **ánh xạ tinh thần** Điều 20/40.

---

## 6. Câu hỏi nghiệp vụ còn mở (không tự đặt)

1. Ngưỡng an toàn kho cho thành phần điểm **A**?
2. Ai được map “xác nhận lãnh đạo / ủy quyền” trên production?
3. Có bắt buộc hợp đồng trước mọi transfer không?
4. Ưu tiên thực địa BV←NHM vs BV↔BV? (Hệ thống cho cả hai nếu cờ nguồn bật.)
5. Map chi tiết Phụ lục 8 → schema sau khi tải toàn văn TT 26 từ vbpl.
