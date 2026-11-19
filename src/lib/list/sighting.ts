// Where and when a species was seen inside a filter, from the month sets (seen.ts `SeenEntry.months`, decoded once per
// list by buildSeen). Two users: the filter's matcher, for basis "seen" ("seen at one of these places in this period":
// filters.ts), and the card and tooltip, which show the first sighting inside a Places or Time filter instead of the
// lifer ("Canada · Mar 2023" for a Merlin first seen in Egypt in 2019; `sightingIn`, month precision).
// A sighting counts when ANY of three kinds of evidence is inside the filter's places and period: a month set (seen.ts
// `months`, from sources that keep them), a seen-here place's earliest date (`SeenEntry.places`, which every source
// has), or the lifer's own date and place. So a species with months from one source and only a life-list lifer from
// another counts for both. Month sets are sorted ordinals, so a range is one binary search per place; the dates are
// compared with `inRange` (a year-only date matches when its year overlaps).
import type { Filter } from './filters'
import { inRange } from './in-range'
import type { ListEntry, Place } from './model'
import { keysOfPlace } from './place-keys'
import { seenOf, type PlaceMonths, type SeenIndex, type SeenPlace } from './seen'

/** A month ('YYYY-MM') as an ordinal, year * 12 + month - 1. */
export const monthOrd = (m: string): number => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1
const monthOfOrd = (o: number): string => `${String(Math.floor(o / 12)).padStart(4, '0')}-${String((o % 12) + 1).padStart(2, '0')}`

/** What a sighting must satisfy: in any of `keys` (place keys of any level, continents `n:AF` included), and in lo..hi (month ordinals, either end open). No keys: anywhere. */
export type Where = { keys: readonly string[]; lo: number; hi: number; from?: string; to?: string }

export function makeWhere(keys: readonly string[] | undefined, from?: string, to?: string): Where {
  return { keys: keys ?? [], lo: from ? monthOrd(from) : -Infinity, hi: to ? monthOrd(to) : Infinity, from, to }
}

/** The filter's places and range as a Where; undefined when it has neither (nothing to find a sighting in). */
export function whereOf(f: Filter): Where | undefined {
  const keys = [
    ...(f.continents ?? []).map((n) => `n:${n}`),
    ...(f.regions ?? []).map((r) => `r:${r}`),
    ...(f.countries ?? []).map((c) => `c:${c}`),
    ...(f.provinces ?? []).map((s) => `s:${s}`),
    ...(f.counties ?? []).map((k) => `k:${k}`),
  ]
  if (!keys.length && !f.from && !f.to) return undefined
  return makeWhere(keys, f.from, f.to)
}

function placeHit(pm: PlaceMonths, w: Where): boolean {
  if (!w.keys.length) return true
  for (const k of pm.keys) if (w.keys.includes(k)) return true
  return false
}

/** The first ordinal of `ords` (ascending) inside lo..hi, or undefined. */
function firstIn(ords: readonly number[], lo: number, hi: number): number | undefined {
  let a = 0, b = ords.length
  while (a < b) {
    const mid = (a + b) >> 1
    if (ords[mid] < lo) a = mid + 1
    else b = mid
  }
  return a < ords.length && ords[a] <= hi ? ords[a] : undefined
}

/** Whether some place satisfying `w` has a month in its range. */
export function seenWhere(months: readonly PlaceMonths[], w: Where): boolean {
  for (const pm of months) if (placeHit(pm, w) && firstIn(pm.ords, w.lo, w.hi) !== undefined) return true
  return false
}

/** The keys ("region[|county]") of the places with a month in `w`'s range (anywhere in `w` when it names none). */
export function keysSeenIn(months: readonly PlaceMonths[], w: Where): Set<string> {
  const out = new Set<string>()
  for (const pm of months) if (placeHit(pm, w) && firstIn(pm.ords, w.lo, w.hi) !== undefined) out.add(pm.key)
  return out
}

export type Sighting = { date: string; place: Place }

/** One sighting that may satisfy a Where: its date (YYYY, YYYY-MM or YYYY-MM-DD; absent when unknown), place and "region[|county]" key. */
type Candidate = { date?: string; place: SeenPlace; key: string }

const keyOf = (p: SeenPlace): string => (p.sub2 ? `${p.sub1 ?? p.country}|${p.sub2}` : (p.sub1 ?? p.country))

function placeOk(p: SeenPlace, w: Where): boolean {
  if (!w.keys.length) return true
  for (const k of keysOfPlace(p)) if (w.keys.includes(k)) return true
  return false
}

/**
 * Every sighting of `e` inside `w` (places and period together), by the three kinds of evidence in the file comment,
 * handed to `fn`; `fn` returning true stops. Month sets first (cheapest), then the places' earliest dates, then the lifer.
 * `seenOf` falls back to the lifer place for a species the index doesn't hold, so that case is one candidate.
 */
function eachSighting(e: ListEntry, seen: SeenIndex | undefined, w: Where, fn: (c: Candidate) => boolean | void): void {
  for (const pm of seen?.byCode.get(e.code)?.months ?? []) {
    if (!placeHit(pm, w)) continue
    const o = firstIn(pm.ords, w.lo, w.hi)
    if (o !== undefined && fn({ date: monthOfOrd(o), place: pm.place, key: pm.key })) return
  }
  for (const p of seenOf(seen, e)) {
    if (placeOk(p, w) && inRange(p.date, w.from, w.to) && fn({ date: p.date, place: p, key: keyOf(p) })) return
  }
  // The lifer: normally one of the places above (its earliest date there), but not when the index lacks its place.
  for (const p of seenOf(undefined, e)) {
    if (placeOk(p, w) && inRange(p.date, w.from, w.to) && fn({ date: p.date, place: p, key: keyOf(p) })) return
  }
}

/** Whether `e` has a sighting inside `w`: a month set, a place's earliest date or the lifer matches. */
export function seenAt(e: ListEntry, seen: SeenIndex | undefined, w: Where): boolean {
  let hit = false
  eachSighting(e, seen, w, () => (hit = true))
  return hit
}

/** The keys ("region[|county]") of the places where `e` has a sighting inside `w`. */
export function sightingKeys(e: ListEntry, seen: SeenIndex | undefined, w: Where): Set<string> {
  const out = new Set<string>()
  eachSighting(e, seen, w, (c) => { out.add(c.key) })
  return out
}

/** YYYY -> YYYY-00-00, YYYY-MM -> YYYY-MM-00, so partial dates compare lexically. */
const padDate = (d: string) => (d.length === 4 ? `${d}-00-00` : d.length === 7 ? `${d}-00` : d)

/**
 * The earliest sighting of `e` inside `w` (a dated one): its date and place. The first of equal months wins, a full
 * date (the lifer's) over a bare month. Month results are 'YYYY-MM'; a place's or the lifer's date is as recorded.
 */
export function firstSighting(e: ListEntry, seen: SeenIndex | undefined, w: Where): Sighting | undefined {
  let best: Candidate | undefined
  eachSighting(e, seen, w, (c) => {
    if (!c.date) return
    const b = best?.date
    if (!b || padDate(c.date).slice(0, 7) < padDate(b).slice(0, 7) || (padDate(c.date).slice(0, 7) === padDate(b).slice(0, 7) && c.date.length > b.length)) best = c
  })
  if (!best?.date) return undefined
  const { country, sub1, sub2 } = best.place
  return { date: best.date, place: { country, ...(sub1 ? { sub1 } : {}), ...(sub2 ? { sub2 } : {}) } }
}

/**
 * The first sighting of `entry` inside the filter's Places and Time (either basis): its date and place. Undefined
 * with no place or time in the filter, or when nothing inside the filter has a date: the lifer's date and place then
 * stand, as without a filter. The lifer's own full date shows when the lifer is the first sighting inside the filter.
 */
export function sightingIn(entry: ListEntry, filter: Filter, seen?: SeenIndex): Sighting | undefined {
  const w = whereOf(filter)
  return w ? firstSighting(entry, seen, w) : undefined
}

/** `entry` with its date and place those of its first sighting inside the filter (else the entry itself). */
export function entryInFilter(entry: ListEntry, filter: Filter | undefined, seen?: SeenIndex): ListEntry {
  const s = filter && sightingIn(entry, filter, seen)
  if (!s) return entry
  const p = entry.place
  // The lifer itself is the first sighting inside the filter: nothing to change.
  if (s.date === entry.date && p && p.country === s.place.country && p.sub1 === s.place.sub1 && p.sub2 === s.place.sub2) return entry
  return { ...entry, date: s.date, place: s.place }
}

/**
 * Month ordinals (ascending) of every sighting of `e` inside `w`'s places, ignoring its period: what a Time drag
 * previews against (`ordsIn`). Month sets give their months; a place's or the lifer's date gives its month, a year-only
 * date all twelve (the way `inRange` overlaps it).
 */
export function candidateOrds(e: ListEntry, seen: SeenIndex | undefined, w: Where): number[] {
  const open: Where = { ...w, lo: -Infinity, hi: Infinity, from: undefined, to: undefined }
  const set = new Set<number>()
  for (const pm of seen?.byCode.get(e.code)?.months ?? []) if (placeHit(pm, open)) for (const o of pm.ords) set.add(o)
  const dated = (d: string | undefined) => {
    const m = d && /^(\d{4})(?:-(\d{2}))?/.exec(d)
    if (!m) return
    if (m[2]) set.add(monthOrd(`${m[1]}-${m[2]}`))
    else for (let i = 1; i <= 12; i++) set.add(monthOrd(`${m[1]}-${String(i).padStart(2, '0')}`))
  }
  for (const p of [...seenOf(seen, e), ...seenOf(undefined, e)]) if (placeOk(p, open)) dated(p.date)
  return [...set].sort((a, b) => a - b)
}

/** Whether ascending month ordinals have one inside from..to (YYYY-MM, either open). */
export function ordsIn(ords: readonly number[], from?: string, to?: string): boolean {
  return firstIn(ords, from ? monthOrd(from) : -Infinity, to ? monthOrd(to) : Infinity) !== undefined
}
