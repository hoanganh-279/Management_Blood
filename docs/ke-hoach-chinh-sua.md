# Kế hoạch chỉnh sửa — Hệ thống điều phối máu BV ↔ NHM

**Phiên bản:** 2.3  
**Ngày:** 2026-10-06  
**Nguồn:** [Product.md](../Product.md) · [README.md](../README.md) · [thiet-ke-he-thong.md](thiet-ke-he-thong.md) · [can-cu-phap-ly.md](can-cu-phap-ly.md)

Tài liệu này là kế hoạch chỉnh sửa / triển khai theo giai đoạn. Mọi thay đổi lớn phải hỏi trước và đồng bộ tài liệu (xem quy trình bên dưới).

---

## 1. Quy trình làm việc bắt buộc

1. **Hỏi trước, không tự hành động** — mô tả thay đổi → chờ đồng ý.
2. **Đọc đủ miền nghiệp vụ** — đọc toàn bộ file liên quan trước khi sửa (xem [AGENTS.md](../AGENTS.md)).
3. **Không đoán / không ảo hóa** — hỏi lại nghiệp vụ khi chưa rõ (ngưỡng, trọng số matching, RBAC, điều khoản pháp lý).
4. **UI** — tuân [`.cursor/rules/ui-ux-design.mdc`](../.cursor/rules/ui-ux-design.mdc).
5. **Đồng bộ tài liệu** — xem mục 2.

Rules Cursor: [`agent-change-policy.mdc`](../.cursor/rules/agent-change-policy.mdc), [`legal-tt26-coordination.mdc`](../.cursor/rules/legal-tt26-coordination.mdc), [`ui-ux-design.mdc`](../.cursor/rules/ui-ux-design.mdc). Skill: [`blood-coordination`](../.cursor/skills/blood-coordination/SKILL.md).

---

## 2. System Consistency & Change Documentation

Nếu thay đổi làm lệch nghiệp vụ / tổng quan hệ thống, **bắt buộc hỏi**:

> "Thay đổi này có được cập nhật vào file tài liệu nghiệp vụ để duy trì tổng quan và tính nhất quán của hệ thống không?"

Sau khi người dùng xác nhận: thực hiện thay đổi → cập nhật docs → kiểm tra Use Case / DB / API / UI liên quan.

---

## 3. Nguyên tắc thiết kế giao diện

Ánh xạ: **nội bộ** → `admin-web` (`staff_hospital`, `staff_bank`, `admin`).

### 3.1. Chung — checklist ship UI

Consistency · Visual hierarchy · Simplicity · Feedback · Accessibility.

### 3.2. Admin web (nội bộ)

- Efficiency & Speed; hierarchy cảnh báo thiếu máu / tồn thấp / hết hạn.
- Matching cơ sở: kèm điểm thành phần — không như chỉ định y tế / pháp lý bắt buộc.
- Transfer: danh sách + trang chi tiết `/transfers/:id` với **một CTA** theo status + role; bên còn lại thấy "Đang chờ …"; timeline có tên người thao tác; disclaimer DSS.
- Mỗi trang: trạng thái đang tải / lỗi (Thử lại) / rỗng; nhãn tiếng Việt dùng chung (`admin-web/src/utils/labels.js`); `controlId` cho form; dòng bảng điều hướng được bằng bàn phím.
- ConfirmModal: không xác nhận bằng Enter; lý do bắt buộc ≥ 3 ký tự có lỗi inline.
- Màu: **đỏ** nguy hiểm · **vàng** cảnh báo · **xanh** an toàn.
- **Ma trận thao tác (P2c):**
  - **S (Sensitive):** ConfirmModal review — đề xuất / xác nhận nguồn / xuất / VC / nhận / từ chối / hủy; đổi cờ cơ sở; CRUD user; gửi thông báo.
  - **M (Minor):** toast + Undo (~6s) — vd. đánh dấu cảnh báo xử lý.
  - **V (Validate):** lỗi inline; disable CTA khi thiếu điều kiện.
- Checklist Điều 20/40: giữ tick sẵn + **bắt buộc** ConfirmModal với câu xác nhận đã đối chiếu thực tế.
- OTP/ký số: không MVP — xem can-cu-phap-ly §5b.

---

## 4. Giai đoạn chỉnh sửa (P0–P5)

Công thức DSS: copy từ [Product.md](../Product.md) §5 (`Shortage`, `Coverage`, `Score`). **Trọng số và ngưỡng không tự đặt** — hỏi nghiệp vụ. **Không** gắn nhãn “theo BYT”.

| Giai đoạn | Nội dung | FR |
| --- | --- | --- |
| **P0 — Nền tảng** | Auth/RBAC 3 role; monorepo; migrations | FR01 |
| **P1 — Cơ sở & nhu cầu** | Facilities hospital/bank; BloodRequest; cờ cung cấp | FR03′, FR07 |
| **P2 — Kho** | Tồn kho, giao dịch `in`/`out` | FR06 |
| **P2b — Giao nhận TT26-min** | Lifecycle transfer + checklist VC/nhập + audit; bỏ atomic transfer | FR06b |
| **P2c — UX Confirm & efficiency** | ConfirmModal nhóm S; Review đề xuất; Undo nhóm M; validate/draft/hotkeys; gỡ atomic UI | FR06b, UI |
| **P2d — Tuân thủ nghiêm ngặt** | Tách bàn giao VC / đã nhận hàng; từ chối → cách ly + xét duyệt; hủy chỉ trước xuất; khớp chặt nhóm + chế phẩm, còn hạn mọi bước, giới hạn số lượng, một đơn vị một điều chuyển; khóa dải nhiệt theo chế phẩm; lý do lãnh đạo; nhập kho chỉ đơn vị mới; audit log + màn `/system/audit`; Coverage backend cho UI; gỡ thông tin đăng nhập điền sẵn; pytest `backend/tests` | FR06, FR06b, FR07, FR13 |
| **P3 — DSS lõi** | Shortage/Coverage; facility matching + MatchingLog (lọc `allowed_to_supply_others`) | FR08–FR09 |
| **P4 — Thông báo & báo cáo** | Notify nội bộ; dashboard KPI | FR11–FR12 |
| **P5 — Sau MVP** | Map Phụ lục 8; forecasting; IoT cold chain; **OTP/ký số** | FR10+ |

### Trạng thái hiện tại

Pivot MVP sang điều phối BV ↔ NHM (v2.0). **v2.1:** neo căn cứ TT 26 + lifecycle giao nhận (P2b). **v2.2:** P2c UX Confirm trên toàn admin-web — không rút gọn lifecycle; OTP để P5+. **v2.3:** P2d rà soát tuân thủ TT 26 — quyết định nghiệp vụ ghi tại [can-cu-phap-ly.md](can-cu-phap-ly.md) §6a; đặc tả UC01–UC13 tại Product §4.4. Checklist: [checklist-kiem-thu-transfer.md](checklist-kiem-thu-transfer.md).

---

## 5. Câu hỏi nghiên cứu

- **RQ1:** Phát hiện thiếu máu theo nhóm máu, khu vực, thời gian?
- **RQ2:** Xếp hạng cơ sở nguồn theo tồn dư, khoảng cách, hạn dùng, an toàn kho?
- **RQ3:** Dự báo nào phù hợp so với baseline?
- **RQ4:** Shortage + facility matching có cải thiện fulfill so với chọn nguồn thủ công?

---

## 6. Câu hỏi nghiệp vụ còn mở

Xem [can-cu-phap-ly.md](can-cu-phap-ly.md) §6.

---

## 7. Lịch sử thay đổi

| Phiên bản | Ngày | Mô tả |
| --- | --- | --- |
| 1.0–1.1 | 2026-09-15…17 | Kế hoạch khởi tạo + MVP scaffold |
| 2.0 | 2026-09-17 | Pivot BV ↔ NHM |
| 2.1 | 2026-09-24 | P2b TT26-min lifecycle; căn cứ pháp lý; tách DSS vs quy trình |
| 2.2 | 2026-09-24 | P2c UX Confirm & efficiency trên admin-web |
| 2.3 | 2026-10-06 | P2d tuân thủ nghiêm ngặt TT 26 (lifecycle, cách ly, khớp chặt, audit log, UI một CTA/bước, pytest) |
