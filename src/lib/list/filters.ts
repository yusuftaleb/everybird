import type { SpeciesIndex } from '@/lib/species/load'
import { orderLabel } from '@/lib/species/orders'
import type { ListEntry } from './model'
import { keysOf, seenOf, type SeenIndex } from './seen'
import type { Trip } from './trips'

/**
 * The active filters. Time: `from`/`to` are a range of months (YYYY-MM, inclusive, either end open; see timeline.ts).
 * `year` still filters (old state, search picks), but the store turns it into the range Jan..Dec of that year.
 * A trip is its own species set; choosing one also sets the range to its months.
 * Places: `countries` (ISO2 codes, sorted, never empty when set) keeps the species SEEN in ANY of them (seen.ts), not
 * only the lifers there, when the functions below get the seen-here index; without it (a shared link) the lifer places
 * stand in. Countries only: provinces and counties stay in the data and the place labels, not in the filter. Time and
 * trips stay about lifers: countries and a range together keep the species seen there whose lifer falls in the range.
 */
export type Filter = { order?: string; family?: string; countries?: string[]; year?: string; from?: string; to?: string; trip?: string }
export type ChipOption = { value: string; label: string; count: number }
/** `country`: the countries' options (the filter holds a set, `countries`). */
export type FilterLevel = 'order' | 'family' | 'country' | 'year' | 'trip'
/** The range (`from`/`to`) as one dimension, for skipping it when counting. */
type Dim = FilterLevel | 'range'
type Level = FilterLevel

const yearOf = (e: ListEntry) => (e.date && /^\d{4}/.test(e.date) ? e.date.slice(0, 4) : undefined)

/**
 * Whether an entry's date falls in the range from..to (YYYY-MM, inclusive, either open). A month or full date is
 * compared by its month; a year-only date matches when its year overlaps the range. Undated entries never match.
 */
export function inRange(date: string | undefined, from: string | undefined, to: string | undefined): boolean {
  if (!from && !to) return true
  const m = date && /^(\d{4})(?:-(\d{2}))?/.exec(date)
  if (!m) return false
  const lo = m[2] ? `${m[1]}-${m[2]}` : `${m[1]}-01`
  const hi = m[2] ? lo : `${m[1]}-12`
  return (!from || hi >= from) && (!to || lo <= to)
}
/**
 * Stable key, e.g. "o:Passeriformes|f:Corvidae|c:CA,EG|y:2026|r:2026-03~2026-09|t:EG-2026-09-01"; empty values are omitted
 * (so filters without a range keep the keys they always had).
 */
export function filterKey(f: Filter): string {
  const parts: string[] = []
  if (f.order) parts.push(`o:${f.order}`)
  if (f.family) parts.push(`f:${f.family}`)
  if (f.countries?.length) parts.push(`c:${[...f.countries].sort().join(',')}`)
  if (f.year) parts.push(`y:${f.year}`)
  if (f.from || f.to) parts.push(`r:${f.from ?? ''}~${f.to ?? ''}`)
  if (f.trip) parts.push(`t:${f.trip}`)
  return parts.join('|')
}

/**
 * Build one O(1)-per-entry predicate for the filter, ignoring the dimensions in `skip`.
 * Drill-down: a family outside the chosen order, or a trip outside the chosen year or range, matches nothing.
 * A child set without its parent is applied on its own (the store drops such state).
 */
function matcher(f: Filter, species: SpeciesIndex, trips: Trip[], skip: ReadonlySet<Dim>, seen?: SeenIndex) {
  const order = skip.has('order') ? undefined : f.order
  const family = skip.has('family') ? undefined : f.family
  // Seen in any of the chosen countries.
  const places = !skip.has('country') && f.countries?.length ? f.countries.map((c) => `c:${c}`) : undefined
  const year = skip.has('year') ? undefined : f.year
  const tripId = skip.has('trip') ? undefined : f.trip
  const from = skip.has('range') ? undefined : f.from
  const to = skip.has('range') ? undefined : f.to
  let tripCodes: Set<string> | undefined
  let impossible = false
  if (tripId) {
    const t = trips.find((x) => x.id === tripId)
    if (!t || (year && t.start.slice(0, 4) !== year) || !inRange(t.start.slice(0, 7), from, to)) impossible = true
    else tripCodes = new Set(t.codes)
  }
  return (e: ListEntry): boolean => {
    if (impossible) return false
    if (order || family) {
      const row = species.byCode.get(e.code)
      if (!row) return false
      if (order && row.ord !== order) return false
      if (family && row.fam !== family) return false
    }
    if (places) {
      const keys = keysOf(seen, e)
      if (!places.some((k) => keys.has(k))) return false
    }
    if (year && yearOf(e) !== year) return false
    if ((from || to) && !inRange(e.date, from, to)) return false
    if (tripCodes && !tripCodes.has(e.code)) return false
    return true
  }
}

/** `seen`: the seen-here index (the Places filter keeps species seen there); without it, lifer places. */
export function applyFilter(list: ListEntry[], f: Filter, species: SpeciesIndex, trips: Trip[], seen?: SeenIndex): ListEntry[] {
  const m = matcher(f, species, trips, new Set(), seen)
  return list.filter(m)
}

const SKIP: Record<Level, Dim[]> = {
  order: ['order', 'family'], // a family implies its order
  family: ['family'],
  country: ['country'], // countries are counted whatever is checked (a multi-select)
  year: ['year', 'range'], // years are counted over the whole span
  trip: ['trip'],
}

/**
 * Chips for one level, counted under the OTHER active dimensions (family also under the active order,
 * trip under the active year). Only options with count > 0.
 * Order: order/family by taxonomic position of their first species, country by count desc then label,
 * year descending, trip by start date. `trip` options are empty until a year is chosen (drill-down).
 * Legacy: the 'year' and 'trip' levels are no longer shown as chips (the Time panel is the timeline, which lays out
 * every trip itself); they are kept for callers and tests of the old drill-down.
 * Countries count species SEEN in each (each species once per country), whatever countries are checked, sorted by
 * count, then label. `name` labels countries by code (default: the code). `seen`: the seen-here index (else lifer
 * places).
 */
export function options(
  list: ListEntry[],
  f: Filter,
  level: Level,
  species: SpeciesIndex,
  trips: Trip[],
  name: (code: string) => string = (code) => code,
  seen?: SeenIndex,
): ChipOption[] {
  if (level === 'family' && !f.order) return []
  if (level === 'trip' && !f.year) return []
  const m = matcher(f, species, trips, new Set(SKIP[level]), seen)
  const counts = new Map<string, number>()
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1)

  if (level === 'trip') {
    const byCode = new Map<string, Trip[]>()
    for (const t of trips) {
      if (t.start.slice(0, 4) !== f.year) continue
      for (const c of t.codes) {
        const a = byCode.get(c)
        if (a) a.push(t)
        else byCode.set(c, [t])
      }
    }
    const tripCount = new Map<string, number>()
    for (const e of list) {
      const ts = byCode.get(e.code)
      if (ts && m(e)) for (const t of ts) tripCount.set(t.id, (tripCount.get(t.id) ?? 0) + 1)
    }
    return trips
      .filter((t) => tripCount.has(t.id))
      .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id < b.id ? -1 : 1))
      .map((t) => ({ value: t.id, label: t.label, count: tripCount.get(t.id)! }))
  }

  const firstTo = new Map<string, number>()
  const famLabel = new Map<string, string>()
  for (const e of list) {
    if (!m(e)) continue
    if (level === 'order' || level === 'family') {
      const row = species.byCode.get(e.code)
      if (!row) continue
      const key = level === 'order' ? row.ord : row.fam
      bump(key)
      if (!firstTo.has(key) || row.to < firstTo.get(key)!) firstTo.set(key, row.to)
      if (level === 'family') famLabel.set(key, row.famCom)
    } else if (level === 'country') {
      const here = new Set<string>()
      for (const p of seenOf(seen, e)) here.add(p.country)
      for (const k of here) bump(k)
    } else {
      const y = yearOf(e)
      if (y) bump(y)
    }
  }

  const label = (v: string) =>
    level === 'order' ? orderLabel(v) : level === 'family' ? famLabel.get(v) || v : level === 'country' ? name(v) : v
  const out = [...counts].map(([value, count]) => ({ value, label: label(value), count }))
  if (level === 'order' || level === 'family') out.sort((a, b) => firstTo.get(a.value)! - firstTo.get(b.value)!)
  else if (level === 'country') out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  else out.sort((a, b) => (a.value < b.value ? 1 : -1))
  return out
}

/**
 * The filter that shows `e` (a search pick outside the current view): every dimension that already includes the bird
 * stays; the ones that exclude it go (another order clears the family too; another year or a range that leaves it out
 * clears the trip too).
 */
export function filterToShow(f: Filter, e: ListEntry, species: SpeciesIndex, trips: Trip[], seen?: SeenIndex): Filter {
  const row = species.byCode.get(e.code)
  const next: Filter = { ...f }
  if (next.order && row?.ord !== next.order) { delete next.order; delete next.family }
  if (next.family && row?.fam !== next.family) delete next.family
  const keys = keysOf(seen, e)
  if (next.countries && !next.countries.some((c) => keys.has(`c:${c}`))) delete next.countries
  if (next.year && yearOf(e) !== next.year) { delete next.year; delete next.trip }
  if ((next.from || next.to) && !inRange(e.date, next.from, next.to)) { delete next.from; delete next.to; delete next.trip }
  if (next.trip && !trips.find((t) => t.id === next.trip)?.codes.includes(e.code)) delete next.trip
  for (const k of Object.keys(next) as (keyof Filter)[]) if (!next[k]) delete next[k]
  return next
}

/**
 * Drill into an order or family from a search pick: within the current place and time filters, or with them cleared
 * when they would leave the group empty.
 */
export function drillTo(f: Filter, group: { order: string; family?: string }, list: ListEntry[], species: SpeciesIndex, trips: Trip[], seen?: SeenIndex): Filter {
  const next: Filter = { ...f, order: group.order }
  if (group.family) next.family = group.family
  else delete next.family
  return applyFilter(list, next, species, trips, seen).length ? next : { ...group }
}

/** The filter with `iso` checked or unchecked in its countries (kept sorted; none left drops the dimension). */
export function toggleCountry(f: Filter, iso: string): Filter {
  const set = new Set(f.countries ?? [])
  if (set.has(iso)) set.delete(iso)
  else set.add(iso)
  return withCountries(f, [...set])
}

/** The filter with exactly these countries (sorted, deduplicated; an empty list drops the dimension). */
export function withCountries(f: Filter, countries: readonly string[]): Filter {
  const next: Filter = { ...f }
  const sorted = [...new Set(countries)].filter(Boolean).sort()
  if (sorted.length) next.countries = sorted
  else delete next.countries
  return next
}
