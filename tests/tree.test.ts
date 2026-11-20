// The bird tree: parsing, collapsing to families / genera / species, the levels' rows and counts, the fact line, the
// axis, the build script's relabelling, and the committed tree.v1.json against species.v1.json. Synthetic trees only.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { attach, matcher, nexusTree, relabel, taxOnlyBits, type Addition } from '../scripts/build-data/build-tree'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { HEAD_H, ROW_H, foldSplit, isClade, levelView, taxonCover, type LevelView, type TreeRow } from '@/lib/tree/levels'
import { ageTicks, bitAt, cladeTree, drawTree, formatAge, isLeaf, leavesOf, oldestLineage, packBits, parseNewick, type TreeFile } from '@/lib/tree/tree'

const sp = (code: string, sci: string, ord: string, fam: string, to: number): SpeciesRow =>
  ({ code, com: code.toUpperCase(), sci, ord, fam, famCom: `${fam} birds`, to, g: 10, gSrc: 'avonet', st: true, ar: 1, q: true })
// Fa: genus Aa is not one branch (a1 sits with Ab's a3: one marked row, with Ab); x1 is in Fa but not in the tree.
const species = buildSpeciesIndex([
  sp('a1', 'Aa one', 'O1', 'Fa', 1), sp('a2', 'Aa two', 'O1', 'Fa', 2), sp('a3', 'Ab three', 'O1', 'Fa', 3), sp('x1', 'Aa four', 'O1', 'Fa', 4),
  sp('b1', 'Bb one', 'O2', 'Fb', 5), sp('b2', 'Bb two', 'O2', 'Fb', 6),
])
const NWK = '(((a1:1,a3:1):2,a2:3):7,(b1:4,b2:4):6);'
const tree = parseNewick(NWK)
const tip = (c: string) => tree.tipOf.get(c)!

describe('parseNewick', () => {
  it('reads tips, branch lengths and ages (0 at the tips)', () => {
    expect([...tree.tipOf.keys()].sort()).toEqual(['a1', 'a2', 'a3', 'b1', 'b2'])
    expect(tree.age[0]).toBe(10)
    expect(tree.len[tip('a2')]).toBe(3)
    expect(tree.age[tip('a1')]).toBe(0)
    expect(tree.age[tree.parent[tip('a1')]]).toBe(1)
  })
  it('ignores internal labels and keeps exponent lengths', () => {
    const t = parseNewick('((a:1e-1,b:0.1)n1:0.9,c:1)root;')
    expect([...t.tipOf.keys()]).toEqual(['a', 'b', 'c'])
    expect(t.age[0]).toBeCloseTo(1)
  })
})

describe('placed without genetic data', () => {
  it('packs one bit per tip and reads it back', () => {
    const bits = Array.from({ length: 20 }, (_, i) => i % 7 === 0 || i === 19)
    const packed = packBits(bits)
    expect(packed).toHaveLength(4)
    expect(bits.map((_, i) => bitAt(packed, i))).toEqual(bits)
    expect(bitAt(packed, 400)).toBe(false) // past the end
  })
  it('parseNewick marks the tips in reading order; a file without the field marks none', () => {
    const t = parseNewick(NWK, taxOnlyBits(NWK, (c) => c === 'a3' || c === 'b2'))
    expect([...t.tipOf].filter(([, k]) => t.taxOnly[k]).map(([c]) => c)).toEqual(['a3', 'b2'])
    expect(tree.taxOnly.every((b) => b === 0)).toBe(true)
  })
  it('drawTree dots a leaf\'s own branch only, keeping the elbow solid', () => {
    const root = cladeTree(tree, tree.tipOf.values(), (k) => tree.code[k]!)!
    const d = drawTree(root, (l) => tree.code[l.tips[0]] === 'b2', undefined, undefined, (l) => tree.code[l.tips[0]] === 'b2')
    expect(d.seen).toContain('M600 4V4.5')
    expect(d.seen).not.toContain('M600 4V4.5H')
    expect(d.seenDot).toBe('M600 4.5H1000')
    expect(d.unseenDot).toBe('')
  })
})

describe('cladeTree', () => {
  const famOf = (k: number) => species.byCode.get(tree.code[k]!)!.fam
  it('ends each branch at the largest clade of one key', () => {
    const root = cladeTree(tree, tree.tipOf.values(), famOf)!
    const leaves = leavesOf(root)
    expect(leaves.map((l) => l.key)).toEqual(['Fa', 'Fb'])
    expect(leaves[0].tips.map((k) => tree.code[k])).toEqual(['a1', 'a3', 'a2'])
    expect(leaves[0].age).toBe(3) // the family's crown
    expect(root.age).toBe(10)
  })
  it('draws a key that is not one clade as each of its parts', () => {
    const fa = ['a1', 'a2', 'a3'].map(tip)
    const leaves = leavesOf(cladeTree(tree, fa, (k) => tree.code[k]!.startsWith('a3') ? 'Ab' : 'Aa')!)
    expect(leaves.map((l) => l.key)).toEqual(['Aa', 'Ab', 'Aa'])
  })
  it('keeps only the given tips, merging the nodes they leave with one child', () => {
    const root = cladeTree(tree, ['a1', 'a2'].map(tip), (k) => tree.code[k]!)!
    expect(isLeaf(root)).toBe(false)
    expect(root.age).toBe(3)
    expect(leavesOf(root).map((l) => tree.code[l.tips[0]])).toEqual(['a1', 'a2'])
    expect(cladeTree(tree, [], () => 'x')).toBeUndefined()
  })
  it('isClade: the tips under their common ancestor and no others', () => {
    expect(isClade(tree, ['a1', 'a3', 'a2'].map(tip))).toBe(true)
    expect(isClade(tree, ['a1', 'a2'].map(tip))).toBe(false)
    expect(isClade(tree, [tip('b1')])).toBe(true)
  })
})

describe('drawTree', () => {
  it('one elbow per branch, Ink where a leaf below is on the list', () => {
    const root = cladeTree(tree, tree.tipOf.values(), (k) => tree.code[k]!)!
    const d = drawTree(root, (l) => tree.code[l.tips[0]] === 'b2')
    expect(d.rootAge).toBe(10)
    expect(d.leaves).toHaveLength(5)
    // b2 is the fifth leaf (y 4.5); its parent splits 4 Ma ago (x 600), the root at x 0.
    expect(d.seen).toContain('M600 4V4.5H1000')
    expect(d.seen).toContain('M0 ')
    expect(d.unseen).toContain('M600 4V3.5H1000') // b1
    expect((d.seen + d.unseen).match(/M/g)).toHaveLength(8) // 9 nodes, the root has no branch
  })
})

describe('levelView', () => {
  const onList = new Set(['a1', 'b2', 'x1'])
  it('families with their orders, counted from the taxonomy (a bird the tree lacks included)', () => {
    const v = levelView(tree, species, {}, onList)!
    expect(v.rows.map((r) => r.kind === 'order' ? `#${r.ord}` : r.kind === 'group' ? `${r.key} ${r.on}/${r.total}` : '')).toEqual(['#O1', 'Fa 2/4', '#O2', 'Fb 1/2'])
    expect(v.height).toBe(2 * HEAD_H + 2 * ROW_H)
    expect(v.split).toBe(false)
  })
  it('a family opens to its genera; a split genus is one row with the genus inside it, counting the whole branch', () => {
    const v = levelView(tree, species, { fam: 'Fa' }, onList)!
    expect(v.rows.map((r) => r.kind === 'group' ? `${r.key} ${r.on}/${r.total} ${r.with?.map((w) => `${w.row.sci} ${w.on}/${w.total}`).join() ?? ''}` : '')).toEqual(['Aa 2/4 Ab three 0/1'])
    expect(v.split).toBe(false)
  })
  it('it opens to the real branch, every species where the tree puts it, and says which genus sits inside', () => {
    const v = levelView(tree, species, { fam: 'Fa', genus: 'Aa' }, onList)!
    expect(v.rows.map((r) => r.kind === 'species' ? `${r.row.code} ${r.on}` : '')).toEqual(['a1 true', 'a3 false', 'a2 false'])
    expect(v.split).toBe(false)
    expect(v.inside?.map((r) => r.sci)).toEqual(['Ab three'])
    // The genus inside opens on its own species.
    const ab = levelView(tree, species, { fam: 'Fa', genus: 'Ab' }, onList)!
    expect(ab.level).toEqual({ fam: 'Fa', genus: 'Ab' })
    expect(ab.rows.map((r) => r.kind === 'species' && r.row.code)).toEqual(['a3'])
    expect(ab.inside).toBeUndefined()
  })
  it('one lineage alone is drawn as its stem, from the split above it', () => {
    const fb = levelView(tree, species, { fam: 'Fb' }, onList)!
    expect(fb.drawing.rootAge).toBe(10)
    expect(fb.drawing.unseen + fb.drawing.seen).toBe(`M0 ${ROW_H / 2}H1000`)
  })
  it('changing the list changes the counts and the marked branches', () => {
    const a = levelView(tree, species, {}, new Set(['a1']))!
    const b = levelView(tree, species, {}, new Set(['b1']))!
    expect(a.drawing.seen).not.toBe(b.drawing.seen)
    expect(a.rows.filter((r) => r.kind === 'group').map((r) => r.kind === 'group' && r.on)).toEqual([1, 0])
    expect(b.rows.filter((r) => r.kind === 'group').map((r) => r.kind === 'group' && r.on)).toEqual([0, 1])
  })
})

describe('Only my birds', () => {
  const shown = (v: LevelView) => v.rows.map((r) => (r.kind === 'order' ? `o:${r.ord}` : r.kind === 'group' ? `${r.key} ${r.on}${r.with ? ` with [${r.with.map((w) => w.key)}]` : ''}` : r.row.code))
  it('keeps the rows with a bird on the list and draws the tree on them alone, its ages kept', () => {
    const v = levelView(tree, species, {}, new Set(['a1']), true)!
    expect(shown(v)).toEqual(['o:O1', 'Fa 1'])
    expect(v.height).toBe(HEAD_H + ROW_H)
    expect(v.drawing.leaves).toHaveLength(1)
    expect(v.drawing.rootAge).toBe(10) // Fa's stem, from the root of the whole tree
    expect(shown(levelView(tree, species, {}, new Set(['a1']))!)).toEqual(['o:O1', 'Fa 1', 'o:O2', 'Fb 0'])
  })
  it('a marked row stays when any species of its branch is on the list, its groups inside cut to those with a bird', () => {
    expect(shown(levelView(tree, species, { fam: 'Fa' }, new Set(['a2']))!)).toEqual(['Aa 1 with [Ab]'])
    expect(shown(levelView(tree, species, { fam: 'Fa' }, new Set(['a2']), true)!)).toEqual(['Aa 1 with []'])
    expect(shown(levelView(tree, species, { fam: 'Fa' }, new Set(['a3']), true)!)).toEqual(['Aa 1 with [Ab]'])
    expect(shown(levelView(tree, species, { fam: 'Fa', genus: 'Aa' }, new Set(['a2']), true)!)).toEqual(['a2'])
  })
  it('a level with no bird on the list: no rows, the level kept', () => {
    const v = levelView(tree, species, { fam: 'Fb' }, new Set(['a1']), true)!
    expect(v.rows).toEqual([])
    expect(v.level).toEqual({ fam: 'Fb', genus: undefined })
  })
})

describe('taxonCover', () => {
  it("counts the orders, families and genera the codes cover against the taxonomy's", () => {
    expect(taxonCover(species.rows, new Set(['a1', 'a3']))).toEqual({ orders: [1, 2], families: [1, 2], genera: [2, 3] })
    expect(taxonCover(species.rows, new Set())).toEqual({ orders: [0, 2], families: [0, 2], genera: [0, 3] })
    expect(taxonCover(species.rows, new Set(species.rows.map((r) => r.code)))).toEqual({ orders: [2, 2], families: [2, 2], genera: [3, 3] })
  })
})

describe('a group the tree splits', () => {
  // Keys are a tip's first letter.
  const folds = (nwk: string) => { const t = parseNewick(nwk); return foldSplit(t, t.tipOf.values(), (k) => t.code[k]![0]) }
  it('is one marked row at the smallest branch holding it, with every group inside', () => {
    expect(folds('((((k1,k2),o1),(k3,k4)),z1);')).toEqual({ others: new Map([['k', ['o']]]), into: new Map([['o', 'k']]) })
    expect(folds('(((((k1,o1),p1),q1),k2),(k3,k4));').others).toEqual(new Map([['k', ['o', 'p', 'q']]]))
  })
  it('a group partly inside a marked branch holds it instead: the outer branch is the row', () => {
    // k's branch holds o1, o's holds every k: o is the row, k inside it.
    expect(folds('((((k1,k2),o1),k3),o2);')).toEqual({ others: new Map([['o', ['k']]]), into: new Map([['k', 'o']]) })
    // Both groups' smallest branch is the root: one row.
    expect(folds('((k1,o1),(o2,k2));')).toEqual({ others: new Map([['k', ['o']]]), into: new Map([['o', 'k']]) })
  })
  it('a marked branch inside another passes its groups on to the outer one', () => {
    const f = folds('((((((m1,n1),m2),k1),k2),k3),k4);')
    expect(f.others.get('k')?.sort()).toEqual(['m', 'n'])
    expect(f.others.has('m')).toBe(false)
  })
  it('opened, a marked genus shows its whole branch; a genus inside it opens on its own species', () => {
    const sp2 = buildSpeciesIndex([sp('c1', 'Ca one', 'O1', 'Fc', 1), sp('c2', 'Cb two', 'O1', 'Fc', 2), sp('c3', 'Ca three', 'O1', 'Fc', 3), sp('c4', 'Cb four', 'O1', 'Fc', 4)])
    const t = parseNewick('((c1:1,c2:1):1,(c3:1,c4:1):1);')
    const v = levelView(t, sp2, { fam: 'Fc' }, new Set(['c3']))!
    expect(v.rows.map((r) => r.kind === 'group' ? `${r.key} ${r.on}/${r.total} ${r.with?.map((w) => `${w.key} ${w.on}/${w.total}`)}` : '')).toEqual(['Ca 1/4 Cb 0/2'])
    const ca = levelView(t, sp2, { fam: 'Fc', genus: 'Ca' }, new Set())!
    expect(ca.rows.map((r) => r.kind === 'species' && r.row.code)).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(ca.inside?.map((r) => r.sci)).toEqual(['Cb two'])
    const cb = levelView(t, sp2, { fam: 'Fc', genus: 'Cb' }, new Set())!
    expect(cb.rows.map((r) => r.kind === 'species' && r.row.code)).toEqual(['c2', 'c4'])
    expect(cb.split).toBe(true)
  })
  it('the same rules serve families: a family inside another\'s branch folds into it, and opening it shows both', () => {
    const sp3 = buildSpeciesIndex([sp('p1', 'Pa one', 'O1', 'Fp', 1), sp('p2', 'Pa two', 'O1', 'Fp', 2), sp('q1', 'Qa one', 'O1', 'Fq', 3)])
    const t = parseNewick('((p1:1,q1:1):1,p2:2);')
    const top = levelView(t, sp3, {}, new Set(['q1']))!
    expect(top.rows.map((r) => r.kind === 'group' ? `${r.key} ${r.on}/${r.total} ${r.with?.map((w) => w.row.fam).join()}` : r.kind)).toEqual(['order', 'Fp 1/3 Fq'])
    const fam = levelView(t, sp3, { fam: 'Fq' }, new Set())!
    expect(fam.level).toEqual({ fam: 'Fp', genus: undefined })
    expect(fam.inside?.map((r) => r.fam)).toEqual(['Fq'])
    expect(fam.rows.map((r) => r.kind === 'group' ? `${r.key} ${r.with?.map((w) => w.row.sci).join()}` : '')).toEqual(['Pa Qa one'])
    const gen = levelView(t, sp3, { fam: 'Fq', genus: 'Pa' }, new Set())!
    expect(gen.level).toEqual({ fam: 'Fp', genus: 'Pa' })
    expect(gen.rows.map((r) => r.kind === 'species' && r.row.code)).toEqual(['p1', 'q1', 'p2'])
    expect(levelView(t, sp3, { fam: 'Fq', genus: 'Qa' }, new Set())!.rows.map((r) => r.kind === 'species' && r.row.code)).toEqual(['q1'])
  })
})

describe('the fact line and the axis', () => {
  it('oldest lineage: the longest own branch among the codes, codes without a tip skipped', () => {
    expect(oldestLineage(tree, ['a1', 'a2', 'x1'])).toEqual({ code: 'a2', age: 3 })
    expect(oldestLineage(tree, ['x1'])).toBeUndefined()
  })
  it('ticks are round steps from 0', () => {
    expect(ageTicks(99)).toEqual([0, 20, 40, 60, 80])
    expect(ageTicks(2.3)).toEqual([0, 0.5, 1, 1.5, 2])
    expect(ageTicks(0)).toEqual([0])
  })
  it('ages: whole from 10, decimals below, in the language decimal', () => {
    expect(formatAge(63.4, { decimal: ',' })).toBe('63')
    expect(formatAge(1.5, { decimal: ',' })).toBe('1,5')
    expect(formatAge(0.25, { decimal: '.' })).toBe('0.25')
  })
})

describe('build-tree', () => {
  it('reads the NEXUS tree without its comments', () => {
    const nex = '#NEXUS\nBEGIN TREES;\n    TREE 1 = [&R] ((A_a:1[&index=1],B_b:1)ott1:2[&posterior=1],C_c:3)ott2:0.0[&x];\nEND;\n'
    expect(nexusTree(nex)).toBe('((A_a:1,B_b:1)ott1:2,C_c:3)ott2:0.0;')
  })
  it('matches by name, else by the crosswalk code; prunes tips that match nothing and keeps the summed branch', () => {
    const codeOf = matcher([{ code: 'aaa', sci: 'A a' }, { code: 'ccc', sci: 'C renamed' }], [{ SPECIES_CODE: 'ccc', SCI_NAME: 'C c', sci_name_2025: 'C c' }, { SPECIES_CODE: 'gone', SCI_NAME: 'B b' }])
    expect(codeOf('A_a')).toBe('aaa')
    expect(codeOf('C_c')).toBe('ccc')
    expect(codeOf('B_b')).toBeUndefined()
    const out = relabel('((A_a:1,B_b:1)ott1:2,C_c:3)ott2:0.0;', codeOf)
    expect(out).toMatchObject({ newick: '(aaa:3,ccc:3);', kept: 2, unmatched: ['B_b'], repeated: [] })
  })
})

describe('build-tree: species added beside their parent', () => {
  const add = (code: string, parent: string): Addition => ({ code, parent, source: 'test' })
  it('splits off at half the parent\'s own branch; several from one parent share the split', () => {
    const out = attach(NWK, [add('a9', 'a2'), add('b8', 'b1'), add('b9', 'b1')])
    expect(out.newick).toBe('(((a1:1,a3:1):2,(a2:1.5,a9:1.5):1.5):7,((b1:2,b8:2,b9:2):2,b2:4):6);')
    expect(out.added).toEqual(['a9', 'b8', 'b9'])
  })
  it('skips, with a note, an addition that has a tip already or whose parent has none', () => {
    const out = attach(NWK, [add('a1', 'a2'), add('z1', 'zz')])
    expect(out.newick).toBe(NWK)
    expect(out.skipped).toEqual(['a1: has a tip of its own', 'z1: its parent zz has no tip'])
  })
  it('the parser and the drawing handle a three-way split', () => {
    const t = parseNewick(attach(NWK, [add('b8', 'b1'), add('b9', 'b1')]).newick)
    const node = t.parent[t.tipOf.get('b1')!]
    expect(t.kids[node].map((k) => t.code[k])).toEqual(['b1', 'b8', 'b9'])
    expect(t.age[node]).toBe(2)
    const root = cladeTree(t, t.tipOf.values(), (k) => t.code[k]!)!
    const d = drawTree(root, () => true)
    expect(d.leaves).toHaveLength(7)
    // The three kids hang from the node's middle y (leaves 4, 5, 6 at y 3.5, 4.5, 5.5): x 800 is 2 of 10 My ago.
    expect(d.seen).toContain('M800 4.5V3.5H1000M800 4.5V4.5H1000M800 4.5V5.5H1000')
  })
})

describe('public/data/tree.v1.json', () => {
  const root = resolve(__dirname, '..')
  const file = JSON.parse(readFileSync(resolve(root, 'public/data/tree.v1.json'), 'utf8')) as TreeFile
  const shipped = JSON.parse(readFileSync(resolve(root, 'public/data/species.v1.json'), 'utf8')) as { ebirdTaxonomy: string; species: SpeciesRow[] }
  it('names its tree and taxonomy, and matches the shipped taxonomy year', () => {
    expect(file).toMatchObject({ v: 1, tree: 'AvesData v1.7', taxonomy: 'Clements 2025' })
    expect(file.ebirdTaxonomy).toBe(shipped.ebirdTaxonomy)
  })
  it('every tip is a species of species.v1.json, once, and nearly every species has a tip', () => {
    const t = parseNewick(file.newick)
    const codes = new Set(shipped.species.map((r) => r.code))
    const tips = t.code.filter((c): c is string => !!c)
    expect(tips.filter((c) => !codes.has(c))).toEqual([])
    expect(new Set(tips).size).toBe(tips.length)
    expect(tips.length).toBeGreaterThan(shipped.species.length * 0.99)
    expect(t.age[0]).toBeGreaterThan(60)
  })
  it('marks the tips placed without genetic data: about 1,500 of them, the Somali Ostrich and Northern Cassowary but not the Common Ostrich', () => {
    const t = parseNewick(file.newick, file.taxOnly)
    const marked = (c: string) => t.taxOnly[t.tipOf.get(c)!] === 1
    const n = t.taxOnly.reduce((a, b) => a + b, 0)
    expect(n).toBeGreaterThan(1400)
    expect(n).toBeLessThan(1800)
    expect(marked('ostric3')).toBe(true)
    expect(marked('norcas1')).toBe(true)
    expect(marked('ostric2')).toBe(false)
  })
  describe('split groups on the shipped data', () => {
    const t = parseNewick(file.newick, file.taxOnly)
    const idx = buildSpeciesIndex(shipped.species)
    const none = new Set<string>()
    type Group = Extract<TreeRow, { kind: 'group' }>
    const groups = (v: LevelView) => v.rows.filter((r): r is Group => r.kind === 'group')
    const top = levelView(t, idx, {}, none)!
    // Each family level once (a family inside a marked branch opens its row's family).
    const levels = [...new Map(groups(top).map((f) => { const v = levelView(t, idx, { fam: f.key }, none)!; return [v.level.fam!, v] as const })).values()]
    // Every key once, as a row or inside one; the rows' totals add up to every species of the scope.
    const coversOnce = (rows: Group[], keys: string[], n: number) => {
      expect([...rows.flatMap((r) => [r.key, ...r.with?.map((w) => w.key) ?? []])].sort()).toEqual([...new Set(keys)].sort())
      expect(rows.reduce((a, r) => a + r.total, 0)).toBe(n)
    }
    const tipped = shipped.species.filter((r) => t.tipOf.has(r.code))
    const genusOf = (r: SpeciesRow) => r.sci.split(' ')[0]
    // The species a level counts: of the groups with a tip (a species without one counts toward its group's row).
    const counted = (rows: SpeciesRow[], keyOf: (r: SpeciesRow) => string) => { const ks = new Set(rows.map(keyOf)); return shipped.species.filter((r) => ks.has(keyOf(r))) }
    const famInside = new Map(groups(top).map((r) => [r.key, r.with?.map((w) => w.key) ?? []]))
    it('families: every family once, in one row; the two split families each hold the other', () => {
      coversOnce(groups(top), tipped.map((r) => r.fam), counted(tipped, (r) => r.fam).length)
      expect(groups(top).filter((r) => r.with).map((r) => `${r.key} ${r.with!.map((w) => w.key)}`).sort()).toEqual(['Icteridae Teretistridae', 'Laniidae Platylophidae'])
    })
    it('genera: 1,970 rows, 101 marked, 409 genera inside them; each family\'s genera covered once', () => {
      let rows = 0, marked = 0, inside = 0
      for (const v of levels) {
        const fams = new Set([v.level.fam!, ...famInside.get(v.level.fam!)!])
        const scope = tipped.filter((r) => fams.has(r.fam))
        const g = groups(v)
        coversOnce(g, scope.map(genusOf), counted(scope, genusOf).filter((r) => fams.has(r.fam)).length)
        rows += g.length
        for (const r of g) if (r.with) {
          marked++
          inside += r.with.length
          // The marked branch holds exactly its row's species: nothing from outside the family.
          const genera = new Set([r.key, ...r.with.map((w) => w.key)])
          expect(isClade(t, scope.filter((s) => genera.has(genusOf(s))).map((s) => t.tipOf.get(s.code)!)), r.key).toBe(true)
        }
      }
      expect({ rows, marked, inside }).toEqual({ rows: 1970, marked: 101, inside: 409 })
    })
    it('Only my birds: every family\'s genera hold exactly its species on the list, each once, marked as with the switch off', () => {
      // A synthetic list: every fifth species of the taxonomy.
      const on = new Set(shipped.species.filter((_, i) => i % 5 === 0).map((r) => r.code))
      let marked = 0
      for (const lv of levels) {
        const fam = lv.level.fam!
        const fams = new Set([fam, ...famInside.get(fam)!])
        const scope = counted(tipped.filter((r) => fams.has(r.fam)), genusOf).filter((r) => fams.has(r.fam))
        const mine = levelView(t, idx, { fam }, on, true)!
        const off = levelView(t, idx, { fam }, on)!
        const g = groups(mine)
        expect(g.every((r) => r.on > 0), fam).toBe(true)
        expect(g.reduce((a, r) => a + r.on, 0), fam).toBe(scope.filter((r) => on.has(r.code)).length)
        const keys = g.flatMap((r) => [r.key, ...r.with?.map((w) => w.key) ?? []])
        expect(new Set(keys).size, fam).toBe(keys.length)
        expect(mine.drawing.leaves.map((l) => l.key), fam).toEqual(g.map((r) => r.key))
        // The same rows as the switch off less those without a bird, the same marks, inside only the groups with one.
        const kept = groups(off).filter((r) => r.on > 0)
        expect(g.map((r) => `${r.key} ${!!r.with} ${r.with?.map((w) => w.key)}`), fam).toEqual(kept.map((r) => `${r.key} ${!!r.with} ${r.with?.filter((w) => w.on > 0).map((w) => w.key)}`))
        // Each marked row's species level: its species on the list, each once.
        for (const r of g.filter((x) => x.with)) {
          marked++
          const sv = levelView(t, idx, { fam, genus: r.key }, on, true)!
          const codes = sv.rows.map((x) => (x.kind === 'species' ? x.row.code : ''))
          const genera = new Set([r.key, ...off.rows.flatMap((x) => (x.kind === 'group' && x.key === r.key ? x.with!.map((w) => w.key) : []))])
          expect(codes.sort(), r.key).toEqual(tipped.filter((s) => fams.has(s.fam) && genera.has(genusOf(s)) && on.has(s.code)).map((s) => s.code).sort())
        }
      }
      expect(marked).toBeGreaterThan(20)
    })
    it('Vauriella is the largest marked tip: 358 species with 55 other genera; Muscicapidae, Otididae and Timaliidae are one row each', () => {
      const v = levelView(t, idx, { fam: 'Muscicapidae' }, none)!
      expect(groups(v).map((r) => `${r.key} ${r.with?.length}`)).toEqual(['Vauriella 55'])
      expect(levelView(t, idx, { fam: 'Muscicapidae', genus: 'Vauriella' }, none)!.rows).toHaveLength(358)
      const biggest = levels.flatMap((l) => groups(l).filter((r) => r.with)).sort((a, b) => b.total - a.total)[0]
      expect(biggest.key).toBe('Vauriella')
      for (const f of ['Otididae', 'Timaliidae']) expect(groups(levelView(t, idx, { fam: f }, none)!), f).toHaveLength(1)
    })
  })
  it('each species of data/tree-additions.json sits beside its parent, dotted, and names its source', () => {
    const t = parseNewick(file.newick, file.taxOnly)
    const additions = JSON.parse(readFileSync(resolve(root, 'data/tree-additions.json'), 'utf8')) as Addition[]
    expect(additions.length).toBeGreaterThan(0)
    for (const a of additions) {
      const k = t.tipOf.get(a.code)!
      expect(t.parent[t.tipOf.get(a.parent)!], a.code).toBe(t.parent[k])
      expect(t.taxOnly[k], a.code).toBe(1)
      expect(a.source.length, a.code).toBeGreaterThan(10)
    }
  })
})
