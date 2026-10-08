import { Alert, Button, Spinner } from 'react-bootstrap'

/** Loading / error / empty states shared by pages. Renders children when data is ready. */
export default function LoadState({ loading, error, empty, emptyText = 'Chưa có dữ liệu.', onRetry, children }) {
  if (loading) {
    return (
      <div className="py-4 text-center" role="status">
        <Spinner size="sm" className="me-2" />
        <span>Đang tải…</span>
      </div>
    )
  }
  if (error) {
    return (
      <Alert variant="danger" className="d-flex justify-content-between align-items-center">
        <span>{error}</span>
        {onRetry && (
          <Button size="sm" variant="outline-danger" onClick={onRetry}>
            Thử lại
          </Button>
        )}
      </Alert>
    )
  }
  if (empty) {
    return <div className="text-secondary text-center py-4">{emptyText}</div>
  }
  return children
}
