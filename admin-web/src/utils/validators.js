const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(value) {
  if (!value?.trim()) return 'Email bắt buộc.'
  if (!EMAIL_RE.test(value.trim())) return 'Email không đúng định dạng.'
  return ''
}

export function validateRequired(value, label = 'Trường này') {
  if (value == null || String(value).trim() === '') return `${label} bắt buộc.`
  return ''
}

export function validateQty(value, { min = 1, max = 9999 } = {}) {
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return 'Số lượng phải là số nguyên.'
  if (n < min) return `Số lượng tối thiểu ${min}.`
  if (n > max) return `Số lượng tối đa ${max}.`
  return ''
}

export function validateDeadline(localDatetime) {
  if (!localDatetime) return 'Hạn bắt buộc.'
  const t = new Date(localDatetime).getTime()
  if (Number.isNaN(t)) return 'Hạn không hợp lệ.'
  if (t <= Date.now()) return 'Hạn phải ở tương lai.'
  return ''
}

export function validatePassword(value, { min = 6 } = {}) {
  if (!value || value.length < min) return `Mật khẩu tối thiểu ${min} ký tự.`
  return ''
}
