import { describe, expect, it } from 'vitest'
import type { PairPart } from '@/lib/share/compare'
import { GAP, OVERLAP_MAX, OVERLAP_MIN, R_MIN, vennLayout, type Venn, type VennCounts } from '@/lib/share/venn'

const BOX = { x: 64, y: 200, w: 952, h: 560 }
const partAt = (v: Venn, x: number, y: number): PairPart | null => {
  const inA = (x - v.a.cx) ** 2 + (y - v.a.cy) ** 2 < v.a.r ** 2
  const inB = (x - v.b.cx) ** 2 + (y - v.b.cy) ** 2 < v.b.r ** 2
  return inA && inB ? 'both' : inA ? 'first' : inB ? 'other' : null
}
const overlap = (v: Venn) => v.a.cx + v.a.r - (v.b.cx - v.b.r)
const cases: VennCounts[] = [
  { first: 12, both: 157, other: 33 },
  { first: 49, both: 1, other: 899 }, // a 50-bird list beside a 900-bird one, one bird shared
  { first: 0, both: 50, other: 850 }, // the small list all shared
  { first: 300, both: 300, other: 0 },
  { first: 5, both: 0, other: 7 },
  { first: 0, both: 0, other: 0 },
  { first: 1, both: 2000, other: 1 },
]

describe('vennLayout', () => {
  it('fits the box, both circles centred on its middle line', () => {
    for (const n of cases) {
      const v = vennLayout(n, BOX)
      expect(v.a.cx - v.a.r).toBeGreaterThanOrEqual(BOX.x - 0.01)
      expect(v.b.cx + v.b.r).toBeLessThanOrEqual(BOX.x + BOX.w + 0.01)
      for (const c of [v.a, v.b]) {
        expect(c.cy).toBe(BOX.y + BOX.h / 2)
        expect(c.r).toBeLessThanOrEqual(BOX.h / 2 + 0.01)
      }
      // Fills the box one way or the other.
      expect(Math.max((v.b.cx + v.b.r - (v.a.cx - v.a.r)) / BOX.w, (2 * Math.max(v.a.r, v.b.r)) / BOX.h)).toBeCloseTo(1, 5)
    }
  })
  it('sizes the circles by the lists, the smaller never under R_MIN of the bigger', () => {
    const v = vennLayout({ first: 49, both: 1, other: 899 }, BOX)
    expect(v.a.r / v.b.r).toBeCloseTo(R_MIN, 5)
    const w = vennLayout({ first: 100, both: 300, other: 500 }, BOX)
    expect(w.a.r / w.b.r).toBeCloseTo(Math.sqrt(400 / 800), 5)
    const same = vennLayout({ first: 10, both: 10, other: 10 }, BOX)
    expect(same.a.r).toBeCloseTo(same.b.r, 5)
  })
  it('keeps an overlap whenever a bird is shared, deeper as more of the smaller list is, and a gap when none is', () => {
    for (const n of cases) {
      const v = vennLayout(n, BOX)
      const rs = Math.min(v.a.r, v.b.r)
      if (n.both > 0) {
        expect(overlap(v)).toBeGreaterThanOrEqual(OVERLAP_MIN * rs - 0.01)
        expect(overlap(v)).toBeLessThanOrEqual(OVERLAP_MAX * rs + 0.01)
        expect(v.paths.both).toMatch(/^M.*A.*A.*Z$/)
      } else {
        expect(overlap(v)).toBeCloseTo(-GAP * rs, 5)
        expect(v.paths.both).toBe('')
      }
    }
    const few = vennLayout({ first: 99, both: 1, other: 99 }, BOX), many = vennLayout({ first: 1, both: 99, other: 1 }, BOX)
    expect(overlap(many) / many.a.r).toBeGreaterThan(overlap(few) / few.a.r)
  })
  it('puts each region’s number inside that region, with room across it', () => {
    for (const n of cases) {
      const v = vennLayout(n, BOX)
      const rs = Math.min(v.a.r, v.b.r)
      for (const part of ['first', 'other'] as const) {
        expect(partAt(v, v.spots[part].x, v.spots[part].y)).toBe(part)
        expect(v.spots[part].w).toBeGreaterThan(0.3 * rs)
      }
      expect(partAt(v, v.spots.both.x, v.spots.both.y)).toBe(n.both > 0 ? 'both' : null)
      expect(v.spots.both.w).toBeGreaterThan(0.45 * rs)
    }
  })
  it('draws each region from the two crossing points, the arcs’ flags for the shape the counts give', () => {
    const v = vennLayout({ first: 20, both: 80, other: 900 }, BOX)
    const flags = (d: string) => [...d.matchAll(/A[\d.]+ [\d.]+ 0 (\d) (\d)/g)].map((m) => `${m[1]}${m[2]}`)
    expect(flags(v.paths.first)).toEqual(['10', '01'])
    expect(flags(v.paths.both)).toEqual(['01', '01'])
    expect(flags(v.paths.other)).toEqual(['01', '10'])
    // The bigger list first: the same shape, mirrored.
    const m = vennLayout({ first: 900, both: 80, other: 20 }, BOX)
    expect(flags(m.paths.first)).toEqual(['10', '01'])
    expect(flags(m.paths.other)).toEqual(['01', '10'])
  })
})
