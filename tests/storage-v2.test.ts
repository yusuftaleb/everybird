import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildList } from '@/lib/list/build-list'
import { fromJson, toCsv, toJson } from '@/lib/list/export'
import { DEFAULT_RULES, EMPTY_EDITS } from '@/lib/list/model'
import { buildSeen } from '@/lib/list/seen'
import { emptySaved, migrateSaved, STORAGE_KEY } from '@/lib/list/storage'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Regions } from '@/lib/species/types'

/** A list saved by v1 (no seen-here anywhere). */
const v1 = () => ({
  v: 1,
  records: { ebird: [{ code: 'a', source: 'ebird', date: '2020-01-01', place: { country: 'CA', sub1: 'CA-BC' } }], 'ebird-list': [], inat: [], manual: [] },
  unmatched: [],
  edits: { removed: [], added: [], marks: {}, fixes: {} },
  rules: { ...DEFAULT_RULES },
  savedAt: '2026-01-01T00:00:00.000Z',
})
const withSeen = () => ({
  ...emptySaved(),
  records: { ebird: [{ code: 'a', source: 'ebird' as const, seen: ['2020-01-01|CA-BC|Capital', '2021-01-01|US'] }], 'ebird-list': [], inat: [], manual: [] },
  unmatched: [{ source: 'ebird' as const, row: 3, reason: 'no-match' as const, seen: ['2020-01-01|MX'] }],
})

describe('Saved v2', () => {
  it('a v1 list migrates (to the current v4) unchanged otherwise: it just has no seen-here until re-imported', () => {
    const m = migrateSaved(v1() as never)
    expect(m.v).toBe(4)
    expect(m.records.ebird).toEqual(v1().records.ebird)
    const current = emptySaved()
    expect(migrateSaved(current)).toBe(current)
  })
  it('backups round-trip seen-here', () => {
    const s = withSeen()
    const text = toJson(s)
    expect(JSON.parse(text).v).toBe(4)
    expect(fromJson(text)).toEqual(s)
  })
  it('v1 backups restore as v4', () => {
    const r = fromJson(JSON.stringify(v1()))
    expect(r.v).toBe(4)
    expect(r.records.ebird[0].seen).toBeUndefined()
  })
  it('malformed seen-here and unknown versions are refused', () => {
    expect(() => fromJson(JSON.stringify({ ...withSeen(), v: 5 }))).toThrow(/version/i)
    const bad = withSeen() as unknown as { records: { ebird: { seen: unknown }[] } }
    bad.records.ebird[0].seen = [1, 2]
    expect(() => fromJson(JSON.stringify(bad))).toThrow(/records/)
    const badU = withSeen() as unknown as { unmatched: { seen: unknown }[] }
    badU.unmatched[0].seen = 'x'
    expect(() => fromJson(JSON.stringify(badU))).toThrow(/unmatched/)
  })
})

describe('a v1 list on the device', () => {
  beforeEach(() => {
    ;(globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  })
  afterEach(() => vi.unstubAllGlobals())
  it('loads as v4 and is rewritten in place', async () => {
    vi.resetModules()
    const storage = await import('@/lib/list/storage')
    const { createStore, get, set } = await import('idb-keyval')
    const kv = createStore('everybird', 'kv')
    await set(STORAGE_KEY, v1(), kv)
    expect((await storage.load())!.v).toBe(4)
    await vi.waitFor(async () => expect(((await get(STORAGE_KEY, kv)) as { v: number }).v).toBe(4))
  })
})

describe('CSV export', () => {
  const regions: Regions = { v: 1, countries: { CA: 'Canada', US: 'United States of America', MX: 'Mexico' }, sub1: { 'CA-BC': 'British Columbia' } }
  const species = { byCode: new Map([['a', { code: 'a', com: 'A', sci: 'Aa' }]]) } as unknown as SpeciesIndex
  it('keeps every existing column and adds the countries each species was seen in, last', () => {
    const records = [{ code: 'a', source: 'ebird' as const, date: '2020-01-01', place: { country: 'CA', sub1: 'CA-BC' }, seen: ['2020-01-01|CA-BC', '2021-01-01|US', '2019-06-01|MX'] }]
    const list = buildList(records, EMPTY_EDITS, DEFAULT_RULES)
    const seen = buildSeen(records, EMPTY_EDITS, DEFAULT_RULES, list)
    const out = toCsv(list, species, regions, seen)
    const [head, row] = out.split('\r\n')
    expect(head).toBe('eBird code,Common name,Scientific name,First date,Place,Country,Heard only,Found dead,Sources,Countries seen')
    expect(row).toBe('a,A,Aa,2020-01-01,"British Columbia, Canada",Canada,,,ebird,Canada; Mexico; United States of America')
  })
})
