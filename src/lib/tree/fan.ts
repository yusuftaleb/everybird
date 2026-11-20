// The Tree view's fan and circle (the Layout menu's Fan and Radial, and the tree's share images in those layouts): the
// same drawing as the rows, read in polar coordinates. The root sits at the centre; the tips sit on a half disc's arc
// from the left end to the right (the fan) or all round a full circle, clockwise from the top (the circle), in the rows'
// top-to-bottom order; time runs outward: a node's radius is (1 - age / rootAge) of the tips', so the age axis becomes
// rings. A branch is an arc along its parent's ring, a rounded join, then a line out along the child's radius. Every tip
// has its label past it, turned along its radius and never upside down (fitRound sizes the drawing so that none is
// cut or touches another). Pure: no React, no DOM.
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
/** The centre and the tips' radius; `shape` absent is the fan. */
export type FanBox = { cx: number; cy: number; R: number; shape?: FanShape }

/** A tip's label measured at a name size of 1 (multiply by the size): its name's width, its count's (0: none), and
 *  whether the tip has a bird on the list. */
export type LabelSpan = { name: number; count: number; on: boolean }
/** The sizes a fit may use: the name's size and the smallest it may shrink to, the tips' dot radius, the radius's bounds,
 *  and the room under the fan's centre. */
export type LabelSizes = { base: number; floor: number; dot: number; rMin?: number; rMax?: number; below?: number }
/** On screen: 13px names, never under 11px. */
export const SCREEN_SIZES: LabelSizes = { base: 13, floor: 11, dot: 3.5 }

/** A fan or circle in which every tip has its name: the box (its centre about its own top-left corner), its size, the
 *  names' size `px` and which tips keep their count. */
export type RoundFit = FanBox & { w: number; h: number; px: number; counts: boolean[] }

/**
 * The fan or circle (`shape`) whose every tip has its name in full, in `room` (its width; `h` caps its height when
 * given, as in a share image; on screen the page grows instead). Each label reads out along its radius: the tip's dot, a
 * gap, the sticker's box, a gap, the name, a gap, the count. No two labels touch: neighbouring sticker boxes (the label's
 * thickest part) sit a box apart where they start, and the labels only part further outward. The radius grows as the
 * tips need; on a narrow column the type shrinks toward `sizes.floor`; past that the counts go, those of tips without a
 * bird on the list first, and only where they hold the drawing in. Undefined when even then a name does not fit.
 */
export function fitRound(spans: readonly LabelSpan[], shape: FanShape, room: { w: number; h?: number }, sizes: LabelSizes = SCREEN_SIZES): RoundFit | undefined {
  const n = spans.length
  if (!n) return undefined
  const { base, floor, dot, rMin = FAN_R_MIN, rMax = FAN_R_MAX, below = FAN_BELOW } = sizes
  const circle = shape === 'circle'
  const step = (circle ? 2 * Math.PI : Math.PI) / n
  const angles = spans.map((_, i) => fanAngle(i + 0.5, n, shape))
  const ext = (px: number, i: number, count: boolean) => dot + px * (2 * LABEL_GAP + LABEL_STICKER + spans[i].name + (count && spans[i].count ? LABEL_GAP + spans[i].count : 0))
  // The radius the tips need (sticker boxes a box apart at their inner edge), and the most each tip allows: its label
  // inside the width and, with a height, inside it (the circle centred, so half of it each way).
  const need = (px: number) => Math.max(rMin, (px * LABEL_STICKER) / step - dot - px * LABEL_GAP)
  const bound = (px: number, i: number, count: boolean) => {
    const a = angles[i], c = Math.abs(Math.cos(a)), sn = Math.sin(a), half = (px * LABEL_STICKER) / 2
    let b = c > 1e-6 ? (room.w / 2 - half * Math.abs(sn)) / c : Infinity
    if (room.h !== undefined) {
      const up = circle ? room.h / 2 : room.h - below
      if (Math.abs(sn) > 1e-6 && (circle || sn > 0)) b = Math.min(b, (up - half * c) / Math.abs(sn))
    }
    return b - ext(px, i, count)
  }
  const tryFit = (px: number, counts: boolean[]) => {
    const r = need(px)
    let hi = Infinity
    for (let i = 0; i < n; i++) hi = Math.min(hi, bound(px, i, counts[i]))
    return { r, hi, ok: r <= hi }
  }
  const all = spans.map(() => true)
  let px = base
  let counts = all
  let f = tryFit(px, counts)
  // Smaller type first (in eight steps down to the floor), then the counts that hold the drawing in.
  for (let k = 1; !f.ok && k <= 8; k++) { px = base - ((base - floor) * k) / 8; f = tryFit(px, counts) }
  for (const on of [false, true]) {
    while (!f.ok) {
      const drop = spans.map((s, i) => counts[i] && !!s.count && s.on === on && bound(px, i, true) < f.r)
      if (!drop.some(Boolean)) break
      counts = counts.map((c, i) => c && !drop[i])
      f = tryFit(px, counts)
    }
  }
  if (!f.ok) return undefined
  const R = Math.max(f.r, Math.min(f.hi, rMax))
  // How far the labels reach above and below the centre (the circle's both ways; the fan's age numbers under it).
  const half = (px * LABEL_STICKER) / 2
  let top = R, bottom = R
  angles.forEach((a, i) => {
    const out = R + ext(px, i, counts[i]), sn = Math.sin(a), side = half * Math.abs(Math.cos(a))
    top = Math.max(top, out * sn + side)
    bottom = Math.max(bottom, -out * sn + side)
  })
  top = Math.ceil(top)
  const h = room.h !== undefined && circle ? room.h : circle ? top + Math.ceil(bottom) : top + below
  const cy = room.h !== undefined && circle ? room.h / 2 : top
  return { cx: room.w / 2, cy, R, ...(circle ? { shape } : {}), w: room.w, h: room.h !== undefined && !circle ? Math.min(h, room.h) : h, px, counts }
}

/** The angle (radians) at `y` leaf units of `n` leaves, each tip mid-slot: the fan from π at the left end to 0 at the
 *  right; the circle from π/2 at the top, clockwise all round. */
export const fanAngle = (y: number, n: number, shape: FanShape = 'fan'): number =>
  shape === 'circle' ? Math.PI / 2 - (2 * Math.PI * y) / n : Math.PI * (1 - y / n)
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
  const ang = (y: number) => fanAngle(y, n, box.shape)
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
 *  radius straight up, the one radius between its last tip and its first that no branch crosses. */
export function ringLabels(box: FanBox, r: number): [number, number][] {
  if (box.shape === 'circle') return [[box.cx, box.cy - r]]
  return r > 12 ? [[box.cx + r, box.cy], [box.cx - r, box.cy]] : [[box.cx + r, box.cy]]
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
