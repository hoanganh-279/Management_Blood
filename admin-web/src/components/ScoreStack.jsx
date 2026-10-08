// Stacked bar for the DSS score: each segment is w_i * 100 * x_i, so the full bar = 100 points.
// Colours are deliberately NOT red/yellow/green (those are reserved for alert severity).
export const SCORE_PARTS = [
  { key: 'B', label: 'Tồn đúng nhóm', color: '#4f46e5' },
  { key: 'D', label: 'Khoảng cách', color: '#0d9488' },
  { key: 'T', label: 'Hạn dùng', color: '#0ea5e9' },
  { key: 'A', label: 'Dư an toàn', color: '#8b5cf6' },
  { key: 'R', label: 'Lịch sử giao nhận', color: '#64748b' },
]

export default function ScoreStack({ components, height = 10 }) {
  return (
    <div className="score-stack" style={{ height }} role="img" aria-label="Cơ cấu điểm B D T A R">
      {SCORE_PARTS.map((p) => {
        const v = Number(components?.[p.key]) || 0
        return (
          <span
            key={p.key}
            title={`${p.key} · ${p.label}: ${v}`}
            style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: p.color }}
          />
        )
      })}
    </div>
  )
}

export function ScoreLegend() {
  return (
    <div className="score-legend">
      {SCORE_PARTS.map((p) => (
        <span key={p.key} title={p.label}>
          <i style={{ background: p.color }} />
          {p.key}
        </span>
      ))}
    </div>
  )
}
