import { useCallback, useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, Col, Form, Row, Spinner, Table } from 'react-bootstrap'
import { Link, useParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import TransferStepIndicator from '../components/TransferStepIndicator'
import { useConfirm } from '../hooks/useConfirm'
import {
  PRODUCT_LABEL,
  TEMP_BAND_LABEL,
  TRANSFER_STATUS_LABEL,
  TRANSFER_STATUS_VARIANT,
  UNIT_STATUS_LABEL,
  apiError,
  fmtDateTime,
  label,
} from '../utils/labels'

const TRANSIT_INIT = { ice_not_direct_contact: true, vehicle_ok: true, carrier_name: '', measured_temp_c: '' }
const RECEIVE_INIT = { packaging_ok: true, label_ok: true, transport_condition_ok: true, anomaly_note: '' }
const REJECT_INIT = { packaging_bad: false, label_bad: false, condition_bad: false, anomaly_note: '' }

function Field({ title, children }) {
  return (
    <Col md={6} className="mb-2">
      <div className="small text-secondary">{title}</div>
      <div>{children || '—'}</div>
    </Col>
  )
}

function okText(v) {
  if (v === true) return 'Đạt'
  if (v === false) return 'Không đạt'
  return '—'
}

export default function TransferDetailPage() {
  const { id } = useParams()
  const { user, hasRole } = useAuth()
  const { confirm } = useConfirm()
  const [t, setT] = useState(null)
  const [centers, setCenters] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [busy, setBusy] = useState(false)
  const [transit, setTransit] = useState(TRANSIT_INIT)
  const [receive, setReceive] = useState(RECEIVE_INIT)
  const [rejecting, setRejecting] = useState(false)
  const [reject, setReject] = useState(REJECT_INIT)

  const load = useCallback(() => {
    setLoadError('')
    Promise.all([api.get(`/transfers/${id}`), api.get('/centers')])
      .then(([tr, c]) => {
        setT(tr.data)
        setCenters(Object.fromEntries(c.data.map((x) => [x.id, x])))
      })
      .catch((err) => setLoadError(apiError(err, 'Không tải được điều chuyển.')))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <Spinner role="status" aria-label="Đang tải" />
  if (loadError || !t) {
    return (
      <Alert variant="danger">
        {loadError || 'Không tìm thấy điều chuyển.'}{' '}
        <Link to="/transfers" className="alert-link">
          Về danh sách
        </Link>
      </Alert>
    )
  }

  const isAdmin = hasRole('admin')
  const atSource = isAdmin || (user?.center_id && user.center_id === t.source_center_id)
  const atDest = isAdmin || (user?.center_id && user.center_id === t.dest_center_id)
  const source = centers[t.source_center_id]
  const dest = centers[t.dest_center_id]
  const needsLeadership = source && !source.has_supply_contract && !t.leadership_confirmed_by
  const unitText = t.unit ? `${t.unit.barcode} · ${t.unit.blood_type} · ${label(PRODUCT_LABEL, t.unit.product_type)}` : t.blood_unit_id
  const bandText = label(TEMP_BAND_LABEL, t.required_temperature_band)

  function summary(extra = []) {
    return [
      { label: 'Trạng thái hiện tại', value: label(TRANSFER_STATUS_LABEL, t.status) },
      { label: 'Đơn vị máu', value: unitText },
      { label: 'Hạn dùng', value: fmtDateTime(t.unit?.expires_at) },
      { label: 'Nguồn → Đích', value: `${source?.name || t.source_center_id} → ${dest?.name || t.dest_center_id}` },
      ...extra,
    ]
  }

  async function act(path, body) {
    setBusy(true)
    setFeedback(null)
    try {
      const { data } = await api.post(`/transfers/${t.id}/${path}`, body)
      setT(data)
      setRejecting(false)
      setFeedback({ type: 'success', text: `Đã cập nhật: ${label(TRANSFER_STATUS_LABEL, data.status)}` })
    } catch (err) {
      setFeedback({ type: 'danger', text: apiError(err) })
    } finally {
      setBusy(false)
    }
  }

  async function doConfirmSource() {
    const ok = await confirm({
      title: 'Xác nhận nguồn cung cấp',
      summary: summary(),
      body: (
        <p className="small mb-0">
          Đơn vị sẽ được <strong>giữ chỗ</strong> tại nguồn. Bước xác nhận giao nhận theo tinh thần Điều 39 — không
          phải quyết định pháp lý tự động.
          {needsLeadership && (
            <span className="d-block mt-2 text-danger">
              Cơ sở nguồn chưa có hợp đồng cung cấp: cần xác nhận lãnh đạo / ủy quyền kèm lý do.
            </span>
          )}
        </p>
      ),
      ...(needsLeadership
        ? {
            acknowledgeLabel:
              'Tôi xác nhận đã có ý kiến đồng ý của lãnh đạo / người được ủy quyền cho lần cung cấp này.',
            reasonRequired: true,
            reasonLabel: 'Căn cứ xác nhận lãnh đạo / ủy quyền',
          }
        : {}),
      confirmLabel: 'Xác nhận nguồn',
      confirmVariant: 'primary',
    })
    if (!ok) return
    await act('confirm', {
      note: 'Nguồn xác nhận',
      ...(needsLeadership ? { leadership_confirm: true, leadership_reason: ok.reason } : {}),
    })
  }

  async function doExport() {
    const ok = await confirm({
      title: 'Xác nhận xuất kho',
      summary: summary(),
      body: (
        <p className="small mb-0">
          Tồn kho nguồn sẽ ghi xuất theo điều chuyển. Bước tiếp theo: checklist bàn giao vận chuyển (Điều 20).
        </p>
      ),
      acknowledgeLabel: 'Tôi đã kiểm tra đúng mã túi, nhóm máu, chế phẩm và hạn dùng của đơn vị xuất.',
      confirmLabel: 'Xuất kho',
      confirmVariant: 'primary',
    })
    if (ok) await act('export', { note: 'Xuất kho' })
  }

  const measured = transit.measured_temp_c === '' ? null : Number(transit.measured_temp_c)
  const transitValid =
    transit.ice_not_direct_contact &&
    transit.vehicle_ok &&
    transit.carrier_name.trim().length >= 2 &&
    (measured === null || !Number.isNaN(measured))

  async function doTransit() {
    const ok = await confirm({
      title: 'Xác nhận bàn giao vận chuyển',
      summary: summary([
        { label: 'Dải nhiệt bắt buộc', value: bandText },
        { label: 'Nhiệt độ đo', value: measured === null ? 'Không ghi' : `${measured}°C` },
        { label: 'Đá không tiếp xúc túi', value: okText(transit.ice_not_direct_contact) },
        { label: 'Phương tiện bảo quản', value: okText(transit.vehicle_ok) },
        { label: 'Người vận chuyển', value: transit.carrier_name },
      ]),
      acknowledgeLabel:
        'Tôi đã kiểm tra thực tế điều kiện vận chuyển theo tinh thần Điều 20 TT 26/2013 và bàn giao cho người vận chuyển nêu trên.',
      confirmLabel: 'Bàn giao vận chuyển',
      confirmVariant: 'primary',
    })
    if (!ok) return
    await act('transit', {
      temperature_band: t.required_temperature_band,
      ice_not_direct_contact: transit.ice_not_direct_contact,
      vehicle_ok: transit.vehicle_ok,
      carrier_name: transit.carrier_name.trim(),
      measured_temp_c: measured,
    })
    setTransit(TRANSIT_INIT)
  }

  async function doArrive() {
    const ok = await confirm({
      title: 'Xác nhận đã nhận hàng',
      summary: summary([{ label: 'Người vận chuyển', value: t.carrier_name || '—' }]),
      body: (
        <p className="small mb-0">
          Ghi nhận kiện hàng đã tới cơ sở đích. Đơn vị <strong>chưa</strong> vào kho — bước tiếp theo là đối chiếu nhập
          (Điều 40).
        </p>
      ),
      confirmLabel: 'Đã nhận hàng',
      confirmVariant: 'primary',
    })
    if (ok) await act('arrive', { note: 'Hàng đã tới cơ sở đích' })
  }

  const receiveValid = receive.packaging_ok && receive.label_ok && receive.transport_condition_ok

  async function doReceive() {
    const ok = await confirm({
      title: 'Xác nhận nhập kho sau đối chiếu',
      summary: summary([
        { label: 'Bao gói', value: okText(receive.packaging_ok) },
        { label: 'Nhãn', value: okText(receive.label_ok) },
        { label: 'Điều kiện bảo quản / VC', value: okText(receive.transport_condition_ok) },
        { label: 'Ghi chú bất thường', value: receive.anomaly_note || '—' },
      ]),
      body: receive.anomaly_note ? (
        <p className="small mb-0 text-warning-emphasis">
          Ghi chú bất thường sẽ được thông báo cho cơ sở nguồn và cơ sở đích.
        </p>
      ) : null,
      acknowledgeLabel:
        'Tôi đã đối chiếu bao gói, nhãn và điều kiện bảo quản/vận chuyển theo tinh thần Điều 40 TT 26/2013 trước khi nhập kho.',
      confirmLabel: 'Xác nhận nhập kho',
      confirmVariant: 'success',
    })
    if (!ok) return
    await act('receive', { ...receive, note: 'Nhập kho sau đối chiếu' })
    setReceive(RECEIVE_INIT)
  }

  async function doReject() {
    const failed = [
      reject.packaging_bad && 'Bao gói',
      reject.label_bad && 'Nhãn',
      reject.condition_bad && 'Điều kiện bảo quản / VC',
    ].filter(Boolean)
    const ok = await confirm({
      title: 'Từ chối nhận',
      summary: summary([
        { label: 'Mục không đạt', value: failed.length ? failed.join(', ') : 'Không chọn mục nào' },
        { label: 'Mô tả bất thường', value: reject.anomaly_note || '—' },
      ]),
      body: (
        <p className="small mb-0">
          Đơn vị sẽ chuyển trạng thái <strong>cách ly</strong> tại cơ sở nguồn và chỉ được dùng lại sau khi nguồn kiểm
          tra lại. Thao tác được ghi audit và thông báo cho nguồn.
        </p>
      ),
      reasonRequired: true,
      reasonLabel: 'Lý do từ chối',
      confirmLabel: 'Từ chối nhận',
      confirmVariant: 'danger',
    })
    if (!ok) return
    await act('reject', {
      reason: ok.reason,
      packaging_ok: t.status === 'inbound_pending' ? !reject.packaging_bad : null,
      label_ok: t.status === 'inbound_pending' ? !reject.label_bad : null,
      transport_condition_ok: t.status === 'inbound_pending' ? !reject.condition_bad : null,
      anomaly_note: reject.anomaly_note,
    })
    setReject(REJECT_INIT)
  }

  async function doCancel() {
    const ok = await confirm({
      title: 'Hủy điều chuyển',
      summary: summary(),
      body: (
        <p className="small mb-0">
          Chỉ hủy được trước khi xuất kho. Đơn vị (nếu đang giữ chỗ) trở lại sẵn sàng tại nguồn nếu còn hạn.
        </p>
      ),
      reasonRequired: true,
      reasonLabel: 'Lý do hủy',
      confirmLabel: 'Hủy điều chuyển',
      confirmVariant: 'secondary',
    })
    if (ok) await act('cancel', { reason: ok.reason })
  }

  function waitingText() {
    switch (t.status) {
      case 'proposed':
        return `Đang chờ ${source?.name || 'cơ sở nguồn'} xác nhận nguồn.`
      case 'source_confirmed':
        return `Đang chờ ${source?.name || 'cơ sở nguồn'} xuất kho.`
      case 'exported':
        return `Đang chờ ${source?.name || 'cơ sở nguồn'} bàn giao vận chuyển.`
      case 'in_transit':
        return `Đang vận chuyển — chờ ${dest?.name || 'cơ sở đích'} xác nhận đã nhận hàng.`
      case 'inbound_pending':
        return `Đang chờ ${dest?.name || 'cơ sở đích'} đối chiếu nhập kho.`
      default:
        return null
    }
  }

  const canCancel = ['proposed', 'source_confirmed'].includes(t.status) && atSource
  const canReject = ['in_transit', 'inbound_pending'].includes(t.status) && atDest
  const hasAction =
    (t.status === 'proposed' && atSource) ||
    (t.status === 'source_confirmed' && atSource) ||
    (t.status === 'exported' && atSource) ||
    (t.status === 'in_transit' && atDest) ||
    (t.status === 'inbound_pending' && atDest)

  const tc = t.transport_checklist || {}
  const ic = t.inbound_checklist || {}

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start mb-2">
        <div>
          <Link to="/transfers" className="small text-secondary">
            ← Danh sách điều chuyển
          </Link>
          <h1 className="h3 mb-1 mt-1">
            Điều chuyển {t.id.slice(0, 8)}…{' '}
            <Badge bg={TRANSFER_STATUS_VARIANT[t.status]} className="align-middle fs-6">
              {label(TRANSFER_STATUS_LABEL, t.status)}
            </Badge>
          </h1>
        </div>
      </div>

      <TransferStepIndicator status={t.status} events={t.events} />
      <Alert variant="secondary" className="py-2 small">
        {t.disclaimer}
      </Alert>

      {feedback && (
        <Alert variant={feedback.type} dismissible onClose={() => setFeedback(null)}>
          {feedback.text}
        </Alert>
      )}

      <Row className="g-3">
        <Col lg={7}>
          <Card className="mb-3">
            <Card.Header className="fw-semibold">Thông tin giao nhận</Card.Header>
            <Card.Body>
              <Row>
                <Field title="Đơn vị máu">{unitText}</Field>
                <Field title="Hạn dùng / trạng thái đơn vị">
                  {t.unit ? `${fmtDateTime(t.unit.expires_at)} · ${label(UNIT_STATUS_LABEL, t.unit.status)}` : '—'}
                </Field>
                <Field title="Cơ sở nguồn">{source?.name}</Field>
                <Field title="Cơ sở đích">{dest?.name}</Field>
                <Field title="Nhu cầu">
                  {t.blood_request_id && (
                    <Link to={`/demands?highlight=${t.blood_request_id}`}>{t.blood_request_id.slice(0, 8)}…</Link>
                  )}
                </Field>
                <Field title="Người đề xuất">
                  {t.created_by_name ? `${t.created_by_name} · ${fmtDateTime(t.created_at)}` : null}
                </Field>
                <Field title="Hợp đồng cung cấp (nguồn)">
                  {source ? (source.has_supply_contract ? 'Có' : 'Chưa có') : null}
                </Field>
                <Field title="Xác nhận lãnh đạo / ủy quyền">
                  {t.leadership_confirmed_by_name
                    ? `${t.leadership_confirmed_by_name} · ${fmtDateTime(t.leadership_confirmed_at)} — ${t.leadership_reason || 'không ghi lý do'}`
                    : source && !source.has_supply_contract
                      ? 'Chưa có'
                      : 'Không yêu cầu (đã có HĐ)'}
                </Field>
                <Field title="Người bàn giao / vận chuyển">
                  {t.handed_over_by_name ? `${t.handed_over_by_name} → ${t.carrier_name}` : null}
                </Field>
                <Field title="Thời điểm hàng tới">{t.arrived_at ? fmtDateTime(t.arrived_at) : null}</Field>
                <Field title={t.status === 'rejected' ? 'Người từ chối' : 'Người đối chiếu nhập'}>
                  {t.received_by_name}
                </Field>
                {t.cancel_reason && (
                  <Field title={t.status === 'rejected' ? 'Lý do từ chối' : 'Lý do hủy'}>
                    <span className="text-danger">{t.cancel_reason}</span>
                  </Field>
                )}
              </Row>
            </Card.Body>
          </Card>

          <Card className="mb-3">
            <Card.Header className="fw-semibold">Hồ sơ checklist</Card.Header>
            <Card.Body className="small">
              <div className="fw-semibold mb-1">Vận chuyển (Điều 20)</div>
              {tc.recorded_at ? (
                <ul className="mb-3">
                  <li>Dải nhiệt: {label(TEMP_BAND_LABEL, tc.temperature_band)}</li>
                  <li>Nhiệt độ đo: {tc.measured_temp_c ?? 'không ghi'}{tc.measured_temp_c != null ? '°C' : ''}</li>
                  <li>Đá không tiếp xúc túi: {okText(tc.ice_not_direct_contact)}</li>
                  <li>Phương tiện bảo quản: {okText(tc.vehicle_ok)}</li>
                  <li>Người vận chuyển: {tc.carrier_name || t.carrier_name || '—'}</li>
                  <li>Ghi nhận lúc: {fmtDateTime(tc.recorded_at)}</li>
                </ul>
              ) : (
                <p className="text-secondary">Chưa ghi nhận.</p>
              )}
              <div className="fw-semibold mb-1">Đối chiếu nhập (Điều 40)</div>
              {ic.recorded_at ? (
                <ul className="mb-0">
                  <li>Kết quả: {ic.result === 'rejected' ? 'Từ chối' : 'Đạt — nhập kho'}</li>
                  <li>Bao gói: {okText(ic.packaging_ok)}</li>
                  <li>Nhãn: {okText(ic.label_ok)}</li>
                  <li>Điều kiện bảo quản / VC: {okText(ic.transport_condition_ok)}</li>
                  <li>Bất thường: {ic.anomaly_note || '—'}</li>
                  <li>Ghi nhận lúc: {fmtDateTime(ic.recorded_at)}</li>
                </ul>
              ) : (
                <p className="text-secondary mb-0">Chưa ghi nhận.</p>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col lg={5}>
          <Card className="mb-3 border-primary">
            <Card.Header className="fw-semibold">Bước tiếp theo</Card.Header>
            <Card.Body>
              {!hasAction && !canCancel && (
                <p className="mb-0 text-secondary">
                  {waitingText() || 'Điều chuyển đã kết thúc. Không còn thao tác.'}
                </p>
              )}

              {t.status === 'proposed' && atSource && (
                <>
                  <p className="small">Kiểm tra đơn vị tại kho rồi xác nhận cung cấp. Đơn vị sẽ được giữ chỗ.</p>
                  {needsLeadership && (
                    <Alert variant="warning" className="small py-2">
                      Nguồn chưa có hợp đồng cung cấp — cần xác nhận lãnh đạo / ủy quyền kèm căn cứ.
                    </Alert>
                  )}
                  <Button disabled={busy} onClick={doConfirmSource}>
                    Xác nhận nguồn
                  </Button>
                </>
              )}

              {t.status === 'source_confirmed' && atSource && (
                <>
                  <p className="small">Lấy đơn vị khỏi kho, kiểm tra mã túi/hạn dùng, ghi xuất kho.</p>
                  <Button disabled={busy} onClick={doExport}>
                    Xuất kho
                  </Button>
                </>
              )}

              {t.status === 'exported' && atSource && (
                <Form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (transitValid) doTransit()
                  }}
                >
                  <div className="fw-semibold mb-2">Checklist bàn giao vận chuyển (Điều 20)</div>
                  <Form.Group className="mb-2" controlId="transit-band">
                    <Form.Label className="small mb-1">Dải nhiệt bắt buộc theo chế phẩm</Form.Label>
                    <Form.Control plaintext readOnly value={bandText} className="fw-semibold" />
                  </Form.Group>
                  <Form.Group className="mb-2" controlId="transit-temp">
                    <Form.Label className="small mb-1">Nhiệt độ đo thực tế (°C, không bắt buộc)</Form.Label>
                    <Form.Control
                      type="number"
                      step="0.1"
                      value={transit.measured_temp_c}
                      onChange={(e) => setTransit((f) => ({ ...f, measured_temp_c: e.target.value }))}
                    />
                    <Form.Text>Nếu nhập, phải nằm trong dải bắt buộc — ngoài dải hệ thống sẽ không cho bàn giao.</Form.Text>
                  </Form.Group>
                  <Form.Group className="mb-2" controlId="transit-carrier">
                    <Form.Label className="small mb-1">Người vận chuyển *</Form.Label>
                    <Form.Control
                      value={transit.carrier_name}
                      isInvalid={transit.carrier_name.length > 0 && transit.carrier_name.trim().length < 2}
                      onChange={(e) => setTransit((f) => ({ ...f, carrier_name: e.target.value }))}
                      placeholder="Họ tên NV vận chuyển"
                    />
                  </Form.Group>
                  <Form.Check
                    id="transit-ice"
                    className="mb-1"
                    checked={transit.ice_not_direct_contact}
                    onChange={(e) => setTransit((f) => ({ ...f, ice_not_direct_contact: e.target.checked }))}
                    label="Đá lạnh không tiếp xúc trực tiếp túi máu"
                  />
                  <Form.Check
                    id="transit-vehicle"
                    className="mb-2"
                    checked={transit.vehicle_ok}
                    onChange={(e) => setTransit((f) => ({ ...f, vehicle_ok: e.target.checked }))}
                    label="Phương tiện bảo quản / vận chuyển phù hợp"
                  />
                  {!transitValid && (
                    <div className="small text-secondary mb-2">
                      Cần: tên người vận chuyển và tick đủ hai mục checklist.
                    </div>
                  )}
                  <Button type="submit" disabled={busy || !transitValid}>
                    Bàn giao vận chuyển
                  </Button>
                </Form>
              )}

              {t.status === 'in_transit' && atDest && (
                <>
                  <p className="small">Khi kiện hàng tới cơ sở, xác nhận đã nhận hàng rồi tiến hành đối chiếu nhập.</p>
                  <Button disabled={busy} onClick={doArrive}>
                    Xác nhận đã nhận hàng
                  </Button>
                </>
              )}

              {t.status === 'inbound_pending' && atDest && !rejecting && (
                <Form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (receiveValid) doReceive()
                  }}
                >
                  <div className="fw-semibold mb-2">Đối chiếu nhập kho (Điều 40)</div>
                  <Form.Check
                    id="recv-packaging"
                    className="mb-1"
                    checked={receive.packaging_ok}
                    onChange={(e) => setReceive((f) => ({ ...f, packaging_ok: e.target.checked }))}
                    label="Bao gói / hình thức đạt"
                  />
                  <Form.Check
                    id="recv-label"
                    className="mb-1"
                    checked={receive.label_ok}
                    onChange={(e) => setReceive((f) => ({ ...f, label_ok: e.target.checked }))}
                    label="Nhãn đúng (mã túi, nhóm máu, chế phẩm, hạn dùng)"
                  />
                  <Form.Check
                    id="recv-condition"
                    className="mb-2"
                    checked={receive.transport_condition_ok}
                    onChange={(e) => setReceive((f) => ({ ...f, transport_condition_ok: e.target.checked }))}
                    label="Điều kiện bảo quản / vận chuyển đạt"
                  />
                  <Form.Group className="mb-2" controlId="recv-anomaly">
                    <Form.Label className="small mb-1">Ghi chú bất thường (nếu có — sẽ báo phụ trách)</Form.Label>
                    <Form.Control
                      value={receive.anomaly_note}
                      onChange={(e) => setReceive((f) => ({ ...f, anomaly_note: e.target.value }))}
                    />
                  </Form.Group>
                  {!receiveValid && (
                    <div className="small text-danger mb-2">
                      Có mục không đạt — không nhập kho. Dùng “Từ chối nhận” để đơn vị được cách ly.
                    </div>
                  )}
                  <Button type="submit" variant="success" disabled={busy || !receiveValid}>
                    Xác nhận nhập kho
                  </Button>
                </Form>
              )}

              {canReject && !rejecting && (
                <div className="mt-3 pt-3 border-top">
                  <Button variant="outline-danger" disabled={busy} onClick={() => setRejecting(true)}>
                    Từ chối nhận…
                  </Button>
                </div>
              )}

              {canReject && rejecting && (
                <div>
                  <div className="fw-semibold mb-2 text-danger">Từ chối nhận</div>
                  {t.status === 'inbound_pending' && (
                    <>
                      <div className="small text-secondary mb-1">Mục không đạt:</div>
                      <Form.Check
                        id="rej-packaging"
                        checked={reject.packaging_bad}
                        onChange={(e) => setReject((f) => ({ ...f, packaging_bad: e.target.checked }))}
                        label="Bao gói / hình thức"
                      />
                      <Form.Check
                        id="rej-label"
                        checked={reject.label_bad}
                        onChange={(e) => setReject((f) => ({ ...f, label_bad: e.target.checked }))}
                        label="Nhãn"
                      />
                      <Form.Check
                        id="rej-condition"
                        className="mb-2"
                        checked={reject.condition_bad}
                        onChange={(e) => setReject((f) => ({ ...f, condition_bad: e.target.checked }))}
                        label="Điều kiện bảo quản / vận chuyển"
                      />
                    </>
                  )}
                  <Form.Group className="mb-2" controlId="rej-anomaly">
                    <Form.Label className="small mb-1">Mô tả bất thường</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={2}
                      value={reject.anomaly_note}
                      onChange={(e) => setReject((f) => ({ ...f, anomaly_note: e.target.value }))}
                    />
                  </Form.Group>
                  <div className="d-flex gap-2">
                    <Button variant="danger" disabled={busy} onClick={doReject}>
                      Tiếp tục từ chối
                    </Button>
                    <Button variant="outline-secondary" disabled={busy} onClick={() => setRejecting(false)}>
                      Quay lại
                    </Button>
                  </div>
                </div>
              )}

              {canCancel && (
                <div className="mt-3 pt-3 border-top">
                  <Button variant="outline-secondary" size="sm" disabled={busy} onClick={doCancel}>
                    Hủy điều chuyển
                  </Button>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <div className="table-panel">
        <div className="panel-head">Nhật ký giao nhận (transfer_events)</div>
        <Table size="sm" className="mb-0">
          <thead>
            <tr>
              <th>Thời điểm</th>
              <th>Người thao tác</th>
              <th>Từ</th>
              <th>Đến</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {(t.events || []).map((e) => (
              <tr key={e.id}>
                <td className="small text-nowrap">{fmtDateTime(e.created_at)}</td>
                <td className="small">{e.actor_name || e.actor_id || '—'}</td>
                <td className="small">{e.from_status ? label(TRANSFER_STATUS_LABEL, e.from_status) : '—'}</td>
                <td className="small">{label(TRANSFER_STATUS_LABEL, e.to_status)}</td>
                <td className="small">{e.note}</td>
              </tr>
            ))}
            {!t.events?.length && (
              <tr>
                <td colSpan={5} className="text-secondary text-center py-3">
                  Chưa có sự kiện.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </div>
  )
}
