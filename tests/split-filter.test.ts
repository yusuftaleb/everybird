// A split genus (item 6, round 6): a genus the tree splits is one marked row ("Na ◇ with Ab"); opening it sets the
// taxonomy filter to every genus in its branch (Filter.with), so the other views show the same birds and the tree colours
// every seen tip, and the counts match the row's. Picking the plain chip still filters to that genus alone. Synthetic.
import { describe, expect, it } from 'vitest'
import { applyFilter, filterKey, filterToShow, options, type Filter } from '@/lib/list/filters'
import { applyFilterValidity } from '@/lib/list/filters-validate'
import type { ListEntry } from '@/lib/list/model'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { levelView, type TreeRow } from '@/lib/tree/levels'
import { openBranch, treeBranch } from '@/lib/tree/path'
import { parseNewick } from '@/lib/tree/tree'

const sp = (code: string, sci: string, fam: string, to: number): SpeciesRow =>
  ({ code, com: code.toUpperCase(), sci, ord: 'Ans', fam, famCom: `${fam} birds`, to, g: 10, gSrc: 'avonet', st: true, ar: 1, q: true })
// Family Duc: genus Na (n1, n2) is split by genus Ab (a1..a3), which sits inside Na's smallest branch; Ma stands apart.
// Fourteen species, so the family opens at its genera (over SPECIES_AT).
const rows = [
  sp('n1', 'Na one', 'Duc', 1), sp('a1', 'Ab one', 'Duc', 2), sp('a2', 'Ab two', 'Duc', 3), sp('a3', 'Ab three', 'Duc', 4), sp('n2', 'Na two', 'Duc', 5),
  ...Array.from({ length: 9 }, (_, i) => sp(`m${i}`, `Ma m${i}`, 'Duc', 10 + i)),
]
const species = buildSpeciesIndex(rows)
const ms = rows.filter((r) => r.code.startsWith('m')).map((r) => `${r.code}:1`).join(',')
const tree = parseNewick(`(((n1:1,(a1:1,a2:1,a3:1):1):1,n2:3):2,(${ms}):5);`)
const entry = (code: string): ListEntry => ({ code, date: '2024-01-01', place: { country: 'CA' } } as ListEntry)
// On the list: one Na and two Ab ducks.
const list = ['n1', 'a1', 'a2', 'm0'].map(entry)
const onList = new Set(list.map((e) => e.code))
const holds = (ord: string, fam: string, genus?: string) => rows.some((r) => r.ord === ord && r.fam === fam && (!genus || r.sci.startsWith(`${genus} `)))
const shown = (f: Filter) => applyFilter(list, f, species).map((e) => e.code)

describe('opening a split genus filters to every genus in its branch', () => {
  const fam = levelView(tree, species, { ord: 'Ans', fam: 'Duc' }, new Set())!
  const na = fam.rows.find((r): r is Extract<TreeRow, { kind: 'group' }> => r.kind === 'group' && r.key === 'Na')!
  it('the family\'s genera: Na is one marked row holding Ab, counting the whole branch', () => {
    expect(fam.tips).toBe('genera')
    expect(na.holds).toEqual(['Ab'])
    expect(levelView(tree, species, { ord: 'Ans', fam: 'Duc' }, onList)!.rows.find((r) => r.kind === 'group' && r.key === 'Na')).toMatchObject({ on: 3, total: 5 })
  })
  it('the filter keeps Na and Ab; the other views show the same three birds; the tree colours every seen tip', () => {
    const next = openBranch({}, { ord: 'Ans', fam: 'Duc', genus: 'Na', with: na.holds }, holds)
    expect(next.filter).toEqual({ order: 'Ans', family: 'Duc', genus: 'Na', with: ['Ab'] })
    expect(shown(next.filter)).toEqual(['n1', 'a1', 'a2'])
    expect(filterKey(next.filter)).toBe('o:Ans|f:Duc|e:Na|w:Ab')
    // The tree opens the same branch from the filter, and with the filtered list every tip on the list is on.
    const branch = treeBranch(next.filter, next.deep)
    const v = levelView(tree, species, branch, new Set(shown(next.filter)))!
    const on = v.rows.filter((r): r is Extract<TreeRow, { kind: 'species' }> => r.kind === 'species' && r.on).map((r) => r.row.code)
    expect(on.sort()).toEqual(['a1', 'a2', 'n1'])
  })
  it('the genus chips under it still count each genus; the plain Ab chip filters to Ab alone', () => {
    const f: Filter = { order: 'Ans', family: 'Duc', genus: 'Na', with: ['Ab'] }
    expect(options(list, f, 'genus', species).map((o) => `${o.value} ${o.count}`)).toEqual(['Na 1', 'Ab 2', 'Ma 1'])
    const ab = openBranch(f, { ord: 'Ans', fam: 'Duc', genus: 'Ab' }, holds).filter
    expect(ab).toEqual({ order: 'Ans', family: 'Duc', genus: 'Ab' })
    expect(shown(ab)).toEqual(['a1', 'a2'])
  })
  it('a search pick outside the branch drops the genus and its `with`; one inside keeps both', () => {
    const f: Filter = { order: 'Ans', family: 'Duc', genus: 'Na', with: ['Ab'] }
    expect(filterToShow(f, entry('a2'), species)).toEqual(f)
    expect(filterToShow(f, entry('m0'), species)).toEqual({ order: 'Ans', family: 'Duc' })
  })
  it('validity keeps only known names at the deepest level, and drops `with` with that level', () => {
    expect(applyFilterValidity({ order: 'Ans', family: 'Duc', genus: 'Na', with: ['Ab', 'Zz', 'Na'] }, list, species, false)).toEqual({ order: 'Ans', family: 'Duc', genus: 'Na', with: ['Ab'] })
    expect(applyFilterValidity({ order: 'Ans', family: 'Duc', with: ['Ab'] } as Filter, list, species, false)).toEqual({ order: 'Ans', family: 'Duc' })
    // After a list change, the pick stays while a bird of any of its genera is on the list.
    expect(applyFilterValidity({ order: 'Ans', family: 'Duc', genus: 'Na', with: ['Ab'] }, ['a1'].map(entry), species, true)).toEqual({ order: 'Ans', family: 'Duc', genus: 'Na', with: ['Ab'] })
  })
})
