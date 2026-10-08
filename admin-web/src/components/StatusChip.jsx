// tone → dot colour. Keeps red = danger, yellow = warning, green = safe.
const TONE = {
  proposed: 'neutral',
  source_confirmed: 'info',
  exported: 'info',
  in_transit: 'warn',
  inbound_pending: 'warn',
  received: 'safe',
  rejected: 'danger',
  cancelled: 'neutral',
}

export default function StatusChip({ status, label }) {
  return (
    <span className={`status-chip tone-${TONE[status] || 'neutral'}`}>
      <span className="dot" />
      {label}
    </span>
  )
}
