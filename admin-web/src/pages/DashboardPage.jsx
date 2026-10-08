import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Col, Row, Table } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import LoadState from '../components/LoadState'
import {
  BLOOD_TYPES,
  COVERAGE_LEVEL_LABEL,
  PRIORITY_LABEL,
  PRIORITY_VARIANT,
  apiError,
  label,
} from '../utils/labels'

const LEVEL_CLASS = { critical: 'critical', warning: 'warn', ok: 'ok', no_demand: 'none' }

export default function DashboardPage() {
  const { hasRole } = useAuth()
  const [summary, setSummary] = useState(null)
  const [demands, setDemands] = useState([])
  const [coverage, setCoverage] = useState(null)
  const [centersMap, setCentersMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    Promise.all([api.get('/dashboard/summary'), api.get('/demands'), api.get('/inventory/coverage'), api.get('/centers')])
      .then(([s, d, cov, c]) => {
        setSummary(s.data)
        setDemands(d.data.filter((x) => ['open', 'matching'].includes(x.status)).slice(0, 5))
        setCoverage(cov.data)
        setCentersMap(Object.fromEntries(c.data.map((x) => [x.id, x.name])))
      })
      .catch((err) => setError(apiError(err, 'Không tải được dữ liệu tổng quan.')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const matrix = useMemo(() => {
    const rows = {}
    for (const cell of coverage?.cells || []) {
      rows[cell.center_id] = rows[cell.center_id] || {}
      rows[cell.center_id][cell.blood_type] = cell
    }
    return rows
  }, [coverage])

  if (loading || error || !summary) {
    return <LoadState loading={loading} error={error} onRetry={load} />
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h1 className="h3 mb-1">Trung tâm giám sát điều phối</h1>
          <p className="text-secondary mb-0">Thiếu hụt · matching cơ sở · điều chuyển BV ↔ NHM</p>
        </div>
      </div>

      {summary.critical_banner && (
        <div className="alert-banner">
          <strong>Cảnh báo nghiêm trọng:</strong> {summary.critical_banner}
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
            <div className={`value ${summary.critical_alerts ? 'text-danger' : ''}`}>{summary.active_alerts}</div>
            <div className="small">
              Nghiêm trọng {summary.critical_alerts} · Cảnh báo {summary.warning_alerts}
            </div>
          </div>
        </Col>
        <Col md={3}>
          <div className="kpi-card">
            <div className="label">Độ phủ trung bình nhu cầu mở</div>
            <div className="value">{summary.network_coverage_pct}%</div>
            <div className="small">Coverage = tồn khả dụng / nhu cầu còn lại (cấu hình prototype)</div>
          </div>
        </Col>
        <Col md={3}>
          <div className="kpi-card">
            <div className="label">Điều chuyển hoàn tất hôm nay</div>
            <div className="value">{summary.transfers_today}</div>
            <div className="small">Nhu cầu mở: {summary.open_requests}</div>
          </div>
        </Col>
        <Col md={3}>
          <div className="kpi-card">
            <div className="label">Đơn vị cách ly</div>
            <div className={`value ${summary.units_quarantine ? 'text-danger' : ''}`}>{summary.units_quarantine}</div>
            <div className="small">Chờ cơ sở nguồn kiểm tra lại · Lần chạy matching: {summary.matching_runs}</div>
          </div>
        </Col>
      </Row>

      <div className="table-panel mb-3">
        <div className="panel-head">Tồn khả dụng theo cơ sở × nhóm máu (tô màu theo Coverage nhu cầu mở)</div>
        <div className="table-responsive p-2">
          <Table size="sm" bordered className="mb-2 align-middle">
            <thead>
              <tr>
                <th>Cơ sở</th>
                {BLOOD_TYPES.map((t) => (
                  <th key={t} className="text-center">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.keys(matrix).map((cid) => (
                <tr key={cid}>
                  <td className="small">{centersMap[cid] || cid}</td>
                  {BLOOD_TYPES.map((t) => {
                    const cell = matrix[cid][t]
                    if (!cell) return <td key={t} />
                    const tip =
                      cell.level === 'no_demand'
                        ? `${cell.available} đơn vị khả dụng — không có nhu cầu mở`
                        : `${cell.available} khả dụng / ${cell.open_demand} cần — coverage ${Math.round(cell.coverage * 100)}%`
                    return (
                      <td key={t}>
                        <div className={`matrix-cell ${LEVEL_CLASS[cell.level]}`} title={tip}>
                          {cell.available}
                          {cell.level !== 'no_demand' && <span className="small fw-normal">/{cell.open_demand}</span>}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="small text-secondary d-flex gap-3 flex-wrap">
            {['critical', 'warning', 'ok', 'no_demand'].map((lv) => (
              <span key={lv}>
                <span className={`matrix-cell ${LEVEL_CLASS[lv]} d-inline-block px-2 me-1`}>&nbsp;</span>
                {COVERAGE_LEVEL_LABEL[lv]}
              </span>
            ))}
            <span>
              Ngưỡng cấu hình: nghiêm trọng &lt; {Math.round((coverage?.coverage_critical || 0) * 100)}%, theo dõi &lt;{' '}
              {Math.round((coverage?.coverage_warn || 0) * 100)}% — không phải ngưỡng y tế.
            </span>
          </div>
        </div>
      </div>

      <Row className="g-3">
        <Col md={7}>
          <div className="table-panel">
            <div className="panel-head">Nhu cầu cấp máu đang mở</div>
            {!demands.length ? (
              <div className="text-secondary text-center py-3">Không có nhu cầu mở.</div>
            ) : (
              <Table hover size="sm" className="mb-0">
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Cơ sở</th>
                    <th>Nhóm / chế phẩm</th>
                    <th>Còn thiếu</th>
                    <th>Ưu tiên</th>
                  </tr>
                </thead>
                <tbody>
                  {demands.map((d) => (
                    <tr key={d.id}>
                      <td>{d.code}</td>
                      <td>{d.facility_name}</td>
                      <td>
                        {d.blood_type} · {d.product_type}
                      </td>
                      <td>
                        {Math.max(0, d.qty_needed - d.qty_fulfilled)}/{d.qty_needed}
                      </td>
                      <td>
                        <Badge bg={PRIORITY_VARIANT[d.priority]}>{label(PRIORITY_LABEL, d.priority)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </Col>
        <Col md={5}>
          <div className="table-panel h-100">
            <div className="panel-head">Đơn vị gần hết hạn (&lt;48h)</div>
            <div className="p-3">
              <div className="display-6 text-warning">{summary.units_expiring_48h}</div>
              <p className="small text-secondary mb-2">Giám sát nhiệt độ IoT: chưa kết nối (giai đoạn sau)</p>
              <Button as={Link} to="/inventory?expiring=48" size="sm" variant="outline-secondary">
                Xem kho &amp; xoay vòng
              </Button>
            </div>
          </div>
        </Col>
      </Row>
    </div>
  )
}
