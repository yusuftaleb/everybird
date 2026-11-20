// The Map view's shapes, counts and shades. The paths are pre-projected by scripts/build-data/build-map.ts (no map code
// or requests at run time): map-countries.v1.json (the world) loads with the Map tab, map-provinces.v1.json on the first
// country opened. Ids are the Places filter's: a world shape `id` is the key `c:<id>`, a province `code` the key
// `s:<code>`. The map shows the birds the whole filter leaves, the collage's (mapCounts), each counted at every place it
// was recorded, on one continuous log scale (shadeMix, RAMP). It has no filter of its own: a
// press on a country opens it (its provinces where their shapes hold its species, else the country framed in the world,
// mapLayer), a press on a province with counties opens that (the province framed and its counties listed: there are no
// county shapes), and the path above the map goes back.
import { fetchData } from '@/lib/data-url'
import { applyFilter, clearPlaces, countryRows, filterKey, placeCounts, placeRows, type Filter, type PlaceCounts, type PlaceOption } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import { parentKey, parsePlaceKey } from '@/lib/list/place-keys'
import type { SeenIndex } from '@/lib/list/seen'
import { sourcePlaceId } from '@/lib/places/registry'
import type { SpeciesIndex } from '@/lib/species/load'

export type MapLayer = { w: number; h: number; d: Record<string, string> }
export type MapCountries = MapLayer & { v: 1 }
export type MapProvinces = { v: 1; groups: Record<string, MapLayer> }
export type Box = { x: number; y: number; w: number; h: number }

/** One shape to draw: its id in the layer, its place key, path and species count. */
export type MapShape = { id: string; key: string; d: string; n: number }

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

/**
 * What the map counts: the birds the whole filter leaves (the collage's, the Places filter included), each counted at
 * every place it was recorded under the filter's other dimensions (a Time range with "Count repeat sightings" counts a
 * place only for the birds recorded there in the range, as placeCounts does).
 */
export function mapCounts(list: ListEntry[], filter: Filter, species: SpeciesIndex, seen?: SeenIndex): PlaceCounts {
  const shown = filterKey(filter) ? applyFilter(list, filter, species, seen) : list
  return placeCounts(shown, clearPlaces(filter), species, seen)
}

/** The country id whose provinces the map shows when it has `at` open (a country, or a place inside one); none: the world. */
export function mapGroupOf(at: string | undefined): string | undefined {
  for (let k = at; k; k = parentKey(k)) if (parsePlaceKey(k)?.level === 'country') return k.slice(2)
  return undefined
}

/** The species a country (`c:CA`) or a province (`s:CA-BC`) holds in `counts`; 0 for anything else or unknown. */
export function placeCount(counts: PlaceCounts, key: string): number {
  const p = parsePlaceKey(key)
  if (p?.level === 'country') return counts.countries.get(key.slice(2))?.n ?? 0
  if (p?.level === 'province') return counts.countries.get(parentKey(key)?.slice(2) ?? '')?.provinces.get(key.slice(2))?.n ?? 0
  return 0
}

/** The place keys the map can open, from the world down: undefined (the world), then the open country, then the open province. */
export function mapPath(at: string | undefined): (string | undefined)[] {
  const out: (string | undefined)[] = []
  for (let k = at; k; k = parentKey(k)) if (parsePlaceKey(k)?.level !== 'continent') out.unshift(k)
  return [undefined, ...out]
}

/**
 * The world's shapes, or a country's provinces (`group`), with their counts. A province the list holds under a source's
 * reference key (an eBird code with no shared region, "FR-GES" stored as "FR-SRC…") is drawn by the shape of that code,
 * under the counted key; a shared code's own count wins.
 */
export function mapShapes(layer: MapLayer, counts: PlaceCounts, group?: string): MapShape[] {
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
    return { id, key: hit.key, d, n: hit.n }
  })
}

/** The bounding box of an SVG path (M, L, H, V and Z, absolute or relative: what build-map.ts writes). */
export function pathBox(d: string): Box | null {
  let x = 0, y = 0, sx = 0, sy = 0
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const at = () => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  for (const [, cmd, args] of d.matchAll(/([MmLlHhVvZz])([^MmLlHhVvZz]*)/g)) {
    const n = args.match(/-?\d*\.?\d+(?:e-?\d+)?/gi)?.map(Number) ?? []
    const rel = cmd === cmd.toLowerCase()
    switch (cmd.toUpperCase()) {
      case 'M':
      case 'L':
        for (let i = 0; i + 1 < n.length; i += 2) {
          x = rel ? x + n[i] : n[i]
          y = rel ? y + n[i + 1] : n[i + 1]
          if (i === 0 && cmd.toUpperCase() === 'M') { sx = x; sy = y }
          at()
        }
        break
      case 'H': for (const v of n) { x = rel ? x + v : v; at() } break
      case 'V': for (const v of n) { y = rel ? y + v : v; at() } break
      case 'Z': x = sx; y = sy; break
    }
  }
  return x1 >= x0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
}

/** Room around a framed country, as a share of its larger side, and the smallest frame, as a share of the layer's larger side. */
const FRAME_PAD = 0.12
const FRAME_MIN = 0.03

/**
 * The view box that frames `box` in a layer of `w` × `h`: padded, at least FRAME_MIN of the layer, with the layer's own aspect (so the
 * map keeps its height), moved inside the layer where it fits; the whole layer when the frame would be as large.
 */
export function frameBox(box: Box, w: number, h: number): Box {
  const pad = Math.max(box.w, box.h) * FRAME_PAD
  const least = Math.max(w, h) * FRAME_MIN
  let fw = Math.max(box.w + 2 * pad, least), fh = Math.max(box.h + 2 * pad, least)
  if (fw / fh > w / h) fh = (fw * h) / w
  else fw = (fh * w) / h
  if (fw >= w || fh >= h) return { x: 0, y: 0, w, h }
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2
  return {
    x: Math.min(Math.max(cx - fw / 2, 0), w - fw),
    y: Math.min(Math.max(cy - fh / 2, 0), h - fh),
    w: fw,
    h: fh,
  }
}

/** The view box framing the shapes keyed `key` in `layer` (frameBox), or the whole layer when none has a box. */
function frameShapes(layer: MapLayer, shapes: MapShape[], key: string | undefined): Box {
  const boxes = key ? shapes.filter((s) => s.key === key).map((s) => pathBox(s.d)).filter((b): b is Box => !!b) : []
  if (!boxes.length) return { x: 0, y: 0, w: layer.w, h: layer.h }
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y))
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h))
  return frameBox({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, layer.w, layer.h)
}

/**
 * What the map draws with `at` open (undefined: the world; a country key; a province key): the country's provinces when
 * their shapes hold some of its species (they load on the first open), the whole country, or with a province open the
 * view box framing that province; else the world with the view box framing the country (no shapes, provinces the
 * shapes don't know, a shared link's made-up codes, or while they load). The Map view and its share image both draw this.
 */
export function mapLayer(world: MapCountries | null, provinces: MapProvinces | null, counts: PlaceCounts, at: string | undefined): { layer: MapLayer | null; shapes: MapShape[]; box: Box | null } {
  const group = mapGroupOf(at)
  const groupLayer = group !== undefined ? provinces?.groups[group] : undefined
  const inGroup = groupLayer ? mapShapes(groupLayer, counts, group) : []
  if (groupLayer && inGroup.some((x) => x.n > 0)) {
    return { layer: groupLayer, shapes: inGroup, box: frameShapes(groupLayer, inGroup, parsePlaceKey(at ?? '')?.level === 'province' ? at : undefined) }
  }
  if (!world) return { layer: null, shapes: [], box: null }
  const shapes = mapShapes(world, counts)
  // A province open without its country's shapes: the country framed, as with the country open.
  return { layer: world, shapes, box: frameShapes(world, shapes, group !== undefined ? `c:${group}` : at) }
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
 * borders and the Ink outlines of the hovered and the open place are map.css's.
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

/**
 * The places of the level the map shows, most species first (then by name): the world's countries, or, with a country
 * open, its states and provinces, with a province open its counties or districts, or the open place itself when its
 * birds have none further down. Only places with species. The list under the map and the share image's top five.
 */
export function mapRows(counts: PlaceCounts, at: string | undefined, label: (key: string) => string, locale?: string): PlaceOption[] {
  if (!at) return countryRows(counts, label, locale).filter((r) => r.count > 0)
  const rows = placeRows(counts, at, label, locale).filter((r) => r.count > 0)
  if (rows.length) return rows
  const own = placeCount(counts, at)
  return own > 0 ? [{ value: at, label: label(at), count: own, children: 0 }] : []
}

/** Whether pressing a shown place opens it: every country at the world level, a province with counties at a country's. */
export function mapOpens(row: PlaceOption, at: string | undefined): boolean {
  if (row.value === at) return false
  const level = parsePlaceKey(row.value)?.level
  return level === 'country' || (level === 'province' && row.children > 0)
}
