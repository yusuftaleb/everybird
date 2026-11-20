// The Tree view's fan and circle (the Layout menu's Fan and Circle, and the tree's square and wide share images): the
// same drawing as the rows, read in polar coordinates. The root sits at the centre; the tips sit on a half disc's arc
// from the left end to the right (the fan) or all round a full circle, clockwise from the top (the circle), in the rows'
// top-to-bottom order; time runs outward: a node's radius is (1 - age / rootAge) of the tips', so the age axis becomes
// rings. A branch is an arc along its parent's ring, a rounded join, then a line out along the child's radius. Names
// sit past the tips, turned along their radius and never upside down. Pure: no React, no DOM.
import { CORNER, branchesOf, circlePath, type Drawing, type Leaf, type Node } from './tree'

/** From this width (px) the Tree view draws a fan unless a layout is picked; under it, rows. */
export const FAN_FROM = 720
/** Past the tips' ring: the gap, a sticker's slot, the gap, a name's room at most (px). */
export const FAN_GAP = 6
export const FAN_STICKER = 24
export const FAN_LABEL = 132
export const FAN_OUT = FAN_GAP + FAN_STICKER + FAN_GAP + FAN_LABEL
/** Under the fan's centre: the age axis's numbers. */
export const FAN_BELOW = 30
/** The tips' radius stays between these (px). */
export const FAN_R_MIN = 80
export const FAN_R_MAX = 440

export type FanShape = 'fan' | 'circle'
/** The centre and the tips' radius; `shape` absent is the fan. */
export type FanBox = { cx: number; cy: number; R: number; shape?: FanShape }

/**
 * The fan or circle for a column `width` px wide: as large as the names' room on both sides allows; `h` its height,
 * `label` the room past the tip and its sticker left for a name (less than FAN_LABEL only where the column is too
 * narrow for the smallest drawing and full room; 0 when there is none).
 */
export function fanBox(width: number, shape: FanShape = 'fan'): FanBox & { h: number; label: number } {
  const R = Math.round(Math.max(FAN_R_MIN, Math.min(FAN_R_MAX, width / 2 - FAN_OUT)))
  const label = Math.max(0, Math.min(FAN_LABEL, Math.floor(width / 2 - R - FAN_GAP * 2 - FAN_STICKER)))
  const out = FAN_GAP * 2 + FAN_STICKER + label
  return shape === 'circle'
    ? { cx: width / 2, cy: out + R, R, shape, h: 2 * (out + R), label }
    : { cx: width / 2, cy: out + R, R, h: out + R + FAN_BELOW, label }
}

/** The angle (radians) at `y` leaf units of `n` leaves, each tip mid-slot: the fan from π at the left end to 0 at the
 *  right; the circle from π/2 at the top, clockwise all round. */
export const fanAngle = (y: number, n: number, shape: FanShape = 'fan'): number =>
  shape === 'circle' ? Math.PI / 2 - (2 * Math.PI * y) / n : Math.PI * (1 - y / n)
export const polar = (box: FanBox, r: number, a: number): [number, number] => [box.cx + r * Math.cos(a), box.cy - r * Math.sin(a)]

const n1 = (v: number) => +v.toFixed(1)

/** A tip of the fan: its angle and the point on the arc. */
export type FanTip = { a: number; x: number; y: number }

/**
 * The fan's or circle's drawing (`box.shape`), the rows' `drawTree` in polar form: the same strokes and dotted parts,
 * in px about `box`. `tips[i]` is the i-th leaf's place on the tips' ring.
 */
export function drawFan(root: Node | Leaf, seen: (leaf: Leaf, i: number) => boolean, stemAge: number | undefined, dotted: (leaf: Leaf, i: number) => boolean, box: FanBox): Drawing & { tips: FanTip[] } {
  const { leaves, branches, rootAge } = branchesOf(root, seen, (i) => i + 0.5, stemAge, dotted)
  const n = leaves.length
  const rad = (age: number) => (1 - age / rootAge) * box.R
  const ang = (y: number) => fanAngle(y, n, box.shape)
  const P = (r: number, a: number) => { const [x, y] = polar(box, r, a); return `${n1(x)} ${n1(y)}` }
  const on: string[] = [], onDot: string[] = [], off: string[] = [], offDot: string[] = []
  for (const b of branches) {
    const rp = rad(b.pa), rc = rad(b.ca), ap = ang(b.py), ac = ang(b.cy)
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
  return { leaves, seen: on.join(''), unseen: off.join(''), seenDot: onDot.join(''), unseenDot: offDot.join(''), rootAge, tips }
}

/** An age's ring of radius `r` about the centre: the fan's half circle, left to right over the top; the circle's whole. */
export const fanRing = (box: FanBox, r: number): string =>
  box.shape === 'circle' ? circlePath(box.cx, box.cy, n1(r))
    : `M${n1(box.cx - r)} ${n1(box.cy)}A${n1(r)} ${n1(r)} 0 0 1 ${n1(box.cx + r)} ${n1(box.cy)}`

/** Where the age of the ring of radius `r` is written: under the fan's centre on both sides (once for a ring too small
 *  to split), or where the ring crosses the circle's downward radius. */
export function ringLabels(box: FanBox, r: number): [number, number][] {
  if (box.shape === 'circle') return [[box.cx, box.cy + r]]
  return r > 12 ? [[box.cx + r, box.cy], [box.cx - r, box.cy]] : [[box.cx + r, box.cy]]
}

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

/** How far (px) a label starting `from` px past the tips' ring can run along its radius at angle `a` before it leaves
 *  the `w` × `h` box the drawing sits in (the hover label turns level when its whole text would not fit). */
export function rayRoom(box: FanBox, w: number, h: number, a: number, from: number): number {
  const dx = Math.cos(a), dy = -Math.sin(a)
  const to = (d: number, c: number, max: number) => (d > 1e-9 ? (max - c) / d : d < -1e-9 ? -c / d : Infinity)
  return Math.min(to(dx, box.cx, w), to(dy, box.cy, h)) - box.R - from
}

/**
 * Which tips get their name: those with `n` > 0 and a `w` (the name's width) within `room` when both are given,
 * largest `n` first (the earlier on a tie), each kept unless its position `y` would come within `h` (a name's height
 * and its air) of a name already kept. With `period` (the circle's circumference at the names' radius) the positions
 * wrap round, so the last tip sits beside the first. Indexes into `rows`. The rows' `y` is a row's centre; the fan's
 * and the circle's the arc length at the names' radius.
 */
export function keepNames(rows: readonly { y: number; n: number; w?: number }[], h: number, room?: number, period?: number): Set<number> {
  const fits = (i: number) => rows[i].n > 0 && (room === undefined || rows[i].w === undefined || rows[i].w! <= room)
  const order = rows.map((_, i) => i).filter(fits).sort((a, b) => rows[b].n - rows[a].n || a - b)
  const gap = (a: number, b: number) => { const d = Math.abs(a - b); return period ? Math.min(d, period - d) : d }
  const kept: number[] = []
  for (const i of order) if (kept.every((j) => gap(rows[j].y, rows[i].y) >= h)) kept.push(i)
  return new Set(kept)
}
