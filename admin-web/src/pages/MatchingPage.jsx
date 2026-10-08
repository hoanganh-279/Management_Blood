import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Col, Form, Row, Spinner, Table } from 'react-bootstrap'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import DssNote from '../components/DssNote'
import KpiCard from '../components/KpiCard'
import ScoreStack, { ScoreLegend, SCORE_PARTS } from '../components/ScoreStack'
import { useConfirm } from '../hooks/useConfirm'

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
  const [running, setRunning] = useState(false)
  const [proposing, setProposing] = useState(false)
  const [feedback, setFeedback] = useState(null)

  useEffect(() => {
    Promise.all([api.get('/demands'), api.get('/centers'), api.get('/matching/logs')]).then(
      ([demRes, cenRes, logRes]) => {
        const open = demRes.data.filter((d) => ['open', 'matching'].includes(d.status))
        setDemands(open)
        setCenters(Object.fromEntries(cenRes.data.map((c) => [c.id, c])))
        setLogs(logRes.data)
        const fromUrl = params.get('requestId')
        if (fromUrl && open.some((d) => d.id === fromUrl)) setRequestId(fromUrl)
        else if (open[0]) setRequestId(open[0].id)
      },
    )
  }, [params])

  async function run() {
    setRunning(true)
    setFeedback(null)
    try {
      const { data } = await api.post('/matching/run', {
        request_id: requestId,
        radius_km: 30,
        top_k: 20,
      })
      setResult(data)
      setSelected(data.candidates[0] || null)
      const logsRes = await api.get('/matching/logs')
      setLogs(logsRes.data)
    } finally {
      setRunning(false)
    }
  }

  async function proposeFrom(candidate) {
    const req = demands.find((d) => d.id === requestId)
    if (!req || !candidate) return
    setProposing(true)
    setFeedback(null)
    try {
      const { data: units } = await api.get('/inventory/units', {
        params: {
          center_id: candidate.center_id,
          blood_type: req.blood_type,
          status: 'ready',
        },
      })
      const ready = units.filter((u) => ['ready', 'critical'].includes(u.status))
      if (!ready.length) {
        setFeedback({ type: 'danger', text: 'Không còn đơn vị sẵn sàng tại cơ sở nguồn.' })
        return
      }

      const sourceCenter = centers[candidate.center_id]
      const needsLeadership = sourceCenter && !sourceCenter.has_supply_contract

      const review = await confirm({
        title: 'Review đề xuất điều chuyển (DSS)',
        summary: [
          { label: 'Nhu cầu', value: `[${req.code}] ${req.facility_name} — ${req.blood_type}` },
          { label: 'Cơ sở nguồn', value: candidate.center_name },
          { label: 'Điểm DSS', value: String(candidate.score) },
          {
            label: 'HĐ cung cấp',
            value: sourceCenter?.has_supply_contract ? 'Có' : 'Không (cần xác nhận lãnh đạo — prototype)',
          },
        ],
        body: (
          <div>
            <Alert variant="warning" className="py-2 small mb-2">
              Kết quả DSS chỉ hỗ trợ quyết định — không thay thẩm quyền chuyên môn hay pháp lý. Nút xác nhận
              chỉ tạo trạng thái <strong>proposed</strong> (chưa fulfill).
            </Alert>
            <Form.Group className="mb-2">
              <Form.Label>Chọn đơn vị máu tại nguồn</Form.Label>
              <Form.Select id="propose-unit-select" defaultValue={ready[0].id}>
                {ready.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.barcode} · {u.product_type} · HSD {new Date(u.expires_at).toLocaleDateString('vi-VN')}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </div>
        ),
        acknowledgeLabel: needsLeadership
          ? 'Xác nhận lãnh đạo / ủy quyền khi chưa có HĐ cung cấp (prototype — không thay chữ ký thật Điều 39).'
          : 'Tôi đã xem lại nguồn, đơn vị máu và nhu cầu trước khi đề xuất.',
        confirmLabel: 'Tạo đề xuất điều chuyển',
        confirmVariant: 'danger',
        onBeforeConfirm: (payload) => {
          const select = document.getElementById('propose-unit-select')
          const unitId = select?.value || ready[0].id
          return {
            unitId,
            leadershipConfirm: needsLeadership ? !!payload.acknowledged : true,
          }
        },
      })

      if (!review?.unitId) return

      const { data: transfer } = await api.post('/transfers', {
        unit_id: review.unitId,
        source_center_id: candidate.center_id,
        dest_center_id: req.center_id,
        blood_request_id: req.id,
        note: `DSS đề xuất từ ${candidate.center_name}`,
        leadership_confirm: review.leadershipConfirm,
      })
      setFeedback({
        type: 'success',
        text: `Đã tạo đề xuất điều chuyển (${transfer.id.slice(0, 8)}…) — chưa fulfill.`,
      })
      const demRes = await api.get('/demands')
      const open = demRes.data.filter((d) => ['open', 'matching'].includes(d.status))
      setDemands(open)
      navigate('/transfers')
    } catch (err) {
      setFeedback({
        type: 'danger',
        text: err.response?.data?.detail || 'Tạo đề xuất thất bại.',
      })
    } finally {
      setProposing(false)
    }
  }

  const req = demands.find((d) => d.id === requestId)
  const weightLabel = useMemo(() => {
    if (!result?.weights) return ''
    return Object.entries(result.weights)
      .map(([k, v]) => `${Math.round(v * 100)}${k}`)
      .join('-')
  }, [result])

  return (
    <div>
      <h1 className="h3 mb-1">Matching cơ sở nguồn (DSS)</h1>
      <DssNote>
        Kết quả DSS chỉ hỗ trợ quyết định — không thay thẩm quyền chuyên môn hay pháp lý. Nút dưới chỉ{' '}
        <strong>đề xuất</strong> điều chuyển (chưa fulfill).
      </DssNote>
      {feedback && (
        <Alert variant={feedback.type} dismissible onClose={() => setFeedback(null)}>
          {feedback.text}{' '}
          {feedback.type === 'success' && (
            <Button as={Link} to="/transfers" size="sm" variant="outline-success" className="ms-2">
              Mở Điều chuyển
            </Button>
          )}
        </Alert>
      )}

      <Row className="g-3 mb-3 align-items-end">
        <Col md={8}>
          <Form.Label>Nhu cầu cấp máu</Form.Label>
          <Form.Select value={requestId} onChange={(e) => setRequestId(e.target.value)}>
            {demands.map((d) => (
              <option key={d.id} value={d.id}>
                [{d.code}] {d.facility_name} — {d.blood_type} (cần {d.qty_needed}, thiếu{' '}
                {Math.max(0, d.qty_needed - d.qty_fulfilled)})
              </option>
            ))}
          </Form.Select>
        </Col>
        <Col md={4}>
          <Button className="w-100 btn-emergency" onClick={run} disabled={!requestId || running}>
            {running ? <Spinner size="sm" /> : 'Chạy matching cơ sở'}
          </Button>
        </Col>
      </Row>

      {req && (
        <Row className="g-3 mb-3">
          <Col md={4}>
            <KpiCard icon="droplet" tone="danger" label="Nhóm mục tiêu" value={req.blood_type} />
          </Col>
          <Col md={4}>
            <KpiCard
              icon="alert"
              label="Thiếu / Cần"
              value={`${Math.max(0, req.qty_needed - req.qty_fulfilled)}/${req.qty_needed}`}
            />
          </Col>
          <Col md={4}>
            <KpiCard
              icon="clock"
              label="Hạn"
              value={<span className="fs-5">{new Date(req.deadline).toLocaleString('vi-VN')}</span>}
            />
          </Col>
        </Row>
      )}

      {result && (
        <Row className="g-3">
          <Col lg={8}>
            <div className="table-panel">
              <div className="panel-head">
                Top-K cơ sở (chỉ nguồn allowed_to_supply_others) · trọng số {weightLabel}
              </div>
              <Table hover size="sm" className="mb-0">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Cơ sở nguồn</th>
                    <th>Loại</th>
                    <th>Tồn sẵn</th>
                    <th>Khoảng cách</th>
                    <th style={{ minWidth: 150 }}>
                      Điểm <ScoreLegend />
                    </th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {result.candidates.map((c) => (
                    <tr
                      key={c.center_id}
                      className={selected?.center_id === c.center_id ? 'table-active' : ''}
                      onClick={() => setSelected(c)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{c.rank}</td>
                      <td>{c.center_name}</td>
                      <td>{c.facility_type}</td>
                      <td>{c.available_units}</td>
                      <td>{c.distance_km} km</td>
                      <td>
                        <div className="fw-bold text-danger lh-1 mb-1">{c.score}</div>
                        <ScoreStack components={c.components} height={8} />
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant="outline-danger"
                          disabled={proposing}
                          onClick={(e) => {
                            e.stopPropagation()
                            proposeFrom(c)
                          }}
                        >
                          Đề xuất
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Col>
          <Col lg={4}>
            {selected && (
              <div className="table-panel p-3">
                <div className="label">Tổng điểm DSS</div>
                <div className="display-5 text-danger fw-bold">{selected.score}</div>
                <p className="small mb-2">{selected.center_name}</p>
                <ScoreStack components={selected.components} height={12} />
                <div className="mb-3" />
                <p className="small text-secondary">
                  B=tồn đúng nhóm · D=khoảng cách · T=hạn dùng · A=dư an toàn · R=lịch sử transfer
                  (heuristic — không theo BYT)
                </p>
                {Object.entries(selected.components).map(([k, v]) => {
                  const max = { B: 35, D: 25, T: 15, A: 15, R: 10 }[k]
                  return (
                    <div key={k} className="mb-2">
                      <div className="d-flex justify-content-between small">
                        <span>w · {k}</span>
                        <span>
                          {v}/{max}
                        </span>
                      </div>
                      <div className="score-bar">
                        <span
                          style={{
                            width: `${(v / max) * 100}%`,
                            background: SCORE_PARTS.find((p) => p.key === k)?.color,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
                <Button
                  className="w-100 mt-2 btn-emergency"
                  disabled={proposing}
                  onClick={() => proposeFrom(selected)}
                >
                  {proposing ? <Spinner size="sm" /> : 'Đề xuất điều chuyển'}
                </Button>
                <Button as={Link} to="/transfers" variant="link" className="w-100 mt-1">
                  Theo dõi lifecycle →
                </Button>
              </div>
            )}
          </Col>
        </Row>
      )}

      <div className="table-panel mt-3">
        <div className="panel-head">MatchingLog (audit)</div>
        <Table size="sm" className="mb-0">
          <thead>
            <tr>
              <th>Log ID</th>
              <th>Request</th>
              <th>Top-K</th>
              <th>Thời điểm</th>
            </tr>
          </thead>
          <tbody>
            {logs.slice(0, 8).map((l) => (
              <tr key={l.id}>
                <td className="small">{l.id.slice(0, 8)}…</td>
                <td className="small">{l.request_id}</td>
                <td>{l.top_k}</td>
                <td>{new Date(l.created_at).toLocaleString('vi-VN')}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  )
}
