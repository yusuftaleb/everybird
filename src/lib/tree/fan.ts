// The Tree view's fan and circle (the Layout menu's Fan and Radial, and the tree's share images in those layouts): the
// same drawing as the rows, read in polar coordinates. The root sits at the centre; the tips sit on a half disc's arc
// from the left end to the right (the fan) or all round a full circle, clockwise from the top (the circle), in the rows'
// top-to-bottom order; time runs outward: a node's radius is (1 - age / rootAge) of the tips', so the age axis becomes
// rings. A branch is an arc along its parent's ring, a rounded join, then a line out along the child's radius. Every tip
// has its label past it, turned along its radius and never upside down (fitRound sizes the drawing so that none is
// cut or touches another; on screen, round 6, the labels' reach is centred in the whole width and, last before
// refusing, the sticker's box shrinks to the name's line). On screen the Radial with its time scale opens at the top
// (RADIAL_GAP), and its ages are written in that opening, where no branch runs (inOpening). Pure: no React, no DOM.
import { CORNER, branchesOf, circlePath, type Drawing, type Leaf, type Node } from './tree'

/** From this width (px) the Tree view draws a fan unless a layout is picked (and only when every name fits); under it,
 *  rows. */
export const FAN_FROM = 720
/** A tip's label, in units of its name's size: the gap after the tip's dot and after the sticker (and before the count),
 *  the sticker's box (square), the name's line and the count's size. On screen the name is 13px: a 6px gap, a 24px box,
 *  an 11px count. */
export const LABEL_GAP = 6 / 13
export const LABEL_STICKER = 24 / 13
export const LABEL_LINE = 17 / 13
export const LABEL_COUNT = 11 / 13
/** Under the fan's centre: the age axis's numbers. */
export const FAN_BELOW = 30
/** The tips' radius is at least this (px), and grows past FAN_R_MAX only when the tips need the room. */
export const FAN_R_MIN = 80
export const FAN_R_MAX = 440

export type FanShape = 'fan' | 'circle'
/** The centre and the tips' radius; `shape` absent is the fan. `open` (the circle only, radians): an opening at the top,
 *  past the one tip's slot between its last tip and its first (round 6: the screen's Radial writes its ages there). */
export type FanBox = { cx: number; cy: number; R: number; shape?: FanShape; open?: number }

/** A tip's label measured at a name size of 1 (multiply by the size): its name's width, its count's (0: none), and
 *  whether the tip has a bird on the list. */
export type LabelSpan = { name: number; count: number; on: boolean }
/** The sizes a fit may use: the name's size and the smallest it may shrink to, the tips' dot radius, the radius's bounds,
 *  and the room under the fan's centre. `stFloor`: the smallest the sticker's box may get, in units of the name's size
 *  (LABEL_STICKER, the default, keeps it). `fill`: the labels' reach, not the centre, is centred in the width, so the
 *  drawing may use all of it (no `room.h` then). `gap` (the circle): the least angle (radians) between its last tip and
 *  its first, for its opening. `keepCounts`: no count goes (the share image shrinks instead, round 6, item 9). */
export type LabelSizes = { base: number; floor: number; dot: number; rMin?: number; rMax?: number; below?: number; stFloor?: number; fill?: boolean; gap?: number; keepCounts?: boolean }
/** On screen (round 6, for big steps): 13px names, never under 11px; the whole width; and, last before refusing, the
 *  sticker's box down to the name's line. */
export const SCREEN_SIZES: LabelSizes = { base: 13, floor: 11, dot: 3.5, stFloor: LABEL_LINE, fill: true }
/** The screen's Radial with its time scale: the least opening at the top (16°), where its ages are written. */
export const RADIAL_GAP = (16 * Math.PI) / 180

/** A fan or circle in which every tip has its name: the box (its centre about its own top-left corner), its size, the
 *  names' size `px`, the sticker's box `st` (px), which tips keep their count, and how far the drawing and its labels reach
 *  above (`up`) and below (`down`) the centre (the fan's `down` is the room kept under it), whatever height `h` was given. */
export type RoundFit = FanBox & { w: number; h: number; px: number; st: number; counts: boolean[]; up: number; down: number }

/**
 * The fan or circle (`shape`) whose every tip has its name in full, in `room` (its width; `h` caps its height when
 * given, as in a share image; on screen the page grows instead). Each label reads out along its radius: the tip's dot, a
 * gap, the sticker's box, a gap, the name, a gap, the count. No two labels touch: neighbouring sticker boxes (the label's
 * thickest part) sit a box apart where they start, and the labels only part further outward. The radius grows as the
 * tips need; on a narrow column the type shrinks toward `sizes.floor`; past that the counts go, those of tips without a
 * bird on the list first, and only where they hold the drawing in; past that (with `sizes.stFloor`) the sticker's box
 * shrinks toward it, the type and counts tried again at each size. With `sizes.fill` the labels' reach is centred in the
 * width rather than the centre, so a long label on one side may use the other side's room. Undefined when even then a
 * name does not fit.
 */
export function fitRound(spans: readonly LabelSpan[], shape: FanShape, room: { w: number; h?: number }, sizes: LabelSizes = SCREEN_SIZES): RoundFit | undefined {
  const n = spans.length
  if (!n) return undefined
  const { base, floor, dot, rMin = FAN_R_MIN, rMax = FAN_R_MAX, below = FAN_BELOW, stFloor = LABEL_STICKER, fill = false, gap = 0, keepCounts = false } = sizes
  const circle = shape === 'circle'
  // The circle's opening: what its last and first tips' slot (2π / n) lacks of `gap`, taken from the tips' turn.
  const open = circle && n > 1 ? Math.max(0, (n * gap - 2 * Math.PI) / (n - 1)) : 0
  const step = (circle ? 2 * Math.PI - open : Math.PI) / n
  const angles = spans.map((_, i) => fanAngle(i + 0.5, n, shape, open))
  // With `fill` the labels' reach is at least the radius each way, and the radius at least what the tips need at the
  // smallest type and sticker: past the width, no fit (and no search: a big rank, Down to's, answers at once).
  if (fill && 2 * Math.max(rMin, (floor * stFloor) / step - dot - floor * LABEL_GAP) > room.w) return undefined
  let st = LABEL_STICKER
  const ext = (px: number, i: number, count: boolean) => dot + px * (2 * LABEL_GAP + st + spans[i].name + (count && spans[i].count ? LABEL_GAP + spans[i].count : 0))
  // The radius the tips need (sticker boxes a box apart at their inner edge), and the most each tip allows: its label
  // inside the width (unless `fill`: then sides() decides) and, with a height, inside it (the circle centred, so half of
  // it each way).
  const need = (px: number) => Math.max(rMin, (px * st) / step - dot - px * LABEL_GAP)
  const bound = (px: number, i: number, count: boolean) => {
    const a = angles[i], c = Math.abs(Math.cos(a)), sn = Math.sin(a), half = (px * st) / 2
    let b = !fill && c > 1e-6 ? (room.w / 2 - half * Math.abs(sn)) / c : Infinity
    if (room.h !== undefined) {
      const up = circle ? room.h / 2 : room.h - below
      if (Math.abs(sn) > 1e-6 && (circle || sn > 0)) b = Math.min(b, (up - half * c) / Math.abs(sn))
    }
    return b - ext(px, i, count)
  }
  // With `fill`: how far the labels reach left and right of the centre at radius R, and the tip reaching furthest on each side.
  const sides = (R: number, px: number, counts: readonly boolean[]) => {
    const half = (px * st) / 2
    let l = R, r = R, li = -1, ri = -1
    angles.forEach((a, i) => {
      const x = (R + ext(px, i, counts[i])) * Math.cos(a), h = half * Math.abs(Math.sin(a))
      if (x + h > r) { r = x + h; ri = i }
      if (h - x > l) { l = h - x; li = i }
    })
    return { l, r, li, ri }
  }
  const tryFit = (px: number, counts: boolean[]) => {
    const r = need(px)
    let hi = Infinity
    for (let i = 0; i < n; i++) hi = Math.min(hi, bound(px, i, counts[i]))
    if (!fill) return { r, hi, ok: r <= hi }
    const side = sides(r, px, counts)
    return { r, hi, ok: r <= hi && side.l + side.r <= room.w }
  }
  const all = spans.map(() => true)
  let px = base
  let counts = all
  let f = tryFit(px, counts)
  for (let k = 0; ; k++) {
    // At each sticker size (the full box first; with stFloor, smaller, in 1/13 em steps): the type in eight steps down
    // to the floor, then the counts that hold the drawing in.
    st = Math.max(stFloor, LABEL_STICKER - k / 13)
    px = base
    counts = all
    f = tryFit(px, counts)
    for (let j = 1; !f.ok && j <= 8; j++) { px = base - ((base - floor) * j) / 8; f = tryFit(px, counts) }
    for (const on of keepCounts ? [] : [false, true]) {
      while (!f.ok) {
        const cut = (i: number) => counts[i] && !!spans[i].count && spans[i].on === on
        let drop: boolean[]
        if (fill) {
          // The tips reaching furthest out on either side, where their count is what holds them out.
          const side = sides(f.r, px, counts)
          drop = spans.map((_, i) => cut(i) && (i === side.li || i === side.ri))
        } else drop = spans.map((_, i) => cut(i) && bound(px, i, true) < f.r)
        if (!drop.some(Boolean)) break
        counts = counts.map((c, i) => c && !drop[i])
        f = tryFit(px, counts)
      }
    }
    if (f.ok || st <= stFloor) break
  }
  if (!f.ok) return undefined
  let R = Math.max(f.r, Math.min(f.hi, rMax))
  let cx = room.w / 2
  if (fill) {
    // The largest radius up to rMax (or the one the tips need) whose labels still fit the width, their reach centred.
    const fits = (r: number) => { const sd = sides(r, px, counts); return sd.l + sd.r <= room.w }
    if (!fits(R)) {
      let lo = f.r, hi = R
      for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m }
      R = lo
    }
    const sd = sides(R, px, counts)
    cx = sd.l + (room.w - sd.l - sd.r) / 2
  }
  // How far the labels reach above and below the centre (the circle's both ways; the fan's age numbers under it).
  const half = (px * st) / 2
  let top = R, bottom = R
  angles.forEach((a, i) => {
    const out = R + ext(px, i, counts[i]), sn = Math.sin(a), side = half * Math.abs(Math.cos(a))
    top = Math.max(top, out * sn + side)
    bottom = Math.max(bottom, -out * sn + side)
  })
  top = Math.ceil(top)
  const h = room.h !== undefined && circle ? room.h : circle ? top + Math.ceil(bottom) : top + below
  const cy = room.h !== undefined && circle ? room.h / 2 : top
  return { cx, cy, R, ...(circle ? { shape } : {}), ...(open ? { open } : {}), w: room.w, h: room.h !== undefined && !circle ? Math.min(h, room.h) : h, px, st: px * st, counts, up: top, down: circle ? Math.ceil(bottom) : below }
}

/** The largest size in [lo, hi] at which `at` fits (the fit holds at every size under it), and that fit; undefined when
 *  not even `lo` fits. One search for the screen (fitScreen) and the share image (tree-image.ts fitImage). */
export function largestFit(at: (px: number) => RoundFit | undefined, lo: number, hi: number, steps = 18): RoundFit | undefined {
  if (!at(lo)) return undefined
  for (let i = 0; i < steps; i++) { const m = (lo + hi) / 2; if (at(m)) lo = m; else hi = m }
  return at(lo)
}

/** The smallest name on screen, in px per px of width: the share image's 0.5 units on its 1080-unit card, at the screen's
 *  scale (round 6, item 12: the screen shrinks as far as the image does). */
export const SCREEN_SHRINK = 0.5 / 1080

/**
 * The screen's Fan or Radial (round 6, item 12: the layout picked is always drawn, as in Share and Print). At
 * SCREEN_SIZES when every name fits there (13px down to the 11px floor, the counts and the sticker's box giving way
 * first); else at the largest size under the floor that names every tip, down to SCREEN_SHRINK of the width, the tips'
 * dots shrinking with the names (`dotK`). Its `px` under `sizes.floor` is what the small-names note reads. Undefined only
 * when not even that fits (a column too narrow for the drawing at all).
 */
export function fitScreen(spans: readonly LabelSpan[], shape: FanShape, w: number, sizes: LabelSizes = SCREEN_SIZES): RoundFit | undefined {
  const full = fitRound(spans, shape, { w }, sizes)
  if (full) return full
  // Ten halvings: within a thousandth of the floor, ample on screen (a big rank costs each one a fit).
  return largestFit((px) => fitRound(spans, shape, { w }, { ...sizes, base: px, floor: px, dot: sizes.dot * dotK(px, sizes) }), SCREEN_SHRINK * w, sizes.floor, 10)
}
/** How much of their full size the tips' dots and branches keep at names of `px` (full from the floor up). */
export const dotK = (px: number, sizes: Pick<LabelSizes, 'floor'> = SCREEN_SIZES): number => Math.min(1, px / sizes.floor)

/** The angle (radians) at `y` leaf units of `n` leaves, each tip mid-slot: the fan from π at the left end to 0 at the
 *  right; the circle from π/2 at the top, clockwise all round, less its opening `open` there (half each side). */
export const fanAngle = (y: number, n: number, shape: FanShape = 'fan', open = 0): number =>
  shape === 'circle' ? Math.PI / 2 - open / 2 - ((2 * Math.PI - open) * y) / n : Math.PI * (1 - y / n)
export const polar = (box: FanBox, r: number, a: number): [number, number] => [box.cx + r * Math.cos(a), box.cy - r * Math.sin(a)]

const n1 = (v: number) => +v.toFixed(1)

/** A tip of the fan: its angle and the point on the arc. */
export type FanTip = { a: number; x: number; y: number }
/** A point in px. */
export type Pt = [number, number]

/**
 * The fan's or circle's drawing (`box.shape`), the rows' `drawTree` in polar form: the same strokes and dotted parts,
 * in px about `box`. `tips[i]` is the i-th leaf's place on the tips' ring.
 */
export function drawFan(root: Node | Leaf, seen: (leaf: Leaf, i: number) => boolean, stemAge: number | undefined, dotted: (leaf: Leaf, i: number) => boolean, box: FanBox): Drawing & { tips: FanTip[]; ends: Pt[] } {
  const { leaves, branches, rootAge } = branchesOf(root, seen, (i) => i + 0.5, stemAge, dotted)
  const n = leaves.length
  const rad = (age: number) => (1 - age / rootAge) * box.R
  const ang = (y: number) => fanAngle(y, n, box.shape, box.open)
  const P = (r: number, a: number) => { const [x, y] = polar(box, r, a); return `${n1(x)} ${n1(y)}` }
  const on: string[] = [], onDot: string[] = [], off: string[] = [], offDot: string[] = []
  const ends: Pt[] = []
  for (const b of branches) {
    const rp = rad(b.pa), rc = rad(b.ca), ap = ang(b.py), ac = ang(b.cy)
    ends.push(polar(box, rp, ap), polar(box, rc, ac))
    let line: string, dot = ''
    if (rp < 0.5 || Math.abs(ap - ac) * rp < 0.05) {
      // From the centre, or straight on: one line out.
      line = `M${P(rp, ap)}L${P(rc, ac)}`
      if (b.dot) { dot = line; line = '' }
    } else {
      const r = Math.min(CORNER, rp * Math.abs(ap - ac), Math.max(0, rc - rp))
      const ae = ac + Math.sign(ap - ac) * (r / rp)
      // Screen y points down, so a falling angle turns clockwise: sweep 1. A child is never more than half its
      // parent's span away (the parent sits midway between its first and last child), so the small arc is right.
      const turn = `M${P(rp, ap)}A${n1(rp)} ${n1(rp)} 0 0 ${ac < ap ? 1 : 0} ${P(rp, ae)}Q${P(rp, ac)} ${P(rp + r, ac)}`
      if (b.dot) { line = turn; dot = `M${P(rp + r, ac)}L${P(rc, ac)}` } else line = `${turn}L${P(rc, ac)}`
    }
    if (line) (b.on ? on : off).push(line)
    if (dot) (b.on ? onDot : offDot).push(dot)
  }
  const tips = leaves.map((_, i) => { const a = ang(i + 0.5); const [x, y] = polar(box, box.R, a); return { a, x, y } })
  return { leaves, seen: on.join(''), unseen: off.join(''), seenDot: onDot.join(''), unseenDot: offDot.join(''), rootAge, tips, ends }
}

/** An age's ring of radius `r` about the centre: the fan's half circle, left to right over the top; the circle's whole. */
export const fanRing = (box: FanBox, r: number): string =>
  box.shape === 'circle' ? circlePath(box.cx, box.cy, n1(r))
    : `M${n1(box.cx - r)} ${n1(box.cy)}A${n1(r)} ${n1(r)} 0 0 1 ${n1(box.cx + r)} ${n1(box.cy)}`

/** Where the age of the ring of radius `r` is written, where no branch runs (round 6): under the fan's centre on both
 *  sides (once for a ring too small to split; the branches all run above it), or where the ring crosses the circle's
 *  radius straight up, the one radius between its last tip and its first that no branch crosses (on screen, the middle
 *  of its opening). */
export function ringLabels(box: FanBox, r: number): [number, number][] {
  if (box.shape === 'circle') return [[box.cx, box.cy - r]]
  return r > 12 ? [[box.cx + r, box.cy], [box.cx - r, box.cy]] : [[box.cx + r, box.cy]]
}

/** Whether a `w` × `h` patch centred on the circle's radius straight up, `r` from its centre, lies inside its opening
 *  between its last tip and its first (`n` tips; with `pad` px of air), where no branch runs: every branch lies within
 *  the tips' turn (round 6: the screen's Radial writes its ages only there). */
export function inOpening(box: FanBox, n: number, r: number, w: number, h: number, pad = 2): boolean {
  const open = box.open ?? 0
  const half = ((2 * Math.PI - open) / n + open) / 2
  return r - h / 2 > 0 && Math.atan2(w / 2 + pad, r - h / 2) <= half
}

/** Whether a `w` × `h` patch centred at (x, y) leaves every branch end (drawFan's `ends`, with `pad` px of air) in view:
 *  the circle's ages sit on a Paper patch, and one that would hide a branch end is not written. */
export const clearOfEnds = (ends: readonly Pt[], x: number, y: number, w: number, h: number, pad = 2): boolean =>
  ends.every(([ex, ey]) => Math.abs(ex - x) > w / 2 + pad || Math.abs(ey - y) > h / 2 + pad)

/**
 * Where a tip's label starts, `from` px past the tips' ring, and how it turns (degrees, clockwise as CSS and canvas
 * turn): along its radius, never upside down. On the left half (`flip`) the label ends at that point and reads inward.
 */
export function fanLabel(box: FanBox, a: number, from: number): { x: number; y: number; rot: number; flip: boolean } {
  const [x, y] = polar(box, box.R + from, a)
  const deg = (a * 180) / Math.PI
  const flip = Math.cos(a) < -1e-9
  return { x, y, rot: flip ? 180 - deg : -deg, flip }
}
