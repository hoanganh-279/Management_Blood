import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Button, Col, Form, Modal, ProgressBar, Row, Table } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import InlineFieldError from '../components/InlineFieldError'
import LoadState from '../components/LoadState'
import { useConfirm } from '../hooks/useConfirm'
import { useFormDraft } from '../hooks/useFormDraft'
import {
  BLOOD_TYPES,
  PRIORITY_LABEL,
  PRIORITY_VARIANT,
  PRODUCT_LABEL,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_VARIANT,
  apiError,
  fmtDateTime,
  label,
} from '../utils/labels'
import { validateDeadline, validateQty, validateRequired } from '../utils/validators'

function defaultDeadline() {
  const d = new Date(Date.now() + 4 * 3600 * 1000)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

const DRAFT_DEFAULT = {
  center_id: '',
  blood_type: 'O+',
  product_type: 'PRBC',
  qty_needed: 1,
  priority: 'urgent',
  deadline: '',
  department: '',
  notes: '',
}

export default function DemandsPage() {
  const { user, hasRole } = useAuth()
  const { confirm } = useConfirm()
  const [list, setList] = useState([])
  const [centers, setCenters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [show, setShow] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [touched, setTouched] = useState({})
  const [form, setForm, { clearDraft, reset }] = useFormDraft('demand-create', DRAFT_DEFAULT, { enabled: show })

  const isHospital = hasRole('staff_hospital')
  const canCreate = hasRole('admin', 'staff_hospital')
  const ownCenter = centers.find((c) => c.id === user?.center_id)
  const centerId = isHospital ? user?.center_id : form.center_id

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    Promise.all([api.get('/demands'), api.get('/centers')])
      .then(([d, c]) => {
        setList(d.data)
        setCenters(c.data)
      })
      .catch((err) => setError(apiError(err, 'Không tải được nhu cầu.')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function openCreate() {
    if (!form.deadline) setForm((f) => ({ ...f, deadline: defaultDeadline() }))
    setShow(true)
  }

  const errors = useMemo(
    () => ({
      center_id: validateRequired(centerId, 'Cơ sở nhận'),
      qty_needed: validateQty(form.qty_needed, { max: 500 }),
      deadline: validateDeadline(form.deadline),
      department: validateRequired(form.department, 'Khoa / bộ phận yêu cầu'),
    }),
    [form, centerId],
  )
  const formValid = !Object.values(errors).some(Boolean)

  async function create() {
    setTouched({ center_id: true, qty_needed: true, deadline: true, department: true })
    if (!formValid) return
    const center = centers.find((c) => c.id === centerId)
    setShow(false)
    const ok = await confirm({
      title: 'Xác nhận tạo nhu cầu cấp máu',
      summary: [
        { label: 'Cơ sở nhận', value: center?.name || centerId },
        { label: 'Khoa / bộ phận', value: form.department },
        { label: 'Nhóm máu / chế phẩm', value: `${form.blood_type} · ${label(PRODUCT_LABEL, form.product_type)}` },
        { label: 'Số lượng', value: `${form.qty_needed} đơn vị` },
        { label: 'Ưu tiên', value: label(PRIORITY_LABEL, form.priority) },
        { label: 'Hạn cần', value: fmtDateTime(form.deadline) },
      ],
      confirmLabel: 'Tạo nhu cầu',
      confirmVariant: 'primary',
    })
    if (!ok) {
      setShow(true)
      return
    }
    try {
      await api.post('/demands', {
        ...form,
        center_id: centerId,
        qty_needed: Number(form.qty_needed),
        deadline: new Date(form.deadline).toISOString(),
      })
      clearDraft()
      reset({ ...DRAFT_DEFAULT })
      setTouched({})
      setFeedback({ type: 'success', text: 'Đã tạo nhu cầu — cảnh báo thiếu hụt được làm mới.' })
      load()
    } catch (e) {
      setFeedback({ type: 'danger', text: apiError(e, 'Tạo nhu cầu thất bại.') })
      setShow(true)
    }
  }

  async function cancelDemand(d) {
    const ok = await confirm({
      title: 'Hủy nhu cầu cấp máu',
      summary: [
        { label: 'Mã', value: d.code },
        { label: 'Cơ sở', value: d.facility_name },
        { label: 'Nhóm / chế phẩm', value: `${d.blood_type} · ${d.product_type}` },
        { label: 'Đã nhận', value: `${d.qty_fulfilled}/${d.qty_needed}` },
      ],
      body: (
        <p className="small mb-0">
          Chỉ hủy được khi không còn điều chuyển đang mở cho nhu cầu này. Số lượng đã nhận được giữ nguyên trong hồ
          sơ.
        </p>
      ),
      reasonRequired: true,
      reasonLabel: 'Lý do hủy',
      confirmLabel: 'Hủy nhu cầu',
      confirmVariant: 'danger',
    })
    if (!ok) return
    try {
      await api.patch(`/demands/${d.id}`, { status: 'cancelled', cancel_reason: ok.reason })
      setFeedback({ type: 'success', text: `Đã hủy nhu cầu ${d.code}.` })
      load()
    } catch (e) {
      setFeedback({ type: 'danger', text: apiError(e) })
    }
  }

  return (
    <div>
      <div className="d-flex justify-content-between mb-3 flex-wrap gap-2">
        <div>
          <h1 className="h3 mb-1">Nhu cầu cấp máu</h1>
          <p className="text-secondary mb-0">
            Đầu vào vòng điều phối. Số lượng đã nhận chỉ tăng khi một điều chuyển được đối chiếu nhập đạt.
          </p>
        </div>
        {canCreate && (
          <Button onClick={openCreate} disabled={isHospital && !user?.center_id}>
            + Tạo nhu cầu cấp máu
          </Button>
        )}
      </div>
      {feedback && (
        <Alert variant={feedback.type} dismissible onClose={() => setFeedback(null)}>
          {feedback.text}
        </Alert>
      )}

      <div className="table-panel">
        <LoadState loading={loading} error={error} onRetry={load} empty={!list.length} emptyText="Chưa có nhu cầu.">
          <Table hover size="sm" className="mb-0">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Cơ sở / khoa</th>
                <th>Nhóm / chế phẩm</th>
                <th style={{ minWidth: 140 }}>Đã nhận / Cần</th>
                <th>Ưu tiên</th>
                <th>Hạn cần</th>
                <th>Trạng thái</th>
                <th className="text-end">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => {
                const isOpen = ['open', 'matching'].includes(d.status)
                const canCancel =
                  isOpen && (hasRole('admin') || (isHospital && user?.center_id === d.center_id))
                return (
                  <tr key={d.id}>
                    <td>{d.code}</td>
                    <td className="small">
                      {d.facility_name}
                      {d.department && <div className="text-secondary">{d.department}</div>}
                    </td>
                    <td>
                      {d.blood_type} · {d.product_type}
                    </td>
                    <td>
                      <div className="small">
                        {d.qty_fulfilled}/{d.qty_needed}
                      </div>
                      <ProgressBar
                        now={(100 * d.qty_fulfilled) / Math.max(1, d.qty_needed)}
                        variant="success"
                        style={{ height: 6 }}
                        aria-label={`Đã nhận ${d.qty_fulfilled} trên ${d.qty_needed}`}
                      />
                    </td>
                    <td>
                      <Badge bg={PRIORITY_VARIANT[d.priority]}>{label(PRIORITY_LABEL, d.priority)}</Badge>
                    </td>
                    <td className="small">{fmtDateTime(d.deadline)}</td>
                    <td>
                      <Badge bg={REQUEST_STATUS_VARIANT[d.status]}>{label(REQUEST_STATUS_LABEL, d.status)}</Badge>
                      {d.cancel_reason && <div className="small text-secondary">{d.cancel_reason}</div>}
                    </td>
                    <td className="text-end text-nowrap">
                      <Button as={Link} size="sm" variant="link" to={`/transfers?filter=all&request=${d.id}`}>
                        Điều chuyển
                      </Button>
                      {hasRole('admin') && isOpen && (
                        <Button as={Link} size="sm" variant="outline-primary" className="me-1" to={`/matching?requestId=${d.id}`}>
                          Matching
                        </Button>
                      )}
                      {canCancel && (
                        <Button size="sm" variant="outline-secondary" onClick={() => cancelDemand(d)}>
                          Hủy…
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
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
            <Modal.Title>Tạo nhu cầu cấp máu</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p className="small text-secondary">Bản nháp được lưu tự động trên trình duyệt.</p>
            {isHospital ? (
              <Form.Group className="mb-2" controlId="dm-center-fixed">
                <Form.Label>Cơ sở nhận</Form.Label>
                <Form.Control plaintext readOnly value={ownCenter?.name || user?.center_id || '—'} />
              </Form.Group>
            ) : (
              <Form.Group className="mb-2" controlId="dm-center">
                <Form.Label>Cơ sở nhận *</Form.Label>
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
            )}
            <Form.Group className="mb-2" controlId="dm-department">
              <Form.Label>Khoa / bộ phận yêu cầu *</Form.Label>
              <Form.Control
                value={form.department}
                isInvalid={touched.department && !!errors.department}
                onBlur={() => setTouched((t) => ({ ...t, department: true }))}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
              <InlineFieldError message={touched.department && errors.department} />
            </Form.Group>
            <Row>
              <Col>
                <Form.Group className="mb-2" controlId="dm-bt">
                  <Form.Label>Nhóm máu *</Form.Label>
                  <Form.Select value={form.blood_type} onChange={(e) => setForm({ ...form, blood_type: e.target.value })}>
                    {BLOOD_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col>
                <Form.Group className="mb-2" controlId="dm-product">
                  <Form.Label>Chế phẩm *</Form.Label>
                  <Form.Select
                    value={form.product_type}
                    onChange={(e) => setForm({ ...form, product_type: e.target.value })}
                  >
                    {Object.entries(PRODUCT_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col>
                <Form.Group className="mb-2" controlId="dm-qty">
                  <Form.Label>Số lượng (đơn vị) *</Form.Label>
                  <Form.Control
                    type="number"
                    min={1}
                    value={form.qty_needed}
                    isInvalid={touched.qty_needed && !!errors.qty_needed}
                    onBlur={() => setTouched((t) => ({ ...t, qty_needed: true }))}
                    onChange={(e) => setForm({ ...form, qty_needed: e.target.value })}
                  />
                  <InlineFieldError message={touched.qty_needed && errors.qty_needed} />
                </Form.Group>
              </Col>
              <Col>
                <Form.Group className="mb-2" controlId="dm-priority">
                  <Form.Label>Ưu tiên</Form.Label>
                  <Form.Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
            <Form.Group className="mb-2" controlId="dm-deadline">
              <Form.Label>Hạn cần máu *</Form.Label>
              <Form.Control
                type="datetime-local"
                value={form.deadline}
                isInvalid={touched.deadline && !!errors.deadline}
                onBlur={() => setTouched((t) => ({ ...t, deadline: true }))}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
              <InlineFieldError message={touched.deadline && errors.deadline} />
            </Form.Group>
            <Form.Group controlId="dm-notes">
              <Form.Label>Ghi chú</Form.Label>
              <Form.Control value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
