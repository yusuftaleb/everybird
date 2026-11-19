// The collage's other two arrangements (the Arrangement control; Packed is pack.ts as it always was). Both run in the
// layout worker, on the screen's stages and the share images' frames, and keep the count's hole at the stage centre.
// - By family (layRows, rowsLayout, rowsFrame): the birds in taxonomic order in rows that read like a book, left to
//   right and top to bottom, every bird of a row at the row's height (its tile the mask's aspect, as packGrid draws it,
//   so a bird glides between arrangements without changing shape). Families are runs of that order, so they stay
//   together. A full row is justified (its spare width spread between the birds), the last one is not. The rows beside
//   the count leave its hole clear. In print, each bird's name sits under it inside its row (no looser packing).
// - By colour (colourPack, colourFrame): Packed's sizes (its base, at the same stage), each bird spiralling from a
//   target that sweeps its main colour (colours.v1.json, scripts/build-data/colour-key.ts) from left to right in
//   equal-area columns, neutrals last.
import { EXP, GAP, MAXUP } from './constants'
import { NO_HOLE, holeExtent, holeRects, isHole, scaleHole, type Hole } from './count-box'
import type { CaptionRoom } from './grid'
import { DEFAULT_CELL, fitStage, gather, pack, packFrame, relSizes, type Box, type PackBird, type PackResult } from './pack'

export type Arrangement = 'packed' | 'family' | 'colour'
export const ARRANGEMENTS: readonly Arrangement[] = ['packed', 'family', 'colour']

/** A bird in a row: its tile's aspect (w / h) and, in print, its name's box under it (`ring`: kept clear round a ringed sticker). */
export type RowBird = { id: number; aspect: number; cap?: CaptionRoom }
/** The space between birds in a row and between rows. */
export const rowGap = (h: number) => Math.max(GAP, 0.12 * h)

/**
 * Lay `birds`, in order, in rows of height `h` across W. With `H` (a frame): as many rows as fit, centred vertically, or
 * null when the birds need more. Without: as many rows as the birds need, H their height. The hole sits at the centre
 * of the result's W x H. Null too when a bird is wider than W at this height.
 */
export function layRows(birds: RowBird[], W: number, h: number, hole: Hole, H?: number): { H: number; boxes: Map<number, Box> } | null {
  const g = rowGap(h)
  let capH = 0, ring = 0
  for (const b of birds) if (b.cap) { capH = Math.max(capH, b.cap.h); ring = Math.max(ring, b.cap.ring ?? 0) }
  const band = h + capH + 2 * ring, pitch = band + g
  const slot = (b: RowBird) => Math.max(h * b.aspect, b.cap?.w ?? 0) + 2 * (b.cap?.ring ?? 0)
  const rects = isHole(hole) ? holeRects(hole) : []
  // The half width the hole takes out of a band [y0, y1] (about the hole's centre): 0 when the band passes clear of it.
  const cut = (y0: number, y1: number) => {
    let ex = 0
    for (const r of rects) if (y1 > r[1] - hole.pad - g && y0 < r[3] + hole.pad + g) ex = Math.max(ex, Math.max(-r[0], r[2]) + hole.pad + g)
    return ex
  }
  // R rows on a stage Ht tall, the first at oy: how many birds were placed (-1: one is wider than a whole row).
  const fill = (R: number, Ht: number, oy: number, boxes: Map<number, Box>): number => {
    let i = 0
    const cx = W / 2, cy = Ht / 2
    for (let r = 0; r < R && i < birds.length; r++) {
      const y = oy + r * pitch
      const ex = cut(y - cy, y + band - cy)
      const segs: [number, number][] = ex > 0 ? [[0, cx - ex], [cx + ex, W]] : [[0, W]]
      for (const [a, z] of segs) {
        const start = i
        let used = 0
        while (i < birds.length) {
          const need = (used ? used + g : 0) + slot(birds[i])
          if (need > z - a + 1e-9) break
          used = need
          i++
        }
        if (i === start) { if (!ex) return -1; continue }
        const spread = i < birds.length && i - start > 1 ? (z - a - used) / (i - start - 1) : 0
        let x = a
        for (let j = start; j < i; j++) {
          const b = birds[j], s = slot(b), w = h * b.aspect
          boxes.set(b.id, [x + (s - w) / 2, y + ring, w, h])
          x += s + g + spread
        }
      }
    }
    return i
  }
  if (H !== undefined) {
    const R = Math.floor((H + g) / pitch)
    if (R < 1) return null
    const boxes = new Map<number, Box>()
    return fill(R, H, (H - (R * pitch - g)) / 2, boxes) === birds.length ? { H, boxes } : null
  }
  let total = 0
  for (const b of birds) total += slot(b) + g
  let R = Math.max(1, Math.ceil((2 * holeExtent(hole)[1] + g) / pitch), Math.floor(total / W))
  for (;;) {
    const boxes = new Map<number, Box>()
    const Ht = R * pitch - g
    const n = fill(R, Ht, 0, boxes)
    if (n < 0) return null
    if (n === birds.length) return { H: Ht, boxes }
    let left = 0
    for (let j = n; j < birds.length; j++) left += slot(birds[j]) + g
    R += Math.max(1, Math.floor(left / W))
  }
}

type RowsStage = { W: number; H: number; floor?: number; minBase?: number; maxH?: number }
/** Rows' height bounds against the layout's: the floor and minBase are a median sticker's long side, a row a bit less. */
const ROW_FLOOR = 0.8, ROW_MAX = 120, MAX_GROW = 12

/**
 * By family on the screen's stage (W from the layout or fixedStage). A full collage takes the largest row height that
 * keeps it on the layout's starting stage; a big list grows the stage taller as packBest does: at the floor up to maxH,
 * then smaller rows down to minBase. A filtered state (refBase: the full collage's row height, fixedStage its stage)
 * grows its rows up to MAXUP x while they fit that stage's height; its H is its rows' (the count at its centre).
 */
export function rowsLayout(birds: RowBird[], layout: RowsStage, hole: Hole, opts: { refBase?: number; fixedStage?: [number, number] } = {}): PackResult {
  const W = opts.fixedStage?.[0] ?? layout.W
  if (!birds.length) return { base: opts.refBase ?? 0, W, H: Math.ceil(2 * holeExtent(hole)[1] + 2 * GAP), boxes: new Map() }
  const at = (h: number) => layRows(birds, W, h, hole)
  /** A height that lays out at all (a bird wider than W shrinks it). */
  const sure = (h: number) => { let r = at(h); while (!r) r = at((h *= 0.8)); return { h, r } }
  // The largest h in [lo, hi] whose rows are at most cap tall, or null when lo's aren't.
  const largest = (lo: number, hi: number, cap: number) => {
    const first = at(lo)
    if (!first || first.H > cap) return null
    let best = { h: lo, r: first }
    for (let s = 0; s < 12 && hi - lo > 0.05; s++) {
      const mid = (lo + hi) / 2
      const r = at(mid)
      if (r && r.H <= cap) { best = { h: mid, r }; lo = mid } else hi = mid
    }
    return best
  }
  let got: { h: number; r: { H: number; boxes: Map<number, Box> } }
  if (opts.refBase) {
    got = largest(opts.refBase, MAXUP * opts.refBase, opts.fixedStage?.[1] ?? Infinity) ?? sure(opts.refBase)
  } else {
    const floor = ROW_FLOOR * (layout.floor ?? 30), minB = Math.min(floor, ROW_FLOOR * (layout.minBase ?? 10))
    const maxH = Math.max(layout.H, layout.maxH ?? layout.H)
    const atFloor = sure(floor)
    got = largest(atFloor.h, ROW_MAX, layout.H)
      ?? (atFloor.r.H <= maxH ? atFloor : null)
      ?? largest(minB, atFloor.h, maxH) ?? largest(minB, atFloor.h, MAX_GROW * layout.H) ?? sure(minB)
  }
  return { base: got.h, W, H: got.r.H, boxes: got.r.boxes }
}

/** The share images' frame width in layout units (any: fitPack maps the frame onto the collage). */
const FRAME_W = 1000
/** Kept clear inside the frame's edge, so fitPack never shrinks the rows (a name keeps its size; its sticker must too). */
const FRAME_MARGIN = 0.015

/**
 * By family in a share image's or poster's frame of aspect W / H: the largest row height whose rows fit inside it (no
 * tile longer than maxTile x the frame's width), the hole and the names (`captions`, fractions of the frame's width, as
 * packFrame takes them) included. Null when nothing fits.
 */
export function rowsFrame(
  birds: { id: number; aspect: number }[], aspect: number,
  opts: { hole?: Hole; maxTile?: number; captions?: Map<number, CaptionRoom> } = {},
): PackResult | null {
  const W = FRAME_W, H = W / aspect, m = FRAME_MARGIN * W
  const hole = scaleHole(opts.hole ?? NO_HOLE, W)
  const rows: RowBird[] = birds.map((b) => {
    const c = opts.captions?.get(b.id)
    return c && (c.w || c.h) ? { ...b, cap: { w: c.w * W, h: c.h * W, ...(c.ring ? { ring: c.ring * W } : {}) } } : b
  })
  let maxA = 1
  for (const b of birds) maxA = Math.max(maxA, b.aspect)
  const lay = (h: number) => layRows(rows, W - 2 * m, h, hole, H - 2 * m)
  let hi = Math.min(H - 2 * m, ((opts.maxTile ?? 1) * (W - 2 * m)) / maxA), lo = hi / 200
  const top = lay(hi)
  let best = top ? { h: hi, r: top } : null
  if (!best) {
    const r = lay(lo)
    if (!r) return null
    best = { h: lo, r }
    for (let s = 0; s < 24; s++) {
      const mid = (lo + hi) / 2
      const t = lay(mid)
      if (t) { best = { h: mid, r: t }; lo = mid } else hi = mid
    }
  }
  const boxes = new Map<number, Box>()
  for (const [id, [x, y, w, h]] of best.r.boxes) boxes.set(id, [x + m, y + m, w, h])
  return { base: best.h, W, H, boxes }
}

/** A bird with no colour key (no sticker, or the file didn't load): a mid grey, with the neutrals. */
export const NEUTRAL_KEY = 190

/**
 * Where each bird starts its spiral for By colour: the birds sorted by colour key (then id), cut into columns of equal
 * sticker area (rel²), about as many as make square cells; each column runs top to bottom, the next bottom to top, so
 * neighbouring colours stay close. The columns sweep the key from left to right across W.
 */
export function colourTargets(birds: PackBird[], rel: Map<number, number>, keyOf: (id: number) => number, W: number, H: number): Map<number, [number, number]> {
  const order = [...birds].sort((a, b) => keyOf(a.id) - keyOf(b.id) || a.id - b.id)
  let total = 0
  for (const b of order) total += rel.get(b.id)! ** 2
  const cols = Math.max(1, Math.round(Math.sqrt((order.length * W) / H)))
  const out = new Map<number, [number, number]>()
  let acc = 0
  for (const b of order) {
    const a = rel.get(b.id)! ** 2
    const u = ((acc + a / 2) / total) * cols
    acc += a
    const c = Math.min(cols - 1, Math.floor(u)), f = u - c
    out.set(b.id, [((c + 0.5) / cols) * W, (0.05 + 0.9 * (c % 2 ? 1 - f : f)) * H])
  }
  return out
}

/**
 * By colour at a given base on a W x H stage: packed from colourTargets. On the screen (no `frame`) a stage too small
 * grows taller, 8% a step (then the base shrinks), and the result is trimmed about the count (fitStage); a frame keeps
 * its size and shrinks the base instead.
 */
export function colourPack(
  birds: PackBird[], rel: Map<number, number>, W: number, H: number, base: number, hole: Hole, keyOf: (id: number) => number,
  opts: { frame?: boolean; captions?: Map<number, CaptionRoom> } = {},
): PackResult {
  if (!birds.length) return { base, W, H, boxes: new Map() }
  for (let i = 0; ; i++) {
    const boxes = pack(birds, rel, W, H, base, 1, hole, colourTargets(birds, rel, keyOf, W, H), DEFAULT_CELL, false, opts.captions)
    if (boxes) {
      const g = gather(boxes, birds, W, H, hole, opts.captions)
      return opts.frame ? { base, W, H, boxes: g } : { base, ...fitStage(g, W, H, holeExtent(hole)[1]) }
    }
    if (opts.frame || i >= 12) base *= 0.94
    else H = Math.round(H * 1.08)
    if (base < 0.5) throw new Error(`colourPack: ${birds.length} birds do not fit a ${W}x${H} stage`)
  }
}

/** By colour in a share image's frame: packFrame's frame and base (Packed's sizes), the birds re-placed by colour. */
export function colourFrame(
  birds: PackBird[], aspect: number, keyOf: (id: number) => number,
  opts: { hole?: Hole; maxTile?: number; captions?: Map<number, CaptionRoom> } = {},
): PackResult {
  const p = packFrame(birds, aspect, opts)
  const caps = opts.captions
    ? new Map([...opts.captions].map(([id, c]) => [id, { w: c.w * p.W, h: c.h * p.W, ...(c.ring ? { ring: c.ring * p.W } : {}) }]))
    : undefined
  return colourPack(birds, relSizes(birds, EXP), p.W, p.H, p.base, scaleHole(opts.hole ?? NO_HOLE, p.W), keyOf, { frame: true, captions: caps })
}
