// The console's state, query, display and export contract. No DOM and no React: the UI and tests/stats-workspace.test.ts
// import the same functions. Types come from the Worker's shapeWorkspace, so a change to the API shows up here in tsc.
import type { shapeWorkspace, WORKSPACE_META } from '../../../src/workspace'
import { addDays, csvCell } from './pure'

export type WorkspaceData = ReturnType<typeof shapeWorkspace>
export type ExploreResult = WorkspaceData['explore']
export type Meta = typeof WORKSPACE_META
export type MeasureKey = keyof Meta['measures']
export type DimensionKey = keyof Meta['dimensions']
export type Row = { key: string; value: number }

export const VIEWS = ['overview', 'explore', 'definitions'] as const
export type View = (typeof VIEWS)[number]
export const PRESETS = ['today', '7', '14', '30', 'all', 'custom'] as const
export type Preset = (typeof PRESETS)[number]
/** The six daily series shapeWorkspace returns, in the metric strip's order. */
export const TRENDS = ['active', 'collages', 'downloads', 'shares', 'visits', 'posters'] as const
export type Trend = (typeof TRENDS)[number]
export const DISPLAYS = ['auto', 'line', 'bar', 'table'] as const
export type Display = (typeof DISPLAYS)[number]

export type WorkspaceState = {
  view: View; preset: Preset; from: string; to: string; country: string; device: string; compare: boolean; trend: Trend
  measure: MeasureKey; dimension: DimensionKey; display: Display; filters: Partial<Record<DimensionKey, string>>; sort: 'key' | 'value'; descending: boolean
}

/** Every navigation gets a ticket, even when it reuses cached data or opens Definitions; only the latest may show its result. */
export function workspaceRequestGate() {
  let latest = 0
  return { begin: () => ++latest, current: (ticket: number) => ticket === latest }
}

export function workspaceDefault(): WorkspaceState {
  return { view: 'overview', preset: '14', from: '', to: '', country: '', device: '', compare: true, trend: 'active', measure: 'active', dimension: 'day', display: 'auto', filters: {}, sort: 'key', descending: false }
}

const has = (list: readonly string[], v: string) => list.indexOf(v) >= 0
const dateOK = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d + 'T00:00:00Z')) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d

/** The state a hash describes, normalized: anything unknown or incompatible falls back. Old links (r, c, m) still open. */
export function workspaceState(hash: string, meta: Meta): WorkspaceState {
  const s = workspaceDefault() as unknown as Record<string, unknown> & WorkspaceState
  const q = new URLSearchParams(String(hash || '').replace(/^#/, ''))
  for (const k of ['view', 'preset', 'from', 'to', 'country', 'device', 'trend', 'measure', 'dimension', 'display', 'sort']) if (q.has(k)) s[k] = q.get(k)
  if (q.has('r')) s.preset = (q.get('r') === '1' ? 'today' : q.get('r')) as Preset
  if (q.has('c')) s.country = q.get('c')!
  if (q.has('m')) s.trend = (q.get('m') === 'people' ? 'active' : q.get('m')) as Trend
  s.compare = q.get('compare') !== '0'
  s.descending = q.get('descending') === '1'
  if (!has(VIEWS, s.view)) s.view = 'overview'
  if (!has(PRESETS, s.preset)) s.preset = '14'
  if (s.preset === 'custom' && (!dateOK(s.from) || !dateOK(s.to) || s.from > s.to)) { s.preset = '14'; s.from = ''; s.to = '' }
  if (!/^[A-Za-z]{2}$/.test(s.country)) s.country = ''
  s.country = s.country.toUpperCase()
  if (!has(meta.devices, s.device)) s.device = ''
  if (!has(TRENDS, s.trend)) s.trend = 'active'
  if (!Object.prototype.hasOwnProperty.call(meta.measures, s.measure)) s.measure = 'active'
  const dims: readonly string[] = meta.measures[s.measure].dimensions
  if (!has(dims, s.dimension)) s.dimension = 'day'
  if (!has(DISPLAYS, s.display)) s.display = 'auto'
  if (s.display === 'line' && s.dimension !== 'day') s.display = 'bar'
  if (!has(['key', 'value'], s.sort)) s.sort = 'key'
  for (const d of dims) if (q.has('f_' + d)) s.filters[d as DimensionKey] = q.get('f_' + d)!
  return s
}

/** The hash for a state: only what differs from the default, filters sorted. Empty for the default view. */
export function workspaceHash(s: WorkspaceState): string {
  const q = new URLSearchParams(), def = workspaceDefault() as unknown as Record<string, unknown>, cur = s as unknown as Record<string, unknown>
  for (const k of Object.keys(def)) if (k !== 'filters' && cur[k] !== def[k]) q.set(k, String(typeof cur[k] === 'boolean' ? (cur[k] ? 1 : 0) : cur[k]))
  for (const k of Object.keys(s.filters).sort()) q.set('f_' + k, s.filters[k as DimensionKey]!)
  return q.toString() ? '#' + q.toString() : ''
}

/** The /dashboard/data query for a state. Presets end yesterday (completed days), except Today and All. */
export function workspaceQuery(s: WorkspaceState, today: string): string {
  let end = s.preset === 'today' || s.preset === 'all' ? today : addDays(today, -1), start = end
  if (has(['7', '14', '30'], s.preset)) start = addDays(end, 1 - Number(s.preset))
  if (s.preset === 'custom') { start = s.from; end = s.to }
  const q = new URLSearchParams({ workspace: '1', from: start, to: end, measure: s.measure, dimension: s.dimension })
  if (s.preset === 'all') q.set('all', '1')
  if (s.country) q.set('country', s.country)
  if (s.device) q.set('device', s.device)
  for (const k of Object.keys(s.filters).sort()) q.set('f_' + k, s.filters[k as DimensionKey]!)
  return q.toString()
}

/** Sorted copy (never mutates the response): by value, by hour number with the unknown hour last, or by key. */
export function workspaceSort<T extends Row>(rows: readonly T[], key: 'key' | 'value' | string, descending: boolean, dimension: string): T[] {
  return rows.slice().sort((a, b) => {
    const c = key === 'value' ? a.value - b.value : dimension === 'hour' ? (a.key === '' ? 24 : Number(a.key)) - (b.key === '' ? 24 : Number(b.key)) : String(a.key).localeCompare(String(b.key))
    return (descending ? -c : c) || String(a.key).localeCompare(String(b.key))
  })
}

/** What a chart draws: days and hours in order without the unknown hour; categories as the top 10 plus Other (exact reach when they overlap). */
export function workspaceChartRows(result: Pick<ExploreResult, 'dimension' | 'rows' | 'overlapping' | 'other'>): Row[] {
  if (result.dimension === 'day' || result.dimension === 'hour') return result.rows.filter((r) => r.key !== '')
  const rows = workspaceSort(result.rows, 'value', true, result.dimension), top = rows.slice(0, 10)
  if (rows.length > 10) top.push({ key: '__other', value: result.overlapping ? result.other : rows.slice(10).reduce((a, r) => a + r.value, 0) })
  return top
}

/** A CSV cell a spreadsheet won't run as a formula. */
export function exportCell(v: unknown): string {
  let t = String(v == null ? '' : v)
  if (/^[\s]*[=+@-]/.test(t) || /^[\t\r\n]/.test(t)) t = "'" + t
  return csvCell(t)
}

/** The whole displayed aggregate as CSV, with units, scope, filters, coverage notes and the table's sort. */
export function workspaceCsv(data: WorkspaceData, s: Pick<WorkspaceState, 'sort' | 'descending'>): string {
  const r = data.range, x = data.explore
  const rows: unknown[][] = [['from', 'to', 'country', 'device', 'measure', 'unit', 'dimension', 'filters', 'category', 'value', 'total', 'missing_category', 'overlapping', 'missing_identity', 'generated_at', 'notes']]
  const f = x.filters as Record<string, string>
  const filters = Object.keys(f).sort().map((k) => k + '=' + f[k]).join('; ')
  const notes = data.warnings.slice()
  if (x.dimension === 'hour') notes.push('Receipt hour; missing times are in the empty category.')
  if (x.overlapping) notes.push('Categories overlap; do not sum their visitor-days.')
  for (const row of workspaceSort(x.rows, s.sort, s.descending, x.dimension)) rows.push([r.from, r.to, r.country || 'all', r.device || 'all', x.measure, x.unit, x.dimension, filters, row.key, row.value, x.total, x.unknown, x.overlapping, x.missingIdentity, data.generatedAt, notes.join(' ')])
  if (!x.rows.length) rows.push([r.from, r.to, r.country || 'all', r.device || 'all', x.measure, x.unit, x.dimension, filters, '', 0, x.total, x.unknown, x.overlapping, x.missingIdentity, data.generatedAt, 'No matching events. ' + notes.join(' ')])
  return rows.map((row) => row.map(exportCell).join(',')).join('\n') + '\n'
}

/** A sentence comparing the period with the one before, or '' when comparison isn't available or asked for. */
export function workspaceObservation(data: Pick<WorkspaceData, 'range' | 'daily' | 'previous'>, measure: Trend, compare: boolean): string {
  if (!compare || !data.range.compareAvailable) return ''
  const value = data.daily.reduce((a, d) => a + d[measure], 0), previous = data.previous.reduce((a, d) => a + d[measure], 0)
  if (!previous) return value ? 'No previous activity in the comparison period.' : ''
  if (value === previous) return 'Unchanged: ' + value.toLocaleString('en-US') + ' in each period.'
  return value.toLocaleString('en-US') + ' versus ' + previous.toLocaleString('en-US') + ' in the previous period (' + Math.abs(Math.round(((value - previous) / previous) * 100)) + '% ' + (value > previous ? 'higher' : 'lower') + ').'
}
