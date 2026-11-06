import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fromJson, toJson } from '@/lib/list/export'
import { DEFAULT_RULES } from '@/lib/list/model'
import type { ImportResult, SourceRecord, Unmatched } from '@/lib/list/model'
import { emptySaved, migrateSaved, removeSource, replaceSource, STORAGE_KEY, type Saved } from '@/lib/list/storage'
import { initialState, makeReducer, type StoreContext } from '@/lib/list/store'

const rec = (code: string, source: SourceRecord['source'] = 'ebird', extra: Partial<SourceRecord> = {}): SourceRecord => ({ code, source, date: '2020-01-01', ...extra })
const result = (records: SourceRecord[], unmatched: Unmatched[] = [], skipped = 0): ImportResult => ({ records, unmatched, skipped })

/** A list saved by v2 (seen-here, both eBird slots, no source details). */
const v2 = () => ({
  v: 2,
  records: { ebird: [rec('a', 'ebird', { seen: ['2020-01-01|CA-BC'] })], 'ebird-list': [rec('b')], inat: [rec('c', 'inat')], manual: [] },
  unmatched: [{ source: 'inat', row: 4, reason: 'no-match' }],
  edits: { removed: [], added: [], marks: { a: { heard: true } }, fixes: { 'inat:4': 'd' } },
  rules: { ...DEFAULT_RULES },
  name: 'Sam',
  skipped: { ebird: 2 },
  savedAt: '2026-01-01T00:00:00.000Z',
})
/** v1: no seen-here, no second eBird slot. */
const v1 = () => ({
  v: 1,
  records: { ebird: [rec('a')], inat: [], manual: [] },
  unmatched: [],
  edits: { removed: [], added: [], marks: {}, fixes: {} },
  rules: { ...DEFAULT_RULES },
  savedAt: '2025-01-01T00:00:00.000Z',
})

const AT = '2026-11-06T10:00:00.000Z'
const withSources = (): Saved => ({
  ...emptySaved(),
  records: { ebird: [rec('a')], 'ebird-list': [rec('b')], inat: [rec('c', 'inat')], manual: [] },
  sources: {
    ebird: { kind: 'full-export', file: 'MyEBirdData.csv', rows: 4212, at: AT },
    'ebird-list': { kind: 'life-list', file: 'ebird_world_life_list.csv', rows: 812, at: AT },
    inat: { user: 'sam_birds', observations: 576, at: AT },
  },
})

describe('Saved v3: source details', () => {
  it('new lists are v3, with no source details yet', () => {
    const s = emptySaved()
    expect(s.v).toBe(3)
    expect(s.sources ?? {}).toEqual({})
  })

  it('a v2 list migrates to v3 keeping everything; its sources have no details (shown as unknown)', () => {
    const m = migrateSaved(v2() as never)
    expect(m.v).toBe(3)
    const { v: _v, ...rest } = v2()
    void _v
    expect(m).toMatchObject(rest)
    expect(m.sources).toBeUndefined()
    const current = emptySaved()
    expect(migrateSaved(current)).toBe(current)
  })

  it('a v1 list migrates to v3 and gains the empty life-list slot', () => {
    const m = migrateSaved(v1() as never)
    expect(m.v).toBe(3)
    expect(m.records['ebird-list']).toEqual([])
    expect(m.records.ebird).toEqual([rec('a')])
  })
})

describe('replace, refresh and remove one source', () => {
  it('replaceSource records the source details, and only for that slot', () => {
    let s = replaceSource(emptySaved(), 'ebird', result([rec('a')]), { kind: 'full-export', file: 'MyEBirdData.csv', rows: 10, at: AT })
    s = replaceSource(s, 'inat', result([rec('c', 'inat')]), { user: 'sam_birds', observations: 3, at: AT })
    expect(s.sources).toEqual({ ebird: { kind: 'full-export', file: 'MyEBirdData.csv', rows: 10, at: AT }, inat: { user: 'sam_birds', observations: 3, at: AT } })
    // A replacement overwrites that slot's details.
    s = replaceSource(s, 'ebird', result([rec('a'), rec('e')]), { kind: 'full-export', file: 'MyEBirdData (1).csv', rows: 12, at: AT })
    expect(s.sources?.ebird?.file).toBe('MyEBirdData (1).csv')
    expect(s.sources?.inat?.user).toBe('sam_birds')
  })

  it('a refresh replaces only iNaturalist records, unmatched rows and seen-here, and keeps edits, marks and fixes', () => {
    const start = migrateSaved(v2() as never)
    const edited: Saved = { ...start, edits: { ...start.edits, removed: ['b'], added: [rec('z', 'manual')] } }
    const fresh = replaceSource(edited, 'inat', result([rec('c', 'inat', { seen: ['2024-01-01|MX'] }), rec('f', 'inat')], [{ source: 'inat', row: 9, reason: 'no-match' }], 1), { user: 'sam_birds', observations: 600, at: AT })
    expect(fresh.records.inat.map((r) => r.code)).toEqual(['c', 'f'])
    expect(fresh.records.inat[0].seen).toEqual(['2024-01-01|MX'])
    expect(fresh.records.ebird).toEqual(start.records.ebird)
    expect(fresh.records['ebird-list']).toEqual(start.records['ebird-list'])
    expect(fresh.unmatched).toEqual([{ source: 'inat', row: 9, reason: 'no-match' }])
    expect(fresh.edits).toEqual(edited.edits)
    expect(fresh.skipped).toEqual({ ebird: 2, inat: 1 })
    expect(fresh.sources?.inat).toEqual({ user: 'sam_birds', observations: 600, at: AT })
    expect(fresh.name).toBe('Sam')
  })

  it('removeSource drops that slot\'s records, unmatched rows, skipped count and details, and nothing else', () => {
    const s: Saved = {
      ...withSources(),
      unmatched: [
        { source: 'ebird', slot: 'ebird-list', row: 2, reason: 'no-match' },
        { source: 'ebird', row: 2, reason: 'no-match' },
        { source: 'inat', row: 3, reason: 'not-species' },
      ],
      skipped: { ebird: 1, 'ebird-list': 2, inat: 3 },
      edits: { removed: ['x'], added: [rec('m', 'manual')], marks: { a: { dead: true } }, fixes: { 'ebird-list:2': 'q' } },
    }
    const out = removeSource(s, 'ebird-list')
    expect(out.records['ebird-list']).toEqual([])
    expect(out.records.ebird).toEqual(s.records.ebird)
    expect(out.unmatched).toEqual([{ source: 'ebird', row: 2, reason: 'no-match' }, { source: 'inat', row: 3, reason: 'not-species' }])
    expect(out.skipped).toEqual({ ebird: 1, inat: 3 })
    expect(out.sources).toEqual({ ebird: s.sources!.ebird, inat: s.sources!.inat })
    expect(out.edits).toEqual(s.edits)
    const noInat = removeSource(out, 'inat')
    expect(noInat.records.inat).toEqual([])
    expect(noInat.sources).toEqual({ ebird: s.sources!.ebird })
  })

  it('the store: import carries details, remove drops a source and the list rebuilds', () => {
    const ctx: StoreContext = {
      species: { rows: [], byCode: new Map(), search: () => [] } as never,
      countryName: (c) => c,
    }
    const reduce = makeReducer(ctx)
    let st = reduce(initialState(), { type: 'import', source: 'ebird', result: result([rec('a')]), details: { kind: 'full-export', file: 'f.csv', rows: 1, at: AT } })
    st = reduce(st, { type: 'import', source: 'inat', result: result([rec('c', 'inat')]), details: { user: 'sam_birds', observations: 1, at: AT } })
    st = reduce(st, { type: 'edit', edits: { ...st.saved.edits, marks: { a: { heard: true } } } })
    expect(st.list.map((e) => e.code).sort()).toEqual(['a', 'c'])
    expect(st.saved.sources?.ebird?.file).toBe('f.csv')
    st = reduce(st, { type: 'remove-source', source: 'inat' })
    expect(st.list.map((e) => e.code)).toEqual(['a'])
    expect(st.saved.sources?.inat).toBeUndefined()
    expect(st.saved.edits.marks).toEqual({ a: { heard: true } })
  })
})

describe('backups with source details', () => {
  it('round-trip as v3', () => {
    const s = withSources()
    const text = toJson(s)
    expect(JSON.parse(text).v).toBe(3)
    expect(fromJson(text)).toEqual(s)
  })
  it('v2 and v1 backups restore as v3 without details', () => {
    const a = fromJson(JSON.stringify(v2()))
    expect(a.v).toBe(3)
    expect(a.sources).toBeUndefined()
    expect(a.edits.fixes).toEqual({ 'inat:4': 'd' })
    const b = fromJson(JSON.stringify(v1()))
    expect(b.v).toBe(3)
    expect(b.records['ebird-list']).toEqual([])
  })
  it('malformed details and unknown versions are refused', () => {
    expect(() => fromJson(JSON.stringify({ ...withSources(), v: 4 }))).toThrow(/version/i)
    expect(() => fromJson(JSON.stringify({ ...withSources(), sources: { bogus: {} } }))).toThrow(/source details/)
    expect(() => fromJson(JSON.stringify({ ...withSources(), sources: { inat: { user: 5 } } }))).toThrow(/source details/)
    expect(() => fromJson(JSON.stringify({ ...withSources(), sources: { ebird: { kind: 'life-list', rows: 'many' } } }))).toThrow(/source details/)
    expect(() => fromJson(JSON.stringify({ ...withSources(), sources: { ebird: { kind: 'nope' } } }))).toThrow(/source details/)
    expect(() => fromJson(JSON.stringify({ ...withSources(), sources: [] }))).toThrow(/source details/)
  })
})

describe('a v2 list on the device', () => {
  beforeEach(() => {
    ;(globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  })
  afterEach(() => vi.unstubAllGlobals())
  it('loads as v3 and is rewritten in place', async () => {
    vi.resetModules()
    const storage = await import('@/lib/list/storage')
    const { createStore, get, set } = await import('idb-keyval')
    const kv = createStore('everybird', 'kv')
    await set(STORAGE_KEY, v2(), kv)
    const got = await storage.load()
    expect(got!.v).toBe(3)
    expect(got!.records.inat).toHaveLength(1)
    await vi.waitFor(async () => expect(((await get(STORAGE_KEY, kv)) as { v: number }).v).toBe(3))
  })
})
