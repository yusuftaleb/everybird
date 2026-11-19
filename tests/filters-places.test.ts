import { describe, expect, it } from 'vitest'
import { en } from '@/i18n/messages/en'
import { buildList } from '@/lib/list/build-list'
import { applyFilter, clearPlaces, filterKey, filterPlaceKeys, filterToShow, hasPlaces, options, placeCounts, placeOptions, placeRows, toggleCountry, togglePlace, withCountries, withPlaces } from '@/lib/list/filters'
import { applyFilterValidity } from '@/lib/list/filters-validate'
import { DEFAULT_RULES, EMPTY_EDITS, type SourceRecord } from '@/lib/list/model'
import { buildSeen, seenOf, type SeenIndex } from '@/lib/list/seen'
import { childKey } from '@/lib/list/place-keys'
import type { ListEntry } from '@/lib/list/model'
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
const codes = (f: object) => applyFilter(list, f, species, seen).map((e) => e.code).sort()

describe('the Places filter: a set of countries, seen-here', () => {
  it('a country keeps every species seen there, not only lifers there; several keep species seen in ANY of them', () => {
    expect(codes({ countries: ['CA'] })).toEqual(['crow', 'duck', 'owl'])
    expect(codes({ countries: ['MX'] })).toEqual(['crow', 'duck'])
    expect(codes({ countries: ['US'] })).toEqual(['duck'])
    expect(codes({ countries: ['MX', 'US'] })).toEqual(['crow', 'duck'])
    expect(codes({ countries: ['FR'] })).toEqual([])
  })
  it('without the index (a shared link) places are the lifer places', () => {
    expect(applyFilter(list, { countries: ['CA'] }, species).map((e) => e.code).sort()).toEqual(['duck', 'owl'])
    expect(applyFilter(list, { countries: ['MX'] }, species).map((e) => e.code)).toEqual(['crow'])
    expect(applyFilter(list, { countries: ['CA', 'MX'] }, species).map((e) => e.code).sort()).toEqual(['crow', 'duck', 'owl'])
  })
  it('combines with taxonomy and time by AND (time is the lifer date)', () => {
    expect(codes({ countries: ['CA'], order: 'Passeriformes' })).toEqual(['crow'])
    expect(codes({ countries: ['CA'], from: '2019-01', to: '2019-12' })).toEqual(['duck'])
  })
  it('counts are species seen in each country, under the other filters but whatever is checked (a multi-select)', () => {
    const counts = (f: object) => options(list, f, 'country', species, (c) => c, seen).map((o) => [o.value, o.count])
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
    expect(filterToShow({ countries: ['CA', 'US'] }, crow, species, seen)).toEqual({ countries: ['CA', 'US'] })
    expect(filterToShow({ countries: ['US'] }, crow, species, seen)).toEqual({})
  })
})

describe('validity of places', () => {
  it('older state migrates: a single country joins the set; provinces and counties are dropped', () => {
    expect(applyFilterValidity({ country: 'CA' } as never, list, species, false)).toEqual({ countries: ['CA'] })
    expect(applyFilterValidity({ country: 'CA', sub1: 'CA-BC', sub2: 'Capital' } as never, list, species, false)).toEqual({ countries: ['CA'] })
    expect(applyFilterValidity({ sub1: 'CA-BC' } as never, list, species, false)).toEqual({})
    expect(applyFilterValidity({ countries: ['US', 'CA', 'US', 'nope'] }, list, species, false)).toEqual({ countries: ['CA', 'US'] })
    expect(applyFilterValidity({ countries: [] }, list, species, false)).toEqual({})
  })
  it('after a list change, countries no species was seen in go', () => {
    expect(applyFilterValidity({ countries: ['US'] }, list, species, true, seen)).toEqual({ countries: ['US'] })
    expect(applyFilterValidity({ countries: ['FR', 'US'] }, list, species, true, seen)).toEqual({ countries: ['US'] })
    expect(applyFilterValidity({ countries: ['FR'] }, list, species, true, seen)).toEqual({})
  })
})

describe('provinces and counties', () => {
  it('a province or a county keeps the species seen there; levels mix by ANY', () => {
    expect(codes({ provinces: ['CA-BC'] })).toEqual(['crow', 'duck'])
    expect(codes({ counties: ['CA-BC|Capital'] })).toEqual(['duck'])
    expect(codes({ provinces: ['CA-ON'], countries: ['MX'] })).toEqual(['crow', 'duck', 'owl'])
    expect(applyFilter(list, { provinces: ['CA-BC'] }, species).map((e) => e.code)).toEqual(['duck']) // lifer places
  })
  it('placeOptions: each level counted under the other filters, with its children', () => {
    const rowsOf = (f: object, parent?: string) => placeOptions(list, f, parent, species, (k) => k, seen).map((o) => [o.value, o.count, o.children])
    expect(rowsOf({})).toEqual([['n:NA', 3, 3]]) // one continent, three countries
    expect(rowsOf({}, 'n:NA')).toEqual([['c:CA', 3, 2], ['c:MX', 2, 0], ['c:US', 1, 1]])
    expect(rowsOf({}, 'c:CA')).toEqual([['s:CA-BC', 2, 1], ['s:CA-ON', 1, 0]])
    expect(rowsOf({}, 's:CA-BC')).toEqual([['k:CA-BC|Capital', 1, 0]])
    expect(rowsOf({ order: 'Strigiformes' }, 'c:CA')).toEqual([['s:CA-ON', 1, 0]])
    expect(rowsOf({ provinces: ['CA-ON'] }, 'c:CA')).toEqual(rowsOf({}, 'c:CA')) // whatever is checked
  })
  it('a county seen without a province counts at its country only: no province or county option, no children', () => {
    const recs = [rec('owl', { date: '2021-01-01', place: { country: 'KE' }, seen: ['2021-01-01|KE|Some county'] })]
    const l = buildList(recs, EMPTY_EDITS, DEFAULT_RULES)
    const s = buildSeen(recs, EMPTY_EDITS, DEFAULT_RULES, l)
    const rowsOf = (parent?: string) => placeOptions(l, {}, parent, species, (k) => k, s).map((o) => [o.value, o.count, o.children])
    expect(rowsOf()).toEqual([['n:AF', 1, 1]])
    expect(rowsOf('n:AF')).toEqual([['c:KE', 1, 0]])
    expect(rowsOf('c:KE')).toEqual([])
    expect(applyFilter(l, { countries: ['KE'] }, species, s).map((e) => e.code)).toEqual(['owl'])
    expect(applyFilter(l, { counties: ['KE|Some county'] }, species, s)).toEqual([])
  })
  it('togglePlace narrows and widens; a selection never holds a place and its ancestor', () => {
    expect(togglePlace({ countries: ['CA'] }, 's:CA-BC')).toEqual({ provinces: ['CA-BC'] })
    expect(togglePlace({ provinces: ['CA-BC'] }, 'c:CA')).toEqual({ countries: ['CA'] })
    expect(togglePlace({ counties: ['CA-BC|Capital'], countries: ['MX'] }, 's:CA-BC')).toEqual({ countries: ['MX'], provinces: ['CA-BC'] })
    expect(togglePlace({ provinces: ['CA-BC'] }, 'k:CA-BC|Capital')).toEqual({ counties: ['CA-BC|Capital'] })
    expect(togglePlace({ provinces: ['CA-BC'], order: 'X' }, 's:CA-BC')).toEqual({ order: 'X' })
    expect(withPlaces({ order: 'X' }, ['s:CA-BC', 'c:CA', 'k:US-WA|King', 'nope'])).toEqual({ order: 'X', countries: ['CA'], counties: ['US-WA|King'] })
    expect(withPlaces({ countries: ['CA'], provinces: ['US-WA'] }, [])).toEqual({})
  })
  it('withCountries sets only the country level: provinces and counties outside those countries stay', () => {
    expect(withCountries({ provinces: ['CA-BC', 'US-WA'] }, ['CA'])).toEqual({ countries: ['CA'], provinces: ['US-WA'] })
    expect(withCountries({ countries: ['CA'], counties: ['US-WA|King'] }, [])).toEqual({ counties: ['US-WA|King'] })
  })
  it('same-named counties in two states are two places', () => {
    const r = [rec('duck', { date: '2020-01-01', seen: ['2020-01-01|US-OR|Washington'] }), rec('owl', { date: '2020-01-01', seen: ['2020-01-01|US-PA|Washington'] })]
    const l = buildList(r, EMPTY_EDITS, DEFAULT_RULES), s = buildSeen(r, EMPTY_EDITS, DEFAULT_RULES, l)
    expect(applyFilter(l, { counties: ['US-OR|Washington'] }, species, s).map((e) => e.code)).toEqual(['duck'])
  })
  it('keys: unchanged for countries; provinces and counties appended', () => {
    expect(filterKey({ countries: ['US', 'CA'] })).toBe('c:CA,US')
    expect(filterKey({ provinces: ['CA-ON', 'CA-BC'], counties: ['US-WA|King'] })).toBe('s:CA-BC,CA-ON|k:US-WA|King')
    expect(filterPlaceKeys({ counties: ['US-WA|King'], provinces: ['CA-BC'], countries: ['MX'] })).toEqual(['c:MX', 's:CA-BC', 'k:US-WA|King'])
  })
  it('a search pick keeps places it was seen in, else clears every place level', () => {
    const crow = list.find((e) => e.code === 'crow')!
    expect(filterToShow({ provinces: ['CA-BC'] }, crow, species, seen)).toEqual({ provinces: ['CA-BC'] })
    expect(filterToShow({ provinces: ['CA-ON'], counties: ['CA-BC|Capital'] }, crow, species, seen)).toEqual({})
  })
  it('one pass counts every level as placeOptions did level by level, odd codes too', () => {
    // The level-by-level count placeOptions made before placeCounts (the other filters are left out here: none set).
    const reference = (l: ListEntry[], parent: string | undefined, s: SeenIndex) => {
      const counts = new Map<string, number>()
      const kids = new Map<string, Set<string>>()
      for (const e of l) {
        const here = new Set<string>()
        for (const p of seenOf(s, e)) {
          const k = childKey(p, parent)
          if (!k) continue
          here.add(k)
          const kid = childKey(p, k)
          if (kid) kids.set(k, (kids.get(k) ?? new Set()).add(kid))
        }
        for (const k of here) counts.set(k, (counts.get(k) ?? 0) + 1)
      }
      return [...counts].map(([value, count]) => [value, count, kids.get(value)?.size ?? 0]).sort((a, b) => (b[1] as number) - (a[1] as number) || String(a[0]).localeCompare(String(b[0])))
    }
    const places = ['CA-BC|Capital', 'CA-BC|Okanagan', 'CA-ON', 'US-WA|King', 'EG', 'Xx-odd|Some county', 'zz', 'CA-BC']
    const recs = Array.from({ length: 40 }, (_, i) => rec(`sp${i}`, { date: '2020-01-01', place: i % 7 ? { country: 'CA' } : { country: 'q', sub1: 'q_1', sub2: 'Odd' }, seen: i % 5 ? places.filter((_, j) => (i + j) % 3 === 0).map((p) => `2020-01-01|${p}`) : undefined }))
    const l = buildList(recs, EMPTY_EDITS, DEFAULT_RULES)
    const s = buildSeen(recs, EMPTY_EDITS, DEFAULT_RULES, l)
    const pc = placeCounts(l, {}, species, s)
    const parents = [undefined, ...new Set(placeRows(pc, undefined, (k) => k).flatMap((c) => [c.value, ...placeRows(pc, c.value, (k) => k).map((r) => r.value)]))]
    expect(parents.length).toBeGreaterThan(8)
    for (const parent of parents) expect(placeRows(pc, parent, (k) => k).map((o) => [o.value, o.count, o.children]), parent).toEqual(reference(l, parent, s))
  })
  it.skipIf(process.env.SKIP_PERF === '1')('5,000 species with 20 places each: every level in under 150 ms', () => {
    // 5 countries x 4 provinces x 5 counties = 100 counties; each species seen in 20 of them.
    const isos = ['CA', 'US', 'MX', 'KE', 'FR']
    const counties: string[] = []
    for (const c of isos) for (let p = 0; p < 4; p++) for (let k = 0; k < 5; k++) counties.push(`${c}-P${p}|County ${k}`)
    const bigRows = Array.from({ length: 5000 }, (_, i) => row(`sp${i}`, `Ord${i % 20}`, `Fam${i % 100}`, i))
    const big: SpeciesIndex = { rows: bigRows, byCode: new Map(bigRows.map((r) => [(r as { code: string }).code, r])), search: () => [] }
    const recs = bigRows.map((r, i) => {
      const seenAt = Array.from({ length: 20 }, (_, j) => `2020-01-01|${counties[(i * 7 + j * 5) % counties.length]}`)
      return rec((r as { code: string }).code, { date: '2020-01-01', place: { country: 'CA', sub1: 'CA-P0' }, seen: seenAt })
    })
    const l = buildList(recs, EMPTY_EDITS, DEFAULT_RULES)
    const s = buildSeen(recs, EMPTY_EDITS, DEFAULT_RULES, l)
    const time = (fn: () => unknown) => { const t = performance.now(); fn(); return performance.now() - t }
    const lab = (k: string) => k
    // Warm up once so the timing is the steady state, not the JIT.
    placeOptions(l, {}, undefined, big, lab, s)
    const at = [
      time(() => expect(placeOptions(l, {}, undefined, big, lab, s)).toHaveLength(3)),
      time(() => expect(placeOptions(l, {}, 'n:NA', big, lab, s)).toHaveLength(3)),
      time(() => expect(placeOptions(l, {}, 'c:CA', big, lab, s)).toHaveLength(4)),
      time(() => expect(placeOptions(l, {}, 's:CA-P0', big, lab, s)).toHaveLength(5)),
      time(() => expect(applyFilter(l, { counties: ['CA-P0|County 0'] }, big, s).length).toBeGreaterThan(0)),
    ]
    for (const ms of at) expect(ms).toBeLessThan(150)
  })
})

describe('validity of provinces and counties', () => {
  it('bad codes go, ancestors win', () => {
    expect(applyFilterValidity({ provinces: ['CA-BC', 'CA-BC', 'bad'], counties: ['US-WA|King', 'nope', 'CA-BC|Capital'] }, list, species, false)).toEqual({ provinces: ['CA-BC'], counties: ['US-WA|King'] })
  })
  it('after a list change, places no species was seen in go', () => {
    expect(applyFilterValidity({ provinces: ['CA-QC', 'CA-ON'] }, list, species, true, seen)).toEqual({ provinces: ['CA-ON'] })
    expect(applyFilterValidity({ counties: ['CA-BC|Nowhere'] }, list, species, true, seen)).toEqual({})
  })
})

describe('the share image names the countries', async () => {
  const { filterLabel } = await import('@/lib/share/image')
  const ctx = { species, countryName: (c: string) => ({ CA: 'Canada', EG: 'Egypt', MX: 'Mexico' })[c] ?? c }
  it('one, two, three or more', () => {
    expect(filterLabel({ countries: ['CA'] }, ctx, en.ui)).toBe('Canada')
    expect(filterLabel({ countries: ['CA', 'EG'], order: 'Strigiformes' }, ctx, en.ui)).toBe('Owls · Canada + Egypt')
    expect(filterLabel({ countries: ['CA', 'EG', 'MX'] }, ctx, en.ui)).toBe('Canada and 2 more')
  })
  it('provinces and counties by their own names when the regions are given', () => {
    const regions = { countries: { CA: 'Canada', EG: 'Egypt', KE: 'Kenya' }, sub1: { 'CA-BC': 'British Columbia' } }
    expect(filterLabel({ order: 'Strigiformes', provinces: ['CA-BC'] }, { species, countryName: (c) => c, regions }, en.ui)).toBe('Owls · British Columbia')
    expect(filterLabel({ countries: ['KE'], counties: ['CA-BC|Capital'] }, { species, countryName: (c) => c, regions }, en.ui)).toBe('Kenya + Capital')
  })
})

describe('region presets in filters', () => {
  it('filters recorded sightings by region preset and combines cleanly with countries', () => {
    expect(codes({ regions: ['latam'] })).toEqual(['crow', 'duck'])
    expect(codes({ regions: ['central-america'] })).toEqual(['crow', 'duck'])
    expect(codes({ regions: ['northern-america'] })).toEqual(['crow', 'duck', 'owl'])
    expect(codes({ regions: ['me'] })).toEqual([])
    expect(togglePlace({}, 'r:latam')).toEqual({ regions: ['latam'] })
    expect(togglePlace({ regions: ['latam'] }, 'c:CA')).toEqual({ countries: ['CA'], regions: ['latam'] })
    expect(togglePlace({ countries: ['CA'], regions: ['latam'] }, 'r:latam')).toEqual({ countries: ['CA'] })
    expect(withPlaces({}, ['r:me', 'r:latam', 'r:me', 'r:bogus'])).toEqual({ regions: ['latam', 'me'] })
    expect(hasPlaces({ regions: ['latam'] })).toBe(true)
    expect(clearPlaces({ regions: ['latam'], order: 'Strigiformes' })).toEqual({ order: 'Strigiformes' })
    expect(filterPlaceKeys({ continents: ['NA'], regions: ['latam'], countries: ['BR'] })).toEqual(['n:NA', 'r:latam', 'c:BR'])
    expect(filterKey({ regions: ['latam', 'me'] })).toBe('p:latam,me')
    expect(applyFilterValidity({ regions: ['latam', 'me', 'nope' as never] }, list, species, true, seen)).toEqual({ regions: ['latam'] })
  })

  it('placeCounts tallies each species at most once per preset', () => {
    const counts = placeCounts(list, {}, species, seen)
    expect(counts.regions.get('latam')?.n).toBe(2)
    expect(counts.regions.get('northern-america')?.n).toBe(3)
  })
})
