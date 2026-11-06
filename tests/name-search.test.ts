import { describe, expect, it } from 'vitest'
import { applyFilter, filterKey, options } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import { buildSpeciesIndex } from '@/lib/species/load'
import { nameTier, searchKey, suggestBirds } from '@/lib/species/name-search'
import type { SpeciesRow } from '@/lib/species/types'

const sp = (code: string, com: string, sci: string, ord: string, to: number): SpeciesRow =>
  ({ code, com, sci, ord, fam: `${ord}idae`, famCom: ord, to, g: 10, gSrc: 'avonet', st: true, ar: 1, q: true }) as SpeciesRow
const rows = [
  sp('comeid', 'Common Eider', 'Somateria mollissima', 'Anseriformes', 1),
  sp('norfli', 'Northern Flicker', 'Colaptes auratus', 'Piciformes', 2),
  sp('gilfli', 'Gilded Flicker', 'Colaptes chrysoides', 'Piciformes', 3),
  sp('amerob', 'American Robin', 'Turdus migratorius', 'Passeriformes', 4),
  sp('rufhum', "Rufous Hummingbird", 'Selasphorus rufus', 'Apodiformes', 5),
  sp('bkcchi', 'Black-capped Chickadee', 'Poecile atricapillus', 'Passeriformes', 6),
]
const species = buildSpeciesIndex(rows)
const entry = (code: string): ListEntry => ({ code, heard: false, dead: false, media: false, sources: [] })
const list = rows.map((r) => entry(r.code))
const codes = (es: ListEntry[]) => es.map((e) => e.code)

describe('name search (shared with species.search)', () => {
  it('matches word prefixes of the common or scientific name, accent- and case-insensitive', () => {
    const t = (q: string, code: string) => nameTier(searchKey(q), species.byCode.get(code)!)
    expect(t('flick', 'norfli')).toBeGreaterThanOrEqual(0)
    expect(t('nor fl', 'norfli')).toBeGreaterThanOrEqual(0)
    expect(t('colap aur', 'norfli')).toBeGreaterThanOrEqual(0)
    expect(t('ÉIDER', 'comeid')).toBeGreaterThanOrEqual(0)
    expect(t('capped', 'bkcchi')).toBeGreaterThanOrEqual(0) // "Black-capped": hyphens split words
    expect(t('licker', 'norfli')).toBe(-1) // not a word prefix
    expect(t('robin', 'norfli')).toBe(-1)
  })

  it('species.search still ranks exact names, then common, then scientific prefixes', () => {
    expect(species.search('colaptes').map((r) => r.code)).toEqual(['norfli', 'gilfli'])
    expect(species.search('american robin')[0].code).toBe('amerob')
  })

  it('suggestBirds: only birds in the given entries, best tier first, then taxonomic order, capped', () => {
    expect(suggestBirds(list, 'fli', species).map((r) => r.code)).toEqual(['norfli', 'gilfli'])
    expect(suggestBirds([entry('gilfli')], 'fli', species).map((r) => r.code)).toEqual(['gilfli'])
    expect(suggestBirds(list, 'r', species, 2)).toHaveLength(2)
    expect(suggestBirds(list, '   ', species)).toEqual([])
    // An exact common name outranks prefix matches that come earlier in taxonomic order.
    expect(suggestBirds(list, 'gilded flicker', species)[0].code).toBe('gilfli')
  })
})

describe('the text filter (Filter.q)', () => {
  it('narrows the list and combines with the other filters', () => {
    expect(codes(applyFilter(list, { q: 'flicker' }, species, []))).toEqual(['norfli', 'gilfli'])
    expect(codes(applyFilter(list, { q: 'r', order: 'Passeriformes' }, species, []))).toEqual(['amerob'])
    expect(codes(applyFilter(list, { q: 'zzz' }, species, []))).toEqual([])
    expect(codes(applyFilter(list, { q: '  ' }, species, []))).toEqual(codes(list))
  })

  it('is part of the filter key, normalised, so equal searches share a layout', () => {
    expect(filterKey({ q: 'Flicker ' })).toBe(filterKey({ q: 'flicker' }))
    expect(filterKey({ order: 'Piciformes', q: 'gil' })).toBe('o:Piciformes|q:gil')
    expect(filterKey({ q: '  ' })).toBe('')
  })

  it('chip counts follow the search', () => {
    expect(options(list, { q: 'flicker' }, 'order', species, [])).toEqual([{ value: 'Piciformes', label: 'Woodpeckers', count: 2 }])
  })
})
