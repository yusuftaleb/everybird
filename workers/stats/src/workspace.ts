import { ALLOWED, LANG } from './event'
import { MAX_DAYS, parseParams, type Row, type Stmt } from './dashboard'

export const DEVICES = ['iphone', 'ipad', 'android-phone', 'android-tablet', 'other-tablet', 'other-phone', 'mac', 'windows', 'linux', 'chromeos', 'other']
const common = ['day', 'country', 'device']
const timed = [...common, 'hour']
export const MEASURES = {
  active: { label: 'Active visitor-days', unit: 'visitor-days', dimensions: common },
  visits: { label: 'Recorded visits', unit: 'deduplicated visits', dimensions: [...timed, 'page', 'language'] },
  collages: { label: 'Personal-list collages', unit: 'events', dimensions: [...timed, 'source'] },
  demos: { label: 'Demo collages', unit: 'events', dimensions: timed },
  restores: { label: 'Restored collages', unit: 'events', dimensions: timed },
  downloads: { label: 'Downloads', unit: 'events', dimensions: [...timed, 'event'] },
  images: { label: 'Image downloads', unit: 'events', dimensions: [...timed, 'format'] },
  posterDownloads: { label: 'Poster downloads', unit: 'events', dimensions: [...timed, 'fileType'] },
  shares: { label: 'Share actions', unit: 'events', dimensions: [...timed, 'shareType'] },
  links: { label: 'Links copied', unit: 'events', dimensions: [...timed, 'linkType'] },
  posters: { label: 'Posters made', unit: 'events', dimensions: [...timed, 'posterSize'] },
  searches: { label: 'Searches applied', unit: 'events', dimensions: [...timed, 'searchType'] },
  filters: { label: 'Filters used', unit: 'events', dimensions: [...timed, 'filterType'] },
  languageSwitches: { label: 'Interface-language switches', unit: 'events', dimensions: [...timed, 'uiLanguage'] },
} as const
export type Measure = keyof typeof MEASURES
export const DIMENSIONS = {
  day: 'Day', hour: 'Receipt hour (Pacific)', country: 'Country', device: 'Device', page: 'Page', language: 'Browser language',
  source: 'Import source', event: 'Download type', format: 'Image format', fileType: 'Poster file type', shareType: 'Share type',
  linkType: 'Link type', posterSize: 'Poster size', searchType: 'Search type', filterType: 'Filter type', uiLanguage: 'Interface language',
} as const
export type Dimension = keyof typeof DIMENSIONS
export const WORKSPACE_META = { measures: MEASURES, dimensions: DIMENSIONS, devices: DEVICES }

const expressions: Record<Dimension, string> = {
  day: 'day', hour: "CAST(strftime('%H', received_at, '-7 hours') AS INTEGER)", country: 'country', device: 'device',
  page: 'value', language: "NULLIF(lang, '')", source: 'value', event: 'name', format: 'value', fileType: 'value',
  shareType: 'value', linkType: 'value', posterSize: 'value', searchType: 'value', filterType: 'value', uiLanguage: 'value',
}
const predicates: Record<Measure, string> = {
  active: '1=1', visits: "name = 'visit'", collages: "name = 'collage_made' AND value NOT IN ('sample', 'restore')",
  demos: "name = 'collage_made' AND value = 'sample'", restores: "name = 'collage_made' AND value = 'restore'",
  downloads: "name IN ('image_downloaded', 'poster_downloaded')", images: "name = 'image_downloaded'", posterDownloads: "name = 'poster_downloaded'",
  shares: "name = 'shared'", links: "name = 'link_copied'", posters: "name = 'poster_made'", searches: "name = 'search_applied'",
  filters: "name = 'filter_used'", languageSwitches: "name = 'ui_language'",
}
const PD = "COUNT(DISTINCT day || '|' || NULLIF(vid, ''))"
const count = (m: Measure) => m === 'active' ? PD : 'COUNT(*)'
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const ms = (d: string) => Date.parse(d + 'T00:00:00Z')
export const shiftDay = (d: string, n: number) => iso(ms(d) + n * 86400000)
export type WorkspaceParams = { from: string; to: string; country: string; device: string; measure: Measure; dimension: Dimension; filters: Partial<Record<Dimension, string>>; all: boolean }

function validValue(d: Dimension, v: string): boolean {
  if (d === 'day') return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(ms(v)) && iso(ms(v)) === v
  if (d === 'hour') return v === '' || /^(?:[0-9]|1[0-9]|2[0-3])$/.test(v)
  if (d === 'country') return /^[A-Z]{2}$/.test(v)
  if (d === 'device') return DEVICES.includes(v)
  if (d === 'language') return v === '' || LANG.test(v)
  if (d === 'event') return ['image_downloaded', 'poster_downloaded'].includes(v)
  const event: Partial<Record<Dimension, string>> = { page: 'visit', source: 'collage_made', format: 'image_downloaded', fileType: 'poster_downloaded', shareType: 'shared', linkType: 'link_copied', posterSize: 'poster_made', searchType: 'search_applied', filterType: 'filter_used', uiLanguage: 'ui_language' }
  return !!event[d] && ALLOWED[event[d]!].has(v)
}

export function parseWorkspace(q: URLSearchParams, today: string): WorkspaceParams | string {
  if (q.toString().length > 4096) return 'Query is too long.'
  const all = q.get('all') === '1'
  const dates = new URLSearchParams(q)
  if (all) { dates.set('from', shiftDay(today, 1 - MAX_DAYS)); dates.set('to', today) }
  const p = parseParams(dates, today)
  if (typeof p === 'string') return p
  if (p.to > today) return 'Choose dates up to today.'
  const device = q.get('device') ?? ''
  if (device && !DEVICES.includes(device)) return 'Unknown device.'
  const measure = q.get('measure') ?? 'active', dimension = q.get('dimension') ?? 'day'
  if (!Object.hasOwn(MEASURES, measure)) return 'Unknown measure.'
  const m = measure as Measure, dims: readonly string[] = MEASURES[m].dimensions
  if (!dims.includes(dimension)) return 'This breakdown is not available for this measure.'
  const filters: WorkspaceParams['filters'] = {}
  for (const [key, v] of q) {
    if (!key.startsWith('f_')) continue
    const d = key.slice(2) as Dimension
    if (!dims.includes(d) || !validValue(d, v)) return 'This filter is not available for this measure.'
    if (d === 'source' && m === 'collages' && ['sample', 'restore'].includes(v)) return 'Demo and restore events are separate measures.'
    filters[d] = v
  }
  return { ...p, device, measure: m, dimension: dimension as Dimension, filters, all }
}

function where(p: WorkspaceParams, from = p.from, to = p.to, exploration = false): { sql: string; binds: (string | number)[] } {
  const parts = ['day BETWEEN ? AND ?'], binds: (string | number)[] = [from, to]
  if (p.country) { parts.push('country = ?'); binds.push(p.country) }
  if (p.device) { parts.push('device = ?'); binds.push(p.device) }
  if (exploration) for (const [d, v] of Object.entries(p.filters) as [Dimension, string][]) {
    if ((d === 'language' || d === 'hour') && v === '') parts.push(expressions[d] + ' IS NULL')
    else { parts.push(expressions[d] + ' = ?'); binds.push(d === 'hour' ? Number(v) : v) }
  }
  return { sql: 'WHERE ' + parts.join(' AND '), binds }
}

export function workspaceStatements(p: WorkspaceParams): Stmt[] {
  const days = (ms(p.to) - ms(p.from)) / 86400000 + 1
  const prevFrom = shiftDay(p.from, -days), w = where(p), wide = where(p, prevFrom), x = where(p, p.from, p.to, true)
  const summary = (w: ReturnType<typeof where>): Stmt => ({ sql: `SELECT ${PD} AS active, COUNT(*) AS events, SUM(vid = '') AS missingIdentity, ${(['collages', 'downloads', 'shares', 'demos', 'restores', 'images', 'posters', 'posterDownloads', 'links', 'searches', 'filters', 'visits'] as Measure[]).map((m) => `SUM(CASE WHEN ${predicates[m]} THEN 1 ELSE 0 END) AS ${m}`).join(', ')}, COUNT(DISTINCT CASE WHEN ${predicates.collages} THEN day || '|' || NULLIF(vid, '') END) AS makers, COUNT(DISTINCT CASE WHEN ${predicates.downloads} THEN day || '|' || NULLIF(vid, '') END) AS downloaders, COUNT(DISTINCT CASE WHEN ${predicates.shares} THEN day || '|' || NULLIF(vid, '') END) AS sharers FROM events ${w.sql}`, binds: w.binds })
  return [
    summary(w),
    { sql: `SELECT day AS k, ${PD} AS active, ${(['collages', 'downloads', 'shares', 'visits', 'posters'] as Measure[]).map((m) => `SUM(CASE WHEN ${predicates[m]} THEN 1 ELSE 0 END) AS ${m}`).join(', ')} FROM events ${wide.sql} GROUP BY day`, binds: wide.binds },
    ...(['country', 'device'] as const).map((d) => ({ sql: `SELECT ${d} AS k, ${PD} AS n FROM events ${w.sql} GROUP BY ${d} ORDER BY n DESC, k`, binds: w.binds })),
    { sql: `SELECT ${expressions.hour} AS k, COUNT(*) AS n FROM events ${w.sql} AND name = 'visit' GROUP BY k ORDER BY k`, binds: w.binds },
    { sql: `SELECT ${expressions[p.dimension]} AS k, ${count(p.measure)} AS n FROM events ${x.sql} AND (${predicates[p.measure]}) GROUP BY k ORDER BY n DESC, k`, binds: x.binds },
    { sql: `SELECT ${count(p.measure)} AS n, COUNT(*) AS events, SUM(vid = '') AS missingIdentity FROM events ${x.sql} AND (${predicates[p.measure]})`, binds: x.binds },
    { sql: "SELECT MIN(day) AS first, SUM(name = 'collage_made' AND value NOT IN ('sample', 'restore')) AS collages, SUM(name IN ('image_downloaded', 'poster_downloaded')) AS downloads FROM events", binds: [] },
    // These are picker options, not metric breakdowns: intentionally independent of selected country/device.
    { sql: 'SELECT DISTINCT country AS k FROM events WHERE day BETWEEN ? AND ? ORDER BY country', binds: [p.from, p.to] },
    // Exact reach of the complement, not a sum of overlapping country/device visitor-day counts.
    ...(p.measure === 'active' && ['country', 'device'].includes(p.dimension) ? [{ sql: `SELECT ${PD} AS n FROM events ${x.sql} AND ${expressions[p.dimension]} NOT IN (SELECT ${expressions[p.dimension]} FROM events ${x.sql} GROUP BY ${expressions[p.dimension]} ORDER BY ${PD} DESC, ${expressions[p.dimension]} LIMIT 10)`, binds: [...x.binds, ...x.binds] }] : []),
  ]
}

const n = (v: unknown) => Number(v ?? 0)
export function shapeWorkspace(p: WorkspaceParams, results: Row[][], today: string, now = new Date()) {
  const [summaries = [], series = [], countries = [], devices = [], hours = [], groups = [], totals = [], lifetime = [], options = [], other = []] = results
  const first = typeof lifetime[0]?.first === 'string' ? lifetime[0].first : null
  const from = first && first <= p.to ? (first > p.from ? first : p.from) : p.from
  const days = (ms(p.to) - ms(from)) / 86400000 + 1
  const prevFrom = shiftDay(from, -days), prevTo = shiftDay(from, -1)
  const metrics = ['active', 'collages', 'downloads', 'shares', 'visits', 'posters'] as const
  const seriesByDay = new Map(series.map((r) => [r.k, r]))
  const point = (d: string) => { const row = seriesByDay.get(d); return { day: d, ...Object.fromEntries(metrics.map((m) => [m, n(row?.[m])])) as Record<typeof metrics[number], number> } }
  const daily = Array.from({ length: days }, (_, i) => point(shiftDay(from, i)))
  const previous = Array.from({ length: days }, (_, i) => point(shiftDay(prevFrom, i)))
  const summary = Object.fromEntries(['active', 'events', 'missingIdentity', 'collages', 'downloads', 'shares', 'demos', 'restores', 'images', 'posters', 'posterDownloads', 'links', 'searches', 'filters', 'visits', 'makers', 'downloaders', 'sharers'].map((k) => [k, n(summaries[0]?.[k])]))
  const total = n(totals[0]?.n), unknown = groups.filter((r) => r.k === null || r.k === '').reduce((s, r) => s + n(r.n), 0)
  let rows = groups.map((r) => ({ key: r.k == null ? '' : String(r.k), value: n(r.n) }))
  if (p.dimension === 'day') { const byDay = new Map(rows.map((r) => [r.key, r.value])); rows = Array.from({ length: days }, (_, i) => { const key = shiftDay(from, i); return { key, value: byDay.get(key) ?? 0 } }) }
  if (p.dimension === 'hour') rows = [...Array.from({ length: 24 }, (_, i) => ({ key: String(i), value: rows.find((r) => r.key === String(i))?.value ?? 0 })), ...(unknown ? [{ key: '', value: unknown }] : [])]
  const warnings: string[] = []
  if (!first) warnings.push('No analytics have been recorded yet. Collection coverage is unavailable.')
  else if (p.to < first) warnings.push(`Collection began on ${first}. There is no collection coverage in this selected period.`)
  else if (from === first) warnings.push(`Collection began on ${first}; that first day may be partial.${p.from < first ? ` Dates before collection are excluded; showing ${first} onwards.` : ''}`)
  if (p.all && first && first < p.from) warnings.push(`All dates is limited to the latest ${MAX_DAYS} days.`)
  if (from <= '2026-11-16' && p.to >= '2026-11-16') warnings.push('16 November 2026 spans 31 hours at the UTC/Pacific cutover; some daily identities may be counted twice. Earlier day labels use UTC.')
  else if (from < '2026-11-17') warnings.push('Dates before 17 November 2026 use historical UTC day labels.')
  if (p.to === today) warnings.push('Today is incomplete. Previous-period percentage comparisons are unavailable for this range.')
  if (summary.missingIdentity) warnings.push(`${summary.missingIdentity} events lack a daily identity and are excluded from active visitor-days and action reach.`)
  const compareAvailable = !p.all && from === p.from && p.to < today && !!first && prevFrom > first && !(prevFrom <= '2026-11-16' && p.to >= '2026-11-16')
  return {
    generatedAt: now.toISOString(), range: { from, to: p.to, days, country: p.country, device: p.device, prevFrom, prevTo, compareAvailable },
    coverage: { first, available: !!first && p.to >= first },
    summary, daily, previous,
    countries: countries.map((r) => ({ key: String(r.k), value: n(r.n) })), devices: devices.map((r) => ({ key: String(r.k), value: n(r.n) })),
    hourly: { hours: Array.from({ length: 24 }, (_, i) => ({ key: String(i), value: n(hours.find((r) => r.k !== null && Number(r.k) === i)?.n) })), withoutTime: hours.filter((r) => r.k === null).reduce((s, r) => s + n(r.n), 0) },
    explore: { measure: p.measure, dimension: p.dimension, unit: MEASURES[p.measure].unit, filters: p.filters, rows, total, unknown, other: n(other[0]?.n), missingIdentity: n(totals[0]?.missingIdentity), overlapping: p.measure === 'active' && p.dimension !== 'day' },
    lifetime: { first, collages: n(lifetime[0]?.collages), downloads: n(lifetime[0]?.downloads) },
    countryOptions: options.map((r) => String(r.k)), warnings,
  }
}
