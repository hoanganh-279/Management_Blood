import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Button, Form, Spinner, Table } from 'react-bootstrap'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import {
  OPEN_TRANSFER_STATUSES,
  TRANSFER_STATUS_LABEL,
  TRANSFER_STATUS_VARIANT,
  apiError,
  fmtDateTime,
  label,
} from '../utils/labels'

export function nextActionFor(t, user) {
  const isAdmin = user?.role === 'admin'
  const atSource = isAdmin || (user?.center_id && user.center_id === t.source_center_id)
  const atDest = isAdmin || (user?.center_id && user.center_id === t.dest_center_id)
  switch (t.status) {
    case 'proposed':
      return atSource ? 'Xác nhận nguồn' : null
    case 'source_confirmed':
      return atSource ? 'Xuất kho' : null
    case 'exported':
      return atSource ? 'Bàn giao vận chuyển' : null
    case 'in_transit':
      return atDest ? 'Xác nhận đã nhận hàng' : null
    case 'inbound_pending':
      return atDest ? 'Đối chiếu nhập kho' : null
    default:
      return null
  }
}

export default function TransfersPage() {
  const { user, hasRole } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [list, setList] = useState([])
  const [centers, setCenters] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [onlyMine, setOnlyMine] = useState(!hasRole('admin'))
  const [statusFilter, setStatusFilter] = useState('open')
  const requestFilter = params.get('request')

  const load = useCallback(() => {
    setError('')
    Promise.all([api.get('/transfers'), api.get('/centers')])
      .then(([t, c]) => {
        setList(t.data)
        setCenters(Object.fromEntries(c.data.map((x) => [x.id, x])))
      })
      .catch((err) => setError(apiError(err, 'Không tải được danh sách điều chuyển.')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const rows = useMemo(
    () =>
      list.filter((t) => {
        if (requestFilter && t.blood_request_id !== requestFilter) return false
        if (statusFilter === 'open' && !OPEN_TRANSFER_STATUSES.includes(t.status)) return false
        if (statusFilter !== 'open' && statusFilter !== 'all' && t.status !== statusFilter) return false
        if (onlyMine && !nextActionFor(t, user)) return false
        return true
      }),
    [list, requestFilter, statusFilter, onlyMine, user],
  )

  const mineCount = list.filter((t) => nextActionFor(t, user)).length

  function centerName(id) {
    return centers[id]?.name || id
  }

  function open(t) {
    navigate(`/transfers/${t.id}`)
  }

  if (loading) return <Spinner role="status" aria-label="Đang tải" />

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h1 className="h3 mb-1">Điều chuyển</h1>
          <p className="text-secondary mb-0">
            Đề xuất → nguồn xác nhận → xuất kho → bàn giao vận chuyển → đích nhận hàng → đối chiếu nhập
          </p>
        </div>
        {hasRole('admin') && (
          <Button as={Link} to="/matching" variant="outline-primary" size="sm">
            Matching → đề xuất
          </Button>
        )}
      </div>

      <Alert variant="secondary" className="py-2 small">
        DSS hỗ trợ quyết định điều phối — không thay thẩm quyền chuyên môn hay pháp lý. Checklist vận chuyển /
        nhập kho ghi nhận theo tinh thần TT 26/2013 Điều 20 &amp; 40 (không IoT).
      </Alert>

      {error && (
        <Alert variant="danger" className="d-flex justify-content-between align-items-center">
          <span>{error}</span>
          <Button size="sm" variant="outline-danger" onClick={load}>
            Thử lại
          </Button>
        </Alert>
      )}

      <div className="d-flex flex-wrap gap-3 align-items-end mb-3">
        <Form.Check
          type="switch"
          id="transfers-only-mine"
          label={`Cần tôi xử lý (${mineCount})`}
          checked={onlyMine}
          onChange={(e) => setOnlyMine(e.target.checked)}
        />
        <Form.Group controlId="transfers-status-filter">
          <Form.Label className="small mb-1">Trạng thái</Form.Label>
          <Form.Select size="sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="open">Đang mở</option>
            <option value="all">Tất cả</option>
            {Object.entries(TRANSFER_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
        {requestFilter && (
          <Badge bg="info" className="p-2">
            Theo nhu cầu {requestFilter.slice(0, 8)}…{' '}
            <Button
              size="sm"
              variant="link"
              className="p-0 ms-1 text-white"
              onClick={() => {
                params.delete('request')
                setParams(params)
              }}
            >
              Bỏ lọc
            </Button>
          </Badge>
        )}
      </div>

      <div className="table-panel">
        <Table hover size="sm" className="mb-0">
          <thead>
            <tr>
              <th>Trạng thái</th>
              <th>Đơn vị</th>
              <th>Nguồn</th>
              <th>Đích</th>
              <th>Bước tiếp theo của tôi</th>
              <th>Cập nhật</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const action = nextActionFor(t, user)
              return (
                <tr
                  key={t.id}
                  className="row-link"
                  tabIndex={0}
                  onClick={() => open(t)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      open(t)
                    }
                  }}
                >
                  <td>
                    <Badge bg={TRANSFER_STATUS_VARIANT[t.status] || 'secondary'}>
                      {label(TRANSFER_STATUS_LABEL, t.status)}
                    </Badge>
                  </td>
                  <td className="small">
                    {t.unit ? `${t.unit.barcode} · ${t.unit.blood_type} ${t.unit.product_type}` : t.blood_unit_id}
                  </td>
                  <td className="small">{centerName(t.source_center_id)}</td>
                  <td className="small">{centerName(t.dest_center_id)}</td>
                  <td className="small">{action ? <strong>{action}</strong> : <span className="text-secondary">—</span>}</td>
                  <td className="small">{fmtDateTime(t.updated_at)}</td>
                </tr>
              )
            })}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="text-secondary text-center py-4">
                  {onlyMine
                    ? 'Không có điều chuyển nào đang chờ bạn xử lý.'
                    : 'Không có điều chuyển phù hợp bộ lọc.'}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </div>
  )
}
