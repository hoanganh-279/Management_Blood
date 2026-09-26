import { useEffect, useId, useRef, useState } from 'react'
import { Button, Form, Modal, Spinner } from 'react-bootstrap'

/**
 * Shared confirm / review modal for sensitive ops (group S).
 * OTP / digital signature: production hook later — not implemented in MVP.
 */
export default function ConfirmModal({
  show,
  title = 'Xác nhận thao tác',
  summary = [],
  body,
  acknowledgeLabel,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  confirmVariant = 'danger',
  busy = false,
  reasonRequired = false,
  showReason = false,
  reasonLabel = 'Lý do',
  reasonPlaceholder = 'Nhập lý do…',
  onCancel,
  onConfirm,
}) {
  const titleId = useId()
  const confirmRef = useRef(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (show) {
      setAcknowledged(false)
      setReason('')
      const t = window.setTimeout(() => confirmRef.current?.focus(), 50)
      return () => window.clearTimeout(t)
    }
  }, [show])

  const needsAck = Boolean(acknowledgeLabel)
  const reasonVisible = reasonRequired || showReason
  const canConfirm =
    !busy &&
    (!needsAck || acknowledged) &&
    (!reasonRequired || reason.trim().length > 0)

  function handleKeyDown(e) {
    if (e.key === 'Escape' && !busy) {
      e.preventDefault()
      onCancel?.()
      return
    }
    if (e.key === 'Enter' && canConfirm && e.target?.tagName !== 'TEXTAREA') {
      e.preventDefault()
      onConfirm?.({ reason: reason.trim(), acknowledged })
    }
  }

  return (
    <Modal
      show={show}
      onHide={() => !busy && onCancel?.()}
      centered
      backdrop="static"
      keyboard={!busy}
      aria-labelledby={titleId}
      onKeyDown={handleKeyDown}
    >
      <Modal.Header closeButton={!busy}>
        <Modal.Title id={titleId}>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {summary?.length > 0 && (
          <dl className="row small mb-3">
            {summary.map((row) => (
              <div key={row.label} className="d-contents">
                <dt className="col-sm-4 text-secondary">{row.label}</dt>
                <dd className="col-sm-8 mb-1">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {body}
        {acknowledgeLabel && (
          <Form.Check
            className="mt-2"
            type="checkbox"
            id={`${titleId}-ack`}
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            label={acknowledgeLabel}
            disabled={busy}
          />
        )}
        {reasonVisible && (
          <Form.Group className="mt-3">
            <Form.Label>
              {reasonLabel}
              {reasonRequired ? ' *' : ''}
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              value={reason}
              placeholder={reasonPlaceholder}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </Form.Group>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          ref={confirmRef}
          variant={confirmVariant}
          disabled={!canConfirm}
          onClick={() => onConfirm?.({ reason: reason.trim(), acknowledged })}
        >
          {busy ? <Spinner size="sm" /> : confirmLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
