// Test helper: how much room a big collage leaves inside its outline, measured on the rasterised silhouettes (one sample
// per layout unit, nearest mask cell), independently of the packer's own passes. The outline is the convex hull of the
// silhouettes; the count's hole is never room.
// - slots: how many more copies of the list's smallest sticker fit inside the outline, GAP from every silhouette and the
//   hole (placed greedily, row by row, each one taken before the next is looked for), split into the inner part (inside
//   0.8 of the outline's half sizes about its centre) and the edge. A pocket among the stickers shows as an inner slot.
// - pocket: the share of the outline's area (less the hole) further than GAP + 0.3 x the smallest sticker's long side
//   from every silhouette and the hole: room a small bird would fit in.
// - edgeCv: in 120 directions about the stage centre, the outermost silhouette's rounded-rectangle radius ((u^8 + v^8)^(1/8)
//   over the stage's half sizes); their coefficient of variation. A ragged edge, loose birds out past it, shows here. Free's
//   rounded outline is measured so; Fit's rectangle by rectCv, the same with the rectangle's radius max(|u|, |v|).
// - corners: each corner of the silhouettes' bounding box (top-left, top-right, bottom-left, bottom-right), its chessboard
//   distance to the nearest silhouette, in median sticker long sides: an empty corner shows as a large one.
import { GAP } from '../src/lib/layout/constants'
import { rectGap, type Hole } from '../src/lib/layout/count-box'
import { Grid, cellMask, coreMask } from '../src/lib/layout/grid'
import { maskCell } from '../src/lib/layout/mask'
import type { Box, PackBird } from '../src/lib/layout/pack'

type Pockets = { slots: { inner: number; edge: number }; pocket: number; edgeCv: number; rectCv: number; corners: number[] }

export function pockets(birds: PackBird[], r: { W: number; H: number; boxes: Map<number, Box> }, hole: Hole): Pockets {
  const W = Math.ceil(r.W), H = Math.ceil(r.H), cx = r.W / 2, cy = r.H / 2
  const byId = new Map(birds.map((b) => [b.id, b]))
  const own = new Int32Array(W * H).fill(-1)
  for (const [id, [x, y, w, h]] of r.boxes) {
    const m = byId.get(id)!.mask
    for (let py = Math.max(0, Math.floor(y)); py < Math.min(H, Math.ceil(y + h)); py++) {
      for (let px = Math.max(0, Math.floor(x)); px < Math.min(W, Math.ceil(x + w)); px++) {
        const u = (px + 0.5 - x) / w, v = (py + 0.5 - y) / h
        if (u >= 0 && v >= 0 && u < 1 && v < 1 && maskCell(m, Math.floor(u * m.w), Math.floor(v * m.h))) own[py * W + px] = id
      }
    }
  }
  const inHole = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u: [number, number, number, number] = [x - cx, y - cy, x + 1 - cx, y + 1 - cy]
    if (Math.min(rectGap(u, hole.num), rectGap(u, hole.label)) < hole.pad) inHole[y * W + x] = 1
  }
  // The outline: the convex hull of each row's outermost silhouette units (monotone chain).
  const pts: [number, number][] = []
  for (let y = 0; y < H; y++) {
    let a = -1, b = -1
    for (let x = 0; x < W; x++) if (own[y * W + x] >= 0) { if (a < 0) a = x; b = x }
    if (a >= 0) pts.push([a, y], [b + 1, y], [a, y + 1], [b + 1, y + 1])
  }
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1])
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list: [number, number][]) => {
    const h: [number, number][] = []
    for (const p of list) { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p) }
    return h.slice(0, -1)
  }
  const hull = [...half(pts), ...half([...pts].reverse())]
  const inside = (x: number, y: number) => hull.every((p, i) => cross(p, hull[(i + 1) % hull.length], [x, y]) >= 0)
  let x0 = W, x1 = 0, y0 = H, y1 = 0
  for (const [x, y] of hull) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  const hx = (x0 + x1) / 2, hy = (y0 + y1) / 2, ax = (x1 - x0) / 2, ay = (y1 - y0) / 2
  // Chamfer (3-4) distance to the nearest silhouette or hole unit.
  const d = new Int32Array(W * H).fill(1 << 29)
  for (let i = 0; i < W * H; i++) if (own[i] >= 0 || inHole[i]) d[i] = 0
  const relax = (i: number, j: number, w: number) => { if (d[j] + w < d[i]) d[i] = d[j] + w }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x
    if (x) relax(i, i - 1, 3)
    if (y) { relax(i, i - W, 3); if (x) relax(i, i - W - 1, 4); if (x < W - 1) relax(i, i - W + 1, 4) }
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x
    if (x < W - 1) relax(i, i + 1, 3)
    if (y < H - 1) { relax(i, i + W, 3); if (x < W - 1) relax(i, i + W + 1, 4); if (x) relax(i, i + W - 1, 4) }
  }
  let small: Box | undefined, smallBird: PackBird | undefined
  for (const [id, b] of r.boxes) if (!small || Math.max(b[2], b[3]) < Math.max(small[2], small[3])) { small = b; smallBird = byId.get(id) }
  const far = 3 * (GAP + 0.3 * Math.max(small![2], small![3]))
  let area = 0, room = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x
    if (inHole[i] || !inside(x + 0.5, y + 0.5)) continue
    area++
    if (d[i] >= far) room++
  }
  // The slots, on a grid of the silhouettes and the hole.
  const g = new Grid(W, H, 1)
  g.markHole(cx, cy, hole)
  for (const [id, [x, y, w, h]] of r.boxes) g.stamp(coreMask(byId.get(id)!.mask, w, h, 1, GAP), Math.round(x) - GAP, Math.round(y) - GAP)
  const test = cellMask(smallBird!.mask, small![2], small![3], 1, GAP), core = coreMask(smallBird!.mask, small![2], small![3], 1, GAP)
  const slots = { inner: 0, edge: 0 }
  for (let gy = 0; gy + test.ph <= g.gh; gy++) {
    for (let gx = 0; gx + test.pw <= g.gw; gx++) {
      const mx = gx + test.pw / 2, my = gy + test.ph / 2
      if (!inside(mx, my) || g.get(gx + test.probeX, gy + test.probeY) || g.collides(test, gx, gy)) continue
      g.stamp(core, gx, gy)
      if (Math.hypot((mx - hx) / ax, (my - hy) / ay) < 0.8) slots.inner++
      else slots.edge++
    }
  }
  // The edge's evenness, about the rounded rectangle and the rectangle.
  const N = 120, reach = new Array<number>(N).fill(0), rect = new Array<number>(N).fill(0)
  let bx0 = W, bx1 = 0, by0 = H, by1 = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (own[y * W + x] < 0) continue
    bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y)
    const u = (x + 0.5 - cx) / cx, v = (y + 0.5 - cy) / cy
    const k = Math.floor(((Math.atan2(v, u) + Math.PI) / (2 * Math.PI)) * N) % N
    reach[k] = Math.max(reach[k], (u ** 8 + v ** 8) ** 0.125)
    rect[k] = Math.max(rect[k], Math.max(Math.abs(u), Math.abs(v)))
  }
  const cv = (r: number[]) => {
    const mean = r.reduce((a, b) => a + b, 0) / N
    return Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / N) / mean
  }
  const longs = [...r.boxes.values()].map((b) => Math.max(b[2], b[3])).sort((a, b) => a - b)
  const med = longs[longs.length >> 1]
  const corners = [[bx0, by0], [bx1, by0], [bx0, by1], [bx1, by1]].map(([qx, qy]) => {
    let best = Infinity
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (own[y * W + x] >= 0) best = Math.min(best, Math.max(Math.abs(x - qx), Math.abs(y - qy)))
    return best / med
  })
  return { slots, pocket: room / Math.max(1, area), edgeCv: cv(reach), rectCv: cv(rect), corners }
}
