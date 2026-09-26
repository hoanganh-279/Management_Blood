import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Toast, ToastContainer } from 'react-bootstrap'

const UndoContext = createContext(null)

/**
 * Minor (group M) actions: apply immediately + Undo toast for a few seconds.
 */
export function UndoToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const dismiss = useCallback(() => {
    clearTimer()
    setToast(null)
  }, [clearTimer])

  const showUndo = useCallback(
    ({ message, onUndo, durationMs = 6000 }) => {
      clearTimer()
      setToast({ message, onUndo })
      timerRef.current = window.setTimeout(() => {
        setToast(null)
        timerRef.current = null
      }, durationMs)
    },
    [clearTimer],
  )

  useEffect(() => () => clearTimer(), [clearTimer])

  const value = useMemo(() => ({ showUndo }), [showUndo])

  return (
    <UndoContext.Provider value={value}>
      {children}
      <ToastContainer position="bottom-end" className="p-3" style={{ zIndex: 1080 }}>
        <Toast show={!!toast} onClose={dismiss} bg="dark">
          <Toast.Body className="text-white d-flex align-items-center justify-content-between gap-3">
            <span>{toast?.message}</span>
            <button
              type="button"
              className="btn btn-sm btn-outline-light"
              onClick={() => {
                toast?.onUndo?.()
                dismiss()
              }}
            >
              Hoàn tác
            </button>
          </Toast.Body>
        </Toast>
      </ToastContainer>
    </UndoContext.Provider>
  )
}

export function useUndoToast() {
  const ctx = useContext(UndoContext)
  if (!ctx) {
    throw new Error('useUndoToast must be used within UndoToastProvider')
  }
  return ctx
}
