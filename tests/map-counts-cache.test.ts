// mapCounts keeps its last pass per list (shapes.ts): the same list and filter key return it; a new list, a new filter
// key or a new seen-here count again.
import { describe, expect, it } from 'vitest'
import { buildList } from '@/lib/list/build-list'
import { placeCounts, clearPlaces, applyFilter } from '@/lib/list/filters'
import { DEFAULT_RULES, EMPTY_EDITS, type SourceRecord } from '@/lib/list/model'
import { buildSeen } from '@/lib/list/seen'
import { mapCounts } from '@/lib/map/shapes'
import type { SpeciesIndex } from '@/lib/species/load'

const N = 5000
const rows = Array.from({ length: N }, (_, i) => ({ code: `sp${i}`, com: `sp${i}`, sci: `G${i % 300} sp${i}`, ord: `O${i % 20}`, fam: `F${i % 100}`, famCom: `F${i % 100}`, to: i }))
const species = { rows, byCode: new Map(rows.map((r) => [r.code, r])), search: () => [] } as unknown as SpeciesIndex
const isos = ['CA', 'US', 'MX', 'KE', 'FR']
const counties = isos.flatMap((c) => Array.from({ length: 20 }, (_, k) => `${c}-P${k % 4}|County ${k}`))
const records: SourceRecord[] = rows.map((r, i) => ({
  code: r.code, source: 'ebird', date: `20${10 + (i % 15)}-01-01`, place: { country: 'CA', sub1: 'CA-P0' },
  seen: Array.from({ length: 20 }, (_, j) => `2020-01-01|${counties[(i * 7 + j * 5) % counties.length]}`),
}))
const list = buildList(records, EMPTY_EDITS, DEFAULT_RULES)
const seen = buildSeen(records, EMPTY_EDITS, DEFAULT_RULES, list)
const reference = (l: typeof list, f: object) => placeCounts(applyFilter(l, f, species, seen), clearPlaces(f), species, seen)

describe('mapCounts cache', () => {
  it('a repeat call returns the cached counts; a new list, filter or seen-here recomputes', () => {
    const f = { order: 'O3', countries: ['KE'] }
    const first = mapCounts(list, f, species, seen)
    expect(first).toEqual(reference(list, f))
    // The same key from a new filter object (every filter action makes one): the same counts.
    expect(mapCounts(list, { countries: ['KE'], order: 'O3' }, species, seen)).toBe(first)

    const g = { order: 'O4' }
    const second = mapCounts(list, g, species, seen)
    expect(second).not.toBe(first)
    expect(second).toEqual(reference(list, g))

    const shorter = list.slice(1)
    const third = mapCounts(shorter, g, species, seen)
    expect(third).not.toBe(second)
    expect(third).toEqual(placeCounts(applyFilter(shorter, g, species, seen), clearPlaces(g), species, seen))

    const seen2 = buildSeen(records, EMPTY_EDITS, DEFAULT_RULES, list)
    expect(mapCounts(list, g, species, seen2)).not.toBe(second)
  })

  it.skipIf(process.env.SKIP_PERF === '1')('5,000 birds: the repeat is near free', () => {
    const f = { from: '2015-01', to: '2020-12' }
    let t = performance.now()
    mapCounts(list, f, species, seen)
    const cold = performance.now() - t
    t = performance.now()
    mapCounts(list, { ...f }, species, seen)
    const warm = performance.now() - t
    console.log(`[mapCounts] 5,000 birds: first ${cold.toFixed(1)} ms, repeat ${warm.toFixed(3)} ms`)
    expect(warm).toBeLessThan(5)
  })
})
