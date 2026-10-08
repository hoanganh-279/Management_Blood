import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Button, Col, Form, Modal, Row, Table } from 'react-bootstrap'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import LoadState from '../components/LoadState'
import { useConfirm } from '../hooks/useConfirm'
import {
  BLOOD_TYPES,
  COVERAGE_LEVEL_LABEL,
  OUT_REASON_LABEL,
  PRODUCT_LABEL,
  TX_REASON_LABEL,
  UNIT_STATUS_LABEL,
  UNIT_STATUS_VARIANT,
  apiError,
  fmtDateTime,
  label,
} from '../utils/labels'

const PAGE = 100
const LEVEL_ORDER = ['critical', 'warning', 'ok', 'no_demand']
const LEVEL_BORDER = { critical: 'border-danger', warning: 'border-warning', ok: 'border-success', no_demand: '' }
const STATUS_FILTERS = [
  { key: '', label: 'Tất cả trạng thái' },
  { key: 'available', label: 'Sẵn sàng' },
  { key: 'quarantine', label: 'Cách ly' },
  { key: 'reserved', label: 'Giữ chỗ điều chuyển' },
  { key: 'transferred', label: 'Đang điều chuyển' },
  { key: 'closed', label: 'Đã cấp phát / hết hạn / hủy bỏ' },
]

const EMPTY_RECEIPT = {
  barcode: '',
  blood_type: 'O+',
  product_type: 'PRBC',
  volume_ml: 350,
  collected_at: '',
  expires_at: '',
  location_label: '',
  center_id: '',
  note: '',
}

function toIso(local) {
  return local ? new Date(local).toISOString() : null
}

export default function InventoryPage() {
  const { user, hasRole } = useAuth()
  const { confirm } = useConfirm()
  const [params] = useSearchParams()
  const [units, setUnits] = useState([])
  const [centers, setCenters] = useState({})
  const [coverage, setCoverage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [bloodType, setBloodType] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const [receiptOpen, setReceiptOpen] = useState(false)
  const [receipt, setReceipt] = useState(EMPTY_RECEIPT)
  const [outUnit, setOutUnit] = useState(null)
  const [outForm, setOutForm] = useState({ reason: 'issued', note: '' })
  const [qUnit, setQUnit] = useState(null)
  const [qForm, setQForm] = useState({ decision: 'release', reason: '' })
  const [history, setHistory] = useState(null)
  const [busy, setBusy] = useState(false)

  const canStock = hasRole('admin', 'staff_bank')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    const q = {}
    if (params.get('expiring')) q.expiring_hours = params.get('expiring')
    Promise.all([api.get('/inventory/units', { params: q }), api.get('/centers'), api.get('/inventory/coverage')])
      .then(([u, c, cov]) => {
        setUnits(u.data)
        setCenters(Object.fromEntries(c.data.map((x) => [x.id, x])))
        setCoverage(cov.data)
      })
      .catch((err) => setError(apiError(err, 'Không tải được tồn kho.')))
      .finally(() => setLoading(false))
  }, [params])

  useEffect(() => {
    load()
  }, [load])

  const byType = useMemo(
    () =>
      BLOOD_TYPES.map((t) => {
        const available = units.filter((u) => u.blood_type === t && ['ready', 'critical'].includes(u.status)).length
        const cells = (coverage?.cells || []).filter((c) => c.blood_type === t)
        const demand = cells.reduce((s, c) => s + c.open_demand, 0)
        const level = LEVEL_ORDER.find((lv) => cells.some((c) => c.level === lv)) || 'no_demand'
        return { t, available, demand, level }
      }),
    [units, coverage],
  )

  const filtered = useMemo(() => {
    let r = units
    if (bloodType) r = r.filter((u) => u.blood_type === bloodType)
    if (statusFilter === 'available') r = r.filter((u) => ['ready', 'critical'].includes(u.status))
    else if (statusFilter === 'closed') r = r.filter((u) => ['used', 'expired', 'discarded'].includes(u.status))
    else if (statusFilter) r = r.filter((u) => u.status === statusFilter)
    return r
  }, [units, bloodType, statusFilter])

  const quarantineCount = units.filter((u) => u.status === 'quarantine').length

  function canActOn(u) {
    return hasRole('admin') || (!!user?.center_id && user.center_id === u.center_id)
  }

  async function submitReceipt() {
    const payload = {
      type: 'in',
      ...receipt,
      volume_ml: Number(receipt.volume_ml) || 350,
      collected_at: toIso(receipt.collected_at),
      expires_at: toIso(receipt.expires_at),
      center_id: hasRole('admin') ? receipt.center_id : user.center_id,
    }
    setReceiptOpen(false)
    const ok = await confirm({
      title: 'Xác nhận nhập đơn vị mới',
      summary: [
        { label: 'Mã túi', value: payload.barcode },
        { label: 'Nhóm / chế phẩm', value: `${payload.blood_type} · ${label(PRODUCT_LABEL, payload.product_type)}` },
        { label: 'Hạn dùng', value: fmtDateTime(payload.expires_at) },
        { label: 'Cơ sở nhập', value: centers[payload.center_id]?.name || payload.center_id || '—' },
      ],
      body: (
        <p className="small mb-0">
          Chỉ dùng cho đơn vị <strong>mới</strong> tiếp nhận vào kho. Đơn vị từ cơ sở khác phải nhận qua Điều chuyển →
          Đối chiếu nhập.
        </p>
      ),
      acknowledgeLabel: 'Tôi đã kiểm tra nhãn, bao gói và thông tin đơn vị trước khi nhập kho.',
      confirmLabel: 'Nhập kho',
      confirmVariant: 'primary',
    })
    if (!ok) {
      setReceiptOpen(true)
      return
    }
    setBusy(true)
    try {
      await api.post('/inventory/transactions', payload)
      setReceipt(EMPTY_RECEIPT)
      setFeedback({ type: 'success', text: `Đã nhập đơn vị ${payload.barcode}.` })
      load()
    } catch (err) {
      setFeedback({ type: 'danger', text: apiError(err) })
      setReceiptOpen(true)
    } finally {
      setBusy(false)
    }
  }

  async function submitOut() {
    const u = outUnit
    setOutUnit(null)
    const ok = await confirm({
      title: 'Xác nhận xuất kho',
      summary: [
        { label: 'Đơn vị', value: `${u.barcode} · ${u.blood_type} · ${u.product_type}` },
        { label: 'Lý do', value: label(OUT_REASON_LABEL, outForm.reason) },
        { label: 'Ghi chú', value: outForm.note },
      ],
      body: (
        <p className="small mb-0">
          Xuất kho tại cơ sở (không phải điều chuyển). Cấp phát sử dụng lâm sàng thuộc thẩm quyền chuyên môn tại cơ sở.
        </p>
      ),
      confirmLabel: 'Xuất kho',
      confirmVariant: outForm.reason === 'issued' ? 'primary' : 'danger',
    })
    if (!ok) {
      setOutUnit(u)
      return
    }
    setBusy(true)
    try {
      await api.post('/inventory/transactions', { type: 'out', unit_id: u.id, reason: outForm.reason, note: outForm.note })
      setFeedback({ type: 'success', text: `Đã xuất ${u.barcode} (${label(OUT_REASON_LABEL, outForm.reason)}).` })
      setOutForm({ reason: 'issued', note: '' })
      load()
    } catch (err) {
      setFeedback({ type: 'danger', text: apiError(err) })
    } finally {
      setBusy(false)
    }
  }

  async function submitQuarantine() {
    const u = qUnit
    setQUnit(null)
    const release = qForm.decision === 'release'
    const ok = await confirm({
      title: release ? 'Đưa đơn vị trở lại sẵn sàng' : 'Hủy bỏ đơn vị cách ly',
      summary: [
        { label: 'Đơn vị', value: `${u.barcode} · ${u.blood_type} · ${u.product_type}` },
        { label: 'Hạn dùng', value: fmtDateTime(u.expires_at) },
        { label: 'Quyết định', value: release ? 'Đạt kiểm tra lại — sẵn sàng' : 'Hủy bỏ' },
        { label: 'Lý do / kết quả kiểm tra', value: qForm.reason },
      ],
      acknowledgeLabel: release
        ? 'Tôi đã kiểm tra lại bao gói, nhãn và điều kiện bảo quản; đơn vị đủ điều kiện sử dụng.'
        : 'Tôi xác nhận hủy bỏ đơn vị này.',
      confirmLabel: release ? 'Đưa về sẵn sàng' : 'Hủy bỏ đơn vị',
      confirmVariant: release ? 'success' : 'danger',
    })
    if (!ok) {
      setQUnit(u)
      return
    }
    setBusy(true)
    try {
      await api.post(`/inventory/units/${u.id}/quarantine-review`, qForm)
      setFeedback({ type: 'success', text: `Đã xử lý cách ly ${u.barcode}.` })
      setQForm({ decision: 'release', reason: '' })
      load()
    } catch (err) {
      setFeedback({ type: 'danger', text: apiError(err) })
    } finally {
      setBusy(false)
    }
  }

  async function openHistory(u) {
    setHistory({ unit: u, rows: null })
    try {
      const { data } = await api.get(`/inventory/units/${u.id}/history`)
      setHistory({ unit: u, rows: data })
    } catch (err) {
      setHistory({ unit: u, rows: [], error: apiError(err) })
    }
  }

  const receiptValid =
    receipt.barcode.trim().length >= 4 &&
    receipt.expires_at &&
    new Date(receipt.expires_at) > new Date() &&
    (!hasRole('admin') || receipt.center_id)

  return (
    <div>
      <div className="d-flex justify-content-between mb-3 align-items-start flex-wrap gap-2">
        <div>
          <h1 className="h3 mb-1">Quản lý tồn kho máu</h1>
          <p className="text-secondary mb-0">
            Nhập đơn vị mới · xuất cấp phát / hủy · xét duyệt cách ly. Nhận từ cơ sở khác: qua màn Điều chuyển.
          </p>
        </div>
        <div className="d-flex gap-2">
          {canStock && (
            <Button size="sm" onClick={() => setReceiptOpen(true)}>
              + Nhập đơn vị mới
            </Button>
          )}
          <Button as={Link} to="/transfers" size="sm" variant="outline-primary">
            Điều chuyển
          </Button>
        </div>
      </div>

      {feedback && (
        <Alert variant={feedback.type} dismissible onClose={() => setFeedback(null)}>
          {feedback.text}
        </Alert>
      )}

      {quarantineCount > 0 && (
        <Alert variant="danger" className="py-2 d-flex justify-content-between align-items-center">
          <span>
            {quarantineCount} đơn vị đang <strong>cách ly</strong> (bị từ chối khi nhận) — cần kiểm tra lại trước khi sử
            dụng hoặc hủy bỏ.
          </span>
          <Button size="sm" variant="outline-danger" onClick={() => setStatusFilter('quarantine')}>
            Xem đơn vị cách ly
          </Button>
        </Alert>
      )}

      {params.get('expiring') && (
        <div className="alert-banner">Đang lọc đơn vị hết hạn trong &lt; {params.get('expiring')} giờ</div>
      )}

      <LoadState loading={loading} error={error} onRetry={load}>
        <Row className="g-2 mb-3">
          {byType.map((x) => {
            const active = bloodType === x.t
            return (
              <Col key={x.t} xs={6} md={3} lg>
                <button
                  type="button"
                  className={`kpi-card kpi-filter text-start w-100 ${LEVEL_BORDER[x.level]} ${active ? 'is-active' : ''}`}
                  aria-pressed={active}
                  title={`${COVERAGE_LEVEL_LABEL[x.level]} — bấm để ${active ? 'bỏ lọc' : 'lọc'} nhóm ${x.t}`}
                  onClick={() => setBloodType((p) => (p === x.t ? '' : x.t))}
                >
                  <div className="fw-bold">{x.t}</div>
                  <div className="value fs-4">{x.available}</div>
                  <div className="small">{x.demand ? `Nhu cầu mở: ${x.demand}` : 'Không có nhu cầu mở'}</div>
                </button>
              </Col>
            )
          })}
        </Row>
        <p className="small text-secondary">
          Viền màu theo Coverage nhu cầu mở (ngưỡng cấu hình prototype — không phải ngưỡng y tế).
        </p>

        <div className="d-flex gap-2 mb-2 flex-wrap">
          <Form.Select
            aria-label="Lọc nhóm máu"
            className="w-auto"
            value={bloodType}
            onChange={(e) => setBloodType(e.target.value)}
          >
            <option value="">Tất cả nhóm máu</option>
            {BLOOD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Form.Select>
          <Form.Select
            aria-label="Lọc trạng thái"
            className="w-auto"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Form.Select>
        </div>

        <div className="table-panel">
          {!filtered.length ? (
            <div className="text-secondary text-center py-4">Không có đơn vị phù hợp bộ lọc.</div>
          ) : (
            <Table hover size="sm" className="mb-0">
              <thead>
                <tr>
                  <th>Mã túi</th>
                  <th>Nhóm</th>
                  <th>Chế phẩm</th>
                  <th>Hạn dùng</th>
                  <th>Trạng thái</th>
                  <th>Cơ sở / vị trí</th>
                  <th className="text-end">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map((u) => (
                  <tr key={u.id}>
                    <td className="small">{u.barcode}</td>
                    <td className="fw-semibold">{u.blood_type}</td>
                    <td className="small">{label(PRODUCT_LABEL, u.product_type)}</td>
                    <td className="small">{fmtDateTime(u.expires_at)}</td>
                    <td>
                      <Badge bg={UNIT_STATUS_VARIANT[u.status] || 'secondary'}>{label(UNIT_STATUS_LABEL, u.status)}</Badge>
                    </td>
                    <td className="small">
                      {centers[u.center_id]?.name || u.center_id}
                      {u.location_label && <div className="text-secondary">{u.location_label}</div>}
                    </td>
                    <td className="text-end text-nowrap">
                      {canStock && canActOn(u) && ['ready', 'critical'].includes(u.status) && (
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          className="me-1"
                          onClick={() => {
                            setOutForm({ reason: 'issued', note: '' })
                            setOutUnit(u)
                          }}
                        >
                          Xuất…
                        </Button>
                      )}
                      {canActOn(u) && u.status === 'quarantine' && (
                        <Button
                          size="sm"
                          variant="outline-danger"
                          className="me-1"
                          onClick={() => {
                            setQForm({ decision: 'release', reason: '' })
                            setQUnit(u)
                          }}
                        >
                          Xét duyệt cách ly…
                        </Button>
                      )}
                      <Button size="sm" variant="link" onClick={() => openHistory(u)}>
                        Lịch sử
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {filtered.length > limit && (
            <div className="p-2 text-center small">
              Hiển thị {limit}/{filtered.length} đơn vị.{' '}
              <Button size="sm" variant="link" onClick={() => setLimit((l) => l + PAGE)}>
                Xem thêm
              </Button>
            </div>
          )}
        </div>
      </LoadState>

      <Modal show={receiptOpen} onHide={() => setReceiptOpen(false)}>
        <Form
          onSubmit={(e) => {
            e.preventDefault()
            if (receiptValid) submitReceipt()
          }}
        >
          <Modal.Header closeButton>
            <Modal.Title>Nhập đơn vị máu mới</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Alert variant="secondary" className="py-2 small">
              Không dùng để nhận đơn vị từ cơ sở khác — việc đó qua Điều chuyển → Đối chiếu nhập.
            </Alert>
            {hasRole('admin') && (
              <Form.Group className="mb-2" controlId="rc-center">
                <Form.Label>Cơ sở nhập *</Form.Label>
                <Form.Select
                  value={receipt.center_id}
                  onChange={(e) => setReceipt((f) => ({ ...f, center_id: e.target.value }))}
                >
                  <option value="">— Chọn cơ sở —</option>
                  {Object.values(centers).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            )}
            <Form.Group className="mb-2" controlId="rc-barcode">
              <Form.Label>Mã túi máu (barcode) *</Form.Label>
              <Form.Control
                value={receipt.barcode}
                onChange={(e) => setReceipt((f) => ({ ...f, barcode: e.target.value }))}
              />
            </Form.Group>
            <Row>
              <Col>
                <Form.Group className="mb-2" controlId="rc-bt">
                  <Form.Label>Nhóm máu *</Form.Label>
                  <Form.Select
                    value={receipt.blood_type}
                    onChange={(e) => setReceipt((f) => ({ ...f, blood_type: e.target.value }))}
                  >
                    {BLOOD_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col>
                <Form.Group className="mb-2" controlId="rc-product">
                  <Form.Label>Chế phẩm *</Form.Label>
                  <Form.Select
                    value={receipt.product_type}
                    onChange={(e) => setReceipt((f) => ({ ...f, product_type: e.target.value }))}
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
                <Form.Group className="mb-2" controlId="rc-collected">
                  <Form.Label>Ngày lấy máu</Form.Label>
                  <Form.Control
                    type="datetime-local"
                    value={receipt.collected_at}
                    onChange={(e) => setReceipt((f) => ({ ...f, collected_at: e.target.value }))}
                  />
                </Form.Group>
              </Col>
              <Col>
                <Form.Group className="mb-2" controlId="rc-expires">
                  <Form.Label>Hạn dùng *</Form.Label>
                  <Form.Control
                    type="datetime-local"
                    value={receipt.expires_at}
                    isInvalid={!!receipt.expires_at && new Date(receipt.expires_at) <= new Date()}
                    onChange={(e) => setReceipt((f) => ({ ...f, expires_at: e.target.value }))}
                  />
                  <Form.Control.Feedback type="invalid">Không nhập đơn vị đã hết hạn.</Form.Control.Feedback>
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col>
                <Form.Group className="mb-2" controlId="rc-volume">
                  <Form.Label>Thể tích (ml)</Form.Label>
                  <Form.Control
                    type="number"
                    min={1}
                    value={receipt.volume_ml}
                    onChange={(e) => setReceipt((f) => ({ ...f, volume_ml: e.target.value }))}
                  />
                </Form.Group>
              </Col>
              <Col>
                <Form.Group className="mb-2" controlId="rc-location">
                  <Form.Label>Vị trí lưu</Form.Label>
                  <Form.Control
                    value={receipt.location_label}
                    onChange={(e) => setReceipt((f) => ({ ...f, location_label: e.target.value }))}
                  />
                </Form.Group>
              </Col>
            </Row>
            <Form.Group controlId="rc-note">
              <Form.Label>Ghi chú</Form.Label>
              <Form.Control value={receipt.note} onChange={(e) => setReceipt((f) => ({ ...f, note: e.target.value }))} />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setReceiptOpen(false)}>
              Đóng
            </Button>
            <Button type="submit" disabled={!receiptValid || busy}>
              Tiếp tục…
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={!!outUnit} onHide={() => setOutUnit(null)}>
        <Form
          onSubmit={(e) => {
            e.preventDefault()
            if (outForm.note.trim().length >= 3) submitOut()
          }}
        >
          <Modal.Header closeButton>
            <Modal.Title>Xuất kho tại cơ sở</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {outUnit && (
              <p className="small">
                {outUnit.barcode} · {outUnit.blood_type} · {label(PRODUCT_LABEL, outUnit.product_type)} — HSD{' '}
                {fmtDateTime(outUnit.expires_at)}
              </p>
            )}
            <Form.Group className="mb-2" controlId="out-reason">
              <Form.Label>Lý do xuất *</Form.Label>
              <Form.Select value={outForm.reason} onChange={(e) => setOutForm((f) => ({ ...f, reason: e.target.value }))}>
                {Object.entries(OUT_REASON_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group controlId="out-note">
              <Form.Label>Ghi chú (khoa nhận / lý do hủy) *</Form.Label>
              <Form.Control value={outForm.note} onChange={(e) => setOutForm((f) => ({ ...f, note: e.target.value }))} />
              <Form.Text>Bắt buộc, tối thiểu 3 ký tự.</Form.Text>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setOutUnit(null)}>
              Đóng
            </Button>
            <Button type="submit" disabled={outForm.note.trim().length < 3 || busy}>
              Tiếp tục…
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={!!qUnit} onHide={() => setQUnit(null)}>
        <Form
          onSubmit={(e) => {
            e.preventDefault()
            if (qForm.reason.trim().length >= 3) submitQuarantine()
          }}
        >
          <Modal.Header closeButton>
            <Modal.Title>Xét duyệt đơn vị cách ly</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {qUnit && (
              <p className="small">
                {qUnit.barcode} · {qUnit.blood_type} · {label(PRODUCT_LABEL, qUnit.product_type)} — HSD{' '}
                {fmtDateTime(qUnit.expires_at)}
              </p>
            )}
            <Form.Check
              type="radio"
              id="q-release"
              name="q-decision"
              label="Kiểm tra lại đạt — đưa về sẵn sàng"
              checked={qForm.decision === 'release'}
              onChange={() => setQForm((f) => ({ ...f, decision: 'release' }))}
            />
            <Form.Check
              type="radio"
              id="q-discard"
              name="q-decision"
              className="mb-2"
              label="Không đạt — hủy bỏ đơn vị"
              checked={qForm.decision === 'discard'}
              onChange={() => setQForm((f) => ({ ...f, decision: 'discard' }))}
            />
            <Form.Group controlId="q-reason">
              <Form.Label>Kết quả kiểm tra / lý do *</Form.Label>
              <Form.Control value={qForm.reason} onChange={(e) => setQForm((f) => ({ ...f, reason: e.target.value }))} />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setQUnit(null)}>
              Đóng
            </Button>
            <Button type="submit" disabled={qForm.reason.trim().length < 3 || busy}>
              Tiếp tục…
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={!!history} onHide={() => setHistory(null)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Lịch sử đơn vị {history?.unit?.barcode}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <LoadState
            loading={history && !history.rows}
            error={history?.error}
            empty={history?.rows && !history.rows.length}
            emptyText="Chưa có giao dịch kho."
          >
            <Table size="sm" className="mb-0">
              <thead>
                <tr>
                  <th>Thời điểm</th>
                  <th>Giao dịch</th>
                  <th>Từ → Đến</th>
                  <th>Người thao tác</th>
                  <th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {(history?.rows || []).map((r) => (
                  <tr key={r.id}>
                    <td className="small text-nowrap">{fmtDateTime(r.created_at)}</td>
                    <td className="small">
                      {r.reason ? label(TX_REASON_LABEL, r.reason) : r.type === 'in' ? 'Nhập kho' : 'Xuất kho'}
                      {r.transfer_id && (
                        <div>
                          <Link to={`/transfers/${r.transfer_id}`}>Xem điều chuyển</Link>
                        </div>
                      )}
                    </td>
                    <td className="small">
                      {centers[r.from_center_id]?.name || r.from_center_id || '—'} →{' '}
                      {centers[r.to_center_id]?.name || r.to_center_id || '—'}
                    </td>
                    <td className="small">{r.actor_name || '—'}</td>
                    <td className="small">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </LoadState>
        </Modal.Body>
      </Modal>
    </div>
  )
}
