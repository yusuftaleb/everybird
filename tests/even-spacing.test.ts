// The share images' and the poster's even spacing (packFrame's spreadEven), measured on real sticker masks and masses
// from public/data (reference data, no personal list), sampled at a fixed stride. The measure (tests/evenness.ts) works
// on the rasterised silhouettes, not on the packer's grid: each bird's reach (the farthest free point that is nearer it
// than any other bird) is about the same for every bird, no free disc anywhere is much wider than a sticker, nearest
// neighbours sit about equally far apart, and with Fit the birds reach the frame's corners. Before the spread, the same
// packs had reaches varying by up to 140% (coefficient of variation 1.4), holes up to 15 stickers wide and corners up
// to 8 stickers from the nearest bird.
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { scaleHole } from '../src/lib/layout/count-box'
import { decodeMask, maskCell, type Mask } from '../src/lib/layout/mask'
import { FRAME_DENSE_FROM, SMALL_GROUP, packFrame, type PackBird, type PackResult } from '../src/lib/layout/pack'
import { cardDims, cardLayout, fitBox, fitPack, imagePackSpec, maxTileSide, packSpec, type CardFormat } from '../src/lib/share/image'
import { evenness } from './evenness'

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
const sample = (n: number) => Array.from({ length: n }, (_, i) => POOL[Math.floor((i * POOL.length) / n)])

/** No two silhouettes share a layout unit, and every box is inside the frame. */
function clean(birds: PackBird[], r: PackResult): boolean {
  const byId = new Map(birds.map((b) => [b.id, b]))
  const owner = new Map<number, number>()
  for (const [id, [x, y, w, h]] of r.boxes) {
    if (x < -1e-6 || y < -1e-6 || x + w > r.W + 1e-6 || y + h > r.H + 1e-6) return false
    const m: Mask = byId.get(id)!.mask
    for (let py = Math.floor(y); py < Math.ceil(y + h); py++) {
      for (let px = Math.floor(x); px < Math.ceil(x + w); px++) {
        const u = (px + 0.5 - x) / w, v = (py + 0.5 - y) / h
        if (u < 0 || v < 0 || u >= 1 || v >= 1 || !maskCell(m, Math.floor(u * m.w), Math.floor(v * m.h))) continue
        const k = py * 100_000 + px
        if (owner.has(k) && owner.get(k) !== id) return false
        owner.set(k, id)
      }
    }
  }
  return true
}

describe('even spacing in the share images and the poster', () => {
  beforeAll(() => { if (!POOL.length) POOL = loadPool() })

  // Each format's own frame, with the count in the middle (its hole) or beside the title (none).
  const CASES: [CardFormat, number, 'medium' | 'title'][] = [
    ['story', 60, 'medium'], ['post', 197, 'medium'], ['square', 197, 'title'], ['desktop', 197, 'medium'],
    ['print', 600, 'medium'], ['print', 197, 'title'], ['printLandscape', 300, 'medium'], ['story', 40, 'medium'],
    ['story', 1092, 'medium'], ['post', 800, 'title'],
  ]
  for (const oval of [false, true]) {
    for (const [format, n, countSize] of CASES) {
      it(`${oval ? 'Oval' : 'Fit'}, ${format}, ${n} species, count ${countSize}: even gaps, no holes${oval ? '' : ', the corners filled'}`, () => {
        const L = cardLayout(format, { name: true, filter: false, latest: true, count: n, countSize }, cardDims(format))
        const spec = packSpec(L)
        const birds = sample(n)
        const r = packFrame(birds, spec.aspect, { hole: spec.hole, maxTile: spec.maxTile, oval })
        expect(r.boxes.size).toBe(n)
        expect(clean(birds, r)).toBe(true)
        const e = evenness(birds, r, { hole: scaleHole(spec.hole, r.W), oval })
        // Every bird's reach about the same (it was up to 1.4 before the spread). A short list's few birds vary more.
        expect(e.reachCv).toBeLessThan(n < 24 ? 0.45 : 0.35)
        // No hole much wider than a sticker: a short list (capped sizes) gets wide, even gaps instead.
        expect(e.maxVoid / e.medianL).toBeLessThan(n < 24 ? 5 : 3.2)
        // Nearest neighbours about equally far apart (a short list's wide gaps meet the hole and the oval's curve unevenly).
        // Fit's dense frames (FRAME_DENSE_FROM) keep one GAP between birds, so the median gap halves (6 -> 3 units on a
        // 1,092-species story) and the 90th percentile over it rises (1.3 -> 2.1) though it is smaller too (8 -> 6.3 units).
        expect(e.p90).toBeLessThan(n < 24 ? 3 : !oval && n >= FRAME_DENSE_FROM ? 2.5 : 2)
        // Fit: a bird within a sticker's length of every corner.
        if (!oval) for (const c of e.corners) expect(c / e.medianL).toBeLessThan(0.75)
      }, 60_000)
    }
  }

  // Round 6 (Yusuf, on a 1,092-species story: "the birds look tiny"): from FRAME_DENSE_FROM birds a frame is packed as the
  // page packs a big collage, one GAP between birds, so the same frame holds bigger stickers than the loose pack it had
  // (LOOSE: that pack's base for these 1,092 birds, recorded before the change). Item 8: Free draws its cloud in the images
  // as on the page (settled into the rounded rectangle, nothing spread to the walls), so its corners stay open; Fit's reach
  // the frame's corners.
  const LOOSE = { story: 16.9661, post: 16.9627, square: 16.8159, desktop: 16.5372, wide: 16.6769 } as const
  for (const format of ['story', 'post', 'square', 'desktop', 'wide'] as const) {
    it(`${format}, 1,092 species: Fit and Free packed dense, the stickers bigger than the loose pack's; Free's corners open, Fit's filled`, () => {
      const spec = packSpec(cardLayout(format, { name: true, filter: false, latest: true, count: 1092 }, cardDims(format)))
      const birds = sample(1092)
      const fit = packFrame(birds, spec.aspect, { hole: spec.hole, maxTile: spec.maxTile })
      const free = packFrame(birds, spec.aspect, { hole: spec.hole, maxTile: spec.maxTile, free: true })
      for (const r of [fit, free]) {
        expect(r.base / LOOSE[format]).toBeGreaterThan(1.05)
        expect(clean(birds, r)).toBe(true)
      }
      const corners = (r: PackResult) => { const e = evenness(birds, r, { hole: scaleHole(spec.hole, r.W) }); return e.corners.map((c) => c / e.medianL) }
      console.log(`[corners] ${format} 1,092: Fit ${corners(fit).map((c) => c.toFixed(2)).join(' ')}, Free ${corners(free).map((c) => c.toFixed(2)).join(' ')}`)
      for (const c of corners(fit)) expect(c).toBeLessThan(0.75)
      for (const c of corners(free)) expect(c).toBeGreaterThan(1.25)
    }, 60_000)
  }

  // Item 11: Free is a cloud from FREE_CLOUD_FROM (100) birds, not only once dense: under FRAME_DENSE_FROM its pack stays
  // inside the rounded rectangle |u|^3 + |v|^3 <= 1 and settles into it, so its corners stay open while Fit's are filled.
  for (const n of [100, 200, 300]) {
    for (const format of ['story', 'post', 'square', 'desktop', 'wide'] as const) {
      it(`${format}, ${n} species: Free's corners open, Fit's filled`, () => {
        const spec = packSpec(cardLayout(format, { name: true, filter: false, latest: true, count: n }, cardDims(format)))
        const birds = sample(n)
        const fit = packFrame(birds, spec.aspect, { hole: spec.hole, maxTile: spec.maxTile })
        const free = packFrame(birds, spec.aspect, { hole: spec.hole, maxTile: spec.maxTile, free: true })
        expect(clean(birds, free)).toBe(true)
        const corners = (r: PackResult) => { const e = evenness(birds, r, { hole: scaleHole(spec.hole, r.W) }); return e.corners.map((c) => c / e.medianL) }
        console.log(`[corners] ${format} ${n}: Fit ${corners(fit).map((c) => c.toFixed(2)).join(' ')}, Free ${corners(free).map((c) => c.toFixed(2)).join(' ')}`)
        for (const c of corners(fit)) expect(c).toBeLessThan(0.75)
        for (const c of corners(free)) expect(c).toBeGreaterThan(1.25)
      }, 60_000)
    }
  }

  // Round 6, item 12: a list under SMALL_GROUP birds is one snug group round the count, as large as its frame allows,
  // in every arrangement (the maintainer's batch export had four storks in the card's corners and five nightjars in a
  // loose line). Before, from 4 birds: the largest gap between neighbours 0.6 to 2.7 median stickers, the median 0.2 to
  // 2.0; now at most 0.35 and 0.03 to 0.18 (the page's one GAP). The group's box at least 70% of the frame's shorter
  // side from 4 birds (two birds may sit either side of the count, its hole between them).
  for (const arrangement of ['packed', 'oval', 'free'] as const) {
    for (const format of ['story', 'post', 'square', 'desktop'] as const) {
      it(`${arrangement}, ${format}, 1 to 39 birds: one snug group round the count, as large as the frame allows`, () => {
        for (const n of [1, 2, 4, 5, 10, 20, 39]) {
          expect(n).toBeLessThan(SMALL_GROUP)
          const c = { name: true, filter: true, latest: true, count: n }
          const L = cardLayout(format, c)
          const spec = imagePackSpec(format, c, undefined, undefined, arrangement)
          const birds = sample(n)
          const r = packFrame(birds, spec.aspect, { hole: spec.hole, maxTile: spec.maxTile, oval: spec.oval, free: spec.free })
          expect(r.boxes.size).toBe(n)
          expect(clean(birds, r)).toBe(true)
          const fit = fitPack(r as never, L.collage, maxTileSide(L.collage.w, L.maxTile, L.maxSide))
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
          for (const b of r.boxes.values()) {
            const [x, y, w, h] = fitBox(fit, b)
            x0 = Math.min(x0, x); x1 = Math.max(x1, x + w); y0 = Math.min(y0, y); y1 = Math.max(y1, y + h)
            // Inside the collage's area.
            expect(x).toBeGreaterThanOrEqual(L.collage.x - 0.5)
            expect(x + w).toBeLessThanOrEqual(L.collage.x + L.collage.w + 0.5)
            expect(y).toBeGreaterThanOrEqual(L.collage.y - 0.5)
            expect(y + h).toBeLessThanOrEqual(L.collage.y + L.collage.h + 0.5)
          }
          if (n < 4) continue
          const e = evenness(birds, r)
          expect(e.median / e.medianL, `${n} median gap`).toBeLessThan(0.2)
          expect(Math.max(...e.gaps) / e.medianL, `${n} largest gap`).toBeLessThan(0.4)
          expect(Math.min(x1 - x0, y1 - y0) / Math.min(L.collage.w, L.collage.h), `${n} box`).toBeGreaterThan(0.68)
        }
      }, 60_000)
    }
  }

  it('is deterministic: the same list packs to the same boxes', () => {
    const birds = sample(150)
    const a = packFrame(birds, 0.7, { maxTile: 0.3 })
    const b = packFrame([...birds].reverse(), 0.7, { maxTile: 0.3 })
    expect([...b.boxes].sort((x, y) => x[0] - y[0])).toEqual([...a.boxes].sort((x, y) => x[0] - y[0]))
  })

  // The poster of a few thousand birds: the spread adds about a fifth to the pack (about 1.2 s for 2,000 in Node).
  it.skipIf(!!process.env.SKIP_PERF)('3,000 birds pack and spread in under 12 s in Node', () => {
    const t = performance.now()
    const r = packFrame(sample(3000), 0.7, { maxTile: 0.3 })
    expect(r.boxes.size).toBe(3000)
    expect(performance.now() - t).toBeLessThan(12_000)
  }, 60_000)
})

// The dialog's True size switch (the screen's setting): share images and posters pack at true sizes through the same
// packer as the page (relSizes with EXP_TRUE, packBest's true mode), in every arrangement, still clean.
describe('true size in the images', () => {
  beforeAll(() => { if (!POOL.length) POOL = loadPool() })
  const spread = (r: PackResult) => {
    const sides = [...r.boxes.values()].map(([, , w, h]) => Math.max(w, h))
    return Math.max(...sides) / Math.min(...sides)
  }
  for (const arrangement of [{}, { oval: true }, { free: true }] as const) {
    it(`${'oval' in arrangement ? 'Oval' : 'free' in arrangement ? 'Free' : 'Fit'}, 120 species: wider size range than even, no overlaps`, () => {
      const spec = packSpec(cardLayout('story', { name: true, filter: false, latest: true, count: 120 }, cardDims('story')))
      const birds = sample(120)
      const even = packFrame(birds, spec.aspect, { hole: spec.hole, maxTile: spec.maxTile, ...arrangement })
      const tru = packFrame(birds, spec.aspect, { hole: spec.hole, maxTile: spec.maxTile, ...arrangement, mode: 'true' })
      expect(tru.boxes.size).toBe(120)
      expect(spread(tru)).toBeGreaterThan(spread(even) * 1.3)
      expect(clean(birds, tru)).toBe(true)
    }, 60_000)
  }
})
