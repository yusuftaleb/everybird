// The comparison's diagram, the pure geometry, for every count of lists (CompareView and compare-image.ts draw it):
// - two lists: two circles, the first list and the other (only the first, both, only the other);
// - three: three circles, all seven regions;
// - four to six: a ring of equal circles (the bars beside it give the lists' sizes), their centres evenly round the
//   middle in list order, the first at the top, RING of the radius out, so every circle covers the middle (the birds on
//   every list) and overlaps its neighbours. A ring draws every run of neighbours (one list, two neighbours, three in a
//   row, …, all), and only those: 13 of 4 lists' 15 combinations, 21 of 5 lists' 31, 31 of 6 lists' 63 (regionMasks).
//   Circles can't do better; the other combinations' birds are counted (unshownCount) and reached through the chips.
// Two and three circles' sizes follow the lists (radius ∝ √ species) within limits, so a small list stays readable.
// Each region has a spot: a point well inside it and the room through it, measured on the drawing itself; numberSize
// gives the largest number that fits there (0: none fits, the region shows its number elsewhere). With `names`, each
// circle's name gets a box outside its edge, away from the middle, and the drawing shrinks to keep them in the box.
// Pure, no DOM.

export type Circle = { cx: number; cy: number; r: number }
/** A region: `mask` (bit i: list i) and where its number goes (x, y), with the room across (w) and down (h) through it. */
export type Spot = { mask: number; x: number; y: number; w: number; h: number }
export type Box = { x: number; y: number; w: number; h: number }
export type Diagram = {
  kind: 'two' | 'three' | 'ring'
  /** One circle per list, in list order. */
  circles: Circle[]
  /** One per region the drawing has, in regionMasks order. */
  spots: Spot[]
  /** With `names`: each list's name box, outside its circle. */
  names?: Box[]
}
/** The names' room: each name's width (in list order), the line's height, the gap to the circle's edge. */
export type Names = { w: readonly number[]; h: number; gap: number }

/** A circle's radius never drops under this share of the biggest one's, so a 50-bird list still reads. */
export const R_MIN = 0.6
/** Two circles: the overlap's depth as a share of the smaller radius, from OVERLAP_MIN (few shared birds) to
 *  OVERLAP_MAX (the smaller list all shared); with no shared bird, a GAP between them, room for the "0". */
export const OVERLAP_MIN = 0.55
export const OVERLAP_MAX = 1.3
export const GAP = 0.5
/** Three circles: each centre this share of its radius from the middle, so all seven regions always have room. */
const SPREAD = 0.6

const inside = (c: Circle, x: number, y: number) => (x - c.cx) ** 2 + (y - c.cy) ** 2 < c.r ** 2

/** The mask of the region holding (x, y): the circles around it. */
export function maskAt(d: Pick<Diagram, 'circles'>, x: number, y: number): number {
  return d.circles.reduce((m, c, i) => (inside(c, x, y) ? m | (1 << i) : m), 0)
}

/** Whether a w × h box centred at (x, y) lies in one region, the one at its centre (its edge sampled every few units;
 *  the regions are bounded by circles far bigger than a number, so no edge slips between two samples). */
export function fitsAt(d: Pick<Diagram, 'circles'>, x: number, y: number, w: number, h: number): boolean {
  const m = maskAt(d, x, y), K = 16
  for (let k = 0; k <= K; k++) {
    const a = x - w / 2 + (w * k) / K, b = y - h / 2 + (h * k) / K
    if (maskAt(d, a, y - h / 2) !== m || maskAt(d, a, y + h / 2) !== m || maskAt(d, x - w / 2, b) !== m || maskAt(d, x + w / 2, b) !== m) return false
  }
  return true
}

/** A number's box at `px` for `len` characters of a mono face (0.6em a character, the digits' height 0.8em), with
 *  `pad` round it. */
export const numberBox = (px: number, len: number, pad = 2) => ({ w: 0.6 * px * len + pad, h: 0.8 * px + pad })
/** The largest size, from `max` down to `min` in whole units, at which a number `len` characters long fits its spot's
 *  region; 0 when none does. */
export function numberSize(d: Pick<Diagram, 'circles'>, s: Spot, len: number, max: number, min: number): number {
  for (let px = Math.floor(max); px >= min; px--) {
    const b = numberBox(px, len)
    if (b.w <= s.w && b.h <= s.h && fitsAt(d, s.x, s.y, b.w, b.h)) return px
  }
  return 0
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

/** A region's seed: where its spot is measured from; `pole` keeps that point (else it is centred in the room across, then
 *  down); `pred` is the region when it isn't a combination of circles (two lists sharing no bird: the gap). */
type Seed = { mask: number; x: number; y: number; pred?: (x: number, y: number) => boolean; pole?: boolean }
/** The drawing at unit scale, with each circle's direction for its name (away from the middle). */
type Unit = { kind: Diagram['kind']; circles: Circle[]; seeds: Seed[]; dirs: readonly (readonly number[])[] }

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
    // The names above the circles, each leaning outward.
    dirs: [[-0.6, -0.8], [0.6, -0.8]],
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
  return { kind: 'three', circles, seeds, dirs: DIRS3 }
}

/** A ring: the circles' centres this share of their radius from the middle. Measured (2026-11-21) for 4, 5 and 6
 *  lists by the largest number box each region holds: 0.6 gives the smallest region the most room (0.20, 0.12 and 0.083
 *  of the radius for a box 1.5 times as wide as tall) and keeps the rest the most even (4 lists: one list, two neighbours and
 *  the middle all about 0.44 to 0.49). Under 1, so every circle covers the middle. */
export const RING = 0.6

/** Every run of neighbours round a ring of `n` (singles, pairs, … then all `n`): the regions a ring of circles draws,
 *  and the only ones. */
function runs(n: number): number[] {
  const out: number[] = []
  for (let len = 1; len < n; len++) {
    for (let i = 0; i < n; i++) {
      let m = 0
      for (let k = 0; k < len; k++) m |= 1 << ((i + k) % n)
      out.push(m)
    }
  }
  return [...out, (1 << n) - 1]
}

/** The regions the drawing has for `n` lists, in reading order: two lists' three, three lists' seven, a ring's runs of
 *  neighbours (runs). Any other combination has no region. */
export function regionMasks(n: number): number[] {
  return n <= 2 ? [1, 3, 2] : n === 3 ? [1, 2, 4, 3, 5, 6, 7] : runs(n)
}

/** The birds on a combination of lists the drawing has no region for (`counts` by mask, as diagramLayout's). */
export function unshownCount(counts: readonly number[]): number {
  const drawn = new Set(regionMasks(Math.round(Math.log2(counts.length))))
  return counts.reduce((s, v, m) => (m && !drawn.has(m) ? s + v : s), 0)
}

const ringPoles = new Map<number, Seed[]>()
/** Each region's spot in a ring of `n` unit circles: of its 24 points farthest from every circle's edge on a 0.01 grid
 *  (the regions are bounded by circles, so that distance is the room round a point), the one holding the biggest number
 *  box (1.5 times as wide as tall). Once per count of lists. */
function ringSeeds(n: number, circles: Circle[]): Seed[] {
  const known = ringPoles.get(n)
  if (known) return known
  const KEEP = 24
  const best = new Map<number, [number, number, number][]>()
  const L = 1 + RING
  for (let y = -L; y <= L; y += 0.01) {
    for (let x = -L; x <= L; x += 0.01) {
      const m = maskAt({ circles }, x, y)
      if (!m) continue
      const room = Math.min(...circles.map((c) => Math.abs(Math.hypot(x - c.cx, y - c.cy) - c.r)))
      const top = best.get(m) ?? []
      if (top.length < KEEP || room > top[top.length - 1][0]) {
        top.push([room, x, y])
        top.sort((p, q) => q[0] - p[0])
        if (top.length > KEEP) top.pop()
        best.set(m, top)
      }
    }
  }
  const boxAt = (x: number, y: number) => {
    let lo = 0, hi = 1
    for (let i = 0; i < 16; i++) {
      const h = (lo + hi) / 2
      if (fitsAt({ circles }, x, y, 1.5 * h, h)) lo = h
      else hi = h
    }
    return lo
  }
  const seeds = regionMasks(n).map((mask): Seed => {
    let pick = best.get(mask)![0], size = -1
    for (const p of best.get(mask)!) {
      const h = boxAt(p[1], p[2])
      if (h > size) [pick, size] = [p, h]
    }
    return { mask, x: pick[1], y: pick[2], pole: true }
  })
  ringPoles.set(n, seeds)
  return seeds
}

function ring(n: number): Unit {
  const circles = Array.from({ length: n }, (_, i): Circle => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n
    return { cx: RING * Math.cos(a), cy: RING * Math.sin(a), r: 1 }
  })
  return { kind: 'ring', circles, seeds: ringSeeds(n, circles), dirs: circles.map((c) => [c.cx / RING, c.cy / RING]) }
}

/** A name's box (top left, width, height) outside circle `c` in the direction (ux, uy): as near as `gap` allows, the
 *  box reaching away from the circle (centred on the direction's line, as a tooltip past a point). */
function nameBox(c: Circle, [ux, uy]: readonly number[], w: number, h: number, gap: number): Box {
  const need = c.r + gap
  let t = need, box: Box = { x: 0, y: 0, w, h }
  for (let i = 0; i < 40; i++) {
    box = { x: c.cx + t * ux + ((ux - 1) * w) / 2, y: c.cy + t * uy + ((uy - 1) * h) / 2, w, h }
    const dist = Math.hypot(Math.max(box.x - c.cx, 0, c.cx - box.x - w), Math.max(box.y - c.cy, 0, c.cy - box.y - h))
    if (dist >= need - 1e-6) break
    t += need - dist
  }
  return box
}

/**
 * The diagram for `counts` (how many species each combination of lists holds, indexed by mask: compare.ts
 * regionCounts; its length 2^lists), as big as fits `box` (with `names`, their boxes too), centred in it.
 */
export function diagramLayout(counts: readonly number[], box: Box, names?: Names): Diagram {
  const n = Math.round(Math.log2(counts.length))
  const sizes = Array.from({ length: n }, (_, i) => counts.reduce((s, v, k) => (k & (1 << i) ? s + v : s), 0))
  const u = n <= 2 ? twoCircles(counts) : n === 3 ? threeCircles(sizes) : ring(n)

  // The drawing at scale s about the unit origin: its circles, its names' boxes, and its bounds.
  const at = (s: number) => {
    const circles = u.circles.map((c): Circle => ({ cx: c.cx * s, cy: c.cy * s, r: c.r * s }))
    const boxes = names ? circles.map((c, i) => nameBox(c, u.dirs[i], names.w[i] ?? 0, names.h, names.gap)) : []
    const all = [...circles.map((c) => ({ x: c.cx - c.r, y: c.cy - c.r, w: 2 * c.r, h: 2 * c.r })), ...boxes]
    const x0 = Math.min(...all.map((b) => b.x)), y0 = Math.min(...all.map((b) => b.y))
    return { circles, boxes, x0, y0, w: Math.max(...all.map((b) => b.x + b.w)) - x0, h: Math.max(...all.map((b) => b.y + b.h)) - y0 }
  }
  // The largest scale that fits: the circles alone fix it at once; with the names' fixed boxes, by halving under that.
  const x0 = Math.min(...u.circles.map((c) => c.cx - c.r)), x1 = Math.max(...u.circles.map((c) => c.cx + c.r))
  const y0 = Math.min(...u.circles.map((c) => c.cy - c.r)), y1 = Math.max(...u.circles.map((c) => c.cy + c.r))
  let s = Math.min(box.w / (x1 - x0), box.h / (y1 - y0))
  if (names) {
    let lo = 0, hi = s
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2, f = at(mid)
      if (f.w <= box.w && f.h <= box.h) lo = mid
      else hi = mid
    }
    s = lo
  }
  const f = at(s)
  const ox = box.x + (box.w - f.w) / 2 - f.x0, oy = box.y + (box.h - f.h) / 2 - f.y0
  const d: Diagram = {
    kind: u.kind,
    circles: f.circles.map((c) => ({ cx: c.cx + ox, cy: c.cy + oy, r: c.r })),
    spots: [],
    ...(names ? { names: f.boxes.map((b) => ({ ...b, x: b.x + ox, y: b.y + oy })) } : {}),
  }

  // Each region's room, measured across and then down through its seed (centred there, but for a ring's poles).
  const step = Math.max(0.5, s / 200)
  d.spots = u.seeds.map(({ mask, x: ux, y: uy, pred: up, pole }) => {
    const pred = up ? (x: number, y: number) => up((x - ox) / s, (y - oy) / s) : (x: number, y: number) => maskAt(d, x, y) === mask
    let x = ox + ux * s, y = oy + uy * s
    const left = run(pred, x, y, -1, 0, step), right = run(pred, x, y, 1, 0, step)
    if (!pole) x += (right - left) / 2
    const top = run(pred, x, y, 0, -1, step), down = run(pred, x, y, 0, 1, step)
    if (!pole) y += (down - top) / 2
    return { mask, x, y, w: left + right, h: top + down }
  })
  return d
}
