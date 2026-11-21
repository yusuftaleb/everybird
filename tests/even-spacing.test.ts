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
import { FRAME_DENSE_FROM, packFrame, type PackBird, type PackResult } from '../src/lib/layout/pack'
import { cardDims, cardLayout, packSpec, type CardFormat } from '../src/lib/share/image'
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
    ['print', 600, 'medium'], ['print', 197, 'title'], ['printLandscape', 300, 'medium'], ['story', 12, 'medium'],
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

  // Round 6 (Yusuf, on a 1,092-species story: "the birds look tiny"): from FRAME_DENSE_FROM birds Fit packs a frame as the
  // page packs a big collage, one GAP between birds, so the same frame holds bigger stickers; Free keeps the loose pack.
  for (const format of ['story', 'post', 'square', 'desktop', 'wide'] as const) {
    it(`Fit, ${format}, 1,092 species: packed dense, the stickers at least 5% bigger than Free's in the same frame`, () => {
      const spec = packSpec(cardLayout(format, { name: true, filter: false, latest: true, count: 1092 }, cardDims(format)))
      const birds = sample(1092)
      const fit = packFrame(birds, spec.aspect, { hole: spec.hole, maxTile: spec.maxTile })
      const free = packFrame(birds, spec.aspect, { hole: spec.hole, maxTile: spec.maxTile, free: true })
      expect([fit.W, fit.H]).toEqual([free.W, free.H])
      expect(fit.base / free.base).toBeGreaterThan(1.05)
      expect(clean(birds, fit)).toBe(true)
    }, 60_000)
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
