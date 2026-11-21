// A harness for the Tree image's sweep (tests/tree-image-sweep.test.ts): a 2D context that records every text, image,
// stroke and fill in card units with the transform it was drawn under, measuring text with the stored glyph advances
// (tests/fixtures/glyph-advances.json: Satoshi, Cabinet Grotesk and Geist Mono, as the image's faces), and the checks
// the sweep runs on what it recorded: text over text, a tip's name and count, the axis, the empty bands.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type Advances = Record<string, number>
const fonts = JSON.parse(readFileSync(resolve(__dirname, 'glyph-advances.json'), 'utf8')).fonts as Record<string, { advances: Advances }>
/** The face a font string names (the harness's card fonts: "600 24px lifer"), its table. */
const faceOf = (font: string): Advances => {
  if (/mono/.test(font)) return fonts['geist-mono-500'].advances
  if (/count/.test(font)) return fonts['cabinet-grotesk-700'].advances
  return fonts['satoshi-700'].advances // the names' Satoshi 600: 700's (wider) advances, never narrower than drawn
}
const pxOf = (font: string) => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10)
/** A text's advance width in `font` (an unknown character 0.6 em). */
export const textWidth = (text: string, font: string, spacing = 0): number => {
  const a = faceOf(font)
  return [...text].reduce((w, ch) => w + (a[ch] ?? 0.6) * pxOf(font) + spacing, 0)
}

/** The card fonts the harness gives the painter: each names its face for the measure. */
export const FONTS = {
  count: (px: number) => `700 ${px}px count`, footer: (px: number) => `400 ${px}px mono`, mono: (px: number) => `500 ${px}px mono`,
  lifer: (px: number) => `600 ${px}px lifer`, name: (px: number) => `700 ${px}px count`, filter: (px: number) => `500 ${px}px lifer`, brand: (px: number) => `700 ${px}px count`,
}

type M = [number, number, number, number, number, number] // a b c d e f
const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]
const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
export type Pt = [number, number]
/** A text as drawn: its string, size, and its box's four corners in card units. */
export type Drawn = { s: string; px: number; font: string; box: Pt[] }

/** Points along an SVG path (M, L, H, V, A, a, Q, Z), every `step` units or so. */
export function samplePath(d: string, step = 2): Pt[] {
  const out: Pt[] = []
  const tok = d.match(/[MLHVAaQZz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? []
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0
  const num = () => Number(tok[i++])
  const line = (x1: number, y1: number) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x, y1 - y) / step)); for (let k = 1; k <= n; k++) out.push([x + ((x1 - x) * k) / n, y + ((y1 - y) * k) / n]); x = x1; y = y1 }
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++]
    if (cmd === 'M') { x = sx = num(); y = sy = num(); out.push([x, y]); cmd = 'L' }
    else if (cmd === 'L') line(num(), num())
    else if (cmd === 'H') line(num(), y)
    else if (cmd === 'V') line(x, num())
    else if (cmd === 'Q') {
      const cx = num(), cy = num(), x1 = num(), y1 = num(), n = Math.max(2, Math.ceil(Math.hypot(x1 - x, y1 - y) / step))
      for (let k = 1; k <= n; k++) { const t = k / n; out.push([(1 - t) ** 2 * x + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) ** 2 * y + 2 * (1 - t) * t * cy + t * t * y1]) }
      x = x1; y = y1
    } else if (cmd === 'A' || cmd === 'a') {
      const rx = num()
      num(); num() // ry (= rx) and the rotation (0): the drawings' arcs are circles'
      const large = num(), sweep = num(), rel = cmd === 'a', x1 = num() + (rel ? x : 0), y1 = num() + (rel ? y : 0)
      // Endpoint to centre (circles only: rx = ry, no rotation).
      const r = Math.max(rx, Math.hypot(x1 - x, y1 - y) / 2)
      const mx = (x + x1) / 2, my = (y + y1) / 2, dx = (x1 - x) / 2, dy = (y1 - y) / 2, q = Math.hypot(dx, dy)
      const h = Math.sqrt(Math.max(0, r * r - q * q)), sign = large === sweep ? -1 : 1
      const cx = q ? mx + (sign * h * -dy) / q : mx, cy = q ? my + (sign * h * dx) / q : my
      const a0 = Math.atan2(y - cy, x - cx)
      let a1 = Math.atan2(y1 - cy, x1 - cx)
      if (sweep && a1 < a0) a1 += 2 * Math.PI
      if (!sweep && a1 > a0) a1 -= 2 * Math.PI
      const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / step))
      for (let k = 1; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]) }
      x = x1; y = y1
    } else if (cmd === 'Z' || cmd === 'z') { line(sx, sy); cmd = '' }
    else i++
  }
  return out
}

/** A recording 2D context. */
export function recorder() {
  const texts: Drawn[] = [], images: Pt[][] = [], strokes: Pt[][] = [], strokeStyles: string[] = [], rects: { box: Pt[]; fill: string }[] = []
  type S = { m: M; font: string; textAlign: string; textBaseline: string; fillStyle: string; strokeStyle: string; letterSpacing: string }
  let st: S = { m: [1, 0, 0, 1, 0, 0], font: '10px lifer', textAlign: 'start', textBaseline: 'alphabetic', fillStyle: '#000', strokeStyle: '#000', letterSpacing: '0px' }
  const stack: S[] = []
  let pathPts: Pt[] = []
  const corners = (x: number, y: number, w: number, h: number): Pt[] => [apply(st.m, x, y), apply(st.m, x + w, y), apply(st.m, x + w, y + h), apply(st.m, x, y + h)]
  const ctx: Record<string, unknown> = {
    save: () => { stack.push({ ...st }) },
    restore: () => { st = stack.pop() ?? st },
    translate: (x: number, y: number) => { st.m = mul(st.m, [1, 0, 0, 1, x, y]) },
    rotate: (a: number) => { st.m = mul(st.m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]) },
    scale: (x: number, y: number) => { st.m = mul(st.m, [x, 0, 0, y, 0, 0]) },
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => { st.m = [a, b, c, d, e, f] },
    measureText: (s: string) => ({ width: textWidth(s, st.font, parseFloat(st.letterSpacing) || 0) }),
    fillText: (s: string, x: number, y: number) => {
      const px = pxOf(st.font), w = textWidth(s, st.font, parseFloat(st.letterSpacing) || 0)
      const left = st.textAlign === 'right' || st.textAlign === 'end' ? x - w : st.textAlign === 'center' ? x - w / 2 : x
      // The em box: 0.75 above the baseline, 0.25 below.
      const top = st.textBaseline === 'middle' ? y - 0.5 * px : st.textBaseline === 'top' ? y : y - 0.75 * px
      texts.push({ s, px, font: st.font, box: corners(left, top, w, px) })
    },
    drawImage: (_img: unknown, x: number, y: number, w: number, h: number) => { images.push(corners(x, y, w, h)) },
    fillRect: (x: number, y: number, w: number, h: number) => { rects.push({ box: corners(x, y, w, h), fill: st.fillStyle }) },
    stroke: (p?: { d?: string }) => {
      const pts = p?.d !== undefined ? samplePath(p.d) : pathPts
      strokes.push(pts.map(([x, y]) => apply(st.m, x, y)))
      strokeStyles.push(st.strokeStyle)
    },
    beginPath: () => { pathPts = [] },
    moveTo: (x: number, y: number) => { pathPts.push([x, y]) },
    lineTo: (x: number, y: number) => { pathPts.push([x, y]) },
    createLinearGradient: () => ({ addColorStop: () => {} }),
  }
  const proxy = new Proxy(ctx, {
    get: (o, k) => (k in o ? o[k as string] : k in st ? st[k as keyof S] : () => {}),
    set: (o, k, v) => { if (k in st) (st as Record<string, unknown>)[k as string] = v; else o[k as string] = v; return true },
  })
  return { ctx: proxy as unknown as CanvasRenderingContext2D, texts, images, strokes, strokeStyles, rects }
}

const axes = (b: Pt[]): Pt[] => [[b[1][0] - b[0][0], b[1][1] - b[0][1]], [b[3][0] - b[0][0], b[3][1] - b[0][1]]]
/** Whether two convex quads overlap by more than `tol` along every separating axis (SAT). */
export function quadsOverlap(a: Pt[], b: Pt[], tol = 0.5): boolean {
  for (const [ax, ay] of [...axes(a), ...axes(b)]) {
    const l = Math.hypot(ax, ay) || 1, nx = ax / l, ny = ay / l
    const pa = a.map(([x, y]) => x * nx + y * ny), pb = b.map(([x, y]) => x * nx + y * ny)
    if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= tol) return false
  }
  return true
}
/** A quad shrunk toward its centre by `k` of its height (text boxes are em boxes, taller than the ink). */
export function shrink(b: Pt[], k: number): Pt[] {
  const [u, v] = axes(b), h = Math.hypot(v[0], v[1]) || 1
  const vx = (v[0] / h) * h * k, vy = (v[1] / h) * h * k
  void u
  return [[b[0][0] + vx, b[0][1] + vy], [b[1][0] + vx, b[1][1] + vy], [b[2][0] - vx, b[2][1] - vy], [b[3][0] - vx, b[3][1] - vy]]
}
/** Whether a point lies inside a convex quad. */
export function inQuad(b: Pt[], [x, y]: Pt): boolean {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = b[i], [x1, y1] = b[(i + 1) % 4]
    const c = (x1 - x0) * (y - y0) - (y1 - y0) * (x - x0)
    if (Math.abs(c) < 1e-9) continue
    if (sign && Math.sign(c) !== sign) return false
    sign = Math.sign(c)
  }
  return true
}
/** The vertical extent of a quad. */
export const yRange = (b: Pt[]): [number, number] => [Math.min(...b.map((p) => p[1])), Math.max(...b.map((p) => p[1]))]
/** The tallest band in [top, bottom] that no interval covers. */
export function largestGap(intervals: [number, number][], top: number, bottom: number): number {
  const xs = intervals.map(([a, b]) => [Math.max(top, a), Math.min(bottom, b)] as [number, number]).filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0])
  let at = top, gap = 0
  for (const [a, b] of xs) { gap = Math.max(gap, a - at); at = Math.max(at, b) }
  return Math.max(gap, bottom - at)
}
