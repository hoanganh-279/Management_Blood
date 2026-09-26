import { getInitials } from '../utils/initials'

export default function UserAvatar({ fullName, size = 'sm', className = '' }) {
  const initials = getInitials(fullName)
  return (
    <span
      className={`user-avatar user-avatar-${size} ${className}`.trim()}
      aria-hidden="true"
      title={fullName || ''}
    >
      {initials}
    </span>
  )
}
