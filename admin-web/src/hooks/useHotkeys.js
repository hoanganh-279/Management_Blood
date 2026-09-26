import { useEffect } from 'react'

function isTypingTarget(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/**
 * Simple keyboard shortcuts. Ignores events while typing in form fields.
 * sequences: { 'g t': () => navigate('/transfers'), ... }
 */
export function useHotkeys(bindings, { enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return undefined

    let pending = null
    let pendingTimer = null

    function clearPending() {
      pending = null
      if (pendingTimer) {
        window.clearTimeout(pendingTimer)
        pendingTimer = null
      }
    }

    function onKeyDown(e) {
      if (!enabled) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) return

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const combo = pending ? `${pending} ${key}` : key

      if (bindings[combo]) {
        e.preventDefault()
        clearPending()
        bindings[combo]()
        return
      }

      const isPrefix = Object.keys(bindings).some((b) => b.startsWith(`${combo} `))
      if (isPrefix) {
        pending = combo
        if (pendingTimer) window.clearTimeout(pendingTimer)
        pendingTimer = window.setTimeout(clearPending, 900)
      } else {
        clearPending()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      clearPending()
    }
  }, [bindings, enabled])
}
