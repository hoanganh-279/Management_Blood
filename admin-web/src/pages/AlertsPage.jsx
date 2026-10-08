import { useEffect, useState } from 'react'
import { Badge, Button, Col, Row, Table } from 'react-bootstrap'
import PageSkeleton from '../components/PageSkeleton'
import { useSearchParams, Link } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useUndoToast } from '../hooks/useUndoToast'

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [params] = useSearchParams()
  const { hasRole } = useAuth()
  const { showUndo } = useUndoToast()
  const severityFilter = params.get('severity')

  function load() {
    setLoading(true)
    const q = severityFilter ? `?severity=${severityFilter}` : ''
    api
      .get(`/alerts${q}`)
      .then((res) => {
        setAlerts(res.data)
        setSelected(res.data[0] || null)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [severityFilter])

  async function markProcessing(id) {
    const prev = alerts.find((a) => a.id === id)
    await api.patch(`/alerts/${id}`, { status: 'processing' })
    load()
    showUndo({
      message: `Đã đánh dấu xử lý: ${prev?.code || id.slice(0, 8)}`,
      onUndo: async () => {
        await api.patch(`/alerts/${id}`, { status: 'open' })
        load()
      },
    })
  }

  if (loading) return <PageSkeleton />

  return (
    <div>
      <h1 className="h3 mb-1">Trung tâm giám sát cảnh báo</h1>
      <p className="text-secondary">Shortage / Coverage — chỉ hỗ trợ quyết định vận hành</p>

      <Row className="g-3 mb-3">
        <Col md={3}>
          <div className="kpi-card">
            <div className="label">Mở</div>
            <div className="value">{alerts.length}</div>
          </div>
        </Col>
        <Col md={3}>
          <div className="kpi-card">
            <div className="label">Nghiêm trọng</div>
            <div className="value text-danger">{alerts.filter((a) => a.severity === 'critical').length}</div>
          </div>
        </Col>
        <Col md={3}>
          <div className="kpi-card">
            <div className="label">Cảnh báo</div>
            <div className="value text-warning">{alerts.filter((a) => a.severity === 'warning').length}</div>
          </div>
        </Col>
        <Col md={3}>
          <div className="kpi-card">
            <div className="label">Bộ lọc URL</div>
            <div className="small">severity={severityFilter || 'all'}</div>
          </div>
        </Col>
      </Row>

      <div className="table-panel mb-3">
        <Table hover size="sm" className="mb-0">
          <thead>
            <tr>
              <th>Mức</th>
              <th>Mã / Nội dung</th>
              <th>Nhóm</th>
              <th>DSS</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <tr
                key={a.id}
                className={selected?.id === a.id ? 'table-active' : ''}
                onClick={() => setSelected(a)}
                style={{ cursor: 'pointer' }}
              >
                <td>
                  <Badge className={a.severity === 'critical' ? 'badge-critical' : 'badge-warning'}>
                    {a.severity}
                  </Badge>
                </td>
                <td>
                  <div className="fw-semibold">{a.code}</div>
                  <div className="small">{a.title}</div>
                </td>
                <td>{a.blood_type || '—'}</td>
                <td className="small">
                  {a.metrics?.coverage != null
                    ? `${Math.round(a.metrics.coverage * 100)}%`
                    : a.metrics?.shortage != null
                      ? `-${a.metrics.shortage}u`
                      : '—'}
                </td>
                <td>
                  {hasRole('admin', 'staff_bank') && (
                    <Button
                      size="sm"
                      variant="outline-danger"
                      onClick={(e) => {
                        e.stopPropagation()
                        markProcessing(a.id)
                      }}
                    >
                      Xử lý
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      {selected && (
        <div className="table-panel p-3">
          <h2 className="h5">{selected.title}</h2>
          <p className="mb-1">
            <strong>Công thức:</strong> {selected.metrics?.formula || '—'}
          </p>
          <p className="small text-secondary">
            Coverage so với ngưỡng cấu hình prototype (không phải chỉ định y tế).
          </p>
          <div className="d-flex gap-2 flex-wrap">
            <Button as={Link} to="/inventory" size="sm" variant="outline-secondary">
              Xem tồn gần
            </Button>
            <Button as={Link} to="/transfers" size="sm" variant="outline-danger">
              Điều chuyển
            </Button>
            {hasRole('admin') && (
              <Button
                as={Link}
                to={selected.request_id ? `/matching?requestId=${selected.request_id}` : '/matching'}
                size="sm"
                variant="danger"
              >
                Chạy DSS Matching
              </Button>
            )}
            {hasRole('admin') && (
              <Button as={Link} to="/notifications" size="sm" variant="outline-danger">
                Phát thông báo
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
