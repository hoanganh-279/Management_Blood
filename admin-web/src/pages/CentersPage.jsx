import { useCallback, useEffect, useState } from 'react'
import { Alert, Badge, Button, Form, Table } from 'react-bootstrap'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import LoadState from '../components/LoadState'
import { useConfirm } from '../hooks/useConfirm'
import { FACILITY_TYPE_LABEL, apiError, label } from '../utils/labels'

export default function CentersPage() {
  const { hasRole } = useAuth()
  const { confirm } = useConfirm()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState(null)
  const [saving, setSaving] = useState(null)

  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api
      .get('/centers')
      .then((r) => setList(r.data))
      .catch((err) => setError(apiError(err, 'Không tải được danh sách cơ sở.')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function patchFlag(center, field, value) {
    if (!hasRole('admin')) return

    const labels = {
      allowed_to_supply_others: 'Được cung cấp cho cơ sở khác',
      has_supply_contract: 'Có hợp đồng cung cấp',
    }
    const ok = await confirm({
      title: 'Xác nhận đổi cấu hình cơ sở',
      summary: [
        { label: 'Cơ sở', value: center.name },
        { label: 'Trường', value: labels[field] || field },
        { label: 'Giá trị mới', value: value ? 'Có' : 'Không' },
      ],
      body:
        field === 'allowed_to_supply_others' ? (
          <p className="small mb-0">
            Cờ này ánh xạ tinh thần Điều 39.1 (cấu hình prototype — không mô phỏng quy trình cấp phép).
          </p>
        ) : (
          <p className="small mb-0">
            Khi không có HĐ, đề xuất điều chuyển yêu cầu xác nhận lãnh đạo / ủy quyền (prototype).
          </p>
        ),
      confirmLabel: 'Cập nhật',
      confirmVariant: 'primary',
    })
    if (!ok) return

    setSaving(center.id)
    setFeedback(null)
    try {
      const { data } = await api.patch(`/centers/${center.id}`, { [field]: value })
      setList((prev) => prev.map((c) => (c.id === data.id ? data : c)))
      setFeedback({ type: 'success', text: `Đã cập nhật ${center.name}.` })
    } catch (err) {
      setFeedback({ type: 'danger', text: apiError(err, 'Cập nhật thất bại.') })
    } finally {
      setSaving(null)
    }
  }

  if (loading || error) return <LoadState loading={loading} error={error} onRetry={load} />

  return (
    <div>
      <h1 className="h3 mb-1">Cơ sở bệnh viện / ngân hàng máu</h1>
      <p className="text-secondary small">
        Cờ <code>allowed_to_supply_others</code> ánh xạ tinh thần Điều 39.1 (cấu hình prototype — không mô
        phỏng cấp phép).
      </p>
      {feedback && (
        <Alert variant={feedback.type} dismissible onClose={() => setFeedback(null)}>
          {feedback.text}
        </Alert>
      )}
      <div className="table-panel">
        <Table hover size="sm" className="mb-0">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Loại</th>
              <th>Địa chỉ</th>
              <th>Được cung cấp cho CS khác</th>
              <th>Có HĐ cung cấp</th>
              <th>Tỷ lệ điều chuyển thành công (R)</th>
              <th>Tọa độ</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>
                  <Badge bg={c.facility_type === 'bank' ? 'primary' : 'secondary'}>
                    {label(FACILITY_TYPE_LABEL, c.facility_type)}
                  </Badge>
                </td>
                <td>{c.address}</td>
                <td>
                  {hasRole('admin') ? (
                    <Form.Check
                      type="switch"
                      disabled={saving === c.id}
                      checked={!!c.allowed_to_supply_others}
                      onChange={(e) => patchFlag(c, 'allowed_to_supply_others', e.target.checked)}
                      label={c.allowed_to_supply_others ? 'Có' : 'Không'}
                    />
                  ) : c.allowed_to_supply_others ? (
                    'Có'
                  ) : (
                    'Không'
                  )}
                </td>
                <td>
                  {hasRole('admin') ? (
                    <Form.Check
                      type="switch"
                      disabled={saving === c.id}
                      checked={!!c.has_supply_contract}
                      onChange={(e) => patchFlag(c, 'has_supply_contract', e.target.checked)}
                      label={c.has_supply_contract ? 'Có' : 'Không'}
                    />
                  ) : c.has_supply_contract ? (
                    'Có'
                  ) : (
                    'Không'
                  )}
                </td>
                <td>{Math.round((c.transfer_success_rate || 0) * 100)}%</td>
                <td className="small">
                  {c.lat.toFixed(4)}, {c.lng.toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      {hasRole('admin') && (
        <p className="small text-secondary mt-2">
          <Button size="sm" variant="link" className="p-0" onClick={load}>
            Làm mới
          </Button>
        </p>
      )}
    </div>
  )
}
