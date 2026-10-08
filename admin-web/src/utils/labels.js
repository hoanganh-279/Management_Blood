// Shared Vietnamese labels for API enum values. Colour: red = danger only, yellow = warning, green = safe.

export const TRANSFER_STATUS_LABEL = {
  proposed: 'Đề xuất',
  source_confirmed: 'Nguồn đã xác nhận',
  exported: 'Đã xuất kho',
  in_transit: 'Đang vận chuyển',
  inbound_pending: 'Đã tới — chờ đối chiếu',
  received: 'Đã nhận',
  rejected: 'Bị từ chối',
  cancelled: 'Đã hủy',
}

export const TRANSFER_STATUS_VARIANT = {
  proposed: 'secondary',
  source_confirmed: 'info',
  exported: 'primary',
  in_transit: 'primary',
  inbound_pending: 'warning',
  received: 'success',
  rejected: 'danger',
  cancelled: 'dark',
}

export const OPEN_TRANSFER_STATUSES = ['proposed', 'source_confirmed', 'exported', 'in_transit', 'inbound_pending']

export const UNIT_STATUS_LABEL = {
  ready: 'Sẵn sàng',
  critical: 'Sẵn sàng (sắp hết hạn)',
  reserved: 'Đã giữ chỗ',
  transferred: 'Đang điều chuyển',
  used: 'Đã cấp phát',
  expired: 'Hết hạn',
  quarantine: 'Cách ly',
  discarded: 'Đã hủy bỏ',
}

export const UNIT_STATUS_VARIANT = {
  ready: 'success',
  critical: 'warning',
  reserved: 'info',
  transferred: 'primary',
  used: 'secondary',
  expired: 'dark',
  quarantine: 'danger',
  discarded: 'dark',
}

export const PRODUCT_LABEL = {
  PRBC: 'Khối hồng cầu (HC)',
  WB: 'Máu toàn phần',
  PLT: 'Khối tiểu cầu (TC)',
  WBC: 'Khối bạch cầu (BC)',
  FFP: 'Huyết tương đông lạnh',
  CRYO: 'Tủa lạnh',
}

export const PRODUCT_TYPES = Object.keys(PRODUCT_LABEL)

export const BLOOD_TYPES = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']

export const TEMP_BAND_LABEL = {
  '1_to_10C': '1–10°C (máu toàn phần / hồng cầu)',
  '20_to_24C': '20–24°C (tiểu cầu / bạch cầu)',
  le_minus_18C: '≤ −18°C (huyết tương đông lạnh / tủa)',
}

export const PRIORITY_LABEL = {
  normal: 'Thường',
  urgent: 'Khẩn',
  flash: 'Cấp cứu',
}

export const PRIORITY_VARIANT = {
  normal: 'secondary',
  urgent: 'warning',
  flash: 'danger',
}

export const DEMAND_STATUS_LABEL = {
  open: 'Mở',
  matching: 'Đang điều phối',
  fulfilled: 'Đã đáp ứng',
  cancelled: 'Đã hủy',
}

export const REQUEST_STATUS_LABEL = DEMAND_STATUS_LABEL

export const REQUEST_STATUS_VARIANT = {
  open: 'warning',
  matching: 'info',
  fulfilled: 'success',
  cancelled: 'dark',
}

export const SEVERITY_LABEL = {
  critical: 'Nghiêm trọng',
  warning: 'Cảnh báo',
  info: 'Thông tin',
}

export const SEVERITY_VARIANT = {
  critical: 'danger',
  warning: 'warning',
  info: 'secondary',
}

export const ALERT_STATUS_LABEL = {
  open: 'Mở',
  processing: 'Đang xử lý',
  resolved: 'Đã xử lý',
}

export const ROLE_LABEL = {
  admin: 'Quản trị / điều phối',
  staff_bank: 'NV ngân hàng máu',
  staff_hospital: 'NV bệnh viện',
}

export const FACILITY_TYPE_LABEL = {
  hospital: 'Bệnh viện',
  bank: 'Ngân hàng máu',
}

export const OUT_REASON_LABEL = {
  issued: 'Cấp phát sử dụng',
  discarded: 'Hủy bỏ',
  expired: 'Hết hạn',
}

export const TX_REASON_LABEL = {
  receipt: 'Nhập đơn vị mới',
  issued: 'Cấp phát sử dụng',
  discarded: 'Hủy bỏ',
  expired: 'Hết hạn',
  transfer_out: 'Xuất theo điều chuyển',
  transfer_in: 'Nhập sau đối chiếu điều chuyển',
  return_quarantine: 'Trả về nguồn — cách ly',
}

export const COVERAGE_LEVEL_LABEL = {
  critical: 'Dưới ngưỡng nghiêm trọng',
  warning: 'Dưới ngưỡng cảnh báo',
  ok: 'Đạt ngưỡng',
  no_demand: 'Không có nhu cầu mở',
}

export const COVERAGE_LEVEL_CLASS = {
  critical: 'critical',
  warning: 'warn',
  ok: 'ok',
  no_demand: 'none',
}

export function label(map, key) {
  return (key && map[key]) || key || '—'
}

export function fmtDateTime(v) {
  return v ? new Date(v).toLocaleString('vi-VN') : '—'
}

export function apiError(err, fallback = 'Thao tác thất bại.') {
  const d = err?.response?.data?.detail
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join('; ')
  return d || fallback
}
