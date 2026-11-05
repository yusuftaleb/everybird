import type { SpeciesIndex } from '@/lib/species/load'
import { orderLabel } from '@/lib/species/orders'
import type { ListEntry } from './model'
import { entryCountry, type Trip } from './trips'

export type Filter = { order?: string; family?: string; country?: string; year?: string; trip?: string }
export type ChipOption = { value: string; label: string; count: number }
type Level = 'order' | 'family' | 'country' | 'year' | 'trip'

const yearOf = (e: ListEntry) => (e.date && /^\d{4}/.test(e.date) ? e.date.slice(0, 4) : undefined)

/** Stable key, e.g. "o:Passeriformes|f:Corvidae|c:EG|y:2026|t:EG-2026-09-01"; empty values are omitted. */
export function filterKey(f: Filter): string {
  const parts: string[] = []
  if (f.order) parts.push(`o:${f.order}`)
  if (f.family) parts.push(`f:${f.family}`)
  if (f.country) parts.push(`c:${f.country}`)
  if (f.year) parts.push(`y:${f.year}`)
  if (f.trip) parts.push(`t:${f.trip}`)
  return parts.join('|')
}

/**
 * Build one O(1)-per-entry predicate for the filter, ignoring the dimensions in `skip`.
 * Drill-down: a family outside the chosen order, or a trip outside the chosen year, matches nothing.
 * A child set without its parent is applied on its own (the store drops such state).
 */
function matcher(f: Filter, species: SpeciesIndex, trips: Trip[], skip: ReadonlySet<Level>) {
  const order = skip.has('order') ? undefined : f.order
  const family = skip.has('family') ? undefined : f.family
  const country = skip.has('country') ? undefined : f.country
  const year = skip.has('year') ? undefined : f.year
  const tripId = skip.has('trip') ? undefined : f.trip
  let tripCodes: Set<string> | undefined
  let impossible = false
  if (tripId) {
    const t = trips.find((x) => x.id === tripId)
    if (!t || (year && t.start.slice(0, 4) !== year)) impossible = true
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
    if (country && entryCountry(e) !== country) return false
    if (year && yearOf(e) !== year) return false
    if (tripCodes && !tripCodes.has(e.code)) return false
    return true
  }
}

export function applyFilter(list: ListEntry[], f: Filter, species: SpeciesIndex, trips: Trip[]): ListEntry[] {
  const m = matcher(f, species, trips, new Set())
  return list.filter(m)
}

const SKIP: Record<Level, Level[]> = {
  order: ['order', 'family'], // a family implies its order
  family: ['family'],
  country: ['country'],
  year: ['year'],
  trip: ['trip'],
}

/**
 * Chips for one level, counted under the OTHER active dimensions (family also under the active order,
 * trip under the active year). Only options with count > 0.
 * Order: order/family by taxonomic position of their first species, country by count desc then label,
 * year descending, trip by start date. `trip` options are empty until a year is chosen (drill-down).
 * `countryName` labels countries (default: the ISO code).
 */
export function options(
  list: ListEntry[],
  f: Filter,
  level: Level,
  species: SpeciesIndex,
  trips: Trip[],
  countryName: (iso2: string) => string = (iso2) => iso2,
): ChipOption[] {
  if (level === 'family' && !f.order) return []
  if (level === 'trip' && !f.year) return []
  const m = matcher(f, species, trips, new Set(SKIP[level]))
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
      const c = entryCountry(e)
      if (c) bump(c)
    } else {
      const y = yearOf(e)
      if (y) bump(y)
    }
  }

  const label = (v: string) =>
    level === 'order' ? orderLabel(v) : level === 'family' ? famLabel.get(v) || v : level === 'country' ? countryName(v) : v
  const out = [...counts].map(([value, count]) => ({ value, label: label(value), count }))
  if (level === 'order' || level === 'family') out.sort((a, b) => firstTo.get(a.value)! - firstTo.get(b.value)!)
  else if (level === 'country') out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  else out.sort((a, b) => (a.value < b.value ? 1 : -1))
  return out
}
