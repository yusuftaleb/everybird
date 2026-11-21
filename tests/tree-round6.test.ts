// Round 6 of the Tree (Yusuf, 2026-11-20), on synthetic data: the splits spaced evenly without the time scale
// (bySplits), no branch opening on one lone tip (levelView's default rank), the genus as a taxonomy filter (filters.ts,
// filters-validate.ts, path.ts), the representative sticker of a group with no bird on the list (groupSticker), the
// Rectangular drawing's half of the width and its counts' column (rowsTreeW, rowsLabels), and the Radial's ages where no
// branch runs (ringLabels, clearOfEnds; on screen inside its opening, inOpening).
import { describe, expect, it, vi } from 'vitest'
import { applyFilter, drillTo, filterKey, filterToShow, genusOf, options, type Filter } from '@/lib/list/filters'
import { applyFilterValidity } from '@/lib/list/filters-validate'
import type { ListEntry } from '@/lib/list/model'
import { rowsLabels } from '@/lib/share/tree-image'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { clearOfEnds, drawFan, inOpening, ringLabels, type FanBox } from '@/lib/tree/fan'
import { DRAW_CAP, MAX_TIPS, SMALL_STEP, SPECIES_AT, downOptions, groupSticker, levelView, rankCount, rowsTreeW, type TreeRow } from '@/lib/tree/levels'
import { setTreeDown, treeDown, TREE_DOWN_KEY } from '@/lib/tree-mine'
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
  it('a step of SMALL_STEP groups or fewer draws the next rank down, again while that holds (here down to the species)', () => {
    // O3: two families, then three genera (Ma, Mb, Zz), then its 15 species.
    expect(SMALL_STEP).toBe(3)
    expect(levelView(tree, species, { ord: 'O3' }, none)!.tips).toBe('species')
    // F3a: two genera, then its 14 species.
    expect(levelView(tree, species, { ord: 'O3', fam: 'F3a' }, none)!.tips).toBe('species')
    expect(levelView(tree, species, { ord: 'O1' }, none, false, 'families')!.tips).toBe('families')
  })
  it('Lifers only counts first: a family of 14 with two birds on the list opens at those species', () => {
    const v = levelView(tree, species, { ord: 'O3', fam: 'F3a' }, new Set(['m0', 'm9']), true)!
    expect(v.tips).toBe('species')
    expect(v.rows.filter((r) => r.kind === 'species').map((r) => (r as Extract<TreeRow, { kind: 'species' }>).row.code)).toEqual(['m0', 'm9'])
  })
})

describe('a smarter step: three groups or fewer is not worth a step (SMALL_STEP)', () => {
  const none = new Set<string>()
  // `n` genera of `per` species each, spread over `fams` families of one order (Strigiformes-like: Tytonidae and
  // Strigidae), on a comb of genera.
  const order = (ord: string, fams: number, n: number, per: number) => {
    const rs: SpeciesRow[] = []
    for (let g = 0; g < n; g++) for (let k = 0; k < per; k++) rs.push(sp(`${ord}${g}x${k}`, `G${ord}${g} s${k}`, ord, `F${ord}${g % fams}`, rs.length))
    return rs
  }
  const nwk = (rs: SpeciesRow[]) => {
    const byFam = new Map<string, Map<string, SpeciesRow[]>>()
    for (const r of rs) {
      const gs = byFam.get(r.fam) ?? byFam.set(r.fam, new Map()).get(r.fam)!
      const g = genusOf(r.sci)
      gs.set(g, [...gs.get(g) ?? [], r])
    }
    return `(${[...byFam.values()].map((gs) => `(${[...gs.values()].map((ss) => `(${ss.map((r) => `${r.code}:1`).join(',')}):2`).join(',')}):3`).join(',')}):1`
  }
  const owls = order('Os', 2, 8, 3) // two families, eight genera, 24 species
  const four = order('Fo', 4, 8, 4) // four families, two genera of four species each
  const wide = order('Wi', 2, MAX_TIPS + 1, 1) // two families whose genera are over MAX_TIPS
  const all = [...owls, ...four, ...wide]
  const idx = buildSpeciesIndex(all)
  const t = parseNewick(`(${nwk(owls)},${nwk(four)},${nwk(wide)});`)
  it('an order of two families opens at its genera (Owls: Owls and Barn Owls were two rows)', () => {
    const v = levelView(t, idx, { ord: 'Os' }, none)!
    expect(v.tips).toBe('genera')
    expect(v.rows.filter((r) => r.kind === 'group')).toHaveLength(8)
  })
  it('an order of four families still opens at its families', () => {
    expect(levelView(t, idx, { ord: 'Fo' }, none)!.tips).toBe('families')
  })
  it('a family of four genera opens at its genera; one of two genera with more than SPECIES_AT species at its species', () => {
    const fam = order('Fm', 1, 4, 4)
    const two = order('Tw', 1, 2, 8)
    const t2 = parseNewick(`(${nwk(fam)},${nwk(two)});`)
    const i2 = buildSpeciesIndex([...fam, ...two])
    expect(levelView(t2, i2, { ord: 'Fm', fam: 'FFm0' }, none)!.tips).toBe('genera')
    expect(levelView(t2, i2, { ord: 'Tw', fam: 'FTw0' }, none)!.tips).toBe('species')
  })
  it('the next rank must stay within MAX_TIPS: two families over 301 genera stay at the families', () => {
    const v = levelView(t, idx, { ord: 'Wi' }, none)!
    expect(v.tips).toBe('families')
    expect(v.rows.filter((r) => r.kind === 'group')).toHaveLength(2)
  })
  it('Lifers only counts first: birds in two of four families open at their four genera; two birds of one genus at those species', () => {
    const on = new Set([four[0].code, four[1].code])
    const v = levelView(t, idx, { ord: 'Fo' }, on, true)!
    expect(v.tips).toBe('species')
    expect(levelView(t, idx, { ord: 'Fo' }, new Set(four.filter((r) => r.fam === 'FFo0' || r.fam === 'FFo1').map((r) => r.code)), true)!.tips).toBe('genera')
  })
  it('the first screen stays on every order, whatever their number', () => {
    expect(levelView(t, idx, {}, none)!.tips).toBe('orders')
  })
})

describe("Down to: the rank drawn at the least, the Display panel's (round 6)", () => {
  const none = new Set<string>()
  // Two orders: Big, five families of 21 genera of 20 species (2,100 species: over DRAW_CAP; 105 genera), and Wee, one
  // family of four genera of three species.
  const rs: SpeciesRow[] = []
  for (let f = 0; f < 5; f++) for (let g = 0; g < 21; g++) for (let k = 0; k < 20; k++) rs.push(sp(`b${f}x${g}x${k}`, `Gb${f}x${g} s${k}`, 'Big', `Fb${f}`, rs.length))
  for (let g = 0; g < 4; g++) for (let k = 0; k < 3; k++) rs.push(sp(`w${g}x${k}`, `Gw${g} s${k}`, 'Wee', 'Fw', rs.length))
  const nwkOf = (ord: string) => {
    const fams = [...new Set(rs.filter((r) => r.ord === ord).map((r) => r.fam))]
    return `(${fams.map((f) => `(${[...new Set(rs.filter((r) => r.fam === f).map((r) => genusOf(r.sci)))].map((g) => `(${rs.filter((r) => genusOf(r.sci) === g).map((r) => `${r.code}:1`).join(',')}):2`).join(',')}):3`).join(',')}):1`
  }
  const idx = buildSpeciesIndex(rs)
  const t = parseNewick(`(${nwkOf('Big')},${nwkOf('Wee')});`)
  expect(DRAW_CAP).toBe(2000)
  it('offers the ranks under the open branch down to the species: all four at All birds, three in an order, two in a family, none in a genus', () => {
    expect(downOptions(levelView(t, idx, {}, none)!, false).map((o) => o.rank)).toEqual(['orders', 'families', 'genera', 'species'])
    expect(downOptions(levelView(t, idx, { ord: 'Big' }, none)!, false).map((o) => o.rank)).toEqual(['families', 'genera', 'species'])
    expect(downOptions(levelView(t, idx, { ord: 'Big', fam: 'Fb0' }, none)!, false).map((o) => o.rank)).toEqual(['genera', 'species'])
    expect(downOptions(levelView(t, idx, { ord: 'Big', fam: 'Fb0', genus: 'Gb0x0' }, none)!, false)).toEqual([])
    // A branch that opens past a rank (Wee's one family) offers only what it can draw: here only its species, so no row.
    expect(levelView(t, idx, { ord: 'Wee' }, none)!.tips).toBe('species')
    expect(downOptions(levelView(t, idx, { ord: 'Wee' }, none)!, false)).toEqual([])
  })
  it('draws the deeper of the choice and the one step under the open branch; opening a branch never changes the choice', () => {
    expect(levelView(t, idx, {}, none)!.tips).toBe('orders')
    expect(levelView(t, idx, {}, none, false, undefined, 'families')!.tips).toBe('families')
    expect(levelView(t, idx, {}, none, false, undefined, 'genera')!.tips).toBe('genera')
    // Families chosen: an opened family still shows its genera (its own step), and back up, families again.
    expect(levelView(t, idx, { ord: 'Big', fam: 'Fb1' }, none, false, undefined, 'families')!.tips).toBe('genera')
    expect(levelView(t, idx, {}, none, false, undefined, 'families')!.tips).toBe('families')
    // The skip of a small step stays: Wee opens at its species whatever is chosen.
    expect(levelView(t, idx, { ord: 'Wee' }, none, false, undefined, 'families')!.tips).toBe('species')
  })
  it('a rank over DRAW_CAP tips is offered off, saying what would help; a choice of it draws the deepest rank within the cap', () => {
    const v = levelView(t, idx, {}, none, false, undefined, 'species')!
    expect(v.downTo.find((d) => d.rank === 'species')!.n).toBe(2112)
    expect(v.tips).toBe('genera')
    expect(downOptions(v, false)).toEqual([{ rank: 'orders' }, { rank: 'families' }, { rank: 'genera' }, { rank: 'species', off: 'tooMany' }])
    // Lifers only on and still too many: only opening a branch helps.
    const most = new Set(rs.filter((_, i) => i % 50).map((r) => r.code))
    expect(downOptions(levelView(t, idx, {}, most, true)!, true).at(-1)).toEqual({ rank: 'species', off: 'tooManyMine' })
    // Lifers only counts first: a few birds draw every species.
    const few = new Set(rs.slice(0, 30).map((r) => r.code))
    const mine = levelView(t, idx, {}, few, true, undefined, 'species')!
    expect(mine.tips).toBe('species')
    expect(downOptions(mine, true).every((o) => !o.off)).toBe(true)
    // Inside one order (2,100 species) still off; inside a family (420) on.
    expect(downOptions(levelView(t, idx, { ord: 'Big' }, none)!, false).at(-1)).toEqual({ rank: 'species', off: 'tooMany' })
    expect(levelView(t, idx, { ord: 'Big', fam: 'Fb0' }, none, false, undefined, 'species')!.tips).toBe('species')
  })
  it('the choice is kept on the device; an unknown value reads as none', () => {
    setTreeDown('genera')
    expect(treeDown()).toBe('genera')
    setTreeDown(null)
    expect(treeDown()).toBeNull()
    setTreeDown('tips' as never)
    expect(treeDown()).toBeNull()
    setTreeDown(null)
    expect(TREE_DOWN_KEY).toBe('everybird:tree-down')
  })

  it('keeps the Level for the tab only (sessionStorage), not the device: a new visit starts at the default', () => {
    const area = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } }
    const local = area(), session = area()
    vi.stubGlobal('localStorage', local)
    vi.stubGlobal('sessionStorage', session)
    setTreeDown('genera')
    expect(session.m.get(TREE_DOWN_KEY)).toBe('genera')
    expect(local.m.has(TREE_DOWN_KEY)).toBe(false)
    setTreeDown(null)
    vi.unstubAllGlobals()
  })
})

describe('the rank line above the tree (rankCount)', () => {
  const none = new Set<string>()
  it('names the rank drawn and how many groups its rows draw', () => {
    expect(rankCount(levelView(tree, species, {}, none)!, false)).toEqual({ rank: 'orders', n: 3 })
    expect(rankCount(levelView(tree, species, { ord: 'O3' }, none)!, false)).toEqual({ rank: 'species', n: 15 })
  })
  it('a marked row counts the groups inside it', () => {
    const t2 = parseNewick('(((a1:1,b1:1):1,a2:2):1,(c1:1,d1:1):2);')
    const i2 = buildSpeciesIndex([sp('a1', 'Aa one', 'O', 'F', 1), sp('a2', 'Aa two', 'O', 'F', 2), sp('b1', 'Bb one', 'O', 'F', 3), sp('c1', 'Cc one', 'O', 'F', 4), sp('d1', 'Dd one', 'O', 'F', 5)])
    const v = levelView(t2, i2, { ord: 'O', fam: 'F' }, none, false, 'genera')!
    expect(v.rows.filter((r) => r.kind === 'group')).toHaveLength(3) // Aa with Bb, Cc, Dd
    expect(rankCount(v, false)).toEqual({ rank: 'genera', n: 4 })
  })
  it('with Lifers only leaving some out, how many of the taxonomy\'s groups in the open branch', () => {
    const on = new Set(['a1', 'x1'])
    expect(rankCount(levelView(tree, species, {}, on, true)!, true)).toEqual({ rank: 'orders', n: 2, total: 3 })
    // Every order has a bird: no "of".
    expect(rankCount(levelView(tree, species, {}, new Set(['a1', 'x1', 'z1']), true)!, true)).toEqual({ rank: 'orders', n: 3 })
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

describe('Rectangular: half the width or more, the counts at the right edge', () => {
  it('rowsTreeW: half of the view, between 112 and 640, the rows keeping 200px', () => {
    expect(rowsTreeW(1000)).toBe(500)
    expect(rowsTreeW(1600)).toBe(640)
    expect(rowsTreeW(320)).toBe(120)
    expect(rowsTreeW(200)).toBe(112)
  })
  it("rowsLabels (the share image): the counts in their own column at the card's right edge, never dropped (round 6)", () => {
    const spans = [{ name: 4, count: 2, on: true }, { name: 6, count: 2.5, on: true }]
    const { counts, col, treeW } = rowsLabels(spans, 44, 2000)
    expect(counts).toEqual([true, true])
    // Room to spare: the drawing takes it, up to ROWS_TREE_MAX of the width, the counts at the edge (item 9).
    expect(treeW).toBe(1400)
    expect(col).toBe(600)
    // A narrow area: the drawing gives way first (down to a fifth), then the names shrink; every count stays.
    const tight = rowsLabels([{ name: 4, count: 2, on: true }, { name: 9, count: 3, on: true }], 44, 300)
    expect(tight.counts).toEqual([true, true])
    expect(tight.treeW).toBe(60)
    expect(tight.col).toBe(240)
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
  it("on screen the Radial opens at the top (box.open): every branch end stays outside the opening, where its ages go", () => {
    const t = parseNewick('(((a:1,b:1):1,c:2):2,(d:3,(e:1,f:1):2):1);')
    const root = cladeTree(t, t.tipOf.values(), (k) => t.code[k]!)!
    const open = 0.6
    const d = drawFan(root, () => true, undefined, () => false, { ...box, open })
    const half = ((2 * Math.PI - open) / 6 + open) / 2
    for (const [x, y] of d.ends) if (Math.hypot(x - box.cx, y - box.cy) > 1) expect(Math.abs(Math.atan2(x - box.cx, box.cy - y))).toBeGreaterThanOrEqual(half - 1e-6)
    expect(inOpening({ ...box, open }, 6, 100, 24, 16)).toBe(true)
  })
})
