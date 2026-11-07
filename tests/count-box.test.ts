import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { LAYOUTS } from '../src/lib/layout/constants'
import {
  collageBoxes, collageHole, countScale, countText, holeExtent, labelEm, numberEm, rectGap, touchesHole, type Hole, type Rect,
} from '../src/lib/layout/count-box'
import { decodeMask, maskCell, type Mask } from '../src/lib/layout/mask'
import { packBest, packFrame, type PackBird, type PackResult } from '../src/lib/layout/pack'
import { cardLayout, countLayout, ogCountHole, OG_COUNT_MAX, packSpec } from '../src/lib/share/image'
import { OG_COLLAGE } from '../src/lib/share/og'

// The count's hole is sized from the shown count's text (count-box.ts): the number and the SPECIES label never get a
// sticker on them. Real masks and masses from public/data (public reference data only).
const DATA = resolve(__dirname, '../public/data')
let POOL: PackBird[] = []
function loadPool(): PackBird[] {
  const masks = new Map<string, Mask>()
  for (const f of readdirSync(resolve(DATA, 'masks')).sort()) {
    const rec = JSON.parse(readFileSync(resolve(DATA, 'masks', f), 'utf8')) as Record<string, [number, number, string]>
    for (const [code, m] of Object.entries(rec)) masks.set(code, decodeMask(m))
  }
  const species = (JSON.parse(readFileSync(resolve(DATA, 'species.v1.json'), 'utf8')).species as { code: string; g: number }[])
    .filter((s) => masks.has(s.code))
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
  return species.map((s, i) => ({ id: i, mass: s.g, mask: masks.get(s.code)! }))
}
const sample = (n: number) => { const step = POOL.length / n; return Array.from({ length: n }, (_, i) => POOL[Math.floor(i * step)]) }
const byName = (n: string) => LAYOUTS.find((l) => l.name === n)!

/** Silhouette cells of every placed sticker as rects in layout units about the stage centre (the count's centre). */
function silhouettes(birds: PackBird[], r: PackResult, visit: (cell: Rect) => void) {
  const cx = r.W / 2, cy = r.H / 2
  const byId = new Map(birds.map((b) => [b.id, b]))
  for (const [id, [x, y, w, h]] of r.boxes) {
    const m = byId.get(id)!.mask
    for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) {
      if (!maskCell(m, i, j)) continue
      const sx = w / m.w, sy = h / m.h
      visit([x + i * sx - cx, y + j * sy - cy, x + (i + 1) * sx - cx, y + (j + 1) * sy - cy])
    }
  }
}
/** Silhouette cells on the text's boxes (none allowed) and within its pad less `slack` (a grid cell: the air kept). */
function clash(birds: PackBird[], r: PackResult, hole: Hole, slack = 2) {
  let onText = 0, inAir = 0
  silhouettes(birds, r, (c) => {
    const d = Math.min(rectGap(c, hole.num), rectGap(c, hole.label))
    if (d <= 0) onText++
    if (d < hole.pad - slack) inAir++
  })
  return { onText, inAir }
}

describe('count text metrics', () => {
  it('formats the count as shown, with a comma from four digits', () => {
    expect([7, 197, 1089, 11019].map(countText)).toEqual(['7', '197', '1,089', '11,019'])
  })
  it("numberEm: at least the drawn width in every face that may draw it (measured in Chromium)", () => {
    // Satoshi 700 tabular (what the app draws while Fontshare serves no Cabinet), Cabinet Grotesk 700, Satoshi
    // proportional (canvas): their measured widths at 1000px less the -0.02em tracking per character.
    const drawn: Record<string, number[]> = { '197': [1.98, 1.415, 1.556], '1,089': [2.931, 2.379, 2.619], '11,019': [3.591, 2.446, 2.76] }
    for (const [t, ws] of Object.entries(drawn)) for (const w of ws) expect(numberEm(t)).toBeGreaterThanOrEqual(w - 0.02 * t.length)
    // ...and not much more than the widest of them.
    for (const [t, ws] of Object.entries(drawn)) expect(numberEm(t)).toBeLessThan(Math.max(...ws) * 1.06)
    expect(labelEm() * 12).toBeGreaterThanOrEqual(55.45) // the rendered "SPECIES" box at 12px
  })
  it('draws five digits a little smaller', () => {
    expect([7, 197, 1089, 11019].map((n) => countScale(countText(n)))).toEqual([1, 1, 1, 0.85])
  })
})

describe('collageHole', () => {
  it("keeps a three-digit count's hole where the old ellipse was (wide 197: about 74 x 52)", () => {
    const [ex, ey] = holeExtent(collageHole(197, byName('wide')))
    expect(ex).toBeGreaterThan(70)
    expect(ex).toBeLessThan(80)
    expect(ey).toBeGreaterThan(48)
    expect(ey).toBeLessThan(58)
  })
  it('holds the text on every stage width the layout serves, and grows with the number', () => {
    for (const L of LAYOUTS) {
      let last = 0
      for (const n of [7, 197, 1089, 11019]) {
        const h = collageHole(n, L)
        const t = countText(n), S = L.F * countScale(t)
        // The rendered column at the stage's narrowest and widest: number line box .85 S, 6px gap, 15.6px label line.
        for (const px of [Math.max(L.minWidth, 288), L.maxWidth]) {
          const u = L.W / px
          const H = 0.85 * S + (6 + 15.6) * u
          const num: Rect = [-numberEm(t) * S / 2, -H / 2, numberEm(t) * S / 2, -H / 2 + 0.85 * S]
          const label: Rect = [-27.73 * u, H / 2 - 15.6 * u, 27.73 * u, H / 2]
          for (const r of [num, label]) {
            expect(r[0]).toBeGreaterThanOrEqual(Math.min(h.num[0], h.label[0]) - 1e-9)
            expect(r[2]).toBeLessThanOrEqual(Math.max(h.num[2], h.label[2]) + 1e-9)
            expect(r[1]).toBeGreaterThanOrEqual(h.num[1] - 1e-9)
            expect(r[3]).toBeLessThanOrEqual(h.label[3] + 1e-9)
          }
        }
        const [ex] = holeExtent(h)
        if (n >= 197) expect(ex).toBeGreaterThan(last)
        last = ex
        expect(touchesHole([-1, -1, 1, 1], h)).toBe(true)
        expect(touchesHole([ex + 1, -1, ex + 3, 1], h)).toBe(false)
      }
    }
  })
  it('never eats more than about half the narrow stage (11,019 drawn at 85%)', () => {
    expect(2 * holeExtent(collageHole(11019, byName('narrow')))[0] / byName('narrow').W).toBeLessThan(0.5)
    expect(2 * holeExtent(collageHole(1089, byName('wide')))[0] / byName('wide').W).toBeLessThan(0.2)
  })
  it('collageBoxes: the number is wider than the label from three digits', () => {
    const b = collageBoxes(197, byName('wide'))
    expect(b.num[2]).toBeGreaterThan(b.label[2])
  })
})

describe('the packer keeps every sticker off the count (390 / 768 / 1280: narrow, medium, wide)', () => {
  beforeAll(() => { POOL = loadPool() })
  for (const name of ['narrow', 'medium', 'wide']) {
    for (const n of [7, 197, 1089]) {
      it(`${n.toLocaleString('en-US')} species on ${name}`, () => {
        const birds = sample(n)
        const r = packBest(birds, byName(name), 'even')
        expect(r.boxes.size).toBe(n)
        expect(clash(birds, r, collageHole(n, byName(name)))).toEqual({ onText: 0, inAir: 0 })
      }, 60_000)
    }
    // 11,019 birds would take minutes to pack per layout; 1,500 of them packed around the hole 11,019 asks for.
    it(`the hole of 11,019 species on ${name} (1,500 birds packed around it)`, () => {
      const birds = sample(1500)
      const hole = collageHole(11019, byName(name))
      const r = packBest(birds, byName(name), 'even', { hole })
      expect(clash(birds, r, hole)).toEqual({ onText: 0, inAir: 0 })
    }, 60_000)
  }
  it('a filtered state (fit) keeps its own count clear', () => {
    const L = byName('wide')
    const all = sample(1089)
    const full = packBest(all, L, 'even')
    const few = all.filter((_, i) => i % 9 === 0)
    const r = packBest(few, L, 'even', { refBase: full.base, fixedStage: [full.W, full.H], fit: true })
    expect(clash(few, r, collageHole(few.length, L))).toEqual({ onText: 0, inAir: 0 })
  }, 60_000)
})

describe('share images and the link preview keep their count clear', () => {
  beforeAll(() => { if (!POOL.length) POOL = loadPool() })
  for (const format of ['story', 'post', 'square'] as const) {
    for (const n of [1089, 11019]) {
      it(`${format}, ${n.toLocaleString('en-US')} species (packFrame, at most 1,500 birds drawn)`, () => {
        const L = cardLayout(format, { name: true, filter: false, latest: true, count: n })
        const spec = packSpec(L)
        const birds = sample(Math.min(n, 1500))
        const r = packFrame(birds, spec.aspect, spec)
        // In px: the frame's width is the collage's.
        const k = L.collage.w / r.W
        const px: PackResult = { ...r, W: r.W * k, H: r.H * k, boxes: new Map([...r.boxes].map(([id, [x, y, w, h]]) => [id, [x * k, y * k, w * k, h * k]])) }
        expect(clash(birds, px, L.count.hole, 2 * k)).toEqual({ onText: 0, inAir: 0 })
      }, 60_000)
    }
  }
  for (const n of [1089, 11019]) {
    it(`the link preview, ${n.toLocaleString('en-US')} species (60 birds around the count)`, () => {
      const K = countLayout(OG_COUNT_MAX, n, OG_COLLAGE.w)
      const hole = ogCountHole(K)
      const birds = sample(60)
      const r = packBest(birds, byName('wide'), 'even', { fixedStage: [OG_COLLAGE.w, OG_COLLAGE.h], hole, maxBase: 60 })
      expect(clash(birds, r, hole)).toEqual({ onText: 0, inAir: 0 })
    }, 60_000)
  }
})
