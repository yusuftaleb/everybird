// The Tree view's fan (wide screens and the tree's square and wide share images): the same drawing as the rows, read
// in polar coordinates. The root sits at the centre of a half disc, the tips on its arc from the left end to the right
// in the rows' top-to-bottom order, and time runs outward: a node's radius is (1 - age / rootAge) of the arc's, so the
// age axis becomes rings. A branch is an arc along its parent's ring, a rounded join, then a line out along the
// child's radius. Names sit past the tips, turned along their radius and never upside down. Pure: no React, no DOM.
import { CORNER, branchesOf, circlePath, type Drawing, type Leaf, type Node } from './tree'

/** From this width (px) the Tree view draws a fan; under it, rows. */
export const FAN_FROM = 720
/** Past the tips' ring: the gap, a sticker's slot, the gap, a name's room (px). */
export const FAN_GAP = 6
export const FAN_STICKER = 24
export const FAN_LABEL = 132
export const FAN_OUT = FAN_GAP + FAN_STICKER + FAN_GAP + FAN_LABEL
/** Under the centre: the age axis's numbers. */
export const FAN_BELOW = 30
/** The arc's radius stays between these (px). */
export const FAN_R_MIN = 80
export const FAN_R_MAX = 440

/** The fan's centre and the tips' radius. */
export type FanBox = { cx: number; cy: number; R: number }

/** The fan for a column `width` px wide: as large as the names' room on both sides allows; `h` its height. */
export function fanBox(width: number): FanBox & { h: number } {
  const R = Math.round(Math.max(FAN_R_MIN, Math.min(FAN_R_MAX, width / 2 - FAN_OUT)))
  return { cx: width / 2, cy: FAN_OUT + R, R, h: FAN_OUT + R + FAN_BELOW }
}

/** The angle (radians) at `y` leaf units of `n` leaves: π at the left end, 0 at the right, each tip mid-slot. */
export const fanAngle = (y: number, n: number): number => Math.PI * (1 - y / n)
export const polar = (box: FanBox, r: number, a: number): [number, number] => [box.cx + r * Math.cos(a), box.cy - r * Math.sin(a)]

const n1 = (v: number) => +v.toFixed(1)

/** A tip of the fan: its angle and the point on the arc. */
export type FanTip = { a: number; x: number; y: number }

/**
 * The fan's drawing, the rows' `drawTree` in polar form: the same strokes, dotted parts and node dots, in px about
 * `box`. `tips[i]` is the i-th leaf's place on the arc.
 */
export function drawFan(root: Node | Leaf, seen: (leaf: Leaf, i: number) => boolean, stemAge: number | undefined, dotted: (leaf: Leaf, i: number) => boolean, box: FanBox): Drawing & { tips: FanTip[] } {
  const { leaves, branches, joints, rootAge } = branchesOf(root, seen, (i) => i + 0.5, stemAge, dotted)
  const n = leaves.length
  const rad = (age: number) => (1 - age / rootAge) * box.R
  const ang = (y: number) => fanAngle(y, n)
  const P = (r: number, a: number) => { const [x, y] = polar(box, r, a); return `${n1(x)} ${n1(y)}` }
  const on: string[] = [], onDot: string[] = [], off: string[] = [], offDot: string[] = [], onN: string[] = [], offN: string[] = []
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
      // Screen y points down, so a falling angle turns clockwise: sweep 1.
      const turn = `M${P(rp, ap)}A${n1(rp)} ${n1(rp)} 0 0 ${ac < ap ? 1 : 0} ${P(rp, ae)}Q${P(rp, ac)} ${P(rp + r, ac)}`
      if (b.dot) { line = turn; dot = `M${P(rp + r, ac)}L${P(rc, ac)}` } else line = `${turn}L${P(rc, ac)}`
    }
    if (line) (b.on ? on : off).push(line)
    if (dot) (b.on ? onDot : offDot).push(dot)
  }
  for (const j of joints) { const [x, y] = polar(box, rad(j.age), ang(j.y)); (j.on ? onN : offN).push(circlePath(x, y)) }
  const tips = leaves.map((_, i) => { const a = ang(i + 0.5); const [x, y] = polar(box, box.R, a); return { a, x, y } })
  return { leaves, seen: on.join(''), unseen: off.join(''), seenDot: onDot.join(''), unseenDot: offDot.join(''), seenNodes: onN.join(''), unseenNodes: offN.join(''), rootAge, tips }
}

/** An age's ring: a half circle of radius `r` about the centre, left to right over the top. */
export const fanRing = (box: FanBox, r: number): string => `M${n1(box.cx - r)} ${n1(box.cy)}A${n1(r)} ${n1(r)} 0 0 1 ${n1(box.cx + r)} ${n1(box.cy)}`

/**
 * Where a tip's name starts, `from` px past the arc, and how it turns (degrees, clockwise as CSS and canvas turn):
 * along its radius, never upside down. On the left half (`flip`) the name ends at that point and reads inward.
 */
export function fanLabel(box: FanBox, a: number, from: number): { x: number; y: number; rot: number; flip: boolean } {
  const [x, y] = polar(box, box.R + from, a)
  const deg = (a * 180) / Math.PI
  const flip = Math.cos(a) < -1e-9
  return { x, y, rot: flip ? 180 - deg : -deg, flip }
}

/**
 * Which tips get their name: those with `n` > 0, largest `n` first (the earlier on a tie), each kept unless its
 * position `y` would come within `h` (a name's height and its air) of a name already kept. Indexes into `rows`.
 * The rows' `y` is a row's centre; the fan's the arc length at the names' radius.
 */
export function keepNames(rows: readonly { y: number; n: number }[], h: number): Set<number> {
  const order = rows.map((_, i) => i).filter((i) => rows[i].n > 0).sort((a, b) => rows[b].n - rows[a].n || a - b)
  const kept: number[] = []
  for (const i of order) if (kept.every((j) => Math.abs(rows[j].y - rows[i].y) >= h)) kept.push(i)
  return new Set(kept)
}
