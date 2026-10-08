import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Button, OverlayTrigger, Popover } from 'react-bootstrap'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import Icon from '../components/Icon'
import UserMenu from '../components/UserMenu'
import { useHotkeys } from '../hooks/useHotkeys'

const STAFF = ['admin', 'staff_hospital', 'staff_bank']

const ROLE_LABEL = {
  admin: 'Admin',
  staff_hospital: 'Bệnh viện',
  staff_bank: 'Ngân hàng máu',
}

const NAV = [
  {
    section: 'TỔNG QUAN',
    items: [{ to: '/', label: 'Dashboard', icon: 'dashboard', roles: STAFF }],
  },
  {
    section: 'ĐIỀU PHỐI',
    items: [
      { to: '/demands', label: 'Nhu cầu máu', icon: 'droplet', roles: STAFF },
      { to: '/alerts', label: 'Cảnh báo thiếu hụt', icon: 'alert', roles: STAFF },
      { to: '/matching', label: 'Matching cơ sở', icon: 'target', roles: ['admin'] },
      { to: '/transfers', label: 'Điều chuyển', icon: 'transfer', roles: STAFF },
      { to: '/notifications', label: 'Thông báo nội bộ', icon: 'bell', roles: STAFF },
    ],
  },
  {
    section: 'CƠ SỞ & KHO',
    items: [
      { to: '/centers', label: 'Cơ sở BV / NHM', icon: 'building', roles: STAFF },
      { to: '/inventory', label: 'Tồn kho', icon: 'boxes', roles: STAFF },
    ],
  },
  {
    section: 'BÁO CÁO',
    items: [{ to: '/reports', label: 'KPI cung ứng', icon: 'chart', roles: STAFF }],
  },
  {
    section: 'HỆ THỐNG',
    items: [
      { to: '/system/users', label: 'Người dùng & RBAC', icon: 'users', roles: ['admin'] },
    ],
  },
]

const SHORTCUTS = [
  ['g d', 'Dashboard'],
  ['g n', 'Nhu cầu máu'],
  ['g a', 'Cảnh báo'],
  ['g t', 'Điều chuyển'],
  ['g i', 'Tồn kho'],
  ['g c', 'Cơ sở'],
  ['g r', 'Báo cáo'],
  ['g o', 'Thông báo'],
  ['Esc', 'Đóng hộp xác nhận'],
]

const shortcutPopover = (
  <Popover id="shortcut-popover">
    <Popover.Header as="h3">Phím tắt</Popover.Header>
    <Popover.Body className="shortcut-list">
      {SHORTCUTS.map(([keys, label]) => (
        <div key={keys} className="shortcut-row">
          <span>
            {keys.split(' ').map((k) => (
              <kbd key={k}>{k}</kbd>
            ))}
          </span>
          <span className="text-secondary">{label}</span>
        </div>
      ))}
    </Popover.Body>
  </Popover>
)

export default function AppLayout() {
  const { user, logout, hasRole } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [criticalCount, setCriticalCount] = useState(0)

  useEffect(() => {
    let alive = true
    api
      .get('/dashboard/summary')
      .then((r) => alive && setCriticalCount(r.data.critical_alerts || 0))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [location.pathname])

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
          <span className="logo">
            <Icon name="droplet" size={18} />
          </span>
          <div className="brand-text">
            <strong>Management Blood</strong>
            <div className="brand-sub">DSS Điều phối BV ↔ NHM</div>
          </div>
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
                    title={item.label}
                    className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                  >
                    <Icon name={item.icon} />
                    <span className="nav-label">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-role">
            <span className="role-chip">{ROLE_LABEL[user?.role] || user?.role}</span>
          </div>
          <button
            type="button"
            className="sidebar-logout"
            title="Đăng xuất"
            onClick={() => {
              logout()
              navigate('/login')
            }}
          >
            <Icon name="logout" />
            <span className="nav-label">Đăng xuất</span>
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <OverlayTrigger trigger="click" rootClose placement="bottom-start" overlay={shortcutPopover}>
            <button type="button" className="topbar-ghost" aria-label="Xem phím tắt">
              <Icon name="keyboard" />
              <span>Phím tắt</span>
            </button>
          </OverlayTrigger>
          <div className="topbar-actions">
            <button
              type="button"
              className={`emergency-chip${criticalCount ? ' is-live' : ''}`}
              onClick={() => navigate('/alerts?severity=critical')}
            >
              <span className="dot" />
              Khẩn cấp
              {criticalCount > 0 && <span className="count">{criticalCount}</span>}
            </button>
            {hasRole('admin') && (
              <Button size="sm" variant="light" className="btn-soft" onClick={() => navigate('/demands')}>
                <Icon name="plus" size={15} /> Tạo nhu cầu
              </Button>
            )}
            {hasRole('admin') && (
              <Button size="sm" variant="danger" onClick={() => navigate('/matching')}>
                <Icon name="target" size={15} /> Chạy matching
              </Button>
            )}
            {hasRole('staff_hospital') && (
              <Button size="sm" variant="danger" onClick={() => navigate('/demands')}>
                <Icon name="plus" size={15} /> Tạo nhu cầu
              </Button>
            )}
            <UserMenu />
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
