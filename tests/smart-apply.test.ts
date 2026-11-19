// Item 9, part D: the search's understood chips, the words left for bird names, and the filter the chips apply.
import { describe, expect, it } from 'vitest'
import { applySmart, nameQuery, shownChips } from '@/lib/search/apply'
import { parseSmart, withoutChip, type SearchContext } from '@/lib/search/smart'
import type { BirdGroup } from '@/lib/search/groups'
import type { Regions } from '@/lib/species/types'

const today = new Date(2026, 10, 15)
const regions: Regions = { v: 1, countries: { CA: 'Canada', MX: 'Mexico' }, sub1: { 'CA-BC': 'British Columbia' } }
const groups: BirdGroup[] = [
  { id: 'waterfowl', name: { en: 'Waterfowl', es: 'Patos', pt: 'Patos', nl: 'Eenden', pl: 'Kaczki' }, lo: 1, hi: 100 },
]
const species = [{ ord: 'Passeriformes', fam: 'Turdidae', famCom: 'Thrushes' }]
const ctx: SearchContext = {
  today,
  lang: 'en',
  groups,
  regions,
  listPlaces: ['c:CA', 's:CA-BC'],
  statuses: [{ code: 'VU', name: 'Vulnerable' }],
  species,
}

const parse = (q: string, c: Partial<SearchContext> = {}) => parseSmart(q, { ...ctx, ...c })
const kindsOf = (q: string, c?: Partial<SearchContext>) => new Set(shownChips(parse(q, c).chips).map((x) => x.kind))

describe('the chips the search shows', () => {
  it('a group, a place and a period are shown; an order or family stays a bird-name word', () => {
    const p = parse('waterfowl canada 2026')
    expect(shownChips(p.chips).map((c) => c.kind).sort()).toEqual(['date', 'group', 'place'])
    expect(parse('turdidae', { ...ctx }).chips.map((c) => c.kind)).toEqual(['family'])
    expect(shownChips(parse('turdidae').chips)).toEqual([])
  })

  it('the name query keeps the words no shown chip covers, and the order or family word stays in it', () => {
    expect(nameQuery('robin canada', parse('robin canada').chips)).toBe('robin')
    expect(nameQuery('waterfowl', parse('waterfowl').chips)).toBe('')
    expect(nameQuery('turdidae', parse('turdidae').chips)).toBe('turdidae')
    expect(nameQuery('robin', [])).toBe('robin')
  })

  it('removing one chip is withoutChip on its exact span, then a reparse', () => {
    const q = 'waterfowl canada 2026'
    const canada = parse(q).chips.find((c) => c.kind === 'place')!
    const after = withoutChip(q, canada)
    expect(after).toBe('waterfowl 2026')
    expect(kindsOf(after)).toEqual(new Set(['group', 'date']))
  })
})

describe('applySmart', () => {
  it('a group, a place and a period set their fields, with the seen basis', () => {
    const p = parse('waterfowl canada 2026')
    const next = applySmart({}, p.filter, kindsOf('waterfowl canada 2026'))
    expect(next).toEqual({ group: 'waterfowl', countries: ['CA'], from: '2026-01', to: '2026-12', basis: 'seen' })
  })

  it('places are one dimension: a continent and the other countries picked before are replaced', () => {
    const next = applySmart({ continents: ['NA'], countries: ['MX'] }, parse('canada').filter, kindsOf('canada'))
    expect(next.countries).toEqual(['CA'])
    expect(next.continents).toBeUndefined()
  })

  it('a kind the query does not set is not kept: a search replaces every filter', () => {
    const current = { group: 'waterfowl', statuses: ['VU' as const], countries: ['MX'], order: 'Passeriformes', from: '2020-01' }
    expect(applySmart(current, parse('2026').filter, kindsOf('2026'))).toEqual({ from: '2026-01', to: '2026-12', basis: 'seen' })
  })

  it('lifers switch the basis, and the period goes with it', () => {
    const next = applySmart({ basis: 'seen' }, parse('lifers 2024').filter, kindsOf('lifers 2024'))
    expect(next.basis).toBe('lifer')
    expect(next.from).toBe('2024-01')
  })

  it('a threatened status sets the three categories, and an empty set leaves no statuses field', () => {
    const next = applySmart({}, parse('threatened').filter, kindsOf('threatened'))
    expect(next.statuses).toEqual(['VU', 'EN', 'CR'])
    expect(applySmart({ statuses: ['VU'] }, {}, new Set(['status'] as const)).statuses).toBeUndefined()
  })
})
