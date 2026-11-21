// The collage packer: a TypeScript port of pack(), best_layout() and trim_to_content() from
// framer-site/scripts/lifelist/build_lifelist.py. Runs in a Web Worker and on the server.
//
// Box semantics (what the renderer places): Box = [x, y, w, h] in layout units, on a stage of W x H layout
// units with the origin at its top-left. (x, y) is the top-left corner of the sticker's tile and w x h is its
// size. The tile's long side is base · rel (at least 2; rel from relSizes: painted area follows mass) and its aspect is the mask's (mask.w / mask.h, which
// follows the sticker image's `ar` to within the mask's rounding). Draw the sticker image to fill the box.
// The species count sits at the stage centre (W / 2, H / 2), inside the ellipse collageHole(birds.length, layout)
// (count-box.ts: sized from the shown count's text, so every state's hole fits its own count).
// A filtered state (packBest with `fit`) is packed in the full collage's stage, then its height is trimmed
// symmetrically about the count (fitStage): W is unchanged, H shrinks, every box moves up by the same amount.
import { EXP, EXP_TRUE, GAP, MAXUP, SHAPE_REF } from './constants'
import { NO_HOLE, collageHole, holeArea, holeExtent, rectGap, scaleHole, type Hole } from './count-box'
import { CentreWalk, Grid, SPIRAL_T, captionCellMask, cellMask, coreMask, spiral, spiralFrom, type CaptionRoom, type CellMask } from './grid'
import { MASK, type Mask } from './mask'

/** shape: the painted share of the bird's L x L square (maskShape of its mask when absent; the outline's for no sticker). */
export type PackBird = { id: number; mass: number; mask: Mask; shape?: number }
export type Box = [x: number, y: number, w: number, h: number] // layout units
export type PackResult = { base: number; W: number; H: number; boxes: Map<number, Box> }
/** What the packer reads from a layout: one of LAYOUTS, or an ad hoc frame (share images, packFrame). */
type Layout = {
  W: number; H: number; stretch: number; F: number; minWidth?: number; maxWidth?: number
  minBase?: number; floor?: number; maxH?: number; denseFrom?: number
}

export const DEFAULT_CELL = 2 // layout units per occupancy cell
const MIN_MASS = 0.1 // grams; guards mass ** exp against 0 or bad data
const STEPS = 7 // binary-search steps
export const MAX_BASE = 80 // largest base for a full collage (the reference's search ceiling)
const TRIM_PAD = 8
/** Sets of fewer birds than this are settled dense (see packBest; a filtered one also tries a round spiral). */
export const SMALL_SET = 12
// STEP: smallest growth step. AIM: each jump aims this much past the estimate, so one more search is rarely needed.
const STEP = 1.1, AIM = 1.08, MAX_GROW = 12

/** The mask's set cells over MASK²: the share of the sticker's L x L square (L its long side) that is painted. */
export function maskShape(m: Mask): number {
  let set = 0
  for (let i = 0; i < m.bits.length; i++) { let v = m.bits[i]; while (v) { set += v & 1; v >>= 1 } }
  return set / (MASK * MASK)
}

/**
 * Relative tile long side per bird, so the painted area follows mass: rel = (mass / lightest) ** exp · sqrt(SHAPE_REF /
 * shape). A tile of long side L paints L² · shape, so the painted area ∝ mass ** (2 · exp) whatever the shape: a
 * long-tailed or long-legged bird (little of its square painted) gets a longer tile than an upright compact one of the
 * same mass. A bird of the reference shape (SHAPE_REF) keeps the long side it had when sizes followed the long side, so
 * the lightest such bird is 1 and a list's median rel stays where it was (the base, floors and MAXUP keep meaning).
 */
export function relSizes(birds: PackBird[], exp: number): Map<number, number> {
  const m = (b: PackBird) => (Number.isFinite(b.mass) ? Math.max(MIN_MASS, b.mass) : MIN_MASS) ** exp
  const k = (b: PackBird) => Math.sqrt(SHAPE_REF / Math.max(0.05, b.shape ?? maskShape(b.mask)))
  let lo = Infinity
  for (const b of birds) lo = Math.min(lo, m(b))
  return new Map(birds.map((b) => [b.id, (m(b) / lo) * k(b)]))
}

/** Largest first; ties broken by id, so the order never depends on the input order. */
function placementOrder(birds: PackBird[], rel: Map<number, number>): PackBird[] {
  return [...birds].sort((a, b) => rel.get(b.id)! - rel.get(a.id)! || a.id - b.id)
}

/** An empty grid with the count's hole marked and, for Oval, everything outside the stage's ellipse. */
function blankGrid(W: number, H: number, cell: number, hole: Hole, oval: boolean): Grid {
  const grid = new Grid(W, H, cell)
  grid.markHole(W / 2, H / 2, hole)
  if (oval) grid.markOutsideOval(W, H)
  return grid
}

const MOVES = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const

/**
 * Slide a bird the spiral just placed at `at` (its mask's top-left cell, updated in place) one cell at a time to
 * whichever free neighbouring position (of 8) is nearest the spiral's origin (ox, oy, in cells), measured in the
 * spiral's own scale (sx, sy cells per spiral unit), until none is nearer. The spiral's points lie 13 to 20 layout
 * units apart, so a bird stopped at the first one where it fits rarely touches its neighbours: big birds placed
 * first left pockets between them that the later, smaller birds' spiral points missed. Slid, each bird rests GAP
 * from the ones before it, and the next birds see the closed-up group. Every step is a collision test.
 */
function slideIn(grid: Grid, m: CellMask, at: [number, number], ox: number, oy: number, sx: number, sy: number): void {
  const hx = m.pw / 2 - ox, hy = m.ph / 2 - oy
  const dist = (gx: number, gy: number) => { const u = (gx + hx) / sx, v = (gy + hy) / sy; return u * u + v * v }
  const xmax = grid.gw - m.pw, ymax = grid.gh - m.ph
  let [gx, gy] = at, d = dist(gx, gy)
  for (;;) {
    let bx = -1, by = -1, bd = d
    for (const [mx, my] of MOVES) {
      const nx = gx + mx, ny = gy + my
      if (nx < 0 || ny < 0 || nx > xmax || ny > ymax) continue
      const nd = dist(nx, ny)
      if (nd >= bd - 1e-9 || (m.probeX >= 0 && grid.get(nx + m.probeX, ny + m.probeY)) || grid.collides(m, nx, ny)) continue
      bx = nx; by = ny; bd = nd
    }
    if (bx < 0) break
    gx = bx; gy = by; d = bd
  }
  at[0] = gx; at[1] = gy
}

/** What settle() needs of each placed bird (its box is in Packed.boxes). */
type Placed = { id: number; mask: Mask; w: number; h: number }
type Packed = { boxes: Map<number, Box>; placed: Placed[] }

/**
 * Place every bird at long side base · rel around the central hole; its boxes, or null if one doesn't fit.
 * Birds spiral out from the stage centre, x stretched by `stretch` (packBest passes [x, y] scales, stretchAt).
 * With `targets` (id -> centre), each bird spirals from its own target with no stretch: true size is packed from the evened-out positions, so
 * switching modes is a short morph. With `dense`, every bird stamps only its silhouette, so neighbours keep one
 * GAP between them instead of two (see coreMask).
 */
function packGrid(
  birds: PackBird[], rel: Map<number, number>, W: number, H: number, base: number,
  stretch: number | readonly [number, number], hole: Hole, targets: Map<number, [number, number]> | undefined,
  cell: number, dense: boolean, captions?: Map<number, CaptionRoom>, oval = false, slide = true,
): Packed | null {
  const grid = blankGrid(W, H, cell, hole, oval)
  const pad = Math.ceil(GAP / cell)
  const [kx, ky] = typeof stretch === 'number' ? [stretch, 1] : stretch
  const sx = (targets ? 1 : kx) / cell, sy = (targets ? 1 : ky) / cell
  const lim = (targets ? 2 : 1) * Math.max(W, H)
  // The reference's spiral ends at t = 1400 (rad 3080). A grown stage can be taller than that reaches, so
  // extend it (same formula and step) until it reaches every cell: from the centre, max(W, H) covers the
  // stage; from a target inside the stage, its diagonal does. Normal stages keep the reference's t = 1400.
  const reach = targets ? Math.hypot(W, H) : Math.max(W, H)
  const sp = spiral(Math.max(SPIRAL_T, reach / 2.2))
  // Centre mode: every bird walks the same spiral, so walk only its steps that land on the stage, and skip
  // steps proven dead (occupied all around) for every bird. Same positions tried, same result, far fewer tries.
  const walk = targets ? null : new CentreWalk(sp, W / 2 / cell, H / 2 / cell, sx, sy, grid, lim)
  const boxes = new Map<number, Box>()
  const placed: Placed[] = []
  for (const b of placementOrder(birds, rel)) {
    const L = Math.max(2, base * rel.get(b.id)!)
    const w = (L * b.mask.w) / MASK, h = (L * b.mask.h) / MASK
    const cap = captions?.get(b.id)
    const { mask: m, offX, offY } = cap
      ? captionCellMask(w, h, cap, cell, pad, true)
      : { mask: cellMask(b.mask, w, h, cell, pad), offX: 0, offY: 0 }
    const origin = targets ? targets.get(b.id) ?? [W / 2, H / 2] : [W / 2, H / 2]
    const at = walk ? walk.place(m) : spiralFrom(grid, m, sp, origin as [number, number], sx, sy, cell, lim)
    if (!at) return null
    if (slide) slideIn(grid, m, at, origin[0] / cell, origin[1] / cell, sx, sy)
    const s = cap
      ? (dense ? captionCellMask(w, h, cap, cell, pad, false).mask : m)
      : (dense ? coreMask(b.mask, w, h, cell, pad) : m)
    grid.stamp(s, at[0], at[1])
    boxes.set(b.id, [(at[0] + offX + pad) * cell, (at[1] + offY + pad) * cell, w, h])
    placed.push({ id: b.id, mask: b.mask, w, h })
  }
  return { boxes, placed }
}

/**
 * Settle a dense collage (a big list, centre-packed), on a fresh grid of one layout unit per cell (the packer's
 * is 2, too coarse for small stickers): every bird is stamped there as its bare silhouette. Then each bird,
 * nearest the count first, is lifted and walked one unit at a time to the free neighbouring position (of 8) that
 * is most central, until none is, and put down; it is tested dilated by GAP, so it ends at least GAP from every
 * silhouette. "Central" is a rounded-rectangle distance (|dx|/ax)^8 + (|dy|/ay)^8 over the stage's half sizes,
 * so the outer birds close up towards the middle and the stage corners stay filled (Oval: the ellipse's
 * (dx/ax)^2 + (dy/ay)^2). This closes the gaps the spiral's coarse steps (about 14 units between turns) leave between
 * small stickers, which read as a loose lattice at the edge; every step is a collision test, so it never makes an
 * overlap. Then fillPockets moves the outermost birds into the pockets still left inside. Deterministic.
 */
function settle(p: Packed, W: number, H: number, hole: Hole, oval: boolean, fill = true): Map<number, Box> {
  const grid = blankGrid(W, H, 1, hole, oval)
  const pad = GAP
  const todo: Settling[] = []
  for (const q of p.placed) {
    const [x, y] = p.boxes.get(q.id)!
    const gx = Math.round(x) - pad, gy = Math.round(y) - pad
    const m = cellMask(q.mask, q.w, q.h, 1, pad)
    const s = coreMask(q.mask, q.w, q.h, 1, pad)
    grid.stamp(s, gx, gy)
    todo.push({ id: q.id, m, s, gx, gy, w: q.w, h: q.h })
  }
  const ax = W / 2, ay = H / 2
  // Oval: the ellipse's own distance, so the birds close up evenly all round it (the rounded rectangle would draw them
  // in from the ends of its axes and leave those empty).
  const centrality = (cx: number, cy: number) => {
    const u = (cx - ax) / ax, v = (cy - ay) / ay
    const u2 = u * u, v2 = v * v, u4 = u2 * u2, v4 = v2 * v2
    return oval ? u2 + v2 : u4 * u4 + v4 * v4
  }
  const dist = (q: Settling, gx: number, gy: number) => centrality(gx + q.m.pw / 2, gy + q.m.ph / 2)
  // Walk a lifted bird inwards until no neighbouring position is more central and free.
  const walkIn = (q: Settling) => {
    const xmax = grid.gw - q.m.pw, ymax = grid.gh - q.m.ph
    let d = dist(q, q.gx, q.gy)
    for (let step = 0; step < 2000; step++) {
      let bx = -1, by = -1, bd = d
      for (const [mx, my] of MOVES) {
        const gx = q.gx + mx, gy = q.gy + my
        if (gx < 0 || gy < 0 || gx > xmax || gy > ymax) continue
        const nd = dist(q, gx, gy)
        if (nd >= bd - 1e-12) continue
        if (grid.collides(q.m, gx, gy)) continue
        bx = gx; by = gy; bd = nd
      }
      if (bx < 0) break
      q.gx = bx; q.gy = by; d = bd
    }
  }
  const d0 = new Map(todo.map((q) => [q, dist(q, q.gx, q.gy)]))
  todo.sort((a, b) => d0.get(a)! - d0.get(b)! || a.id - b.id)
  for (const q of todo) {
    grid.clear(q.s, q.gx, q.gy)
    walkIn(q)
    grid.stamp(q.s, q.gx, q.gy)
  }
  if (fill) fillPockets(grid, todo, centrality, walkIn)
  for (const q of todo) p.boxes.set(q.id, [q.gx + pad, q.gy + pad, q.w, q.h])
  return p.boxes
}

/** A bird on settle's grid: its tested (dilated) and stamped (bare) masks, and its mask's top-left cell. */
type Settling = { id: number; m: CellMask; s: CellMask; gx: number; gy: number; w: number; h: number }

/**
 * Fill the pockets settling leaves inside a dense collage: free room where a bird fits GAP from its neighbours (one
 * opens when a bird walks inwards and nothing behind it can follow). The free space's chessboard distance D (to the
 * nearest silhouette, the hole or the stage's edge) says where a bird may fit: only where D is at least the depth of
 * its tested (dilated) mask's deepest cell, its pole. Outermost bird first, each bird tries those cells (every other
 * one each way) that are more central than it, most central first, pole on the cell, each a collision test; at the first that fits it moves there
 * (only ever inwards), walks inwards to rest against its neighbours, and D is brought up to date around it. So the
 * loose birds at the outline's edge fill the holes inside it, and the edge evens out. Never makes an overlap.
 * Deterministic (fixed orders, ties by id).
 */
function fillPockets(grid: Grid, qs: Settling[], centrality: (cx: number, cy: number) => number, walkIn: (q: Settling) => void): void {
  const dist = (q: Settling, gx: number, gy: number) => centrality(gx + q.m.pw / 2, gy + q.m.ph / 2)
  const gw = grid.gw, gh = grid.gh, wpr = grid.wpr, bits = grid.bits
  const D = new Int32Array(gw * gh) // chessboard distance to the nearest occupied cell (the grid's border counts as one)
  // The two passes of the chessboard distance over the window [x0, x1) x [y0, y1), from what D holds (so a window
  // only ever lowers it: the whole grid once, then the room around each bird that moves).
  const transform = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * gw + x
        if (bits[y * wpr + (x >> 5)] & (1 << (x & 31))) { D[i] = 0; continue }
        D[i] = Math.min(D[i], 1 + (x && y && x < gw - 1 ? Math.min(D[i - 1], D[i - gw], D[i - gw - 1], D[i - gw + 1]) : 0))
      }
    }
    for (let y = y1 - 1; y >= y0; y--) {
      for (let x = x1 - 1; x >= x0; x--) {
        const i = y * gw + x
        if (D[i]) D[i] = Math.min(D[i], 1 + (x && y < gh - 1 && x < gw - 1 ? Math.min(D[i + 1], D[i + gw], D[i + gw + 1], D[i + gw - 1]) : 0))
      }
    }
  }
  D.fill(gw + gh)
  transform(0, 0, gw, gh)
  const probes = qs.map((q) => maskProbes(q.m))
  let kmin = Infinity, kmax = 0
  for (const [[, , k]] of probes) { kmin = Math.min(kmin, k); kmax = Math.max(kmax, k) }
  const cells: number[] = []
  // Every other cell each way: a bird that fits a pocket with a cell to spare is still found (and walks in after), at a
  // quarter of the scanning.
  for (let y = 0; y < gh; y += 2) for (let x = 0; x < gw; x += 2) if (D[y * gw + x] >= kmin) cells.push(y * gw + x)
  const cen = new Float64Array(gw * gh)
  for (const i of cells) cen[i] = centrality((i % gw) + 0.5, Math.floor(i / gw) + 0.5)
  cells.sort((a, b) => cen[a] - cen[b] || a - b)
  // The cells deep enough for a pole of depth k, most central first (D only drops later: each cell is checked again).
  const lists = new Map<number, number[]>()
  const deepFor = (k: number) => { let l = lists.get(k); if (!l) lists.set(k, (l = cells.filter((i) => D[i] >= k))); return l }
  const order = qs.map((q, n) => ({ q, probe: probes[n], d: dist(q, q.gx, q.gy) })).sort((a, b) => b.d - a.d || a.q.id - b.q.id)
  for (const { q, probe: [[px, py, k], ...more], d } of order) {
    grid.clear(q.s, q.gx, q.gy)
    let fit = false
    next: for (const i of deepFor(k)) {
      if (cen[i] >= d) break
      if (D[i] < k) continue
      const gx = (i % gw) - px, gy = Math.floor(i / gw) - py
      if (gx < 0 || gy < 0 || gx + q.m.pw > gw || gy + q.m.ph > gh) continue
      for (const [ox, oy, kk] of more) if (D[i + oy * gw + ox] < kk) continue next
      if (dist(q, gx, gy) >= d || grid.collides(q.m, gx, gy)) continue
      q.gx = gx; q.gy = gy; fit = true
      break
    }
    if (fit) walkIn(q)
    grid.stamp(q.s, q.gx, q.gy)
    if (fit) transform(Math.max(0, q.gx - kmax), Math.max(0, q.gy - kmax), Math.min(gw, q.gx + q.m.pw + kmax), Math.min(gh, q.gy + q.m.ph + kmax))
  }
}

/**
 * Where a mask needs free room, for fillPockets' quick test: its pole (the cell deepest inside it, chessboard, as
 * [x, y, depth], the depth 1-based: the square of side 2 · depth - 1 around it is all set) and the deepest cell in
 * each outer third of it (left, right, top, bottom) as [x - pole x, y - pole y, depth]. Where the mask fits, D is at
 * least each one's depth there.
 */
function maskProbes(m: CellMask): [pole: [px: number, py: number, k: number], ...more: [ox: number, oy: number, k: number][]] {
  const { pw, ph, wpr, data } = m
  const dd = new Int32Array(pw * ph)
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      if (!(data[y * wpr + (x >> 5)] & (1 << (x & 31)))) continue
      const i = y * pw + x
      dd[i] = 1 + (x && y && x < pw - 1 ? Math.min(dd[i - 1], dd[i - pw], dd[i - pw - 1], dd[i - pw + 1]) : 0)
    }
  }
  for (let y = ph - 1; y >= 0; y--) {
    for (let x = pw - 1; x >= 0; x--) {
      const i = y * pw + x
      if (dd[i]) dd[i] = Math.min(dd[i], 1 + (x && y < ph - 1 && x < pw - 1 ? Math.min(dd[i + 1], dd[i + pw], dd[i + pw + 1], dd[i + pw - 1]) : 0))
    }
  }
  // The deepest cell (first in row order on a tie) of the part of the mask where `inside` holds.
  const deepest = (inside: (x: number, y: number) => boolean): [number, number, number] => {
    let bx = 0, by = 0, k = 0
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) if (dd[y * pw + x] > k && inside(x, y)) { k = dd[y * pw + x]; bx = x; by = y }
    return [bx, by, k]
  }
  const [px, py, k] = deepest(() => true)
  const more: [number, number, number][] = []
  for (const part of [(x: number) => 3 * x < pw, (x: number) => 3 * x >= 2 * pw]) {
    const [x, y, kk] = deepest((x) => part(x))
    if (kk > 1) more.push([x - px, y - py, kk])
  }
  for (const part of [(y: number) => 3 * y < ph, (y: number) => 3 * y >= 2 * ph]) {
    const [x, y, kk] = deepest((_, y) => part(y))
    if (kk > 1) more.push([x - px, y - py, kk])
  }
  return [[px, py, k], ...more]
}

/**
 * The worst gap of a small set: the largest distance from a box to the count's text, or from a box to its nearest
 * neighbour's box, whichever is larger (the test of packBest's round and stage spirals for a filtered set).
 */
function worstGap(boxes: Map<number, Box>, W: number, H: number, hole: Hole): number {
  const bs = [...boxes.values()]
  let worst = 0
  bs.forEach((b, i) => {
    const r: [number, number, number, number] = [b[0] - W / 2, b[1] - H / 2, b[0] + b[2] - W / 2, b[1] + b[3] - H / 2]
    worst = Math.max(worst, Math.min(rectGap(r, hole.num), rectGap(r, hole.label)))
    let near = Infinity
    bs.forEach((o, j) => { if (j !== i) near = Math.min(near, boxGap(b, o)) })
    if (near < Infinity) worst = Math.max(worst, near)
  })
  return worst
}

/** Two boxes' distance apart (0 when their rectangles touch or overlap). */
export function boxGap(a: Box, b: Box): number {
  const dx = Math.max(0, b[0] - (a[0] + a[2]), a[0] - (b[0] + b[2]))
  const dy = Math.max(0, b[1] - (a[1] + a[3]), a[1] - (b[1] + b[3]))
  return Math.hypot(dx, dy)
}

/** Detached: further than this many median sticker long sides from every box of the main group (see detached). */
export const DETACH = 0.5

/**
 * The ids of boxes outside the main group: boxes within `k` x the median long side of each other are one group,
 * and the main group is the biggest. (Buckets of the largest box plus the link distance, so it stays linear.)
 */
export function detached(boxes: Map<number, Box>, k = DETACH): number[] {
  const ids = [...boxes.keys()]
  if (ids.length < 2) return []
  const bs = ids.map((id) => boxes.get(id)!)
  let longest = 0
  const longs = bs.map((b) => { const l = Math.max(b[2], b[3]); longest = Math.max(longest, l); return l })
  const link = k * medianOf(longs)
  const size = longest + link
  const bucket = new Map<string, number[]>()
  const key = (x: number, y: number) => `${Math.floor(x / size)},${Math.floor(y / size)}`
  bs.forEach((b, i) => { const kk = key(b[0], b[1]); const l = bucket.get(kk); if (l) l.push(i); else bucket.set(kk, [i]) })
  const group = new Int32Array(bs.length).fill(-1)
  const sizes: number[] = []
  for (let i = 0; i < bs.length; i++) {
    if (group[i] >= 0) continue
    const g = sizes.length
    let n = 0
    const stack = [i]
    group[i] = g
    while (stack.length) {
      const a = stack.pop()!
      n++
      const gx = Math.floor(bs[a][0] / size), gy = Math.floor(bs[a][1] / size)
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        for (const j of bucket.get(`${gx + ox},${gy + oy}`) ?? []) {
          if (group[j] < 0 && boxGap(bs[a], bs[j]) <= link) { group[j] = g; stack.push(j) }
        }
      }
    }
    sizes.push(n)
  }
  const main = sizes.indexOf(Math.max(...sizes))
  return ids.filter((_, i) => group[i] !== main)
}

/**
 * Bring detached birds (see `detached`) back to the collage: on a grid of one layout unit per cell with every bird
 * stamped as its bare silhouette (as settle), each detached bird, nearest the count first, walks one unit at a time
 * to whichever free neighbouring position (of 8) is nearest the stage centre, until none is: it comes to rest
 * against the group, GAP from it. Every step is a collision test, so it never makes an overlap; the hole stays
 * clear. Repeated while that frees others (a bird that was blocked by one now moved). True size and small lists
 * leave a few: big birds placed first push small ones out along the spiral past the edge (the "stragglers").
 */
function gather(boxes: Map<number, Box>, birds: PackBird[], W: number, H: number, hole: Hole, captions?: Map<number, CaptionRoom>, oval = false): Map<number, Box> {
  let loose = detached(boxes)
  if (!loose.length) return boxes
  const grid = blankGrid(W, H, 1, hole, oval)
  const pad = GAP
  const byId = new Map(birds.map((b) => [b.id, b]))
  type Off = { offX: number; offY: number }
  const cores = new Map<number, { s: CellMask } & Off>()
  const at = (id: number, o: Off = { offX: 0, offY: 0 }) => { const [x, y] = boxes.get(id)!; return [Math.round(x) - pad - o.offX, Math.round(y) - pad - o.offY] as const }
  for (const [id, [, , w, h]] of boxes) {
    const cap = captions?.get(id)
    const { mask: s, offX, offY } = cap
      ? captionCellMask(w, h, cap, 1, pad, false)
      : { mask: coreMask(byId.get(id)!.mask, w, h, 1, pad), offX: 0, offY: 0 }
    cores.set(id, { s, offX, offY })
    const [gx, gy] = at(id, { offX, offY })
    grid.stamp(s, gx, gy)
  }
  for (let round = 0; round < 4 && loose.length; round++) {
    const d2 = (id: number, gx: number, gy: number, o: Off) => {
      const [, , w, h] = boxes.get(id)!
      const u = gx + o.offX + pad + w / 2 - W / 2, v = gy + o.offY + pad + h / 2 - H / 2
      return u * u + v * v
    }
    loose.sort((a, b) => d2(a, ...at(a, cores.get(a)!), cores.get(a)!) - d2(b, ...at(b, cores.get(b)!), cores.get(b)!) || a - b)
    let moved = false
    for (const id of loose) {
      const [, , w, h] = boxes.get(id)!
      const cap = captions?.get(id)
      const o = cores.get(id)!
      const { s } = o
      const m = cap ? captionCellMask(w, h, cap, 1, pad, true).mask : cellMask(byId.get(id)!.mask, w, h, 1, pad)
      let [gx, gy] = at(id, o)
      grid.clear(s, gx, gy)
      const xmax = grid.gw - m.pw, ymax = grid.gh - m.ph
      let d = d2(id, gx, gy, o)
      for (let step = 0; step < 4 * (W + H); step++) {
        let bx = -1, by = -1, bd = d
        for (const [mx, my] of MOVES) {
          const nx = gx + mx, ny = gy + my
          if (nx < 0 || ny < 0 || nx > xmax || ny > ymax) continue
          const nd = d2(id, nx, ny, o)
          if (nd >= bd - 1e-9 || grid.collides(m, nx, ny)) continue
          bx = nx; by = ny; bd = nd
        }
        if (bx < 0) break
        gx = bx; gy = by; d = bd; moved = true
      }
      grid.stamp(s, gx, gy)
      boxes.set(id, [gx + o.offX + pad, gy + o.offY + pad, w, h])
    }
    if (!moved) break
    loose = detached(boxes)
  }
  return boxes
}

/** spreadEven's passes over every bird, at most (it stops sooner once nothing moves). 32 since the pack slides its birds
 *  together (slideIn): a frame whose size is capped (maxTile) starts tighter and takes more passes to even out. */
const SPREAD_ROUNDS = 32

/**
 * Even out a frame's pack (packFrame: the share images and the posters), so the gaps are about the same everywhere and
 * the birds fill the frame (or its oval) to its edge: no clumps, no holes, no empty corners. On a grid of one layout
 * unit per cell, every bird is stamped as its bare silhouette (a captioned one as its box and its name's box, as
 * gather). Then, pass after pass, each bird is lifted and its free run measured in the four directions (how far it can
 * go, tested dilated by GAP, before it meets another bird or a wall: the frame's edge, the count's hole, outside the
 * oval). Along each axis it moves to the middle of its two runs, so it sits halfway between its neighbours; next to a
 * wall, it moves right up to the wall instead, so the outer birds line the frame and the free room goes between birds.
 * The free room so flows to where it is short until the gaps even out. Every move stays inside a measured free run, so
 * it never makes an overlap; the order is fixed (by id, forwards then backwards), so the result is deterministic.
 */
function spreadEven(
  boxes: Map<number, Box>, birds: PackBird[], W: number, H: number, hole: Hole, captions: Map<number, CaptionRoom> | undefined, oval: boolean,
): Map<number, Box> {
  // The walls alone, and the walls with every bird's core. No core overlaps a wall (the pack kept every bird GAP from them
  // on a coarser, more cautious grid), so clearing a core never clears a wall.
  const walls = blankGrid(W, H, 1, hole, oval)
  const occ = blankGrid(W, H, 1, hole, oval)
  const pad = GAP
  const byId = new Map(birds.map((b) => [b.id, b]))
  type Q = { id: number; s: CellMask; m: CellMask; gx: number; gy: number; offX: number; offY: number; w: number; h: number }
  const qs: Q[] = []
  for (const id of [...boxes.keys()].sort((a, b) => a - b)) {
    const [x, y, w, h] = boxes.get(id)!
    const cap = captions?.get(id)
    const { mask: s, offX, offY } = cap ? captionCellMask(w, h, cap, 1, pad, false) : { mask: coreMask(byId.get(id)!.mask, w, h, 1, pad), offX: 0, offY: 0 }
    const m = cap ? captionCellMask(w, h, cap, 1, pad, true).mask : cellMask(byId.get(id)!.mask, w, h, 1, pad)
    const q = { id, s, m, gx: Math.round(x) - pad - offX, gy: Math.round(y) - pad - offY, offX, offY, w, h }
    occ.stamp(s, q.gx, q.gy)
    qs.push(q)
  }
  // How far q can go from (gx, gy) by (dx, dy) steps, and whether a wall (not a bird) stops it.
  const run = (q: Q, dx: number, dy: number): [steps: number, wall: boolean] => {
    const xmax = occ.gw - q.m.pw, ymax = occ.gh - q.m.ph
    for (let k = 1; ; k++) {
      const x = q.gx + k * dx, y = q.gy + k * dy
      if (x < 0 || y < 0 || x > xmax || y > ymax) return [k - 1, true]
      if (occ.collides(q.m, x, y)) return [k - 1, walls.collides(q.m, x, y)]
    }
  }
  // The move along one axis: to the wall when one side is a wall and the other a bird, else to the middle.
  const shift = ([a, aWall]: [number, boolean], [b, bWall]: [number, boolean]) => (aWall && !bWall ? -a : bWall && !aWall ? b : Math.trunc((b - a) / 2))
  for (let round = 0; round < SPREAD_ROUNDS; round++) {
    let moved = 0
    for (let i = 0; i < qs.length; i++) {
      const q = qs[round % 2 ? qs.length - 1 - i : i]
      occ.clear(q.s, q.gx, q.gy)
      const dx = shift(run(q, -1, 0), run(q, 1, 0))
      q.gx += dx
      const dy = shift(run(q, 0, -1), run(q, 0, 1))
      q.gy += dy
      if (dx || dy) moved++
      occ.stamp(q.s, q.gx, q.gy)
    }
    if (!moved) break
  }
  const out = new Map<number, Box>()
  for (const q of qs) out.set(q.id, [q.gx + q.offX + pad, q.gy + q.offY + pad, q.w, q.h])
  return out
}

function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[s.length >> 1]
}

function maskFill(m: Mask): number {
  let set = 0
  for (let i = 0; i < m.bits.length; i++) { let v = m.bits[i]; while (v) { set += v & 1; v >>= 1 } }
  return set / (m.w * m.h)
}

/** Crop equal empty margins from opposite sides, so the stage centre (the count) stays put. */
function trimToContent(boxes: Map<number, Box>, W: number, H: number): { W: number; H: number; boxes: Map<number, Box> } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y, w, h] of boxes.values()) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h)
  }
  const dx = Math.max(0, Math.floor(Math.min(x0, W - x1) - TRIM_PAD))
  const dy = Math.max(0, Math.floor(Math.min(y0, H - y1) - TRIM_PAD))
  const out = new Map<number, Box>()
  for (const [id, [x, y, w, h]] of boxes) out.set(id, [x - dx, y - dy, w, h])
  return { W: W - 2 * dx, H: H - 2 * dy, boxes: out }
}

const FIT_MARGIN = 10, FIT_HOLE = 24
/**
 * Stage fits the group, as build_lifelist.py export(): the half height is the group's vertical extent about
 * the count (at least the hole's half height + 24) plus 10, never more than the stage's own half height. The cut is a
 * whole number of layout units, taken equally from top and bottom, so the count stays at H / 2. W unchanged.
 */
export function fitStage(boxes: Map<number, Box>, W: number, H: number, holeRy: number): { W: number; H: number; boxes: Map<number, Box> } {
  const cy = H / 2
  let ext = holeRy + FIT_HOLE
  for (const [, y, , h] of boxes.values()) ext = Math.max(ext, cy - y, y + h - cy)
  const off = Math.max(0, Math.floor(cy - ext - FIT_MARGIN))
  if (!off) return { W, H, boxes }
  const out = new Map<number, Box>()
  for (const [id, [x, y, w, h]] of boxes) out.set(id, [x, y - off, w, h])
  return { W, H: H - 2 * off, boxes: out }
}

/**
 * The spiral's [x, y] scale on a stage H tall. On the layout's starting stage, or a shorter one (a trimmed small
 * collage, its filtered states, link previews; share images' frames have no maxH and always get this), it is
 * [stretch, 1], as before. On a grown stage the spiral's aspect follows the stage's: x : y = stretch · g with
 * g = layout.H / H, so a stage grown 1.5x taller packs as a round or tall cluster instead of staying a wide oval.
 * The change is split evenly between the axes ([stretch · √g, 1 / √g]), so the spiral's steps per unit of stage
 * area stay as on the starting stage (squeezing x alone would multiply the steps tried, and the packing time, by
 * 1 / g). H counts up to maxH: past it (huge lists, a column far taller than wide) the shape stays at maxH's.
 * Filtered states pack in the full collage's (trimmed) stage and get about the same.
 */
export function stretchAt(layout: Pick<Layout, 'H' | 'stretch' | 'maxH'>, H: number): [number, number] {
  const g = Math.min(1, layout.H / Math.min(H, Math.max(layout.H, layout.maxH ?? layout.H)))
  return g === 1 ? [layout.stretch, 1] : [layout.stretch * Math.sqrt(g), 1 / Math.sqrt(g)]
}

/**
 * The largest base size that packs, for one layout and size mode.
 * - Full collage (no fixedStage): starts on layout.W x layout.H; a big list grows it taller, first up to
 *   layout.maxH while the median sticker is below layout.floor, then past it only while the base is below
 *   layout.minBase (see the loop). The result is trimmed to its content.
 * - With fixedStage (true size of a state, or a filtered state): packs inside that stage, untrimmed.
 * - Full collage base is at most MAX_BASE (80), the reference's ceiling.
 * - With refBase (filtered states): base is searched in [0.7, MAXUP] x refBase, as build_lifelist.py main();
 *   only if nothing fits there does it shrink below (see fallback).
 * - With targets (true size): each bird spirals from its target (the even-mode centres of the same state),
 *   in the coordinates of the stage packed in.
 * - With rel (filtered states): relative sizes computed over the WHOLE list (relSizes(fullList, exp of this
 *   mode)), so a bird keeps its full-collage size across filters, as the reference's set_rel. Without it,
 *   relSizes over `birds` (the same thing for the full collage).
 * - Hole: the ellipse kept empty at the centre is collageHole(birds.length, layout), the shown count's (none for F = 0);
 *   opts.hole replaces it (share images, the link preview); NO_HOLE keeps none.
 * - With fit (filtered states, needs fixedStage): after packing, the stage height is trimmed about the count
 *   (fitStage), so the returned H can be less than fixedStage's and box y's move up by the same amount.
 * - With maxBase (share images): the search never goes above it, so no tile is longer than maxBase · max rel.
 * - With oval (the Oval arrangement: the page's collage, through the worker's layout request, and packFrame's share
 *   images): every bird stays inside the ellipse inscribed in the stage packed in (the grown stage, fixedStage or the
 *   frame), and the size estimate counts the ellipse's area (π/4 of the stage's).
 */
export function packBest(
  birds: PackBird[], layout: Layout, mode: 'even' | 'true',
  opts: {
    targets?: Map<number, [number, number]>; refBase?: number; fixedStage?: [number, number]
    rel?: Map<number, number>; fit?: boolean; hole?: Hole; maxBase?: number; captions?: Map<number, CaptionRoom>; oval?: boolean
  } = {},
): PackResult {
  const { targets, refBase, fixedStage, fit, captions } = opts
  const oval = !!opts.oval
  if (!birds.length) {
    const [W, H] = fixedStage ?? [layout.W, layout.H]
    return { base: refBase ?? 0, ...(fit && fixedStage ? fitStage(new Map(), W, H, holeExtent(collageHole(0, layout))[1]) : { W, H, boxes: new Map() }) }
  }
  const rel = opts.rel ?? relSizes(birds, mode === 'even' ? EXP : EXP_TRUE)
  const hole = opts.hole ?? collageHole(birds.length, layout)
  const cell = DEFAULT_CELL
  let area = 0 // sum of rel² · mask fill, summed in placement order so it never depends on input order
  for (const b of placementOrder(birds, rel)) area += rel.get(b.id)! ** 2 * maskFill(b.mask)
  const clamp = refBase ? ([0.7 * refBase, MAXUP * refBase] as const) : null
  // Dense: the whole list (rel covers it, also for a filtered state) has at least layout.denseFrom birds. Its even
  // (centre-packed) states keep one GAP between birds and are settled after packing, so small birds sit as close
  // at the edge as in the middle. True size (targets: it follows the settled even centres) and share images
  // (no denseFrom) pack as before. A set of fewer than SMALL_SET birds (a filter that leaves a few birds, in either
  // mode, whatever the whole list's size) is settled too, and spirals round rather than stretched: two or three birds
  // then pack around the count instead of strung out along the stage's width, where the settling pass can't close the gap.
  const small = !!layout.denseFrom && birds.length < SMALL_SET
  const dense = small || (!!layout.denseFrom && mode === 'even' && !targets && rel.size >= layout.denseFrom)
  // The spiral of the pass in hand: a small set's filtered state tries a round one and the stage's own, keeps the tighter.
  // A small set neither slides nor fills pockets: sliding pulls each bird onto the count and away from its neighbour,
  // and the round / stage spiral test (worstGap) already keeps the snugger of two arrangements.
  let round = small
  const tryPack = (W: number, H: number, base: number) => packGrid(birds, rel, W, H, base, round ? [1, 1] : stretchAt(layout, H), hole, targets, cell, dense, captions, oval, !small)
  // Settled (dense), then any detached birds gathered back to the group (gather): the outline stays compact.
  const boxesOf = (p: Packed, W: number, H: number) => gather(dense ? settle(p, W, H, hole, oval, !small) : p.boxes, birds, W, H, hole, captions, oval)

  // Search range. Full collage: [0.6, 1.6] x the area estimate, capped at MAX_BASE. With refBase (filtered
  // states): the reference's window [0.7, MAXUP] x refBase, searched directly (it may exceed MAX_BASE).
  const range = (W: number, H: number): [number, number] => {
    if (clamp) return [clamp[0], clamp[1]]
    const usable = Math.max(1, (oval ? Math.PI / 4 : 1) * W * H - holeArea(hole))
    const est = Math.sqrt((0.55 * usable) / Math.max(area, 1e-9))
    const hi = Math.min(1.6 * est, MAX_BASE, opts.maxBase ?? Infinity)
    return [Math.min(0.6 * est, hi), hi]
  }

  // stopBelow: once the best possible base is known to be below it, stop (the caller grows the stage).
  // Also returns hi: the search's final upper bound (the stage's best base is below it when best fell short).
  const search = (W: number, H: number, stopBelow = 0): { best: { base: number; packed: Packed } | null; hi: number } => {
    let [lo, hi] = range(W, H)
    const lo0 = lo
    let best: { base: number; packed: Packed } | null = null
    if (hi - lo < 1e-6) { // the estimate is above MAX_BASE: just try the cap
      const packed = tryPack(W, H, hi)
      best = packed && { base: hi, packed }
    } else {
      for (let s = 0; s < STEPS; s++) { // binary search the largest base that fits
        const mid = (lo + hi) / 2
        const packed = tryPack(W, H, mid)
        if (packed) { lo = mid; best = { base: mid, packed } } else hi = mid
        if (hi <= stopBelow) return { best, hi }
      }
      if (!best && lo0 >= stopBelow) { // the reference never tries the lower end itself
        const packed = tryPack(W, H, lo0)
        best = packed && { base: lo0, packed }
      }
    }
    if (best && clamp && best.base < clamp[1] && best.base >= clamp[1] * 0.97) { // snap to the cap, as main()
      const packed = tryPack(W, H, clamp[1])
      if (packed) best = { base: clamp[1], packed }
    }
    return { best, hi }
  }

  // Nothing fits even at the bottom of the range: shrink by 0.85 steps until it does. For a filtered state
  // this goes below 0.7 x refBase (the reference packed at 0.7 x refBase anyway and could fail); the result's
  // base says so, and base / refBase is the scale the caller shows. Practically unreachable: a subset of a
  // collage packed at refBase on the same stage.
  const fallback = (W: number, H: number) => {
    for (let base = range(W, H)[0] * 0.85; base >= 0.5; base *= 0.85) {
      const packed = tryPack(W, H, base)
      if (packed) return { base, packed }
    }
    throw new Error(`packBest: ${birds.length} birds do not fit a ${W}x${H} stage`)
  }

  if (fixedStage) {
    const [W, H] = fixedStage
    const pass = () => { const got = search(W, H).best ?? fallback(W, H); return { got, boxes: boxesOf(got.packed, W, H) } }
    let best = pass()
    if (small) { // the stage's own spiral too: keep the pass whose worst gap about the count and its neighbours is smaller
      round = false
      const alt = pass()
      round = true
      if (worstGap(alt.boxes, W, H, hole) < worstGap(best.boxes, W, H, hole)) best = alt
    }
    if (!fit) return { base: best.got.base, W, H, boxes: best.boxes }
    const t = fitStage(best.boxes, W, H, holeExtent(hole)[1])
    return { base: best.got.base, W: t.W, H: t.H, boxes: t.boxes }
  }

  // Big lists grow the stage taller (never wider), in two stages:
  // 1. up to layout.maxH, until the median sticker's long side reaches layout.floor (CSS px at the reference
  //    width W, where layout units are CSS px): base >= floor / median rel.
  // 2. past maxH (up to 12x the start), only while the base is below layout.minBase.
  // Each step jumps to the height the area estimate asks for (base grows as sqrt(H)) from the search's upper
  // bound (stage 2: from the best base that packed, if any), at least 10% (so it never overshoots far), never past
  // maxH in stage 1 or 12x in stage 2.
  // A list whose birds meet the floor on the starting stage packs exactly as before (stretchAt is [stretch, 1] there).
  const W = layout.W, Hmax = MAX_GROW * layout.H
  const minBase = layout.minBase ?? 0
  const maxH = Math.max(layout.H, layout.maxH ?? layout.H)
  const floorBase = layout.floor ? layout.floor / medianOf(birds.map((b) => rel.get(b.id)!)) : 0
  let H: number = layout.H
  let got: { base: number; packed: Packed } | null = null
  for (;;) {
    const want = H < maxH ? Math.max(minBase, floorBase) : minBase
    const canGrow = H < maxH || H < Hmax
    let hi = range(W, H)[1] // an upper bound on this stage's base, tightened by the search
    // Skip packing a stage whose whole search range is below the target; it would only grow anyway.
    if (!canGrow || hi >= want) {
      const r = search(W, H, canGrow ? want : 0)
      got = r.best
      hi = r.hi
      if (got && got.base >= want) break
    }
    if (!canGrow) break
    // Stage 2 aims from the best base that packed here, when one did (it is below want): a stage that packed close
    // to minBase would otherwise grow in many small steps, each a full search.
    const from = H >= maxH && got ? got.base : hi
    const next = Math.max(Math.round(H * STEP), Math.round(AIM * H * (want / Math.max(from, 1e-6)) ** 2))
    H = Math.min(H < maxH ? maxH : Hmax, next)
  }
  got ??= fallback(W, H)
  const t = trimToContent(boxesOf(got.packed, W, H), W, H)
  return { base: got.base, W: t.W, H: t.H, boxes: t.boxes }
}

// packFrame's target base: the site's typical sizes (so GAP and the cell grid look the same) up to 300 birds,
// then smaller, down to the narrow layout's minBase near 5,000, so a huge list still packs in seconds. It falls
// slower than 1/sqrt(n), so GAP stays a small share of a tile and a big list's stickers stay recognisable.
const frameBase = (n: number) => (n <= 300 ? 28 : Math.max(10, 28 * (300 / n) ** 0.35))
/**
 * Share images: pack `birds` (relative sizes over these birds, evened out) into a frame of aspect W / H, as large as
 * fits. The frame's size in layout units is chosen so the base lands near frameBase(n) whatever the count; the
 * caller maps the frame onto its pixels (frame width = collage width).
 * - hole: the count's hole (count-box.ts) kept empty at the frame's centre, in fractions of the frame's width (the
 *   same in layout units and in pixels); none by default.
 * - maxTile: no tile's long side is longer than this fraction of the frame's width (a short list then sits as a
 *   ring around the count instead of a few giant stickers).
 * - oval: the birds fill the ellipse inscribed in the frame (a circle in a square one); the frame is sized for its area.
 * - captions: each bird's name room under it (a poster's names), as fractions of the frame's width. When no base packs
 *   the birds with their names, the pack is made as without them: the caller's caption check (image.ts fitCaptionPack)
 *   then finds the names don't fit and draws the poster without them.
 * Then spreadEven spreads the birds evenly over the frame (or its oval), edge to edge.
 */
export function packFrame(birds: PackBird[], aspect: number, opts: FrameOpts = {}): PackResult {
  if (!opts.captions) return packFrameWith(birds, aspect, opts)
  try {
    return packFrameWith(birds, aspect, opts)
  } catch {
    return packFrameWith(birds, aspect, { ...opts, captions: undefined })
  }
}
type FrameOpts = { hole?: Hole; maxTile?: number; captions?: Map<number, CaptionRoom>; oval?: boolean }
function packFrameWith(birds: PackBird[], aspect: number, opts: FrameOpts): PackResult {
  const rel = relSizes(birds, EXP)
  let area = 0, maxRel = 1
  for (const b of placementOrder(birds, rel)) { const r = rel.get(b.id)!; area += r ** 2 * maskFill(b.mask); maxRel = Math.max(maxRel, r) }
  const unit = opts.hole ?? NO_HOLE
  let capArea = 0
  if (opts.captions) for (const c of opts.captions.values()) capArea += c.w * c.h
  // packBest's estimate is base = sqrt(0.55 · usable / area); solve it for the frame at frameBase, where usable is the
  // frame's area less the hole's: W² · (1 / aspect − hole area at width 1).
  const usable = (frameBase(birds.length) ** 2 * Math.max(area, 0.05)) / 0.55
  const free = Math.max(0.1 / aspect, (opts.oval ? Math.PI / 4 : 1) / aspect - holeArea(unit) - capArea * 2.8)
  const W = Math.max(8, Math.ceil(Math.sqrt(usable / free)))
  const H = Math.max(8, Math.round(W / aspect))
  const hole = scaleHole(unit, W)
  const maxBase = opts.maxTile ? (opts.maxTile * W) / maxRel : undefined
  const frame = { W, H, stretch: aspect, F: 0 }
  const captions = opts.captions
    ? new Map([...opts.captions].map(([id, c]) => [id, { w: c.w * W, h: c.h * W, ...(c.ring ? { ring: c.ring * W } : {}) }]))
    : undefined
  const r = packBest(birds, frame, 'even', { fixedStage: [W, H], rel, hole, maxBase, captions, ...(opts.oval ? { oval: true } : {}) })
  return { ...r, boxes: spreadEven(r.boxes, birds, r.W, r.H, hole, captions, !!opts.oval) }
}
