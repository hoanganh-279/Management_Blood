import { useCallback, useEffect, useState } from 'react'
import { Form, Table } from 'react-bootstrap'
import api from '../api/client'
import LoadState from '../components/LoadState'
import { apiError, fmtDateTime } from '../utils/labels'

const ACTION_LABEL = {
  'inventory.view': 'Xem tồn kho',
  'inventory.receive': 'Nhập đơn vị mới',
  'inventory.out': 'Xuất kho (cấp phát / hủy / hết hạn)',
  'inventory.quarantine_review': 'Xét duyệt cách ly',
  'matching.run': 'Chạy matching',
  'report.view': 'Xem báo cáo',
  'center.update': 'Đổi cấu hình cơ sở',
  'user.create': 'Tạo người dùng',
  'user.update': 'Cập nhật người dùng',
  'demand.create': 'Tạo nhu cầu',
  'demand.cancel': 'Hủy nhu cầu',
}

export default function AuditLogsPage() {
  const [rows, setRows] = useState([])
  const [action, setAction] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api
      .get('/audit-logs', { params: action ? { action } : {} })
      .then((r) => setRows(r.data))
      .catch((err) => setError(apiError(err, 'Không tải được nhật ký.')))
      .finally(() => setLoading(false))
  }, [action])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <h1 className="h3 mb-1">Nhật ký thao tác nhạy cảm</h1>
      <p className="text-secondary">
        Xem kho, xuất báo cáo, chạy matching, thay đổi cấu hình và người dùng. Chuyển trạng thái điều chuyển được
        ghi riêng trong nhật ký của từng điều chuyển.
      </p>
      <Form.Group className="mb-3" style={{ maxWidth: 360 }} controlId="audit-action">
        <Form.Label className="small">Loại thao tác</Form.Label>
        <Form.Select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Tất cả</option>
          {Object.entries(ACTION_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Form.Select>
      </Form.Group>
      <div className="table-panel">
        <LoadState loading={loading} error={error} onRetry={load} empty={!rows.length} emptyText="Chưa có bản ghi.">
          <Table size="sm" className="mb-0">
            <thead>
              <tr>
                <th>Thời điểm</th>
                <th>Người thao tác</th>
                <th>Thao tác</th>
                <th>Đối tượng</th>
                <th>Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="small text-nowrap">{fmtDateTime(r.created_at)}</td>
                  <td className="small">{r.actor_name || '—'}</td>
                  <td className="small">{ACTION_LABEL[r.action] || r.action}</td>
                  <td className="small">
                    {r.entity}
                    {r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ''}
                  </td>
                  <td className="small text-break">
                    <code>{JSON.stringify(r.details)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </LoadState>
      </div>
    </div>
  )
}
