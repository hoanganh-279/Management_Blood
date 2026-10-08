import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Auto-save form draft to localStorage while the form is open.
 * `exclude` lists keys that must never be persisted (e.g. passwords).
 */
export function useFormDraft(key, initialValue, { enabled = true, debounceMs = 400, exclude = [] } = {}) {
  const storageKey = `mb-draft:${key}`
  const [value, setValue] = useState(() => {
    if (!enabled || typeof window === 'undefined') return initialValue
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const saved = JSON.parse(raw)
        exclude.forEach((k) => delete saved[k])
        return { ...initialValue, ...saved }
      }
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
        const toSave = { ...value }
        exclude.forEach((k) => delete toSave[k])
        localStorage.setItem(storageKey, JSON.stringify(toSave))
      } catch {
        /* ignore quota */
      }
    }, debounceMs)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
