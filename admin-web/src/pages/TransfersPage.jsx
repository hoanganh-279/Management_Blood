import { useCallback, useEffect, useState } from 'react'
import { Alert, Badge, Button, Col, Form, Modal, Row, Table } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import DssNote from '../components/DssNote'
import EmptyState from '../components/EmptyState'
import MiniStepper from '../components/MiniStepper'
import PageSkeleton from '../components/PageSkeleton'
import StatusChip from '../components/StatusChip'
import TransferStepIndicator from '../components/TransferStepIndicator'
import { useConfirm } from '../hooks/useConfirm'

const STATUS_LABEL = {
  proposed: 'Đề xuất',
  source_confirmed: 'Nguồn xác nhận',
  exported: 'Đã xuất',
  in_transit: 'Đang VC',
  inbound_pending: 'Chờ nhập',
  received: 'Đã nhận',
  rejected: 'Từ chối',
  cancelled: 'Hủy',
}

const STATUS_VARIANT = {
  proposed: 'secondary',
  source_confirmed: 'info',
  exported: 'primary',
  in_transit: 'warning',
  inbound_pending: 'warning',
  received: 'success',
  rejected: 'danger',
  cancelled: 'dark',
}

export default function TransfersPage() {
  const { user, hasRole } = useAuth()
  const { confirm } = useConfirm()
  const [list, setList] = useState([])
  const [centers, setCenters] = useState({})
  const [units, setUnits] = useState({})
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState(null)
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)

  const [transitForm, setTransitForm] = useState({
    temperature_band: '1_to_10C',
    ice_not_direct_contact: true,
    vehicle_ok: true,
  })
  const [receiveForm, setReceiveForm] = useState({
    packaging_ok: true,
    label_ok: true,
    transport_condition_ok: true,
    anomaly_note: '',
  })

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([api.get('/transfers'), api.get('/centers'), api.get('/inventory/units')])
      .then(([t, c, u]) => {
        setList(t.data)
        setCenters(Object.fromEntries(c.data.map((x) => [x.id, x])))
        setUnits(Object.fromEntries(u.data.map((x) => [x.id, x])))
      })
      .catch((err) => {
        setFeedback({ type: 'danger', text: err.response?.data?.detail || 'Không tải được điều chuyển.' })
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function centerName(id) {
    return centers[id]?.name || id
  }

  function unitLabel(id) {
    const u = units[id]
    return u ? `${u.barcode} (${u.blood_type})` : id?.slice(0, 8)
  }

  function baseSummary(t) {
    return [
      { label: 'Trạng thái hiện tại', value: STATUS_LABEL[t.status] || t.status },
      { label: 'Đơn vị máu', value: unitLabel(t.blood_unit_id) },
      {
        label: 'Nguồn → Đích',
        value: `${centerName(t.source_center_id)} → ${centerName(t.dest_center_id)}`,
      },
    ]
  }

  async function act(path, body = {}) {
    if (!selected) return
    setBusy(true)
    setFeedback(null)
    try {
      const { data } = await api.post(`/transfers/${selected.id}/${path}`, body)
      setSelected(data)
      setFeedback({ type: 'success', text: `Đã cập nhật → ${STATUS_LABEL[data.status] || data.status}` })
      load()
    } catch (err) {
      setFeedback({
        type: 'danger',
        text: err.response?.data?.detail || 'Thao tác thất bại.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function confirmAndAct(path, body, modalOpts) {
    const ok = await confirm(modalOpts)
    if (!ok) return
    const merged =
      typeof body === 'function' ? body(ok) : { ...body, ...(ok.reason ? { note: ok.reason, reason: ok.reason } : {}) }
    await act(path, merged)
  }

  const canSource =
    hasRole('admin') ||
    (user?.center_id && selected && user.center_id === selected.source_center_id)
  const canDest =
    hasRole('admin') ||
    (user?.center_id && selected && user.center_id === selected.dest_center_id)

  const tempLabel = {
    '1_to_10C': '1–10°C (MTP/HC)',
    '20_to_24C': '20–24°C (TC/BC)',
    le_minus_18C: '≤ −18°C (HT đông lạnh)',
  }

  if (loading) return <PageSkeleton cards={0} />

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h1 className="h3 mb-1">Điều chuyển (lifecycle)</h1>
          <p className="text-secondary mb-0">
            Đề xuất → xác nhận → xuất → checklist VC → đối chiếu nhập → audit
          </p>
        </div>
        {hasRole('admin') && (
          <Button as={Link} to="/matching" variant="outline-danger" size="sm">
            Matching → đề xuất
          </Button>
        )}
      </div>

      <DssNote>
        DSS hỗ trợ quyết định điều phối — không thay thẩm quyền chuyên môn hay pháp lý. Checklist VC/nhập
        theo tinh thần TT 26/2013 Điều 20 &amp; 40 (ghi nhận, không IoT).
      </DssNote>

      {feedback && (
        <Alert variant={feedback.type} dismissible onClose={() => setFeedback(null)}>
          {feedback.text}
        </Alert>
      )}

      <div className="table-panel">
        {!list.length ? (
          <EmptyState
            icon="transfer"
            title="Chưa có điều chuyển nào"
            hint="Điều chuyển được tạo từ kết quả Matching cơ sở nguồn."
          >
            {hasRole('admin') && (
              <Button as={Link} to="/matching" variant="danger" size="sm">
                Chạy matching để tạo đề xuất
              </Button>
            )}
          </EmptyState>
        ) : (
        <Table hover size="sm" className="mb-0">
          <thead>
            <tr>
              <th>Trạng thái</th>
              <th>Đơn vị</th>
              <th>Nguồn</th>
              <th>Đích</th>
              <th>Nhu cầu</th>
              <th>Cập nhật</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr
                key={t.id}
                className={selected?.id === t.id ? 'table-active' : ''}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelected(t)}
              >
                <td>
                  <StatusChip status={t.status} label={STATUS_LABEL[t.status] || t.status} />
                  <div className="mt-1">
                    <MiniStepper status={t.status} />
                  </div>
                </td>
                <td className="small">{unitLabel(t.blood_unit_id)}</td>
                <td className="small">{centerName(t.source_center_id)}</td>
                <td className="small">{centerName(t.dest_center_id)}</td>
                <td className="small">{t.blood_request_id ? `${t.blood_request_id.slice(0, 8)}…` : '—'}</td>
                <td className="small">{new Date(t.updated_at).toLocaleString('vi-VN')}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        )}
      </div>

      <Modal show={!!selected} onHide={() => setSelected(null)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Chi tiết điều chuyển</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selected && (
            <>
              <TransferStepIndicator status={selected.status} />
              <p className="small text-secondary mb-2">{selected.disclaimer}</p>
              <Row className="mb-3">
                <Col md={6}>
                  <div className="small text-secondary">Trạng thái</div>
                  <Badge bg={STATUS_VARIANT[selected.status]}>{STATUS_LABEL[selected.status]}</Badge>
                </Col>
                <Col md={6}>
                  <div className="small text-secondary">Đơn vị</div>
                  <div>{unitLabel(selected.blood_unit_id)}</div>
                </Col>
                <Col md={6} className="mt-2">
                  <div className="small text-secondary">Nguồn → Đích</div>
                  <div>
                    {centerName(selected.source_center_id)} → {centerName(selected.dest_center_id)}
                  </div>
                </Col>
              </Row>

              {selected.status === 'proposed' && canSource && (
                <Button
                  className="me-2 mb-2"
                  disabled={busy}
                  onClick={() =>
                    confirmAndAct('confirm', { note: 'Nguồn xác nhận' }, {
                      title: 'Xác nhận nguồn cung cấp',
                      summary: baseSummary(selected),
                      confirmLabel: 'Xác nhận nguồn',
                      confirmVariant: 'primary',
                      body: (
                        <p className="small mb-0">
                          Đơn vị sẽ được <strong>đặt chỗ (reserved)</strong> tại nguồn. Đây là bước xác nhận
                          giao nhận (tinh thần Điều 39), không phải quyết định pháp lý tự động.
                        </p>
                      ),
                    })
                  }
                >
                  Xác nhận nguồn
                </Button>
              )}

              {selected.status === 'source_confirmed' && canSource && (
                <Button
                  className="me-2 mb-2"
                  disabled={busy}
                  onClick={() =>
                    confirmAndAct('export', { note: 'Xuất kho' }, {
                      title: 'Xác nhận xuất kho',
                      summary: baseSummary(selected),
                      confirmLabel: 'Xuất kho',
                      confirmVariant: 'primary',
                      body: (
                        <p className="small mb-0">
                          Tồn nguồn sẽ ghi xuất. Tiếp theo bắt buộc checklist vận chuyển (Điều 20) trước khi
                          giao nhận đích.
                        </p>
                      ),
                    })
                  }
                >
                  Xuất kho
                </Button>
              )}

              {selected.status === 'exported' && canSource && (
                <div className="border rounded p-3 mb-2">
                  <div className="fw-semibold mb-2">Checklist vận chuyển (Điều 20)</div>
                  <Form.Select
                    className="mb-2"
                    value={transitForm.temperature_band}
                    onChange={(e) =>
                      setTransitForm((f) => ({ ...f, temperature_band: e.target.value }))
                    }
                  >
                    <option value="1_to_10C">Máu toàn phần / HC: 1–10°C</option>
                    <option value="20_to_24C">Tiểu cầu / bạch cầu: 20–24°C</option>
                    <option value="le_minus_18C">HT đông lạnh: ≤ −18°C</option>
                  </Form.Select>
                  <Form.Check
                    className="mb-1"
                    checked={transitForm.ice_not_direct_contact}
                    onChange={(e) =>
                      setTransitForm((f) => ({ ...f, ice_not_direct_contact: e.target.checked }))
                    }
                    label="Đá lạnh không tiếp xúc trực tiếp túi máu"
                  />
                  <Form.Check
                    className="mb-2"
                    checked={transitForm.vehicle_ok}
                    onChange={(e) => setTransitForm((f) => ({ ...f, vehicle_ok: e.target.checked }))}
                    label="Phương tiện bảo quản / vận chuyển phù hợp"
                  />
                  <Button
                    disabled={busy || !transitForm.ice_not_direct_contact || !transitForm.vehicle_ok}
                    onClick={() =>
                      confirmAndAct('transit', transitForm, {
                        title: 'Xác nhận bắt đầu vận chuyển',
                        summary: [
                          ...baseSummary(selected),
                          {
                            label: 'Dải nhiệt độ',
                            value: tempLabel[transitForm.temperature_band] || transitForm.temperature_band,
                          },
                          {
                            label: 'Đá không tiếp xúc túi',
                            value: transitForm.ice_not_direct_contact ? 'Đạt' : 'Không',
                          },
                          {
                            label: 'Phương tiện VC',
                            value: transitForm.vehicle_ok ? 'Đạt' : 'Không',
                          },
                        ],
                        acknowledgeLabel:
                          'Tôi đã kiểm tra thực tế điều kiện vận chuyển theo tinh thần Điều 20 TT 26/2013 (ghi nhận trên hệ thống, không thay IoT).',
                        confirmLabel: 'Bắt đầu vận chuyển',
                        confirmVariant: 'warning',
                      })
                    }
                  >
                    Bắt đầu vận chuyển
                  </Button>
                </div>
              )}

              {selected.status === 'inbound_pending' && canDest && (
                <div className="border rounded p-3 mb-2">
                  <div className="fw-semibold mb-2">Đối chiếu nhập kho (Điều 40)</div>
                  <Form.Check
                    className="mb-1"
                    checked={receiveForm.packaging_ok}
                    onChange={(e) =>
                      setReceiveForm((f) => ({ ...f, packaging_ok: e.target.checked }))
                    }
                    label="Bao gói / hình thức đạt"
                  />
                  <Form.Check
                    className="mb-1"
                    checked={receiveForm.label_ok}
                    onChange={(e) => setReceiveForm((f) => ({ ...f, label_ok: e.target.checked }))}
                    label="Nhãn đạt"
                  />
                  <Form.Check
                    className="mb-2"
                    checked={receiveForm.transport_condition_ok}
                    onChange={(e) =>
                      setReceiveForm((f) => ({ ...f, transport_condition_ok: e.target.checked }))
                    }
                    label="Điều kiện bảo quản / VC đạt"
                  />
                  <Form.Control
                    className="mb-2"
                    placeholder="Ghi chú bất thường (nếu có)"
                    value={receiveForm.anomaly_note}
                    onChange={(e) =>
                      setReceiveForm((f) => ({ ...f, anomaly_note: e.target.value }))
                    }
                  />
                  <Button
                    className="me-2"
                    variant="success"
                    disabled={
                      busy ||
                      !receiveForm.packaging_ok ||
                      !receiveForm.label_ok ||
                      !receiveForm.transport_condition_ok
                    }
                    onClick={() =>
                      confirmAndAct('receive', receiveForm, {
                        title: 'Xác nhận nhập kho sau đối chiếu',
                        summary: [
                          ...baseSummary(selected),
                          { label: 'Bao gói', value: receiveForm.packaging_ok ? 'Đạt' : 'Không' },
                          { label: 'Nhãn', value: receiveForm.label_ok ? 'Đạt' : 'Không' },
                          {
                            label: 'Điều kiện VC',
                            value: receiveForm.transport_condition_ok ? 'Đạt' : 'Không',
                          },
                          {
                            label: 'Ghi chú bất thường',
                            value: receiveForm.anomaly_note || '—',
                          },
                        ],
                        acknowledgeLabel:
                          'Tôi đã đối chiếu bao gói, nhãn và điều kiện bảo quản/vận chuyển theo tinh thần Điều 40 TT 26/2013 trước khi nhập kho.',
                        confirmLabel: 'Xác nhận nhập kho',
                        confirmVariant: 'success',
                      })
                    }
                  >
                    Xác nhận nhập kho
                  </Button>
                  <Button
                    variant="outline-danger"
                    disabled={busy}
                    onClick={() =>
                      confirmAndAct(
                        'reject',
                        (payload) => ({
                          reason: payload.reason || receiveForm.anomaly_note || 'Từ chối sau đối chiếu',
                          ...receiveForm,
                        }),
                        {
                          title: 'Từ chối nhận sau đối chiếu',
                          summary: baseSummary(selected),
                          reasonRequired: true,
                          reasonLabel: 'Lý do từ chối',
                          reasonPlaceholder: receiveForm.anomaly_note || 'Mô tả lý do từ chối…',
                          confirmLabel: 'Từ chối nhận',
                          confirmVariant: 'danger',
                          body: (
                            <p className="small mb-0">
                              Đơn vị sẽ được trả về trạng thái sẵn sàng tại nguồn (nếu hợp lệ). Thao tác này
                              được ghi audit.
                            </p>
                          ),
                        },
                      )
                    }
                  >
                    Từ chối
                  </Button>
                </div>
              )}

              {['proposed', 'source_confirmed', 'exported', 'in_transit', 'inbound_pending'].includes(
                selected.status,
              ) &&
                (hasRole('admin') || canSource) && (
                  <Button
                    variant="outline-secondary"
                    className="mb-2"
                    disabled={busy}
                    onClick={() =>
                      confirmAndAct(
                        'cancel',
                        (payload) => ({ reason: payload.reason || 'Hủy bởi người dùng' }),
                        {
                          title: 'Hủy điều chuyển',
                          summary: baseSummary(selected),
                          reasonRequired: true,
                          reasonLabel: 'Lý do hủy',
                          confirmLabel: 'Hủy điều chuyển',
                          confirmVariant: 'secondary',
                          body: (
                            <p className="small mb-0 text-danger">
                              Thao tác không thể hoàn tác bằng Undo. Trạng thái sẽ chuyển sang cancelled và
                              ghi audit.
                            </p>
                          ),
                        },
                      )
                    }
                  >
                    Hủy điều chuyển
                  </Button>
                )}

              <div className="mt-3">
                <div className="fw-semibold mb-2">Audit (transfer_events)</div>
                <Table size="sm">
                  <thead>
                    <tr>
                      <th>Từ</th>
                      <th>Đến</th>
                      <th>Ghi chú</th>
                      <th>Thời điểm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selected.events || []).map((e) => (
                      <tr key={e.id}>
                        <td className="small">{e.from_status || '—'}</td>
                        <td className="small">{e.to_status}</td>
                        <td className="small">{e.note}</td>
                        <td className="small">{new Date(e.created_at).toLocaleString('vi-VN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </>
          )}
        </Modal.Body>
      </Modal>
    </div>
  )
}
