import { useMemo } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Badge, Button } from 'react-bootstrap'
import { useAuth } from '../auth/AuthContext'
import UserMenu from '../components/UserMenu'
import { useHotkeys } from '../hooks/useHotkeys'

const STAFF = ['admin', 'staff_hospital', 'staff_bank']

const NAV = [
  {
    section: 'TỔNG QUAN',
    items: [{ to: '/', label: 'Dashboard', roles: STAFF }],
  },
  {
    section: 'ĐIỀU PHỐI',
    items: [
      { to: '/demands', label: 'Nhu cầu máu', roles: STAFF },
      { to: '/alerts', label: 'Cảnh báo thiếu hụt', roles: STAFF },
      { to: '/matching', label: 'Matching cơ sở', roles: ['admin'] },
      { to: '/transfers', label: 'Điều chuyển', roles: STAFF },
      { to: '/notifications', label: 'Thông báo nội bộ', roles: STAFF },
    ],
  },
  {
    section: 'CƠ SỞ & KHO',
    items: [
      { to: '/centers', label: 'Cơ sở BV / NHM', roles: STAFF },
      { to: '/inventory', label: 'Tồn kho', roles: STAFF },
    ],
  },
  {
    section: 'BÁO CÁO',
    items: [{ to: '/reports', label: 'KPI cung ứng', roles: STAFF }],
  },
  {
    section: 'HỆ THỐNG',
    items: [{ to: '/system/users', label: 'Người dùng & RBAC', roles: ['admin'] }],
  },
]

export default function AppLayout() {
  const { user, logout, hasRole } = useAuth()
  const navigate = useNavigate()

  const hotkeys = useMemo(() => {
    const map = {
      'g d': () => navigate('/'),
      'g n': () => navigate('/demands'),
      'g a': () => navigate('/alerts'),
      'g t': () => navigate('/transfers'),
      'g i': () => navigate('/inventory'),
      'g c': () => navigate('/centers'),
      'g r': () => navigate('/reports'),
      'g o': () => navigate('/notifications'),
    }
    if (hasRole('admin')) {
      map['g m'] = () => navigate('/matching')
      map['g u'] = () => navigate('/system/users')
    }
    return map
  }, [navigate, hasRole])

  useHotkeys(hotkeys)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="logo">+</span>
          <strong>Management Blood</strong>
          <div className="small text-secondary mt-1">DSS Điều phối BV ↔ NHM</div>
          <Badge bg="secondary" className="mt-2">
            {user?.role}
          </Badge>
        </div>
        <nav className="flex-grow-1 overflow-auto">
          {NAV.map((group) => {
            const items = group.items.filter((i) => hasRole(...i.roles))
            if (!items.length) return null
            return (
              <div key={group.section}>
                <div className="sidebar-section">{group.section}</div>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>
        <div className="sidebar-footer p-3">
          <div className="small text-secondary mb-2" title="Phím tắt điều hướng">
            g rồi d/n/a/t/i…
          </div>
          <Button
            variant="outline-light"
            size="sm"
            className="w-100"
            onClick={() => {
              logout()
              navigate('/login')
            }}
          >
            Đăng xuất
          </Button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="search small text-secondary px-2">
            Phím tắt: <kbd>g</kbd> rồi <kbd>t</kbd> Điều chuyển · <kbd>Esc</kbd> đóng xác nhận
          </div>
          <Button
            size="sm"
            className="btn-emergency"
            onClick={() => navigate('/alerts?severity=critical')}
          >
            Khẩn cấp
          </Button>
          {hasRole('admin', 'staff_hospital') && (
            <Button size="sm" variant="outline-danger" onClick={() => navigate('/demands')}>
              + Tạo nhu cầu
            </Button>
          )}
          {hasRole('admin') && (
            <Button size="sm" variant="danger" onClick={() => navigate('/matching')}>
              Chạy matching cơ sở
            </Button>
          )}
          <UserMenu />
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
