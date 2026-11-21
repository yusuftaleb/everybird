// The Map view's shapes, counts and shades: the world's countries only (round 6: no country or province levels; the view
// zooms and pans instead, zoom.ts). The paths are pre-projected by scripts/build-data/build-map.ts (no map code or
// requests at run time): map-countries.v1.json loads with the Map tab. Ids are the Places filter's: a shape `id` is the
// key `c:<id>`. The map shows the birds the whole filter leaves, the collage's (mapCounts), each counted at every place
// it was recorded, on one continuous log scale (shadeMix, RAMP). It has no filter of its own, and a press opens nothing.
import { fetchData } from '@/lib/data-url'
import { applyFilter, clearPlaces, countryRows, filterKey, placeCounts, type Filter, type PlaceCounts, type PlaceOption } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import type { SeenIndex } from '@/lib/list/seen'
import type { SpeciesIndex } from '@/lib/species/load'

export type MapLayer = { w: number; h: number; d: Record<string, string> }
export type MapCountries = MapLayer & { v: 1 }

/** One shape to draw: its id in the layer, its place key, path and species count. */
export type MapShape = { id: string; key: string; d: string; n: number }

let cache: Promise<MapCountries> | undefined
/** The world's shapes, fetched once per page (a failure is not cached, so the next open tries again). */
export function loadMapCountries(): Promise<MapCountries> {
  cache ??= fetchData<MapCountries>('map-countries.v1.json').catch((e) => {
    cache = undefined
    throw e
  })
  return cache
}

/**
 * What the map counts: the birds the whole filter leaves (the collage's, the Places filter included), each counted at
 * every place it was recorded under the filter's other dimensions (a Time range with "Count repeat sightings" counts a
 * place only for the birds recorded there in the range, as placeCounts does).
 */
export function mapCounts(list: ListEntry[], filter: Filter, species: SpeciesIndex, seen?: SeenIndex): PlaceCounts {
  const shown = filterKey(filter) ? applyFilter(list, filter, species, seen) : list
  return placeCounts(shown, clearPlaces(filter), species, seen)
}

/**
 * The world's shapes with their counts. Northern Cyprus (QY) is a place only iNaturalist records; eBird records the whole
 * island as Cyprus. With Cyprus counted and no QY, the north is drawn as Cyprus (its shade, name and count).
 */
export function mapShapes(world: MapLayer, counts: PlaceCounts): MapShape[] {
  const cy = !counts.countries.has('QY') ? counts.countries.get('CY')?.n ?? 0 : 0
  return Object.entries(world.d).map(([id, d]) => {
    const hit = id === 'QY' && cy > 0 ? { key: 'c:CY', n: cy } : { key: `c:${id}`, n: counts.countries.get(id)?.n ?? 0 }
    return { id, key: hit.key, d, n: hit.n }
  })
}

/**
 * Every shape, in the order the map draws it: the rest as they come, then the hovered place's shapes (`hot`; a place
 * drawn by several shapes, Cyprus with the north, moves whole). Each place is ONE element with its own fill; the hovered
 * one comes last so its Ink line (the stroke of that same element, over its own fill) is covered by no neighbour.
 * Nothing is ever left out or drawn twice. The share image has no outline.
 */
export function mapDrawOrder(shapes: readonly MapShape[], hot?: string): MapShape[] {
  return hot ? [...shapes.filter((s) => s.key !== hot), ...shapes.filter((s) => s.key === hot)] : [...shapes]
}

/** The lowest and highest counts over the shapes with species ([0, 0] with none): the legend's ends. */
export function countRange(shapes: readonly { n: number }[]): [min: number, max: number] {
  let min = Infinity, max = 0
  for (const s of shapes) if (s.n > 0) { min = Math.min(min, s.n); max = Math.max(max, s.n) }
  return max ? [min, max] : [0, 0]
}

/**
 * The ramp: Accent mixed over Paper by `lo` for the fewest species up to `hi` for the most, a pale tint to a
 * mid-strength Accent, never near-black. Land with no birds is Surface, a step darker than the page; the hairline
 * borders and the hovered place's Ink outline (drawn last, mapDrawOrder) are map.css's.
 */
export const RAMP = { lo: 0.18, hi: 0.62 } as const

/**
 * Accent's share (0 to 1) over Paper for a count on a layer whose counts run `min` to `max`: none for no species, then
 * RAMP.lo at the lowest up to RAMP.hi at the highest, continuous on a log scale (one big country doesn't flatten the
 * rest).
 */
export function shadeMix(n: number, min: number, max: number): number {
  if (n <= 0 || max <= 0) return 0
  const { lo, hi } = RAMP
  if (max <= min) return hi
  const t = (Math.log(n) - Math.log(min)) / (Math.log(max) - Math.log(min))
  return lo + (hi - lo) * Math.min(1, Math.max(0, t))
}

/** The countries with species, most first (then by name): the list under the map and the share image's top five. */
export function mapRows(counts: PlaceCounts, label: (key: string) => string, locale?: string): PlaceOption[] {
  return countryRows(counts, label, locale).filter((r) => r.count > 0)
}
