import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Button, Form, Modal, Table } from 'react-bootstrap'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import InlineFieldError from '../components/InlineFieldError'
import LoadState from '../components/LoadState'
import { useConfirm } from '../hooks/useConfirm'
import { useFormDraft } from '../hooks/useFormDraft'
import { ROLE_LABEL, apiError, label } from '../utils/labels'
import { validateEmail, validatePassword, validateRequired } from '../utils/validators'

const USER_DRAFT = {
  email: '',
  full_name: '',
  password: '',
  role: 'staff_hospital',
  center_id: '',
}

export default function UsersPage() {
  const { confirm } = useConfirm()
  const { user: me } = useAuth()
  const [users, setUsers] = useState([])
  const [centers, setCenters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [show, setShow] = useState(false)
  const [form, setForm, { clearDraft, reset }] = useFormDraft('user-create', USER_DRAFT, {
    enabled: show,
    exclude: ['password'],
  })
  const [touched, setTouched] = useState({})
  const [msg, setMsg] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    Promise.all([api.get('/users'), api.get('/centers')])
      .then(([u, c]) => {
        setUsers(u.data)
        setCenters(c.data)
      })
      .catch((err) => setError(apiError(err, 'Không tải được người dùng.')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const centerName = (id) => centers.find((c) => c.id === id)?.name || id || '—'
  const needsCenter = form.role !== 'admin'

  const errors = useMemo(
    () => ({
      full_name: validateRequired(form.full_name, 'Họ tên'),
      email: validateEmail(form.email),
      password: validatePassword(form.password),
      center_id: needsCenter ? validateRequired(form.center_id, 'Cơ sở') : '',
    }),
    [form, needsCenter],
  )
  const formValid = !Object.values(errors).some(Boolean)

  async function create() {
    setTouched({ full_name: true, email: true, password: true, center_id: true })
    if (!formValid) return
    setShow(false)
    const ok = await confirm({
      title: 'Xác nhận tạo người dùng',
      summary: [
        { label: 'Họ tên', value: form.full_name },
        { label: 'Email', value: form.email },
        { label: 'Vai trò', value: label(ROLE_LABEL, form.role) },
        { label: 'Cơ sở', value: form.center_id ? centerName(form.center_id) : '—' },
      ],
      confirmLabel: 'Tạo tài khoản',
      confirmVariant: 'primary',
    })
    if (!ok) {
      setShow(true)
      return
    }
    try {
      await api.post('/users', { ...form, center_id: form.center_id || null })
      clearDraft()
      reset(USER_DRAFT)
      setTouched({})
      setMsg({ type: 'success', text: 'Đã tạo người dùng.' })
      load()
    } catch (e) {
      setMsg({ type: 'danger', text: apiError(e, 'Tạo người dùng thất bại.') })
      setShow(true)
    }
  }

  async function toggleActive(u) {
    const ok = await confirm({
      title: u.is_active ? 'Khóa tài khoản' : 'Mở khóa tài khoản',
      summary: [
        { label: 'Người dùng', value: u.full_name },
        { label: 'Email', value: u.email },
        { label: 'Vai trò', value: label(ROLE_LABEL, u.role) },
      ],
      confirmLabel: u.is_active ? 'Khóa' : 'Mở khóa',
      confirmVariant: u.is_active ? 'danger' : 'primary',
    })
    if (!ok) return
    try {
      await api.patch(`/users/${u.id}`, { is_active: !u.is_active })
      setMsg({ type: 'success', text: `Đã ${u.is_active ? 'khóa' : 'mở khóa'} ${u.full_name}.` })
      load()
    } catch (e) {
      setMsg({ type: 'danger', text: apiError(e) })
    }
  }

  return (
    <div>
      <div className="d-flex justify-content-between mb-3">
        <div>
          <h1 className="h3 mb-1">Người dùng & phân quyền</h1>
          <p className="text-secondary mb-0">
            Ba vai trò: {Object.values(ROLE_LABEL).join(' · ')}. Nhân viên luôn gắn với một cơ sở.
          </p>
        </div>
        <Button onClick={() => setShow(true)}>+ Thêm người dùng</Button>
      </div>

      {msg && (
        <Alert variant={msg.type} dismissible onClose={() => setMsg(null)}>
          {msg.text}
        </Alert>
      )}

      <div className="d-flex gap-3 mb-3 flex-wrap">
        <div className="kpi-card">
          <div className="label">Tổng tài khoản</div>
          <div className="value fs-4">{users.length}</div>
        </div>
        {Object.entries(ROLE_LABEL).map(([k, v]) => (
          <div className="kpi-card" key={k}>
            <div className="label">{v}</div>
            <div className="value fs-4">{users.filter((u) => u.role === k).length}</div>
          </div>
        ))}
      </div>

      <div className="table-panel mb-3">
        <LoadState loading={loading} error={error} onRetry={load} empty={!users.length} emptyText="Chưa có người dùng.">
          <Table hover size="sm" className="mb-0">
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>Email</th>
                <th>Vai trò</th>
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
                    <Badge bg="secondary">{label(ROLE_LABEL, u.role)}</Badge>
                  </td>
                  <td className="small">{centerName(u.center_id)}</td>
                  <td>
                    <Badge bg={u.is_active ? 'success' : 'dark'}>{u.is_active ? 'Hoạt động' : 'Đã khóa'}</Badge>
                  </td>
                  <td>
                    {u.id !== me?.id && (
                      <Button size="sm" variant="outline-secondary" onClick={() => toggleActive(u)}>
                        {u.is_active ? 'Khóa…' : 'Mở khóa…'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </LoadState>
      </div>

      <Modal show={show} onHide={() => setShow(false)}>
        <Form
          onSubmit={(e) => {
            e.preventDefault()
            create()
          }}
        >
          <Modal.Header closeButton>
            <Modal.Title>Thêm người dùng</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-2" controlId="us-name">
              <Form.Label>Họ tên *</Form.Label>
              <Form.Control
                value={form.full_name}
                isInvalid={touched.full_name && !!errors.full_name}
                onBlur={() => setTouched((t) => ({ ...t, full_name: true }))}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
              <InlineFieldError message={touched.full_name && errors.full_name} />
            </Form.Group>
            <Form.Group className="mb-2" controlId="us-email">
              <Form.Label>Email *</Form.Label>
              <Form.Control
                type="email"
                autoComplete="off"
                value={form.email}
                isInvalid={touched.email && !!errors.email}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <InlineFieldError message={touched.email && errors.email} />
            </Form.Group>
            <Form.Group className="mb-2" controlId="us-password">
              <Form.Label>Mật khẩu ban đầu *</Form.Label>
              <Form.Control
                type="password"
                autoComplete="new-password"
                value={form.password}
                isInvalid={touched.password && !!errors.password}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <InlineFieldError message={touched.password && errors.password} />
            </Form.Group>
            <Form.Group className="mb-2" controlId="us-role">
              <Form.Label>Vai trò *</Form.Label>
              <Form.Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {Object.entries(ROLE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-2" controlId="us-center">
              <Form.Label>Cơ sở {needsCenter ? '*' : '(tùy chọn)'}</Form.Label>
              <Form.Select
                value={form.center_id}
                isInvalid={touched.center_id && !!errors.center_id}
                onChange={(e) => setForm({ ...form, center_id: e.target.value })}
              >
                <option value="">— Chọn cơ sở —</option>
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Form.Select>
              <InlineFieldError message={touched.center_id && errors.center_id} />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShow(false)}>
              Đóng
            </Button>
            <Button type="submit" disabled={!formValid}>
              Tiếp tục…
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  )
}
