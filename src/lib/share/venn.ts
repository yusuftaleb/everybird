// The comparison's diagram, the pure geometry, for every count of lists (compare-image.ts draws it):
// - two lists: two circles, the first list and the other (only the first, both, only the other);
// - three: three circles, all seven regions numbered;
// - four to six: a flower, a petal per list around a shared centre: the centre holds the birds on every list, each
//   petal's outer part the birds only that list has.
// Circle sizes follow the lists (radius ∝ √ species) within limits, so a small list stays readable. Each numbered
// region has a spot: its middle and the room around it there, measured on the drawing itself. Pure, no DOM.

export type Circle = { cx: number; cy: number; r: number }
/** A numbered region: `mask` (bit i: list i) and where its number goes, its middle (x, y) and the room there. */
export type Spot = { mask: number; x: number; y: number; w: number; h: number }
export type Diagram = {
  kind: 'two' | 'three' | 'flower'
  /** One circle per list, in list order. */
  circles: Circle[]
  /** The flower's centre, drawn over the petals' inner ends. */
  core?: Circle
  spots: Spot[]
}
export type Box = { x: number; y: number; w: number; h: number }

/** A circle's radius never drops under this share of the biggest one's, so a 50-bird list still reads. */
export const R_MIN = 0.6
/** Two circles: the overlap's depth as a share of the smaller radius, from OVERLAP_MIN (few shared birds) to
 *  OVERLAP_MAX (the smaller list all shared); with no shared bird, a GAP between them, room for the "0". */
export const OVERLAP_MIN = 0.55
export const OVERLAP_MAX = 1.3
export const GAP = 0.5
/** Three circles: each centre this share of its radius from the middle, so all seven regions always have room. */
export const SPREAD = 0.6
/** The flower: each petal tucks this share of its radius under the centre; neighbouring petals keep PETAL_GAP (a share
 *  of the biggest radius) apart; the centre's radius is at least CORE_MIN. */
export const DIP = 0.4
export const PETAL_GAP = 0.12
export const CORE_MIN = 0.7

const inside = (c: Circle, x: number, y: number) => (x - c.cx) ** 2 + (y - c.cy) ** 2 < c.r ** 2

/** The mask of the region holding (x, y): the circles around it; inside the flower's centre, every list. */
export function maskAt(d: Pick<Diagram, 'circles' | 'core'>, x: number, y: number): number {
  if (d.core && inside(d.core, x, y)) return (1 << d.circles.length) - 1
  return d.circles.reduce((m, c, i) => (inside(c, x, y) ? m | (1 << i) : m), 0)
}

/** How far along (dx, dy) from (x, y) `pred` stays true, in steps of `step`. */
function run(pred: (x: number, y: number) => boolean, x: number, y: number, dx: number, dy: number, step: number): number {
  let t = 0
  while (t < 1e4 && pred(x + (t + step) * dx, y + (t + step) * dy)) t += step
  return t
}

/** Each list's share of the biggest circle's radius: √ of its size, at least R_MIN. */
function rels(sizes: readonly number[]): number[] {
  const big = Math.max(1, ...sizes)
  return sizes.map((v) => Math.max(R_MIN, Math.sqrt(v / big)))
}

/** Along the unit direction (dx, dy) from the middle (0, 0), where circle `c` (holding the middle) ends. */
function reach(c: Circle, dx: number, dy: number): number {
  const dot = dx * c.cx + dy * c.cy
  return dot + Math.sqrt(Math.max(0, c.r * c.r - c.cx * c.cx - c.cy * c.cy + dot * dot))
}

type Seed = { mask: number; x: number; y: number; pred?: (x: number, y: number) => boolean }
type Unit = { kind: Diagram['kind']; circles: Circle[]; core?: Circle; seeds: Seed[] }

function twoCircles(counts: readonly number[]): Unit {
  const first = counts[1], both = counts[3], other = counts[2]
  const [rA, rB] = rels([first + both, other + both])
  const rs = Math.min(rA, rB)
  const share = both > 0 ? both / Math.max(1, Math.min(first, other) + both) : 0
  const depth = both > 0 ? rs * (OVERLAP_MIN + (OVERLAP_MAX - OVERLAP_MIN) * share) : -GAP * rs
  const a: Circle = { cx: 0, cy: 0, r: rA }
  const b: Circle = { cx: rA + rB - depth, cy: 0, r: rB }
  // The regions' spans on the centre line: the overlap (or the gap) between the inner edges, each crescent outside it.
  const lo = Math.min(a.r, b.cx - b.r), hi = Math.max(a.r, b.cx - b.r)
  return {
    kind: 'two',
    circles: [a, b],
    seeds: [
      { mask: 1, x: (-a.r + lo) / 2, y: 0 },
      // No shared bird: the "0" sits in the gap between the circles.
      { mask: 3, x: (lo + hi) / 2, y: 0, ...(both > 0 ? {} : { pred: (x: number, y: number) => x > lo && x < hi && Math.abs(y) < rs }) },
      { mask: 2, x: (hi + b.cx + b.r) / 2, y: 0 },
    ],
  }
}

/** The three directions from the middle: the first list up-left, the second up-right, the third down. */
const DIRS3: [number, number][] = [[-Math.sqrt(3) / 2, -0.5], [Math.sqrt(3) / 2, -0.5], [0, 1]]

function threeCircles(sizes: readonly number[]): Unit {
  const r = rels(sizes)
  const circles = DIRS3.map(([dx, dy], i): Circle => ({ cx: SPREAD * r[i] * dx, cy: SPREAD * r[i] * dy, r: r[i] }))
  const seeds: Seed[] = [0, 1, 2].map((i) => {
    // A list's own birds: out along its direction, past where the other two circles end.
    const [dx, dy] = DIRS3[i]
    const from = Math.max(...circles.map((c, j) => (j === i ? 0 : reach(c, dx, dy))))
    const t = (from + reach(circles[i], dx, dy)) / 2
    return { mask: 1 << i, x: t * dx, y: t * dy }
  })
  for (const k of [2, 1, 0]) {
    // Two lists' birds, not the third's: out away from the third, past its edge, inside the other two.
    const [dx, dy] = [-DIRS3[k][0], -DIRS3[k][1]]
    const from = reach(circles[k], dx, dy)
    const to = Math.min(...circles.map((c, j) => (j === k ? Infinity : reach(c, dx, dy))))
    const t = (from + to) / 2
    seeds.push({ mask: 7 & ~(1 << k), x: t * dx, y: t * dy })
  }
  seeds.push({ mask: 7, x: 0, y: 0 })
  return { kind: 'three', circles, seeds }
}

function flower(sizes: readonly number[]): Unit {
  const n = sizes.length
  const r = rels(sizes)
  const dirs = r.map((_, i) => [Math.cos(-Math.PI / 2 + (2 * Math.PI * i) / n), Math.sin(-Math.PI / 2 + (2 * Math.PI * i) / n)])
  const place = (rc: number) => r.map((ri, i): Circle => ({ cx: (rc + (1 - DIP) * ri) * dirs[i][0], cy: (rc + (1 - DIP) * ri) * dirs[i][1], r: ri }))
  // The smallest centre that keeps every pair of petals apart.
  let rc = CORE_MIN
  const apart = (cs: Circle[]) => cs.every((a, i) => cs.every((b, j) => j <= i || Math.hypot(a.cx - b.cx, a.cy - b.cy) >= a.r + b.r + PETAL_GAP))
  while (!apart(place(rc))) rc += 0.005
  const circles = place(rc)
  const core: Circle = { cx: 0, cy: 0, r: rc }
  const full = (1 << n) - 1
  return {
    kind: 'flower',
    circles,
    core,
    seeds: [
      { mask: full, x: 0, y: 0 },
      ...circles.map((c, i): Seed => {
        const t = (rc + Math.hypot(c.cx, c.cy) + c.r) / 2
        return { mask: 1 << i, x: t * dirs[i][0], y: t * dirs[i][1] }
      }),
    ],
  }
}

/**
 * The diagram for `counts` (how many species each combination of lists holds, indexed by mask: compare.ts
 * regionCounts; its length 2^lists), as big as fits `box`, centred in it.
 */
export function diagramLayout(counts: readonly number[], box: Box): Diagram {
  const n = Math.round(Math.log2(counts.length))
  const sizes = Array.from({ length: n }, (_, i) => counts.reduce((s, v, k) => (k & (1 << i) ? s + v : s), 0))
  const u = n <= 2 ? twoCircles(counts) : n === 3 ? threeCircles(sizes) : flower(sizes)

  // Fit the drawing's bounds into the box.
  const all = u.core ? [...u.circles, u.core] : u.circles
  const x0 = Math.min(...all.map((c) => c.cx - c.r)), x1 = Math.max(...all.map((c) => c.cx + c.r))
  const y0 = Math.min(...all.map((c) => c.cy - c.r)), y1 = Math.max(...all.map((c) => c.cy + c.r))
  const s = Math.min(box.w / (x1 - x0), box.h / (y1 - y0))
  const ox = box.x + (box.w - (x1 - x0) * s) / 2 - x0 * s, oy = box.y + (box.h - (y1 - y0) * s) / 2 - y0 * s
  const map = (c: Circle): Circle => ({ cx: ox + c.cx * s, cy: oy + c.cy * s, r: c.r * s })
  const d: Diagram = { kind: u.kind, circles: u.circles.map(map), ...(u.core ? { core: map(u.core) } : {}), spots: [] }

  // Each region's room, measured across and then down through its middle; the number goes in the middle of both.
  const step = Math.max(0.5, s / 200)
  d.spots = u.seeds.map(({ mask, x: ux, y: uy, pred: up }) => {
    const pred = up ? (x: number, y: number) => up((x - ox) / s, (y - oy) / s) : (x: number, y: number) => maskAt(d, x, y) === mask
    let x = ox + ux * s, y = oy + uy * s
    const left = run(pred, x, y, -1, 0, step), right = run(pred, x, y, 1, 0, step)
    x += (right - left) / 2
    const top = run(pred, x, y, 0, -1, step), down = run(pred, x, y, 0, 1, step)
    y += (down - top) / 2
    return { mask, x, y, w: left + right, h: top + down }
  })
  return d
}
