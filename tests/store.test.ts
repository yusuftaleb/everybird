import { NAME_MAX } from '@/lib/list/storage'
import { NAME_MAX as LINK_NAME_MAX } from '@/lib/share/link'
import { describe, expect, it } from 'vitest'
import type { ImportResult, SourceRecord } from '@/lib/list/model'
import { DEFAULT_RULES, EMPTY_EDITS } from '@/lib/list/model'
import { emptySaved } from '@/lib/list/storage'
import { initialState, makeReducer, type Action, type AppState } from '@/lib/list/store'
import type { SpeciesIndex } from '@/lib/species/load'

const row = (code: string, ord: string, fam: string, to: number) => ({ code, com: code, sci: code, ord, fam, famCom: fam, to }) as never
const rows = [
  row('duck', 'Anseriformes', 'Anatidae', 1),
  row('crow', 'Passeriformes', 'Corvidae', 10),
  row('wren', 'Passeriformes', 'Troglodytidae', 12),
]
const species: SpeciesIndex = { rows, byCode: new Map(rows.map((r) => [(r as { code: string }).code, r])), search: () => [] }
const reduce = makeReducer({ species, countryName: (c) => c })
const run = (s: AppState, ...as: Action[]) => as.reduce(reduce, s)
const rec = (code: string, source: SourceRecord['source'], country = 'CA', date = '2020-01-02'): SourceRecord => ({ code, source, date, place: { country } })
const result = (records: SourceRecord[], unmatched: ImportResult['unmatched'] = []): ImportResult => ({ records, unmatched, skipped: 0 })

describe('store reducer', () => {
  it('import replaces only that source', () => {
    let s = run(initialState(), { type: 'import', source: 'ebird', result: result([rec('duck', 'ebird')]) })
    s = run(s, { type: 'edit', edits: { ...EMPTY_EDITS, removed: ['zzz'] } }, { type: 'rules', rules: { ...DEFAULT_RULES, hideDead: true } })
    s = run(s, { type: 'import', source: 'inat', result: result([rec('crow', 'inat')]) })
    s = run(s, { type: 'import', source: 'inat', result: result([rec('wren', 'inat')]) })
    expect(s.saved.records.ebird.map((r) => r.code)).toEqual(['duck'])
    expect(s.saved.records.inat.map((r) => r.code)).toEqual(['wren'])
    expect(s.saved.edits.removed).toEqual(['zzz'])
    expect(s.saved.rules.hideDead).toBe(true)
    expect(s.list.map((e) => e.code)).toEqual(['duck', 'wren'])
  })

  it('edit recomputes list', () => {
    let s = run(initialState(), { type: 'import', source: 'ebird', result: result([rec('duck', 'ebird'), rec('crow', 'ebird')]) })
    s = run(s, { type: 'edit', edits: { ...EMPTY_EDITS, removed: ['duck'] } })
    expect(s.list.map((e) => e.code)).toEqual(['crow'])
  })

  it('sorts by taxon order and never yields NaN for unknown codes', () => {
    const s = run(initialState(), { type: 'import', source: 'ebird', result: result([rec('mystery', 'ebird'), rec('wren', 'ebird'), rec('duck', 'ebird')]) })
    expect(s.list.map((e) => e.code)).toEqual(['duck', 'wren', 'mystery'])
  })

  it('filter drops invalid family when order changes, and any trip (trips are gone)', () => {
    let s = run(initialState(), { type: 'import', source: 'ebird', result: result([rec('duck', 'ebird'), rec('crow', 'ebird')]) })
    s = run(s, { type: 'filter', filter: { order: 'Passeriformes', family: 'Corvidae' } })
    expect(s.filter).toEqual({ order: 'Passeriformes', family: 'Corvidae' })
    s = run(s, { type: 'filter', filter: { order: 'Anseriformes', family: 'Corvidae' } })
    expect(s.filter).toEqual({ order: 'Anseriformes' })
    s = run(s, { type: 'filter', filter: { family: 'Anatidae' } }) // family without order
    expect(s.filter).toEqual({})
    s = run(s, { type: 'filter', filter: { trip: 'EG-2026-09-01' } as never }) // state from before trips were removed
    expect(s.filter).toEqual({})
  })

  it('turns a year into its range and ignores an old trip value', () => {
    const recs = [rec('duck', 'ebird', 'CA', '2019-01-01'), rec('crow', 'ebird', 'CA', '2019-01-02'), rec('wren', 'ebird', 'CA', '2019-01-03'), rec('a', 'ebird', 'CA', '2019-01-04')]
    const eg = ['x', 'y', 'z'].map((c, i) => rec(c, 'ebird', 'EG', `2026-09-0${i + 1}`))
    let s = run(initialState(), { type: 'import', source: 'ebird', result: result([...recs, ...eg]) })
    expect('trips' in s).toBe(false)
    s = run(s, { type: 'filter', filter: { year: '2026', trip: 'EG-2026-09-01' } as never })
    expect(s.filter).toEqual({ from: '2026-01', to: '2026-12' })
    s = run(s, { type: 'filter', filter: { year: '2019' } })
    expect(s.filter).toEqual({ from: '2019-01', to: '2019-12' })
  })

  it('repairs a range: bad ends go, reversed ends swap; a range that no longer matches goes after a list change', () => {
    let s = run(initialState(), { type: 'import', source: 'ebird', result: result([rec('duck', 'ebird', 'CA', '2019-03-01'), rec('crow', 'ebird', 'CA', '2020-05')]) })
    s = run(s, { type: 'filter', filter: { from: '2020-13', to: 'soon' } })
    expect(s.filter).toEqual({})
    s = run(s, { type: 'filter', filter: { from: '2020-06', to: '2019-01' } })
    expect(s.filter).toEqual({ from: '2019-01', to: '2020-06' })
    s = run(s, { type: 'filter', filter: { from: '2020-01', to: '2020-12' } })
    s = run(s, { type: 'import', source: 'ebird', result: result([rec('duck', 'ebird', 'CA', '2019-03-01')]) })
    expect(s.filter).toEqual({})
  })

  it('drops filter values that vanish after a list change', () => {
    let s = run(initialState(), { type: 'import', source: 'ebird', result: result([rec('duck', 'ebird', 'EG'), rec('crow', 'ebird', 'CA')]) })
    s = run(s, { type: 'filter', filter: { countries: ['EG'], order: 'Anseriformes' } })
    s = run(s, { type: 'import', source: 'ebird', result: result([rec('crow', 'ebird', 'CA')]) })
    expect(s.filter).toEqual({})
  })

  it('a fix becomes a record using the unmatched row date and place', () => {
    const um = { source: 'ebird' as const, row: 4, reason: 'no-match' as const, date: '2021-05-06', place: { country: 'EG' } }
    let s = run(initialState(), { type: 'import', source: 'ebird', result: result([rec('duck', 'ebird')], [um]) })
    expect(s.openUnmatched).toEqual([um])
    s = run(s, { type: 'edit', edits: { ...EMPTY_EDITS, fixes: { 'ebird:4': 'crow' } } })
    expect(s.list.find((e) => e.code === 'crow')).toMatchObject({ date: '2021-05-06', place: { country: 'EG' }, sources: ['ebird'] })
    expect(s.openUnmatched).toEqual([])
  })

  it('a fix whose unmatched row is gone is ignored but kept', () => {
    const s = run(initialState(), { type: 'edit', edits: { ...EMPTY_EDITS, fixes: { 'ebird:9': 'crow' } } })
    expect(s.list).toEqual([])
    expect(s.saved.edits.fixes).toEqual({ 'ebird:9': 'crow' })
  })

  it('mode, view, massOrder only touch themselves and keep saved identity', () => {
    const s0 = run(initialState(), { type: 'import', source: 'ebird', result: result([rec('duck', 'ebird')]) })
    const s = run(s0, { type: 'mode', mode: 'true' }, { type: 'view', view: 'list' }, { type: 'massOrder', massOrder: 'lightest' })
    expect([s.mode, s.view, s.massOrder]).toEqual(['true', 'list', 'lightest'])
    expect(s.saved).toBe(s0.saved)
    expect(s.list).toBe(s0.list)
  })

  it('sci (Scientific names) is off by default and touches only itself', () => {
    const s0 = run(initialState(), { type: 'import', source: 'ebird', result: result([rec('duck', 'ebird')]) })
    expect(s0.sci).toBe(false)
    const s = run(s0, { type: 'sci', sci: true })
    expect(s.sci).toBe(true)
    expect(s.saved).toBe(s0.saved)
    expect(s.list).toBe(s0.list)
  })

  it('restore recomputes everything from the backup', () => {
    const saved = { ...emptySaved(), records: { ebird: [rec('crow', 'ebird')], 'ebird-list': [], inat: [], manual: [] } }
    const s = run(initialState(), { type: 'restore', saved })
    expect(s.saved).toBe(saved)
    expect(s.list.map((e) => e.code)).toEqual(['crow'])
  })

  it('forget resets to empty', () => {
    let s = run(initialState(), { type: 'import', source: 'ebird', result: result([rec('duck', 'ebird')]) })
    s = run(s, { type: 'filter', filter: { countries: ['CA'] } }, { type: 'mode', mode: 'true' }, { type: 'view', view: 'list' }, { type: 'massOrder', massOrder: 'lightest' })
    s = run(s, { type: 'forget' })
    const fresh = initialState()
    expect(s.list).toEqual([])
    expect(s.saved.records).toEqual(fresh.saved.records)
    expect([s.filter, s.mode, s.view, s.massOrder]).toEqual([{}, 'even', 'collage', 'heaviest'])
  })

  it('name sets Saved.name (trimmed to nothing when blank) and leaves the list alone', () => {
    const s0 = run(initialState(), { type: 'import', source: 'ebird', result: result([rec('duck', 'ebird')]) })
    const s1 = run(s0, { type: 'name', name: 'Ada Birder' })
    expect(s1.saved.name).toBe('Ada Birder')
    expect(s1.list).toBe(s0.list)
    expect(s1.saved.records).toBe(s0.saved.records)
    const s2 = run(s1, { type: 'name', name: '   ' })
    expect(s2.saved.name).toBeUndefined()
    expect('name' in s2.saved).toBe(false)
    expect(run(s2, { type: 'name', name: '' }).saved).toBe(s2.saved) // no change, same identity (nothing to save)
  })

  it('name keeps at most NAME_MAX characters (what a share link carries)', () => {
    const s = run(initialState(), { type: 'name', name: `  ${'é'.repeat(50)}  ` })
    expect(Array.from(s.saved.name!)).toHaveLength(NAME_MAX)
    expect(NAME_MAX).toBe(LINK_NAME_MAX)
  })

  it('persistence action sets only persistence', () => {
    const s0 = initialState()
    expect(s0.persistence).toBe('idle')
    const s = run(s0, { type: 'persistence', persistence: 'memory-only' })
    expect(s.persistence).toBe('memory-only')
    expect(s.saved).toBe(s0.saved)
  })
})

describe('ruleCounts (the live counts beside each counting rule)', () => {
  it('counts heard-only and found-dead birds, and the birds research grade only would drop, whatever the rules are now', async () => {
    const { ruleCounts } = await import('@/lib/list/store')
    const { emptySaved } = await import('@/lib/list/storage')
    const s = emptySaved()
    s.rules = { hideHeard: true, hideDead: true, researchOnly: true }
    s.records.ebird = [{ code: 'a', source: 'ebird', heard: true }, { code: 'b', source: 'ebird', dead: true }, { code: 'c', source: 'ebird' }]
    s.records.inat = [{ code: 'd', source: 'inat', research: false }, { code: 'c', source: 'inat', research: false }, { code: 'e', source: 'inat', research: true }]
    s.edits.marks = { c: { heard: true } }
    expect(ruleCounts(s)).toEqual({ heard: 2, dead: 1, casual: 1 }) // c also has an eBird record, so only d drops
  })
})
