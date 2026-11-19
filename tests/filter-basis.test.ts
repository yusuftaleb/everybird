import { describe, expect, it } from 'vitest'
import { en as enMessages } from '@/i18n/messages/en'
import { buildList } from '@/lib/list/build-list'
import { filterChips, withoutFilterChip } from '@/lib/list/chips'
import { filterLabel } from '@/lib/share/image'
import { applyFilter, filterKey, filterToShow, placeCounts, placeRows } from '@/lib/list/filters'
import { applyFilterValidity } from '@/lib/list/filters-validate'
import { filtersCount, seenLabels, timeSpoken, timeSummary } from '@/lib/list/filter-summary'
import { DEFAULT_RULES, EMPTY_EDITS, type ListEntry, type SourceRecord } from '@/lib/list/model'
import { SeenAgg, buildSeen } from '@/lib/list/seen'
import { entryInFilter, sightingIn } from '@/lib/list/sighting'
import type { SpeciesIndex } from '@/lib/species/load'
import type { BirdGroup } from '@/lib/search/groups'

const en = enMessages.ui
const row = (code: string, ord: string, fam: string, to: number) => ({ code, com: code, sci: code, ord, fam, famCom: fam, to }) as never
const rows = [row('merlin', 'Falconiformes', 'Falconidae', 5), row('duck', 'Anseriformes', 'Anatidae', 20), row('crow', 'Passeriformes', 'Corvidae', 90)]
const groups = new Map<string, BirdGroup>([
  ['raptors', { id: 'raptors', name: { en: 'Raptors', es: 'Rapaces', pt: 'Rapinas', nl: 'Roofvogels', pl: 'Drapieżne' }, lo: 1, hi: 10 }],
  ['waterfowl', { id: 'waterfowl', name: { en: 'Waterfowl', es: 'Patos', pt: 'Patos', nl: 'Eenden', pl: 'Kaczki' }, lo: 15, hi: 30 }],
])
const species: SpeciesIndex = { rows, byCode: new Map(rows.map((r) => [(r as { code: string }).code, r])), search: () => [], groups }
const noGroups: SpeciesIndex = { ...species, groups: undefined }

/** A record with seen-here and month sets from [place key, months...] lists (the importers' output). */
function rec(code: string, date: string, place: SourceRecord['place'], sightings: [string, ...string[]][] | undefined): SourceRecord {
  if (!sightings) return { code, source: 'ebird', date, place }
  const agg = new SeenAgg()
  for (const [key, ...months] of sightings) {
    agg.addMonths(code, key, months)
    agg.addKey(code, key, months[0] ?? '')
  }
  return { code, source: 'ebird', date, place, seen: agg.get(code), seenMonths: agg.getMonths(code) }
}
// merlin: lifer Egypt 2019-06; then BC in 2023-03 and 2026-02. duck: lifer BC 2024-05, seen in BC in 2026-04 too.
// crow: an older save (no month sets): lifer BC 2020-01.
const records = [
  rec('merlin', '2019-06-10', { country: 'EG' }, [['EG', '2019-06'], ['CA-BC', '2023-03', '2026-02']]),
  rec('duck', '2024-05-02', { country: 'CA', sub1: 'CA-BC' }, [['CA-BC', '2024-05', '2026-04']]),
  rec('crow', '2020-01-05', { country: 'CA', sub1: 'CA-BC' }, undefined),
]
const list = buildList(records, EMPTY_EDITS, DEFAULT_RULES)
const seen = buildSeen(records, EMPTY_EDITS, DEFAULT_RULES, list)
const codes = (f: object, sp = species) => applyFilter(list, f, sp, seen).map((e) => e.code).sort()
const entry = (code: string) => list.find((e) => e.code === code) as ListEntry

describe('basis: lifer (the default) and seen', () => {
  it('lifer: a range is about first-seen dates', () => {
    expect(codes({ countries: ['CA'], from: '2026-01', to: '2026-12' })).toEqual([])
    expect(codes({ countries: ['CA'], from: '2024-01', to: '2024-12', basis: 'lifer' })).toEqual(['duck'])
  })
  it('seen: places and range together mean seen at one of those places in that period', () => {
    expect(codes({ countries: ['CA'], from: '2026-01', to: '2026-12', basis: 'seen' })).toEqual(['duck', 'merlin'])
    expect(codes({ countries: ['EG'], from: '2026-01', to: '2026-12', basis: 'seen' })).toEqual([])
    expect(codes({ countries: ['EG'], from: '2019-01', to: '2019-12', basis: 'seen' })).toEqual(['merlin'])
    expect(codes({ provinces: ['CA-BC'], from: '2023-03', to: '2023-03', basis: 'seen' })).toEqual(['merlin'])
  })
  it('seen: a range alone is seen anywhere in it', () => {
    expect(codes({ from: '2023-01', to: '2023-12', basis: 'seen' })).toEqual(['merlin'])
    expect(codes({ from: '2023-01', to: '2023-12', basis: 'lifer' })).toEqual([])
  })
  it('a species with no month sets falls back to its places and its lifer date', () => {
    expect(codes({ countries: ['CA'], from: '2020-01', to: '2020-12', basis: 'seen' })).toEqual(['crow'])
    expect(codes({ countries: ['CA'], from: '2026-01', to: '2026-12', basis: 'seen' })).not.toContain('crow')
  })
  it('places alone are unchanged by the basis', () => {
    expect(codes({ countries: ['CA'], basis: 'seen' })).toEqual(codes({ countries: ['CA'] }))
  })
  it('a Places count under seen + range counts only species seen THERE in the period', () => {
    // The top level is the continents (nf-10); the countries are one level down.
    const rowsFor = (f: object, parent?: string) => placeRows(placeCounts(list, f, species, seen), parent, (k) => k).map((r) => [r.value, r.count])
    expect(rowsFor({ from: '2019-01', to: '2019-12', basis: 'seen' })).toEqual([['n:AF', 1]])
    expect(rowsFor({ from: '2019-01', to: '2019-12', basis: 'seen' }, 'n:AF')).toEqual([['c:EG', 1]])
    expect(rowsFor({ from: '2026-01', to: '2026-12', basis: 'seen' })).toEqual([['n:NA', 2]])
    expect(rowsFor({ from: '2026-01', to: '2026-12', basis: 'seen' }, 'n:NA')).toEqual([['c:CA', 2]])
  })
  it('the basis has a key only when it applies', () => {
    expect(filterKey({ basis: 'seen' })).toBe('')
    expect(filterKey({ countries: ['CA'], basis: 'seen' })).toBe('c:CA') // places alone: nothing to be seen in a period
    expect(filterKey({ from: '2026-01', basis: 'seen' })).toBe('r:2026-01~|b:seen')
    expect(filterKey({ from: '2026-01', basis: 'lifer' })).toBe('r:2026-01~')
  })
})

describe('the card and tooltip inside the filter (sightingIn)', () => {
  it('shows the first sighting inside the filter, whatever the basis', () => {
    const f = { countries: ['CA'], from: '2023-01', to: '2023-12' }
    expect(sightingIn(entry('merlin'), f, seen)).toEqual({ date: '2023-03', place: { country: 'CA', sub1: 'CA-BC' } })
    expect(sightingIn(entry('merlin'), { ...f, basis: 'seen' }, seen)).toEqual({ date: '2023-03', place: { country: 'CA', sub1: 'CA-BC' } })
  })
  it('places alone: the first sighting there; a range alone: the first in it (any place)', () => {
    expect(sightingIn(entry('merlin'), { countries: ['CA'] }, seen)?.date).toBe('2023-03')
    expect(sightingIn(entry('merlin'), { from: '2025-01' }, seen)).toEqual({ date: '2026-02', place: { country: 'CA', sub1: 'CA-BC' } })
  })
  it('keeps the lifer with no filter, no month sets, or nothing inside the filter with a month', () => {
    expect(sightingIn(entry('merlin'), {}, seen)).toBeUndefined()
    expect(sightingIn(entry('merlin'), { order: 'X' }, seen)).toBeUndefined()
    // crow has no month sets: its lifer, inside the filter, stands with its full date
    expect(sightingIn(entry('crow'), { countries: ['CA'] }, seen)).toEqual({ date: '2020-01-05', place: { country: 'CA', sub1: 'CA-BC' } })
    expect(sightingIn(entry('merlin'), { countries: ['FR'] }, seen)).toBeUndefined()
    expect(sightingIn(entry('merlin'), { countries: ['CA'] }, undefined)).toBeUndefined()
    expect(entryInFilter(entry('crow'), { countries: ['CA'] }, seen)).toBe(entry('crow'))
    expect(entryInFilter(entry('merlin'), undefined, seen)).toBe(entry('merlin'))
  })
  it('entryInFilter swaps date and place only', () => {
    const e = entryInFilter(entry('merlin'), { countries: ['CA'] }, seen)
    expect(e).toMatchObject({ code: 'merlin', date: '2023-03', place: { country: 'CA', sub1: 'CA-BC' } })
  })
})

describe('Filter.group', () => {
  it('keeps species whose taxon order is inside the group; unknown ids match nothing; no groups file ignores it', () => {
    expect(codes({ group: 'raptors' })).toEqual(['merlin'])
    expect(codes({ group: 'waterfowl' })).toEqual(['duck'])
    expect(codes({ group: 'nope' })).toEqual([])
    expect(codes({ group: 'raptors' }, noGroups)).toEqual(['crow', 'duck', 'merlin'])
    expect(codes({ group: 'waterfowl', order: 'Anseriformes' })).toEqual(['duck'])
    expect(codes({ group: 'waterfowl', order: 'Falconiformes' })).toEqual([])
  })
  it('has a key, validation drops unknown ids, and filterToShow drops a group that hides the bird', () => {
    expect(filterKey({ order: 'X', group: 'raptors' })).toBe('o:X|g:raptors')
    expect(applyFilterValidity({ group: 'nope' }, list, species, false, seen)).toEqual({})
    expect(applyFilterValidity({ group: 'raptors' }, list, species, false, seen)).toEqual({ group: 'raptors' })
    expect(applyFilterValidity({ group: 'raptors' }, list, noGroups, false, seen)).toEqual({ group: 'raptors' })
    expect(applyFilterValidity({ group: 'waterfowl' }, [entry('merlin')], species, true, seen)).toEqual({})
    expect(filterToShow({ group: 'raptors' }, entry('duck'), species, seen)).toEqual({})
    expect(filterToShow({ group: 'raptors' }, entry('merlin'), species, seen)).toEqual({ group: 'raptors' })
  })
  it('shows as a chip and a chip removes it', () => {
    const chips = filterChips({ group: 'raptors', countries: ['CA'] }, { countries: { CA: 'Canada' }, sub1: {} }, en, (id) => groups.get(id)?.name.en)
    expect(chips.map((c) => [c.kind, c.label])).toEqual([['group', 'Raptors'], ['place', 'Canada']])
    expect(withoutFilterChip({ group: 'raptors', countries: ['CA'] }, chips[0])).toEqual({ countries: ['CA'] })
  })
})

describe('validation and labels', () => {
  it('basis is kept only as seen; filterToShow clears a range the places and the range together exclude', () => {
    expect(applyFilterValidity({ basis: 'lifer' }, list, species, false, seen)).toEqual({})
    expect(applyFilterValidity({ basis: 'seen', countries: ['CA'] }, list, species, false, seen)).toEqual({ basis: 'seen', countries: ['CA'] })
    const f = { countries: ['EG'], from: '2026-01', to: '2026-12', basis: 'seen' as const }
    expect(filterToShow(f, entry('merlin'), species, seen)).toEqual({ countries: ['EG'], basis: 'seen' })
    expect(filterToShow({ countries: ['CA'], from: '2026-01', to: '2026-12', basis: 'seen' }, entry('merlin'), species, seen)).toEqual({ countries: ['CA'], from: '2026-01', to: '2026-12', basis: 'seen' })
  })
  it('a range pruned by list changes survives when any sighting is in it, under seen', () => {
    expect(applyFilterValidity({ from: '2026-01', to: '2026-12', basis: 'seen' }, list, species, true, seen)).toEqual({ from: '2026-01', to: '2026-12', basis: 'seen' })
    expect(applyFilterValidity({ from: '2026-01', to: '2026-12' }, list, species, true, seen)).toEqual({})
  })
  it('the time summary and the spoken text say "Seen" under the seen basis; the share label too', () => {
    expect(timeSummary({ from: '2026-01', to: '2026-12' }, en)).toBe('2026')
    expect(timeSummary({ from: '2026-01', to: '2026-12', basis: 'seen' }, en)).toBe('Seen: 2026')
    expect(timeSpoken({ from: '2026-03', to: '2026-03', basis: 'seen' }, en)).toBe('Seen: March 2026')
    expect(filtersCount({ from: '2026-01', basis: 'seen' })).toBe(1)
    const ctx = { species, countryName: () => 'Canada', regions: { countries: { CA: 'Canada' }, sub1: {} } }
    expect(filterLabel({ countries: ['CA'], from: '2026-01', to: '2026-12', basis: 'seen' }, ctx, en)).toBe('Seen in Canada · 2026')
    expect(filterLabel({ from: '2026-01', to: '2026-12', basis: 'seen' }, ctx, en)).toBe('Seen: 2026')
    expect(filterLabel({ countries: ['CA'], from: '2026-01', to: '2026-12' }, ctx, en)).toBe('Canada · 2026')
    expect(filterLabel({ countries: ['CA'], basis: 'seen' }, ctx, en)).toBe('Canada')
    expect(filterLabel({ group: 'raptors', countries: ['CA'] }, { ...ctx, groupName: (id) => groups.get(id)?.name.en }, en)).toBe('Raptors · Canada')
    expect(seenLabels({ basis: 'seen', from: '2026-01' }, undefined, undefined, en)).toEqual({ place: undefined, range: undefined })
  })
})

describe('performance on a big list', () => {
  it('matches 11,000 species with basis seen over many places and months quickly, decoding once', () => {
    const many: SourceRecord[] = []
    const places = ['CA-BC', 'CA-ON', 'US-WA', 'MX', 'KE', 'EG', 'BR', 'NL']
    for (let i = 0; i < 11000; i++) {
      const months: [string, ...string[]][] = places.slice(0, 1 + (i % 8)).map((p, j) => [p, ...Array.from({ length: 40 }, (_, k) => `${2015 + ((k + j) % 11)}-${String(1 + ((k * 7 + i) % 12)).padStart(2, '0')}`)])
      many.push(rec(`s${i}`, '2015-01-01', { country: 'CA', sub1: 'CA-BC' }, months))
    }
    const big = buildList(many, EMPTY_EDITS, DEFAULT_RULES)
    const rowsBig = big.map((e) => row(e.code, 'O', 'F', 1))
    const sp: SpeciesIndex = { rows: rowsBig, byCode: new Map(rowsBig.map((r) => [(r as { code: string }).code, r])), search: () => [] }
    const bigSeen = buildSeen(many, EMPTY_EDITS, DEFAULT_RULES, big)
    const t0 = performance.now()
    let n = 0
    for (let r = 0; r < 20; r++) n = applyFilter(big, { provinces: ['CA-ON'], countries: ['KE'], from: '2020-01', to: '2022-12', basis: 'seen' }, sp, bigSeen).length
    const ms = (performance.now() - t0) / 20
    expect(n).toBeGreaterThan(0)
    if (!process.env.SKIP_PERF) expect(ms).toBeLessThan(150)
  })
})
