import Icon from './Icon'

// Fixed DSS disclaimer (required by product rules) — slim strip instead of a full alert box.
export default function DssNote({ children }) {
  return (
    <div className="dss-note" role="note">
      <Icon name="info" size={16} />
      <span>{children}</span>
    </div>
  )
}
