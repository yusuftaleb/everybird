import { describe, expect, it } from 'vitest'
import { addTicked, filterTickRows, removeTicked } from '@/lib/list/tick'
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

describe('filterTickRows (Tick by hand: browse and search the whole taxonomy)', () => {
  it('without a search: taxonomic order, narrowed by order, then family', () => {
    expect(codes(filterTickRows(rows, {}))).toEqual(['snogoo', 'norfli', 'gilfli', 'emptou1', 'eurrob1'])
    expect(codes(filterTickRows(rows, { order: 'Piciformes' }))).toEqual(['norfli', 'gilfli', 'emptou1'])
    expect(codes(filterTickRows(rows, { order: 'Piciformes', family: 'Ramphastidae' }))).toEqual(['emptou1'])
  })
  it('a search matches word prefixes of either name, accent-insensitive, best matches first, within the group', () => {
    expect(codes(filterTickRows(rows, { q: 'flick' }))).toEqual(['norfli', 'gilfli'])
    expect(codes(filterTickRows(rows, { q: 'colaptes aur' }))).toEqual(['norfli'])
    expect(codes(filterTickRows(rows, { q: 'EUROPÉAN' }))).toEqual(['eurrob1'])
    expect(codes(filterTickRows(rows, { q: 'e', order: 'Piciformes' }))).toEqual(['emptou1'])
    expect(filterTickRows(rows, { q: 'licker' })).toEqual([])
  })
})

describe('addTicked (a batch of ticked birds into the edits)', () => {
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

describe('removeTicked (un-ticking birds already on the list)', () => {
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
