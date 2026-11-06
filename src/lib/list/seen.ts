// "Seen here": every place each species was seen (country, province or state, county), each with the earliest date
// there. It is kept beside the lifer, never instead of it: the lifer (first date and first place, ListEntry) still drives
// the collage, the cards, the latest lifer, share images and links. The Places filter, its chip counts and the map use
// seen-here.
//
// Stored per source record as `seen: string[]`, each entry "date|region" or "date|region|county": region is the
// province's code ("CA-BC") or the country's ("KE"), date is as recorded (YYYY-MM-DD, or YYYY-MM / YYYY from older
// files), empty when unknown. Which sources carry it: MyEBirdData (every row) and iNaturalist (every observation).
// Records without it (the eBird life list download, ticks by hand, rows fixed by hand from older saves, lists saved
// before seen-here) count their lifer place as their only place.
//
// Rules: a species removed by hand, or hidden by "hide heard only" / "hide found dead", has no places (it is not on the
// list). "Research grade only" drops the casual iNaturalist records as buildList does, record by record: a species keeps
// the places of every record that still counts (an iNaturalist record counts when any of its observations is research
// grade, as for the lifer).
import type { Edits, ListEntry, Place, Rules, SourceRecord } from './model'

export type SeenPlace = { country: string; sub1?: string; sub2?: string; date?: string }
export type SeenEntry = { places: SeenPlace[]; keys: Set<string> }
/**
 * Per species on the list: its places and their filter keys ("c:CA").
 * `full`: some record carries seen-here (else every place is a lifer place: the Places panel says so). `sig` changes
 * whenever any species' places do.
 */
export type SeenIndex = { byCode: Map<string, SeenEntry>; full: boolean; sig: string }

/** YYYY -> YYYY-00-00, YYYY-MM -> YYYY-MM-00, so partial dates compare lexically. */
const pad = (d: string) => (d.length === 4 ? `${d}-00-00` : d.length === 7 ? `${d}-00` : d)
/** True when date `a` should replace `b` as the earliest there: dated beats undated, then earlier wins. */
const earlier = (a: string, b: string) => !!a && (!b || pad(a) < pad(b))

/** The region part of a place: its province code, else its country (from the province prefix when missing). */
function regionOf(p: Place | undefined): string | undefined {
  if (!p) return undefined
  if (p.sub1) return p.sub1
  return p.country || undefined
}

/** "date|region[|county]", or undefined for a place without a country or province. */
export function encodeSeen(p: Place | undefined, date: string | undefined): string | undefined {
  const region = regionOf(p)
  if (!region) return undefined
  return `${date ?? ''}|${region}${p?.sub2 ? `|${p.sub2}` : ''}`
}

/** The place an entry names; undefined for anything malformed. */
export function decodeSeen(s: string): SeenPlace | undefined {
  const a = s.indexOf('|')
  if (a < 0) return undefined
  const b = s.indexOf('|', a + 1)
  const region = b < 0 ? s.slice(a + 1) : s.slice(a + 1, b)
  if (!region) return undefined
  const dash = region.indexOf('-')
  const country = dash < 0 ? region : region.slice(0, dash)
  if (!country) return undefined
  const out: SeenPlace = { country }
  if (dash >= 0) out.sub1 = region
  if (b >= 0 && b + 1 < s.length) out.sub2 = s.slice(b + 1)
  if (a > 0) out.date = s.slice(0, a)
  return out
}

/**
 * Accumulates seen-here per species while a file is read, one map entry per species and place (never the rows), and
 * writes it out in the stored encoding.
 */
export class SeenAgg {
  private by = new Map<string, Map<string, string>>()

  /** One sighting of `code` at `place` on `date`. Places without a country or province are ignored. */
  add(code: string, place: Place | undefined, date: string | undefined): void {
    const region = regionOf(place)
    if (!region) return
    this.addKey(code, place?.sub2 ? `${region}|${place.sub2}` : region, date ?? '')
  }

  /** `key` is "region" or "region|county" (already normalised). */
  addKey(code: string, key: string, date: string): void {
    let m = this.by.get(code)
    if (!m) this.by.set(code, (m = new Map()))
    const prev = m.get(key)
    if (prev === undefined || earlier(date, prev)) m.set(key, date)
  }

  /** Fold `from`'s places for `fromCode` into this aggregate's `code`. */
  merge(code: string, from: SeenAgg, fromCode: string): void {
    const m = from.by.get(fromCode)
    if (m) for (const [k, d] of m) this.addKey(code, k, d)
  }

  /** The stored entries for `code`, or undefined when it has none. */
  get(code: string): string[] | undefined {
    const m = this.by.get(code)
    if (!m) return undefined
    const out: string[] = []
    for (const [k, d] of m) out.push(`${d}|${k}`)
    return out
  }
}

/** The filter keys of a set of places: its countries ("c:CA"; the filter goes no deeper than countries). */
export function placeKeys(places: readonly SeenPlace[]): Set<string> {
  const out = new Set<string>()
  for (const p of places) out.add(`c:${p.country}`)
  return out
}

/** The lifer place as a seen place (no index, or a species the index doesn't hold). */
function liferPlaces(e: ListEntry): SeenPlace[] {
  const p = e.place
  const country = p?.country || p?.sub1?.split('-')[0]
  if (!country) return []
  const out: SeenPlace = { country }
  if (p?.sub1) out.sub1 = p.sub1
  if (p?.sub2) out.sub2 = p.sub2
  if (e.date) out.date = e.date
  return [out]
}

/** Where an entry was seen: from the index, else its lifer place. */
export function seenOf(seen: SeenIndex | undefined, e: ListEntry): SeenPlace[] {
  return seen?.byCode.get(e.code)?.places ?? liferPlaces(e)
}

const liferKeys = new WeakMap<ListEntry, Set<string>>()
/** The filter keys of an entry's places (cached per entry for lifer places). */
export function keysOf(seen: SeenIndex | undefined, e: ListEntry): Set<string> {
  const hit = seen?.byCode.get(e.code)
  if (hit) return hit.keys
  let k = liferKeys.get(e)
  if (!k) liferKeys.set(e, (k = placeKeys(liferPlaces(e))))
  return k
}

/** FNV-1a over a string, as 8 hex digits. */
function hash(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * Seen-here for the species on `list` (buildList's output for the same records, edits and rules): every counting
 * record's places, merged per place with the earliest date. See the file comment for the rules.
 */
export function buildSeen(records: SourceRecord[], edits: Edits, rules: Rules, list: ListEntry[]): SeenIndex {
  const onList = new Set(list.map((e) => e.code))
  const agg = new SeenAgg()
  let full = false
  const add = (r: SourceRecord) => {
    if (!onList.has(r.code)) return
    if (rules.researchOnly && r.research === false) return
    if (Array.isArray(r.seen)) {
      full = true
      for (const s of r.seen) {
        const a = s.indexOf('|')
        if (a >= 0 && a + 1 < s.length) agg.addKey(r.code, s.slice(a + 1), s.slice(0, a))
      }
    } else {
      agg.add(r.code, r.place, r.date)
    }
  }
  for (const r of records) add(r)
  for (const r of edits.added) add({ ...r, source: 'manual', seen: undefined })

  const byCode = new Map<string, SeenEntry>()
  let h = 2166136261
  for (const e of list) {
    const entries = agg.get(e.code)
    if (!entries) continue
    const places: SeenPlace[] = []
    for (const s of entries) {
      const p = decodeSeen(s)
      if (p) places.push(p)
    }
    byCode.set(e.code, { places, keys: placeKeys(places) })
    h = hash(hash(h, e.code), entries.join(','))
  }
  return { byCode, full, sig: `${byCode.size}:${h.toString(16)}` }
}
