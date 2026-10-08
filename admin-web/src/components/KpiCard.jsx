import Icon from './Icon'

// tone: danger | warn | safe | neutral — follows the red / yellow / green convention
export default function KpiCard({ icon, label, value, tone = 'neutral', children }) {
  return (
    <div className={`kpi-card kpi-tone-${tone}`}>
      <div className="kpi-head">
        <span className="label">{label}</span>
        {icon && (
          <span className="kpi-icon">
            <Icon name={icon} size={18} />
          </span>
        )}
      </div>
      <div className="value">{value}</div>
      {children && <div className="small kpi-sub">{children}</div>}
    </div>
  )
}
