import type { SpeciesIndex } from '@/lib/species/load'
import { filterPlaceKeys, inRange, statusCatOf, withPlaces, withStatuses, type Filter } from './filters'
import type { ListEntry } from './model'
import { keysOf, type SeenIndex } from './seen'
import { makeWhere, seenAt as seenIn } from './sighting'
import { MONTH_RE } from './timeline'

/**
 * Repair a filter so it never holds state the chips can't show.
 * Always: a year becomes the range Jan..Dec of that year (the Time panel shows ranges, not years); a range end that is
 * not YYYY-MM goes, and reversed ends swap; a family needs an order it belongs to; places (countries, provinces,
 * counties) and continents (known ids only) are well-formed, sorted and deduplicated, and a place whose ancestor is also
 * chosen goes (withPlaces);
 * statuses are known categories (the Red List ones and NE), deduplicated, in `STATUS_FILTER_CATS` order (withStatuses).
 * `group` must be a group id the loaded groups file knows (kept untouched while it isn't loaded); `basis` is 'seen' or
 * nothing ('lifer' is the default and is never stored).
 * Older state migrates: a single `country` joins `countries`; the old single province and county (`sub1`, `sub2`) and
 * trips (`trip`) are dropped.
 * With `pruneValues` (after a list change): also drop order/family and places (continents too) no species was seen in (seen-here, else
 * lifer places), a range and statuses that match no entry (NE counts only the entries that have a species row and no category).
 */
/** Place levels of filters from before countries became a set, and the trip from before trips were removed. */
type Legacy = { country?: string; sub1?: string; sub2?: string; trip?: string }

export function applyFilterValidity(f: Filter & Legacy, list: ListEntry[], species: SpeciesIndex, pruneValues: boolean, seen?: SeenIndex): Filter {
  const { country, sub1, sub2, trip, ...rest } = f
  void sub1; void sub2; void trip
  let out: Filter = { ...rest }
  const level = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  out.countries = level(out.countries)
  out.provinces = level(out.provinces)
  out.counties = level(out.counties)
  out.continents = level(out.continents) as Filter['continents']
  out.regions = level(out.regions) as Filter['regions']
  out = withPlaces(out, [...filterPlaceKeys(out), ...(typeof country === 'string' ? [`c:${country}`] : [])])
  out = withStatuses(out, level(out.statuses))
  if (out.year) {
    if (/^\d{4}$/.test(out.year) && !out.from && !out.to) { out.from = `${out.year}-01`; out.to = `${out.year}-12` }
    delete out.year
  }
  if (typeof out.group !== 'string' || !out.group || (species.groups && !species.groups.has(out.group))) delete out.group
  if (out.basis !== 'seen') delete out.basis
  if (out.from && !MONTH_RE.test(out.from)) delete out.from
  if (out.to && !MONTH_RE.test(out.to)) delete out.to
  if (out.from && out.to && out.from > out.to) [out.from, out.to] = [out.to, out.from]
  if (out.family) {
    const ok = out.order && species.rows.some((r) => r.ord === out.order && r.fam === out.family)
    if (!ok) delete out.family
  }
  if (pruneValues) {
    const has = (pred: (e: ListEntry) => boolean) => list.some(pred)
    const row = (e: ListEntry) => species.byCode.get(e.code)
    if (out.order && !has((e) => row(e)?.ord === out.order)) delete out.order
    if (out.family && !has((e) => row(e)?.fam === out.family)) delete out.family
    const seenAt = (key: string) => has((e) => keysOf(seen, e).has(key))
    out = withPlaces(out, filterPlaceKeys(out).filter(seenAt))
    if (out.group && species.groups) {
      const g = species.groups.get(out.group)
      if (!g || !has((e) => { const to = row(e)?.to; return to !== undefined && to >= g.lo && to <= g.hi })) delete out.group
    }
    const when = out.basis === 'seen' ? makeWhere(undefined, out.from, out.to) : undefined
    const inTime = (e: ListEntry) => inRange(e.date, out.from, out.to) || (!!when && seenIn(e, seen, when))
    if ((out.from || out.to) && !has(inTime)) {
      delete out.from
      delete out.to
    }
    if (out.statuses) {
      const present = new Set(list.map((e) => statusCatOf(row(e))))
      out = withStatuses(out, out.statuses.filter((c) => present.has(c)))
    }
    if (!out.order) delete out.family
  }
  for (const k of Object.keys(out) as (keyof Filter)[]) if (!out[k]) delete out[k]
  return out
}
