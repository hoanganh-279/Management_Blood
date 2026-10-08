import { useEffect, useState } from 'react'
import { Alert, Button, Form, Modal, Spinner, Table } from 'react-bootstrap'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import EmptyState from '../components/EmptyState'
import InlineFieldError from '../components/InlineFieldError'
import { useConfirm } from '../hooks/useConfirm'
import { useFormDraft } from '../hooks/useFormDraft'
import { validateRequired } from '../utils/validators'

const NOTIF_DRAFT = {
  center_id: '',
  request_id: '',
  template: 'Điều phối nội bộ',
  body: '',
  channel: 'in_app',
}

export default function NotificationsPage() {
  const { hasRole } = useAuth()
  const { confirm } = useConfirm()
  const [list, setList] = useState([])
  const [show, setShow] = useState(false)
  const [centers, setCenters] = useState([])
  const [demands, setDemands] = useState([])
  const [form, setForm, { clearDraft, reset }] = useFormDraft('notification-compose', NOTIF_DRAFT, {
    enabled: show,
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [touched, setTouched] = useState({})

  function load() {
    api.get('/notifications').then((r) => setList(r.data))
  }

  useEffect(() => {
    load()
    api.get('/demands').then((r) => setDemands(r.data))
    api.get('/centers').then((r) => setCenters(r.data))
  }, [])

  const bodyError = validateRequired(form.body, 'Nội dung')
  const canSend = !bodyError

  async function send() {
    setTouched({ body: true })
    if (!canSend) return

    const centerName = centers.find((c) => c.id === form.center_id)?.name || '—'
    const ok = await confirm({
      title: 'Xác nhận gửi thông báo nội bộ',
      summary: [
        { label: 'Cơ sở nhận', value: centerName },
        { label: 'Tiêu đề', value: form.template },
        { label: 'Nội dung', value: (form.body || '').slice(0, 120) },
      ],
      confirmLabel: 'Gửi',
      confirmVariant: 'danger',
    })
    if (!ok) return

    setSaving(true)
    setMsg('')
    try {
      await api.post('/notifications', {
        center_id: form.center_id || null,
        request_id: form.request_id || null,
        channel: form.channel,
        template: form.template,
        body: form.body,
      })
      setShow(false)
      clearDraft()
      reset(NOTIF_DRAFT)
      setTouched({})
      setMsg('Đã ghi thông báo nội bộ (stub kênh).')
      load()
    } catch (e) {
      setMsg(e.response?.data?.detail || 'Gửi thất bại')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
        <div>
          <h1 className="h3 mb-1">Thông báo nội bộ</h1>
          <p className="text-secondary mb-0">Đề xuất / hoàn thành điều chuyển · stub DB</p>
        </div>
        {hasRole('admin', 'staff_bank') && (
          <Button className="btn-emergency" onClick={() => setShow(true)}>
            Soạn thông báo
          </Button>
        )}
      </div>
      {msg && <Alert variant="info">{msg}</Alert>}

      <div className="table-panel">
        <Table hover size="sm" className="mb-0">
          <thead>
            <tr>
              <th>Thời điểm</th>
              <th>Cơ sở</th>
              <th>Nhu cầu</th>
              <th>Mẫu</th>
              <th>Trạng thái</th>
              <th>Nội dung</th>
            </tr>
          </thead>
          <tbody>
            {list.map((n) => (
              <tr key={n.id}>
                <td className="small">{new Date(n.created_at).toLocaleString('vi-VN')}</td>
                <td className="small">{n.center_id || '—'}</td>
                <td className="small">{n.request_id || '—'}</td>
                <td>{n.template}</td>
                <td>{n.status}</td>
                <td className="small">{(n.body || '').slice(0, 80)}</td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={6} className="p-0">
                  <EmptyState
                    icon="bell"
                    title="Chưa có thông báo"
                    hint="Thông báo tự sinh khi có đề xuất hoặc hoàn tất điều chuyển."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>

      <Modal show={show} onHide={() => setShow(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Thông báo nội bộ</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small text-secondary">Bản nháp được lưu tự động trên trình duyệt.</p>
          <Form.Group className="mb-2">
            <Form.Label>Cơ sở nhận</Form.Label>
            <Form.Select
              value={form.center_id}
              onChange={(e) => setForm({ ...form, center_id: e.target.value })}
            >
              <option value="">— không —</option>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>Gắn nhu cầu</Form.Label>
            <Form.Select
              value={form.request_id}
              onChange={(e) => setForm({ ...form, request_id: e.target.value })}
            >
              <option value="">— không —</option>
              {demands.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.blood_type}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>Tiêu đề</Form.Label>
            <Form.Control
              value={form.template}
              onChange={(e) => setForm({ ...form, template: e.target.value })}
            />
          </Form.Group>
          <Form.Group>
            <Form.Label>Nội dung</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={form.body}
              isInvalid={touched.body && !!bodyError}
              onBlur={() => setTouched((t) => ({ ...t, body: true }))}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
            <InlineFieldError message={touched.body && bodyError} />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShow(false)}>
            Hủy
          </Button>
          <Button className="btn-emergency" disabled={!canSend || saving} onClick={send}>
            {saving ? <Spinner size="sm" /> : 'Gửi'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
