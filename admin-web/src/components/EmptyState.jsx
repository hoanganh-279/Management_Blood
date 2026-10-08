import Icon from './Icon'

export default function EmptyState({ icon = 'inbox', title, hint, children }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <div className="empty-title">{title}</div>
      {hint && <div className="empty-hint">{hint}</div>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}
