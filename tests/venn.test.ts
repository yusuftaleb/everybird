import { describe, expect, it } from 'vitest'
import { CORE_MIN, diagramLayout, GAP, maskAt, OVERLAP_MAX, OVERLAP_MIN, PETAL_GAP, R_MIN, type Diagram } from '@/lib/share/venn'

const BOX = { x: 64, y: 300, w: 952, h: 600 }
/** Counts by mask for `n` lists, every combination holding `v` birds (index 0, on no list, stays 0). */
const flat = (n: number, v = 5) => Array.from({ length: 1 << n }, (_, k) => (k ? v : 0))
const two = (first: number, both: number, other: number) => [0, first, other, both]
const overlap = (d: Diagram) => d.circles[0].cx + d.circles[0].r - (d.circles[1].cx - d.circles[1].r)
const fits = (d: Diagram) => {
  for (const c of [...d.circles, ...(d.core ? [d.core] : [])]) {
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
      expect(d.kind).toBe(n === 2 ? 'two' : n === 3 ? 'three' : 'flower')
      fits(d)
    }
  })
  it('puts every number inside its own region, with room around it', () => {
    for (const c of cases) {
      const d = diagramLayout(c, BOX)
      const n = d.circles.length
      // Two lists: only the first, both, only the other; three: all seven regions; the flower: the centre and each petal.
      expect(d.spots.map((s) => s.mask).sort((a, b) => a - b)).toEqual(
        n === 2 ? [1, 2, 3] : n === 3 ? [1, 2, 3, 4, 5, 6, 7] : [...Array.from({ length: n }, (_, i) => 1 << i), (1 << n) - 1],
      )
      const big = Math.max(...d.circles.map((x) => x.r))
      for (const s of d.spots) {
        // Two lists sharing no bird: the "0" sits in the gap.
        if (!(n === 2 && s.mask === 3 && c[3] === 0)) expect(maskAt(d, s.x, s.y)).toBe(s.mask)
        expect(s.w).toBeGreaterThan(0.25 * big)
        expect(s.h).toBeGreaterThan(0.25 * big)
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
    const six = diagramLayout(cases.at(-1)!, BOX)
    for (const c of six.circles.slice(1)) expect(c.r / six.circles[0].r).toBeCloseTo(R_MIN, 5)
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
  it('the flower: petals around the centre, the first on top, never touching each other, each reaching under the centre', () => {
    for (const n of [4, 5, 6]) {
      const d = diagramLayout(flat(n), BOX)
      const core = d.core!
      expect(core.r).toBeGreaterThanOrEqual(CORE_MIN * Math.max(...d.circles.map((c) => c.r)) - 0.01)
      expect(d.circles[0].cy).toBeLessThan(core.cy)
      expect(d.circles[0].cx).toBeCloseTo(core.cx, 5)
      const big = Math.max(...d.circles.map((c) => c.r))
      d.circles.forEach((p, i) => {
        expect(Math.hypot(p.cx - core.cx, p.cy - core.cy) - p.r).toBeLessThan(core.r) // tucked under the centre
        d.circles.forEach((q, j) => {
          if (j > i) expect(Math.hypot(p.cx - q.cx, p.cy - q.cy)).toBeGreaterThanOrEqual(p.r + q.r + PETAL_GAP * big - 0.01)
        })
      })
      // The centre counts as every list.
      expect(maskAt(d, core.cx, core.cy)).toBe((1 << n) - 1)
    }
  })
})
