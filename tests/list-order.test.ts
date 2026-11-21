import { describe, expect, it } from 'vitest'
import { DEFAULT_LIST_ORDER, LIST_ORDERS, listCompare, listOrderOf, type ListOrder } from '@/lib/list/list-order'
import type { ListEntry } from '@/lib/list/model'
import type { SpeciesRow } from '@/lib/species/types'

// Synthetic birds: code, taxonomic order, mass, lifer date.
const item = (code: string, to: number, g: number, date?: string) => ({
  entry: { code, date, heard: false, dead: false, media: false, sources: [] } as ListEntry,
  row: { code, to, g } as SpeciesRow,
})
const birds = [
  item('d', 4, 50, '2021-06-15'),
  item('a', 1, 900),
  item('c', 3, 10, '2021'),
  item('b', 2, 300, '2021-06'),
  item('e', 5, 300, '2023-01-02'),
  item('f', 6, 5, '2021-06-15'),
  item('g', 0, 20),
]
const sorted = (o: ListOrder) => [...birds].sort(listCompare(o)).map((x) => x.entry.code).join('')

describe('listCompare', () => {
  it('Family is taxonomic order', () => expect(sorted('family')).toBe('gabcdef'))
  it('Newest first: by date, partial dates by what they have, ties taxonomic, undated last', () => {
    expect(sorted('newest')).toBe('edfbcga')
  })
  it('Oldest first: the reverse by date, undated still last and taxonomic', () => {
    expect(sorted('oldest')).toBe('cbdfega')
  })
  it('the mass orders are unchanged, ties taxonomic', () => {
    expect(sorted('heaviest')).toBe('abedgcf')
    expect(sorted('lightest')).toBe('fcgdbea')
  })
})

describe('listOrderOf', () => {
  it('keeps every known order, the old heaviest and lightest included, and defaults the rest', () => {
    for (const o of LIST_ORDERS) expect(listOrderOf(o)).toBe(o)
    expect(DEFAULT_LIST_ORDER).toBe('newest')
    for (const v of [undefined, null, '', 'Heaviest', 'alphabetical', 3]) expect(listOrderOf(v)).toBe('newest')
  })
})
