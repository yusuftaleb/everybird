// Smart search: a search REPLACES the filters (it never stacks onto the previous search's or the manual ones), the
// bird group shows once, and the Filters button's count badge counts it.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { filterChips } from '@/lib/list/chips'
import { filtersCount, filtersSpoken } from '@/lib/list/filter-summary'
import { applyFilter, type Filter } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import { applySmart, shownChips } from '@/lib/search/apply'
import type { GroupsFile } from '@/lib/search/groups'
import { parseSmart, type SearchContext } from '@/lib/search/smart'
import { buildSpeciesIndex } from '@/lib/species/load'
import { EN_UI as t } from '@/i18n/messages/en-ui'

const groupsFile: GroupsFile = JSON.parse(readFileSync('public/data/groups.v1.json', 'utf8'))
const hawks = groupsFile.groups.find((g) => g.id === 'vultures-hawks-and-allies')!
const owls = groupsFile.groups.find((g) => g.id === 'owls')!

const sp = (code: string, ord: string, fam: string, to: number, iu?: string) =>
  ({ code, com: code, sci: code, ord, fam, famCom: fam, to, g: 10, gSrc: 'avonet', st: true, ar: 1, q: true, ...(iu ? { iu } : {}) }) as never
const index = {
  ...buildSpeciesIndex([
    sp('turvul', 'Cathartiformes', 'Cathartidae', hawks.lo + 1, 'LC'),
    sp('redtai', 'Accipitriformes', 'Accipitridae', hawks.lo + 100, 'LC'),
    sp('balea1', 'Accipitriformes', 'Accipitridae', hawks.lo + 200, 'VU'),
    sp('grhowl', 'Strigiformes', 'Strigidae', owls.lo + 1, 'LC'),
  ]),
  groups: new Map(groupsFile.groups.map((g) => [g.id, g])),
}
const ca = { country: 'CA' }
const list: ListEntry[] = ['turvul', 'redtai', 'balea1', 'grhowl'].map((code) => ({ code, date: '2020-05', place: code === 'balea1' ? { country: 'US' } : ca, heard: false, dead: false, media: false, sources: [] }) as ListEntry)

const ctx: SearchContext = {
  today: new Date(2026, 10, 15, 12), lang: 'en', groups: groupsFile.groups,
  regions: { v: 1, countries: { CA: 'Canada', US: 'United States of America' }, sub1: {} },
  listPlaces: ['c:CA', 'c:US'],
  statuses: [{ code: 'LC', name: 'Least Concern' }],
}
const search = (current: Filter, q: string): Filter => {
  const p = parseSmart(q, ctx)
  return applySmart(current, p.filter, new Set(shownChips(p.chips).map((c) => c.kind)))
}

describe('hawks + Canada + Least Concern', () => {
  it('a manual taxonomy filter left from before (an order and a family that do not meet) no longer empties it', () => {
    const stale: Filter = { order: 'Accipitriformes', family: 'Cathartidae' }
    // Before the fix both were kept (each reaches into the group), and an order with a family outside it matches nothing.
    expect(applyFilter(list, { ...stale, group: hawks.id, countries: ['CA'], statuses: ['LC'] }, index)).toHaveLength(0)
    const next = search(stale, 'hawks canada least concern')
    expect(next).toEqual({ group: hawks.id, countries: ['CA'], statuses: ['LC'] })
    expect(applyFilter(list, next, index).map((e) => e.code)).toEqual(['turvul', 'redtai'])
  })
})

describe('a search replaces every filter', () => {
  it('search A then search B leaves only B (places, time, status, group, taxonomy, basis)', () => {
    const manual: Filter = { order: 'Strigiformes', continents: ['EU'], from: '2019-01', basis: 'seen', statuses: ['VU'] }
    const a = search(manual, 'owls canada 2020')
    expect(a).toEqual({ group: owls.id, countries: ['CA'], from: '2020-01', to: '2020-12', basis: 'seen' })
    const b = search(a, 'hawks least concern')
    expect(b).toEqual({ group: hawks.id, statuses: ['LC'] })
  })
})

describe('the group chip and the Filters count', () => {
  const f: Filter = { group: hawks.id, countries: ['CA'], statuses: ['LC'] }
  const groupName = (id: string) => index.groups.get(id)?.name.en
  it('filterChips holds the group once, with the places and statuses; the count equals the chips by kind', () => {
    const chips = filterChips(f, ctx.regions, t, groupName)
    expect(chips.map((c) => c.kind)).toEqual(['group', 'place', 'status'])
    expect(filtersCount(f)).toBe(3)
    expect(filtersCount({ group: hawks.id })).toBe(1)
    expect(filtersCount({ order: 'X' })).toBe(0)
  })
  it('the spoken label names the group first', () => {
    expect(filtersSpoken(f, ctx.regions, t, groupName)).toBe('Bird group: Vultures, Hawks, and Allies. Places: Canada. Conservation status: Least Concern')
  })
})
