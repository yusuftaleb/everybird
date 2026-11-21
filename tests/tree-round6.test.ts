// Round 6 of the Tree (Yusuf, 2026-11-20), on synthetic data: the splits spaced evenly without the time scale
// (bySplits), no branch opening on one lone tip (levelView's default rank), the genus as a taxonomy filter (filters.ts,
// filters-validate.ts, path.ts), the representative sticker of a group with no bird on the list (groupSticker), the
// Rectangular drawing's half of the width and its counts' column (rowsTreeW, rowsLabels), and the Radial's ages where no
// branch runs (ringLabels, clearOfEnds).
import { describe, expect, it } from 'vitest'
import { applyFilter, drillTo, filterKey, filterToShow, genusOf, options, type Filter } from '@/lib/list/filters'
import { applyFilterValidity } from '@/lib/list/filters-validate'
import type { ListEntry } from '@/lib/list/model'
import { rowsLabels } from '@/lib/share/tree-image'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { clearOfEnds, drawFan, ringLabels, type FanBox } from '@/lib/tree/fan'
import { SPECIES_AT, groupSticker, levelView, rowsTreeW, type TreeRow } from '@/lib/tree/levels'
import { closeDeep, openBranch, treeBranch } from '@/lib/tree/path'
import { bySplits, cladeTree, drawTree, isLeaf, parseNewick, type Leaf, type Node } from '@/lib/tree/tree'

const sp = (code: string, sci: string, ord: string, fam: string, to: number, st = true): SpeciesRow =>
  ({ code, com: code.toUpperCase(), sci, ord, fam, famCom: `${fam} birds`, to, g: 10, gSrc: 'avonet', st, ar: 1, q: true })
const entry = (code: string): ListEntry => ({ code, date: '2024-01-01', place: { country: 'CA' } } as ListEntry)

describe('without the time scale the splits are spaced evenly (bySplits)', () => {
  // A burst: five splits within 8 million years at the top of a 52-million-year tree.
  const t = parseNewick('((((((a:1,b:1):1,c:2):2,d:4):2,e:6):2,f:8):44,g:52);')
  const root = cladeTree(t, t.tipOf.values(), (k) => t.code[k]!)!
  it("a node's age is its number of splits down to its deepest tip; the tips stay at 0", () => {
    const even = bySplits(root) as Node
    expect(even.age).toBe(6)
    expect((even.kids[0] as Node).age).toBe(5)
    expect(isLeaf(even.kids[1])).toBe(true)
    // The original keeps its ages.
    expect((root as Node).age).toBe(52)
  })
  it('spreads a burst of splits: the five near the tips take most of the width instead of a sixth of it', () => {
    const xs = (d: ReturnType<typeof drawTree>) => [...d.seen.matchAll(/M([\d.]+) /g)].map((m) => +m[1])
    // The inner splits' x (the root's, at 0, left out).
    const spread = (n: Node | Leaf) => { const v = [...new Set(xs(drawTree(n, () => true, undefined, undefined, undefined, 1000)))].sort((p, q) => p - q).slice(1); return v[v.length - 1] - v[0] }
    expect(spread(root)).toBeLessThan(200)
    expect(spread(bySplits(root))).toBeGreaterThan(600)
  })
  it('a lone leaf is unchanged (its stem is drawn from 1)', () => {
    const one = cladeTree(t, [t.tipOf.get('g')!], (k) => t.code[k]!)!
    expect(bySplits(one)).toBe(one)
  })
})

// O1 has one family (F1) with two genera; O2 has one family with one genus (Gx) of three species; O3 has two families,
// F3a with 14 species in two genera, F3b with one species.
const many = Array.from({ length: 14 }, (_, i) => sp(`m${i}`, `${i < 7 ? 'Ma' : 'Mb'} s${i}`, 'O3', 'F3a', 20 + i))
const rows: SpeciesRow[] = [
  sp('a1', 'Aa one', 'O1', 'F1', 1), sp('a2', 'Aa two', 'O1', 'F1', 2), sp('a3', 'Ab three', 'O1', 'F1', 3),
  sp('x1', 'Gx one', 'O2', 'F2', 10), sp('x2', 'Gx two', 'O2', 'F2', 11), sp('x3', 'Gx three', 'O2', 'F2', 12),
  ...many, sp('z1', 'Zz one', 'O3', 'F3b', 40),
]
const species = buildSpeciesIndex(rows)
const mNwk = `((${many.slice(0, 7).map((r) => `${r.code}:1`).join(',')}):3,(${many.slice(7).map((r) => `${r.code}:1`).join(',')}):3)`
const tree = parseNewick(`((((a1:1,a2:1):2,a3:3):5,((x1:1,x2:1):1,x3:2):6):2,(${mNwk}:4,z1:8):2);`)

describe('a branch never opens on one lone tip', () => {
  const none = new Set<string>()
  it('the first screen is still every order', () => {
    expect(levelView(tree, species, {}, none)!.tips).toBe('orders')
  })
  it('an order with one family opens past it (here, with three species, straight at the species)', () => {
    const v = levelView(tree, species, { ord: 'O1' }, none)!
    // Three species: at most SPECIES_AT, so straight at the species.
    expect(SPECIES_AT).toBe(12)
    expect(v.tips).toBe('species')
  })
  it('a family with one genus opens at its species', () => {
    const v = levelView(tree, species, { ord: 'O2', fam: 'F2' }, none)!
    expect(v.tips).toBe('species')
    expect(v.rows.filter((r) => r.kind === 'species')).toHaveLength(3)
  })
  it('a group over SPECIES_AT species opens at its children (the rank one step under it)', () => {
    const o3 = levelView(tree, species, { ord: 'O3' }, none)!
    expect(o3.tips).toBe('families')
    const f3a = levelView(tree, species, { ord: 'O3', fam: 'F3a' }, none)!
    expect(f3a.tips).toBe('genera')
    expect(levelView(tree, species, { ord: 'O1' }, none, false, 'families')!.tips).toBe('families')
  })
  it('Lifers only counts first: a family of 14 with two birds on the list opens at those species', () => {
    const v = levelView(tree, species, { ord: 'O3', fam: 'F3a' }, new Set(['m0', 'm9']), true)!
    expect(v.tips).toBe('species')
    expect(v.rows.filter((r) => r.kind === 'species').map((r) => (r as Extract<TreeRow, { kind: 'species' }>).row.code)).toEqual(['m0', 'm9'])
  })
})

describe('a sticker on every group (groupSticker)', () => {
  const g = [sp('p1', 'Pa one', 'O', 'F', 3), sp('p2', 'Pa two', 'O', 'F', 1, false), sp('p3', 'Pa three', 'O', 'F', 2)]
  it('a group with a bird on the list shows its first one with a sticker, as before', () => {
    expect(groupSticker(g, new Set(['p1']))?.code).toBe('p1')
  })
  it('a group with a bird on the list but none with a sticker shows none', () => {
    expect(groupSticker(g, new Set(['p2']))).toBeUndefined()
  })
  it('a group with no bird on the list shows its first species in taxonomic order that has a sticker', () => {
    expect(groupSticker(g, new Set())?.code).toBe('p3')
    const v = levelView(tree, species, { ord: 'O3' }, new Set(['m3']), false, 'families')!
    const f3b = v.rows.find((r) => r.kind === 'group' && r.key === 'F3b') as Extract<TreeRow, { kind: 'group' }>
    expect(f3b.on).toBe(0)
    expect(f3b.sticker?.code).toBe('z1')
  })
})

describe('the genus is a taxonomy filter', () => {
  const list = ['a1', 'a2', 'a3', 'x1', 'm0', 'm8'].map(entry)
  const f: Filter = { order: 'O1', family: 'F1', genus: 'Aa' }
  it('genusOf is the first word of the scientific name', () => {
    expect(genusOf('Aa one')).toBe('Aa')
  })
  it('filters every view to the genus, and keys after the family', () => {
    expect(applyFilter(list, f, species).map((e) => e.code)).toEqual(['a1', 'a2'])
    expect(filterKey(f)).toBe('o:O1|f:F1|e:Aa')
  })
  it("a picked family offers its genera as chips, counted under the other filters, in taxonomic order; none without a family", () => {
    expect(options(list, { order: 'O3', family: 'F3a' }, 'genus', species)).toEqual([{ value: 'Ma', label: 'Ma', count: 1 }, { value: 'Mb', label: 'Mb', count: 1 }])
    expect(options(list, { order: 'O3' }, 'genus', species)).toEqual([])
    // The genera are counted whatever genus is picked.
    expect(options(list, f, 'genus', species).map((o) => o.count)).toEqual([2, 1])
  })
  it('validity: a genus needs a family it belongs to, and on a list change one with a bird', () => {
    expect(applyFilterValidity({ order: 'O1', genus: 'Aa' }, list, species, false)).toEqual({ order: 'O1' })
    expect(applyFilterValidity({ order: 'O1', family: 'F1', genus: 'Gx' }, list, species, false)).toEqual({ order: 'O1', family: 'F1' })
    expect(applyFilterValidity(f, list, species, false)).toEqual(f)
    expect(applyFilterValidity({ order: 'O3', family: 'F3a', genus: 'Mb' }, ['m0'].map(entry), species, true)).toEqual({ order: 'O3', family: 'F3a' })
  })
  it('a search pick outside the genus drops it; another family or order drops it too; drilling to a family drops it', () => {
    expect(filterToShow(f, entry('a3'), species)).toEqual({ order: 'O1', family: 'F1' })
    expect(filterToShow(f, entry('x1'), species)).toEqual({})
    expect(drillTo(f, { order: 'O1', family: 'F1' }, list, species)).toEqual({ order: 'O1', family: 'F1' })
  })
  it("the tree's path: opening a genus sets it in the filter; one the shown index lacks stays beside it", () => {
    const all = (ord: string, fam: string, genus?: string) => rows.some((r) => r.ord === ord && r.fam === fam && (!genus || genusOf(r.sci) === genus))
    const opened = openBranch({ countries: ['CA'] }, { ord: 'O1', fam: 'F1', genus: 'Aa' }, all)
    expect(opened).toEqual({ filter: { countries: ['CA'], order: 'O1', family: 'F1', genus: 'Aa' }, deep: null })
    expect(treeBranch(opened.filter, opened.deep)).toEqual({ ord: 'O1', fam: 'F1', genus: 'Aa' })
    const noGenus = openBranch({}, { ord: 'O1', fam: 'F1', genus: 'Ab' }, (o, fa, ge) => all(o, fa) && ge !== 'Ab')
    expect(noGenus.filter).toEqual({ order: 'O1', family: 'F1' })
    expect(treeBranch(noGenus.filter, noGenus.deep)).toEqual({ ord: 'O1', fam: 'F1', genus: 'Ab' })
    // Another genus picked as a chip: the kept one no longer applies.
    expect(treeBranch({ ...noGenus.filter, genus: 'Aa' }, noGenus.deep)).toEqual({ ord: 'O1', fam: 'F1', genus: 'Aa' })
    expect(closeDeep(noGenus.deep, 1)).toBeNull()
  })
})

describe('Rectangular: half the width, the counts just after the longest name', () => {
  it('rowsTreeW: half of the view, between 112 and 640, the rows keeping 200px', () => {
    expect(rowsTreeW(1000)).toBe(500)
    expect(rowsTreeW(1600)).toBe(640)
    expect(rowsTreeW(320)).toBe(120)
    expect(rowsTreeW(200)).toBe(112)
  })
  it("rowsLabels: the counts' column ends after the longest name and count, not at the far edge", () => {
    const spans = [{ name: 4, count: 2, on: true }, { name: 6, count: 2.5, on: true }]
    const { px, box, counts, col } = rowsLabels(spans, 44, 2000)
    expect(counts).toEqual([true, true])
    const g = px * 6 / 13
    expect(col).toBeCloseTo(box + 2 * g + 6 * px + g + 2.5 * px)
    expect(col).toBeLessThan(2000)
    // A narrow area caps the column at its edge, dropping a count that would touch its name.
    const tight = rowsLabels([{ name: 4, count: 2, on: true }, { name: 9, count: 3, on: true }], 44, 300)
    expect(tight.col).toBeLessThanOrEqual(300)
  })
})

describe("the Radial's ages where no branch runs", () => {
  const box: FanBox = { cx: 200, cy: 200, R: 150, shape: 'circle' }
  it('on the radius straight up, between the last tip and the first; the fan keeps them under its centre', () => {
    expect(ringLabels(box, 100)).toEqual([[200, 100]])
    expect(ringLabels({ cx: 200, cy: 200, R: 150 }, 100)).toEqual([[300, 200], [100, 200]])
  })
  it('no branch end lies on that radius away from the centre; a patch over one is refused', () => {
    const t = parseNewick('(((a:1,b:1):1,c:2):2,(d:3,(e:1,f:1):2):1);')
    const root = cladeTree(t, t.tipOf.values(), (k) => t.code[k]!)!
    const d = drawFan(root, () => true, undefined, () => false, box)
    for (const r of [40, 80, 120]) expect(clearOfEnds(d.ends, box.cx, box.cy - r, 24, 16)).toBe(true)
    // The root's join sits at the centre.
    expect(clearOfEnds(d.ends, box.cx, box.cy, 24, 16)).toBe(false)
  })
})
