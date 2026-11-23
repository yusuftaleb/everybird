import { describe, expect, it } from 'vitest'
import { addTicked, filterTickRows, genusOf, onListByGroup, removeTicked, taxonChildren, taxonOpen, TICK_SPECIES_AT, toggleOpen, undoEdit } from '@/lib/list/tick'
import { SPECIES_AT } from '@/lib/tree/levels'
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
  it('a genus is the first word of the scientific name', () => {
    expect(genusOf('Colaptes auratus')).toBe('Colaptes')
    expect(genusOf('Anser')).toBe('Anser')
  })
})

describe('taxonOpen (Add by hand: no lone levels, the Tree\'s rule)', () => {
  // Synthetic: an order of 20 species in one family; the family's two genera (Aa 13, Ab 7); an order of 14 in one family
  // and one genus; an order of 13 in two families.
  const many = (n: number, sci: string, ord: string, fam: string, from: number) =>
    Array.from({ length: n }, (_, i) => sp(`${sci.toLowerCase()}${i}`, `${sci} ${i}`, `${sci} s${i}`, ord, fam, from + i))
  const big = [
    ...many(13, 'Aa', 'Aformes', 'Aidae', 0), ...many(7, 'Ab', 'Aformes', 'Aidae', 100),
    ...many(14, 'Ba', 'Bformes', 'Bidae', 200),
    ...many(6, 'Ca', 'Cformes', 'Cidae', 300), ...many(7, 'Cb', 'Cformes', 'Cbidae', 400),
  ]
  const open = (path: string[], n: number) => { const o = taxonOpen(big, path, n); return [o.path, o.groups.map((g) => [g.id, g.n])] }
  it('follows the Tree: the same 12 species', () => expect(TICK_SPECIES_AT).toBe(SPECIES_AT))
  it('an order with one family shows its genera directly', () => {
    expect(open(['Aformes'], 20)).toEqual([['Aformes', 'Aidae'], [['Aa', 13], ['Ab', 7]]])
  })
  it('a family with one genus shows its species directly (here an order with one family and one genus)', () => {
    expect(open(['Bformes'], 14)).toEqual([['Bformes', 'Bidae', 'Ba'], []])
  })
  it('a group of 12 species or fewer opens straight on its species; more shows its groups', () => {
    expect(open(['Aformes', 'Aidae', 'Ab'], 7)).toEqual([['Aformes', 'Aidae', 'Ab'], []])
    expect(open(['Cformes'], 13)).toEqual([['Cformes'], [['Cidae', 6], ['Cbidae', 7]]])
    expect(open(['Cformes', 'Cbidae'], 7)).toEqual([['Cformes', 'Cbidae'], []])
    expect(open(['Aformes'], 12)).toEqual([['Aformes'], []])
  })
})

describe('toggleOpen (Add by hand: one group open at a time at each level)', () => {
  const press = (open: string[], key: string) => [...toggleOpen(new Set(open), key)].sort()
  it('opening an order closes the other orders, with everything open under them', () => {
    expect(press(['Suliformes', 'Suliformes/Phalacrocoracidae'], 'Ciconiiformes')).toEqual(['Ciconiiformes'])
  })
  it('opening a family closes its sibling families (and their genera), never its order or another order\'s', () => {
    expect(press(['P', 'P/A', 'P/A/Ga', 'P/Ab'], 'P/B')).toEqual(['P', 'P/B'])
    // A family whose name starts like another's is still its sibling.
    expect(press(['P', 'P/Ab'], 'P/A')).toEqual(['P', 'P/A'])
  })
  it('a skipped level: genera shown under an order with one family are siblings under the full path', () => {
    expect(press(['O', 'O/F/G1'], 'O/F/G2')).toEqual(['O', 'O/F/G2'])
  })
  it('closing a group keeps what is open under it for its next opening, and leaves the rest alone', () => {
    expect(press(['P', 'P/A', 'P/A/Ga'], 'P/A')).toEqual(['P', 'P/A/Ga'])
    expect(press(['P', 'P/A/Ga'], 'P/A')).toEqual(['P', 'P/A', 'P/A/Ga'])
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

describe('onListByGroup (Add by hand: "12 / 178", the birds on the list in each group)', () => {
  it('counts each bird on the list in its order, family and genus, by the open groups\' keys; codes outside the taxonomy are skipped', () => {
    const byCode = new Map(rows.map((r) => [r.code, r]))
    const on = onListByGroup(byCode, ['norfli', 'emptou1', 'snogoo', 'nosuch'])
    expect(Object.fromEntries(on)).toEqual({
      Anseriformes: 1, 'Anseriformes/Anatidae': 1, 'Anseriformes/Anatidae/Anser': 1,
      Piciformes: 2, 'Piciformes/Picidae': 1, 'Piciformes/Picidae/Colaptes': 1,
      'Piciformes/Ramphastidae': 1, 'Piciformes/Ramphastidae/Aulacorhynchus': 1,
    })
    expect(on.get('Passeriformes')).toBeUndefined()
  })
})
