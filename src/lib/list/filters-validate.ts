import type { SpeciesIndex } from '@/lib/species/load'
import { inRange, withCountries, type Filter } from './filters'
import type { ListEntry } from './model'
import { keysOf, type SeenIndex } from './seen'
import { MONTH_RE } from './timeline'

/**
 * Repair a filter so it never holds state the chips can't show.
 * Always: a year becomes the range Jan..Dec of that year (the Time panel shows ranges, not years); a range end that is
 * not YYYY-MM goes, and reversed ends swap; a family needs an order it belongs to; countries are ISO2 codes, sorted and deduplicated. Older state migrates: a single `country` joins
 * `countries`; the province and county levels (`sub1`, `sub2`) and trips (`trip`) are gone and dropped.
 * With `pruneValues` (after a list change): also drop order/family, countries no species was seen in (seen-here, else
 * lifer places) and a range that match no entry.
 */
/** Place levels of filters from before countries became a set, and the trip from before trips were removed. */
type Legacy = { country?: string; sub1?: string; sub2?: string; trip?: string }

export function applyFilterValidity(f: Filter & Legacy, list: ListEntry[], species: SpeciesIndex, pruneValues: boolean, seen?: SeenIndex): Filter {
  const { country, sub1, sub2, trip, ...rest } = f
  void sub1; void sub2; void trip
  let out: Filter = { ...rest }
  const isos = [...(Array.isArray(out.countries) ? out.countries : []), ...(country ? [country] : [])].filter((c) => typeof c === 'string' && /^[A-Z]{2}$/.test(c))
  out = withCountries(out, isos)
  if (out.year) {
    if (/^\d{4}$/.test(out.year) && !out.from && !out.to) { out.from = `${out.year}-01`; out.to = `${out.year}-12` }
    delete out.year
  }
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
    if (out.countries) out = withCountries(out, out.countries.filter((c) => seenAt(`c:${c}`)))
    if ((out.from || out.to) && !has((e) => inRange(e.date, out.from, out.to))) {
      delete out.from
      delete out.to
    }
    if (!out.order) delete out.family
  }
  for (const k of Object.keys(out) as (keyof Filter)[]) if (!out[k]) delete out[k]
  return out
}
