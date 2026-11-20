// The comparison's Venn diagram, the pure geometry: two circles (the first list and one other), their three regions as
// SVG path data (the card draws them with Path2D, the page lays the same paths over the card as pointer shortcuts) and
// where each region's number goes. Pure, no DOM.
import type { PairPart } from './compare'

export type Circle = { cx: number; cy: number; r: number }
export type Spot = { x: number; y: number; w: number }
export type Venn = {
  a: Circle
  b: Circle
  /** Each region's outline; '' for the overlap when the lists share no bird (the circles then stand apart). */
  paths: Record<PairPart, string>
  /** The middle of each region on the circles' centre line, and its width there: where its number and name go. */
  spots: Record<PairPart, Spot>
}
export type VennCounts = Record<PairPart, number>

/** The smaller circle's radius never drops under this share of the bigger one's, so a 50-bird list still reads. */
export const R_MIN = 0.6
/** The overlap's depth, as a share of the smaller radius: from OVERLAP_MIN (few shared birds) to OVERLAP_MAX (the
 *  smaller list all shared), so it never vanishes and both crescents keep room for their numbers. */
export const OVERLAP_MIN = 0.55
export const OVERLAP_MAX = 1.3
/** With no shared bird, the gap between the circles (a share of the smaller radius), room for the "0". */
export const GAP = 0.5

const f = (v: number) => +v.toFixed(2)
const circle = ({ cx, cy, r }: Circle) => `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`

/**
 * The diagram for `n` (the first list's own birds, the shared ones, the other's own), as big as fits `box`, centred.
 * Areas grow with the lists (radius ∝ √ species, the smaller at least R_MIN of the bigger); the overlap deepens with
 * the share of the smaller list that is shared.
 */
export function vennLayout(n: VennCounts, box: { x: number; y: number; w: number; h: number }): Venn {
  const nA = n.first + n.both, nB = n.other + n.both
  const big = Math.max(nA, nB, 1)
  const rel = (v: number) => Math.max(R_MIN, Math.sqrt(v / big))
  const rA = rel(nA), rB = rel(nB), rs = Math.min(rA, rB)
  const share = n.both > 0 ? n.both / Math.max(1, Math.min(nA, nB)) : 0
  const depth = n.both > 0 ? rs * (OVERLAP_MIN + (OVERLAP_MAX - OVERLAP_MIN) * share) : -GAP * rs
  const d = rA + rB - depth // between the centres
  const uw = rA + d + rB, uh = 2 * Math.max(rA, rB)
  const s = Math.min(box.w / uw, box.h / uh)
  const cy = box.y + box.h / 2
  const a: Circle = { cx: box.x + (box.w - uw * s) / 2 + rA * s, cy, r: rA * s }
  const b: Circle = { cx: a.cx + d * s, cy, r: rB * s }

  // The regions' spans on the centre line: the overlap (or the gap) between the inner edges, each crescent outside it.
  const aR = a.cx + a.r, bL = b.cx - b.r
  const lo = Math.min(aR, bL), hi = Math.max(aR, bL)
  const spots: Record<PairPart, Spot> = {
    first: { x: (a.cx - a.r + lo) / 2, y: cy, w: lo - (a.cx - a.r) },
    both: { x: (lo + hi) / 2, y: cy, w: hi - lo },
    other: { x: (hi + b.cx + b.r) / 2, y: cy, w: b.cx + b.r - hi },
  }
  if (n.both <= 0) return { a, b, spots, paths: { first: circle(a), both: '', other: circle(b) } }

  // The two crossing points, on the chord at `xi` from a's centre; each arc's large-arc flag from which side of its
  // circle's centre the chord falls. In SVG's y-down space, sweep 1 runs clockwise.
  const D = d * s
  const xi = (D * D + a.r * a.r - b.r * b.r) / (2 * D)
  const h = Math.sqrt(Math.max(0, a.r * a.r - xi * xi))
  const top = `${f(a.cx + xi)} ${f(cy - h)}`, bottom = `${f(a.cx + xi)} ${f(cy + h)}`
  const aIn = xi < 0 ? 1 : 0 // a's arc inside b is its major arc when the chord is left of a's centre
  const bIn = xi - D > 0 ? 1 : 0 // b's arc inside a is its major arc when the chord is right of b's centre
  const arcA = (large: number, sweep: number, to: string) => `A${f(a.r)} ${f(a.r)} 0 ${large} ${sweep} ${to}`
  const arcB = (large: number, sweep: number, to: string) => `A${f(b.r)} ${f(b.r)} 0 ${large} ${sweep} ${to}`
  return {
    a, b, spots,
    paths: {
      first: `M${top}${arcA(1 - aIn, 0, bottom)}${arcB(bIn, 1, top)}Z`,
      both: `M${top}${arcA(aIn, 1, bottom)}${arcB(bIn, 1, top)}Z`,
      other: `M${top}${arcA(aIn, 1, bottom)}${arcB(1 - bIn, 0, top)}Z`,
    },
  }
}

