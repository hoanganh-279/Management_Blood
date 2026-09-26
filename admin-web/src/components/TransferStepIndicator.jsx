import { Badge } from 'react-bootstrap'

const STEPS = [
  { key: 'proposed', label: 'Đề xuất' },
  { key: 'source_confirmed', label: 'Xác nhận nguồn' },
  { key: 'exported', label: 'Xuất kho' },
  { key: 'in_transit', label: 'VC' },
  { key: 'inbound_pending', label: 'Chờ nhập' },
  { key: 'received', label: 'Đã nhận' },
]

const TERMINAL = {
  rejected: 'Từ chối',
  cancelled: 'Hủy',
}

export default function TransferStepIndicator({ status }) {
  if (TERMINAL[status]) {
    return (
      <div className="mb-3">
        <Badge bg="dark">{TERMINAL[status]}</Badge>
      </div>
    )
  }

  const idx = STEPS.findIndex((s) => s.key === status)
  const activeIdx = idx >= 0 ? idx : 0

  return (
    <div className="d-flex flex-wrap gap-1 mb-3" role="list" aria-label="Tiến trình điều chuyển">
      {STEPS.map((step, i) => {
        let variant = 'light'
        let textClass = 'text-secondary'
        if (i < activeIdx) {
          variant = 'success'
          textClass = ''
        } else if (i === activeIdx) {
          variant = 'danger'
          textClass = ''
        }
        return (
          <Badge
            key={step.key}
            bg={variant}
            text={variant === 'light' ? 'dark' : undefined}
            className={`${textClass} fw-normal`}
            role="listitem"
          >
            {i + 1}. {step.label}
          </Badge>
        )
      })}
    </div>
  )
}
