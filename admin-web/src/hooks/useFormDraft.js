import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Auto-save form draft to localStorage while the form is open.
 */
export function useFormDraft(key, initialValue, { enabled = true, debounceMs = 400 } = {}) {
  const storageKey = `mb-draft:${key}`
  const [value, setValue] = useState(() => {
    if (!enabled || typeof window === 'undefined') return initialValue
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) return { ...initialValue, ...JSON.parse(raw) }
    } catch {
      /* ignore */
    }
    return initialValue
  })
  const timer = useRef(null)

  useEffect(() => {
    if (!enabled) return undefined
    timer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(value))
      } catch {
        /* ignore quota */
      }
    }, debounceMs)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [value, storageKey, enabled, debounceMs])

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey)
    } catch {
      /* ignore */
    }
  }, [storageKey])

  const reset = useCallback(
    (next = initialValue) => {
      clearDraft()
      setValue(next)
    },
    [clearDraft, initialValue],
  )

  return [value, setValue, { clearDraft, reset }]
}
