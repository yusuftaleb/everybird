import type { SpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { THREATENED } from '@/lib/species/iucn'
import { isStatusFilterCat, STATUS_FILTER_CATS, STATUS_NAMES, type StatusFilterCat } from '@/lib/species/status-filter'
import { CONTINENTS, continentOfPlace, type ContinentId } from '@/lib/places/continents'
import { REGION_PRESETS, regionsOfPlace, type RegionPresetId } from '@/lib/places/presets'
import type { ListEntry } from './model'
import { countryKeyOf, isWithin, parentKey, parsePlaceKey } from './place-keys'
import { keysOf, seenOf, type SeenIndex } from './seen'
import { inRange } from './in-range'
import { makeWhere, seenAt, sightingKeys } from './sighting'

/**
 * The active filters. Time: `from`/`to` are a range of months (YYYY-MM, inclusive, either end open; see timeline.ts).
 * `year` still filters (old state, search picks), but the store turns it into the range Jan..Dec of that year.
 * Places: three levels, each a sorted set never empty when set: `countries` (ISO2 codes), `provinces` (sub1 codes,
 * "CA-BC") and `counties` ("CA-BC|Capital", always under its province). Together they keep the species SEEN in ANY of
 * the chosen places (seen.ts; the keys are place-keys.ts'), not only the lifers there, when the functions below get the
 * seen-here index; without it (a shared link) the lifer places stand in. A selection never holds a place and one of
 * its ancestors (withPlaces). Time stays about lifers: places and a range together keep the species seen there whose
 * lifer falls in the range, unless `basis` is 'seen' (below). (Trips are gone: an old `trip` value is dropped by applyFilterValidity.)
 * Continents: `continents` (ids from places/continents.ts, key `n:AF`), in CONTINENTS order, never empty when set, the
 * top level of the same set: a continent is the ancestor of its countries, so checking one drops its checked countries,
 * provinces and counties, and checking one of those drops the continent (withPlaces, togglePlace).
 * Status: `statuses`, the global IUCN Red List categories plus NE ("Not evaluated": a species with no category), in
 * `STATUS_FILTER_CATS` order, never empty when set (withStatuses); keeps the species in ANY of them. NE matches the
 * species with no category, so a checked category leaves those out unless NE is checked too. NE is never threatened.
 * Group (item 9): `group`, an eBird group id (src/lib/search/groups.ts, `species.groups`): keeps the species whose
 * taxon order is inside the group's bounds; unknown ids are dropped by applyFilterValidity.
 * Basis (item 9): `basis` is 'lifer' (the default and today's behaviour: a range is about first-seen dates, so it is
 * never stored) or 'seen': with a range, places and time together mean "seen at one of these places in this period",
 * from the per-place month sets (seen.ts `seenMonths`, sighting.ts), and a range alone "seen anywhere in it". A
 * species with no month data falls back to its seen-here places and its lifer date. Without a place or range it does nothing.
 */
export type Filter = {
  order?: string
  family?: string
  /** A genus of the family (its scientific name, the first word of a species' `sci`; round 6): set only with its
   *  family, as a family only with its order. */
  genus?: string
  /** The other groups of a marked Tree branch at the filter's deepest taxonomy level (a genus, else a family, else an
   *  order): opening "Netta ◇ with Aythya" keeps Netta and Aythya (taxonWith). Set only by the tree; any other change
   *  of the order, family or genus drops it. */
  with?: string[]
  countries?: string[]
  provinces?: string[]
  counties?: string[]
  continents?: ContinentId[]
  regions?: RegionPresetId[]
  year?: string
  from?: string
  to?: string
  statuses?: StatusFilterCat[]
  /** An eBird species group id (item 9); matched by taxon order. */
  group?: string
  /** Lifers (first sightings) or every sighting at the places and months ("seen"); item 9. */
  basis?: 'lifer' | 'seen'
}
/** The filter with nothing on: no taxonomy, group, places, time, statuses, and the seen basis back to its default (absent = 'lifer'). */
export const emptyFilter = (): Filter => ({})
/** Whether any filter field holds a value (the seen basis alone counts, so Clear all can reset it). */
export const filterActive = (f: Filter): boolean =>
  (Object.keys(f) as (keyof Filter)[]).some((k) => (Array.isArray(f[k]) ? f[k].length > 0 : !!f[k]))
export type ChipOption = { value: string; label: string; count: number }
/** A species' genus: the first word of its scientific name. */
export const genusOf = (sci: string): string => sci.split(' ')[0]
/** The deepest taxonomy level the filter sets: the one `with` widens. */
export const taxonLevel = (f: Pick<Filter, 'order' | 'family' | 'genus'>): 'order' | 'family' | 'genus' | undefined =>
  f.genus ? 'genus' : f.family ? 'family' : f.order ? 'order' : undefined
/** Whether a species' value `v` at `level` passes the filter's `want` there: equal, or (at the deepest level) one of `with`. */
export const taxonWith = (f: Pick<Filter, 'order' | 'family' | 'genus' | 'with'>, level: 'order' | 'family' | 'genus', v: string, want: string): boolean =>
  v === want || (!!f.with?.length && taxonLevel(f) === level && f.with.includes(v))
/** `country`: the countries' options (the filter holds a set, `countries`); as a skipped dimension, every place level. */
export type FilterLevel = 'order' | 'family' | 'genus' | 'country' | 'year'
/** The range (`from`/`to`) and the statuses as dimensions of their own, for skipping them when counting. */
type Dim = FilterLevel | 'range' | 'status'
type Level = FilterLevel

const yearOf = (e: ListEntry) => (e.date && /^\d{4}/.test(e.date) ? e.date.slice(0, 4) : undefined)

export { inRange }
/** Basis 'seen' with a range (places alone have nothing to be "seen in" a period); otherwise it changes nothing and has no key. */
export const seenBasis = (f: Filter): boolean => f.basis === 'seen' && !!(f.from || f.to)

/**
 * Stable key, e.g. "o:Passeriformes|f:Corvidae|g:waterfowl|c:CA,EG|s:US-WA|k:CA-BC|Capital|y:2026|r:2026-03~2026-09|b:seen|i:VU,EN";
 * empty values are omitted (so filters without a range, provinces, counties or statuses keep the keys they always had).
 */
export function filterKey(f: Filter): string {
  const parts: string[] = []
  if (f.order) parts.push(`o:${f.order}`)
  if (f.family) parts.push(`f:${f.family}`)
  if (f.genus) parts.push(`e:${f.genus}`)
  if (f.with?.length && taxonLevel(f)) parts.push(`w:${[...f.with].sort().join(',')}`)
  if (f.group) parts.push(`g:${f.group}`)
  if (f.countries?.length) parts.push(`c:${[...f.countries].sort().join(',')}`)
  if (f.provinces?.length) parts.push(`s:${[...f.provinces].sort().join(',')}`)
  if (f.counties?.length) parts.push(`k:${[...f.counties].sort().join(',')}`)
  if (f.continents?.length) parts.push(`t:${f.continents.join(',')}`)
  if (f.regions?.length) parts.push(`p:${f.regions.join(',')}`)
  if (f.year) parts.push(`y:${f.year}`)
  if (f.from || f.to) parts.push(`r:${f.from ?? ''}~${f.to ?? ''}`)
  if (seenBasis(f)) parts.push('b:seen')
  if (f.statuses?.length) parts.push(`i:${[...f.statuses].sort((a, b) => STATUS_FILTER_CATS.indexOf(a) - STATUS_FILTER_CATS.indexOf(b)).join(',')}`)
  return parts.join('|')
}

/**
 * Build one O(1)-per-entry predicate for the filter, ignoring the dimensions in `skip`.
 * Drill-down: a family outside the chosen order matches nothing.
 * A child set without its parent is applied on its own (the store drops such state).
 */
function matcher(f: Filter, species: SpeciesIndex, skip: ReadonlySet<Dim>, seen?: SeenIndex) {
  const order = skip.has('order') ? undefined : f.order
  const family = skip.has('family') ? undefined : f.family
  const genus = skip.has('genus') ? undefined : f.genus
  // Seen in any of the chosen places, at any level.
  const places = !skip.has('country') && filterPlaceKeys(f).length ? filterPlaceKeys(f) : undefined
  const year = skip.has('year') ? undefined : f.year
  const from = skip.has('range') ? undefined : f.from
  const to = skip.has('range') ? undefined : f.to
  const statuses = skip.has('status') || !f.statuses?.length ? undefined : new Set<string>(f.statuses)
  // A group is its taxon-order bounds; ids unknown to a loaded groups file match nothing (validation drops them), and
  // without the file (tests, the sample) the group is ignored.
  const bounds = f.group && species.groups ? (species.groups.get(f.group) ?? null) : undefined
  // Basis 'seen' with a range: seen in the places (any, when none) in the period, from the month sets.
  const where = f.basis === 'seen' && (from || to) ? makeWhere(places, from, to) : undefined
  return (e: ListEntry): boolean => {
    if (order || family || genus || statuses || bounds !== undefined) {
      const row = species.byCode.get(e.code)
      if (!row) return false
      if (order && !taxonWith(f, 'order', row.ord, order)) return false
      if (family && !taxonWith(f, 'family', row.fam, family)) return false
      if (genus && !taxonWith(f, 'genus', genusOf(row.sci), genus)) return false
      if (statuses && !statuses.has(row.iu ?? 'NE')) return false
      if (bounds === null || (bounds && (row.to < bounds.lo || row.to > bounds.hi))) return false
    }
    if (where) {
      if (!seenAt(e, seen, where)) return false
    } else {
      if (places) {
        const keys = keysOf(seen, e)
        if (!places.some((k) => keys.has(k))) return false
      }
      if ((from || to) && !inRange(e.date, from, to)) return false
    }
    if (year && yearOf(e) !== year) return false
    return true
  }
}

/** `seen`: the seen-here index (the Places filter keeps species seen there); without it, lifer places. */
export function applyFilter(list: ListEntry[], f: Filter, species: SpeciesIndex, seen?: SeenIndex): ListEntry[] {
  const m = matcher(f, species, new Set(), seen)
  return list.filter(m)
}

const SKIP: Record<Level, Dim[]> = {
  order: ['order', 'family', 'genus'], // a family implies its order, a genus its family
  family: ['family', 'genus'],
  genus: ['genus'],
  country: ['country'], // countries are counted whatever is checked (a multi-select)
  year: ['year', 'range'], // years are counted over the whole span
}

/**
 * Chips for one level, counted under the OTHER active dimensions (family also under the active order).
 * Only options with count > 0.
 * Order: order/family by taxonomic position of their first species, country by count desc then label,
 * year descending. Legacy: the 'year' level is no longer shown as chips (the Time panel is the timeline); it is kept
 * for callers and tests of the old drill-down.
 * Countries count species SEEN in each (each species once per country), whatever countries are checked, sorted by
 * count, then label. `name` labels countries by code (default: the code). `seen`: the seen-here index (else lifer
 * places).
 */
export function options(
  list: ListEntry[],
  f: Filter,
  level: Level,
  species: SpeciesIndex,
  name: (code: string) => string = (code) => code,
  seen?: SeenIndex,
  /** A family's label (the names files' family names); default the English family name. */
  famName: (row: SpeciesRow) => string = (row) => row.famCom,
): ChipOption[] {
  if ((level === 'family' && !f.order) || (level === 'genus' && !f.family)) return []
  const m = matcher(f, species, new Set(SKIP[level]), seen)
  const counts = new Map<string, number>()
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1)

  const firstTo = new Map<string, number>()
  const famLabel = new Map<string, string>()
  for (const e of list) {
    if (!m(e)) continue
    if (level === 'order' || level === 'family' || level === 'genus') {
      const row = species.byCode.get(e.code)
      if (!row) continue
      const key = level === 'order' ? row.ord : level === 'family' ? row.fam : genusOf(row.sci)
      bump(key)
      if (!firstTo.has(key) || row.to < firstTo.get(key)!) firstTo.set(key, row.to)
      if (level === 'family') famLabel.set(key, famName(row))
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
    level === 'family' ? famLabel.get(v) || v : level === 'country' ? name(v) : v
  const out = [...counts].map(([value, count]) => ({ value, label: label(value), count }))
  if (level === 'order' || level === 'family' || level === 'genus') out.sort((a, b) => firstTo.get(a.value)! - firstTo.get(b.value)!)
  else if (level === 'country') out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  else out.sort((a, b) => (a.value < b.value ? 1 : -1))
  return out
}

/**
 * The filter that shows `e` (a search pick outside the current view): every dimension that already includes the bird
 * stays; the ones that exclude it go (another order clears the family too).
 */
export function filterToShow(f: Filter, e: ListEntry, species: SpeciesIndex, seen?: SeenIndex): Filter {
  const row = species.byCode.get(e.code)
  const next: Filter = { ...f }
  // A level that excludes the bird goes with every level under it and the marked branch's `with` (judged on `f`).
  if (next.order && !(row && taxonWith(f, 'order', row.ord, next.order))) { delete next.order; delete next.family; delete next.genus; delete next.with }
  if (next.family && !(row && taxonWith(f, 'family', row.fam, next.family))) { delete next.family; delete next.genus; delete next.with }
  if (next.genus && !(row && taxonWith(f, 'genus', genusOf(row.sci), next.genus))) { delete next.genus; delete next.with }
  if (next.group && row && species.groups) {
    const g = species.groups.get(next.group)
    if (!g || row.to < g.lo || row.to > g.hi) delete next.group
  }
  const keys = keysOf(seen, e)
  if (hasPlaces(next) && !filterPlaceKeys(next).some((k) => keys.has(k))) {
    delete next.countries
    delete next.provinces
    delete next.counties
    delete next.continents
    delete next.regions
  }
  if (next.year && yearOf(e) !== next.year) delete next.year
  if ((next.from || next.to) && !inRange(e.date, next.from, next.to)) {
    // Basis 'seen': any sighting in the range keeps it (a month set, a place's earliest date or the lifer, as above).
    if (!(next.basis === 'seen' && seenAt(e, seen, makeWhere(undefined, next.from, next.to)))) { delete next.from; delete next.to }
  }
  // Each dimension alone includes the bird; under basis 'seen' the places and the range together may still not (Canada in
  // 2019, a range of 2026 the bird was seen in only in Egypt): the range goes.
  if (next.basis === 'seen' && (next.from || next.to) && hasPlaces(next) && !matcher({ ...next, order: undefined, family: undefined, genus: undefined, with: undefined, group: undefined, statuses: undefined }, species, new Set(), seen)(e)) {
    delete next.from
    delete next.to
  }
  const cat = statusCatOf(row)
  if (next.statuses?.length && !(cat && next.statuses.includes(cat))) delete next.statuses
  for (const k of Object.keys(next) as (keyof Filter)[]) if (!next[k]) delete next[k]
  return next
}

/**
 * Drill into an order or family from a search pick: within the current place, time and status filters, or with them cleared
 * when they would leave the group empty.
 */
export function drillTo(f: Filter, group: { order: string; family?: string }, list: ListEntry[], species: SpeciesIndex, seen?: SeenIndex): Filter {
  const next: Filter = { ...f, order: group.order }
  delete next.genus
  delete next.with
  if (group.family) next.family = group.family
  else delete next.family
  return applyFilter(list, next, species, seen).length ? next : { ...group }
}

/** The filter's places as keys: continents, then countries, provinces and counties ("n:AF", "c:MX", "s:CA-BC", "k:US-WA|King"). */
export function filterPlaceKeys(f: Filter): string[] {
  return [
    ...(f.continents ?? []).map((n) => `n:${n}`),
    ...(f.regions ?? []).map((r) => `r:${r}`),
    ...(f.countries ?? []).map((c) => `c:${c}`),
    ...(f.provinces ?? []).map((s) => `s:${s}`),
    ...(f.counties ?? []).map((k) => `k:${k}`),
  ]
}

/** True when any place level or continent is set. */
export function hasPlaces(f: Filter): boolean {
  return !!(f.countries?.length || f.provinces?.length || f.counties?.length || f.continents?.length || f.regions?.length)
}

/** The filter with no place at all: every level and every continent go (the Places panel's Clear, the chips' "×"). */
export function clearPlaces(f: Filter): Filter {
  const next: Filter = { ...f }
  delete next.countries
  delete next.provinces
  delete next.counties
  delete next.continents
  delete next.regions
  return next
}

/**
 * The filter with exactly these places (keys of any level, continents included): malformed keys go, duplicates go, a key with an ancestor
 * also present goes (the ancestor already holds it), each level is sorted, and an empty level is dropped.
 */
export function withPlaces(f: Filter, keys: readonly string[]): Filter {
  const set = new Set(keys.filter((k) => typeof k === 'string' && parsePlaceKey(k)))
  const covered = (k: string) => {
    for (let up = parentKey(k); up; up = parentKey(up)) if (set.has(up)) return true
    return false
  }
  const continents: string[] = []
  const regions: string[] = []
  const countries: string[] = []
  const provinces: string[] = []
  const counties: string[] = []
  for (const k of set) {
    if (covered(k)) continue
    const at = k[0] === 'n' ? continents : k[0] === 'r' ? regions : k[0] === 'c' ? countries : k[0] === 's' ? provinces : counties
    at.push(k.slice(2))
  }
  const next: Filter = { ...f }
  delete next.continents
  delete next.regions
  delete next.countries
  delete next.provinces
  delete next.counties
  const ids = CONTINENTS.map((c) => c.id).filter((id) => continents.includes(id))
  if (ids.length) next.continents = ids
  const rids = REGION_PRESETS.map((r) => r.id).filter((id) => regions.includes(id))
  if (rids.length) next.regions = rids
  if (countries.length) next.countries = countries.sort()
  if (provinces.length) next.provinces = provinces.sort()
  if (counties.length) next.counties = counties.sort()
  return next
}

/**
 * The filter with `key` unchecked when it is checked; else checked, with its checked ancestors and descendants removed
 * (checking British Columbia while Canada is checked narrows to British Columbia).
 */
export function togglePlace(f: Filter, key: string): Filter {
  const keys = filterPlaceKeys(f)
  if (keys.includes(key)) return withPlaces(f, keys.filter((k) => k !== key))
  return withPlaces(f, [...keys.filter((k) => !isWithin(k, key) && !isWithin(key, k)), key])
}

export type PlaceOption = ChipOption & { children: number }

/** A place's tally in one counting pass: species counted there (each once: `last` is the last entry counted). */
type Tally = { n: number; last: number }
type ProvinceTally = Tally & { counties: Set<string> }
type CountryTally = Tally & { provinces: Map<string, ProvinceTally> }
type ContinentTally = Tally & { countries: Set<string> }

/**
 * Every Places level's counts in one pass over the list, under the OTHER filters (whatever places are checked), so the
 * panel counts once per change of the other filters and none per checkbox (placeRows reads a level from it). Built
 * from each seen place's own fields: countries by code; a country's provinces counted from its own places; a
 * province's counties counted from every place with that province code (as placeOptions always has).
 */
export type PlaceCounts = {
  /** By country id: the key without "c:" ("CA", or "FR@SA" for France's part on South America), so one country on two continents is two entries. */
  countries: Map<string, CountryTally>
  counties: Map<string, Map<string, Tally>>
  /** Species seen in each continent, each species once per continent (never a sum of the countries' tallies), with the country ids on it. */
  continents: Map<ContinentId, ContinentTally>
  regions: Map<RegionPresetId, Tally>
}

/** The counts for every level (see PlaceCounts). `seen`: the seen-here index (else lifer places). */
export function placeCounts(list: ListEntry[], f: Filter, species: SpeciesIndex, seen?: SeenIndex): PlaceCounts {
  const m = matcher(f, species, new Set(SKIP.country), seen)
  // Basis 'seen' with a range: a place counts only for the species seen THERE in the period.
  const when = f.basis === 'seen' && (f.from || f.to) ? makeWhere(undefined, f.from, f.to) : undefined
  const countries = new Map<string, CountryTally>()
  const counties = new Map<string, Map<string, Tally>>()
  const continents = new Map<ContinentId, ContinentTally>()
  const regions = new Map<RegionPresetId, Tally>()
  const tick = (t: Tally, i: number) => {
    if (t.last !== i) { t.last = i; t.n++ }
  }
  for (let i = 0; i < list.length; i++) {
    const e = list[i]
    if (!m(e)) continue
    const here = when ? sightingKeys(e, seen, when) : undefined
    for (const p of seenOf(seen, e)) {
      if (here && !here.has(p.sub2 ? `${p.sub1 ?? p.country}|${p.sub2}` : (p.sub1 ?? p.country))) continue
      const id = countryKeyOf(p).slice(2)
      const cont = continentOfPlace(p)
      if (cont) {
        let t = continents.get(cont)
        if (!t) continents.set(cont, (t = { n: 0, last: -1, countries: new Set() }))
        t.countries.add(id)
        tick(t, i)
      }
      for (const reg of regionsOfPlace(p)) {
        let rt = regions.get(reg)
        if (!rt) regions.set(reg, (rt = { n: 0, last: -1 }))
        tick(rt, i)
      }
      let c = countries.get(id)
      if (!c) countries.set(id, (c = { n: 0, last: -1, provinces: new Map() }))
      tick(c, i)
      if (!p.sub1) continue
      let s = c.provinces.get(p.sub1)
      if (!s) c.provinces.set(p.sub1, (s = { n: 0, last: -1, counties: new Set() }))
      tick(s, i)
      if (!p.sub2) continue
      s.counties.add(p.sub2)
      let ks = counties.get(p.sub1)
      if (!ks) counties.set(p.sub1, (ks = new Map()))
      let k = ks.get(p.sub2)
      if (!k) ks.set(p.sub2, (k = { n: 0, last: -1 }))
      tick(k, i)
    }
  }
  return { countries, counties, continents, regions }
}

/** The rows of the level under `parent` from counts already made (placeOptions without the pass over the list).
 *  Ties in count sort by name in `locale` (the UI language's BCP 47 tag). */
export function placeRows(counts: PlaceCounts, parent: string | undefined, label: (key: string) => string, locale?: string): PlaceOption[] {
  const out: PlaceOption[] = []
  const at = parent === undefined ? undefined : parsePlaceKey(parent)
  // A place whose key doesn't parse (an odd code) is listed but never drills: nothing can be found under it.
  const kids = (key: string, n: number) => (n && parsePlaceKey(key) ? n : 0)
  const country = (id: string, c: CountryTally) => out.push({ value: `c:${id}`, label: label(`c:${id}`), count: c.n, children: kids(`c:${id}`, c.provinces.size) })
  if (parent === undefined) {
    // The top level: the continents, and beside them any country that is in none.
    for (const [id, t] of counts.continents) out.push({ value: `n:${id}`, label: label(`n:${id}`), count: t.n, children: t.countries.size })
    for (const [id, c] of counts.countries) if (!parentKey(`c:${id}`)) country(id, c)
  } else if (at?.level === 'continent') {
    for (const id of counts.continents.get(at.continent as ContinentId)?.countries ?? []) {
      const c = counts.countries.get(id)
      if (c) country(id, c)
    }
  } else if (at?.level === 'country') {
    for (const [sub1, s] of counts.countries.get(parent!.slice(2))?.provinces ?? []) out.push({ value: `s:${sub1}`, label: label(`s:${sub1}`), count: s.n, children: kids(`s:${sub1}`, s.counties.size) })
  } else if (at?.level === 'province') {
    for (const [name, k] of counts.counties.get(at.sub1!) ?? []) {
      const value = `k:${at.sub1}|${name}`
      out.push({ value, label: label(value), count: k.n, children: 0 })
    }
  }
  out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, locale))
  return out
}

/** Every country row of every continent, flat (the one-continent list's top level, and the search from the continent level). */
export function countryRows(counts: PlaceCounts, label: (key: string) => string, locale?: string): PlaceOption[] {
  const out: PlaceOption[] = []
  for (const [id, c] of counts.countries) out.push({ value: `c:${id}`, label: label(`c:${id}`), count: c.n, children: c.provinces.size && parsePlaceKey(`c:${id}`) ? c.provinces.size : 0 })
  return out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, locale))
}

export function regionRows(counts: PlaceCounts, label: (key: string) => string, locale?: string): PlaceOption[] {
  const out: PlaceOption[] = []
  for (const [id, t] of counts.regions) out.push({ value: `r:${id}`, label: label(`r:${id}`), count: t.n, children: 0 })
  return out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, locale))
}

/**
 * Whether the continent level is skipped: the counted list has one continent and no country outside every continent,
 * and none is checked (as the taxonomy skips an order's only family). The top level then lists the countries.
 */
export function onlyOneContinent(counts: PlaceCounts, f: Filter): boolean {
  if (counts.continents.size !== 1 || f.continents?.length) return false
  for (const id of counts.countries.keys()) if (!parentKey(`c:${id}`)) return false
  return true
}

/**
 * The rows of the Places level under `parent` (undefined: the continents and any country in none; a continent key: its countries; a country key: its provinces; a province key: its
 * counties): each place's key, its label, the species seen there (each once per row) under the OTHER filters but
 * whatever places are checked, and how many distinct places it holds one level down. Sorted by count, then label.
 * `seen`: the seen-here index (else lifer places). One level of placeCounts + placeRows.
 */
export function placeOptions(
  list: ListEntry[],
  f: Filter,
  parent: string | undefined,
  species: SpeciesIndex,
  label: (key: string) => string,
  seen?: SeenIndex,
): PlaceOption[] {
  return placeRows(placeCounts(list, f, species, seen), parent, label)
}

/** The filter with `iso` checked or unchecked in its countries (`togglePlace` on its country key). */
export function toggleCountry(f: Filter, iso: string): Filter {
  return togglePlace(f, `c:${iso}`)
}

/**
 * The filter with exactly these countries at the country level (sorted, deduplicated; none drops the level). Provinces
 * and counties outside them stay; the ones inside them go (the country holds them).
 */
export function withCountries(f: Filter, countries: readonly string[]): Filter {
  const others = filterPlaceKeys(f).filter((k) => !k.startsWith('c:'))
  return withPlaces(f, [...countries.filter(Boolean).map((c) => `c:${c}`), ...others])
}

/** A species' status-filter category: its Red List category, or NE when it has none; undefined for no species row. */
export function statusCatOf(row: SpeciesRow | undefined): StatusFilterCat | undefined {
  return row ? (row.iu ?? 'NE') : undefined
}

/** The filter with exactly these statuses: unknown values and duplicates go, in `STATUS_FILTER_CATS` order; none drops the field. */
export function withStatuses(f: Filter, cats: readonly string[]): Filter {
  const set = new Set(cats.filter(isStatusFilterCat))
  const next: Filter = { ...f }
  delete next.statuses
  const statuses = STATUS_FILTER_CATS.filter((c) => set.has(c))
  if (statuses.length) next.statuses = statuses
  return next
}

/** The filter with `cat` unchecked when it is checked, else checked. */
export function toggleStatus(f: Filter, cat: StatusFilterCat): Filter {
  const cur = f.statuses ?? []
  return withStatuses(f, cur.includes(cat) ? cur.filter((c) => c !== cat) : [...cur, cat])
}

/**
 * The Status panel's rows: species per category (NE for those with none) under the OTHER filters, whatever statuses are
 * checked; only categories with species, in `STATUS_FILTER_CATS` order, labelled by full name. `seen`: the seen-here
 * index (else lifer places).
 */
export function statusOptions(list: ListEntry[], f: Filter, species: SpeciesIndex, seen?: SeenIndex, names: Record<StatusFilterCat, string> = STATUS_NAMES): (ChipOption & { value: StatusFilterCat })[] {
  const m = matcher(f, species, new Set<Dim>(['status']), seen)
  const counts = new Map<StatusFilterCat, number>()
  for (const e of list) {
    if (!m(e)) continue
    const cat = statusCatOf(species.byCode.get(e.code))
    if (cat) counts.set(cat, (counts.get(cat) ?? 0) + 1)
  }
  return STATUS_FILTER_CATS.filter((c) => counts.has(c)).map((value) => ({ value, label: names[value], count: counts.get(value)! }))
}

/** How many of the entries are globally threatened (Vulnerable, Endangered or Critically Endangered). */
export function threatenedCount(entries: readonly ListEntry[], species: SpeciesIndex): number {
  let n = 0
  for (const e of entries) {
    const iu = species.byCode.get(e.code)?.iu
    if (iu && THREATENED.includes(iu)) n++
  }
  return n
}
