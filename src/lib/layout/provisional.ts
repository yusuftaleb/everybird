// A big list's provisional full collage: one packing pass, shown while packBest works out the final one (the layout
// client runs it on a second, short-lived worker, so the final isn't delayed). It goes through packBest's own public
// path, nothing in pack.ts changes: a stage that never grows (H = maxH = the provisional height, no floor, no minBase),
// no settling (no denseFrom), and a base cap under 0.6 x packBest's area estimate, where its search tries that one base
// and stops. The stage is sized so birds come out at about SIZE of the final collage's expected base.
//
// Measured (Node, 5,000 birds): 0.5-0.9 s against 6-12 s for the final; birds at 75-95% of their final size, the stage
// 85-95% of its final height. A wrong estimate (pack.ts's estimate changed) only makes this slower, never the final
// different: the final is still packBest's.
import { EXP, LAYOUTS } from './constants'
import { collageHole, holeArea } from './count-box'
import { MASK } from './mask'
import { maskShape, packBest, relSizes, type PackBird, type PackResult } from './pack'

/** Lists from this many species get a provisional collage (below, the final packs in about a second on a laptop). */
export const PROVISIONAL_FROM = 600
const SIZE = 0.9 // provisional base / expected final base
const ONE_PASS = 0.59 // packBest tries a single base when its cap is below 0.6 x its area estimate
const FILL = 0.55 // packBest's area estimate: birds cover this share of the usable stage at the estimated base

type Layout = (typeof LAYOUTS)[number]

export function provisionalPack(birds: PackBird[], layout: Layout, opts: { oval?: boolean; free?: boolean } = {}): PackResult {
  const rel = relSizes(birds, EXP)
  let area = 0
  for (const b of birds) area += rel.get(b.id)! ** 2 * ((maskShape(b.mask) * MASK * MASK) / (b.mask.w * b.mask.h))
  const hole = holeArea(collageHole(birds.length, layout))
  const inside = opts.oval ? Math.PI / 4 : 1
  const est = (H: number) => Math.sqrt((FILL * Math.max(1, inside * layout.W * H - hole)) / area)
  const heightFor = (base: number) => ((base * base * area) / FILL + hole) / (inside * layout.W)
  // The final's base: the floor's, once the stage can grow to it (up to maxH), else what maxH holds, at least minBase.
  const median = [...rel.values()].sort((a, b) => a - b)[rel.size >> 1]
  const floorBase = layout.floor / median
  const maxH = Math.max(layout.H, layout.maxH)
  const expected = est(maxH) >= floorBase ? Math.max(est(layout.H), floorBase) : Math.max(est(maxH), layout.minBase)
  const base = SIZE * expected
  const H = Math.max(layout.H, Math.round(heightFor(base / ONE_PASS)))
  const once = { W: layout.W, H, stretch: layout.stretch, F: layout.F, maxH: H }
  return packBest(birds, once, 'even', { rel, maxBase: base, ...(opts.oval ? { oval: true } : opts.free ? { free: true } : {}) })
}
