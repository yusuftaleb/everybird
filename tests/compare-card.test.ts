import { describe, expect, it } from 'vitest'
import { packFrame } from '@/lib/layout/pack'
import { cardLayout, fitPack, imagePackSpec, maxTileSide, type ImagePack } from '@/lib/share/image'
import { diagramBox, fitParts, titlePart } from '@/lib/share/compare-image'
import { diagramLayout } from '@/lib/share/venn'

// A share image with no birds to draw (an empty group): the empty pack must still lay out, the card's text over an
// empty collage, not a hang or NaN.
describe('a share image with no birds', () => {
  it('packs and fits zero birds to finite numbers', () => {
    const content = { name: true, filter: true, latest: false, count: 0 }
    const spec = imagePackSpec('post', content)
    const r = packFrame([], spec.aspect, { hole: spec.hole, maxTile: spec.maxTile })
    expect(r.boxes.size).toBe(0)
    expect(Number.isFinite(r.W) && Number.isFinite(r.H)).toBe(true)
    const pack: ImagePack = { W: r.W, H: r.H, boxes: new Map() }
    const L = cardLayout('post', content)
    const fit = fitPack(pack, L.collage, maxTileSide(L.collage.w, L.maxTile, L.maxSide))
    for (const v of Object.values(fit)) expect(Number.isFinite(v)).toBe(true)
  })
})

// The comparison card's head: the names and the counts line fit at the largest size they can, on even lines, and only
// at the floor are the names shortened, evenly, never the numbers.
describe('fitParts', () => {
  // A stand-in canvas: every character 0.55 em wide at the font's size.
  const fake = () => {
    let px = 0
    const ctx = { set font(f: string) { px = +/(\d+)px/.exec(f)![1] }, get font() { return `${px}px x` }, measureText: (s: string) => ({ width: s.length * px * 0.55 }) }
    return { ctx: ctx as unknown as CanvasRenderingContext2D, font: (p: number) => `700 ${p}px x` }
  }
  const same = (n: string) => n
  it('keeps short names on one line at the largest size', () => {
    expect(fitParts(fake(), ['Ada', 'Sam'], same, ' & ', [60, 40], 952, 2)).toEqual({ px: 60, lines: ['Ada & Sam'] })
  })
  it('breaks six names into two even lines before it shrinks them', () => {
    const r = fitParts(fake(), ['Alexandra', 'Bartholomew', 'Christophe', 'Dominique', 'Evangeline', 'Friederike'], same, ' & ', [60, 40], 952, 2)
    expect(r.lines).toHaveLength(2)
    expect(r.lines.join(' & ')).toBe('Alexandra & Bartholomew & Christophe & Dominique & Evangeline & Friederike')
    expect(Math.abs(r.lines[0].length - r.lines[1].length)).toBeLessThan(12)
    for (const l of r.lines) expect(l.length * r.px * 0.55).toBeLessThanOrEqual(952)
  })
  it('at the floor, shortens every name evenly and keeps each count whole', () => {
    const names = Array.from({ length: 6 }, (_, i) => `Wilhelmina-Konstantinopel ${i}`)
    const counts = [1234, 987, 650, 512, 300, 41]
    const r = fitParts(fake(), names, (n, i) => `${n}: ${counts[i]}`, ' · ', [30, 22], 952, 1)
    expect(r.px).toBe(22)
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0].length * 22 * 0.55).toBeLessThanOrEqual(952)
    for (const n of counts) expect(r.lines[0]).toContain(`: ${n}`)
    expect(r.lines[0].split(' · ').every((p) => p.includes('…'))).toBe(true)
  })
})

describe('the card\'s title', () => {
  const title = (names: string[]) => names.map((n, i) => titlePart(n, i, names.length)).join(' ')
  it('joins the names the usual way: commas, then " & " before the last', () => {
    expect(title(['Ada'])).toBe('Ada')
    expect(title(['Ada', 'Sam'])).toBe('Ada & Sam')
    expect(title(["Robin's birds", 'Sam', 'Ada'])).toBe("Robin's birds, Sam & Ada")
    expect(title(['A', 'B', 'C', 'D', 'E', 'F'])).toBe('A, B, C, D, E & F')
  })
  it('breaks into two lines at a comma, or before the "&", never leaving one alone', () => {
    const fake = () => {
      let px = 0
      const ctx = { set font(f: string) { px = +/(\d+)px/.exec(f)![1] }, get font() { return `${px}px x` }, measureText: (s: string) => ({ width: s.length * px * 0.55 }) }
      return { ctx: ctx as unknown as CanvasRenderingContext2D, font: (p: number) => `700 ${p}px x` }
    }
    const names = ['Alexandra', 'Bartholomew', 'Christophe', 'Dominique', 'Evangeline', 'Friederike']
    const r = fitParts(fake(), names, (n, i) => titlePart(n, i, names.length), ' ', [60, 40], 952, 2)
    expect(r.lines).toHaveLength(2)
    expect(r.lines.join(' ')).toBe('Alexandra, Bartholomew, Christophe, Dominique, Evangeline & Friederike')
    expect(r.lines[0]).toMatch(/,$/)
  })
})

// The card's diagram keeps the collage card's gaps (round 6, item 9): under the head by GAPS.head, above the footer's
// hairline by GAPS.collage, the hairline drawn `shift` higher when the credit takes its own line (image.ts paintCard).
describe('the card’s diagram between the head and the footer’s hairline', () => {
  /** image.ts GAPS, pinned: head under the counts, collage above the hairline. */
  const GAP = { story: { head: 40, collage: 32 }, post: { head: 40, collage: 32 }, square: { head: 48, collage: 40 } } as const
  const counts: Record<string, number[]> = {
    two: [0, 40, 20, 10],
    three: [0, 461, 120, 144, 90, 30, 60, 218],
    six: Array.from({ length: 64 }, (_, k) => (k ? (k * 37) % 23 : 0)),
  }
  for (const format of ['story', 'post', 'square'] as const) {
    for (const shift of [0, 32]) {
      for (const [lists, c] of Object.entries(counts)) {
        it(`${format}, ${lists} lists${shift ? ', the credit on its own line' : ''}`, () => {
          const L = cardLayout(format, { name: false, filter: false, latest: false, count: 0, countSize: 'hide' })
          // The tallest head: two title lines at 60px (69 apart), 8px, the counts line at 30px.
          const headBottom = L.collage.y + 2 * 69 + 8 + 30
          const box = diagramBox(format, L, headBottom, shift)
          const d = diagramLayout(c, box)
          const all = d.core ? [...d.circles, d.core] : d.circles
          // The outline's outer half (2px) counts as the drawing.
          const low = Math.max(...all.map((k) => k.cy + k.r), ...d.spots.map((s) => s.y + s.h / 2)) + 2
          const high = Math.min(...all.map((k) => k.cy - k.r)) - 2
          const hairline = L.rule.y - shift
          expect(low).toBeLessThanOrEqual(hairline - GAP[format].collage + 1e-6)
          expect(high).toBeGreaterThanOrEqual(headBottom + GAP[format].head - 1e-6)
          // As large as the room allows, centred in it.
          const left = Math.min(...all.map((k) => k.cx - k.r)) - 2, right = Math.max(...all.map((k) => k.cx + k.r)) + 2
          const room = { top: headBottom + GAP[format].head, bottom: hairline - GAP[format].collage, left: L.collage.x, right: L.collage.x + L.collage.w }
          expect(Math.abs(high - room.top - (room.bottom - low))).toBeLessThan(0.5)
          expect(Math.abs(left - room.left - (room.right - right))).toBeLessThan(0.5)
          // Centred, so it reaches the room's edges on the tighter side.
          expect(Math.min(room.bottom - low, room.right - right)).toBeLessThan(0.5)
        })
      }
    }
  }
})
