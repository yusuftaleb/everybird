// Places down to the county: the two eBird files (the quick life list download and the full MyEBirdData export)
// keep their own slots, so importing one never replaces the other; on a tie, the record with more place detail wins.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildList } from '@/lib/list/build-list'
import { fromJson, toJson } from '@/lib/list/export'
import { DEFAULT_RULES, EMPTY_EDITS, unmatchedKey, type ImportResult, type SourceRecord } from '@/lib/list/model'
import { emptySaved, migrateSaved, replaceSource, STORAGE_KEY } from '@/lib/list/storage'
import { makeReducer, initialState } from '@/lib/list/store'
import type { SpeciesIndex } from '@/lib/species/load'

const rec = (code: string, extra: Partial<SourceRecord> = {}): SourceRecord => ({ code, source: 'ebird', date: '2024-05-04', ...extra })
const result = (records: SourceRecord[], extra: Partial<ImportResult> = {}): ImportResult => ({ records, unmatched: [], skipped: 0, ...extra })

describe('buildList: more place detail wins a tie', () => {
  const build = (records: SourceRecord[]) => buildList(records, EMPTY_EDITS, DEFAULT_RULES)
  it('sub2 beats sub1 beats country on the same date, whatever the input order', () => {
    const county = rec('a', { place: { country: 'CA', sub1: 'CA-BC', sub2: 'Okanagan-Similkameen' } })
    const province = rec('a', { place: { country: 'CA', sub1: 'CA-BC' } })
    const country = rec('a', { place: { country: 'CA' } })
    expect(build([province, county])[0].place).toEqual(county.place)
    expect(build([county, province])[0].place).toEqual(county.place)
    expect(build([country, province])[0].place).toEqual(province.place)
    expect(build([rec('a'), country])[0].place).toEqual(country.place)
  })
  it('detail beats the source order on a tie, but never an earlier date', () => {
    const inatCounty = rec('a', { source: 'inat', place: { country: 'CA', sub1: 'CA-BC', sub2: 'X' } })
    const ebirdProvince = rec('a', { place: { country: 'CA', sub1: 'CA-BC' } })
    expect(build([ebirdProvince, inatCounty])[0].place?.sub2).toBe('X')
    const earlier = rec('a', { date: '2024-05-03', place: { country: 'CA' } })
    expect(build([inatCounty, earlier])[0].place).toEqual({ country: 'CA' })
  })
})

describe('the two eBird slots', () => {
  it('importing the life list download never replaces the MyEBirdData export, and back', () => {
    const full = rec('a', { place: { country: 'CA', sub1: 'CA-BC', sub2: 'Okanagan-Similkameen' } })
    const quick = rec('a', { place: { country: 'CA', sub1: 'CA-BC' } })
    let s = replaceSource(emptySaved(), 'ebird', result([full]))
    s = replaceSource(s, 'ebird-list', result([quick, rec('b')]))
    expect(s.records.ebird).toEqual([full])
    expect(s.records['ebird-list'].map((r) => r.code)).toEqual(['a', 'b'])
    s = replaceSource(s, 'ebird', result([full, rec('c')]))
    expect(s.records['ebird-list'].map((r) => r.code)).toEqual(['a', 'b'])
  })

  it('unmatched rows keep their slot, so each import replaces only its own and fixes never collide', () => {
    const u = (row: number) => ({ source: 'ebird' as const, row, reason: 'no-match' as const, com: `x${row}` })
    let s = replaceSource(emptySaved(), 'ebird', result([], { unmatched: [u(3)] }))
    s = replaceSource(s, 'ebird-list', result([], { unmatched: [u(3)] }))
    expect(s.unmatched.map(unmatchedKey)).toEqual(['ebird:3', 'ebird-list:3'])
    s = replaceSource(s, 'ebird-list', result([], { unmatched: [] }))
    expect(s.unmatched.map(unmatchedKey)).toEqual(['ebird:3'])
  })

  it('the store merges both slots: the county from the full export shows', () => {
    const species = { rows: [], byCode: new Map([['a', { code: 'a', to: 1 }]]), search: () => [] } as unknown as SpeciesIndex
    const reduce = makeReducer({ species, countryName: (c) => c })
    let st = reduce(initialState(), { type: 'import', source: 'ebird', result: result([rec('a', { place: { country: 'CA', sub1: 'CA-BC', sub2: 'Kootenay' } })]) })
    st = reduce(st, { type: 'import', source: 'ebird-list', result: result([rec('a', { place: { country: 'CA', sub1: 'CA-BC' } })]) })
    expect(st.list).toHaveLength(1)
    expect(st.list[0].place?.sub2).toBe('Kootenay')
    expect(st.list[0].sources).toEqual(['ebird'])
  })

  it('a fix on a life-list row is keyed by its slot and counts', () => {
    const species = { rows: [], byCode: new Map([['z', { code: 'z', to: 1 }]]), search: () => [] } as unknown as SpeciesIndex
    const reduce = makeReducer({ species, countryName: (c) => c })
    let st = reduce(initialState(), { type: 'import', source: 'ebird-list', result: result([], { unmatched: [{ source: 'ebird', row: 2, reason: 'no-match' }] }) })
    expect(st.openUnmatched).toHaveLength(1)
    st = reduce(st, { type: 'edit', edits: { ...st.saved.edits, fixes: { 'ebird-list:2': 'z' } } })
    expect(st.openUnmatched).toHaveLength(0)
    expect(st.list.map((e) => e.code)).toEqual(['z'])
  })
})

/** A list saved before the second eBird slot existed. */
const oldSaved = () => ({
  v: 1,
  records: { ebird: [rec('a')], inat: [], manual: [] },
  unmatched: [{ source: 'ebird', row: 4, reason: 'no-match' }],
  edits: { removed: [], added: [], marks: {}, fixes: { 'ebird:4': 'a' } },
  rules: { ...DEFAULT_RULES },
  skipped: { ebird: 2 },
  savedAt: '2026-01-01T00:00:00.000Z',
})

describe('older lists and backups keep loading', () => {
  beforeEach(() => {
    ;(globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('migrateSaved adds the empty life-list slot and keeps everything else', () => {
    const m = migrateSaved(oldSaved() as never)
    expect(m.records['ebird-list']).toEqual([])
    expect(m.records.ebird).toEqual([rec('a')])
    expect(m.edits.fixes).toEqual({ 'ebird:4': 'a' })
    expect(unmatchedKey(m.unmatched[0])).toBe('ebird:4')
    const current = emptySaved()
    expect(migrateSaved(current)).toBe(current) // nothing to do: same object
  })

  it('a backup from before the second slot restores, and a new backup round-trips both slots', () => {
    const restored = fromJson(JSON.stringify(oldSaved()))
    expect(restored.records['ebird-list']).toEqual([])
    expect(restored.records.ebird).toHaveLength(1)
    const both = { ...emptySaved(), records: { ebird: [rec('a')], 'ebird-list': [rec('b')], inat: [], manual: [] } }
    expect(fromJson(toJson(both)).records['ebird-list']).toEqual([rec('b')])
    const withSlot = { ...both, unmatched: [{ source: 'ebird' as const, slot: 'ebird-list' as const, row: 1, reason: 'no-match' as const }], skipped: { 'ebird-list': 3 } }
    const back = fromJson(toJson(withSlot))
    expect(unmatchedKey(back.unmatched[0])).toBe('ebird-list:1')
    expect(back.skipped).toEqual({ 'ebird-list': 3 })
    expect(() => fromJson(JSON.stringify({ ...withSlot, unmatched: [{ source: 'ebird', slot: 'nope', row: 1, reason: 'no-match' }] }))).toThrow()
    // A slot must belong to the row's source.
    expect(() => fromJson(JSON.stringify({ ...withSlot, unmatched: [{ source: 'inat', slot: 'ebird-list', row: 1, reason: 'no-match' }] }))).toThrow('unmatched')
    expect(() => fromJson(JSON.stringify({ ...withSlot, unmatched: [{ source: 'ebird', slot: 'inat', row: 1, reason: 'no-match' }] }))).toThrow('unmatched')
  })

  it('a list stored under everybird:v1 in the old shape loads migrated, and is rewritten in place', async () => {
    vi.resetModules()
    const storage = await import('@/lib/list/storage')
    const { createStore, get, set } = await import('idb-keyval')
    const kv = createStore('everybird', 'kv')
    await set(STORAGE_KEY, oldSaved(), kv)
    const got = await storage.load()
    expect(got!.records['ebird-list']).toEqual([])
    expect(got!.records.ebird).toHaveLength(1)
    await vi.waitFor(async () => expect(((await get(STORAGE_KEY, kv)) as { records: Record<string, unknown> }).records['ebird-list']).toEqual([]))
  })
})
