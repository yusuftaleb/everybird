// Bit-packed occupancy grid, per-bird cell masks and the shared spiral table used by pack.ts.
// One bit per cell, LSB first: column x lives in word x >> 5, bit x & 31.
import type { Mask } from './mask'
import { maskCell } from './mask'
import { holeExtent, isHole, touchesHole, type Hole } from './count-box'

export class Grid {
  readonly gw: number
  readonly gh: number
  readonly wpr: number // words per row, one spare so shifted writes never need a bounds check
  readonly bits: Uint32Array
  constructor(W: number, H: number, readonly cell: number) {
    this.gw = Math.max(0, Math.floor(W / cell))
    this.gh = Math.max(0, Math.floor(H / cell))
    this.wpr = (this.gw >> 5) + 2
    this.bits = new Uint32Array(this.wpr * this.gh)
  }

  get(x: number, y: number): boolean {
    return (this.bits[y * this.wpr + (x >> 5)] & (1 << (x & 31))) !== 0
  }

  /** Mark every cell that touches the count's hole (count-box.ts) centred at (cx, cy), in layout units. */
  markHole(cx: number, cy: number, hole: Hole): void {
    if (!isHole(hole)) return
    const c = this.cell
    const [ex, ey] = holeExtent(hole)
    const y0 = Math.max(0, Math.floor((cy - ey) / c)), y1 = Math.min(this.gh - 1, Math.floor((cy + ey) / c))
    const x0 = Math.max(0, Math.floor((cx - ex) / c)), x1 = Math.min(this.gw - 1, Math.floor((cx + ex) / c))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (touchesHole([x * c - cx, y * c - cy, (x + 1) * c - cx, (y + 1) * c - cy], hole)) this.bits[y * this.wpr + (x >> 5)] |= 1 << (x & 31)
      }
    }
  }

  /** True if the cell mask placed with its top-left at cell (gx, gy) hits any occupied cell. */
  collides(m: CellMask, gx: number, gy: number): boolean {
    const s = gx & 31, w0 = gx >> 5, mw = m.wpr, d = m.data, occ = this.bits
    // Probe the middle row first: in a packed interior that rejects most positions at once.
    for (let k = -1; k < m.ph; k++) {
      const r = k < 0 ? m.ph >> 1 : k
      const ob = (gy + r) * this.wpr + w0, mb = r * mw
      if (s === 0) {
        for (let i = 0; i < mw; i++) if (occ[ob + i] & d[mb + i]) return true
      } else {
        let carry = 0
        for (let i = 0; i < mw; i++) {
          const v = d[mb + i]
          if (occ[ob + i] & ((v << s) | carry)) return true
          carry = v >>> (32 - s)
        }
        if (carry && occ[ob + mw] & carry) return true
      }
    }
    return false
  }

  /** Clear the cells of a mask stamped at (gx, gy). Exact because stamped masks never share a cell. */
  clear(m: CellMask, gx: number, gy: number): void {
    const s = gx & 31, w0 = gx >> 5, mw = m.wpr, d = m.data, occ = this.bits
    for (let r = 0; r < m.ph; r++) {
      const ob = (gy + r) * this.wpr + w0, mb = r * mw
      let carry = 0
      for (let i = 0; i < mw; i++) {
        const v = d[mb + i]
        occ[ob + i] &= ~(s === 0 ? v : (v << s) | carry)
        carry = s === 0 ? 0 : v >>> (32 - s)
      }
      if (carry) occ[ob + mw] &= ~carry
    }
  }

  stamp(m: CellMask, gx: number, gy: number): void {
    const s = gx & 31, w0 = gx >> 5, mw = m.wpr, d = m.data, occ = this.bits
    for (let r = 0; r < m.ph; r++) {
      const ob = (gy + r) * this.wpr + w0, mb = r * mw
      if (s === 0) {
        for (let i = 0; i < mw; i++) occ[ob + i] |= d[mb + i]
      } else {
        let carry = 0
        for (let i = 0; i < mw; i++) {
          const v = d[mb + i]
          occ[ob + i] |= (v << s) | carry
          carry = v >>> (32 - s)
        }
        occ[ob + mw] |= carry
      }
    }
  }
}

/** A bird's collision mask in grid cells: scaled, padded by `pad` cells on every side and dilated by `pad`. */
export type CellMask = { pw: number; ph: number; wpr: number; data: Uint32Array; probeX: number; probeY: number }

/**
 * Conservative nearest-neighbour resize of a 24-cell mask to a tile of w x h layout units at `cell` units per
 * grid cell. Grid cell (i, j) covers [i·cell, (i+1)·cell) of the tile and is set when any mask cell it overlaps
 * is set. Upscaled, that is nearest-neighbour with the edges rounded outwards; downscaled (a mask cell smaller
 * than a grid cell), thin legs and bills are kept instead of being missed by a centre sample. Either way every
 * point of the silhouette lies in a set grid cell.
 */
export function scaleMask(mask: Mask, w: number, h: number, cell: number): { tw: number; th: number; cells: Uint8Array } {
  const tw = Math.max(1, Math.ceil(w / cell)), th = Math.max(1, Math.ceil(h / cell))
  // Mask cells [lo, hi] overlapped by grid cell i along one axis (tile length len, n mask cells).
  const span = (i: number, len: number, n: number): [number, number] => {
    const lo = Math.min(n - 1, Math.floor(((i * cell) / len) * n))
    const hi = Math.min(n - 1, Math.max(lo, Math.ceil((((i + 1) * cell) / len) * n) - 1))
    return [lo, hi]
  }
  const xs = Array.from({ length: tw }, (_, i) => span(i, w, mask.w))
  const cells = new Uint8Array(tw * th)
  for (let j = 0; j < th; j++) {
    const [y0, y1] = span(j, h, mask.h)
    for (let i = 0; i < tw; i++) {
      const [x0, x1] = xs[i]
      search: for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) if (maskCell(mask, x, y)) { cells[j * tw + i] = 1; break search }
      }
    }
  }
  return { tw, th, cells }
}

/**
 * The silhouette alone (scaled, padded by `pad` cells but not dilated), the same size as cellMask's, so both
 * place at the same (gx, gy). A small sticker stamps its core: the next one, tested with its dilated mask,
 * then keeps one GAP from it instead of two.
 */
export function coreMask(mask: Mask, w: number, h: number, cell: number, pad: number): CellMask {
  const { tw, th, cells } = scaleMask(mask, w, h, cell)
  const pw = tw + 2 * pad, ph = th + 2 * pad
  const out = new Uint8Array(pw * ph)
  for (let j = 0; j < th; j++) out.set(cells.subarray(j * tw, (j + 1) * tw), (j + pad) * pw + pad)
  return toCellMask(out, pw, ph)
}

export function cellMask(mask: Mask, w: number, h: number, cell: number, pad: number): CellMask {
  const { tw, th, cells } = scaleMask(mask, w, h, cell)
  const pw = tw + 2 * pad, ph = th + 2 * pad
  // Square dilation by `pad`, as the reference's dilate(np.pad(a, GAP), GAP).
  const dil = new Uint8Array(pw * ph)
  for (let j = 0; j < th; j++) {
    for (let i = 0; i < tw; i++) {
      if (!cells[j * tw + i]) continue
      for (let y = j; y <= j + 2 * pad; y++) dil.fill(1, y * pw + i, y * pw + i + 2 * pad + 1)
    }
  }
  return toCellMask(dil, pw, ph)
}

/** Bit-pack a pw x ph boolean (0/1) array into a CellMask, choosing the set cell nearest the centre as probe. */
export function toCellMask(cells: Uint8Array, pw: number, ph: number): CellMask {
  const wpr = (pw + 31) >> 5
  const data = new Uint32Array(wpr * ph)
  let probeX = -1, probeY = -1, best = Infinity
  const mx = (pw - 1) / 2, my = (ph - 1) / 2
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      if (!cells[y * pw + x]) continue
      data[y * wpr + (x >> 5)] |= 1 << (x & 31)
      const dd = (x - mx) ** 2 + (y - my) ** 2
      if (dd < best) [best, probeX, probeY] = [dd, x, y]
    }
  }
  return { pw, ph, wpr, data, probeX, probeY }
}

/**
 * The reference's spiral, precomputed (it doesn't depend on the bird): offsets at step i are rad·cos t and
 * rad·sin t with rad = 2.2 t; t += 0.35 / (1 + 0.03 rad) + 0.004 while t < tMax. The reference stops at
 * tMax = 1400 (rad 3080); pack() passes a larger tMax only for stages too big for that, so the spiral still
 * reaches every part of a grown stage. One table is kept, extended on demand; callers walk a prefix.
 */
export type Spiral = { n: number; dx: Float64Array; dy: Float64Array; rad: Float64Array }
export const SPIRAL_T = 1400
let TABLE: { tEnd: number; dx: Float64Array; dy: Float64Array; rad: Float64Array } | null = null
export function spiral(tMax = SPIRAL_T): Spiral {
  if (!TABLE || TABLE.tEnd < tMax) {
    const dx: number[] = [], dy: number[] = [], rad: number[] = []
    let t = 0
    for (; t < tMax; ) {
      const r = 2.2 * t
      dx.push(r * Math.cos(t)); dy.push(r * Math.sin(t)); rad.push(r)
      t += 0.35 / (1 + 0.03 * r) + 0.004
    }
    TABLE = { tEnd: tMax, dx: Float64Array.from(dx), dy: Float64Array.from(dy), rad: Float64Array.from(rad) }
  }
  // n = number of steps with t < tMax (rad = 2.2 t is increasing).
  const { rad } = TABLE, rMax = 2.2 * tMax
  let lo = 0, hi = rad.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (rad[mid] < rMax) lo = mid + 1; else hi = mid }
  return { n: lo, dx: TABLE.dx, dy: TABLE.dy, rad }
}

/** Targets mode: walk the spiral from one bird's own centre (layout units). First free [gx, gy] or null. */
export function spiralFrom(
  grid: Grid, m: CellMask, sp: Spiral, [cx, cy]: [number, number], sx: number, sy: number, cell: number, lim: number,
): [number, number] | null {
  const { n, dx, dy, rad } = sp
  const ox = cx / cell - m.pw / 2, oy = cy / cell - m.ph / 2
  const xmax = grid.gw - m.pw, ymax = grid.gh - m.ph
  let lastX = -1, lastY = -1
  for (let i = 0; i < n; i++) {
    const gx = Math.trunc(ox + dx[i] * sx), gy = Math.trunc(oy + dy[i] * sy)
    if (gx < 0 || gy < 0 || gx > xmax || gy > ymax) {
      if (rad[i] > lim) break
      continue
    }
    if (gx === lastX && gy === lastY) continue // same cell as the last try, and nothing changed since
    lastX = gx; lastY = gy
    if (m.probeX >= 0 && grid.get(gx + m.probeX, gy + m.probeY)) continue
    if (!grid.collides(m, gx, gy)) return [gx, gy]
  }
  return null
}

/**
 * Centre mode: all birds walk the same spiral from the stage centre. Precomputes the steps whose point lands
 * on the stage (any other step is out of bounds for every bird), and keeps a skip list of steps proven dead:
 * a step whose 5x5 cells around its point are all occupied rejects, at its probe, every bird whose probe is
 * within 1 cell of its mask's centre. Occupancy only grows, so dead stays dead. Positions tried and the
 * position found are the same as walking every step.
 */
export class CentreWalk {
  private readonly len: number
  private readonly U: Float64Array
  private readonly V: Float64Array
  private readonly nxt: Int32Array // union-find: nxt[k] === k while step k is live
  constructor(sp: Spiral, ucx: number, vcy: number, sx: number, sy: number, private readonly grid: Grid, lim: number) {
    const U: number[] = [], V: number[] = []
    const gw = grid.gw, gh = grid.gh
    for (let i = 0; i < sp.n; i++) {
      const u = ucx + sp.dx[i] * sx, v = vcy + sp.dy[i] * sy
      const on = u > -0.5 && u < gw + 0.5 && v > -0.5 && v < gh + 0.5
      if (!on) { if (sp.rad[i] > lim) break; continue }
      U.push(u); V.push(v)
    }
    this.len = U.length
    this.U = Float64Array.from(U); this.V = Float64Array.from(V)
    this.nxt = new Int32Array(this.len + 1)
    for (let k = 0; k <= this.len; k++) this.nxt[k] = k
  }

  private find(k: number): number {
    const nxt = this.nxt
    let r = k
    while (nxt[r] !== r) r = nxt[r]
    while (nxt[k] !== r) { const t = nxt[k]; nxt[k] = r; k = t }
    return r
  }

  private blockFull(fx: number, fy: number): boolean {
    const g = this.grid
    if (fx < 2 || fy < 2 || fx + 2 >= g.gw || fy + 2 >= g.gh) return false
    for (let y = fy - 2; y <= fy + 2; y++) for (let x = fx - 2; x <= fx + 2; x++) if (!g.get(x, y)) return false
    return true
  }

  place(m: CellMask): [number, number] | null {
    const g = this.grid, U = this.U, V = this.V, len = this.len
    const xmax = g.gw - m.pw, ymax = g.gh - m.ph, hx = m.pw / 2, hy = m.ph / 2
    const skip = m.probeX >= 0 && Math.abs(m.probeX - hx) <= 1 && Math.abs(m.probeY - hy) <= 1
    let lastX = -1, lastY = -1
    for (let k = skip ? this.find(0) : 0; k < len; k = skip ? this.find(k + 1) : k + 1) {
      const gx = Math.trunc(U[k] - hx), gy = Math.trunc(V[k] - hy)
      if (gx < 0 || gy < 0 || gx > xmax || gy > ymax) continue
      if (gx === lastX && gy === lastY) continue
      lastX = gx; lastY = gy
      if (m.probeX >= 0 && g.get(gx + m.probeX, gy + m.probeY)) {
        if (this.nxt[k] === k && this.blockFull(Math.floor(U[k]), Math.floor(V[k]))) this.nxt[k] = k + 1
        continue
      }
      if (!g.collides(m, gx, gy)) return [gx, gy]
    }
    return null
  }
}
