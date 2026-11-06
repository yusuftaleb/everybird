import { describe, expect, it } from 'vitest'
import { buildList } from '@/lib/list/build-list'
import { applyFilter, filterKey, filterToShow, options, toggleCountry, withCountries } from '@/lib/list/filters'
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

describe('the Places filter: a set of countries, seen-here', () => {
  it('a country keeps every species seen there, not only lifers there; several keep species seen in ANY of them', () => {
    expect(codes({ countries: ['CA'] })).toEqual(['crow', 'duck', 'owl'])
    expect(codes({ countries: ['MX'] })).toEqual(['crow', 'duck'])
    expect(codes({ countries: ['US'] })).toEqual(['duck'])
    expect(codes({ countries: ['MX', 'US'] })).toEqual(['crow', 'duck'])
    expect(codes({ countries: ['FR'] })).toEqual([])
  })
  it('without the index (a shared link) places are the lifer places', () => {
    expect(applyFilter(list, { countries: ['CA'] }, species, []).map((e) => e.code).sort()).toEqual(['duck', 'owl'])
    expect(applyFilter(list, { countries: ['MX'] }, species, []).map((e) => e.code)).toEqual(['crow'])
    expect(applyFilter(list, { countries: ['CA', 'MX'] }, species, []).map((e) => e.code).sort()).toEqual(['crow', 'duck', 'owl'])
  })
  it('combines with taxonomy and time by AND (time is the lifer date)', () => {
    expect(codes({ countries: ['CA'], order: 'Passeriformes' })).toEqual(['crow'])
    expect(codes({ countries: ['CA'], from: '2019-01', to: '2019-12' })).toEqual(['duck'])
  })
  it('counts are species seen in each country, under the other filters but whatever is checked (a multi-select)', () => {
    const counts = (f: object) => options(list, f, 'country', species, [], (c) => c, seen).map((o) => [o.value, o.count])
    expect(counts({})).toEqual([['CA', 3], ['MX', 2], ['US', 1]])
    expect(counts({ countries: ['US'] })).toEqual([['CA', 3], ['MX', 2], ['US', 1]])
    expect(counts({ order: 'Strigiformes' })).toEqual([['CA', 1]])
  })
  it('keys list the countries sorted, whatever order they were checked in', () => {
    expect(filterKey({ countries: ['US', 'CA'] })).toBe('c:CA,US')
    expect(filterKey({ countries: ['CA', 'US'], order: 'X' })).toBe(filterKey({ order: 'X', countries: ['US', 'CA'] }))
  })
  it('toggleCountry checks and unchecks, kept sorted; none left drops the dimension', () => {
    expect(toggleCountry({}, 'US')).toEqual({ countries: ['US'] })
    expect(toggleCountry({ countries: ['US'] }, 'CA')).toEqual({ countries: ['CA', 'US'] })
    expect(toggleCountry({ countries: ['CA', 'US'] }, 'CA')).toEqual({ countries: ['US'] })
    expect(toggleCountry({ countries: ['US'], order: 'X' }, 'US')).toEqual({ order: 'X' })
    expect(withCountries({ countries: ['US'] }, [])).toEqual({})
    expect(withCountries({}, ['US', 'CA', 'US'])).toEqual({ countries: ['CA', 'US'] })
  })
  it('a search pick keeps countries it was seen in, and clears them when it was seen in none', () => {
    const crow = list.find((e) => e.code === 'crow')!
    expect(filterToShow({ countries: ['CA', 'US'] }, crow, species, [], seen)).toEqual({ countries: ['CA', 'US'] })
    expect(filterToShow({ countries: ['US'] }, crow, species, [], seen)).toEqual({})
  })
})

describe('validity of places', () => {
  it('older state migrates: a single country joins the set; provinces and counties are dropped', () => {
    expect(applyFilterValidity({ country: 'CA' } as never, list, [], species, false)).toEqual({ countries: ['CA'] })
    expect(applyFilterValidity({ country: 'CA', sub1: 'CA-BC', sub2: 'Capital' } as never, list, [], species, false)).toEqual({ countries: ['CA'] })
    expect(applyFilterValidity({ sub1: 'CA-BC' } as never, list, [], species, false)).toEqual({})
    expect(applyFilterValidity({ countries: ['US', 'CA', 'US', 'nope'] }, list, [], species, false)).toEqual({ countries: ['CA', 'US'] })
    expect(applyFilterValidity({ countries: [] }, list, [], species, false)).toEqual({})
  })
  it('after a list change, countries no species was seen in go', () => {
    expect(applyFilterValidity({ countries: ['US'] }, list, [], species, true, seen)).toEqual({ countries: ['US'] })
    expect(applyFilterValidity({ countries: ['FR', 'US'] }, list, [], species, true, seen)).toEqual({ countries: ['US'] })
    expect(applyFilterValidity({ countries: ['FR'] }, list, [], species, true, seen)).toEqual({})
  })
})

describe('the share image names the countries', async () => {
  const { filterLabel } = await import('@/lib/share/image')
  const ctx = { species, trips: [], countryName: (c: string) => ({ CA: 'Canada', EG: 'Egypt', MX: 'Mexico' })[c] ?? c }
  it('one, two, three or more', () => {
    expect(filterLabel({ countries: ['CA'] }, ctx)).toBe('Canada')
    expect(filterLabel({ countries: ['CA', 'EG'], order: 'Strigiformes' }, ctx)).toBe('Owls · Canada + Egypt')
    expect(filterLabel({ countries: ['CA', 'EG', 'MX'] }, ctx)).toBe('Canada and 2 more')
  })
  it('a trip in the one chosen country is not named twice', () => {
    const trip = { id: 'EG-2021-09-01', country: 'EG', start: '2021-09-01', end: '2021-09-03', label: 'Egypt · Sep 2021', codes: [] }
    expect(filterLabel({ countries: ['EG'], trip: trip.id }, { ...ctx, trips: [trip] })).toBe('Egypt · Sep 2021')
    expect(filterLabel({ countries: ['CA', 'EG'], trip: trip.id }, { ...ctx, trips: [trip] })).toBe('Canada + Egypt · Egypt · Sep 2021')
  })
})
