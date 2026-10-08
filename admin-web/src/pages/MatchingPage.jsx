import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Button, Card, Col, Form, Row, Spinner, Table } from 'react-bootstrap'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import LoadState from '../components/LoadState'
import { useConfirm } from '../hooks/useConfirm'
import {
  FACILITY_TYPE_LABEL,
  PRIORITY_LABEL,
  PRODUCT_LABEL,
  apiError,
  fmtDateTime,
  label,
} from '../utils/labels'

const COMPONENT_LABEL = {
  B: 'B · đủ đơn vị đúng nhóm & chế phẩm',
  D: 'D · khoảng cách',
  T: 'T · hạn dùng so với hạn cần',
  A: 'A · dư so với ngưỡng an toàn nguồn (cấu hình)',
  R: 'R · tỷ lệ hoàn thành lịch sử',
}

export default function MatchingPage() {
  const { confirm } = useConfirm()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [demands, setDemands] = useState([])
  const [centers, setCenters] = useState({})
  const [requestId, setRequestId] = useState('')
  const [result, setResult] = useState(null)
  const [selected, setSelected] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [running, setRunning] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const [review, setReview] = useState(null) // { candidate, units }
  const [unitId, setUnitId] = useState('')
  const [leaderReason, setLeaderReason] = useState('')
  const [proposing, setProposing] = useState(false)

  const loadLogs = useCallback(() => api.get('/matching/logs').then((r) => setLogs(r.data)), [])

  const load = useCallback(() => {
    setLoading(true)
    setLoadError('')
    Promise.all([api.get('/demands'), api.get('/centers'), api.get('/matching/logs')])
      .then(([demRes, cenRes, logRes]) => {
        const open = demRes.data.filter((d) => ['open', 'matching'].includes(d.status))
        setDemands(open)
        setCenters(Object.fromEntries(cenRes.data.map((c) => [c.id, c])))
        setLogs(logRes.data)
        const fromUrl = params.get('requestId')
        setRequestId((cur) => {
          if (fromUrl && open.some((d) => d.id === fromUrl)) return fromUrl
          if (cur && open.some((d) => d.id === cur)) return cur
          return open[0]?.id || ''
        })
      })
      .catch((err) => setLoadError(apiError(err, 'Không tải được dữ liệu matching.')))
      .finally(() => setLoading(false))
  }, [params])

  useEffect(() => {
    load()
  }, [load])

  const req = demands.find((d) => d.id === requestId)
  const demandLabel = (d) => `[${d.code}] ${d.facility_name} — ${d.blood_type} ${d.product_type}`

  async function run() {
    setRunning(true)
    setFeedback(null)
    setReview(null)
    try {
      const { data } = await api.post('/matching/run', { request_id: requestId, radius_km: 30, top_k: 20 })
      setResult(data)
      setSelected(data.candidates[0] || null)
      loadLogs()
    } catch (err) {
      setFeedback({ type: 'danger', text: apiError(err, 'Chạy matching thất bại.') })
    } finally {
      setRunning(false)
    }
  }

  async function openReview(candidate) {
    setFeedback(null)
    try {
      const { data: units } = await api.get('/matching/units', {
        params: { request_id: requestId, center_id: candidate.center_id },
      })
      if (!units.length) {
        setFeedback({
          type: 'warning',
          text: 'Cơ sở này không còn đơn vị đủ điều kiện (đúng nhóm máu, đúng chế phẩm, còn hạn, chưa thuộc điều chuyển khác).',
        })
        return
      }
      setReview({ candidate, units })
      setUnitId(units[0].id)
      setLeaderReason('')
    } catch (err) {
      setFeedback({ type: 'danger', text: apiError(err, 'Không tải được đơn vị tại nguồn.') })
    }
  }

  const sourceCenter = review ? centers[review.candidate.center_id] : null
  const needsLeadership = !!sourceCenter && !sourceCenter.has_supply_contract
  const leaderOk = !needsLeadership || leaderReason.trim().length >= 3
  const chosenUnit = review?.units.find((u) => u.id === unitId)

  async function submitProposal() {
    if (!review || !chosenUnit || !leaderOk) return
    const ok = await confirm({
      title: 'Xác nhận tạo đề xuất điều chuyển',
      summary: [
        { label: 'Nhu cầu', value: demandLabel(req) },
        { label: 'Cơ sở nguồn', value: review.candidate.center_name },
        { label: 'Đơn vị', value: `${chosenUnit.barcode} · HSD ${fmtDateTime(chosenUnit.expires_at)}` },
        { label: 'Điểm DSS', value: String(review.candidate.score) },
        {
          label: 'HĐ cung cấp',
          value: needsLeadership ? `Không — xác nhận lãnh đạo: ${leaderReason.trim()}` : 'Có',
        },
      ],
      body: (
        <Alert variant="warning" className="py-2 small mb-0">
          Chỉ tạo trạng thái <strong>Đề xuất</strong>. Cơ sở nguồn còn phải xác nhận, xuất kho, bàn giao vận chuyển; cơ
          sở đích đối chiếu nhập. Kết quả DSS không thay thẩm quyền chuyên môn hay pháp lý.
        </Alert>
      ),
      acknowledgeLabel: needsLeadership
        ? 'Tôi xác nhận đã có ý kiến đồng ý của lãnh đạo/người được ủy quyền tại cơ sở nguồn (chưa có HĐ cung cấp).'
        : 'Tôi đã xem lại nguồn, đơn vị máu và nhu cầu trước khi đề xuất.',
      confirmLabel: 'Tạo đề xuất',
      confirmVariant: 'primary',
    })
    if (!ok) return
    setProposing(true)
    try {
      const { data: transfer } = await api.post('/transfers', {
        unit_id: chosenUnit.id,
        source_center_id: review.candidate.center_id,
        blood_request_id: req.id,
        note: `DSS đề xuất từ ${review.candidate.center_name} (điểm ${review.candidate.score})`,
        leadership_confirm: needsLeadership,
        leadership_reason: needsLeadership ? leaderReason.trim() : '',
      })
      navigate(`/transfers/${transfer.id}`)
    } catch (err) {
      setFeedback({ type: 'danger', text: apiError(err, 'Tạo đề xuất thất bại.') })
    } finally {
      setProposing(false)
    }
  }

  const weightLabel = useMemo(() => {
    if (!result?.weights) return ''
    return Object.entries(result.weights)
      .map(([k, v]) => `${k}=${v}`)
      .join(' · ')
  }, [result])

  const demandCode = (id) => demands.find((d) => d.id === id)?.code || `${id.slice(0, 8)}…`

  return (
    <div>
      <h1 className="h3 mb-1">Matching cơ sở nguồn (DSS)</h1>
      <Alert variant="secondary" className="py-2 small">
        Kết quả DSS chỉ hỗ trợ quyết định — không thay thẩm quyền chuyên môn hay pháp lý. Chỉ xét nguồn được phép cung
        cấp (allowed_to_supply_others), đúng nhóm máu và đúng chế phẩm, còn hạn. Truyền nhóm thay thế là quyết định lâm
        sàng ngoài hệ thống.
      </Alert>
      {feedback && (
        <Alert variant={feedback.type} dismissible onClose={() => setFeedback(null)}>
          {feedback.text}
        </Alert>
      )}

      <LoadState
        loading={loading}
        error={loadError}
        onRetry={load}
        empty={!demands.length}
        emptyText="Không có nhu cầu mở cần điều phối."
      >
        <Row className="g-3 mb-3 align-items-end">
          <Col md={8}>
            <Form.Group controlId="matching-demand">
              <Form.Label>Nhu cầu cấp máu</Form.Label>
              <Form.Select
                value={requestId}
                onChange={(e) => {
                  setRequestId(e.target.value)
                  setResult(null)
                  setReview(null)
                }}
              >
                {demands.map((d) => (
                  <option key={d.id} value={d.id}>
                    {demandLabel(d)} (cần {d.qty_needed}, còn thiếu {Math.max(0, d.qty_needed - d.qty_fulfilled)})
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={4}>
            <Button className="w-100" variant="primary" onClick={run} disabled={!requestId || running}>
              {running ? <Spinner size="sm" /> : 'Chạy matching cơ sở'}
            </Button>
          </Col>
        </Row>

        {req && (
          <Row className="g-3 mb-3">
            <Col md={3}>
              <div className="kpi-card">
                <div className="label">Nhóm máu / chế phẩm</div>
                <div className="value fs-5">
                  {req.blood_type} · {req.product_type}
                </div>
              </div>
            </Col>
            <Col md={3}>
              <div className="kpi-card">
                <div className="label">Còn thiếu / Cần</div>
                <div className="value">
                  {Math.max(0, req.qty_needed - req.qty_fulfilled)}/{req.qty_needed}
                </div>
              </div>
            </Col>
            <Col md={3}>
              <div className="kpi-card">
                <div className="label">Ưu tiên</div>
                <div className="value fs-5">{label(PRIORITY_LABEL, req.priority)}</div>
              </div>
            </Col>
            <Col md={3}>
              <div className="kpi-card">
                <div className="label">Hạn cần</div>
                <div className="value fs-6">{fmtDateTime(req.deadline)}</div>
              </div>
            </Col>
          </Row>
        )}
      </LoadState>

      {result && (
        <Row className="g-3">
          <Col lg={8}>
            <div className="table-panel">
              <div className="panel-head">Top-K cơ sở nguồn · trọng số cấu hình {weightLabel}</div>
              {!result.candidates.length ? (
                <div className="text-secondary text-center py-4">
                  Không có cơ sở nguồn đủ điều kiện trong bán kính tìm kiếm.
                </div>
              ) : (
                <Table hover size="sm" className="mb-0">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Cơ sở nguồn</th>
                      <th>Loại</th>
                      <th>Đơn vị đủ điều kiện</th>
                      <th>Khoảng cách</th>
                      <th>Điểm</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.candidates.map((c) => (
                      <tr
                        key={c.center_id}
                        className={selected?.center_id === c.center_id ? 'table-active' : ''}
                        tabIndex={0}
                        onClick={() => setSelected(c)}
                        onKeyDown={(e) => e.key === 'Enter' && setSelected(c)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>{c.rank}</td>
                        <td>{c.center_name}</td>
                        <td>{label(FACILITY_TYPE_LABEL, c.facility_type)}</td>
                        <td>{c.available_units}</td>
                        <td>{c.distance_km} km</td>
                        <td className="fw-bold">{c.score}</td>
                        <td>
                          <Button
                            size="sm"
                            variant="outline-primary"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelected(c)
                              openReview(c)
                            }}
                          >
                            Xem xét đề xuất
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          </Col>
          <Col lg={4}>
            {selected && (
              <div className="table-panel p-3">
                <div className="label">Tổng điểm DSS</div>
                <div className="display-6 fw-bold">{selected.score}</div>
                <p className="small mb-1">{selected.center_name}</p>
                <p className="small text-secondary">Heuristic nghiên cứu (Product §5.3) — không theo quy định BYT.</p>
                {Object.entries(selected.components).map(([k, v]) => {
                  const max = result.component_max?.[k] || 0
                  return (
                    <div key={k} className="mb-2">
                      <div className="d-flex justify-content-between small">
                        <span>{COMPONENT_LABEL[k] || k}</span>
                        <span>
                          {v}/{max}
                        </span>
                      </div>
                      <div className="score-bar">
                        <span style={{ width: `${max ? (v / max) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Col>
        </Row>
      )}

      {review && req && (
        <Card className="mt-3 border-primary">
          <Card.Header className="fw-semibold">Xem xét đề xuất — {review.candidate.center_name}</Card.Header>
          <Card.Body>
            <Form
              onSubmit={(e) => {
                e.preventDefault()
                submitProposal()
              }}
            >
              <Form.Group className="mb-2" controlId="review-unit">
                <Form.Label>Đơn vị máu tại nguồn (đã lọc đúng nhóm, đúng chế phẩm, còn hạn)</Form.Label>
                <Form.Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                  {review.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.barcode} · {u.blood_type} · {label(PRODUCT_LABEL, u.product_type)} · HSD {fmtDateTime(u.expires_at)}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              <div className="small mb-2">
                Hợp đồng cung cấp:{' '}
                {needsLeadership ? (
                  <Badge bg="warning" text="dark">
                    Chưa có — cần xác nhận lãnh đạo/ủy quyền
                  </Badge>
                ) : (
                  <Badge bg="success">Có</Badge>
                )}
              </div>
              {needsLeadership && (
                <Form.Group className="mb-2" controlId="review-leader">
                  <Form.Label>Lý do / căn cứ xác nhận lãnh đạo, ủy quyền *</Form.Label>
                  <Form.Control
                    value={leaderReason}
                    isInvalid={leaderReason.length > 0 && !leaderOk}
                    onChange={(e) => setLeaderReason(e.target.value)}
                    placeholder="VD: Đã có ý kiến đồng ý của Phó Giám đốc phụ trách qua điện thoại lúc …"
                  />
                  <Form.Text>Bắt buộc, tối thiểu 3 ký tự. Được lưu cùng tên người xác nhận và thời điểm.</Form.Text>
                </Form.Group>
              )}
              <div className="d-flex gap-2 mt-3">
                <Button type="submit" disabled={proposing || !chosenUnit || !leaderOk}>
                  {proposing ? <Spinner size="sm" /> : 'Tạo đề xuất…'}
                </Button>
                <Button variant="outline-secondary" onClick={() => setReview(null)} disabled={proposing}>
                  Đóng
                </Button>
              </div>
            </Form>
          </Card.Body>
        </Card>
      )}

      <div className="table-panel mt-3">
        <div className="panel-head">Nhật ký chạy matching (MatchingLog)</div>
        {!logs.length ? (
          <div className="text-secondary text-center py-3">Chưa có lần chạy nào.</div>
        ) : (
          <Table size="sm" className="mb-0">
            <thead>
              <tr>
                <th>Thời điểm</th>
                <th>Nhu cầu</th>
                <th>Số ứng viên</th>
                <th>Top-K</th>
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 8).map((l) => (
                <tr key={l.id}>
                  <td className="small">{fmtDateTime(l.created_at)}</td>
                  <td className="small">{demandCode(l.request_id)}</td>
                  <td className="small">{l.candidates?.length ?? 0}</td>
                  <td className="small">{l.top_k}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <div className="mt-2">
        <Button as={Link} to="/transfers?filter=open" variant="link" className="px-0">
          Theo dõi các điều chuyển đang mở →
        </Button>
      </div>
    </div>
  )
}
