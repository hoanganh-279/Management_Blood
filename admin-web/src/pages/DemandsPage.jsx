import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Col, Form, Modal, Row, Table } from 'react-bootstrap'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import InlineFieldError from '../components/InlineFieldError'
import { useConfirm } from '../hooks/useConfirm'
import { useFormDraft } from '../hooks/useFormDraft'
import { validateDeadline, validateQty, validateRequired } from '../utils/validators'

const DRAFT_DEFAULT = {
  facility_name: 'BV Đa khoa Đống Đa',
  center_id: 'c-dong-da',
  blood_type: 'O-',
  qty_needed: 10,
  priority: 'urgent',
  deadline: new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 16),
  department: 'Cấp cứu',
  notes: '',
}

export default function DemandsPage() {
  const [list, setList] = useState([])
  const [show, setShow] = useState(false)
  const [centers, setCenters] = useState([])
  const { hasRole } = useAuth()
  const { confirm } = useConfirm()
  const [form, setForm, { clearDraft, reset }] = useFormDraft('demand-create', DRAFT_DEFAULT, {
    enabled: show,
  })
  const [msg, setMsg] = useState('')
  const [touched, setTouched] = useState({})

  function load() {
    api.get('/demands').then((r) => setList(r.data))
  }

  useEffect(() => {
    load()
    api.get('/centers').then((r) => setCenters(r.data))
  }, [])

  const errors = useMemo(
    () => ({
      facility_name: validateRequired(form.facility_name, 'Tên cơ sở'),
      center_id: validateRequired(form.center_id, 'Center'),
      qty_needed: validateQty(form.qty_needed),
      deadline: validateDeadline(form.deadline),
    }),
    [form],
  )
  const formValid = !Object.values(errors).some(Boolean)

  async function create() {
    setTouched({ facility_name: true, center_id: true, qty_needed: true, deadline: true })
    if (!formValid) return

    const ok = await confirm({
      title: 'Xác nhận tạo nhu cầu cấp máu',
      summary: [
        { label: 'Cơ sở', value: form.facility_name },
        { label: 'Nhóm máu', value: form.blood_type },
        { label: 'Số lượng', value: String(form.qty_needed) },
        { label: 'Ưu tiên', value: form.priority },
        { label: 'Hạn', value: new Date(form.deadline).toLocaleString('vi-VN') },
      ],
      confirmLabel: 'Tạo nhu cầu',
      confirmVariant: 'danger',
    })
    if (!ok) return

    try {
      await api.post('/demands', {
        ...form,
        qty_needed: Number(form.qty_needed),
        deadline: new Date(form.deadline).toISOString(),
      })
      setShow(false)
      clearDraft()
      reset({
        ...DRAFT_DEFAULT,
        deadline: new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 16),
      })
      setTouched({})
      setMsg('Đã tạo yêu cầu — hệ thống sẽ làm mới cảnh báo shortage')
      load()
    } catch (e) {
      setMsg(e.response?.data?.detail || 'Lỗi tạo yêu cầu')
    }
  }

  return (
    <div>
      <div className="d-flex justify-content-between mb-3">
        <div>
          <h1 className="h3 mb-1">Nhu cầu / yêu cầu cấp máu</h1>
          <p className="text-secondary mb-0">FR07 — đầu vào vòng DSS</p>
        </div>
        {hasRole('admin', 'staff_hospital') && (
          <Button className="btn-emergency" onClick={() => setShow(true)}>
            + Tạo yêu cầu cấp máu
          </Button>
        )}
      </div>
      {msg && <Alert variant="info">{msg}</Alert>}

      <div className="table-panel">
        <Table hover size="sm" className="mb-0">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Cơ sở</th>
              <th>Nhóm</th>
              <th>Cần / Đáp ứng</th>
              <th>Ưu tiên</th>
              <th>Hạn</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {list.map((d) => (
              <tr key={d.id}>
                <td>{d.code}</td>
                <td>{d.facility_name}</td>
                <td>{d.blood_type}</td>
                <td>
                  {d.qty_fulfilled}/{d.qty_needed}
                </td>
                <td>{d.priority}</td>
                <td className="small">{new Date(d.deadline).toLocaleString('vi-VN')}</td>
                <td>{d.status}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <Modal
        show={show}
        onHide={() => setShow(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && formValid && e.target?.tagName !== 'TEXTAREA') {
            e.preventDefault()
            create()
          }
        }}
      >
        <Modal.Header closeButton>
          <Modal.Title>Tạo yêu cầu cấp máu</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small text-secondary">Bản nháp được lưu tự động trên trình duyệt.</p>
          <Form.Group className="mb-2">
            <Form.Label>Cơ sở</Form.Label>
            <Form.Control
              value={form.facility_name}
              isInvalid={touched.facility_name && !!errors.facility_name}
              onBlur={() => setTouched((t) => ({ ...t, facility_name: true }))}
              onChange={(e) => setForm({ ...form, facility_name: e.target.value })}
            />
            <InlineFieldError message={touched.facility_name && errors.facility_name} />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>Center ID</Form.Label>
            <Form.Select
              value={form.center_id}
              isInvalid={touched.center_id && !!errors.center_id}
              onChange={(e) => setForm({ ...form, center_id: e.target.value })}
            >
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Form.Select>
            <InlineFieldError message={touched.center_id && errors.center_id} />
          </Form.Group>
          <Row>
            <Col>
              <Form.Group className="mb-2">
                <Form.Label>Nhóm máu</Form.Label>
                <Form.Select
                  value={form.blood_type}
                  onChange={(e) => setForm({ ...form, blood_type: e.target.value })}
                >
                  {['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col>
              <Form.Group className="mb-2">
                <Form.Label>Số lượng</Form.Label>
                <Form.Control
                  type="number"
                  value={form.qty_needed}
                  isInvalid={touched.qty_needed && !!errors.qty_needed}
                  onBlur={() => setTouched((t) => ({ ...t, qty_needed: true }))}
                  onChange={(e) => setForm({ ...form, qty_needed: e.target.value })}
                />
                <InlineFieldError message={touched.qty_needed && errors.qty_needed} />
              </Form.Group>
            </Col>
          </Row>
          <Form.Group className="mb-2">
            <Form.Label>Ưu tiên</Form.Label>
            <Form.Select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              <option value="normal">normal</option>
              <option value="urgent">urgent</option>
              <option value="flash">flash</option>
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>Hạn (local)</Form.Label>
            <Form.Control
              type="datetime-local"
              value={form.deadline}
              isInvalid={touched.deadline && !!errors.deadline}
              onBlur={() => setTouched((t) => ({ ...t, deadline: true }))}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
            />
            <InlineFieldError message={touched.deadline && errors.deadline} />
          </Form.Group>
          <Form.Group>
            <Form.Label>Ghi chú</Form.Label>
            <Form.Control
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShow(false)}>
            Hủy
          </Button>
          <Button className="btn-emergency" disabled={!formValid} onClick={create}>
            Lưu
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
