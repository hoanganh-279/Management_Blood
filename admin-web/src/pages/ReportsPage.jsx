import { useCallback, useEffect, useState } from 'react'
import { Col, Row, Table } from 'react-bootstrap'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import api from '../api/client'
import LoadState from '../components/LoadState'
import { apiError } from '../utils/labels'

const COLORS = ['#3b6fb6', '#1f7a4c']

export default function ReportsPage() {
  const [kpi, setKpi] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api
      .get('/reports/kpis')
      .then((r) => setKpi(r.data))
      .catch((err) => setError(apiError(err, 'Không tải được báo cáo.')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading || error || !kpi) return <LoadState loading={loading} error={error} onRetry={load} />

  const bloodData = Object.entries(kpi.by_blood_type || {}).map(([name, value]) => ({
    name,
    value,
  }))
  const supplyDemand = [
    { name: 'Nhu cầu', value: kpi.total_demand },
    { name: 'Đáp ứng', value: kpi.fulfilled_supply },
  ]

  return (
    <div>
      <h1 className="h3 mb-1">Báo cáo & KPI điều phối</h1>
      <p className="text-secondary">DSS cung ứng & matching cơ sở (MVP)</p>

      <Row className="g-3 mb-3">
        <Col md={3}>
          <div className="kpi-card">
            <div className="label">Tồn sẵn sàng</div>
            <div className="value">{kpi.inventory_available}</div>
            <div className="small">{kpi.inventory_target_pct}% mục tiêu minh họa</div>
          </div>
        </Col>
        <Col md={3}>
          <div className="kpi-card">
            <div className="label">Tỷ lệ hết hạn / hủy bỏ</div>
            <div className="value">{kpi.wastage_rate_pct}%</div>
          </div>
        </Col>
        <Col md={3}>
          <div className="kpi-card">
            <div className="label">Gần hết hạn 48h</div>
            <div className="value text-warning">{kpi.near_expiry_48h}</div>
          </div>
        </Col>
        <Col md={3}>
          <div className="kpi-card">
            <div className="label">Precision@3 (minh họa)</div>
            <div className="value">{kpi.precision_at_3_pct}%</div>
          </div>
        </Col>
      </Row>

      <Row className="g-3 mb-3">
        <Col md={4}>
          <div className="kpi-card">
            <div className="label">Nhu cầu / đáp ứng</div>
            <div className="value fs-4">
              {kpi.total_demand} / {kpi.fulfilled_supply}
            </div>
            <div className="small">Net: {kpi.net_deficit}</div>
          </div>
        </Col>
        <Col md={4}>
          <div className="kpi-card">
            <div className="label">Điều chuyển / nhu cầu mở</div>
            <div className="value fs-4">
              {kpi.transfers_total} / {kpi.open_requests}
            </div>
            <div className="small">Đã fulfill: {kpi.fulfilled_requests}</div>
          </div>
        </Col>
        <Col md={4}>
          <div className="kpi-card">
            <div className="label">Số lần chạy matching</div>
            <div className="value">{kpi.matching_runs}</div>
          </div>
        </Col>
      </Row>

      <Row className="g-3">
        <Col md={7}>
          <div className="table-panel p-3" style={{ height: 320 }}>
            <div className="fw-semibold mb-2">Tồn theo nhóm máu</div>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={bloodData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b6fb6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Table size="sm" className="mt-2 visually-hidden" aria-label="Tồn khả dụng theo nhóm máu">
            <tbody>
              {bloodData.map((r) => (
                <tr key={r.name}>
                  <th scope="row">{r.name}</th>
                  <td>{r.value}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Col>
        <Col md={5}>
          <div className="table-panel p-3" style={{ height: 320 }}>
            <div className="fw-semibold mb-2">Cung vs cầu (tổng)</div>
            <ResponsiveContainer width="100%" height="90%">
              <PieChart>
                <Pie data={supplyDemand} dataKey="value" nameKey="name" outerRadius={90} label>
                  {supplyDemand.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Col>
      </Row>
      <p className="disclaimer mt-3">{kpi.note}</p>
    </div>
  )
}
