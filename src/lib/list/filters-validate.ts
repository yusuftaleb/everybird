import type { SpeciesIndex } from '@/lib/species/load'
import type { Filter } from './filters'
import type { ListEntry } from './model'
import { entryCountry, type Trip } from './trips'

/**
 * Repair a filter so it never holds state the chips can't show.
 * Always: a family needs an order it belongs to; a trip needs a year it falls in and must exist.
 * With `pruneValues` (after a list change): also drop order/family/country/year that match no entry.
 */
export function applyFilterValidity(f: Filter, list: ListEntry[], trips: Trip[], species: SpeciesIndex, pruneValues: boolean): Filter {
  const out: Filter = { ...f }
  if (out.family) {
    const ok = out.order && species.rows.some((r) => r.ord === out.order && r.fam === out.family)
    if (!ok) delete out.family
  }
  if (out.trip) {
    const t = trips.find((x) => x.id === out.trip)
    if (!out.year || !t || t.start.slice(0, 4) !== out.year) delete out.trip
  }
  if (pruneValues) {
    const has = (pred: (e: ListEntry) => boolean) => list.some(pred)
    const row = (e: ListEntry) => species.byCode.get(e.code)
    if (out.order && !has((e) => row(e)?.ord === out.order)) delete out.order
    if (out.family && !has((e) => row(e)?.fam === out.family)) delete out.family
    if (out.country && !has((e) => entryCountry(e) === out.country)) delete out.country
    if (out.year && !has((e) => e.date?.slice(0, 4) === out.year)) {
      delete out.year
      delete out.trip
    }
    if (!out.order) delete out.family
  }
  return out
}
