// The dashboard's small pure helpers: Pacific dates, day arithmetic, CSV cells, rates, changes and postable claims.
// No DOM and no React: the console imports these, and tests/stats-dashboard.test.ts tests the same functions.

/** The America/Vancouver calendar date of an instant (ms), the same rule as the Worker's event.ts pacificDay. */
const PACIFIC_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Vancouver', year: 'numeric', month: '2-digit', day: '2-digit' })
export function pacificDay(ms: number): string {
  const p: Record<string, string> = {}
  for (const x of PACIFIC_FMT.formatToParts(new Date(ms))) p[x.type] = x.value
  return p.year + '-' + p.month + '-' + p.day
}

/** Day arithmetic on a YYYY-MM-DD string (no 24-hour steps in local time, so daylight saving can't shift a day). */
export function addDays(d: string, n: number): string {
  return new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
}

/** One CSV cell, quoted when it holds a quote, comma or line break. */
export function csvCell(v: unknown): string {
  const t = String(v == null ? '' : v)
  return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
}

/** A sentence that is true and safe to post: strictly below the count, rounded down (two significant figures from 100 up, tens below that). */
export function floorNice(m: number): number {
  if (m < 10) return m
  if (m < 100) return Math.floor(m / 10) * 10
  const p = Math.pow(10, String(Math.floor(m)).length - 2)
  return Math.floor(m / p) * p
}
export function safeClaim(count: number, what: string): string {
  const n = Math.floor(Number(count))
  if (!(n > 2)) return ''
  return 'More than ' + floorNice(n - 1).toLocaleString('en-US') + ' ' + what + '.'
}

/** A share as text: one decimal under 10%, whole above; a dash when there is nothing to divide by. */
export function pct(a: number, b: number): string {
  if (!b) return '–'
  const v = (a / b) * 100
  return (v < 10 ? (Math.round(v * 10) / 10).toFixed(1) : String(Math.round(v))) + '%'
}
export function perPerson(a: number, b: number): string {
  return b ? (a / b).toFixed(2) : '–'
}

export type Delta = { dir: 'up' | 'down' | 'flat' | 'new' | 'none'; pct: number }
/** Change against the previous period: dir is up, down, flat, new (nothing before) or none (nothing either time). */
export function deltaInfo(v: number, p: number): Delta {
  if (!p) return { dir: v ? 'new' : 'none', pct: 0 }
  const d = Math.round(((v - p) / p) * 100)
  return { dir: d > 0 ? 'up' : d < 0 ? 'down' : 'flat', pct: Math.abs(d) }
}

// The first dashboard's hash and daily CSV, kept for its tests and for reading its links' shape. The console's own state is
// workspace.ts (workspaceState still opens the old r/c/m links).
const RANGE_DAYS = [1, 7, 14, 30]
const METRIC_KEYS = ['people', 'collages', 'downloads', 'shares', 'posters']
export type HashState = { days: number; all: boolean; country: string; metric: string; compare: boolean }
/** The old URL hash: #r=7&c=MX&m=collages&cmp=1. Defaults (14 days, all countries, people, no compare) are left out. */
export function parseHash(hash: string): HashState {
  const q: Record<string, string> = {}
  const s: HashState = { days: 14, all: false, country: '', metric: 'people', compare: false }
  String(hash || '').replace(/^#/, '').split('&').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) q[kv.slice(0, i)] = kv.slice(i + 1) })
  if (q.r === 'all') s.all = true
  else if (RANGE_DAYS.indexOf(Number(q.r)) >= 0) s.days = Number(q.r)
  if (/^[A-Za-z]{2}$/.test(q.c || '')) s.country = q.c.toUpperCase()
  if (METRIC_KEYS.indexOf(q.m) >= 0) s.metric = q.m
  s.compare = q.cmp === '1' && !s.all // "All" has no previous period
  return s
}
export function serializeHash(s: HashState): string {
  const a: string[] = []
  if (s.all) a.push('r=all')
  else if (s.days !== 14) a.push('r=' + s.days)
  if (s.country) a.push('c=' + s.country)
  if (s.metric !== 'people') a.push('m=' + s.metric)
  if (s.compare && !s.all) a.push('cmp=1')
  return a.length ? '#' + a.join('&') : ''
}
const CSV_COLUMNS = ['d', 'people', 'collages', 'images', 'posterDownloads', 'downloads', 'shares', 'posters']
/** The old daily series as CSV (one row per day). */
export function buildCsv(days: Record<string, number | string>[], country: string): string {
  const rows = [['date', 'country', 'people', 'collages', 'images', 'poster_downloads', 'downloads', 'shares', 'posters'].join(',')]
  days.forEach((x) => { rows.push([x.d, country || 'all'].concat(CSV_COLUMNS.slice(1).map((k) => x[k] || 0)).map(csvCell).join(',')) })
  return rows.join('\n') + '\n'
}
