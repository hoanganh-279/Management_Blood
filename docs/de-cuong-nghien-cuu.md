# ĐỀ CƯƠNG NGHIÊN CỨU VÀ KHẢO SÁT ĐỀ TÀI

# Hệ thống hỗ trợ quyết định điều phối nguồn máu giữa bệnh viện và ngân hàng máu

**Phục vụ:** định hướng nghiên cứu, thu thập dữ liệu và xây dựng prototype  
**Đối tượng đọc:** giảng viên hướng dẫn, hội đồng / người đọc ngoài nhóm kỹ thuật — có thể đọc lướt phần tổng quan để nắm hệ thống đang làm gì

---

## 0. TỔNG QUAN HỆ THỐNG (ĐỌC LƯỚT)

### Hệ thống là gì?

Đây là **hệ thống hỗ trợ quyết định (Decision Support System – DSS)** dựa trên dữ liệu. Hệ thống giúp nhân viên bệnh viện và ngân hàng máu:

1. Nhận biết nguy cơ **thiếu máu cục bộ** theo nhóm máu, địa điểm và thời điểm.
2. **Xếp hạng các cơ sở nguồn** (ngân hàng máu hoặc bệnh viện khác) có dư tồn phù hợp để đề xuất điều chuyển.
3. **Theo dõi giao nhận** từ lúc đề xuất đến khi máu được đối chiếu nhập tại kho đích, có ghi nhật ký các bước.

Hệ thống **đề xuất và hỗ trợ theo dõi** — không tự động coi kết quả máy tính là quyết định y tế hoặc điều chuyển có hiệu lực pháp lý.

### Hệ thống không làm gì?

- Không thay thế toàn bộ phần mềm bệnh viện (HIS/LIS).
- Không thay hợp đồng cung cấp máu hay thẩm quyền cấp phép của cơ quan quản lý.
- Không “chuyển tồn kho ảo” từ cơ sở A sang B trong một bước mà bỏ qua xác nhận và đối chiếu thực tế.

### Ai sử dụng? (ba nhóm người dùng)

| Người dùng | Việc chính trên hệ thống |
| --- | --- |
| **Nhân viên bệnh viện** | Tạo nhu cầu máu cho bệnh viện mình; theo dõi điều chuyển đến; **đối chiếu nhập** khi máu tới kho đích. |
| **Nhân viên ngân hàng máu** (hoặc kho nguồn) | Xem đề xuất; **xác nhận** cung cấp; **xuất kho**; ghi nhận checklist vận chuyển. |
| **Quản trị / điều phối** | Xem cảnh báo thiếu máu; chạy **xếp hạng cơ sở nguồn**; tạo đề xuất điều chuyển; giám sát tiến độ; xem báo cáo. |

### Vòng nghiệp vụ lõi (từ đầu đến cuối)

1. Bệnh viện **tạo nhu cầu** (nhóm máu, số lượng, thời hạn, mức ưu tiên).
2. Hệ thống so sánh nhu cầu với tồn kho → tính **mức thiếu hụt** và **độ phủ tồn**; cảnh báo nếu thiếu theo ngưỡng cấu hình.
3. Điều phối viên chạy **xếp hạng cơ sở nguồn** → nhận danh sách ưu tiên kèm lý do / điểm thành phần (chỉ đề xuất).
4. Tạo **đề xuất điều chuyển** gắn với nhu cầu và đơn vị máu dự kiến.
5. Cơ sở nguồn **xác nhận** (đơn vị máu được giữ lại chờ xuất). Nếu chưa có hợp đồng cung cấp, prototype cho phép bước xác nhận ủy quyền bổ sung — **không** tuyên bố đây là thẩm quyền lãnh đạo pháp lý thật.
6. **Xuất kho** tại nguồn; ghi **checklist vận chuyển** (tinh thần bảo quản / điều kiện vận chuyển).
7. Bệnh viện đích **đối chiếu** bao gói, nhãn, điều kiện trước khi nhập → **đã nhận** hoặc **từ chối**.
8. Chỉ khi **đã nhận**: cập nhật số lượng đã đáp ứng, cập nhật tồn kho đích, làm mới cảnh báo, ghi nhật ký hoàn thành.

```text
Nhu cầu → Phát hiện thiếu hụt → Xếp hạng cơ sở nguồn → Đề xuất
  → Nguồn xác nhận → Xuất kho → Checklist vận chuyển
  → Đối chiếu nhập → Hoàn thành nhu cầu + nhật ký
```

### Các trạng thái điều chuyển (bằng lời Việt)

**Đề xuất → Nguồn đã xác nhận → Đã xuất → Đang vận chuyển → Chờ nhập → Đã nhận** (hoặc **Từ chối** / **Hủy**).

Số lượng nhu cầu được tính là đã đáp ứng **chỉ sau khi đích xác nhận đã nhận** đúng quy trình đối chiếu — không cộng tồn ngay lúc đề xuất hay lúc xuất.

---

## 1. CƠ SỞ LÝ THUYẾT VÀ TỔNG QUAN TÀI LIỆU

### 1.1. Bối cảnh và vấn đề nghiên cứu

Máu là nguồn lực khan hiếm, có hạn dùng, phân bố không đều theo nhóm máu, địa điểm và thời điểm. Ba vấn đề trọng tâm:

1. Nguy cơ **thiếu máu cục bộ** tại bệnh viện theo nhóm máu và thời điểm.
2. Khó **tìm cơ sở nguồn** có dư tồn phù hợp để điều chuyển.
3. Nhu cầu, tồn kho và điều chuyển thường **phân mảnh**, thiếu vòng khép kín có xác nhận và đối chiếu.

Đề tài hướng tới lớp DSS **cấp cơ sở** (bệnh viện ↔ ngân hàng máu).

### 1.2. Khái niệm cần nghiên cứu

| Khái niệm | Giải thích ngắn |
| --- | --- |
| Quản lý tồn kho máu | Theo dõi đơn vị máu / chế phẩm; cân bằng thiếu hụt và lãng phí hết hạn tại từng cơ sở. |
| Chuỗi cung ứng máu liên cơ sở | Dự trù, giao nhận, vận chuyển, nhập kho, hồ sơ giữa cơ sở cung cấp và cơ sở khám chữa bệnh. |
| Xếp hạng cơ sở nguồn | Lọc và sắp xếp cơ sở có thể cung cấp theo mức phù hợp với nhu cầu. |
| Dự báo nhu cầu | Ước lượng nhu cầu theo nhóm máu, địa điểm, thời gian (hướng phát triển khi đủ lịch sử). |
| Hệ thống hỗ trợ quyết định (DSS) | Hỗ trợ con người ra quyết định bằng dữ liệu; không thay chuyên môn y tế hay thẩm quyền pháp lý. |
| Quy trình điều chuyển đa bước | Đề xuất → xác nhận → xuất → vận chuyển → đối chiếu nhập → hoàn thành / nhật ký; không chuyển tồn một bước. |

### 1.3. Nghiên cứu và giải pháp liên quan

**Tại Việt Nam**, phần mềm quản lý ngân hàng máu trên thị trường (ví dụ các hệ thống kiểu quản lý kho – cấp phát tại một cơ sở) mạnh về vận hành nội bộ, nhưng khoảng trống thường gặp là **lớp hỗ trợ điều phối liên cơ sở**: xếp hạng nguồn, đề xuất, theo dõi giao nhận có xác nhận hai phía và đối chiếu nhập.

**Trên thế giới**, nhiều nghiên cứu về quản lý tồn kho máu, dự báo nhu cầu, tối ưu chuỗi cung ứng và phân phối giữa điểm cung–cầu.

### 1.4. Khoảng trống nghiên cứu (giả thuyết cần kiểm chứng)

| Khoảng trống | Vấn đề quan sát (cần kiểm chứng) | Hướng đề xuất |
| --- | --- | --- |
| 1 | Nhu cầu bệnh viện, tồn kho nguồn và trạng thái điều chuyển nằm rời nhau | Mô hình dữ liệu thống nhất: cơ sở – tồn kho – nhu cầu – điều chuyển – nhật ký xếp hạng – nhật ký giao nhận |
| 2 | Chọn nguồn thủ công hoặc chỉ theo nhóm máu / khoảng cách | Điểm phù hợp đa tiêu chí + danh sách ưu tiên có giải thích |
| 3 | Nhìn tổng tồn cả mạng, bỏ qua thiếu cục bộ theo nơi và thời điểm | Chỉ số thiếu hụt / độ phủ theo nhóm máu, địa điểm, thời gian |
| 4 | Cảnh báo hoặc đề xuất không gắn vòng xác nhận–xuất–vận chuyển–nhập | Quy trình đa bước; chỉ cập nhật đáp ứng nhu cầu sau khi đã nhận |
| 5 | Hệ thống chạy được nhưng chưa đo hiệu quả điều phối | Đánh giá bằng độ chính xác danh sách nguồn, tỷ lệ đáp ứng nhu cầu, tỷ lệ thiếu / hết hạn |

### 1.5. Định hướng tính mới

1. Phát hiện thiếu máu theo **không gian–thời gian** (nhóm máu × địa điểm × thời gian).
2. Xếp hạng **cơ sở nguồn** đa tiêu chí, danh sách ưu tiên **giải thích được**, có nhật ký lần chạy.
3. Vòng **giao nhận đa bước** có người xác nhận, tách thuật toán nghiên cứu khỏi hiệu lực pháp lý / quyết định y tế.

Đóng góp cần chứng minh bằng prototype và chỉ số — không dựa vào gắn nhãn “AI”. Dự báo nhu cầu là hướng bổ sung khi đủ dữ liệu lịch sử.

### 1.6. Cơ sở toán học và thuật toán dự kiến

> Các công thức dưới đây là **heuristic nghiên cứu / cấu hình nhóm** — **không** phải quy định của Bộ Y tế. Không gắn nhãn “theo BYT”.

**(a) Mức thiếu hụt (Shortage)**

Thiếu hụt theo nhóm máu \(g\), thời điểm \(t\), địa điểm \(l\):

\[
\text{Shortage}(g,t,l) = \text{Demand}(g,t,l) - \text{Inventory}(g,t,l)
\]

- **Demand:** nhu cầu (quan sát hoặc kỳ vọng).
- **Inventory:** tồn kho sẵn sàng tại địa điểm đó.
- Giá trị dương → còn thiếu so với nhu cầu.

**(b) Độ phủ tồn kho (Coverage)**

\[
\text{Coverage} = \frac{\text{Inventory}}{\text{Expected Demand}}
\]

So sánh tồn hiện có với nhu cầu kỳ vọng. Ngưỡng cảnh báo do nhóm cấu hình — **không** phải ngưỡng y tế chính thức.

**(c) Khoảng cách địa lý**

Dùng công thức Haversine giữa vị trí cơ sở nguồn và bệnh viện nhận (đưa vào thành phần khoảng cách của điểm xếp hạng).

**(d) Điểm xếp hạng cơ sở nguồn**

\[
\text{Score} = w_1 B + w_2 D + w_3 T + w_4 A + w_5 R
\]

| Thành phần | Ý nghĩa bằng lời |
| --- | --- |
| \(B\) | Nguồn có đủ đơn vị đúng nhóm máu (và chế phẩm liên quan) so với nhu cầu |
| \(D\) | Thuận lợi về khoảng cách nguồn → bệnh viện nhận |
| \(T\) | Hạn dùng của máu còn phù hợp với thời hạn cần máu |
| \(A\) | Mức dư tồn so với ngưỡng an toàn tại nguồn (**cấu hình nghiên cứu** — chưa xác nhận nghiệp vụ chính thức) |
| \(R\) | Tỷ lệ hoàn thành điều chuyển trong lịch sử (độ tin cậy vận hành) |
| \(w_1 \ldots w_5\) | Trọng số cấu hình; bản prototype mặc định: 0,35 / 0,25 / 0,15 / 0,15 / 0,10 |

**Điều kiện lọc:** chỉ xét cơ sở **được phép cung cấp máu cho cơ sở khác** (cờ cấu hình trên hồ sơ cơ sở).

**Đầu ra:** danh sách ưu tiên (Top-K) kèm điểm từng thành phần để giải thích; lưu **nhật ký lần xếp hạng**. Kết quả xếp hạng **không** thay quyết định cấp phát lâm sàng (tinh thần Điều 38 Thông tư 26/2013/TT-BYT).

**(e) Dự báo nhu cầu (giai đoạn sau)**

So sánh phương pháp cơ sở (trung bình động / làm mượt mũ) trước khi cân nhắc mô hình phức tạp hơn. Đánh giá sai số khi có đủ dữ liệu.

### 1.7. Căn cứ và giới hạn pháp lý

Khảo sát chính: **Thông tư 26/2013/TT-BYT** về hoạt động truyền máu.

| Nội dung điều (tinh thần) | Ý nghĩa với hệ thống |
| --- | --- |
| Giao nhận giữa các cơ sở | Hệ thống chỉ đề xuất → lập yêu cầu → xác nhận hai phía → ghi hồ sơ; **không** tự động điều chuyển có hiệu lực pháp lý |
| Vận chuyển / bảo quản | Giai đoạn đầu: ghi nhận checklist; không bắt buộc cảm biến IoT |
| Nhập kho tại đơn vị nhận | Đối chiếu bao gói, nhãn, điều kiện — không chỉ cộng số tồn |
| Nguyên tắc cấp phát | Điểm máy tính không thay quyết định cấp phát lâm sàng |
| Hồ sơ / theo dõi | Nhật ký xếp hạng nguồn và nhật ký từng bước điều chuyển |

**Tách hai lớp:**

| Lớp | Nội dung | Có gắn “theo Bộ Y tế”? |
| --- | --- | --- |
| Tuân thủ quy trình | Các bước giao nhận, checklist vận chuyển / nhập, nhật ký, cờ “được phép cung cấp cho nơi khác” | Chỉ ánh xạ *tinh thần* quy trình — không mô phỏng cấp phép |
| Thuật toán DSS | Shortage, Coverage, điểm B/D/T/A/R | **Không** — heuristic nghiên cứu |

Không viết như thể đã có “Luật hiến máu nhân đạo” riêng cho điều phối liên bệnh viện.

Hệ thống **không** thay thế quyết định chuyên môn, hợp đồng cung cấp máu, hay thẩm quyền cấp phép của cơ quan quản lý.

---

## 2. YÊU CẦU BÀI TOÁN VÀ NGƯỜI DÙNG

### 2.1. Mục tiêu

1. Quản lý tập trung thông tin cơ sở (bệnh viện / ngân hàng máu), tồn kho, nhu cầu và điều chuyển liên cơ sở.
2. Phát hiện nguy cơ thiếu máu theo nhóm máu, khu vực và thời gian.
3. Hỗ trợ tìm và xếp hạng cơ sở nguồn phù hợp.
4. Hỗ trợ quy trình giao nhận đa bước đến khi đối chiếu nhập và ghi nhật ký.
5. Cung cấp bảng theo dõi, cảnh báo và thông báo nội bộ.
6. Đánh giá phương pháp đề xuất bằng chỉ số định lượng.

### 2.2. Người dùng (xem thêm mục 0)

Ba vai trò: nhân viên bệnh viện, nhân viên ngân hàng máu (kho nguồn), quản trị / điều phối — tất cả làm việc trên **giao diện web quản trị**, phân quyền theo vai trò.

### 2.3. Chức năng chính (giai đoạn đầu)

| Chức năng | Mô tả ngắn | Có trong giai đoạn đầu? |
| --- | --- | --- |
| Quản lý tài khoản | Đăng nhập, xác thực, phân quyền theo vai trò | Có |
| Quản lý cơ sở | Hồ sơ bệnh viện / ngân hàng máu: địa điểm, loại, tọa độ; cờ được phép cung cấp cho nơi khác; cờ có hợp đồng cung cấp (cấu hình) | Có |
| Quản lý tồn kho | Đơn vị máu / chế phẩm, hạn dùng, trạng thái; ghi nhận nhập–xuất | Có |
| Điều chuyển đa bước | Đề xuất → xác nhận nguồn → xuất → checklist vận chuyển → đối chiếu nhập → đã nhận / từ chối; nhật ký từng bước; gắn với nhu cầu | Có |
| Quản lý nhu cầu | Tạo yêu cầu theo nhóm máu, số lượng, bệnh viện nhận, thời hạn, ưu tiên | Có |
| Xếp hạng cơ sở nguồn | Lọc nguồn được phép cung cấp; tính điểm; xếp hạng ưu tiên; nhật ký lần chạy | Có |
| Cảnh báo | Thiếu hụt, tồn thấp, gần hết hạn theo ngưỡng cấu hình | Có |
| Phân tích / dự báo | Thống kê lịch sử; dự báo khi đủ dữ liệu | Thống kê: có · Dự báo: sau giai đoạn đầu |
| Thông báo nội bộ | Báo nhân viên về đề xuất, từng bước điều chuyển, hoàn thành | Có |
| Báo cáo | Tồn kho, nhu cầu, điều chuyển, hiệu quả điều phối | Có |

**Ngoài giai đoạn đầu:** thay thế đầy đủ HIS/LIS; xác thực OTP / chữ ký số (hướng sản xuất sau).

### 2.4. Yêu cầu phi chức năng (tóm tắt)

- Thời gian phản hồi phù hợp quy mô prototype khi tra cứu và xếp hạng nguồn.
- Bảo mật: đăng nhập, phân quyền theo vai trò.
- Riêng tư: chỉ thu thập dữ liệu cần thiết; hạn chế xem nhu cầu và tồn kho nhạy cảm theo vai trò.
- Tin cậy: tồn kho và số lượng đáp ứng nhu cầu thống nhất với quy trình điều chuyển.
- Minh bạch: kết quả xếp hạng giải thích được; không trình bày như chỉ định y tế hay quyết định pháp lý bắt buộc.
- Nhật ký: lưu các lần chuyển bước điều chuyển và các lần chạy xếp hạng nguồn.
- Dễ bảo trì: tách giao diện, nghiệp vụ máy chủ và dữ liệu rõ ràng.

---

## 3. DỮ LIỆU CẦN THU THẬP

### 3.1. Loại thông tin nghiệp vụ

| Loại thông tin | Nội dung gợi ý | Dùng để |
| --- | --- | --- |
| Cơ sở | Tên, loại (bệnh viện / ngân hàng máu), vị trí, được phép cung cấp cho nơi khác hay không, có hợp đồng cung cấp hay không | Xếp hạng nguồn, điều phối |
| Đơn vị máu | Nhóm máu, chế phẩm, hạn dùng, trạng thái, đang ở cơ sở nào | Tồn kho |
| Giao dịch kho | Nhập / xuất, thời điểm, có gắn điều chuyển hay không | Theo dõi tồn |
| Nhu cầu máu | Nhóm máu, số lượng, nơi cần, thời hạn, ưu tiên | Thiếu hụt, xếp hạng |
| Phiếu điều chuyển | Nguồn, đích, nhu cầu liên quan, trạng thái, checklist vận chuyển / nhập | Quy trình giao nhận |
| Nhật ký bước điều chuyển | Ai chuyển bước, từ trạng thái nào sang trạng thái nào, khi nào | Kiểm soát / đối chiếu |
| Nhật ký xếp hạng nguồn | Nhu cầu nào, danh sách ưu tiên, điểm từng tiêu chí, trọng số, thời điểm | Giải thích đề xuất |
| Cảnh báo | Loại thiếu / tồn thấp / hết hạn, cơ sở, nhóm máu | Theo dõi rủi ro |
| Thông báo nội bộ | Loại, người nhận, đã đọc / chưa | Vận hành |
| Lịch sử nhu cầu / sử dụng | Theo thời gian và cơ sở | Dự báo (giai đoạn sau) |

### 3.2. Nguồn thứ cấp

- Văn bản pháp lý liên quan truyền máu (trọng tâm Thông tư 26/2013/TT-BYT).
- Thông tin công khai từ Viện Huyết học – Truyền máu Trung ương, bệnh viện, cơ sở truyền máu (khi được phép).
- Bài báo khoa học về tồn kho máu, dự báo nhu cầu, chuỗi cung ứng / phân phối máu, DSS trong logistics y tế.
- Bộ dữ liệu công khai phù hợp giấy phép (nếu có).

### 3.3. Nguồn sơ cấp

- Phỏng vấn nhân viên bệnh viện / ngân hàng máu / điều phối về quy trình giao nhận thực tế.
- Dữ liệu vận hành từ prototype (cảnh báo, đề xuất, điều chuyển).
- Nếu chưa có dữ liệu thật: dùng **bộ dữ liệu mô phỏng**, ghi rõ nguồn và giả định.

### 3.4. Nguyên tắc

- Không thu thập dữ liệu cá nhân / y tế ngoài mục tiêu nghiên cứu và vận hành hệ thống.
- Không dùng dữ liệu bệnh nhân thật khi chưa có quyền và biện pháp bảo vệ phù hợp.
- Ghi nguồn, thời gian, giấy phép và chất lượng từng bộ dữ liệu.
- Có từ điển dữ liệu (mô tả từng loại thông tin bằng lời nghiệp vụ).

---

## 4. PHƯƠNG PHÁP NGHIÊN CỨU VÀ THỰC NGHIỆM

1. Khảo sát tài liệu (tồn kho, dự báo, phân phối liên cơ sở, DSS).
2. Khảo sát nghiệp vụ và khung pháp lý (tinh thần giao nhận / vận chuyển / nhập / hồ sơ theo Thông tư 26); ghi các câu hỏi nghiệp vụ còn mở — **không tự đặt ngưỡng**.
3. Thiết kế mô hình thông tin và bộ dữ liệu thử nghiệm (ưu tiên dữ liệu mô phỏng có ghi chú).
4. Xây phương pháp cơ sở: chọn nguồn thủ công hoặc lọc đơn giản (nhóm máu + khoảng cách).
5. Xây phương pháp đề xuất: thiếu hụt / độ phủ + xếp hạng đa tiêu chí + nhật ký.
6. Tích hợp quy trình điều chuyển đa bước, cảnh báo và báo cáo trên prototype.
7. So sánh phương pháp cơ sở với phương pháp đề xuất bằng chỉ số mục 7.
8. Phân tích lợi ích, giới hạn dữ liệu / mô hình, rủi ro hiểu nhầm DSS, hướng phát triển.

---

## 5. CÂU HỎI NGHIÊN CỨU

1. Làm thế nào phát hiện nguy cơ thiếu máu theo nhóm máu, khu vực và khoảng thời gian từ dữ liệu nhu cầu và tồn kho?
2. Làm thế nào xếp hạng cơ sở nguồn theo tồn đúng nhóm, khoảng cách, hạn dùng, mức an toàn kho (cấu hình) và lịch sử điều chuyển?
3. Phương pháp dự báo nào phù hợp và có cải thiện so với phương pháp cơ sở khi đã có đủ lịch sử? *(giai đoạn sau)*
4. Kết hợp phát hiện thiếu hụt với xếp hạng nguồn và quy trình giao nhận có cải thiện tỷ lệ đáp ứng nhu cầu / chất lượng chọn nguồn so với chọn thủ công hoặc lọc đơn giản hay không?

---

## 6. CHỈ SỐ ĐÁNH GIÁ (KPI)

| Nhóm | Chỉ số | Ý nghĩa |
| --- | --- | --- |
| Xếp hạng nguồn | Độ chính xác trong K đề xuất hàng đầu (Precision@K) | Danh sách ưu tiên có đúng nguồn “tốt” theo tiêu chí đánh giá hay không |
| Điều phối | Tỷ lệ nhu cầu được đáp ứng | Chỉ tính sau khi đích **đã nhận** theo đúng quy trình |
| Kho | Tỷ lệ thiếu hụt | Mức độ thiếu so với nhu cầu |
| Kho | Tỷ lệ lãng phí / hết hạn | Máu không dùng được kịp thời |
| Dự báo (sau) | Sai số dự báo (MAE / RMSE / MAPE) | Chất lượng dự báo khi có dữ liệu |
| Hệ thống | Thời gian phản hồi | Trải nghiệm tra cứu / xếp hạng trên prototype |

---

## 7. NGUỒN THAM KHẢO BAN ĐẦU

1. Bộ Y tế. Thông tư 26/2013/TT-BYT quy định hướng dẫn hoạt động truyền máu.
2. Các sản phẩm / giới thiệu phần mềm quản lý ngân hàng máu trên thị trường Việt Nam (đối chứng chức năng kho / vận hành tại một cơ sở).
3. Nghiên cứu quốc tế về quản lý tồn kho máu, dự báo nhu cầu máu, tối ưu chuỗi cung ứng / phân phối máu, hỗ trợ quyết định trong logistics y tế.
4. Cổng thông tin văn bản pháp luật chính thức để đối chiếu toàn văn khi khảo sát chính thức.

*(Danh mục sẽ bổ sung trích dẫn đầy đủ trong giai đoạn tổng quan tài liệu chi tiết.)*

---

## 8. KẾ HOẠCH CÔNG VIỆC TIẾP THEO

| Ưu tiên | Công việc | Đầu ra |
| --- | --- | --- |
| 1 | Khảo sát 15–30 tài liệu / bài báo liên quan | Bảng tổng quan tài liệu + khoảng trống |
| 2 | So sánh giải pháp Việt Nam và quốc tế | Bảng chức năng & khoảng trống điều phối liên cơ sở |
| 3 | Phỏng vấn / khảo sát nghiệp vụ + neo Thông tư 26 | Use case, quy trình, danh sách câu hỏi còn mở |
| 4 | Xác định nguồn dữ liệu / dữ liệu mô phỏng | Từ điển dữ liệu + danh mục nguồn |
| 5 | Thiết kế phương pháp chọn nguồn cơ sở | Lọc đơn giản / thủ công có mô tả |
| 6 | Thiết kế xếp hạng đa tiêu chí + nhật ký | Điểm B/D/T/A/R + danh sách ưu tiên giải thích được |
| 7 | Thiết kế kiến trúc logic và quy trình trạng thái | Sơ đồ hệ thống + chuỗi trạng thái điều chuyển |
| 8 | Xây prototype | Giao diện web quản trị + dịch vụ nghiệp vụ + dữ liệu + bảng theo dõi |
| 9 | Thực nghiệm | Bộ chỉ số + kết quả so sánh + phân tích giới hạn |

---

## 9. KẾT LUẬN ĐỊNH HƯỚNG

Hướng có tiềm năng của đề tài là **hỗ trợ quyết định dựa trên dữ liệu** giữa bệnh viện và ngân hàng máu: phát hiện thiếu theo nhóm máu–địa điểm–thời gian, xếp hạng cơ sở nguồn có giải thích, và theo dõi giao nhận đa bước theo tinh thần Thông tư 26/2013/TT-BYT.

Giai đoạn đầu ưu tiên: (1) phát hiện thiếu hụt không gian–thời gian; (2) xếp hạng cơ sở nguồn có nhật ký; (3) gắn chúng vào quy trình điều chuyển đến khi đối chiếu nhập và cập nhật đáp ứng nhu cầu. Dự báo nhu cầu bổ sung khi đủ lịch sử. Trí tuệ nhân tạo / học máy chỉ cân nhắc sau khi có dữ liệu và phương pháp cơ sở rõ ràng — không phải mục tiêu tự thân.

Thuật toán DSS là heuristic nghiên cứu / cấu hình. Kết quả xếp hạng **không** thay quyết định chuyên môn y tế và **không** tạo hiệu lực pháp lý tự động cho điều chuyển máu.

---

## Phụ lục A. Hướng triển khai kỹ thuật (tóm tắt)

Prototype dự kiến gồm ba lớp: **giao diện web quản trị** cho nhân viên; **dịch vụ nghiệp vụ qua giao diện lập trình (API)** xử lý tồn kho, nhu cầu, phát hiện thiếu, xếp hạng nguồn và quy trình điều chuyển; **cơ sở dữ liệu quan hệ** lưu hồ sơ vận hành và nhật ký. Người dùng chỉ thao tác qua giao diện web; toàn bộ tính điểm và chuyển trạng thái điều chuyển thực hiện phía máy chủ nghiệp vụ, có phân quyền theo vai trò.

Chi tiết công nghệ cụ thể thuộc tài liệu thiết kế kỹ thuật nội bộ nhóm — **không** dùng tên thư mục hay tên tệp nguồn để giải thích thuật toán hay luồng nghiệp vụ trong đề cương này.
