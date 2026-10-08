import { useCallback, useEffect, useState } from 'react'
import { Alert, Badge, Button, Col, Row, Table } from 'react-bootstrap'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import LoadState from '../components/LoadState'
import { useUndoToast } from '../hooks/useUndoToast'
import { ALERT_STATUS_LABEL, SEVERITY_LABEL, SEVERITY_VARIANT, apiError, label } from '../utils/labels'

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [params, setParams] = useSearchParams()
  const { hasRole } = useAuth()
  const { showUndo } = useUndoToast()
  const severityFilter = params.get('severity')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api
      .get('/alerts', { params: severityFilter ? { severity: severityFilter } : {} })
      .then((res) => {
        setAlerts(res.data)
        setSelectedId((cur) => (res.data.some((a) => a.id === cur) ? cur : res.data[0]?.id || null))
      })
      .catch((err) => setError(apiError(err, 'Không tải được cảnh báo.')))
      .finally(() => setLoading(false))
  }, [severityFilter])

  useEffect(() => {
    load()
  }, [load])

  async function markProcessing(a) {
    try {
      await api.patch(`/alerts/${a.id}`, { status: 'processing' })
      load()
      showUndo({
        message: `Đã đánh dấu đang xử lý: ${a.code}`,
        onUndo: async () => {
          try {
            await api.patch(`/alerts/${a.id}`, { status: 'open' })
          } catch (err) {
            setFeedback({ type: 'danger', text: apiError(err, 'Hoàn tác thất bại.') })
          }
          load()
        },
      })
    } catch (err) {
      setFeedback({ type: 'danger', text: apiError(err) })
    }
  }

  const selected = alerts.find((a) => a.id === selectedId)

  return (
    <div>
      <h1 className="h3 mb-1">Cảnh báo thiếu hụt & hạn dùng</h1>
      <p className="text-secondary">Shortage / Coverage theo cấu hình — chỉ hỗ trợ quyết định vận hành.</p>

      {feedback && (
        <Alert variant={feedback.type} dismissible onClose={() => setFeedback(null)}>
          {feedback.text}
        </Alert>
      )}

      <Row className="g-3 mb-3">
        <Col md={4}>
          <div className="kpi-card">
            <div className="label">Chưa đóng</div>
            <div className="value">{alerts.length}</div>
            <div className="small">
              Mở {alerts.filter((a) => a.status === 'open').length} · Đang xử lý{' '}
              {alerts.filter((a) => a.status === 'processing').length}
            </div>
          </div>
        </Col>
        <Col md={4}>
          <div className="kpi-card">
            <div className="label">Nghiêm trọng</div>
            <div className="value text-danger">{alerts.filter((a) => a.severity === 'critical').length}</div>
          </div>
        </Col>
        <Col md={4}>
          <div className="kpi-card">
            <div className="label">Cảnh báo</div>
            <div className="value text-warning">{alerts.filter((a) => a.severity === 'warning').length}</div>
          </div>
        </Col>
      </Row>

      {severityFilter && (
        <div className="mb-2">
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() => {
              const next = new URLSearchParams(params)
              next.delete('severity')
              setParams(next, { replace: true })
            }}
          >
            Đang lọc: {label(SEVERITY_LABEL, severityFilter)} — bỏ lọc ×
          </Button>
        </div>
      )}

      <div className="table-panel mb-3">
        <LoadState loading={loading} error={error} onRetry={load} empty={!alerts.length} emptyText="Không có cảnh báo đang mở.">
          <Table hover size="sm" className="mb-0">
            <thead>
              <tr>
                <th>Mức</th>
                <th>Mã / nội dung</th>
                <th>Nhóm</th>
                <th>Coverage</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr
                  key={a.id}
                  className={selectedId === a.id ? 'table-active' : ''}
                  tabIndex={0}
                  onClick={() => setSelectedId(a.id)}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedId(a.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <Badge bg={SEVERITY_VARIANT[a.severity]}>{label(SEVERITY_LABEL, a.severity)}</Badge>
                  </td>
                  <td>
                    <div className="fw-semibold">{a.code}</div>
                    <div className="small">{a.title}</div>
                  </td>
                  <td>{a.blood_type || '—'}</td>
                  <td className="small">
                    {a.metrics?.coverage != null ? `${Math.round(a.metrics.coverage * 100)}%` : '—'}
                  </td>
                  <td className="small">{label(ALERT_STATUS_LABEL, a.status)}</td>
                  <td>
                    {hasRole('admin', 'staff_bank') && a.status === 'open' && (
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        onClick={(e) => {
                          e.stopPropagation()
                          markProcessing(a)
                        }}
                      >
                        Đánh dấu đang xử lý
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </LoadState>
      </div>

      {selected && (
        <div className="table-panel p-3">
          <h2 className="h5">{selected.title}</h2>
          <p className="mb-1">
            <strong>Công thức:</strong> {selected.metrics?.formula || '—'}
          </p>
          <p className="small text-secondary">
            So với ngưỡng cấu hình prototype — không phải chỉ định y tế. Cảnh báo tự đóng khi nhu cầu được đáp ứng hoặc
            hủy.
          </p>
          <div className="d-flex gap-2 flex-wrap">
            <Button as={Link} to="/inventory" size="sm" variant="outline-secondary">
              Xem tồn kho
            </Button>
            {selected.request_id && (
              <Button
                as={Link}
                to={`/transfers?filter=all&request=${selected.request_id}`}
                size="sm"
                variant="outline-primary"
              >
                Điều chuyển của nhu cầu này
              </Button>
            )}
            {hasRole('admin') && selected.request_id && (
              <Button as={Link} to={`/matching?requestId=${selected.request_id}`} size="sm" variant="primary">
                Chạy matching cho nhu cầu
              </Button>
            )}
            {hasRole('admin', 'staff_bank') && (
              <Button as={Link} to="/notifications" size="sm" variant="outline-secondary">
                Gửi thông báo nội bộ
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
