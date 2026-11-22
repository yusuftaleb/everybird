// "Seen here": every place each species was seen (country, province or state, county), each with the earliest date
// there. It is kept beside the lifer, never instead of it: the lifer (first date and first place, ListEntry) still drives
// the collage, the cards, the latest lifer, share images and links. The Places filter and its chip counts use seen-here.
//
// Stored per source record as `seen: string[]`, each entry "date|region" or "date|region|county": region is the
// province's code ("CA-BC") or the country's ("KE"), date is as recorded (YYYY-MM-DD, or YYYY-MM / YYYY from older
// files), empty when unknown. Which sources carry it: MyEBirdData (every row) and iNaturalist (every observation).
// Records without it (the eBird life list download, ticks by hand, rows fixed by hand from older saves, lists saved
// before seen-here) count their lifer place as their only place.
//
// `seenMonths` is kept separately, one entry per place: "<months>|region[|county]", where <months> packs the place's
// months as one five-character chunk per year: the year as three base-36 digits (0000-9999, zero-padded) and a 12-bit
// month mask as two base-64 digits (0-9 A-Z a-z + /; bit 0 = January; a zero mask never appears), years ascending, no
// separators. About 30 bytes per place, a county key with pipes included. The earlier "YYYY-MM,…|region" shape still
// decodes; its dashes tell the two apart.
// Missing means an older or life-list-only source; [] means a full source had no dated, located sightings.
// buildSeen decodes the month sets once per list into `SeenEntry.months` (month ordinals per place, see sighting.ts),
// which basis "seen" (filters.ts) and the card's sighting inside the filter read. Only records that carry seenMonths
// feed it; a species none of whose records do has no `months` and falls back to its earliest dates and its lifer.
//
// Rules: a species removed by hand, or hidden by "hide heard only" / "hide found dead", has no places (it is not on the
// list). "Research grade only" drops the casual iNaturalist records as buildList does, record by record: a species keeps
// the places of every record that still counts (an iNaturalist record counts when any of its observations is research
// grade, as for the lifer).
import type { Edits, ListEntry, Place, Rules, SourceRecord } from './model'
import { keysOfPlace } from './place-keys'

export type SeenPlace = { country: string; sub1?: string; sub2?: string; date?: string }
/** One place's months of sightings: `key` "region[|county]", its place, its filter keys, month ordinals (year * 12 + month - 1) ascending. */
export type PlaceMonths = { key: string; place: SeenPlace; keys: readonly string[]; ords: readonly number[] }
/** `months`: every month seen at each place, from the records that carry seenMonths; undefined when none does. */
export type SeenEntry = { places: SeenPlace[]; keys: Set<string>; months?: PlaceMonths[] }
/**
 * Per species on the list: its places and their filter keys ("c:CA", "s:CA-BC", "k:CA-BC|Capital").
 * `full`: some record carries seen-here (else every place is a lifer place: the Places panel says so). `sig` changes
 * whenever any species' places do.
 */
export type SeenIndex = { byCode: Map<string, SeenEntry>; full: boolean; sig: string }

/** Whether any species on the list has month sets (MyEBirdData, iNaturalist, observation.org): without them the "seen any time" basis changes nothing. */
export function hasSeenMonths(seen: SeenIndex | undefined): boolean {
  if (seen) for (const e of seen.byCode.values()) if (e.months) return true
  return false
}

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

const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+/'
const CHUNK = 5
const YEAR_DIGITS = /^[0-9a-z]{3}$/
const MASK_DIGITS = /^[0-9A-Za-z+/]{2}$/
/** The packed months of one place: "<year base-36><mask base-64>" per year, years ascending. Empty when no months. */
function encodeMonthMasks(years: ReadonlyMap<number, number>): string {
  return [...years].filter(([, mask]) => mask)
    .sort(([a], [b]) => a - b)
    .map(([y, mask]) => y.toString(36).padStart(3, '0') + DIGITS[mask >> 6] + DIGITS[mask & 63])
    .join('')
}
/** Strict inverse of encodeMonthMasks: undefined for anything else (zero masks, unsorted years, bad digits). */
function decodeMonthMasks(s: string): string[] | undefined {
  if (!s.length || s.length % CHUNK) return undefined
  const out: string[] = []
  let prev = -1
  for (let at = 0; at < s.length; at += CHUNK) {
    const yc = s.slice(at, at + 3), mc = s.slice(at + 3, at + CHUNK)
    if (!YEAR_DIGITS.test(yc) || !MASK_DIGITS.test(mc)) return undefined
    const y = parseInt(yc, 36), mask = DIGITS.indexOf(mc[0]) * 64 + DIGITS.indexOf(mc[1])
    if (y > 9999 || y <= prev || mask === 0) return undefined
    prev = y
    for (let m = 1; m <= 12; m++) if (mask & (1 << (m - 1))) out.push(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`)
  }
  return out
}
/** The earlier shape, "YYYY-MM,YYYY-MM": still decoded, so nothing saved in it is lost. */
function decodeOldMonths(s: string): string[] | undefined {
  const months = s.split(',')
  return months.every((m) => MONTH.test(m)) ? months : undefined
}
/** Decode one month set. Counties may contain pipes; the first pipe alone separates the months from the place. */
export function decodeSeenMonths(s: string): { place: SeenPlace; months: string[] } | undefined {
  const at = s.indexOf('|')
  if (at < 0) return undefined
  const head = s.slice(0, at)
  // The earlier shape has dashes; the packed shape never does.
  const months = head.includes('-') ? decodeOldMonths(head) : decodeMonthMasks(head)
  const place = decodeSeen(s.slice(at))
  if (!months || !place) return undefined
  return { place, months }
}

/**
 * Accumulates seen-here per species while a file is read, one map entry per species and place (never the rows), and
 * writes it out in the stored encoding.
 */
export class SeenAgg {
  private by = new Map<string, Map<string, string>>()
  /** code -> place key -> year -> 12-bit month mask (bit 0 = January). */
  private monthsBy = new Map<string, Map<string, Map<number, number>>>()

  /** Add all observed months at one place, including when an upstream aggregate kept only its earliest date. */
  addMonths(code: string, key: string, months: Iterable<string>): void {
    for (const month of months) {
      if (!MONTH.test(month)) continue
      this.addMask(code, key, Number(month.slice(0, 4)), 1 << (Number(month.slice(5, 7)) - 1))
    }
  }

  private addMask(code: string, key: string, year: number, mask: number): void {
    let places = this.monthsBy.get(code)
    if (!places) this.monthsBy.set(code, (places = new Map()))
    let years = places.get(key)
    if (!years) places.set(key, (years = new Map()))
    years.set(year, (years.get(year) ?? 0) | mask)
  }

  /** `code`'s months per place as ascending month ordinals (year * 12 + month - 1), or undefined when it has none. */
  monthOrdinals(code: string): Map<string, number[]> | undefined {
    const places = this.monthsBy.get(code)
    if (!places?.size) return undefined
    const out = new Map<string, number[]>()
    for (const [key, years] of places) {
      const ords: number[] = []
      for (const y of [...years.keys()].sort((a, b) => a - b)) {
        const mask = years.get(y)!
        for (let m = 0; m < 12; m++) if (mask & (1 << m)) ords.push(y * 12 + m)
      }
      if (ords.length) out.set(key, ords)
    }
    return out.size ? out : undefined
  }

  /** Compact, deterministic per-place month sets (see the file comment); undefined means no month information. */
  getMonths(code: string): string[] | undefined {
    const places = this.monthsBy.get(code)
    if (!places?.size) return undefined
    return [...places].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, years]) => `${encodeMonthMasks(years)}|${key}`)
  }

  /** One sighting of `code` at `place` on `date`. Places without a country or province are ignored. */
  add(code: string, place: Place | undefined, date: string | undefined): void {
    const region = regionOf(place)
    if (!region) return
    this.addKey(code, place?.sub2 ? `${region}|${place.sub2}` : region, date ?? '')
  }

  /** `key` is "region" or "region|county" (already normalised). */
  addKey(code: string, key: string, date: string): void {
    this.addMonths(code, key, [date.slice(0, 7)])
    let m = this.by.get(code)
    if (!m) this.by.set(code, (m = new Map()))
    const prev = m.get(key)
    if (prev === undefined || earlier(date, prev)) m.set(key, date)
  }

  /** Fold `from`'s places for `fromCode` into this aggregate's `code`. */
  merge(code: string, from: SeenAgg, fromCode: string): void {
    const m = from.by.get(fromCode)
    if (m) for (const [k, d] of m) this.addKey(code, k, d)
    for (const [k, years] of from.monthsBy.get(fromCode) ?? []) for (const [y, mask] of years) this.addMask(code, k, y, mask)
  }

  /** `code`'s places ("region" or "region|county") and their earliest dates, or undefined when it has none. */
  places(code: string): ReadonlyMap<string, string> | undefined {
    return this.by.get(code)
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

/** The filter keys of a set of places, at every level each has ("c:CA", "s:CA-BC", "k:CA-BC|Capital"; place-keys.ts). */
export function placeKeys(places: readonly SeenPlace[]): Set<string> {
  const out = new Set<string>()
  for (const p of places) for (const k of keysOfPlace(p)) out.add(k)
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

const FNV_SEED = 2166136261
/** Each species' entry's hash (its code, places, dates and months), for seenSig. */
const entryHash = new WeakMap<SeenEntry, number>()
/** FNV-1a over a string, as 8 hex digits. */
function hash(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** A place key's decoded place (no date) and its filter keys, or null when it names no place. */
type KnownPlace = { place: SeenPlace; keys: string[] } | null
// Shared by every buildSeen: a list's places repeat across species and across rebuilds, so each "region[|county]" is
// decoded and its filter keys made once (the same strings for every species there). Bounded: cleared when it grows big.
const known = new Map<string, KnownPlace>()
const KNOWN_MAX = 100_000
function knownPlace(key: string): KnownPlace {
  let hit = known.get(key)
  if (hit === undefined) {
    if (known.size >= KNOWN_MAX) known.clear()
    const place = decodeSeen(`|${key}`)
    hit = place ? { place, keys: keysOfPlace(place) } : null
    known.set(key, hit)
  }
  return hit
}

/**
 * Seen-here for the species on `list` (buildList's output for the same records, edits and rules): every counting
 * record's places, merged per place with the earliest date. See the file comment for the rules.
 */
export function buildSeen(records: SourceRecord[], edits: Edits, rules: Rules, list: ListEntry[]): SeenIndex {
  const onList = new Set(list.map((e) => e.code))
  const agg = new SeenAgg()
  // Months come only from records that carry seenMonths (agg's own months are just each place's earliest date).
  const mon = new SeenAgg()
  let full = false
  const add = (r: SourceRecord) => {
    if (!onList.has(r.code)) return
    if (rules.researchOnly && r.research === false) return
    if (Array.isArray(r.seenMonths)) {
      for (const s of r.seenMonths) {
        const d = decodeSeenMonths(s)
        if (!d) continue
        mon.addMonths(r.code, d.place.sub2 ? `${d.place.sub1 ?? d.place.country}|${d.place.sub2}` : (d.place.sub1 ?? d.place.country), d.months)
      }
    }
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
  for (const e of list) {
    const entries = agg.places(e.code)
    if (!entries) continue
    const places: SeenPlace[] = []
    const keys = new Set<string>()
    let h = hash(FNV_SEED, e.code)
    let first = true
    for (const [k, d] of entries) {
      // The species' hash covers its stored entries "date|key" joined by commas (without building them).
      if (!first) h = hash(h, ',')
      first = false
      h = hash(hash(hash(h, d), '|'), k)
      const at = knownPlace(k)
      if (!at) continue
      places.push(d ? { ...at.place, date: d } : { ...at.place })
      for (const key of at.keys) keys.add(key)
    }
    const ords = mon.monthOrdinals(e.code)
    let months: PlaceMonths[] | undefined
    if (ords) {
      months = []
      for (const [k, o] of ords) {
        h = hash(hash(h, '#'), k)
        for (const n of o) h = Math.imul(h ^ n, 16777619) >>> 0
        const at = knownPlace(k)
        if (at) months.push({ key: k, place: at.place, keys: at.keys, ords: o })
      }
      if (!months.length) months = undefined
    }
    const entry: SeenEntry = months ? { places, keys, months } : { places, keys }
    entryHash.set(entry, h)
    byCode.set(e.code, entry)
  }
  return { byCode, full, sig: seenSig(list, byCode) }
}

/** `SeenIndex.sig` for `byCode` (built by buildSeen, in `list`'s order): each species' own hash, chained in list
 *  order. The store's card actions (store.ts) rebuild it after patching a few species, without decoding anything. */
export function seenSig(list: readonly ListEntry[], byCode: ReadonlyMap<string, SeenEntry>): string {
  let h = FNV_SEED
  for (const e of list) {
    const entry = byCode.get(e.code)
    if (entry) h = Math.imul(h ^ (entryHash.get(entry) ?? 0), 16777619) >>> 0
  }
  return `${byCode.size}:${h.toString(16)}`
}
