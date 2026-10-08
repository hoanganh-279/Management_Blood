import { Badge } from 'react-bootstrap'

const STEPS = [
  { key: 'proposed', label: 'Đề xuất' },
  { key: 'source_confirmed', label: 'Nguồn xác nhận' },
  { key: 'exported', label: 'Xuất kho' },
  { key: 'in_transit', label: 'Vận chuyển' },
  { key: 'inbound_pending', label: 'Đã tới — chờ đối chiếu' },
  { key: 'received', label: 'Đã nhận' },
]

const TERMINAL = {
  rejected: { label: 'Bị từ chối — đơn vị cách ly tại nguồn', variant: 'danger' },
  cancelled: { label: 'Đã hủy trước khi xuất kho', variant: 'dark' },
}

/**
 * `events` lets terminal transfers show how far they got before rejection/cancellation.
 */
export default function TransferStepIndicator({ status, events = [] }) {
  const terminal = TERMINAL[status]
  let reachedIdx
  if (terminal) {
    const reached = events.map((e) => STEPS.findIndex((s) => s.key === e.to_status)).filter((i) => i >= 0)
    reachedIdx = reached.length ? Math.max(...reached) : 0
  } else {
    reachedIdx = Math.max(0, STEPS.findIndex((s) => s.key === status))
  }

  return (
    <div className="mb-3">
      <ol className="d-flex flex-wrap gap-1 list-unstyled mb-1" aria-label="Tiến trình điều chuyển">
        {STEPS.map((step, i) => {
          let variant = 'light'
          let current = false
          if (i < reachedIdx || (status === 'received' && i === reachedIdx)) variant = 'success'
          else if (i === reachedIdx) {
            variant = terminal ? 'secondary' : 'primary'
            current = !terminal
          }
          return (
            <li key={step.key}>
              <Badge
                bg={variant}
                text={variant === 'light' ? 'dark' : undefined}
                className="fw-normal"
                aria-current={current ? 'step' : undefined}
              >
                {i + 1}. {step.label}
              </Badge>
            </li>
          )
        })}
      </ol>
      {terminal && <Badge bg={terminal.variant}>{terminal.label}</Badge>}
    </div>
  )
}
