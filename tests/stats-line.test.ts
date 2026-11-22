// The stats line (statsLine in CollageView): the list's totals, and the threatened count (VU + EN + CR) on the
// unfiltered line ("N threatened"). In the Tree with Lifers only off, the counts against the taxonomy's totals.
import { describe, expect, it } from 'vitest'
import { en } from '@/i18n/messages/en'
import { statsLine, taxonomyTotals } from '@/components/app/CollageView'
import { taxonCover } from '@/lib/tree/levels'
import type { ListEntry } from '@/lib/list/model'
import type { IucnCat } from '@/lib/species/iucn'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'

const row = (code: string, ord: string, fam: string, to: number, iu?: IucnCat): SpeciesRow => ({
  code, com: code, sci: `Avis ${code}`, ord, fam, famCom: fam, to, g: 100, gSrc: 'avonet', st: true, ar: 1, q: true, ...(iu ? { iu } : {}),
})
const species = buildSpeciesIndex([
  row('duck1', 'Anseriformes', 'Anatidae', 1, 'LC'),
  row('owl1', 'Strigiformes', 'Strigidae', 2, 'VU'),
  row('crow1', 'Passeriformes', 'Corvidae', 3, 'EN'),
  row('robin1', 'Passeriformes', 'Turdidae', 4),
  row('jay1', 'Passeriformes', 'Corvidae', 5, 'NT'),
])
const entry = (code: string, date: string): ListEntry => ({ code, date, heard: false, dead: false, media: false, sources: ['ebird'] })
const all = [entry('duck1', '2020-01-02'), entry('owl1', '2021-03-04'), entry('crow1', '2022-05-06'), entry('robin1', '2023-07-08')]
const noStatus = [entry('duck1', '2020-01-02'), entry('robin1', '2023-07-08'), entry('jay1', '2024-01-01')]

describe('statsLine: the threatened count', () => {
  it('"N threatened" after the families, before "since"', () => {
    expect(statsLine(all, all, species, en.ui)).toBe('4 species · 3 orders · 4 families · 2 threatened · since Jan 2020')
  })
  it('not on the filtered line', () => {
    expect(statsLine(all, all.slice(0, 2), species, en.ui)).toBe('2 of 4 species · 2 families')
  })
  it('hidden at 0: Least Concern and Near Threatened are not threatened, and a species without a status counts nothing', () => {
    expect(statsLine(noStatus, noStatus, species, en.ui)).toBe('3 species · 2 orders · 3 families · since Jan 2020')
  })
  it('the count is grouped like the other numbers', () => {
    const codes = Array.from({ length: 1200 }, (_, i) => `vu${i}`)
    const big = buildSpeciesIndex(codes.map((c, i) => row(c, 'Strigiformes', 'Strigidae', i + 1, 'VU')))
    const list = codes.map((c) => entry(c, '2020-01-01'))
    expect(statsLine(list, list, big, en.ui)).toBe('1,200 species · 1 order · 1 family · 1,200 threatened · since Jan 2020')
  })
})

describe('statsLine: against the taxonomy (the Tree with Lifers only off)', () => {
  const totals = { species: 11201, orders: 45, families: 250 }
  it('each taxonomic count against its total; threatened and the date as they are', () => {
    expect(statsLine(all, all, species, en.ui, totals)).toBe('4 / 11,201 species · 3 / 45 orders · 4 / 250 families · 2 threatened · since Jan 2020')
  })
  it('the filtered line, and the line without totals, stay as today', () => {
    expect(statsLine(all, all.slice(0, 2), species, en.ui, totals)).toBe('2 of 4 species · 2 families')
    expect(statsLine(all, all, species, en.ui, undefined)).toBe('4 species · 3 orders · 4 families · 2 threatened · since Jan 2020')
  })
  it('the totals are the Tree’s own (taxonCover’s)', () => {
    const cover = taxonCover(species.rows, new Set())
    expect(taxonomyTotals(species.rows)).toEqual({ species: cover.species[1], orders: cover.orders[1], families: cover.families[1] })
    expect(taxonomyTotals(species.rows)).toEqual({ species: 5, orders: 3, families: 4 })
  })
})
