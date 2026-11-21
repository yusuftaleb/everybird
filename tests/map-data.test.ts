// The committed map shapes (scripts/build-data/build-map.ts): every id is a Places key, and every path stays inside its
// box without a long jump (a wrap at the antimeridian). The world keeps one decimal place (the Map zooms).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parsePlaceKey } from '@/lib/list/place-keys'
import type { MapCountries, MapLayer } from '@/lib/map/shapes'
import { MAP_EDGE } from '@/lib/map/zoom'

const read = <T>(name: string) => JSON.parse(readFileSync(`public/data/${name}`, 'utf8')) as T
const world = read<MapCountries>('map-countries.v1.json')
const regions = read<{ countries: Record<string, string>; sub1: Record<string, string> }>('regions.v1.json')

/** A number as build-map.ts writes it: at most one decimal place, no leading zero ("12", "-1.5", ".5", "-.5"). */
const NUM = /-?(?:\d+(?:\.\d)?|\.\d)/g
const N = NUM.source
/** A sum kept to one decimal place, so float error never puts a point a hair outside its box. */
const add = (a: number, b: number) => Math.round((a + b) * 10) / 10

/** The longest segment of a path, after checking its commands and that every point is inside the layer. */
function longest(d: string, layer: MapLayer): number {
  expect(d).toMatch(new RegExp(`^(M${N} ${N}(l(${N}| )+|h2v2h-2)z)+$`))
  let max = 0
  for (const loop of d.split('z').filter(Boolean)) {
    const [start, rest = ''] = loop.slice(1).split('l')
    let [x, y] = start.split(' ').map(Number)
    const n = rest.match(NUM)?.map(Number) ?? []
    for (let i = 0; i + 1 < n.length; i += 2) {
      x = add(x, n[i])
      y = add(y, n[i + 1])
      max = Math.max(max, Math.hypot(n[i], n[i + 1]))
      expect(x >= 0 && x <= layer.w && y >= 0 && y <= layer.h).toBe(true)
    }
  }
  return max
}

/** Each loop's points, absolute. */
function loops(d: string): [number, number][][] {
  return d.split('z').filter(Boolean).map((loop) => {
    if (loop.endsWith('h2v2h-2')) {
      const [x, y] = loop.slice(1, -7).split(' ').map(Number)
      return [[x, y], [x + 2, y + 2]]
    }
    const [start, rest = ''] = loop.slice(1).split('l')
    let [x, y] = start.split(' ').map(Number)
    const pts: [number, number][] = [[x, y]]
    const n = rest.match(NUM)?.map(Number) ?? []
    for (let i = 0; i + 1 < n.length; i += 2) pts.push([(x = add(x, n[i])), (y = add(y, n[i + 1]))])
    return pts
  })
}

describe('the map shapes', () => {
  it('a carved place is drawn once: no loop of its country lies inside it', () => {
    for (const [part, country] of [['GF', 'FR'], ['SJ', 'NO'], ['BQ', 'NL'], ['CX', 'AU'], ['CC', 'AU']]) {
      const pts = loops(world.d[part]).flat()
      const [x0, x1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))]
      const [y0, y1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))]
      for (const loop of loops(world.d[country])) {
        const cx = loop.reduce((s, p) => s + p[0], 0) / loop.length
        const cy = loop.reduce((s, p) => s + p[1], 0) / loop.length
        expect(cx >= x0 - 1 && cx <= x1 + 1 && cy >= y0 - 1 && cy <= y1 + 1, `${country} over ${part}`).toBe(false)
      }
    }
    // Countries the app lists that Natural Earth has only as admin-1 features; High Seas (XX) alone has no shape.
    for (const id of ['SJ', 'BQ', 'BV', 'CC', 'CX', 'CP', 'GI', 'TK', 'UM', 'AC', 'CS', 'QY', 'QZ']) expect(Object.keys(world.d)).toContain(id)
    expect(Object.keys(world.d)).not.toContain('NL@NA')
  })

  it('the world: one shape per country, the overseas parts their own place', () => {
    const ids = Object.keys(world.d)
    expect(ids.length).toBeGreaterThan(240)
    for (const id of ids) {
      const p = parsePlaceKey(`c:${id}`)
      expect(p?.level, id).toBe('country')
      expect(Object.hasOwn(regions.countries, p!.country), id).toBe(true)
    }
    for (const id of ['US@OC', 'GF', 'RE', 'CA', 'FR', 'RU', 'AQ']) expect(ids).toContain(id)
    // Antarctica's ring runs along the bottom edge (Equal Earth draws the pole as a line): no other shape jumps a quarter of the width.
    for (const [id, d] of Object.entries(world.d)) if (id !== 'AQ') expect(longest(d, world), id).toBeLessThan(world.w / 4)
  })

  it('the world holds up at the deepest zoom: its typical edge no longer than twice the 1:50m source\'s (MAP_EDGE)', () => {
    const lens: number[] = []
    for (const d of Object.values(world.d)) for (const loop of loops(d)) for (let i = 1; i < loop.length; i++) lens.push(Math.hypot(loop[i][0] - loop[i - 1][0], loop[i][1] - loop[i - 1][1]))
    lens.sort((a, b) => a - b)
    expect(lens[lens.length >> 1]).toBeLessThanOrEqual(2 * MAP_EDGE)
    expect(Object.values(world.d).some((d) => /\d\.\d/.test(d))).toBe(true) // one decimal place, not whole units
  })
})
