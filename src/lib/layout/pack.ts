// The collage packer: a TypeScript port of pack(), best_layout() and trim_to_content() from
// framer-site/scripts/lifelist/build_lifelist.py. Runs in a Web Worker and on the server.
//
// Box semantics (what the renderer places): Box = [x, y, w, h] in layout units, on a stage of W x H layout
// units with the origin at its top-left. (x, y) is the top-left corner of the sticker's tile and w x h is its
// size. The tile's long side is base · rel (at least 2) and its aspect is the mask's (mask.w / mask.h, which
// follows the sticker image's `ar` to within the mask's rounding). Draw the sticker image to fill the box.
// The species count sits at the stage centre (W / 2, H / 2), inside the ellipse holeRadii(layout.F).
// A filtered state (packBest with `fit`) is packed in the full collage's stage, then its height is trimmed
// symmetrically about the count (fitStage): W is unchanged, H shrinks, every box moves up by the same amount.
import { EXP, EXP_TRUE, GAP, MAXUP, holeRadii } from './constants'
import { CentreWalk, Grid, SPIRAL_T, cellMask, spiral, spiralFrom } from './grid'
import { MASK, type Mask } from './mask'

export type PackBird = { id: number; mass: number; mask: Mask }
export type Box = [x: number, y: number, w: number, h: number] // layout units
export type PackResult = { base: number; W: number; H: number; boxes: Map<number, Box> }
/** What the packer reads from a layout: one of LAYOUTS, or an ad hoc frame (share images, packFrame). */
type Layout = { W: number; H: number; stretch: number; F: number; minBase: number }

export const DEFAULT_CELL = 2 // layout units per occupancy cell
const MIN_MASS = 0.1 // grams; guards mass ** exp against 0 or bad data
const STEPS = 7 // binary-search steps
export const MAX_BASE = 80 // largest base for a full collage (the reference's search ceiling)
const TRIM_PAD = 8
const GROW = 1.25, MAX_GROW = 12

/** Relative tile size per bird: mass ** exp, scaled so the smallest bird is 1. */
export function relSizes(birds: PackBird[], exp: number): Map<number, number> {
  const m = (b: PackBird) => (Number.isFinite(b.mass) ? Math.max(MIN_MASS, b.mass) : MIN_MASS) ** exp
  let lo = Infinity
  for (const b of birds) lo = Math.min(lo, m(b))
  return new Map(birds.map((b) => [b.id, m(b) / lo]))
}

/** Largest first; ties broken by id, so the order never depends on the input order. */
function placementOrder(birds: PackBird[], rel: Map<number, number>): PackBird[] {
  return [...birds].sort((a, b) => rel.get(b.id)! - rel.get(a.id)! || a.id - b.id)
}

/**
 * Place every bird at long side base · rel around the central hole; boxes, or null if one doesn't fit.
 * Birds spiral out from the stage centre (x stretched by `stretch`). With `targets` (id -> centre), each bird
 * spirals from its own target with no stretch: true size is packed from the evened-out positions, so
 * switching modes is a short morph.
 */
export function pack(
  birds: PackBird[], rel: Map<number, number>, W: number, H: number, base: number,
  stretch: number, hole: [number, number], targets?: Map<number, [number, number]>, cell = DEFAULT_CELL,
): Map<number, Box> | null {
  const grid = new Grid(W, H, cell)
  if (hole[0] > 0 && hole[1] > 0) grid.markEllipse(W / 2, H / 2, hole[0], hole[1])
  const pad = Math.ceil(GAP / cell)
  const sx = (targets ? 1 : stretch) / cell, sy = 1 / cell
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
  for (const b of placementOrder(birds, rel)) {
    const L = Math.max(2, base * rel.get(b.id)!)
    const w = (L * b.mask.w) / MASK, h = (L * b.mask.h) / MASK
    const m = cellMask(b.mask, w, h, cell, pad)
    const at = walk ? walk.place(m) : spiralFrom(grid, m, sp, targets!.get(b.id) ?? [W / 2, H / 2], sx, sy, cell, lim)
    if (!at) return null
    grid.stamp(m, at[0], at[1])
    boxes.set(b.id, [(at[0] + pad) * cell, (at[1] + pad) * cell, w, h])
  }
  return boxes
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
 * The largest base size that packs, for one layout and size mode.
 * - Full collage (no fixedStage): starts on layout.W x layout.H; if the best base is below layout.minBase the
 *   stage grows 25% taller and retries (up to 12x). The result is trimmed to its content.
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
 */
export function packBest(
  birds: PackBird[], layout: Layout, mode: 'even' | 'true',
  opts: {
    targets?: Map<number, [number, number]>; refBase?: number; fixedStage?: [number, number]
    rel?: Map<number, number>; fit?: boolean; hole?: [number, number]
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
  const tryPack = (W: number, H: number, base: number) => pack(birds, rel, W, H, base, layout.stretch, hole, targets, cell)

  // Search range. Full collage: [0.6, 1.6] x the area estimate, capped at MAX_BASE. With refBase (filtered
  // states): the reference's window [0.7, MAXUP] x refBase, searched directly (it may exceed MAX_BASE).
  const range = (W: number, H: number): [number, number] => {
    if (clamp) return [clamp[0], clamp[1]]
    const usable = Math.max(1, W * H - Math.PI * hole[0] * hole[1])
    const est = Math.sqrt((0.55 * usable) / Math.max(area, 1e-9))
    const hi = Math.min(1.6 * est, MAX_BASE)
    return [Math.min(0.6 * est, hi), hi]
  }

  // stopBelow: once the best possible base is known to be below it, stop (the caller grows the stage).
  const search = (W: number, H: number, stopBelow = 0): { base: number; boxes: Map<number, Box> } | null => {
    let [lo, hi] = range(W, H)
    const lo0 = lo
    let best: { base: number; boxes: Map<number, Box> } | null = null
    if (hi - lo < 1e-6) { // the estimate is above MAX_BASE: just try the cap
      const boxes = tryPack(W, H, hi)
      best = boxes && { base: hi, boxes }
    } else {
      for (let s = 0; s < STEPS; s++) { // binary search the largest base that fits
        const mid = (lo + hi) / 2
        const boxes = tryPack(W, H, mid)
        if (boxes) { lo = mid; best = { base: mid, boxes } } else hi = mid
        if (hi <= stopBelow) return best
      }
      if (!best && lo0 >= stopBelow) { // the reference never tries the lower end itself
        const boxes = tryPack(W, H, lo0)
        best = boxes && { base: lo0, boxes }
      }
    }
    if (best && clamp && best.base < clamp[1] && best.base >= clamp[1] * 0.97) { // snap to the cap, as main()
      const boxes = tryPack(W, H, clamp[1])
      if (boxes) best = { base: clamp[1], boxes }
    }
    return best
  }

  // Nothing fits even at the bottom of the range: shrink by 0.85 steps until it does. For a filtered state
  // this goes below 0.7 x refBase (the reference packed at 0.7 x refBase anyway and could fail); the result's
  // base says so, and base / refBase is the scale the caller shows. Practically unreachable: a subset of a
  // collage packed at refBase on the same stage.
  const fallback = (W: number, H: number) => {
    for (let base = range(W, H)[0] * 0.85; base >= 0.5; base *= 0.85) {
      const boxes = tryPack(W, H, base)
      if (boxes) return { base, boxes }
    }
    throw new Error(`packBest: ${birds.length} birds do not fit a ${W}x${H} stage`)
  }

  if (fixedStage) {
    const [W, H] = fixedStage
    const got = search(W, H) ?? fallback(W, H)
    if (!fit) return { base: got.base, W, H, boxes: got.boxes }
    const t = fitStage(got.boxes, W, H, hole[1])
    return { base: got.base, W: t.W, H: t.H, boxes: t.boxes }
  }

  const W = layout.W, Hmax = MAX_GROW * layout.H
  let H: number = layout.H
  let got: { base: number; boxes: Map<number, Box> } | null = null
  for (;;) {
    const canGrow = H * GROW <= Hmax
    // Skip packing a stage whose whole search range is below minBase; it would only grow anyway.
    if (!canGrow || range(W, H)[1] >= layout.minBase) {
      got = search(W, H, canGrow ? layout.minBase : 0)
      if (got && got.base >= layout.minBase) break
    }
    if (!canGrow) break
    H = Math.round(H * GROW)
  }
  got ??= fallback(W, H)
  const t = trimToContent(got.boxes, W, H)
  return { base: got.base, W: t.W, H: t.H, boxes: t.boxes }
}

// packFrame's target base: the site's typical sizes (so GAP and the cell grid look the same) up to 300 birds,
// then smaller, down to the narrow layout's minBase at 5,000, so a huge list still packs in seconds.
const frameBase = (n: number) => (n <= 300 ? 28 : Math.max(10, 28 * Math.sqrt(300 / n)))
/**
 * Share images: pack `birds` (relative sizes over these birds, evened out) into a frame of aspect W / H with no
 * hole at the centre (the count sits under the collage), as large as fits. The frame's size in layout units is
 * chosen so the base lands near frameBase(n) whatever the count; the caller scales the result to its pixels.
 */
export function packFrame(birds: PackBird[], aspect: number): PackResult {
  const rel = relSizes(birds, EXP)
  let area = 0
  for (const b of placementOrder(birds, rel)) area += rel.get(b.id)! ** 2 * maskFill(b.mask)
  // packBest's estimate is base = sqrt(0.55 · usable / area); solve it for the usable area at frameBase.
  const usable = (frameBase(birds.length) ** 2 * Math.max(area, 0.05)) / 0.55
  const H = Math.max(8, Math.ceil(Math.sqrt(usable / aspect)))
  const W = Math.max(8, Math.round(H * aspect))
  const frame = { W, H, stretch: aspect, F: 0, minBase: 0 }
  return packBest(birds, frame, 'even', { fixedStage: [W, H], rel, hole: [0, 0] })
}
