import type { Edits, ListEntry, Place, Rules, Source, SourceRecord } from './model'

const SOURCE_ORDER: Source[] = ['ebird', 'inat', 'manual']

/** YYYY -> YYYY-00-00, YYYY-MM -> YYYY-MM-00, so partial dates compare lexically. */
function padDate(d: string): string {
  if (d.length === 4) return `${d}-00-00`
  if (d.length === 7) return `${d}-00`
  return d
}

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Merge records, edits and rules into a list sorted by `taxonOrder` (by code when omitted).
 *
 * - Earliest padded date wins and supplies date + place. Undated records lose to dated ones.
 *   On equal dates the record with the most place detail wins (sub2 > sub1 > country > none: the full eBird export
 *   names the county, the quick life list download only the province), then the preferred source:
 *   ebird > inat > manual (then input order).
 * - `edits.added` records are treated as source 'manual'.
 * - `edits.removed` wins over everything, including `edits.added`. To re-add a removed
 *   species the UI must take its code out of `removed`.
 * - `assigned` is set only when every record was assigned by a region rule (any other record outranks the guess).
 * - `sources` lists the distinct contributing sources (after researchOnly), in ebird, inat, manual order.
 */
export function buildList(
  records: SourceRecord[],
  edits: Edits,
  rules: Rules,
  taxonOrder?: (code: string) => number,
): ListEntry[] {
  const all = [...records, ...edits.added.map((r): SourceRecord => ({ ...r, source: 'manual' }))]
  const removed = new Set(edits.removed)
  const groups = new Map<string, SourceRecord[]>()
  for (const r of all) {
    if (removed.has(r.code)) continue
    if (rules.researchOnly && r.research === false) continue
    const g = groups.get(r.code)
    if (g) g.push(r)
    else groups.set(r.code, [r])
  }

  const entries: ListEntry[] = []
  for (const [code, recs] of groups) {
    let best = recs[0]
    for (const r of recs.slice(1)) {
      if (beats(r, best)) best = r
    }
    const mark = edits.marks[code] ?? {}
    const entry: ListEntry = {
      code,
      date: best.date,
      place: best.place,
      heard: mark.heard ?? recs.every((r) => r.heard === true),
      dead: mark.dead ?? recs.every((r) => r.dead === true),
      media: mark.media ?? recs.some((r) => r.media === true),
      sources: SOURCE_ORDER.filter((s) => recs.some((r) => r.source === s)),
    }
    if (recs.every((r) => r.assigned)) entry.assigned = recs.some((r) => r.assigned === 'region') ? 'region' : 'default'
    if (rules.hideHeard && entry.heard) continue
    if (rules.hideDead && entry.dead) continue
    entries.push(entry)
  }

  return entries.sort(
    taxonOrder ? (a, b) => taxonOrder(a.code) - taxonOrder(b.code) || byString(a.code, b.code) : (a, b) => byString(a.code, b.code),
  )
}

/** True when `a` should replace the current winner `b`; strict, so input order breaks full ties. */
function beats(a: SourceRecord, b: SourceRecord): boolean {
  if (!a.date) return false
  if (!b.date) return true
  const da = padDate(a.date)
  const db = padDate(b.date)
  if (da !== db) return da < db
  const pa = detail(a.place), pb = detail(b.place)
  if (pa !== pb) return pa > pb
  return SOURCE_ORDER.indexOf(a.source) < SOURCE_ORDER.indexOf(b.source)
}

/** How precise a place is: 3 with a county (sub2), 2 with a state or province, 1 with a country, 0 without. */
function detail(p?: Place): number {
  return p?.sub2 ? 3 : p?.sub1 ? 2 : p?.country ? 1 : 0
}

/**
 * The entry with the latest (padded) date; ties go to the highest taxonOrder
 * (highest code string without it). Undated entries never win; if no entry has a date, undefined.
 */
export function latestLifer(list: ListEntry[], taxonOrder?: (code: string) => number): ListEntry | undefined {
  let best: ListEntry | undefined
  for (const e of list) {
    if (!e.date) continue
    if (!best) {
      best = e
      continue
    }
    const d = byString(padDate(e.date), padDate(best.date!))
    const t = taxonOrder ? taxonOrder(e.code) - taxonOrder(best.code) || byString(e.code, best.code) : byString(e.code, best.code)
    if (d > 0 || (d === 0 && t > 0)) best = e
  }
  return best
}
