import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import ConfirmModal from '../components/ConfirmModal'

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null)
  const [busy, setBusy] = useState(false)
  const resolverRef = useRef(null)

  const close = useCallback((result) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setBusy(false)
    setRequest(null)
    resolve?.(result)
  }, [])

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve
      setBusy(false)
      setRequest(options)
    })
  }, [])

  const value = useMemo(() => ({ confirm }), [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmModal
        show={!!request}
        title={request?.title}
        summary={request?.summary || []}
        body={request?.body}
        acknowledgeLabel={request?.acknowledgeLabel}
        confirmLabel={request?.confirmLabel}
        cancelLabel={request?.cancelLabel}
        confirmVariant={request?.confirmVariant || 'danger'}
        busy={busy || !!request?.busy}
        reasonRequired={!!request?.reasonRequired}
        showReason={!!request?.showReason}
        reasonLabel={request?.reasonLabel}
        reasonPlaceholder={request?.reasonPlaceholder}
        onCancel={() => close(null)}
        onConfirm={(payload) => {
          const base = payload || { acknowledged: true, reason: '' }
          if (request?.onBeforeConfirm) {
            setBusy(true)
            Promise.resolve(request.onBeforeConfirm(base))
              .then((result) => {
                if (result === false) {
                  setBusy(false)
                  return
                }
                const extra = result && typeof result === 'object' ? result : {}
                close({ ...base, ...extra })
              })
              .catch(() => setBusy(false))
            return
          }
          close(base)
        }}
      />
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider')
  }
  return ctx
}
