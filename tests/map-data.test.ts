// The committed map shapes (scripts/build-data/build-map.ts): every id is a Places key, every province sits in the group
// its key's parent names, and every path stays inside its box without a long jump (a wrap at the antimeridian).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parentKey, parsePlaceKey } from '@/lib/list/place-keys'
import type { MapCountries, MapLayer, MapProvinces } from '@/lib/map/shapes'

const read = <T>(name: string) => JSON.parse(readFileSync(`public/data/${name}`, 'utf8')) as T
const world = read<MapCountries>('map-countries.v1.json')
const provinces = read<MapProvinces>('map-provinces.v1.json')
const regions = read<{ countries: Record<string, string>; sub1: Record<string, string> }>('regions.v1.json')

/** The longest segment of a path, after checking its commands and that every point is inside the layer. */
function longest(d: string, layer: MapLayer): number {
  expect(d).toMatch(/^(M-?\d+ -?\d+(l[-\d ]+|h2v2h-2)z)+$/)
  let max = 0
  for (const loop of d.split('z').filter(Boolean)) {
    const [start, rest = ''] = loop.slice(1).split('l')
    let [x, y] = start.split(' ').map(Number)
    const n = rest.match(/-?\d+/g)?.map(Number) ?? []
    for (let i = 0; i + 1 < n.length; i += 2) {
      x += n[i]
      y += n[i + 1]
      max = Math.max(max, Math.hypot(n[i], n[i + 1]))
      expect(x >= 0 && x <= layer.w && y >= 0 && y <= layer.h).toBe(true)
    }
  }
  return max
}

describe('the map shapes', () => {
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

  it('provinces: every code a region, in the group its key belongs to', () => {
    let n = 0
    for (const [group, layer] of Object.entries(provinces.groups)) {
      expect(Math.max(layer.w, layer.h)).toBe(1000)
      for (const [code, d] of Object.entries(layer.d)) {
        expect(Object.hasOwn(regions.sub1, code), code).toBe(true)
        expect(parentKey(`s:${code}`), code).toBe(`c:${group}`)
        longest(d, layer)
        n++
      }
    }
    expect(n).toBeGreaterThan(3500)
    expect(Object.keys(provinces.groups['US@OC'].d)).toContain('US-HI')
    expect(Object.keys(provinces.groups.US.d)).not.toContain('US-HI')
    // French departments are dissolved into the regions the app uses.
    expect(Object.keys(provinces.groups.FR.d)).toContain('FR-ARA')
    expect(Object.keys(provinces.groups.FR.d)).not.toContain('FR-01')
  })
})
