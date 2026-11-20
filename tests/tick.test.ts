import { describe, expect, it } from 'vitest'
import { addTicked, filterTickRows, genusOf, removeTicked, taxonChildren, undoEdit } from '@/lib/list/tick'
import type { Edits } from '@/lib/list/model'
import type { SpeciesRow } from '@/lib/species/types'

const sp = (code: string, com: string, sci: string, ord: string, fam: string, to: number): SpeciesRow =>
  ({ code, com, sci, ord, fam, famCom: fam, to, g: 10, gSrc: 'avonet', st: true, ar: 1, q: true }) as SpeciesRow
const rows = [
  sp('snogoo', 'Snow Goose', 'Anser caerulescens', 'Anseriformes', 'Anatidae', 1),
  sp('norfli', 'Northern Flicker', 'Colaptes auratus', 'Piciformes', 'Picidae', 2),
  sp('gilfli', 'Gilded Flicker', 'Colaptes chrysoides', 'Piciformes', 'Picidae', 3),
  sp('emptou1', 'Emerald Toucanet', 'Aulacorhynchus prasinus', 'Piciformes', 'Ramphastidae', 4),
  sp('eurrob1', 'European Robin', 'Erithacus rubecula', 'Passeriformes', 'Muscicapidae', 5),
]
const codes = (r: SpeciesRow[]) => r.map((x) => x.code)

describe('filterTickRows (Add by hand: search the whole taxonomy, and a genus\'s species in the list)', () => {
  it('without a search: taxonomic order, narrowed to an order, a family or a genus', () => {
    expect(codes(filterTickRows(rows, { taxon: [] }))).toHaveLength(5)
    expect(codes(filterTickRows(rows, { taxon: ['Piciformes'] }))).toEqual(['norfli', 'gilfli', 'emptou1'])
    expect(codes(filterTickRows(rows, { taxon: ['Piciformes', 'Picidae', 'Colaptes'] }))).toEqual(['norfli', 'gilfli'])
    expect(codes(filterTickRows(rows, {}))).toEqual(['snogoo', 'norfli', 'gilfli', 'emptou1', 'eurrob1'])
    expect(codes(filterTickRows(rows, { taxon: ['Piciformes', 'Picidae'] }))).toEqual(['norfli', 'gilfli'])
    expect(codes(filterTickRows(rows, { taxon: ['Piciformes', 'Ramphastidae'] }))).toEqual(['emptou1'])
  })
  it('a search matches word prefixes of either name, accent-insensitive, best matches first, within the group', () => {
    expect(codes(filterTickRows(rows, { q: 'flick' }))).toEqual(['norfli', 'gilfli'])
    expect(codes(filterTickRows(rows, { q: 'colaptes aur' }))).toEqual(['norfli'])
    expect(codes(filterTickRows(rows, { q: 'EUROPÉAN' }))).toEqual(['eurrob1'])
    expect(codes(filterTickRows(rows, { q: 'e', taxon: ['Piciformes', 'Ramphastidae'] }))).toEqual(['emptou1'])
    expect(codes(filterTickRows(rows, { q: 'gild', taxon: ['Piciformes', 'Picidae', 'Colaptes'] }))).toEqual(['gilfli'])
    expect(filterTickRows(rows, { q: 'licker' })).toEqual([])
  })
})

describe('taxonChildren (Add by hand: the levels of the list that opens in place)', () => {
  const ids = (path: string[]) => taxonChildren(rows, path).map((c) => [c.id, c.n])
  it("lists the orders, an order's families and a family's genera in taxonomic order, with species counts", () => {
    expect(ids([])).toEqual([['Anseriformes', 1], ['Piciformes', 3], ['Passeriformes', 1]])
    expect(ids(['Piciformes'])).toEqual([['Picidae', 2], ['Ramphastidae', 1]])
    expect(ids(['Piciformes', 'Picidae'])).toEqual([['Colaptes', 2]])
    expect(ids(['Piciformes', 'Picidae', 'Colaptes'])).toEqual([])
  })
  it('orders the groups by their first species, wherever the rows sit', () => {
    const shuffled = [rows[4], rows[3], rows[2], rows[1], rows[0]]
    expect(taxonChildren(shuffled, []).map((c) => c.id)).toEqual(['Anseriformes', 'Piciformes', 'Passeriformes'])
    expect(taxonChildren(shuffled, ['Piciformes'])[0].first.code).toBe('norfli')
  })
  it("shows each group's first species in taxonomic order that has a sticker, else its first species (the outline)", () => {
    const drawn = (code: string, st: boolean, to: number, sci: string, fam = 'Picidae') => ({ ...sp(code, code, sci, 'Piciformes', fam, to), st })
    const birds = [
      drawn('c3', true, 30, 'Colaptes c'), drawn('c1', false, 10, 'Colaptes a'), drawn('c2', true, 20, 'Colaptes b'),
      drawn('m1', false, 40, 'Melanerpes a'), drawn('m2', false, 50, 'Melanerpes b'),
      drawn('r1', true, 60, 'Ramphastos a', 'Ramphastidae'),
    ]
    const at = (path: string[]) => taxonChildren(birds, path).map((g) => [g.id, g.n, g.first.code, g.rep.code])
    // The order: its first species (c1) has no sticker, the next in taxonomic order (c2) has, wherever the rows sit.
    expect(at([])).toEqual([['Piciformes', 6, 'c1', 'c2']])
    expect(at(['Piciformes'])).toEqual([['Picidae', 5, 'c1', 'c2'], ['Ramphastidae', 1, 'r1', 'r1']])
    // A genus with no sticker at all shows its first species (drawn as the outline).
    expect(at(['Piciformes', 'Picidae'])).toEqual([['Colaptes', 3, 'c1', 'c2'], ['Melanerpes', 2, 'm1', 'm1']])
  })
  it('a genus is the first word of the scientific name', () => {
    expect(genusOf('Colaptes auratus')).toBe('Colaptes')
    expect(genusOf('Anser')).toBe('Anser')
  })
})

describe('addTicked (birds added by hand into the edits)', () => {
  const edits: Edits = { removed: ['norfli', 'amerob'], added: [{ code: 'gilfli', source: 'manual', date: '2001' }], marks: {}, fixes: {} }
  it('adds every code with the same date and place, and takes them out of removed', () => {
    const next = addTicked(edits, ['norfli', 'snogoo'], { date: '2019-06', place: { country: 'CA', sub1: 'CA-BC' } })
    expect(next.removed).toEqual(['amerob'])
    expect(next.added).toEqual([
      { code: 'gilfli', source: 'manual', date: '2001' },
      { code: 'norfli', source: 'manual', date: '2019-06', place: { country: 'CA', sub1: 'CA-BC' } },
      { code: 'snogoo', source: 'manual', date: '2019-06', place: { country: 'CA', sub1: 'CA-BC' } },
    ])
  })
  it('without a date or place adds bare records; a code already added by hand is replaced', () => {
    const next = addTicked(edits, ['gilfli'], {})
    expect(next.added).toEqual([{ code: 'gilfli', source: 'manual' }])
  })
})

describe('removeTicked (a tap on a bird already on the list)', () => {
  it('puts them in removed once, drops their hand records, and keeps marks and fixes', () => {
    const edits: Edits = {
      removed: ['old'],
      added: [{ code: 'a', source: 'manual' }, { code: 'b', source: 'manual' }],
      marks: { a: { heard: true } },
      fixes: { 'ebird:2': 'c' },
    }
    const out = removeTicked(edits, ['a', 'c', 'old'])
    expect(out.removed).toEqual(['old', 'a', 'c'])
    expect(out.added).toEqual([{ code: 'b', source: 'manual' }])
    expect(out.marks).toEqual(edits.marks)
    expect(out.fixes).toEqual(edits.fixes)
    // Ticking one again brings it back.
    expect(addTicked(out, ['a'], {}).removed).toEqual(['old', 'c'])
  })
})

describe('undoEdit (Undo after a removal or an add by hand)', () => {
  const before: Edits = {
    removed: ['old'],
    added: [{ code: 'a', source: 'manual', date: '2019-06', place: { country: 'CA' } }, { code: 'b', source: 'manual' }],
    marks: { a: { heard: true }, c: { dead: true } },
    fixes: { 'ebird:2': 'c' },
  }
  it('puts back exactly what the removal changed: the removed list and the hand records, not fresh ones', () => {
    const after = removeTicked(before, ['a', 'c'])
    const back = undoEdit(after, before, ['a', 'c'])
    expect(back.removed).toEqual(['old'])
    expect(back.added).toEqual(before.added)
    expect(back.marks).toEqual(before.marks)
    expect(back.fixes).toEqual(before.fixes)
  })
  it('keeps edits made since to other birds', () => {
    const after = removeTicked(before, ['a'])
    const later: Edits = { ...after, removed: [...after.removed, 'z'], added: [...after.added, { code: 'n', source: 'manual' }], marks: { ...after.marks, n: { heard: true } } }
    const back = undoEdit(later, before, ['a'])
    expect(back.removed).toEqual(['old', 'z'])
    expect(back.added.map((r) => r.code).sort()).toEqual(['a', 'b', 'n'])
    expect(back.added.find((r) => r.code === 'a')).toEqual(before.added[0])
    expect(back.marks).toEqual({ ...before.marks, n: { heard: true } })
  })
  it('a code that was already in removed before stays there', () => {
    const back = undoEdit(removeTicked(before, ['old']), before, ['old'])
    expect(back.removed).toEqual(['old'])
  })
  it('after an add: the bird goes back off the list, into removed again if it was there (a file has it)', () => {
    const added = addTicked(before, ['old'], { date: '2020' })
    expect(added.removed).toEqual([])
    const back = undoEdit(added, before, ['old'])
    expect(back.removed).toEqual(['old'])
    expect(back.added).toEqual(before.added)
    const fresh = undoEdit(addTicked(before, ['new'], {}), before, ['new'])
    expect(fresh).toEqual(before)
  })
})
