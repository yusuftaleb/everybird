const DATE_RE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/

/** 'YYYY-MM-DD' | 'YYYY-MM' | 'YYYY', a real calendar date not in the future; else null. Empty is ''. */
export function parseManualDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return ''
  const m = DATE_RE.exec(s)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), m[2] ? Number(m[2]) : 1, m[3] ? Number(m[3]) : 1]
  if (y < 1800 || mo < 1 || mo > 12) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  if (dt.getTime() > Date.now()) return null
  return s
}
