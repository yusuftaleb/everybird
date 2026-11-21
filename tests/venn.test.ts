import { describe, expect, it } from 'vitest'
import { diagramLayout, fitsAt, GAP, maskAt, numberBox, numberSize, OVERLAP_MAX, OVERLAP_MIN, R_MIN, regionMasks, RING, unshownCount, type Box, type Diagram } from '@/lib/share/venn'

const BOX = { x: 64, y: 300, w: 952, h: 600 }
/** Counts by mask for `n` lists, every combination holding `v` birds (index 0, on no list, stays 0). */
const flat = (n: number, v = 5) => Array.from({ length: 1 << n }, (_, k) => (k ? v : 0))
const two = (first: number, both: number, other: number) => [0, first, other, both]
const overlap = (d: Diagram) => d.circles[0].cx + d.circles[0].r - (d.circles[1].cx - d.circles[1].r)
const fits = (d: Diagram) => {
  for (const c of d.circles) {
    expect(c.cx - c.r).toBeGreaterThanOrEqual(BOX.x - 0.01)
    expect(c.cx + c.r).toBeLessThanOrEqual(BOX.x + BOX.w + 0.01)
    expect(c.cy - c.r).toBeGreaterThanOrEqual(BOX.y - 0.01)
    expect(c.cy + c.r).toBeLessThanOrEqual(BOX.y + BOX.h + 0.01)
  }
}
const cases: number[][] = [
  two(12, 157, 33), two(49, 1, 899), two(0, 50, 850), two(300, 300, 0), two(5, 0, 7), two(0, 0, 0),
  flat(3), [0, 900, 10, 0, 10, 0, 0, 1], [0, 0, 0, 0, 0, 0, 0, 0],
  flat(4), flat(5), flat(6), Array.from({ length: 64 }, (_, k) => (k === 1 ? 900 : k ? 1 : 0)),
]

describe('diagramLayout', () => {
  it('fits the box, a circle per list, the kind by the count of lists', () => {
    for (const c of cases) {
      const d = diagramLayout(c, BOX)
      const n = Math.log2(c.length)
      expect(d.circles).toHaveLength(n)
      expect(d.kind).toBe(n === 2 ? 'two' : n === 3 ? 'three' : 'ring')
      fits(d)
    }
  })
  it('puts every number inside its own region, with room around it', () => {
    for (const c of cases) {
      const d = diagramLayout(c, BOX)
      const n = d.circles.length
      // Two lists: only the first, both, only the other; three: all seven regions; a ring: every run of neighbours.
      expect(d.spots.map((s) => s.mask)).toEqual(regionMasks(n))
      const big = Math.max(...d.circles.map((x) => x.r))
      for (const s of d.spots) {
        // Two lists sharing no bird: the "0" sits in the gap.
        if (!(n === 2 && s.mask === 3 && c[3] === 0)) expect(maskAt(d, s.x, s.y)).toBe(s.mask)
        // Two or three circles: room for a big number in every region; a ring's slivers are thinner.
        expect(s.w).toBeGreaterThan((n <= 3 ? 0.25 : 0.05) * big)
        expect(s.h).toBeGreaterThan((n <= 3 ? 0.25 : 0.05) * big)
      }
    }
  })
  it('sizes the circles by the lists, none under R_MIN of the biggest', () => {
    const d = diagramLayout(two(49, 1, 899), BOX)
    expect(d.circles[0].r / d.circles[1].r).toBeCloseTo(R_MIN, 5)
    const w = diagramLayout(two(100, 300, 500), BOX)
    expect(w.circles[0].r / w.circles[1].r).toBeCloseTo(Math.sqrt(400 / 800), 5)
    const three = diagramLayout([0, 300, 100, 0, 200, 0, 0, 100], BOX) // sizes 400, 200, 300
    const r = three.circles.map((c) => c.r)
    expect(r[1] / r[0]).toBeCloseTo(Math.sqrt(0.5), 5)
    expect(r[2] / r[0]).toBeCloseTo(Math.sqrt(0.75), 5)
    // A ring's circles are equal, however different the lists (the bars give their sizes).
    const six = diagramLayout(cases.at(-1)!, BOX)
    for (const c of six.circles.slice(1)) expect(c.r).toBeCloseTo(six.circles[0].r, 9)
  })
  it('two circles: an overlap whenever a bird is shared, deeper as more of the smaller list is, a gap when none is', () => {
    for (const c of cases.slice(0, 6)) {
      const d = diagramLayout(c, BOX)
      const rs = Math.min(d.circles[0].r, d.circles[1].r)
      if (c[3] > 0) {
        expect(overlap(d)).toBeGreaterThanOrEqual(OVERLAP_MIN * rs - 0.01)
        expect(overlap(d)).toBeLessThanOrEqual(OVERLAP_MAX * rs + 0.01)
      } else expect(overlap(d)).toBeCloseTo(-GAP * rs, 5)
    }
    const few = diagramLayout(two(99, 1, 99), BOX), many = diagramLayout(two(1, 99, 1), BOX)
    expect(overlap(many) / many.circles[0].r).toBeGreaterThan(overlap(few) / few.circles[0].r)
  })
  it('three circles: every region drawn, an empty one too, the first up-left, the second up-right, the third down', () => {
    const d = diagramLayout([0, 0, 0, 0, 0, 0, 0, 0], BOX)
    const [a, b, c] = d.circles
    expect(a.cx).toBeLessThan(b.cx)
    expect(c.cy).toBeGreaterThan(a.cy)
    expect(d.spots.every((s) => maskAt(d, s.x, s.y) === s.mask)).toBe(true)
  })
})

/** Every mask the drawing has, sampled on a fine grid over its bounds. */
function drawn(d: Diagram): Set<number> {
  const seen = new Set<number>()
  const x0 = Math.min(...d.circles.map((c) => c.cx - c.r)), x1 = Math.max(...d.circles.map((c) => c.cx + c.r))
  const y0 = Math.min(...d.circles.map((c) => c.cy - c.r)), y1 = Math.max(...d.circles.map((c) => c.cy + c.r))
  const step = (x1 - x0) / 600
  for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) seen.add(maskAt(d, x, y))
  seen.delete(0)
  return seen
}
const boxesMeet = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
/** Counts for `n` lists from a fixed seed: up to three digits, some 0. */
const varied = (n: number) => Array.from({ length: 1 << n }, (_, k) => (k % 7 ? (k * 7919) % 431 : 0))

describe('the ring, 4 to 6 lists', () => {
  for (const n of [4, 5, 6]) {
    it(`${n} lists: equal circles round the middle in list order, the first on top, each covering the middle and overlapping its neighbours`, () => {
      const d = diagramLayout(flat(n), BOX)
      const mx = d.circles.reduce((s, c) => s + c.cx, 0) / n, my = d.circles.reduce((s, c) => s + c.cy, 0) / n
      const r = d.circles[0].r
      expect(d.circles[0].cx).toBeCloseTo(mx, 6)
      expect(d.circles[0].cy).toBeLessThan(my)
      d.circles.forEach((c, i) => {
        expect(c.r).toBeCloseTo(r, 9)
        expect(Math.hypot(c.cx - mx, c.cy - my)).toBeCloseTo(RING * r, 6)
        // Clockwise from the top, a step of 360° / n each.
        const angle = Math.atan2(c.cy - my, c.cx - mx)
        expect(Math.cos(angle - (-Math.PI / 2 + (2 * Math.PI * i) / n))).toBeCloseTo(1, 6)
        expect(maskAt(d, mx, my) & (1 << i)).toBeTruthy()
        const next = d.circles[(i + 1) % n]
        // Neighbours overlap generously: by more than half a radius.
        expect(2 * r - Math.hypot(c.cx - next.cx, c.cy - next.cy)).toBeGreaterThan(0.5 * r)
      })
    })
    it(`${n} lists: draws every single list, every pair of neighbours, every run of neighbours and the all-lists centre, and nothing else`, () => {
      const d = diagramLayout(flat(n), BOX)
      const seen = drawn(d)
      const full = (1 << n) - 1
      expect(seen.has(full)).toBe(true)
      expect(maskAt(d, d.circles.reduce((s, c) => s + c.cx, 0) / n, d.circles.reduce((s, c) => s + c.cy, 0) / n)).toBe(full)
      for (let i = 0; i < n; i++) {
        expect(seen.has(1 << i)).toBe(true)
        expect(seen.has((1 << i) | (1 << ((i + 1) % n)))).toBe(true)
      }
      expect([...seen].sort((a, b) => a - b)).toEqual([...regionMasks(n)].sort((a, b) => a - b))
      expect(regionMasks(n)).toHaveLength(n * (n - 1) + 1) // 13, 21, 31
    })
    it(`${n} lists: every spot inside its own region; no two numbers overlap; the regions drawn and the unshown birds add up`, () => {
      const c = varied(n)
      const d = diagramLayout(c, BOX, { w: Array(n).fill(120), h: 36, gap: 12 })
      const boxes: Box[] = []
      for (const s of d.spots) {
        expect(maskAt(d, s.x, s.y)).toBe(s.mask)
        const text = String(c[s.mask])
        const px = numberSize(d, s, text.length, 84, 24)
        if (!px) continue
        const b = numberBox(px, text.length)
        expect(fitsAt(d, s.x, s.y, b.w, b.h)).toBe(true)
        boxes.push({ x: s.x - b.w / 2, y: s.y - b.h / 2, ...b })
      }
      boxes.forEach((a, i) => boxes.forEach((b, j) => { if (j > i) expect(boxesMeet(a, b)).toBe(false) }))
      const drawnBirds = regionMasks(n).reduce((s, m) => s + c[m], 0)
      expect(drawnBirds + unshownCount(c)).toBe(c.reduce((s, v) => s + v, 0))
      expect(unshownCount(c)).toBeGreaterThan(0)
    })
  }
  it('two and three lists draw every combination: nothing unshown', () => {
    expect(unshownCount(flat(2))).toBe(0)
    expect(unshownCount(flat(3))).toBe(0)
    // Four lists: only the first and third, and only the second and fourth, have no region.
    const c = new Array(16).fill(0)
    c[0b0101] = 3
    c[0b1010] = 4
    c[0b0011] = 9
    expect(unshownCount(c)).toBe(7)
  })
})

describe('the names, outside the circles', () => {
  for (const n of [2, 3, 4, 5, 6]) {
    it(`${n} lists: each name's box in the drawing's box, outside every circle, apart from the others`, () => {
      const box = { x: 4, y: 4, w: 435, h: 352 }
      const d = diagramLayout(flat(n), box, { w: Array(n).fill(100), h: 18, gap: 6 })
      const names = d.names!
      expect(names).toHaveLength(n)
      for (const b of names) {
        expect(b.x).toBeGreaterThanOrEqual(box.x - 1e-6)
        expect(b.y).toBeGreaterThanOrEqual(box.y - 1e-6)
        expect(b.x + b.w).toBeLessThanOrEqual(box.x + box.w + 1e-6)
        expect(b.y + b.h).toBeLessThanOrEqual(box.y + box.h + 1e-6)
        for (let k = 0; k <= 20; k++) {
          for (const [x, y] of [[b.x + (b.w * k) / 20, b.y], [b.x + (b.w * k) / 20, b.y + b.h], [b.x, b.y + (b.h * k) / 20], [b.x + b.w, b.y + (b.h * k) / 20]]) {
            expect(maskAt(d, x, y)).toBe(0)
          }
        }
      }
      names.forEach((a, i) => names.forEach((b, j) => { if (j > i) expect(boxesMeet(a, b)).toBe(false) }))
      // Each name on its own circle's side, away from the middle.
      const mx = d.circles.reduce((s, c) => s + c.cx, 0) / n, my = d.circles.reduce((s, c) => s + c.cy, 0) / n
      names.forEach((b, i) => {
        const c = d.circles[i]
        const [bx, by] = [b.x + b.w / 2 - c.cx, b.y + b.h / 2 - c.cy]
        expect(bx * (c.cx - mx) + by * (c.cy - my)).toBeGreaterThanOrEqual(n === 2 ? -1e-6 : 0)
      })
    })
  }
})
