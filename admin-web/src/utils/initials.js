const TITLE_PREFIX =
  /^(BS\.|KTV\.|DS\.|CN\.|ThS\.|TS\.|PGS\.|GS\.|BSCKI\.|BSCKII\.)\s*/i

/**
 * Initials from Vietnamese staff names: last two words after stripping titles.
 * e.g. "BS. Trần Văn Minh" → "VM"
 */
export function getInitials(fullName) {
  if (!fullName || typeof fullName !== 'string') return '?'
  const cleaned = fullName.trim().replace(TITLE_PREFIX, '').trim()
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) {
    const w = parts[0]
    return w.slice(0, Math.min(2, w.length)).toUpperCase()
  }
  const a = parts[parts.length - 2][0] || ''
  const b = parts[parts.length - 1][0] || ''
  return (a + b).toUpperCase()
}
