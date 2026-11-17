// The pure part of the stats Worker: what one POSTed body becomes in the events table, or null (dropped).
// No Worker globals here, so the app's unit tests import it (tests/stats-worker.test.ts).

/** Only these events and values are accepted; anything else is dropped. Mirrored by the app's ALLOWED (src/lib/analytics.ts). */
export const ALLOWED: Record<string, Set<string>> = {
  visit: new Set(['landing', 'collage', 'settings', 'about', 'shared']),
  collage_made: new Set(['ebird', 'ebird-list', 'inat', 'obsorg', 'manual', 'sample', 'restore', 'mixed']),
  image_downloaded: new Set(['story', 'post', 'square', 'desktop', 'wide']),
  shared: new Set(['story', 'post', 'square', 'desktop', 'wide', 'link']),
  link_copied: new Set(['full', 'compact', 'minimal', 'species']),
  ui_language: new Set(['en', 'es', 'pt', 'nl', 'pl']),
  poster_made: new Set(['a4', 'a3', 'a2', 'a1', 'a4-l', 'a3-l', 'a2-l', 'a1-l']),
  poster_downloaded: new Set(['png', 'pdf']),
  search_applied: new Set(['smart', 'bird']),
  filter_used: new Set(['place', 'continent', 'time', 'status', 'group', 'taxonomy']),
}

/** The day boundary: 2026-11-17T00:00Z. From this instant a row's day is the America/Vancouver date, which is 16 Nov until
 *  07:00Z (Vancouver is UTC-7 all year from 1 Nov 2026, tzdata 2026f) and 17 Nov from then on. Before it, the UTC date.
 *  The old Worker's rows from 00:00Z to the deploy carry 17 Nov: migrations/2026-11-17-pacific-relabel.sql moves them to
 *  16 Nov, and must run before 07:00Z. Change this only together with that migration and the README's "Day boundary". */
export const CUTOVER = Date.parse('2026-11-17T00:00:00Z')

const PACIFIC = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver', year: 'numeric', month: '2-digit', day: '2-digit' })

/** The America/Vancouver calendar date of an instant, YYYY-MM-DD. Intl applies the zone's rules, daylight saving included. */
export function pacificDay(now: Date): string {
  const p = Object.fromEntries(PACIFIC.formatToParts(now).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

/** The day a row is stored under (and the visitor id is keyed on): the UTC date before CUTOVER, the Pacific date from it on. */
export function statsDay(now: Date): string {
  return now.getTime() < CUTOVER ? now.toISOString().slice(0, 10) : pacificDay(now)
}

export type EventContext = { day: string; country: string; device: string; vid: string }
export type EventRow = EventContext & { name: string; value: string; lang: string }

/** A browser language's primary subtag as the app sends it: two or three lower-case letters ("es"), nothing else. */
const LANG = /^[a-z]{2,3}$/

/** The row for one body: `n`/`p` on the allow-list, and `lang` = the body's `l` on a visit only, else ''. */
export function eventRow(body: unknown, ctx: EventContext): EventRow | null {
  if (!body || typeof body !== 'object') return null
  const b = body as { n?: unknown; p?: unknown; l?: unknown }
  const n = typeof b.n === 'string' ? b.n : ''
  const p = typeof b.p === 'string' ? b.p : ''
  if (!Object.prototype.hasOwnProperty.call(ALLOWED, n) || !ALLOWED[n].has(p)) return null
  const lang = n === 'visit' && typeof b.l === 'string' && LANG.test(b.l) ? b.l : ''
  return { day: ctx.day, name: n, value: p, country: ctx.country, device: ctx.device, vid: ctx.vid, lang }
}

/** Events per anonymous visitor per day; beyond this they're dropped (spam guard). */
export const DAILY_CAP = 200

/** One read on the (day, vid) index, for the daily cap and the visit dedupe, in one round trip: how many rows this
 *  visitor has today (c), and how many of them are this same name and value (dup). Bind with seenBinds(row). */
export const SEEN_SQL = 'SELECT COUNT(*) AS c, SUM(name = ? AND value = ?) AS dup FROM events WHERE day = ? AND vid = ?'

export function seenBinds(row: EventRow): [string, string, string, string] {
  return [row.name, row.value, row.day, row.vid]
}

/** Whether to store the row, given SEEN_SQL's counts for its visitor and day: not over the cap, and a visit is stored
 *  once per visitor, page and day (a repeat of the same page is skipped). Every other event is stored as it comes. */
export function keepRow(row: EventRow, seen: { c: number | null; dup: number | null }): boolean {
  if ((seen.c ?? 0) >= DAILY_CAP) return false
  if (row.name === 'visit' && (seen.dup ?? 0) > 0) return false
  return true
}
