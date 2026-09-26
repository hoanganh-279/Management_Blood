import { Dropdown } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import UserAvatar from './UserAvatar'

const ROLE_LABEL = {
  admin: 'Admin / Điều phối',
  staff_hospital: 'Nhân viên bệnh viện',
  staff_bank: 'Nhân viên ngân hàng máu',
}

export default function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  if (!user) return null

  function onLogout() {
    logout()
    navigate('/login')
  }

  return (
    <Dropdown align="end" className="user-menu ms-auto">
      <Dropdown.Toggle
        as="button"
        type="button"
        className="user-menu-toggle"
        aria-label="Thông tin tài khoản"
      >
        <UserAvatar fullName={user.full_name} size="sm" />
        <span className="user-menu-name fw-semibold">{user.full_name}</span>
      </Dropdown.Toggle>
      <Dropdown.Menu className="user-menu-dropdown shadow-sm">
        <div className="user-menu-header px-3 py-3">
          <UserAvatar fullName={user.full_name} size="lg" />
          <div className="mt-2 fw-semibold">{user.full_name}</div>
        </div>
        <Dropdown.Divider />
        <div className="px-3 py-2 small user-menu-details">
          <div className="mb-2">
            <div className="text-secondary">Email</div>
            <div>{user.email}</div>
          </div>
          <div className="mb-2">
            <div className="text-secondary">Vai trò</div>
            <div>{ROLE_LABEL[user.role] || user.role}</div>
          </div>
          <div className="mb-2">
            <div className="text-secondary">Cơ sở gắn</div>
            <div>{user.center_id || '—'}</div>
          </div>
          <div>
            <div className="text-secondary">Trạng thái</div>
            <div>{user.is_active ? 'Đang hoạt động' : 'Ngừng hoạt động'}</div>
          </div>
        </div>
        <Dropdown.Divider />
        <Dropdown.Item as="button" type="button" className="text-danger" onClick={onLogout}>
          Đăng xuất
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  )
}
