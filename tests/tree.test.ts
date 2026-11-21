// The bird tree: parsing, collapsing to orders / families / genera / species, the levels' rows and counts, the level
// menu and its tip limit, the tips' stickers, the fan's and circle's geometry and their every-name fit (fitRound), the
// tree's path through the taxonomy filter (path.ts), the fact line, the axis, the build script's relabelling, and the
// committed tree.v1.json against species.v1.json. Synthetic trees only.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { attach, matcher, nexusTree, relabel, taxOnlyBits, type Addition } from '../scripts/build-data/build-tree'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { FAN_R_MAX, FAN_R_MIN, LABEL_GAP, LABEL_LINE, LABEL_STICKER, RADIAL_GAP, SCREEN_SIZES, drawFan, fanAngle, fanLabel, fanRing, fitRound, inOpening, ringLabels, type FanShape, type LabelSizes, type LabelSpan, type RoundFit } from '@/lib/tree/fan'
import { HEAD_H, MAX_TIPS, ROW_H, foldSplit, groupSticker, isClade, levelView, taxonCover, type LevelView, type TreeRow } from '@/lib/tree/levels'
import { closeDeep, openBranch, treeBranch } from '@/lib/tree/path'
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
    // The corner (rounded, as short as the half-row drop) stays solid; the dotted part starts after it.
    expect(d.seen).toContain('M600 4Q600 4.5 600.5 4.5M')
    expect(d.seenDot).toBe('M600.5 4.5H1000')
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
    expect(d.seen).toContain('M600 4Q600 4.5 600.5 4.5H1000')
    expect(d.seen).toContain('M0 ')
    expect(d.unseen).toContain('M600 4Q600 3.5 600.5 3.5H1000') // b1
    expect((d.seen + d.unseen).match(/M/g)).toHaveLength(8) // 9 nodes, the root has no branch
    // Branches simply join: no dot marks a node.
    expect(Object.keys(d).sort()).toEqual(['leaves', 'rootAge', 'seen', 'seenDot', 'unseen', 'unseenDot'])
    expect(d.seen + d.unseen).not.toMatch(/a3\.5/)
  })
})

describe('levelView', () => {
  const onList = new Set(['a1', 'b2', 'x1'])
  it('families with their orders, counted from the taxonomy (a bird the tree lacks included)', () => {
    const v = levelView(tree, species, {}, onList, false, 'families')!
    expect(v.rows.map((r) => r.kind === 'head' ? `#${r.parts.map((x) => x.key).join(' · ')}` : r.kind === 'group' ? `${r.key} ${r.on}/${r.total}` : '')).toEqual(['#O1', 'Fa 2/4', '#O2', 'Fb 1/2'])
    expect(v.height).toBe(2 * HEAD_H + 2 * ROW_H)
    expect(v.split).toBe(false)
  })
  it('a family\'s genera (asked for: a family of four opens on its species); a split genus is one row with the genus inside it, counting the whole branch', () => {
    const v = levelView(tree, species, { fam: 'Fa' }, onList, false, 'genera')!
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
    expect(ab.level).toEqual({ ord: 'O1', fam: 'Fa', genus: 'Ab' })
    expect(ab.rows.map((r) => r.kind === 'species' && r.row.code)).toEqual(['a3'])
    expect(ab.inside).toBeUndefined()
  })
  it('one lineage alone is drawn as its stem, from the split above it', () => {
    const fb = levelView(tree, species, { fam: 'Fb' }, onList, false, 'genera')!
    expect(fb.drawing.rootAge).toBe(10)
    expect(fb.drawing.unseen + fb.drawing.seen).toBe(`M0 ${ROW_H / 2}H1000`)
  })
  it('changing the list changes the counts and the marked branches', () => {
    const a = levelView(tree, species, {}, new Set(['a1']), false, 'families')!
    const b = levelView(tree, species, {}, new Set(['b1']), false, 'families')!
    expect(a.drawing.seen).not.toBe(b.drawing.seen)
    expect(a.rows.filter((r) => r.kind === 'group').map((r) => r.kind === 'group' && r.on)).toEqual([1, 0])
    expect(b.rows.filter((r) => r.kind === 'group').map((r) => r.kind === 'group' && r.on)).toEqual([0, 1])
  })
})

describe('the orders, and one rank under the open branch', () => {
  const onList = new Set(['a1', 'b2'])
  const groups = (v: LevelView) => v.rows.map((r) => (r.kind === 'group' ? `${r.key} ${r.on}/${r.total}${r.with ? ` with ${r.with.map((w) => w.key)}` : ''}` : r.kind === 'species' ? r.row.code : `#${r.parts.map((x) => x.key).join(' · ')}`))
  it('opens on the orders, counted from the taxonomy', () => {
    const v = levelView(tree, species, {}, onList)!
    expect(v.tips).toBe('orders')
    expect(groups(v)).toEqual(['O1 1/4', 'O2 1/2']) // no headings over the orders
    expect(v.cover).toEqual([2, 2])
    expect(v.level).toEqual({ ord: undefined, fam: undefined, genus: undefined })
  })
  it('an open order draws its next rank past lone tips (here its species); a rank carried from before is ignored', () => {
    expect(levelView(tree, species, { ord: 'O1' }, onList)!.tips).toBe('species')
    const o = levelView(tree, species, { ord: 'O1' }, onList, false, 'families')!
    expect(o.tips).toBe('families')
    expect(groups(o)).toEqual(['Fa 1/4'])
    expect(o.level).toEqual({ ord: 'O1', fam: undefined, genus: undefined })
    // A rank above the open branch draws the default (Fa's one genus row, Aa with Ab, is skipped).
    expect(levelView(tree, species, { fam: 'Fa' }, onList, false, 'orders')!.tips).toBe('species')
    // A saved level with the old `tips` field opens at the default rank, without error.
    expect(levelView(tree, species, { ord: 'O1', tips: 'families' } as never, onList)!.tips).toBe('species')
  })
  it('every family, genus or species of the open branch at once, in the tree\'s order', () => {
    // The species under their genera (round 6, item 10), the order and family named with the genus where they change too;
    // Aa, split by Ab in the tree, is headed twice.
    expect(groups(levelView(tree, species, {}, onList, false, 'species')!)).toEqual(['#O1 · Fa · Aa', 'a1', '#Ab', 'a3', '#Aa', 'a2', '#O2 · Fb · Bb', 'b1', 'b2'])
    expect(groups(levelView(tree, species, { ord: 'O1' }, onList, false, 'genera')!)).toEqual(['#Fa', 'Aa 1/4 with Ab'])
    const sp = levelView(tree, species, { ord: 'O1' }, onList, false, 'species')!
    expect(sp.tips).toBe('species')
    expect(sp.cover).toEqual([1, 4]) // x1 has no tip but is one of the order's species
  })
  it(`a rank over MAX_TIPS (${MAX_TIPS}) falls back to the nearest above it that fits; Lifers only counts first`, () => {
    const n = MAX_TIPS + 1
    const codes = Array.from({ length: n }, (_, i) => `g${i}`)
    const t = parseNewick(`(${codes.map((c) => `${c}:1`).join(',')});`)
    const idx = buildSpeciesIndex(codes.map((c, i) => sp(c, `G${i} x`, 'O1', 'Fa', i)))
    const all = levelView(t, idx, {}, new Set(['g3']), false, 'genera')!
    expect(all.tips).toBe('families')
    const mine = levelView(t, idx, {}, new Set(['g3', 'g7']), true, 'genera')!
    expect(mine.tips).toBe('genera')
    expect(groups(mine)).toEqual(['#O1 · Fa', 'G3 1/1', 'G7 1/1'])
    // The default's skip past a lone family stops short of a rank over the limit: the order's one family, not 301 genera.
    expect(levelView(t, idx, { ord: 'O1' }, new Set(['g3']))!.tips).toBe('families')
  })
  it('each group shows one bird of the list with a sticker, the first in taxonomic order; a species row carries its own', () => {
    const rows = [sp('k3', 'Kk c', 'O1', 'Fk', 3), sp('k1', 'Kk a', 'O1', 'Fk', 1), { ...sp('k0', 'Kk z', 'O1', 'Fk', 0), st: false }]
    expect(groupSticker(rows, new Set(['k3', 'k1', 'k0']))?.code).toBe('k1')
    expect(groupSticker(rows, new Set(['k3']))?.code).toBe('k3')
    expect(groupSticker(rows, new Set(['k0']))).toBeUndefined() // no sticker: the name alone
    // No bird of the group on the list: its first species in taxonomic order with a sticker (round 6), shown dimmed.
    expect(groupSticker(rows, new Set())?.code).toBe('k1')
    const v = levelView(tree, species, {}, new Set(['a2', 'a1', 'b2']))!
    expect(v.rows.map((r) => r.kind === 'group' && r.sticker?.code)).toEqual(['a1', 'b2'])
    // A marked row's bird can come from a group inside it.
    expect(levelView(tree, species, { fam: 'Fa' }, new Set(['a3']), false, 'genera')!.rows.map((r) => r.kind === 'group' && r.sticker?.code)).toEqual(['a3'])
  })
  it('a split order is one marked row at the smallest branch holding it, as families and genera are', () => {
    const sp4 = buildSpeciesIndex([sp('p1', 'Pa one', 'Op', 'Fp', 1), sp('p2', 'Pa two', 'Op', 'Fp', 2), sp('q1', 'Qa one', 'Oq', 'Fq', 3), sp('r1', 'Ra one', 'Or', 'Fr', 4)])
    const t = parseNewick('(((p1:1,q1:1):1,p2:2):3,r1:5);')
    const top = levelView(t, sp4, {}, new Set(['q1']))!
    expect(groups(top)).toEqual(['Op 1/3 with Oq', 'Or 0/1'])
    const oq = levelView(t, sp4, { ord: 'Oq' }, new Set(), false, 'families')!
    expect(oq.level.ord).toBe('Op')
    expect(oq.inside?.map((r) => r.ord)).toEqual(['Oq'])
    expect(groups(oq)).toEqual(['Fp 0/3 with Fq'])
  })
})

describe('the fan', () => {
  it('the tips spread over the half disc, left to right, each mid-slot', () => {
    expect(fanAngle(0.5, 2)).toBeCloseTo((3 * Math.PI) / 4)
    expect(fanAngle(1.5, 2)).toBeCloseTo(Math.PI / 4)
    expect(fanAngle(0.5, 1)).toBeCloseTo(Math.PI / 2)
  })
  it('drawFan: the root at the centre, the tips on the arc, arcs with rounded joins, no node dots', () => {
    const root = cladeTree(tree, tree.tipOf.values(), (k) => tree.code[k]!)!
    const box = { cx: 0, cy: 0, R: 100 }
    const d = drawFan(root, (l) => tree.code[l.tips[0]] === 'b2', undefined, (l) => tree.code[l.tips[0]] === 'b2', box)
    expect(d.tips).toHaveLength(5)
    for (const p of d.tips) expect(Math.hypot(p.x, p.y)).toBeCloseTo(100)
    expect(d.tips.map((p) => p.y <= 0)).toEqual([true, true, true, true, true]) // the upper half (screen y up)
    expect(d.seen).toContain('M0 0L') // the root's branch leaves the centre
    expect(d.unseen).toMatch(/A[\d.]+ [\d.]+ 0 0 [01] /) // an arc along the parent's ring
    expect(d.unseen).toContain('Q')
    expect(d.seenDot).toMatch(/^M[-\d. ]+L[-\d. ]+$/) // b2's own branch, past the join
    expect('seenNodes' in d || 'unseenNodes' in d).toBe(false)
    // One lineage alone: its stem straight up from the centre.
    const one = drawFan(cladeTree(tree, [tree.tipOf.get('a1')!], () => 'a')!, () => true, 3, () => false, box)
    expect(one.seen).toBe('M0 0L0 -100')
  })
  it('fanLabel: along the radius and never upside down; the left half ends at the tip and reads inward', () => {
    const box = { cx: 0, cy: 0, R: 100 }
    for (let a = 0.01; a < Math.PI; a += 0.1) {
      const l = fanLabel(box, a, 10)
      expect(Math.abs(l.rot)).toBeLessThanOrEqual(90)
      expect(l.flip).toBe(Math.cos(a) < 0)
      expect(Math.hypot(l.x, l.y)).toBeCloseTo(110)
    }
    expect(fanLabel(box, Math.PI / 2, 10)).toMatchObject({ rot: -90, flip: false })
    expect(fanLabel(box, (3 * Math.PI) / 4, 10)).toMatchObject({ rot: 45, flip: true })
  })
  it('the circle: its tips all round clockwise from the top, each mid-slot', () => {
    expect(fanAngle(0.5, 4, 'circle')).toBeCloseTo(Math.PI / 4) // the first tip just right of the top
    expect(fanAngle(2.5, 4, 'circle')).toBeCloseTo(-(3 * Math.PI) / 4) // the third down on the left
    const root = cladeTree(tree, tree.tipOf.values(), (k) => tree.code[k]!)!
    const d = drawFan(root, () => false, undefined, () => false, { cx: 0, cy: 0, R: 100, shape: 'circle' })
    for (const p of d.tips) expect(Math.hypot(p.x, p.y)).toBeCloseTo(100)
    expect(d.tips.some((p) => p.y > 0) && d.tips.some((p) => p.y < 0)).toBe(true) // both halves
    expect(d.unseen).not.toMatch(/A[\d.]+ [\d.]+ 0 1 /) // never the long way round
  })
  it('fanLabel all round the circle: along the radius, never upside down, the left half flipped', () => {
    const box = { cx: 0, cy: 0, R: 100, shape: 'circle' as const }
    for (let y = 0.5; y < 40; y++) {
      const a = fanAngle(y, 40, 'circle')
      const l = fanLabel(box, a, 10)
      const turn = ((l.rot % 360) + 540) % 360 - 180 // the same turn in -180..180
      expect(Math.abs(turn)).toBeLessThanOrEqual(90 + 1e-9)
      expect(l.flip).toBe(Math.cos(a) < -1e-9)
      expect(Math.hypot(l.x, l.y)).toBeCloseTo(110)
    }
  })
  it('the circle\'s rings are whole, their ages where they cross the radius straight up; the fan\'s on both sides of its centre', () => {
    expect(fanRing({ cx: 50, cy: 60, R: 40, shape: 'circle' }, 20)).toBe('M30 60a20 20 0 1 0 40 0a20 20 0 1 0 -40 0Z')
    expect(ringLabels({ cx: 50, cy: 60, R: 40, shape: 'circle' }, 20)).toEqual([[50, 40]])
    expect(ringLabels({ cx: 50, cy: 60, R: 40 }, 20)).toEqual([[70, 60], [30, 60]])
    expect(ringLabels({ cx: 50, cy: 60, R: 40 }, 8)).toEqual([[58, 60]])
  })
  it('fanRing: an age\'s half circle over the top', () => {
    expect(fanRing({ cx: 50, cy: 60, R: 40 }, 20)).toBe('M30 60A20 20 0 0 1 70 60')
  })
})

describe('every tip named on the Fan and Radial (fitRound)', () => {
  const spans = (n: number, name = 8, count = 3, on = (i: number) => i % 2 === 0): LabelSpan[] => Array.from({ length: n }, (_, i) => ({ name, count, on: on(i) }))
  /** The share image's way (round 6 kept it): the centre mid-width and the sticker's box never smaller. */
  const FIXED: LabelSizes = { base: 13, floor: 11, dot: 3.5 }
  /** Each label's reach past the tips' ring: the dot, a gap, the sticker's box, a gap, the name, and the count it keeps. */
  const reach = (f: RoundFit, s: LabelSpan, i: number) => SCREEN_SIZES.dot + f.st + f.px * (2 * LABEL_GAP + s.name + (f.counts[i] && s.count ? LABEL_GAP + s.count : 0))
  /** No two labels touch, every label is inside the width on both sides (and the height, when given), the names at the
   *  floor or more, the sticker's box at the name's line or more. */
  function whole(sp: LabelSpan[], f: RoundFit, shape: FanShape, w: number, h?: number) {
    const n = sp.length, S = f.st
    const step = (shape === 'circle' ? 2 * Math.PI - (f.open ?? 0) : Math.PI) / n
    expect((f.R + SCREEN_SIZES.dot + f.px * LABEL_GAP) * step).toBeGreaterThanOrEqual(S - 1e-6)
    expect(f.px).toBeGreaterThanOrEqual(SCREEN_SIZES.floor)
    expect(S).toBeGreaterThanOrEqual(f.px * LABEL_LINE - 1e-6)
    sp.forEach((s, i) => {
      const a = fanAngle(i + 0.5, n, shape, f.open), out = f.R + reach(f, s, i)
      expect(f.cx + out * Math.cos(a) + (S / 2) * Math.abs(Math.sin(a))).toBeLessThanOrEqual(w + 1e-6)
      expect(f.cx + out * Math.cos(a) - (S / 2) * Math.abs(Math.sin(a))).toBeGreaterThanOrEqual(-1e-6)
      expect(f.cy - out * Math.sin(a) - (S / 2) * Math.abs(Math.cos(a))).toBeGreaterThanOrEqual(-1e-6)
      if (h !== undefined) expect(f.cy - out * Math.sin(a) + (S / 2) * Math.abs(Math.cos(a))).toBeLessThanOrEqual(h + 1e-6)
    })
  }
  it('on a wide column every tip keeps its name and count at full size, the drawing as large as the side labels allow', () => {
    const sp = spans(45)
    const f = fitRound(sp, 'fan', { w: 1088 })!
    expect(f.px).toBe(13)
    expect(f.st).toBe(13 * LABEL_STICKER)
    expect(f.counts.every(Boolean)).toBe(true)
    expect(f.cx).toBeCloseTo(544, 6) // even labels: their reach centred is the centre mid-width
    whole(sp, f, 'fan', 1088)
    expect(f.h).toBeGreaterThan(f.R) // the page grows with the drawing
  })
  it('on a narrower column the type shrinks, to the floor at most, before any count goes', () => {
    const sp = spans(45)
    const f = fitRound(sp, 'fan', { w: 900 })!
    expect(f.px).toBeLessThan(13)
    expect(f.counts.every(Boolean)).toBe(true)
    whole(sp, f, 'fan', 900)
  })
  it('past the floor the counts go, only those that hold the drawing in; never a name', () => {
    // The first and last tips (at the fan's two ends) have long counts, one on the list and one not.
    const sp = spans(45, 6, 3).map((s, i) => (i === 0 || i === 44 ? { ...s, count: 20, on: i === 0 } : s))
    // Centred mid-width (the share image's way): both go.
    const fixed = fitRound(sp, 'fan', { w: 1088 }, FIXED)!
    expect(fixed.px).toBe(SCREEN_SIZES.floor)
    expect(fixed.counts[0]).toBe(false)
    expect(fixed.counts[44]).toBe(false)
    expect(fixed.counts.slice(1, 44).every(Boolean)).toBe(true)
    expect(fixed.cx).toBe(544)
    // On screen the labels' reach is centred (round 6): the off-list tip's count goes first, and that is enough.
    const f = fitRound(sp, 'fan', { w: 1088 })!
    expect(f.px).toBe(SCREEN_SIZES.floor)
    expect(f.counts[0]).toBe(true)
    expect(f.counts[44]).toBe(false)
    expect(f.counts.slice(1, 44).every(Boolean)).toBe(true)
    whole(sp, f, 'fan', 1088)
  })
  it('on screen the drawing uses the whole width: a long label on one side takes the room the other side does not need', () => {
    // A long name at the fan's left end and short ones elsewhere.
    const sp = spans(30, 5, 0).map((s, i) => (i === 0 ? { ...s, name: 34 } : s))
    expect(fitRound(sp, 'fan', { w: 1000 }, FIXED)).toBeUndefined()
    const f = fitRound(sp, 'fan', { w: 1000 })!
    expect(f.cx).toBeGreaterThan(500) // the centre moves right, away from the long label
    whole(sp, f, 'fan', 1000)
  })
  it("last before refusing, the sticker's box shrinks, never under the name's line; the share image's never does", () => {
    // 141 tips (Perching birds' families) of 9 em names on a 1,088px column.
    const sp = spans(141, 9, 4)
    expect(fitRound(sp, 'circle', { w: 1088 }, { ...SCREEN_SIZES, stFloor: LABEL_STICKER })).toBeUndefined()
    // (The full box at 11px without a count did not fit: above. At each smaller box the type and counts are tried again.)
    const f = fitRound(sp, 'circle', { w: 1088 })!
    expect(f.st).toBeLessThan(f.px * LABEL_STICKER)
    whole(sp, f, 'circle', 1088)
    expect(fitRound(sp, 'circle', { w: 1088 }, FIXED)).toBeUndefined()
    // Never under the line: with more tips, none.
    expect(fitRound(spans(400, 9, 4), 'circle', { w: 1088 })).toBeUndefined()
  })
  it('the radius grows past its usual bound when the tips need it', () => {
    const sp = spans(200, 4)
    const f = fitRound(sp, 'circle', { w: 4000 })!
    expect(f.R).toBeGreaterThan(FAN_R_MAX)
    whole(sp, f, 'circle', 4000)
    expect(f.h).toBeGreaterThan(2 * f.R) // both ways round
    // With fewer tips it keeps to the usual size.
    expect(fitRound(spans(10), 'circle', { w: 4000 })!.R).toBe(FAN_R_MAX)
    expect(fitRound(spans(2), 'fan', { w: 400 })!.R).toBeGreaterThanOrEqual(FAN_R_MIN)
  })
  it('in a fixed height (a share image) the circle is centred in it and every label stays inside', () => {
    const sp = spans(30)
    const f = fitRound(sp, 'circle', { w: 1000, h: 800 })!
    expect(f).toMatchObject({ h: 800, cy: 400, cx: 500 })
    whole(sp, f, 'circle', 1000, 800)
  })
  it("the screen's Radial with its time scale opens at the top: no tip within half the opening of straight up", () => {
    const sp = spans(141, 4, 0)
    const f = fitRound(sp, 'circle', { w: 1088 }, { ...SCREEN_SIZES, gap: RADIAL_GAP })!
    expect(f.open).toBeGreaterThan(0)
    const off = sp.map((_, i) => Math.abs(Math.atan2(Math.cos(fanAngle(i + 0.5, 141, 'circle', f.open)), Math.sin(fanAngle(i + 0.5, 141, 'circle', f.open)))))
    expect(Math.min(...off)).toBeCloseTo(RADIAL_GAP / 2, 6)
    whole(sp, f, 'circle', 1088)
    // Few tips: their own slot is already wider, so no opening.
    expect(fitRound(spans(10), 'circle', { w: 1088 }, { ...SCREEN_SIZES, gap: RADIAL_GAP })!.open).toBeUndefined()
  })
  it("the Radial's ages go only inside its opening: a patch on an outer ring fits, one on an inner ring too small for it does not", () => {
    const box = { cx: 500, cy: 500, R: 400, shape: 'circle' as const, open: 0.2 }
    expect(inOpening(box, 141, 300, 20, 16)).toBe(true)
    expect(inOpening(box, 141, 40, 20, 16)).toBe(false)
    expect(inOpening(box, 141, 6, 20, 16)).toBe(false) // the patch would reach past the centre
    // Without an opening, the one slot between the last tip and the first.
    expect(inOpening({ ...box, open: undefined }, 141, 300, 20, 16)).toBe(false)
    expect(inOpening({ ...box, open: undefined }, 8, 300, 20, 16)).toBe(true)
  })
  it('none when even then a name does not fit: too many tips for the width', () => {
    expect(fitRound(spans(300), 'fan', { w: 1088 })).toBeUndefined()
    expect(fitRound(spans(45), 'fan', { w: 360 })).toBeUndefined()
    expect(fitRound([], 'fan', { w: 1088 })).toBeUndefined()
  })
})

describe("the tree's path is the taxonomy filter (path.ts)", () => {
  // The shown index lacks family Fz (the landing sample's holds only its own birds).
  const holds = (_ord: string, fam: string) => fam !== 'Fz'
  const rest = { countries: ['CA'], from: '2020-01' }
  it('opening an order, a family or a genus sets the filter (round 6: the genus too), the rest of it kept', () => {
    expect(openBranch(rest, { ord: 'O1' }, holds)).toEqual({ filter: { ...rest, order: 'O1' }, deep: null })
    expect(openBranch(rest, { ord: 'O1', fam: 'Fa' }, holds)).toEqual({ filter: { ...rest, order: 'O1', family: 'Fa' }, deep: null })
    const g = openBranch(rest, { ord: 'O1', fam: 'Fa', genus: 'Aa' }, holds)
    expect(g).toEqual({ filter: { ...rest, order: 'O1', family: 'Fa', genus: 'Aa' }, deep: null })
    expect(treeBranch(g.filter, g.deep)).toEqual({ ord: 'O1', fam: 'Fa', genus: 'Aa' })
    expect(openBranch(g.filter, {}, holds)).toEqual({ filter: rest, deep: null }) // back to every order
  })
  it('a chip picked in the row (another order or family) opens it and drops the genus', () => {
    const g = openBranch({}, { ord: 'O1', fam: 'Fa', genus: 'Aa' }, holds)
    expect(treeBranch({ order: 'O1' }, g.deep)).toEqual({ ord: 'O1' })
    expect(treeBranch({ order: 'O2', family: 'Fb' }, g.deep)).toEqual({ ord: 'O2', fam: 'Fb' })
    expect(treeBranch({}, g.deep)).toEqual({})
    expect(closeDeep(g.deep, 1)).toBeNull() // the family's step closes the genus
  })
  it('a family the filter cannot hold is kept beside it, with its name; its steps close one by one', () => {
    const z = openBranch({}, { ord: 'O1', fam: 'Fz', genus: 'Zz' }, holds, 'Zed birds')
    expect(z).toEqual({ filter: { order: 'O1' }, deep: { at: 'O1||', fam: 'Fz', famName: 'Zed birds', genus: 'Zz' } })
    expect(treeBranch(z.filter, z.deep)).toEqual({ ord: 'O1', fam: 'Fz', genus: 'Zz' })
    const fam = closeDeep(z.deep, 1)
    expect(fam).toEqual({ at: 'O1||', fam: 'Fz', famName: 'Zed birds' })
    expect(treeBranch(z.filter, fam)).toEqual({ ord: 'O1', fam: 'Fz' })
    expect(closeDeep(z.deep, 0)).toBeNull()
  })
})

describe('Only my birds', () => {
  const shown = (v: LevelView) => v.rows.map((r) => (r.kind === 'head' ? `o:${r.parts.map((x) => x.key).join(' · ')}` : r.kind === 'group' ? `${r.key} ${r.on}${r.with ? ` with [${r.with.map((w) => w.key)}]` : ''}` : r.row.code))
  it('keeps the rows with a bird on the list and draws the tree on them alone, its ages kept', () => {
    const v = levelView(tree, species, {}, new Set(['a1']), true, 'families')!
    expect(shown(v)).toEqual(['o:O1', 'Fa 1'])
    expect(v.height).toBe(HEAD_H + ROW_H)
    expect(v.drawing.leaves).toHaveLength(1)
    expect(v.drawing.rootAge).toBe(10) // Fa's stem, from the root of the whole tree
    expect(shown(levelView(tree, species, {}, new Set(['a1']), false, 'families')!)).toEqual(['o:O1', 'Fa 1', 'o:O2', 'Fb 0'])
  })
  it('a marked row stays when any species of its branch is on the list, its groups inside cut to those with a bird', () => {
    expect(shown(levelView(tree, species, { fam: 'Fa' }, new Set(['a2']), false, 'genera')!)).toEqual(['Aa 1 with [Ab]'])
    expect(shown(levelView(tree, species, { fam: 'Fa' }, new Set(['a2']), true, 'genera')!)).toEqual(['Aa 1 with []'])
    expect(shown(levelView(tree, species, { fam: 'Fa' }, new Set(['a3']), true, 'genera')!)).toEqual(['Aa 1 with [Ab]'])
    expect(shown(levelView(tree, species, { fam: 'Fa', genus: 'Aa' }, new Set(['a2']), true)!)).toEqual(['a2'])
  })
  it('a level with no bird on the list: no rows, the level kept', () => {
    const v = levelView(tree, species, { fam: 'Fb' }, new Set(['a1']), true)!
    expect(v.rows).toEqual([])
    expect(v.level).toEqual({ ord: 'O2', fam: 'Fb', genus: undefined })
    expect(v.tips).toBe('species')
  })
})

describe('taxonCover', () => {
  it("counts the species, genera, families and orders the codes cover against the taxonomy's", () => {
    expect(taxonCover(species.rows, new Set(['a1', 'a3']))).toEqual({ species: [2, 6], genera: [2, 3], families: [1, 2], orders: [1, 2] })
    expect(taxonCover(species.rows, new Set())).toEqual({ species: [0, 6], genera: [0, 3], families: [0, 2], orders: [0, 2] })
    expect(taxonCover(species.rows, new Set(species.rows.map((r) => r.code)))).toEqual({ species: [6, 6], genera: [3, 3], families: [2, 2], orders: [2, 2] })
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
    const v = levelView(t, sp2, { fam: 'Fc' }, new Set(['c3']), false, 'genera')!
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
    const top = levelView(t, sp3, {}, new Set(['q1']), false, 'families')!
    expect(top.rows.map((r) => r.kind === 'group' ? `${r.key} ${r.on}/${r.total} ${r.with?.map((w) => w.row.fam).join()}` : r.kind)).toEqual(['head', 'Fp 1/3 Fq'])
    const fam = levelView(t, sp3, { fam: 'Fq' }, new Set(), false, 'genera')!
    expect(fam.level).toEqual({ ord: 'O1', fam: 'Fp', genus: undefined })
    expect(fam.inside?.map((r) => r.fam)).toEqual(['Fq'])
    expect(fam.rows.map((r) => r.kind === 'group' ? `${r.key} ${r.with?.map((w) => w.row.sci).join()}` : '')).toEqual(['Pa Qa one'])
    const gen = levelView(t, sp3, { fam: 'Fq', genus: 'Pa' }, new Set())!
    expect(gen.level).toEqual({ ord: 'O1', fam: 'Fp', genus: 'Pa' })
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
    expect(d.seen).toContain('M800 4.5Q800 3.5 801 3.5H1000M800 4.5H1000M800 4.5Q800 5.5 801 5.5H1000')
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
    const top = levelView(t, idx, {}, none, false, 'families')!
    // Each family level once (a family inside a marked branch opens its row's family).
    const levels = [...new Map(groups(top).map((f) => { const v = levelView(t, idx, { fam: f.key }, none, false, 'genera')!; return [v.level.fam!, v] as const })).values()]
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
    it('opens on its 45 orders, none split; every family fits at once (248), every genus does not', () => {
      const v = levelView(t, idx, {}, none)!
      expect(v.tips).toBe('orders')
      expect(groups(v)).toHaveLength(45)
      expect(groups(v).filter((r) => r.with)).toEqual([])
      expect(groups(top)).toHaveLength(248)
      expect(levelView(t, idx, {}, none, false, 'genera')!.tips).toBe('families')
    })
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
        const mine = levelView(t, idx, { fam }, on, true, 'genera')!
        const off = levelView(t, idx, { fam }, on, false, 'genera')!
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
    it("Fan and Radial for big steps (round 6): Perching birds' 141 families all named on the Radial in a 1,088px view", () => {
      // The names' widths from the fonts' measured advances (Satoshi 700 for the 600 weight, Geist Mono for the counts).
      const fonts = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/glyph-advances.json'), 'utf8')).fonts as Record<string, { advances: Record<string, number> }>
      const em = (text: string, font: string) => [...text].reduce((a, c) => a + (fonts[font].advances[c] ?? 0.6), 0)
      const on = new Set(shipped.species.filter((_, i) => i % 7 === 0).map((r) => r.code))
      const v = levelView(t, idx, { ord: 'Passeriformes' }, on)!
      expect(v.tips).toBe('families')
      const tips = groups(v)
      expect(tips).toHaveLength(141)
      const spans = tips.map((r) => ({ name: em(r.row.famCom || r.row.fam, 'satoshi-700') + (r.with ? 15 / 13 : 0), count: ((em(`${r.on} of ${r.total}`, 'geist-mono-500') + 0.48) * 11) / 13, on: r.on > 0 }))
      // Before round 6's fit (the centre mid-width, the sticker's box never smaller) neither layout could.
      expect(fitRound(spans, 'circle', { w: 1088 }, { base: 13, floor: 11, dot: 3.5 })).toBeUndefined()
      const f = fitRound(spans, 'circle', { w: 1088 }, { ...SCREEN_SIZES, gap: RADIAL_GAP })!
      expect(f.px).toBeGreaterThanOrEqual(11)
      expect(f.st).toBeGreaterThanOrEqual(11 * LABEL_LINE - 1e-6)
      // The Fan cannot: 141 labels a line apart along a half circle need a radius over half the width.
      expect(fitRound(spans, 'fan', { w: 1088 })).toBeUndefined()
      expect((141 * 11 * LABEL_LINE) / Math.PI).toBeGreaterThan(1088 / 2)
    })
    it('Vauriella is the largest marked tip: 358 species with 55 other genera; Muscicapidae, Otididae and Timaliidae are one row each', () => {
      const v = levelView(t, idx, { fam: 'Muscicapidae' }, none)!
      expect(v.tips).toBe('genera')
      expect(groups(v).map((r) => `${r.key} ${r.with?.length}`)).toEqual(['Vauriella 55'])
      expect(levelView(t, idx, { fam: 'Muscicapidae', genus: 'Vauriella' }, none)!.rows).toHaveLength(358)
      const biggest = levels.flatMap((l) => groups(l).filter((r) => r.with)).sort((a, b) => b.total - a.total)[0]
      expect(biggest.key).toBe('Vauriella')
      // Asked for, their genera are one row each; opened, a family of one row opens past it, on its species (round 6;
      // Muscicapidae's 358 species are over MAX_TIPS, so it stays on its one row).
      for (const f of ['Otididae', 'Timaliidae']) {
        expect(groups(levelView(t, idx, { fam: f }, none, false, 'genera')!), f).toHaveLength(1)
        expect(levelView(t, idx, { fam: f }, none)!.tips, f).toBe('species')
      }
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

// Yusuf, 2026-11-21: on the Fan, neighbouring tips' stickers overlapped off the axes. They are drawn upright while
// fitRound spaced their boxes as if turned with the labels; it now keeps upright boxes apart too.
describe('upright stickers on the Fan and Radial', () => {
  const apart = (fit: RoundFit, spans: LabelSpan[], shape: FanShape, wrap: boolean) => {
    const n = spans.length, rc = fit.R + SCREEN_SIZES.dot + fit.px * LABEL_GAP + fit.st / 2
    const box = (i: number) => {
      const a = fanAngle(i + 0.5, n, shape, fit.open ?? 0), ar = spans[i].ar ?? 1
      const [w, h] = ar >= 1 ? [fit.st, fit.st / ar] : [fit.st * ar, fit.st]
      return { x: rc * Math.cos(a), y: -rc * Math.sin(a), w, h }
    }
    for (let i = 0; i < n - (wrap ? 0 : 1); i++) {
      const p = box(i), q = box((i + 1) % n)
      const ok = Math.abs(p.x - q.x) >= (p.w + q.w) / 2 - 1e-6 || Math.abs(p.y - q.y) >= (p.h + q.h) / 2 - 1e-6
      expect(ok, `tips ${i} and ${i + 1}`).toBe(true)
    }
  }
  for (const ar of [1, 1.6, 0.6]) {
    it(`no two neighbours' stickers overlap at any angle (aspect ${ar})`, () => {
      const spans: LabelSpan[] = Array.from({ length: 120 }, () => ({ name: 5, count: 0, on: true, ar }))
      const fan = fitRound(spans, 'fan', { w: 4000 })!
      apart(fan, spans, 'fan', false)
      const circle = fitRound(spans, 'circle', { w: 4000 })!
      apart(circle, spans, 'circle', true)
    })
  }
  it('tips with no sticker are spaced as before', () => {
    const plain: LabelSpan[] = Array.from({ length: 120 }, () => ({ name: 5, count: 0, on: true }))
    const square = plain.map((sp) => ({ ...sp, ar: 1 }))
    const a = fitRound(plain, 'fan', { w: 4000 })!, b = fitRound(square, 'fan', { w: 4000 })!
    // 120 tips need more than FAN_R_MAX, so the radius is what the stickers need: a box apart, or more once upright.
    expect(a.R).toBeCloseTo(a.st / (Math.PI / 120) - SCREEN_SIZES.dot - a.px * LABEL_GAP, 3)
    expect(b.R).toBeGreaterThan(a.R * 1.3)
  })
})
