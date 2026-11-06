import type { SpeciesIndex } from '@/lib/species/load'
import { inRange, type Filter } from './filters'
import type { ListEntry } from './model'
import { keysOf, type SeenIndex } from './seen'
import { MONTH_RE } from './timeline'
import type { Trip } from './trips'

/**
 * Repair a filter so it never holds state the chips can't show.
 * Always: a year becomes the range Jan..Dec of that year (the Time panel shows ranges, not years); a range end that is
 * not YYYY-MM goes, and reversed ends swap; a family needs an order it belongs to; a trip must exist and start inside
 * the range; a province (`sub1`) needs its country (and to be in it), a county (`sub2`) its province.
 * With `pruneValues` (after a list change): also drop order/family, a place no species was seen in (seen-here, else
 * lifer places) and a range that match no entry.
 */
export function applyFilterValidity(f: Filter, list: ListEntry[], trips: Trip[], species: SpeciesIndex, pruneValues: boolean, seen?: SeenIndex): Filter {
  const out: Filter = { ...f }
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
  if (out.sub1 && (!out.country || !out.sub1.startsWith(`${out.country}-`))) delete out.sub1
  if (out.sub2 && !out.sub1) delete out.sub2
  if (out.trip) {
    const t = trips.find((x) => x.id === out.trip)
    if (!t || !inRange(t.start.slice(0, 7), out.from, out.to)) delete out.trip
  }
  if (pruneValues) {
    const has = (pred: (e: ListEntry) => boolean) => list.some(pred)
    const row = (e: ListEntry) => species.byCode.get(e.code)
    if (out.order && !has((e) => row(e)?.ord === out.order)) delete out.order
    if (out.family && !has((e) => row(e)?.fam === out.family)) delete out.family
    const seenAt = (key: string) => has((e) => keysOf(seen, e).has(key))
    if (out.sub2 && !seenAt(`n:${out.sub1}|${out.sub2}`)) delete out.sub2
    if (out.sub1 && !seenAt(`s:${out.sub1}`)) { delete out.sub1; delete out.sub2 }
    if (out.country && !seenAt(`c:${out.country}`)) { delete out.country; delete out.sub1; delete out.sub2 }
    if ((out.from || out.to) && !has((e) => inRange(e.date, out.from, out.to))) {
      delete out.from
      delete out.to
      delete out.trip
    }
    if (!out.order) delete out.family
  }
  for (const k of Object.keys(out) as (keyof Filter)[]) if (!out[k]) delete out[k]
  return out
}
