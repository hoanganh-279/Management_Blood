import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Form, Modal, Spinner, Table } from 'react-bootstrap'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import InlineFieldError from '../components/InlineFieldError'
import LoadState from '../components/LoadState'
import { apiError } from '../utils/labels'
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

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    Promise.all([api.get('/notifications'), api.get('/demands'), api.get('/centers')])
      .then(([n, d, c]) => {
        setList(n.data)
        setDemands(d.data)
        setCenters(c.data)
      })
      .catch((err) => setError(apiError(err, 'Không tải được thông báo.')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const centerName = (id) => centers.find((c) => c.id === id)?.name || id || '—'
  const demandCode = (id) => demands.find((d) => d.id === id)?.code || id || '—'

  const bodyError = validateRequired(form.body, 'Nội dung')
  const canSend = !bodyError

  async function send() {
    setTouched({ body: true })
    if (!canSend) return

    setShow(false)
    const ok = await confirm({
      title: 'Xác nhận gửi thông báo nội bộ',
      summary: [
        { label: 'Cơ sở nhận', value: form.center_id ? centerName(form.center_id) : 'Tất cả (không chỉ định)' },
        { label: 'Tiêu đề', value: form.template },
        { label: 'Nội dung', value: (form.body || '').slice(0, 120) },
      ],
      confirmLabel: 'Gửi',
      confirmVariant: 'primary',
    })
    if (!ok) {
      setShow(true)
      return
    }

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
      clearDraft()
      reset(NOTIF_DRAFT)
      setTouched({})
      setMsg({ type: 'success', text: 'Đã ghi thông báo nội bộ (kênh gửi là stub).' })
      load()
    } catch (e) {
      setMsg({ type: 'danger', text: apiError(e, 'Gửi thất bại.') })
      setShow(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="d-flex justify-content-between mb-3">
        <div>
          <h1 className="h3 mb-1">Thông báo nội bộ</h1>
          <p className="text-secondary mb-0">Sự kiện điều chuyển và thông báo điều phối (kênh gửi là stub).</p>
        </div>
        {hasRole('admin', 'staff_bank') && (
          <Button onClick={() => setShow(true)}>Soạn thông báo</Button>
        )}
      </div>
      {msg && (
        <Alert variant={msg.type} dismissible onClose={() => setMsg('')}>
          {msg.text}
        </Alert>
      )}

      <div className="table-panel">
        <LoadState loading={loading} error={error} onRetry={load} empty={!list.length} emptyText="Chưa có thông báo.">
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
                <td className="small">{centerName(n.center_id)}</td>
                <td className="small">{demandCode(n.request_id)}</td>
                <td>{n.template}</td>
                <td className="small">{n.status === 'sent' ? 'Đã gửi' : n.status}</td>
                <td className="small">{n.body}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        </LoadState>
      </div>

      <Modal show={show} onHide={() => setShow(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Thông báo nội bộ</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small text-secondary">Bản nháp được lưu tự động trên trình duyệt.</p>
          <Form.Group className="mb-2" controlId="nt-center">
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
          <Form.Group className="mb-2" controlId="nt-request">
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
          <Form.Group className="mb-2" controlId="nt-title">
            <Form.Label>Tiêu đề</Form.Label>
            <Form.Control
              value={form.template}
              onChange={(e) => setForm({ ...form, template: e.target.value })}
            />
          </Form.Group>
          <Form.Group controlId="nt-body">
            <Form.Label>Nội dung *</Form.Label>
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
          <Button disabled={!canSend || saving} onClick={send}>
            {saving ? <Spinner size="sm" /> : 'Gửi'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
