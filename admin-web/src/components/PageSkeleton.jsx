export default function PageSkeleton({ cards = 4, rows = 5 }) {
  return (
    <div aria-busy="true" aria-label="Đang tải">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-line mb-4" style={{ width: '38%' }} />
      <div className="skeleton-grid">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="skeleton skeleton-card" />
        ))}
      </div>
      <div className="table-panel p-3 mt-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skeleton skeleton-line" style={{ width: `${95 - i * 8}%` }} />
        ))}
      </div>
    </div>
  )
}
