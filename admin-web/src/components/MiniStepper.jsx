const ORDER = ['proposed', 'source_confirmed', 'exported', 'in_transit', 'inbound_pending', 'received']

export default function MiniStepper({ status }) {
  const terminal = status === 'rejected' || status === 'cancelled'
  const idx = ORDER.indexOf(status)
  return (
    <span
      className={`mini-stepper${terminal ? ' is-terminal' : ''}`}
      role="img"
      aria-label={`Bước ${idx >= 0 ? idx + 1 : 0}/${ORDER.length}`}
    >
      {ORDER.map((s, i) => (
        <i key={s} className={!terminal && i < idx ? 'done' : !terminal && i === idx ? 'current' : ''} />
      ))}
    </span>
  )
}
