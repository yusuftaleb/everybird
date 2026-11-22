// The store's card actions patch only the species an edit touches (store.ts `deriveEdit`); each result must equal the
// full derive of the same saved list (a 'restore' of it on the state before the edit, which runs `derive`).
import { describe, expect, it } from 'vitest'
import type { Edits, SourceRecord } from '@/lib/list/model'
import { DEFAULT_RULES } from '@/lib/list/model'
import { emptySaved, type Saved } from '@/lib/list/storage'
import { initialState, makeReducer, type AppState } from '@/lib/list/store'
import { addTicked, undoEdit } from '@/lib/list/tick'
import type { SpeciesIndex } from '@/lib/species/load'

const codes = ['duck', 'goose', 'crow', 'wren', 'jay', 'tit']
const rows = codes.map((code, i) => ({ code, com: code, sci: code, ord: i < 2 ? 'Anseriformes' : 'Passeriformes', fam: `F${i}`, famCom: `F${i}`, to: i }))
const species = { rows, byCode: new Map(rows.map((r) => [r.code, r])), search: () => [] } as unknown as SpeciesIndex
const reduce = makeReducer({ species })

const full = (code: string, places: string[], extra: Partial<SourceRecord> = {}): SourceRecord => ({
  code, source: 'ebird', date: '2020-03-04', place: { country: places[0].slice(0, 2), sub1: places[0] },
  seen: places.map((p, i) => `2020-0${i + 3}-04|${p}`), seenMonths: places.map((p) => `07g08|${p}`), ...extra,
})
const saved = (): Saved => {
  const s = emptySaved()
  return {
    ...s,
    records: {
      ...s.records,
      ebird: [full('duck', ['CA-BC', 'US-WA']), full('crow', ['CA-BC']), full('wren', ['CA-ON', 'CA-BC'], { heard: true }), full('jay', ['KE-30'])],
      inat: [{ code: 'crow', source: 'inat', date: '2019-01-02', place: { country: 'MX' }, seen: ['2019-01-02|MX'], research: false }],
      'ebird-list': [{ code: 'tit', source: 'ebird', date: '2018-05-01', place: { country: 'GB', sub1: 'GB-ENG' } }],
    },
  }
}

const start = (rules = DEFAULT_RULES, filter = {}): AppState => {
  let s = reduce(initialState(), { type: 'restore', saved: { ...saved(), rules } })
  s = reduce(s, { type: 'filter', filter })
  return s
}
const edit = (s: AppState, edits: Edits) => reduce(s, { type: 'edit', edits })
/** The full derive of `after.saved`, from the state the edit started at. */
const derived = (before: AppState, after: AppState) => reduce(before, { type: 'restore', saved: after.saved })
const check = (before: AppState, after: AppState, untouched = 'jay') => {
  const ref = derived(before, after)
  expect(after).toEqual(ref)
  expect([...after.seen.byCode.keys()]).toEqual([...ref.seen.byCode.keys()])
  expect(after.seen.sig).toBe(ref.seen.sig)
  // The patch ran: an untouched species keeps its entry and its seen-here objects.
  const keep = after.list.find((e) => e.code === untouched)
  if (keep) {
    expect(keep).toBe(before.list.find((e) => e.code === untouched))
    expect(after.seen.byCode.get(untouched)).toBe(before.seen.byCode.get(untouched))
  }
  return after
}
const mark = (s: AppState, code: string, m: Edits['marks'][string] | undefined): Edits => {
  const marks = { ...s.saved.edits.marks }
  if (m) marks[code] = m
  else delete marks[code]
  return { ...s.saved.edits, marks }
}
const remove = (s: AppState, code: string): Edits => ({
  ...s.saved.edits,
  removed: [...s.saved.edits.removed, code],
  added: s.saved.edits.added.filter((r) => r.code !== code),
})

describe('card actions patch the list (store deriveEdit)', () => {
  it('marks added and cleared, and their undo', () => {
    const s0 = start()
    const s1 = check(s0, edit(s0, mark(s0, 'duck', { heard: true, media: true })))
    expect(s1.list.find((e) => e.code === 'duck')?.heard).toBe(true)
    const s2 = check(s1, edit(s1, mark(s1, 'wren', { heard: false })))
    const s3 = check(s2, edit(s2, mark(s2, 'duck', undefined)))
    expect(s3.list.find((e) => e.code === 'duck')?.heard).toBe(false)
    check(s3, edit(s3, undoEdit(s3.saved.edits, s2.saved.edits, ['duck'])))
  })

  it('a mark that hides or shows a bird under the rules', () => {
    const s0 = start({ ...DEFAULT_RULES, hideHeard: true }, { countries: ['CA'] })
    expect(s0.list.map((e) => e.code)).not.toContain('wren')
    const s1 = check(s0, edit(s0, mark(s0, 'wren', { heard: false })))
    expect(s1.list.map((e) => e.code)).toContain('wren')
    const s2 = check(s1, edit(s1, mark(s1, 'crow', { heard: true })))
    expect(s2.list.map((e) => e.code)).not.toContain('crow')
    check(s2, edit(s2, undoEdit(s2.saved.edits, s1.saved.edits, ['crow'])))
  })

  it('removal and its undo, research grade only on', () => {
    const s0 = start({ ...DEFAULT_RULES, researchOnly: true })
    const s1 = check(s0, edit(s0, remove(s0, 'crow')))
    expect(s1.seen.byCode.has('crow')).toBe(false)
    check(s1, edit(s1, undoEdit(s1.saved.edits, s0.saved.edits, ['crow'])))
  })

  it('removal of the last bird of a place prunes the filter, and its undo', () => {
    const s0 = start(DEFAULT_RULES, { countries: ['KE', 'CA'] })
    expect(s0.filter.countries).toEqual(['CA', 'KE'])
    const s1 = check(s0, edit(s0, remove(s0, 'jay')), 'duck')
    expect(s1.filter.countries).toEqual(['CA'])
    expect(s1.list.map((e) => e.code)).not.toContain('jay')
    const s2 = check(s1, edit(s1, undoEdit(s1.saved.edits, s0.saved.edits, ['jay'])), 'duck')
    expect(s2.list.map((e) => e.code)).toContain('jay')
  })

  it('removal of the only birds carrying seen-here clears `full`', () => {
    const base = emptySaved()
    let s = reduce(initialState(), {
      type: 'restore',
      saved: { ...base, records: { ...base.records, ebird: [full('duck', ['CA-BC'])], 'ebird-list': [{ code: 'tit', source: 'ebird', date: '2018-05-01', place: { country: 'GB' } }] } },
    })
    expect(s.seen.full).toBe(true)
    const s1 = check(s, edit(s, remove(s, 'duck')))
    expect(s1.seen.full).toBe(false)
    s = check(s1, edit(s1, undoEdit(s1.saved.edits, s.saved.edits, ['duck'])))
    expect(s.seen.full).toBe(true)
  })

  it('hand ticks: adding one, removing a hand-ticked bird, and the undo', () => {
    const s0 = start()
    const s1 = check(s0, edit(s0, addTicked(s0.saved.edits, ['goose', 'duck'], { date: '2021-06-01', place: { country: 'CA', sub1: 'CA-BC' } })))
    expect(s1.list.map((e) => e.code)).toContain('goose')
    const s2 = check(s1, edit(s1, remove(s1, 'goose')))
    check(s2, edit(s2, undoEdit(s2.saved.edits, s1.saved.edits, ['goose'])))
  })
})
