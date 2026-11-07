// The collage packer: a TypeScript port of pack(), best_layout() and trim_to_content() from
// framer-site/scripts/lifelist/build_lifelist.py. Runs in a Web Worker and on the server.
//
// Box semantics (what the renderer places): Box = [x, y, w, h] in layout units, on a stage of W x H layout
// units with the origin at its top-left. (x, y) is the top-left corner of the sticker's tile and w x h is its
// size. The tile's long side is base · rel (at least 2; rel from relSizes: painted area follows mass) and its aspect is the mask's (mask.w / mask.h, which
// follows the sticker image's `ar` to within the mask's rounding). Draw the sticker image to fill the box.
// The species count sits at the stage centre (W / 2, H / 2), inside the ellipse holeRadii(layout.F).
// A filtered state (packBest with `fit`) is packed in the full collage's stage, then its height is trimmed
// symmetrically about the count (fitStage): W is unchanged, H shrinks, every box moves up by the same amount.
import { EXP, EXP_TRUE, GAP, MAXUP, SHAPE_CLAMP, SHAPE_REF, holeRadii } from './constants'
import { CentreWalk, Grid, SPIRAL_T, cellMask, coreMask, spiral, spiralFrom, type CellMask } from './grid'
import { MASK, type Mask } from './mask'

/** shape: the painted share of the bird's L x L square (maskShape of its mask when absent; the outline's for no sticker). */
export type PackBird = { id: number; mass: number; mask: Mask; shape?: number }
export type Box = [x: number, y: number, w: number, h: number] // layout units
export type PackResult = { base: number; W: number; H: number; boxes: Map<number, Box> }
/** What the packer reads from a layout: one of LAYOUTS, or an ad hoc frame (share images, packFrame). */
type Layout = { W: number; H: number; stretch: number; F: number; minBase?: number; floor?: number; maxH?: number; denseFrom?: number }

export const DEFAULT_CELL = 2 // layout units per occupancy cell
const MIN_MASS = 0.1 // grams; guards mass ** exp against 0 or bad data
const STEPS = 7 // binary-search steps
export const MAX_BASE = 80 // largest base for a full collage (the reference's search ceiling)
const TRIM_PAD = 8
// STEP: smallest growth step. AIM: each jump aims this much past the estimate, so one more search is rarely needed.
const STEP = 1.1, AIM = 1.08, MAX_GROW = 12

/** The mask's set cells over MASK²: the share of the sticker's L x L square (L its long side) that is painted. */
export function maskShape(m: Mask): number {
  let set = 0
  for (let i = 0; i < m.bits.length; i++) { let v = m.bits[i]; while (v) { set += v & 1; v >>= 1 } }
  return set / (MASK * MASK)
}

/**
 * Relative tile long side per bird: rel = (mass / lightest) ** exp · clamp((SHAPE_REF / shape) ** 1/4, 1 ± SHAPE_CLAMP),
 * the geometric mean of the long-side rule (rel ∝ mass ** exp) and the painted-area rule (rel ∝ mass ** exp ·
 * sqrt(SHAPE_REF / shape)), with the shape correction held within ±20%. A tile of long side L paints L² · shape, so a
 * long-tailed or long-legged bird (little of its square painted) gets a somewhat longer tile than an upright compact one
 * of the same mass, but a thin upright bird is not blown up. A bird of the reference shape (SHAPE_REF) keeps the long
 * side of the long-side rule, so a list's median rel stays where it was (the base, floors and MAXUP keep meaning).
 */
/** The blended shape correction for a mask's painted share (see relSizes). */
export function shapeFactor(shape: number): number {
  const f = (SHAPE_REF / Math.max(0.05, shape)) ** 0.25
  return Math.min(1 + SHAPE_CLAMP, Math.max(1 - SHAPE_CLAMP, f))
}

export function relSizes(birds: PackBird[], exp: number): Map<number, number> {
  const m = (b: PackBird) => (Number.isFinite(b.mass) ? Math.max(MIN_MASS, b.mass) : MIN_MASS) ** exp
  const k = (b: PackBird) => shapeFactor(b.shape ?? maskShape(b.mask))
  let lo = Infinity
  for (const b of birds) lo = Math.min(lo, m(b))
  return new Map(birds.map((b) => [b.id, (m(b) / lo) * k(b)]))
}

/** Largest first; ties broken by id, so the order never depends on the input order. */
function placementOrder(birds: PackBird[], rel: Map<number, number>): PackBird[] {
  return [...birds].sort((a, b) => rel.get(b.id)! - rel.get(a.id)! || a.id - b.id)
}

/**
 * Place every bird at long side base · rel around the central hole; boxes, or null if one doesn't fit.
 * Birds spiral out from the stage centre, x stretched by `stretch` (packBest passes [x, y] scales, stretchAt).
 * With `targets` (id -> centre), each bird spirals from its own target with no stretch: true size is packed from the evened-out positions, so
 * switching modes is a short morph. With `dense`, every bird stamps only its silhouette, so neighbours keep one
 * GAP between them instead of two (see coreMask).
 */
export function pack(
  birds: PackBird[], rel: Map<number, number>, W: number, H: number, base: number,
  stretch: number, hole: [number, number], targets?: Map<number, [number, number]>, cell = DEFAULT_CELL, dense = false,
): Map<number, Box> | null {
  return packGrid(birds, rel, W, H, base, stretch, hole, targets, cell, dense)?.boxes ?? null
}

/** What settle() needs of each placed bird (its box is in Packed.boxes). */
type Placed = { id: number; mask: Mask; w: number; h: number }
type Packed = { boxes: Map<number, Box>; placed: Placed[] }

function packGrid(
  birds: PackBird[], rel: Map<number, number>, W: number, H: number, base: number,
  stretch: number | readonly [number, number], hole: [number, number], targets: Map<number, [number, number]> | undefined,
  cell: number, dense: boolean,
): Packed | null {
  const grid = new Grid(W, H, cell)
  if (hole[0] > 0 && hole[1] > 0) grid.markEllipse(W / 2, H / 2, hole[0], hole[1])
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
    const m = cellMask(b.mask, w, h, cell, pad)
    const at = walk ? walk.place(m) : spiralFrom(grid, m, sp, targets!.get(b.id) ?? [W / 2, H / 2], sx, sy, cell, lim)
    if (!at) return null
    const s = dense ? coreMask(b.mask, w, h, cell, pad) : m
    grid.stamp(s, at[0], at[1])
    boxes.set(b.id, [(at[0] + pad) * cell, (at[1] + pad) * cell, w, h])
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
 * so the outer birds close up towards the middle and the stage corners stay filled. This closes the gaps the
 * spiral's coarse steps (about 14 units between turns) leave between small stickers, which read as a loose
 * lattice at the edge; every step is a collision test, so it never makes an overlap. Deterministic.
 */
function settle(p: Packed, W: number, H: number, hole: [number, number]): Map<number, Box> {
  const grid = new Grid(W, H, 1)
  if (hole[0] > 0 && hole[1] > 0) grid.markEllipse(W / 2, H / 2, hole[0], hole[1])
  const pad = GAP
  type Q = { id: number; m: CellMask; s: CellMask; gx: number; gy: number; w: number; h: number }
  const todo: Q[] = []
  for (const q of p.placed) {
    const [x, y] = p.boxes.get(q.id)!
    const gx = Math.round(x) - pad, gy = Math.round(y) - pad
    const m = cellMask(q.mask, q.w, q.h, 1, pad)
    const s = coreMask(q.mask, q.w, q.h, 1, pad)
    grid.stamp(s, gx, gy)
    todo.push({ id: q.id, m, s, gx, gy, w: q.w, h: q.h })
  }
  const ax = W / 2, ay = H / 2
  const dist = (q: Q, gx: number, gy: number) => {
    const u = (gx + q.m.pw / 2 - ax) / ax, v = (gy + q.m.ph / 2 - ay) / ay
    const u2 = u * u, v2 = v * v, u4 = u2 * u2, v4 = v2 * v2
    return u4 * u4 + v4 * v4
  }
  const d0 = new Map(todo.map((q) => [q, dist(q, q.gx, q.gy)]))
  todo.sort((a, b) => d0.get(a)! - d0.get(b)! || a.id - b.id)
  const MOVES = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
  for (const q of todo) {
    grid.clear(q.s, q.gx, q.gy)
    const xmax = grid.gw - q.m.pw, ymax = grid.gh - q.m.ph
    let d = d0.get(q)!
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
    grid.stamp(q.s, q.gx, q.gy)
    p.boxes.set(q.id, [q.gx + pad, q.gy + pad, q.w, q.h])
  }
  return p.boxes
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
function gather(boxes: Map<number, Box>, birds: PackBird[], W: number, H: number, hole: [number, number]): Map<number, Box> {
  let loose = detached(boxes)
  if (!loose.length) return boxes
  const grid = new Grid(W, H, 1)
  if (hole[0] > 0 && hole[1] > 0) grid.markEllipse(W / 2, H / 2, hole[0], hole[1])
  const pad = GAP
  const byId = new Map(birds.map((b) => [b.id, b]))
  const cores = new Map<number, CellMask>()
  const at = (id: number) => { const [x, y] = boxes.get(id)!; return [Math.round(x) - pad, Math.round(y) - pad] as const }
  for (const [id, [, , w, h]] of boxes) {
    const s = coreMask(byId.get(id)!.mask, w, h, 1, pad)
    cores.set(id, s)
    const [gx, gy] = at(id)
    grid.stamp(s, gx, gy)
  }
  const MOVES = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
  for (let round = 0; round < 4 && loose.length; round++) {
    const d2 = (id: number, gx: number, gy: number) => {
      const [, , w, h] = boxes.get(id)!
      const u = gx + pad + w / 2 - W / 2, v = gy + pad + h / 2 - H / 2
      return u * u + v * v
    }
    loose.sort((a, b) => d2(a, ...at(a)) - d2(b, ...at(b)) || a - b)
    let moved = false
    for (const id of loose) {
      const [, , w, h] = boxes.get(id)!
      const m = cellMask(byId.get(id)!.mask, w, h, 1, pad), s = cores.get(id)!
      let [gx, gy] = at(id)
      grid.clear(s, gx, gy)
      const xmax = grid.gw - m.pw, ymax = grid.gh - m.ph
      let d = d2(id, gx, gy)
      for (let step = 0; step < 4 * (W + H); step++) {
        let bx = -1, by = -1, bd = d
        for (const [mx, my] of MOVES) {
          const nx = gx + mx, ny = gy + my
          if (nx < 0 || ny < 0 || nx > xmax || ny > ymax) continue
          const nd = d2(id, nx, ny)
          if (nd >= bd - 1e-9 || grid.collides(m, nx, ny)) continue
          bx = nx; by = ny; bd = nd
        }
        if (bx < 0) break
        gx = bx; gy = by; d = bd; moved = true
      }
      grid.stamp(s, gx, gy)
      boxes.set(id, [gx + pad, gy + pad, w, h])
    }
    if (!moved) break
    loose = detached(boxes)
  }
  return boxes
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
 * the count (at least the hole's ry + 24) plus 10, never more than the stage's own half height. The cut is a
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
 * - With hole: the ellipse radii kept empty at the centre instead of holeRadii(layout.F); [0, 0] keeps none.
 * - With fit (filtered states, needs fixedStage): after packing, the stage height is trimmed about the count
 *   (fitStage), so the returned H can be less than fixedStage's and box y's move up by the same amount.
 * - With maxBase (share images): the search never goes above it, so no tile is longer than maxBase · max rel.
 */
export function packBest(
  birds: PackBird[], layout: Layout, mode: 'even' | 'true',
  opts: {
    targets?: Map<number, [number, number]>; refBase?: number; fixedStage?: [number, number]
    rel?: Map<number, number>; fit?: boolean; hole?: [number, number]; maxBase?: number
  } = {},
): PackResult {
  const { targets, refBase, fixedStage, fit } = opts
  if (!birds.length) {
    const [W, H] = fixedStage ?? [layout.W, layout.H]
    return { base: refBase ?? 0, ...(fit && fixedStage ? fitStage(new Map(), W, H, holeRadii(layout.F)[1]) : { W, H, boxes: new Map() }) }
  }
  const rel = opts.rel ?? relSizes(birds, mode === 'even' ? EXP : EXP_TRUE)
  const hole = opts.hole ?? holeRadii(layout.F)
  const cell = DEFAULT_CELL
  let area = 0 // sum of rel² · mask fill, summed in placement order so it never depends on input order
  for (const b of placementOrder(birds, rel)) area += rel.get(b.id)! ** 2 * maskFill(b.mask)
  const clamp = refBase ? ([0.7 * refBase, MAXUP * refBase] as const) : null
  // Dense: the whole list (rel covers it, also for a filtered state) has at least layout.denseFrom birds. Its even
  // (centre-packed) states keep one GAP between birds and are settled after packing, so small birds sit as close
  // at the edge as in the middle. True size (targets: it follows the settled even centres) and share images
  // (no denseFrom) pack as before, and so do smaller lists.
  const dense = mode === 'even' && !targets && !!layout.denseFrom && rel.size >= layout.denseFrom
  const tryPack = (W: number, H: number, base: number) => packGrid(birds, rel, W, H, base, stretchAt(layout, H), hole, targets, cell, dense)
  // Settled (dense), then any detached birds gathered back to the group (gather): the outline stays compact.
  const boxesOf = (p: Packed, W: number, H: number) => gather(dense ? settle(p, W, H, hole) : p.boxes, birds, W, H, hole)

  // Search range. Full collage: [0.6, 1.6] x the area estimate, capped at MAX_BASE. With refBase (filtered
  // states): the reference's window [0.7, MAXUP] x refBase, searched directly (it may exceed MAX_BASE).
  const range = (W: number, H: number): [number, number] => {
    if (clamp) return [clamp[0], clamp[1]]
    const usable = Math.max(1, W * H - Math.PI * hole[0] * hole[1])
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
    const got = search(W, H).best ?? fallback(W, H)
    const boxes = boxesOf(got.packed, W, H)
    if (!fit) return { base: got.base, W, H, boxes }
    const t = fitStage(boxes, W, H, hole[1])
    return { base: got.base, W: t.W, H: t.H, boxes: t.boxes }
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
 * - hole: ellipse radii [rx, ry] kept empty at the frame's centre for the count, as fractions of the frame's width
 *   (the same in layout units and in pixels); none by default.
 * - maxTile: no tile's long side is longer than this fraction of the frame's width (a short list then sits as a
 *   ring around the count instead of a few giant stickers).
 */
export function packFrame(birds: PackBird[], aspect: number, opts: { hole?: [number, number]; maxTile?: number } = {}): PackResult {
  const rel = relSizes(birds, EXP)
  let area = 0, maxRel = 1
  for (const b of placementOrder(birds, rel)) { const r = rel.get(b.id)!; area += r ** 2 * maskFill(b.mask); maxRel = Math.max(maxRel, r) }
  const [hx, hy] = opts.hole ?? [0, 0]
  // packBest's estimate is base = sqrt(0.55 · usable / area); solve it for the frame at frameBase, where usable is the
  // frame's area less the hole's: W² · (1 / aspect − π · hx · hy).
  const usable = (frameBase(birds.length) ** 2 * Math.max(area, 0.05)) / 0.55
  const free = Math.max(0.2 / aspect, 1 / aspect - Math.PI * hx * hy)
  const W = Math.max(8, Math.ceil(Math.sqrt(usable / free)))
  const H = Math.max(8, Math.round(W / aspect))
  const hole: [number, number] = hx > 0 && hy > 0 ? [hx * W, hy * W] : [0, 0]
  const maxBase = opts.maxTile ? (opts.maxTile * W) / maxRel : undefined
  const frame = { W, H, stretch: aspect, F: 0 }
  return packBest(birds, frame, 'even', { fixedStage: [W, H], rel, hole, maxBase })
}
