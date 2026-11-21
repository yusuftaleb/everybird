// The named nodes (round 6, item 10): where a group the headings name (an order, a family, a genus; levels.ts
// `groups`) begins in the drawing, at its most recent common ancestor, a small node and the group's name, in the
// headings' Muted mono. The placement rule: the label rides its own stem. It lies along the branch leading into the
// node, ending NODE_GAP before the node, on one side of it (above the branch in Rectangular, then below; either side
// along the radius on the Fan and Radial), and is kept only when its box, padded NODE_PAD, touches no branch, no other
// label and stays inside the drawing (left of the tips' dots in Rectangular, inside the tips' ring on the Fan and
// Radial, above the Fan's baseline, clear of any point in `avoid`, the Radial's ages). Higher ranks are placed first,
// so an order's name wins over a family's. A group that is not exactly one node's leaves (split by the tree), a group of
// one tip, or the root (no stem to ride) gets none, nor does a label that does not fit: the heading still names it.
// Pure: positions in the drawing's own px (drawTree's with a width, drawFan's box).
import { CORNER, branchesOf, isLeaf, type Leaf, type Node } from './tree'
import { fanAngle, polar, type FanBox, type Pt } from './fan'

/** A group to name: its text as drawn and its tips' first and last index (leaf order). */
export type NodeGroup = { text: string; first: number; last: number; latin?: boolean }
/** A placed name: the node's point, the label's centre, its size and its turn (degrees; upright, never upside down). */
export type NodeLabel = { text: string; latin?: boolean; node: Pt; x: number; y: number; w: number; h: number; rot: number }

/** Between the label's end and its node, and between the label and its branch (px). */
export const NODE_GAP = 4
/** The clear margin round a label's box (px). */
export const NODE_PAD = 2
/** How finely branches are sampled for the collision test (px between points). */
const STEP = 2
/** The obstacle grid's cell (px). */
const CELL = 16

type Geom = {
  /** A node's point from its age and its position (a leaf i at `yOf(i)`, as branchesOf). */
  at: (age: number, y: number) => Pt
  /** Each branch as points, `STEP` apart. */
  strokes: (pa: number, py: number, ca: number, cy: number) => Pt[]
  /** Whether a point lies inside the drawing's room for labels. */
  inside: (p: Pt) => boolean
  /** The sides to try, in order: +1 above (Rectangular) or counter-clockwise (round), -1 the other. */
  sides: readonly number[]
}

/** The internal nodes: each one's leaf range, age, position and its parent's age (undefined for the root). */
function nodesOf(root: Node | Leaf, yOf: (i: number) => number): { lo: number; hi: number; age: number; y: number; pa?: number }[] {
  const out: { lo: number; hi: number; age: number; y: number; pa?: number }[] = []
  let row = 0
  const walk = (n: Node | Leaf, pa?: number): [number, number, number] => {
    if (isLeaf(n)) { const i = row++; return [i, i, yOf(i)] }
    const parts = n.kids.map((k) => walk(k, n.age))
    const y = (parts[0][2] + parts[parts.length - 1][2]) / 2
    const lo = parts[0][0], hi = parts[parts.length - 1][1]
    out.push({ lo, hi, age: n.age, y, pa })
    return [lo, hi, y]
  }
  walk(root)
  return out
}

function place(root: Node | Leaf, groups: readonly NodeGroup[], yOf: (i: number) => number, stemAge: number | undefined, geom: Geom, measure: (text: string) => number, h: number, avoid: readonly Pt[]): NodeLabel[] {
  if (isLeaf(root)) return []
  // Every branch, as points in a grid of CELL px, for the collision test.
  const grid = new Map<string, Pt[]>()
  const add = (p: Pt) => { const k = `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`; const c = grid.get(k); if (c) c.push(p); else grid.set(k, [p]) }
  for (const b of branchesOf(root, () => false, yOf, stemAge, () => false).branches) for (const p of geom.strokes(b.pa, b.py, b.ca, b.cy)) add(p)
  for (const p of avoid) add(p)
  const byRange = new Map(nodesOf(root, yOf).map((n) => [`${n.lo}:${n.hi}`, n]))
  const out: NodeLabel[] = []
  for (const g of groups) {
    const n = g.last > g.first ? byRange.get(`${g.first}:${g.last}`) : undefined
    if (!n || n.pa === undefined) continue
    const w = measure(g.text)
    const node = geom.at(n.age, n.y), start = geom.at(n.pa, n.y)
    const len = Math.hypot(node[0] - start[0], node[1] - start[1])
    if (len < w + 2 * NODE_GAP) continue
    const ux = (node[0] - start[0]) / len, uy = (node[1] - start[1]) / len
    const along = NODE_GAP + w / 2
    for (const side of geom.sides) {
      // The perpendicular on `side`: (uy, -ux) is "above" a branch running left to right.
      const off = side * (h / 2 + NODE_GAP)
      const cx = node[0] - ux * along + uy * off, cy = node[1] - uy * along - ux * off
      const hw = w / 2 + NODE_PAD, hh = h / 2 + NODE_PAD
      const corners: Pt[] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([a, b]) => [cx + a * ux - b * uy, cy + a * uy + b * ux])
      if (!corners.every(geom.inside)) continue
      const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1])
      let hit = false
      for (let gx = Math.floor(Math.min(...xs) / CELL); !hit && gx <= Math.floor(Math.max(...xs) / CELL); gx++) {
        for (let gy = Math.floor(Math.min(...ys) / CELL); !hit && gy <= Math.floor(Math.max(...ys) / CELL); gy++) {
          for (const [px, py] of grid.get(`${gx},${gy}`) ?? []) {
            const dx = px - cx, dy = py - cy
            if (Math.abs(dx * ux + dy * uy) <= hw && Math.abs(dy * ux - dx * uy) <= hh) { hit = true; break }
          }
        }
      }
      if (hit) continue
      let rot = (Math.atan2(uy, ux) * 180) / Math.PI
      if (rot > 90.01 || rot < -90.01) rot += rot > 0 ? -180 : 180
      out.push({ text: g.text, ...(g.latin ? { latin: true } : {}), node, x: cx, y: cy, w, h, rot })
      // The label is an obstacle for the next ones: its box, sampled.
      for (let a = -hw; a <= hw; a += STEP) for (let b = -hh; b <= hh; b += STEP) add([cx + a * ux - b * uy, cy + a * uy + b * ux])
      break
    }
  }
  return out
}

/** A quadratic curve's points (the drawing's rounded corners). */
const quad = (a: Pt, c: Pt, b: Pt): Pt[] => {
  const n = Math.max(1, Math.ceil((Math.hypot(c[0] - a[0], c[1] - a[1]) + Math.hypot(b[0] - c[0], b[1] - c[1])) / STEP))
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t
    return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]] as Pt
  })
}
const line = (a: Pt, b: Pt): Pt[] => {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP))
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as Pt)
}

/**
 * The named nodes of Rectangular's drawing: drawTree's, `width` px wide (the tips' dots at its right edge) and
 * `height` tall, its leaves at `yOf(i)`. `measure`: a name's width in px; `h`: the label's line height.
 */
export function rowNodeLabels(root: Node | Leaf, groups: readonly NodeGroup[], o: { yOf: (i: number) => number; width: number; height: number; stemAge?: number; measure: (text: string) => number; h: number }): NodeLabel[] {
  const rootAge = (isLeaf(root) ? o.stemAge : root.age) || 1
  const x = (age: number) => (1 - age / rootAge) * o.width
  const geom: Geom = {
    at: (age, y) => [x(age), y],
    // drawTree's elbow: down (or up) the parent's line, its corner rounded (CORNER at most), then out to the child.
    strokes: (pa, py, ca, cy) => {
      const px = x(pa), end = x(ca), dy = cy - py, s = Math.sign(dy)
      const r = Math.min(CORNER, Math.abs(dy), Math.max(0, end - px))
      return [...line([px, py], [px, cy - s * r]), ...quad([px, cy - s * r], [px, cy], [px + r, cy]), ...line([px + r, cy], [end, cy])]
    },
    // Left of the tips' dots (their hollow circle and a corner's room), within the drawing's height.
    inside: ([px, py]) => px >= 0 && px <= o.width - CORNER && py >= 0 && py <= o.height,
    sides: [1, -1],
  }
  return place(root, groups, o.yOf, o.stemAge, geom, o.measure, o.h, [])
}

/**
 * The named nodes of the Fan's and Radial's drawing (drawFan's, about `box`): along each node's radial stem, inside
 * the tips' ring (`box.R` less the tips' dots), the Fan's above its baseline. `avoid`: points no label may cover (the
 * Radial's ages in its opening).
 */
export function roundNodeLabels(root: Node | Leaf, groups: readonly NodeGroup[], box: FanBox, o: { n: number; stemAge?: number; measure: (text: string) => number; h: number; avoid?: readonly Pt[] }): NodeLabel[] {
  const rootAge = (isLeaf(root) ? o.stemAge : root.age) || 1
  const rad = (age: number) => (1 - age / rootAge) * box.R
  const ang = (y: number) => fanAngle(y, o.n, box.shape, box.open)
  const yOf = (i: number) => i + 0.5
  const geom: Geom = {
    at: (age, y) => polar(box, rad(age), ang(y)),
    strokes: (pa, py, ca, cy) => {
      // drawFan's: along the parent's ring, a rounded join (CORNER at most), then out along the child's radius.
      const rp = rad(pa), rc = rad(ca), ap = ang(py), ac = ang(cy)
      if (rp < 0.5) return line(polar(box, rp, ap), polar(box, rc, ac))
      const r = Math.min(CORNER, rp * Math.abs(ap - ac), Math.max(0, rc - rp))
      const ae = ac + Math.sign(ap - ac) * (r / rp)
      const steps = Math.max(1, Math.ceil((rp * Math.abs(ap - ae)) / STEP))
      const arc = Array.from({ length: steps + 1 }, (_, i) => polar(box, rp, ap + ((ae - ap) * i) / steps))
      return [...arc, ...quad(polar(box, rp, ae), polar(box, rp, ac), polar(box, rp + r, ac)), ...line(polar(box, rp + r, ac), polar(box, rc, ac))]
    },
    inside: ([px, py]) => Math.hypot(px - box.cx, py - box.cy) <= box.R - CORNER && (box.shape === 'circle' || py <= box.cy - NODE_GAP),
    sides: [1, -1],
  }
  return place(root, groups, yOf, o.stemAge, geom, o.measure, o.h, o.avoid ?? [])
}
