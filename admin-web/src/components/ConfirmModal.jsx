import { useEffect, useId, useState } from 'react'
import { Button, Form, Modal, Spinner } from 'react-bootstrap'

/**
 * Shared confirm / review modal for sensitive ops (group S).
 * No implicit Enter-to-confirm and no auto-focus on Confirm: a sensitive step must be an explicit click
 * (or Enter on the focused Confirm button).
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
  const [acknowledged, setAcknowledged] = useState(false)
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (show) {
      setAcknowledged(false)
      setReason('')
    }
  }, [show])

  const needsAck = Boolean(acknowledgeLabel)
  const reasonVisible = reasonRequired || showReason
  const reasonOk = reason.trim().length >= 3
  const canConfirm = !busy && (!needsAck || acknowledged) && (!reasonRequired || reasonOk)

  return (
    <Modal
      show={show}
      onHide={() => !busy && onCancel?.()}
      centered
      backdrop="static"
      keyboard={!busy}
      aria-labelledby={titleId}
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
          <Form.Group className="mt-3" controlId={`${titleId}-reason`}>
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
              isInvalid={reasonRequired && reason.length > 0 && !reasonOk}
              onChange={(e) => setReason(e.target.value)}
            />
            {reasonRequired && (
              <Form.Text className={reason.length > 0 && !reasonOk ? 'text-danger' : 'text-secondary'}>
                Bắt buộc, tối thiểu 3 ký tự.
              </Form.Text>
            )}
          </Form.Group>
        )}
        {needsAck && !acknowledged && (
          <div className="small text-secondary mt-2">Cần tick ô xác nhận để tiếp tục.</div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
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
