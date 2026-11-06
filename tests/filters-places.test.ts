import { describe, expect, it } from 'vitest'
import { buildList } from '@/lib/list/build-list'
import { applyFilter, filterKey, filterToShow, options } from '@/lib/list/filters'
import { applyFilterValidity } from '@/lib/list/filters-validate'
import { DEFAULT_RULES, EMPTY_EDITS, type SourceRecord } from '@/lib/list/model'
import { buildSeen } from '@/lib/list/seen'
import type { SpeciesIndex } from '@/lib/species/load'

const row = (code: string, ord: string, fam: string, to: number) => ({ code, com: code, sci: code, ord, fam, famCom: fam, to }) as never
const rows = [row('duck', 'Anseriformes', 'Anatidae', 1), row('owl', 'Strigiformes', 'Strigidae', 5), row('crow', 'Passeriformes', 'Corvidae', 10)]
const species: SpeciesIndex = { rows, byCode: new Map(rows.map((r) => [(r as { code: string }).code, r])), search: () => [] }
const rec = (code: string, extra: Partial<SourceRecord>): SourceRecord => ({ code, source: 'ebird', ...extra })

// duck: lifer in Canada (BC), also seen in Washington (King) and Mexico. owl: lifer in Ontario only. crow: lifer in
// Mexico, also in BC (no county).
const records = [
  rec('duck', { date: '2019-01-01', place: { country: 'CA', sub1: 'CA-BC', sub2: 'Capital' }, seen: ['2019-01-01|CA-BC|Capital', '2020-05-05|US-WA|King', '2021-01-01|MX'] }),
  rec('owl', { date: '2020-01-01', place: { country: 'CA', sub1: 'CA-ON' }, seen: ['2020-01-01|CA-ON'] }),
  rec('crow', { date: '2018-01-01', place: { country: 'MX' }, seen: ['2018-01-01|MX', '2022-02-02|CA-BC'] }),
]
const list = buildList(records, EMPTY_EDITS, DEFAULT_RULES)
const seen = buildSeen(records, EMPTY_EDITS, DEFAULT_RULES, list)
const codes = (f: object) => applyFilter(list, f, species, [], seen).map((e) => e.code).sort()

describe('the Places filter uses seen-here', () => {
  it('a country, province or county keeps every species seen there, not only lifers there', () => {
    expect(codes({ country: 'CA' })).toEqual(['crow', 'duck', 'owl'])
    expect(codes({ country: 'MX' })).toEqual(['crow', 'duck'])
    expect(codes({ country: 'US' })).toEqual(['duck'])
    expect(codes({ country: 'CA', sub1: 'CA-BC' })).toEqual(['crow', 'duck'])
    expect(codes({ country: 'CA', sub1: 'CA-BC', sub2: 'Capital' })).toEqual(['duck'])
    expect(codes({ country: 'US', sub1: 'US-WA', sub2: 'King' })).toEqual(['duck'])
  })
  it('without the index (a shared link) places are the lifer places', () => {
    expect(applyFilter(list, { country: 'CA' }, species, []).map((e) => e.code).sort()).toEqual(['duck', 'owl'])
    expect(applyFilter(list, { country: 'MX' }, species, []).map((e) => e.code)).toEqual(['crow'])
  })
  it('combines with taxonomy and time by AND (time is the lifer date)', () => {
    expect(codes({ country: 'CA', order: 'Passeriformes' })).toEqual(['crow'])
    expect(codes({ country: 'CA', from: '2019-01', to: '2019-12' })).toEqual(['duck'])
  })
  it('chip counts are species seen in each country, province and county, under the other filters', () => {
    expect(options(list, {}, 'country', species, [], (c) => c, seen).map((o) => [o.value, o.count])).toEqual([['CA', 3], ['MX', 2], ['US', 1]])
    expect(options(list, { country: 'CA' }, 'country', species, [], (c) => c, seen).map((o) => [o.value, o.count])).toEqual([['CA', 3], ['MX', 2], ['US', 1]])
    expect(options(list, { order: 'Strigiformes' }, 'country', species, [], (c) => c, seen).map((o) => [o.value, o.count])).toEqual([['CA', 1]])
    expect(options(list, {}, 'sub1', species, [], (c) => c, seen)).toEqual([])
    expect(options(list, { country: 'CA' }, 'sub1', species, [], (c) => c, seen).map((o) => [o.value, o.count])).toEqual([['CA-BC', 2], ['CA-ON', 1]])
    expect(options(list, { country: 'CA', sub1: 'CA-ON' }, 'sub1', species, [], (c) => c, seen).map((o) => [o.value, o.count])).toEqual([['CA-BC', 2], ['CA-ON', 1]])
    expect(options(list, { country: 'CA', sub1: 'CA-BC' }, 'sub2', species, [], (c) => c, seen).map((o) => [o.value, o.count])).toEqual([['Capital', 1]])
    expect(options(list, { country: 'CA', sub1: 'CA-BC' }, 'sub2', species, [], (c) => c, seen)[0].label).toBe('Capital')
  })
  it('province labels come from the region names', () => {
    const name = (c: string) => ({ 'CA-BC': 'British Columbia', 'CA-ON': 'Ontario' })[c] ?? c
    expect(options(list, { country: 'CA' }, 'sub1', species, [], name, seen).map((o) => o.label)).toEqual(['British Columbia', 'Ontario'])
  })
  it('keys name the province and the county', () => {
    expect(filterKey({ country: 'CA', sub1: 'CA-BC', sub2: 'Capital' })).toBe('c:CA|p:CA-BC|k:Capital')
  })
  it('a search pick keeps a place it was seen in, and clears one it was not', () => {
    const crow = list.find((e) => e.code === 'crow')!
    expect(filterToShow({ country: 'CA', sub1: 'CA-BC' }, crow, species, [], seen)).toEqual({ country: 'CA', sub1: 'CA-BC' })
    expect(filterToShow({ country: 'CA', sub1: 'CA-ON' }, crow, species, [], seen)).toEqual({ country: 'CA' })
    expect(filterToShow({ country: 'US', sub1: 'US-WA', sub2: 'King' }, crow, species, [], seen)).toEqual({})
  })
})

describe('validity of places', () => {
  it('a province needs its country and a county its province', () => {
    expect(applyFilterValidity({ sub1: 'CA-BC' }, list, [], species, false)).toEqual({})
    expect(applyFilterValidity({ country: 'US', sub1: 'CA-BC' }, list, [], species, false)).toEqual({ country: 'US' })
    expect(applyFilterValidity({ country: 'CA', sub2: 'Capital' }, list, [], species, false)).toEqual({ country: 'CA' })
    expect(applyFilterValidity({ country: 'CA', sub1: 'CA-BC', sub2: 'Capital' }, list, [], species, false)).toEqual({ country: 'CA', sub1: 'CA-BC', sub2: 'Capital' })
  })
  it('after a list change, places no species was seen in go', () => {
    expect(applyFilterValidity({ country: 'US', sub1: 'US-WA', sub2: 'King' }, list, [], species, true, seen)).toEqual({ country: 'US', sub1: 'US-WA', sub2: 'King' })
    expect(applyFilterValidity({ country: 'US', sub1: 'US-WA', sub2: 'Pierce' }, list, [], species, true, seen)).toEqual({ country: 'US', sub1: 'US-WA' })
    expect(applyFilterValidity({ country: 'US', sub1: 'US-OR' }, list, [], species, true, seen)).toEqual({ country: 'US' })
    expect(applyFilterValidity({ country: 'FR', sub1: 'FR-IDF' }, list, [], species, true, seen)).toEqual({})
  })
})

describe('the share image names the deepest place', async () => {
  const { filterLabel } = await import('@/lib/share/image')
  const ctx = { species, trips: [], countryName: (c: string) => ({ CA: 'Canada' })[c] ?? c, regionName: (c: string) => ({ 'CA-BC': 'British Columbia' })[c] ?? c }
  it('country, province, county', () => {
    expect(filterLabel({ country: 'CA' }, ctx)).toBe('Canada')
    expect(filterLabel({ country: 'CA', sub1: 'CA-BC' }, ctx)).toBe('British Columbia')
    expect(filterLabel({ country: 'CA', sub1: 'CA-BC', sub2: 'Capital', order: 'Strigiformes' }, ctx)).toBe('Owls · Capital, British Columbia')
  })
})
