import { useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Button, Form, Modal, Table } from 'react-bootstrap'
import api from '../api/client'
import InlineFieldError from '../components/InlineFieldError'
import { useConfirm } from '../hooks/useConfirm'
import { useFormDraft } from '../hooks/useFormDraft'
import { validateEmail, validatePassword, validateRequired } from '../utils/validators'

const USER_DRAFT = {
  email: '',
  full_name: '',
  password: 'ChangeMe1',
  role: 'staff_hospital',
  center_id: 'c-dong-da',
}

export default function UsersPage() {
  const { confirm } = useConfirm()
  const [users, setUsers] = useState([])
  const [centers, setCenters] = useState([])
  const [show, setShow] = useState(false)
  const [form, setForm, { clearDraft, reset }] = useFormDraft('user-create', USER_DRAFT, {
    enabled: show,
  })
  const [touched, setTouched] = useState({})
  const [msg, setMsg] = useState('')

  function load() {
    api.get('/users').then((r) => setUsers(r.data))
  }

  useEffect(() => {
    load()
    api.get('/centers').then((r) => setCenters(r.data))
  }, [])

  const errors = useMemo(
    () => ({
      full_name: validateRequired(form.full_name, 'Họ tên'),
      email: validateEmail(form.email),
      password: validatePassword(form.password),
      role: validateRequired(form.role, 'Role'),
    }),
    [form],
  )
  const formValid = !Object.values(errors).some(Boolean)

  async function create() {
    setTouched({ full_name: true, email: true, password: true, role: true })
    if (!formValid) return

    const ok = await confirm({
      title: 'Xác nhận tạo người dùng',
      summary: [
        { label: 'Họ tên', value: form.full_name },
        { label: 'Email', value: form.email },
        { label: 'Role', value: form.role },
        { label: 'Cơ sở', value: form.center_id || '—' },
      ],
      confirmLabel: 'Tạo tài khoản',
      confirmVariant: 'danger',
    })
    if (!ok) return

    try {
      await api.post('/users', form)
      setShow(false)
      clearDraft()
      reset(USER_DRAFT)
      setTouched({})
      setMsg('Đã tạo người dùng.')
      load()
    } catch (e) {
      setMsg(e.response?.data?.detail || 'Tạo thất bại')
    }
  }

  async function toggleActive(u) {
    const ok = await confirm({
      title: u.is_active ? 'Khóa tài khoản' : 'Mở khóa tài khoản',
      summary: [
        { label: 'Người dùng', value: u.full_name },
        { label: 'Email', value: u.email },
        { label: 'Role', value: u.role },
        { label: 'Thao tác', value: u.is_active ? 'Khóa' : 'Mở khóa' },
      ],
      confirmLabel: u.is_active ? 'Khóa' : 'Mở khóa',
      confirmVariant: u.is_active ? 'secondary' : 'primary',
    })
    if (!ok) return
    await api.patch(`/users/${u.id}`, { is_active: !u.is_active })
    load()
  }

  const counts = {
    total: users.length,
    admin: users.filter((u) => u.role === 'admin').length,
    bank: users.filter((u) => u.role === 'staff_bank').length,
    hospital: users.filter((u) => u.role === 'staff_hospital').length,
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
        <div>
          <h1 className="h3 mb-1">Người dùng & ma trận RBAC</h1>
          <p className="text-secondary mb-0">admin · staff_hospital · staff_bank</p>
        </div>
        <Button className="btn-emergency" onClick={() => setShow(true)}>
          + Thêm người dùng
        </Button>
      </div>

      {msg && (
        <Alert variant="info" dismissible onClose={() => setMsg('')}>
          {msg}
        </Alert>
      )}

      <div className="user-kpi-grid mb-3">
        <div className="kpi-card">
          <div className="label">Tổng TK</div>
          <div className="value">{counts.total}</div>
        </div>
        <div className="kpi-card kpi-tone-danger">
          <div className="label">Admin</div>
          <div className="value">{counts.admin}</div>
        </div>
        <div className="kpi-card kpi-tone-warn">
          <div className="label">staff_bank</div>
          <div className="value">{counts.bank}</div>
        </div>
        <div className="kpi-card kpi-tone-safe">
          <div className="label">staff_hospital</div>
          <div className="value">{counts.hospital}</div>
        </div>
      </div>

      <div className="table-panel mb-3">
        <Table hover size="sm" className="mb-0">
          <thead>
            <tr>
              <th>Họ tên</th>
              <th>Email</th>
              <th>Role</th>
              <th>Cơ sở</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}</td>
                <td>{u.email}</td>
                <td>
                  <Badge bg="secondary">{u.role}</Badge>
                </td>
                <td className="small">{u.center_id || '—'}</td>
                <td>{u.is_active ? 'Active' : 'Locked'}</td>
                <td>
                  <Button size="sm" variant="outline-secondary" onClick={() => toggleActive(u)}>
                    {u.is_active ? 'Khóa' : 'Mở'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <Modal show={show} onHide={() => setShow(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Thêm người dùng</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-2">
            <Form.Label>Họ tên</Form.Label>
            <Form.Control
              value={form.full_name}
              isInvalid={touched.full_name && !!errors.full_name}
              onBlur={() => setTouched((t) => ({ ...t, full_name: true }))}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
            <InlineFieldError message={touched.full_name && errors.full_name} />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>Email</Form.Label>
            <Form.Control
              value={form.email}
              isInvalid={touched.email && !!errors.email}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <InlineFieldError message={touched.email && errors.email} />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>Mật khẩu</Form.Label>
            <Form.Control
              type="password"
              value={form.password}
              isInvalid={touched.password && !!errors.password}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <InlineFieldError message={touched.password && errors.password} />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>Role</Form.Label>
            <Form.Select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="staff_hospital">staff_hospital</option>
              <option value="staff_bank">staff_bank</option>
              <option value="admin">admin</option>
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>Cơ sở</Form.Label>
            <Form.Select
              value={form.center_id}
              onChange={(e) => setForm({ ...form, center_id: e.target.value })}
            >
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShow(false)}>
            Hủy
          </Button>
          <Button className="btn-emergency" disabled={!formValid} onClick={create}>
            Tạo
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
