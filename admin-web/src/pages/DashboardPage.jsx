import { useEffect, useState } from 'react'
import { Button, Col, Row, Spinner, Table } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'

export default function DashboardPage() {
  const { hasRole } = useAuth()
  const [summary, setSummary] = useState(null)
  const [demands, setDemands] = useState([])
  const [units, setUnits] = useState([])
  const [centersMap, setCentersMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/summary'),
      api.get('/demands'),
      api.get('/inventory/units'),
      api.get('/centers'),
    ])
      .then(([s, d, u, c]) => {
        setSummary(s.data)
        setDemands(
          d.data.filter((x) => ['open', 'matching'].includes(x.status)).slice(0, 5),
        )
        setUnits(u.data)
        const map = {}
        c.data.forEach((x) => {
          map[x.id] = x.name
        })
        setCentersMap(map)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />

  const types = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']
  const centers = [...new Set(units.map((u) => u.center_id))]

  function cellClass(count, target = 20) {
    const cov = count / target
    if (cov < 0.4) return 'critical'
    if (cov < 0.85) return 'warn'
    return 'ok'
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h1 className="h3 mb-1">Trung tâm giám sát điều phối</h1>
          <p className="text-secondary mb-0">Shortage · matching cơ sở · điều chuyển BV ↔ NHM</p>
        </div>
      </div>

      {summary?.critical_banner && (
        <div className="alert-banner">
          <strong>Báo động đỏ:</strong> {summary.critical_banner}
          <div className="mt-2">
            <Button as={Link} to="/alerts" size="sm" variant="outline-danger" className="me-2">
              Xem cảnh báo
            </Button>
            {hasRole('admin') && (
              <Button as={Link} to="/matching" size="sm" variant="danger">
                Chạy matching cơ sở
              </Button>
            )}
          </div>
        </div>
      )}

      <Row className="g-3 mb-3">
        <Col md={3}>
          <div className="kpi-card">
            <div className="label">Cảnh báo đang mở</div>
            <div className="value text-danger">{summary.active_alerts}</div>
            <div className="small">
              Critical {summary.critical_alerts} · Warning {summary.warning_alerts}
            </div>
          </div>
        </Col>
        <Col md={3}>
          <div className="kpi-card">
            <div className="label">Độ phủ mạng lưới</div>
            <div className="value">{summary.network_coverage_pct}%</div>
            <div className="small">Mục tiêu ≥ 85% (cấu hình prototype)</div>
          </div>
        </Col>
        <Col md={3}>
          <div className="kpi-card">
            <div className="label">Điều chuyển hôm nay</div>
            <div className="value">{summary.transfers_today}</div>
            <div className="small">Nhu cầu mở: {summary.open_requests}</div>
          </div>
        </Col>
        <Col md={3}>
          <div className="kpi-card">
            <div className="label">Matching runs</div>
            <div className="value">{summary.matching_runs}</div>
            <div className="small">Hết hạn &lt;48h: {summary.units_expiring_48h}</div>
          </div>
        </Col>
      </Row>

      <div className="table-panel mb-3">
        <div className="panel-head">Ma trận tồn kho theo cơ sở × nhóm máu</div>
        <div className="table-responsive p-2">
          <Table size="sm" bordered className="mb-0 align-middle">
            <thead>
              <tr>
                <th>Cơ sở</th>
                {types.map((t) => (
                  <th key={t} className="text-center">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {centers.map((cid) => (
                <tr key={cid}>
                  <td className="small">{centersMap[cid] || cid}</td>
                  {types.map((t) => {
                    const count = units.filter(
                      (u) =>
                        u.center_id === cid &&
                        u.blood_type === t &&
                        ['ready', 'critical'].includes(u.status),
                    ).length
                    return (
                      <td key={t}>
                        <div className={`matrix-cell ${cellClass(count)}`}>{count}</div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </div>

      <Row className="g-3">
        <Col md={7}>
          <div className="table-panel">
            <div className="panel-head">Yêu cầu cấp máu ưu tiên</div>
            <Table hover size="sm" className="mb-0">
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Cơ sở</th>
                  <th>Nhóm</th>
                  <th>Thiếu</th>
                  <th>Ưu tiên</th>
                </tr>
              </thead>
              <tbody>
                {demands.map((d) => (
                  <tr key={d.id}>
                    <td>{d.code}</td>
                    <td>{d.facility_name}</td>
                    <td>
                      <span className="badge badge-critical">{d.blood_type}</span>
                    </td>
                    <td>
                      {Math.max(0, d.qty_needed - d.qty_fulfilled)}/{d.qty_needed}
                    </td>
                    <td>{d.priority}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Col>
        <Col md={5}>
          <div className="table-panel h-100">
            <div className="panel-head">Đơn vị gần hết hạn (&lt;48h)</div>
            <div className="p-3">
              <div className="display-6 text-warning">{summary.units_expiring_48h}</div>
              <p className="small text-secondary mb-2">Cold chain IoT: chưa kết nối (Phase 2+)</p>
              <Button as={Link} to="/inventory?expiring=48" size="sm" variant="outline-danger">
                Xem kho &amp; xoay vòng
              </Button>
            </div>
          </div>
        </Col>
      </Row>
    </div>
  )
}
