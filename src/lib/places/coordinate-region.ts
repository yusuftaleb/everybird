import { fetchData } from '@/lib/data-url'
import type { DataFile } from '@/lib/data-files'

type Point = [longitude: number, latitude: number]
type Polygon = Point[][]
export type ProvinceBoundaries = Record<string, Polygon[]>
export type CoordinateRegion = (longitude: unknown, latitude: unknown, accuracyMetres?: unknown) => string | undefined

function number(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && /^[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(value.trim())) {
    return Number(value.trim().replace(',', '.'))
  }
  return NaN
}

export function coordinates(longitude: unknown, latitude: unknown): Point | undefined {
  const x = number(longitude)
  const y = number(latitude)
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 180 && Math.abs(y) <= 90 ? [x, y] : undefined
}

/** Return whether a point lies confidently inside/outside a ring, or undefined near the boundary. */
function ringContains(ring: Point[], x: number, y: number, radius: number, scaleX: number): boolean | undefined {
  let inside = false
  for (let j = 0, i = 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j]
    const [bx, by] = ring[i]
    if ((ay > y) !== (by > y) && x < ax + ((bx - ax) * (y - ay)) / (by - ay)) inside = !inside
    if (y < Math.min(ay, by) - radius || y > Math.max(ay, by) + radius ||
        x < Math.min(ax, bx) - radius / scaleX || x > Math.max(ax, bx) + radius / scaleX) continue
    const dx = (bx - ax) * scaleX
    const dy = by - ay
    const px = (x - ax) * scaleX
    const py = y - ay
    const length = dx * dx + dy * dy
    const t = length ? Math.max(0, Math.min(1, (px * dx + py * dy) / length)) : 0
    if ((px - dx * t) ** 2 + (py - dy * t) ** 2 <= radius ** 2) return undefined
  }
  return inside
}

export function makeCoordinateRegion(boundaries: ProvinceBoundaries): CoordinateRegion {
  const shapes = Object.entries(boundaries).flatMap(([region, polygons]) => polygons.map(([outer, ...holes]) => {
    let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity
    for (const [x, y] of outer) {
      west = Math.min(west, x)
      east = Math.max(east, x)
      south = Math.min(south, y)
      north = Math.max(north, y)
    }
    return { region, outer, holes, west, east, south, north }
  }))

  return (longitude, latitude, accuracyMetres) => {
    const point = coordinates(longitude, latitude)
    if (!point) return undefined
    const [x, y] = point
    const accuracy = accuracyMetres == null || accuracyMetres === '' ? 0 : number(accuracyMetres)
    if (!Number.isFinite(accuracy) || accuracy < 0 || Math.abs(y) > 80) return undefined
    // 500 m covers simplification and rounding of the boundary file, beyond stated positional uncertainty.
    const radius = (500 + accuracy) / 110_000
    const scaleX = Math.cos(y * Math.PI / 180)
    let matched: string | undefined
    for (const { region, outer, holes, west, east, south, north } of shapes) {
      if (x < west - radius / scaleX || x > east + radius / scaleX || y < south - radius || y > north + radius) continue
      const contains = ringContains(outer, x, y, radius, scaleX)
      if (contains === undefined) return undefined
      if (!contains) continue
      const exclusions = holes.map((ring) => ringContains(ring, x, y, radius, scaleX))
      if (exclusions.includes(undefined)) return undefined
      if (exclusions.includes(true)) continue
      if (matched && matched !== region) return undefined
      matched = region
    }
    return matched
  }
}

const BOUNDARY_FILES: Record<string, DataFile> = {
  SI: 'slovenia-boundaries.v1.json',
  VN: 'vietnam-boundaries.v1.json',
}
const coordinateLookups = new Map<string, Promise<CoordinateRegion | undefined>>()

export function hasCoordinateBoundaries(country: string): boolean {
  return Object.hasOwn(BOUNDARY_FILES, country)
}

/** Only the public boundary asset is fetched. Coordinates are processed in memory on the device. */
export function loadCoordinateRegion(country: string): Promise<CoordinateRegion | undefined> {
  if (!hasCoordinateBoundaries(country)) return Promise.resolve(undefined)
  const cached = coordinateLookups.get(country)
  if (cached) return cached
  const lookup = fetchData<ProvinceBoundaries>(BOUNDARY_FILES[country])
    .then(makeCoordinateRegion)
    .catch(() => {
      coordinateLookups.delete(country)
      return undefined
    })
  coordinateLookups.set(country, lookup)
  return lookup
}

export const loadVietnamCoordinateRegion = () => loadCoordinateRegion('VN')
