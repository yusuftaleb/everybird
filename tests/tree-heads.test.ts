// Round 6, item 10: the Tree's headings at the rank right above the tips (levels.ts), the named nodes where a group
// begins (nodes.ts), checked against drawTree's own path on the shipped tree, and the headings' plain look (tree.css).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { polar } from '@/lib/tree/fan'
import { ROW_H, levelView, type LevelView, type TipRank, type TreeLevel } from '@/lib/tree/levels'
import { NODE_GAP, NODE_PAD, rowNodeLabels, roundNodeLabels, type NodeLabel } from '@/lib/tree/nodes'
import { drawTree, parseNewick, type TreeFile } from '@/lib/tree/tree'

const sp = (code: string, sci: string, ord: string, fam: string, to: number): SpeciesRow =>
  ({ code, com: code.toUpperCase(), sci, ord, fam, famCom: `${fam} birds`, to, g: 10, gSrc: 'avonet', st: true, ar: 1, q: true })
const species = buildSpeciesIndex([
  sp('a1', 'Aa one', 'O1', 'Fa', 1), sp('a2', 'Aa two', 'O1', 'Fa', 2), sp('a3', 'Ab three', 'O1', 'Fa', 3),
  sp('b1', 'Bb one', 'O2', 'Fb', 5), sp('b2', 'Bb two', 'O2', 'Fb', 6),
])
const tree = parseNewick('(((a1:1,a3:1):2,a2:3):7,(b1:4,b2:4):6);')
const heads = (v: LevelView) => v.rows.flatMap((r) => (r.kind === 'head' ? [r.parts.map((p) => `${p.rank}:${p.key}`).join(' · ')] : []))
const at = (level: TreeLevel, rank: TipRank) => levelView(tree, species, level, new Set(['a1']), false, rank)!

describe('the headings: the rank right above the tips, after the higher ranks that change there', () => {
  it('All birds: families under their orders; genera under their families, the order named where it changes too', () => {
    expect(heads(at({}, 'families'))).toEqual(['orders:O1', 'orders:O2'])
    expect(heads(at({}, 'genera'))).toEqual(['orders:O1 · families:Fa', 'orders:O2 · families:Fb'])
    // Species under their genera, the family and order with them where they change; a genus the tree splits, twice.
    expect(heads(at({}, 'species'))).toEqual(['orders:O1 · families:Fa · genera:Aa', 'genera:Ab', 'genera:Aa', 'orders:O2 · families:Fb · genera:Bb'])
    expect(heads(at({}, 'orders'))).toEqual([])
  })
  it('a rank the open branch fixes is never a heading', () => {
    // An order: its families' genera under the family, its species under their genera (the family named where it changes).
    expect(heads(at({ ord: 'O1' }, 'genera'))).toEqual(['families:Fa'])
    expect(heads(at({ ord: 'O1' }, 'species'))).toEqual(['families:Fa · genera:Aa', 'genera:Ab', 'genera:Aa'])
    expect(heads(at({ ord: 'O1' }, 'families'))).toEqual([])
    // A family: its genera need none (the family is open); its species go under their genera.
    expect(heads(at({ ord: 'O1', fam: 'Fa' }, 'genera'))).toEqual([])
    expect(heads(at({ ord: 'O1', fam: 'Fa' }, 'species'))).toEqual(['genera:Aa', 'genera:Ab', 'genera:Aa'])
    // A genus: nothing above its species is open to name.
    expect(heads(at({ ord: 'O2', fam: 'Fb', genus: 'Bb' }, 'species'))).toEqual([])
  })
  it('the groups: each heading\'s runs of tips, highest rank first, for the named nodes', () => {
    expect(at({}, 'species').groups.map((g) => `${g.rank}:${g.key} ${g.first}-${g.last}`)).toEqual(
      ['orders:O1 0-2', 'orders:O2 3-4', 'families:Fa 0-2', 'families:Fb 3-4', 'genera:Aa 0-0', 'genera:Ab 1-1', 'genera:Aa 2-2', 'genera:Bb 3-4'])
  })
})

describe('the named nodes: along the stem into the node, where nothing is touched', () => {
  // ((a,b) 1 Ma, (c,d) 2 Ma), the root 5 Ma; 500px wide, the tips 44px apart from 22.
  const t = parseNewick('((a:1,b:1):4,(c:2,d:2):3);')
  const root = levelOf(t)
  const yOf = (i: number) => 22 + 44 * i
  const base = { yOf, width: 500, height: 176, measure: () => 30, h: 13 }
  it('Rectangular: the node at the group\'s most recent common ancestor, the label right-aligned before it, above its stem', () => {
    const [ab, cd] = rowNodeLabels(root, [{ text: 'AB', first: 0, last: 1 }, { text: 'CD', first: 2, last: 3 }], base)
    // AB's node: 1 Ma of 5 is x 400; midway between its tips, y 44. The label ends NODE_GAP before it, NODE_GAP + h/2 above.
    expect(ab).toMatchObject({ text: 'AB', node: [400, 44], x: 400 - NODE_GAP - 15, y: 44 - NODE_GAP - 6.5, rot: 0 })
    expect(cd).toMatchObject({ text: 'CD', node: [300, 132], x: 300 - NODE_GAP - 15, y: 132 - NODE_GAP - 6.5 })
  })
  it('none for the root (no stem), a group that is not one node\'s tips, a single tip, or a name longer than its stem', () => {
    expect(rowNodeLabels(root, [{ text: 'ALL', first: 0, last: 3 }, { text: 'BC', first: 1, last: 2 }, { text: 'A', first: 0, last: 0 }], base)).toEqual([])
    expect(rowNodeLabels(root, [{ text: 'AB', first: 0, last: 1 }], { ...base, measure: () => 400 })).toEqual([])
  })
  it('a branch over the stem moves the label under it; one under it too, and it is left out', () => {
    // x's branch runs at y 10, just over the stem into (a,b) at y 28: the label goes under the stem.
    const t2 = parseNewick('(x:4,(a:1,b:1):3);')
    const r2 = levelOf(t2)
    const tight = { yOf: (i: number) => 10 + 12 * i, width: 500, height: 50, measure: () => 30, h: 13 }
    const [ab] = rowNodeLabels(r2, [{ text: 'AB', first: 1, last: 2 }], tight)
    expect(ab).toMatchObject({ node: [375, 28], y: 28 + NODE_GAP + 6.5 })
    // With no room under it either (the drawing ends at 40), none.
    expect(rowNodeLabels(r2, [{ text: 'AB', first: 1, last: 2 }], { ...tight, height: 40 })).toEqual([])
  })
  it('Fan and Radial: along the node\'s radius, upright, inside the tips\' ring', () => {
    const box = { cx: 300, cy: 300, R: 250, shape: 'circle' as const }
    const labels = roundNodeLabels(root, [{ text: 'AB', first: 0, last: 1 }, { text: 'CD', first: 2, last: 3 }], box, { n: 4, measure: () => 30, h: 13 })
    expect(labels.length).toBeGreaterThan(0)
    for (const l of labels) {
      expect(Math.abs(l.rot)).toBeLessThanOrEqual(90.01)
      for (const [x, y] of corners(l)) expect(Math.hypot(x - 300, y - 300)).toBeLessThan(250)
    }
    // AB's node: 1 Ma of 5 is 4/5 of the radius, at the angle midway between its two tips.
    const angle = (y: number) => Math.PI / 2 - (y / 4) * 2 * Math.PI
    const [nx, ny] = polar(box, 200, (angle(0.5) + angle(1.5)) / 2)
    expect(labels.find((l) => l.text === 'AB')!.node.map((v) => +v.toFixed(3))).toEqual([+nx.toFixed(3), +ny.toFixed(3)])
  })
})

describe('on the shipped tree: no label over a branch (drawTree\'s own path), another label, or past the drawing', () => {
  const file = JSON.parse(readFileSync(resolve(__dirname, '../public/data/tree.v1.json'), 'utf8')) as TreeFile
  const shipped = JSON.parse(readFileSync(resolve(__dirname, '../public/data/species.v1.json'), 'utf8')) as { species: SpeciesRow[] }
  const big = parseNewick(file.newick, file.taxOnly)
  const idx = buildSpeciesIndex(shipped.species)
  const on = new Set(shipped.species.filter((_, i) => i % 3 === 0).map((r) => r.code))
  for (const [name, level, rank] of [['All birds, families', {}, 'families'], ['All birds, genera', {}, 'genera'], ['Woodpeckers, genera', { ord: 'Piciformes' }, 'genera']] as const) {
    it(name, () => {
      const v = levelView(big, idx, level, on, false, rank)!
      const tips = v.rows.filter((r) => r.kind !== 'head')
      const yOf = (i: number) => tips[i].top + ROW_H / 2
      const width = 640
      const groups = v.groups.map((g) => ({ text: g.key, first: g.first, last: g.last }))
      // The labels' width: 7px a character at 11px mono, upper case and tracked.
      const labels = rowNodeLabels(v.root!, groups, { yOf, width, height: v.height, measure: (s) => s.length * 7.3, h: 13 })
      expect(labels.length).toBeGreaterThan(0)
      const d = drawTree(v.root!, () => true, yOf, v.stem, () => false, width)
      const pts = pathPoints(d.seen + d.unseen + d.seenDot + d.unseenDot)
      for (const l of labels) {
        const c = corners(l)
        for (const [x, y] of c) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(width); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(v.height) }
        const hit = pts.find(([x, y]) => Math.abs(x - l.x) < l.w / 2 + NODE_PAD - 0.5 && Math.abs(y - l.y) < l.h / 2 + NODE_PAD - 0.5)
        expect(hit, `${l.text} over a branch at ${hit}`).toBeUndefined()
      }
      for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i], b = labels[j]
        expect(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2, `${a.text} over ${b.text}`).toBe(true)
      }
    }, 30_000)
  }
})

describe('the headings look plain', () => {
  const css = readFileSync(resolve(__dirname, '../src/components/tree/tree.css'), 'utf8')
  it('no fill, no highlight and no selection on a heading; the named nodes in its Muted mono', () => {
    const rule = css.match(/\n\.eb-tree-heading \{([^}]*)\}/)![1]
    expect(rule).toMatch(/background: none/)
    expect(rule).toMatch(/user-select: none/)
    expect(rule).toMatch(/color: var\(--muted\)/)
    // No other rule gives a heading, or anything in it, a fill, a shadow or an outline.
    for (const [, sel, body] of css.matchAll(/([^{}]*\.eb-tree-heading[^{}]*)\{([^}]*)\}/g)) {
      expect(`${sel}{${body}}`).not.toMatch(/background(-color)?: (?!none)|box-shadow|outline/)
    }
    expect(css).toMatch(/\.eb-tree-node text \{[^}]*fill: var\(--muted\)[^}]*font-family: var\(--font-mono\)/)
    // The heading's markup is text: no <mark> in TreeView.
    expect(readFileSync(resolve(__dirname, '../src/components/tree/TreeView.tsx'), 'utf8')).not.toMatch(/<mark\b/)
  })
})

/** A whole tree as one clade (cladeTree with every tip its own key). */
function levelOf(t: ReturnType<typeof parseNewick>) {
  const rows = buildSpeciesIndex([...t.tipOf.keys()].map((c, i) => sp(c, `${c.toUpperCase()} x`, 'O', 'F', i)))
  return levelView(t, rows, { ord: 'O', fam: 'F' }, new Set(), false, 'species')!.root!
}
/** A label's four corners. */
function corners(l: NodeLabel): [number, number][] {
  const a = (l.rot * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a)
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([p, q]) => [l.x + (p * l.w) / 2 * ux - (q * l.h) / 2 * uy, l.y + (p * l.w) / 2 * uy + (q * l.h) / 2 * ux])
}
/** Points along drawTree's path (M, V, H, Q only), 1px apart. */
function pathPoints(d: string): [number, number][] {
  const out: [number, number][] = []
  let x = 0, y = 0
  const to = (nx: number, ny: number) => { const n = Math.max(1, Math.ceil(Math.hypot(nx - x, ny - y))); for (let i = 0; i <= n; i++) out.push([x + ((nx - x) * i) / n, y + ((ny - y) * i) / n]); x = nx; y = ny }
  for (const [, c, args] of d.matchAll(/([MVHQ])([^MVHQ]*)/g)) {
    const v = args.trim().split(/[\s,]+/).map(Number)
    if (c === 'M') { x = v[0]; y = v[1] } else if (c === 'V') to(x, v[0]); else if (c === 'H') to(v[0], y)
    else { const [cx, cy, ex, ey] = v, sx = x, sy = y; for (let i = 1; i <= 8; i++) { const t = i / 8, u = 1 - t; to(u * u * sx + 2 * u * t * cx + t * t * ex, u * u * sy + 2 * u * t * cy + t * t * ey) } }
  }
  return out
}
