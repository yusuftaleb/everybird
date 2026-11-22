// Test helper: how evenly a pack spreads its birds, measured on the silhouettes (rasterised at one sample per layout
// unit, nearest mask cell), independently of the packer's own grid. A two-pass chamfer distance transform (3-4) over
// the free units, each carrying the nearest silhouette's owner, gives every bird its nearest neighbour's gap (where two
// owners' regions meet) and the largest empty disc anywhere in the frame (a hole).
import { rectGap, type Hole } from '../src/lib/layout/count-box'
import { maskCell } from '../src/lib/layout/mask'
import type { Box, PackBird } from '../src/lib/layout/pack'

type Evenness = {
  /** Each bird's gap to its nearest neighbour, in layout units (silhouette to silhouette). */
  gaps: number[]
  median: number
  /** Coefficient of variation of `gaps` (standard deviation over mean). */
  cv: number
  /** The 90th percentile gap over the median. */
  p90: number
  /** The median sticker's long side, in layout units. */
  medianL: number
  /** The diameter of the largest empty disc inside the frame (outside the count's hole and, for an oval, inside it), units. */
  maxVoid: number
  /** Each bird's reach: the farthest free unit of its own region (the units nearer it than any other bird), in units. A hole
   *  shows as a long reach for the birds around it; an even pack gives every bird about the same. */
  reach: number[]
  /** Coefficient of variation of `reach`. */
  reachCv: number
  /** Each frame corner's distance to the nearest silhouette, in units (top-left, top-right, bottom-left, bottom-right). */
  corners: number[]
}

const INF = 1 << 29

export function evenness(birds: PackBird[], r: { W: number; H: number; boxes: Map<number, Box> }, opts: { hole?: Hole; oval?: boolean } = {}): Evenness {
  const W = Math.ceil(r.W), H = Math.ceil(r.H)
  const byId = new Map(birds.map((b) => [b.id, b]))
  const owner = new Int32Array(W * H).fill(-1)
  const dist = new Int32Array(W * H).fill(INF)
  const wall = new Uint8Array(W * H)
  const cx = r.W / 2, cy = r.H / 2
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u: [number, number, number, number] = [x - cx, y - cy, x + 1 - cx, y + 1 - cy]
      const inHole = !!opts.hole && Math.min(rectGap(u, opts.hole.num), rectGap(u, opts.hole.label)) < opts.hole.pad
      const ex = (x + 0.5 - cx) / (r.W / 2), ey = (y + 0.5 - cy) / (r.H / 2)
      if (inHole || (opts.oval && ex * ex + ey * ey > 1)) wall[y * W + x] = 1
    }
  }
  const longs: number[] = []
  for (const [id, [bx, by, bw, bh]] of r.boxes) {
    longs.push(Math.max(bw, bh))
    const m = byId.get(id)!.mask
    for (let py = Math.max(0, Math.floor(by)); py < Math.min(H, Math.ceil(by + bh)); py++) {
      for (let px = Math.max(0, Math.floor(bx)); px < Math.min(W, Math.ceil(bx + bw)); px++) {
        const u = (px + 0.5 - bx) / bw, v = (py + 0.5 - by) / bh
        if (u < 0 || v < 0 || u >= 1 || v >= 1) continue
        if (maskCell(m, Math.floor(u * m.w), Math.floor(v * m.h))) { owner[py * W + px] = id; dist[py * W + px] = 0 }
      }
    }
  }
  // Two passes of the 3-4 chamfer, the owner travelling with the distance; walls never pass a distance on.
  const relax = (i: number, j: number, w: number) => {
    if (dist[j] + w < dist[i]) { dist[i] = dist[j] + w; owner[i] = owner[j] }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (wall[i] || dist[i] === 0) continue
      if (x > 0 && !wall[i - 1]) relax(i, i - 1, 3)
      if (y > 0) {
        if (!wall[i - W]) relax(i, i - W, 3)
        if (x > 0 && !wall[i - W - 1]) relax(i, i - W - 1, 4)
        if (x < W - 1 && !wall[i - W + 1]) relax(i, i - W + 1, 4)
      }
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x
      if (wall[i] || dist[i] === 0) continue
      if (x < W - 1 && !wall[i + 1]) relax(i, i + 1, 3)
      if (y < H - 1) {
        if (!wall[i + W]) relax(i, i + W, 3)
        if (x < W - 1 && !wall[i + W + 1]) relax(i, i + W + 1, 4)
        if (x > 0 && !wall[i + W - 1]) relax(i, i + W - 1, 4)
      }
    }
  }
  // Where two owners' regions meet, the gap between those two birds is about the two distances plus the step.
  const near = new Map<number, number>()
  const meet = (i: number, j: number, w: number) => {
    const a = owner[i], b = owner[j]
    if (a < 0 || b < 0 || a === b || wall[i] || wall[j]) return
    const g = Math.max(0, (dist[i] + dist[j] + w) / 3 - 1)
    if (g < (near.get(a) ?? Infinity)) near.set(a, g)
    if (g < (near.get(b) ?? Infinity)) near.set(b, g)
  }
  let maxD = 0
  const far = new Map<number, number>()
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (wall[i]) continue
      if (dist[i] < INF) {
        maxD = Math.max(maxD, dist[i])
        if (owner[i] >= 0 && dist[i] > (far.get(owner[i]) ?? 0)) far.set(owner[i], dist[i])
      }
      if (x < W - 1) meet(i, i + 1, 3)
      if (y < H - 1) {
        meet(i, i + W, 3)
        if (x < W - 1) meet(i, i + W + 1, 4)
        if (x > 0) meet(i, i + W - 1, 4)
      }
    }
  }
  const gaps = [...near.values()].sort((a, b) => a - b)
  const median = gaps.length ? gaps[gaps.length >> 1] : 0
  const mean = gaps.reduce((s, g) => s + g, 0) / Math.max(1, gaps.length)
  const sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / Math.max(1, gaps.length))
  longs.sort((a, b) => a - b)
  const reach = [...r.boxes.keys()].map((id) => (far.get(id) ?? 0) / 3)
  const rm = reach.reduce((s, g) => s + g, 0) / Math.max(1, reach.length)
  const rsd = Math.sqrt(reach.reduce((s, g) => s + (g - rm) ** 2, 0) / Math.max(1, reach.length))
  const at = (x: number, y: number) => dist[Math.min(H - 1, y) * W + Math.min(W - 1, x)] / 3
  return {
    gaps, median, cv: mean ? sd / mean : 0, p90: median ? gaps[Math.floor(gaps.length * 0.9)] / median : 0,
    reach, reachCv: rm ? rsd / rm : 0,
    medianL: longs[longs.length >> 1] ?? 0, maxVoid: (2 * maxD) / 3,
    corners: [at(0, 0), at(W - 1, 0), at(0, H - 1), at(W - 1, H - 1)],
  }
}
