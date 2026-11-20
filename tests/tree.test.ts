// The bird tree: parsing, collapsing to families / genera / species, the levels' rows and counts, the fact line, the
// axis, the build script's relabelling, and the committed tree.v1.json against species.v1.json. Synthetic trees only.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { matcher, nexusTree, relabel } from '../scripts/build-data/build-tree'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { HEAD_H, ROW_H, isClade, levelView } from '@/lib/tree/levels'
import { ageTicks, cladeTree, drawTree, formatAge, isLeaf, leavesOf, oldestLineage, parseNewick, type TreeFile } from '@/lib/tree/tree'

const sp = (code: string, sci: string, ord: string, fam: string, to: number): SpeciesRow =>
  ({ code, com: code.toUpperCase(), sci, ord, fam, famCom: `${fam} birds`, to, g: 10, gSrc: 'avonet', st: true, ar: 1, q: true })
// Fa: genus Aa is not one clade (a1 sits with Ab's a3); x1 is in Fa but not in the tree.
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
  it('a family opens to its genera; a split genus counts each part on its own tips', () => {
    const v = levelView(tree, species, { fam: 'Fa' }, onList)!
    expect(v.rows.map((r) => r.kind === 'group' ? `${r.key} ${r.on}/${r.total} ${r.part?.join('of') ?? ''}` : '')).toEqual(['Aa 1/1 1of2', 'Ab 0/1 ', 'Aa 0/1 2of2'])
    expect(v.split).toBe(false)
  })
  it('a genus opens to its species, marked on or off the list; a genus that is not one clade says so', () => {
    const v = levelView(tree, species, { fam: 'Fa', genus: 'Aa' }, onList)!
    expect(v.rows.map((r) => r.kind === 'species' ? `${r.row.code} ${r.on}` : '')).toEqual(['a1 true', 'a2 false'])
    expect(v.split).toBe(true)
  })
  it('one lineage alone is drawn as its stem, from the split above it', () => {
    expect(levelView(tree, species, { fam: 'Fa', genus: 'Ab' }, onList)!.drawing.rootAge).toBe(1)
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
})
