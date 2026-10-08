import { useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Button, Col, Form, Row, Table } from 'react-bootstrap'
import PageSkeleton from '../components/PageSkeleton'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'

export default function InventoryPage() {
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [bloodType, setBloodType] = useState('')
  const [params] = useSearchParams()
  const { hasRole } = useAuth()

  function load() {
    setLoading(true)
    const q = new URLSearchParams()
    if (params.get('expiring')) q.set('expiring_hours', params.get('expiring'))
    api
      .get(`/inventory/units?${q}`)
      .then((u) => setUnits(u.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [params])

  const byType = useMemo(() => {
    const types = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']
    return types.map((t) => {
      const list = units.filter((u) => u.blood_type === t && ['ready', 'critical'].includes(u.status))
      const target = 40
      const pct = Math.round((list.length / target) * 100)
      return { t, count: list.length, pct, critical: pct < 40 }
    })
  }, [units])

  const filteredUnits = useMemo(
    () => (bloodType ? units.filter((u) => u.blood_type === bloodType) : units),
    [units, bloodType],
  )

  function toggleBloodType(t) {
    setBloodType((prev) => (prev === t ? '' : t))
  }

  if (loading) return <PageSkeleton />

  return (
    <div>
      <div className="d-flex justify-content-between mb-3 align-items-start flex-wrap gap-2">
        <div>
          <h1 className="h3 mb-1">Quản lý tồn kho máu</h1>
          <p className="text-secondary mb-0">
            Điều chuyển liên viện dùng lifecycle (Matching → Điều chuyển). Cold chain IoT: Phase 2+.
          </p>
        </div>
        <div className="d-flex gap-2">
          {hasRole('admin') && (
            <Button as={Link} to="/matching" size="sm" variant="outline-danger">
              Matching → đề xuất
            </Button>
          )}
          <Button as={Link} to="/transfers" size="sm" variant="danger">
            Xem điều chuyển
          </Button>
        </div>
      </div>

      <Alert variant="secondary" className="py-2 small">
        Atomic transfer một bước đã tắt (TT 26 lifecycle). Dùng Matching để đề xuất, rồi xác nhận → xuất →
        checklist VC → đối chiếu nhập trên màn Điều chuyển.
      </Alert>

      {params.get('expiring') && (
        <div className="alert-banner">Cảnh báo gần hết hạn &lt;{params.get('expiring')}h — lọc đang bật</div>
      )}

      <Row className="g-2 mb-3">
        {byType.map((x) => {
          const active = bloodType === x.t
          return (
            <Col key={x.t} xs={6} md={3} lg>
              <button
                type="button"
                className={`kpi-card kpi-filter text-start w-100 ${x.critical ? 'border-danger' : ''} ${active ? 'is-active' : ''}`}
                aria-pressed={active}
                title={active ? `Bỏ lọc ${x.t}` : `Lọc nhóm ${x.t}`}
                onClick={() => toggleBloodType(x.t)}
              >
                <div className={`fw-bold ${x.critical ? 'text-danger' : 'text-primary'}`}>{x.t}</div>
                <div className="value fs-4">{x.count}</div>
                <div className="small">{x.pct}% / mục tiêu 40</div>
              </button>
            </Col>
          )
        })}
      </Row>

      <Form.Select className="mb-2 w-auto" value={bloodType} onChange={(e) => setBloodType(e.target.value)}>
        <option value="">Tất cả nhóm máu</option>
        {['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'].map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </Form.Select>

      <div className="table-panel">
        <Table hover size="sm" className="mb-0">
          <thead>
            <tr>
              <th>Barcode</th>
              <th>Nhóm</th>
              <th>Chế phẩm</th>
              <th>Hạn</th>
              <th>Trạng thái</th>
              <th>Vị trí</th>
              <th>DSS</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredUnits.slice(0, 80).map((u) => (
              <tr key={u.id}>
                <td className="small">{u.barcode}</td>
                <td>
                  <Badge className={u.blood_type.includes('-') ? 'badge-critical' : 'badge-safe'}>{u.blood_type}</Badge>
                </td>
                <td>{u.product_type}</td>
                <td className="small">{new Date(u.expires_at).toLocaleString('vi-VN')}</td>
                <td>{u.status}</td>
                <td className="small">{u.location_label}</td>
                <td className="small">{u.dss_status}</td>
                <td>
                  {hasRole('admin', 'staff_bank') && ['ready', 'critical'].includes(u.status) && (
                    <Button as={Link} size="sm" variant="outline-secondary" to="/transfers">
                      Lifecycle
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  )
}
