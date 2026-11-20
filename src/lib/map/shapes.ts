// The Map view's shapes and what each draws. The paths are pre-projected by scripts/build-data/build-map.ts (no map
// code or requests at run time): map-countries.v1.json (the world) loads with the Map tab, map-provinces.v1.json on the
// first drill into a country. Ids are the Places filter's: a world shape `id` is the key `c:<id>`, a province `code` the
// key `s:<code>`, and the counts are the Places panel's own (placeCounts), so the map and the panel always agree.
import { fetchData } from '@/lib/data-url'
import type { PlaceCounts } from '@/lib/list/filters'
import { parentKey, parsePlaceKey } from '@/lib/list/place-keys'
import { sourcePlaceId } from '@/lib/places/registry'

export type MapLayer = { w: number; h: number; d: Record<string, string> }
export type MapCountries = MapLayer & { v: 1 }
export type MapProvinces = { v: 1; groups: Record<string, MapLayer> }

/** One shape to draw: its id in the layer, its place key, path, species count and whether the filter has it checked. */
export type MapShape = { id: string; key: string; d: string; n: number; checked: boolean }

const cache = new Map<string, Promise<unknown>>()
/** A map file, fetched once per page (a failure is not cached, so the next open tries again). */
function load<T>(name: 'map-countries.v1.json' | 'map-provinces.v1.json'): Promise<T> {
  let p = cache.get(name) as Promise<T> | undefined
  if (!p) {
    p = fetchData<T>(name).catch((e) => {
      cache.delete(name)
      throw e
    })
    cache.set(name, p)
  }
  return p
}
export const loadMapCountries = () => load<MapCountries>('map-countries.v1.json')
export const loadMapProvinces = () => load<MapProvinces>('map-provinces.v1.json')

/** The country id whose provinces the map shows at the Places level `at` (a country, or a place inside one); none: the world. */
export function mapGroupOf(at: string | undefined): string | undefined {
  for (let k = at; k; k = parentKey(k)) if (parsePlaceKey(k)?.level === 'country') return k.slice(2)
  return undefined
}

/**
 * The world's shapes, or a country's provinces (`group`), with the counts the Places panel shows. A province the list
 * holds under a source's reference key (an eBird code with no shared region, "FR-GES" stored as "FR-SRC…") is drawn by
 * the shape of that code, under the counted key, so a press sets the panel's filter; a shared code's own count wins.
 */
export function mapShapes(layer: MapLayer, counts: PlaceCounts, checked: ReadonlySet<string>, group?: string): MapShape[] {
  const counted = group === undefined ? undefined : counts.countries.get(group)?.provinces
  const byCode = new Map<string, { key: string; n: number }>()
  for (const [sub1, t] of counted ?? []) {
    const own = Object.hasOwn(layer.d, sub1)
    const code = own ? sub1 : sourcePlaceId(sub1)
    if (code && (own || !byCode.has(code))) byCode.set(code, { key: `s:${sub1}`, n: t.n })
  }
  // Northern Cyprus (QY) is a place only iNaturalist records; eBird records the whole island as Cyprus. With Cyprus
  // counted and no QY, the north is drawn as Cyprus (its shade, name, count and press).
  const cy = group === undefined && !counts.countries.has('QY') ? counts.countries.get('CY')?.n ?? 0 : 0
  return Object.entries(layer.d).map(([id, d]) => {
    const hit = group !== undefined ? byCode.get(id) ?? { key: `s:${id}`, n: 0 }
      : id === 'QY' && cy > 0 ? { key: 'c:CY', n: cy }
      : { key: `c:${id}`, n: counts.countries.get(id)?.n ?? 0 }
    return { id, key: hit.key, d, n: hit.n, checked: checked.has(hit.key) }
  })
}

/** The shade step of a count, 0 (none) to 5, on a log scale up to the layer's most. */
export function shadeStep(n: number, max: number): number {
  if (n <= 0 || max <= 0) return 0
  return Math.max(1, Math.ceil((5 * Math.log(n + 1)) / Math.log(max + 1)))
}
