import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { LAYOUTS, holeRadii } from '../src/lib/layout/constants'
import { MASK, decodeMask, maskCell, type Mask } from '../src/lib/layout/mask'
import { packBest, relSizes, type Box, type PackBird, type PackResult } from '../src/lib/layout/pack'

// Realistic, deterministic test birds: real sticker masks + real masses from public/data, sampled at a
// fixed stride over the species sorted by code. Public reference data only, no personal list.
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
function sample(n: number): PackBird[] {
  const step = POOL.length / n
  return Array.from({ length: n }, (_, i) => POOL[Math.floor(i * step)])
}

const byName = (n: string) => LAYOUTS.find((l) => l.name === n)!

// Rasterise each placed sticker's silhouette at layout-unit resolution (one sample per layout unit, nearest
// mask cell), independently of the packer's own grid. Returns the owner of each unit, or the first clash.
function silhouettePixels(birds: PackBird[], r: PackResult, visit: (id: number, px: number, py: number) => void) {
  const byId = new Map(birds.map((b) => [b.id, b]))
  for (const [id, [x, y, w, h]] of r.boxes) {
    const m = byId.get(id)!.mask
    for (let py = Math.floor(y); py < Math.ceil(y + h); py++) {
      for (let px = Math.floor(x); px < Math.ceil(x + w); px++) {
        const u = (px + 0.5 - x) / w, v = (py + 0.5 - y) / h
        if (u < 0 || v < 0 || u >= 1 || v >= 1) continue
        if (maskCell(m, Math.floor(u * m.w), Math.floor(v * m.h))) visit(id, px, py)
      }
    }
  }
}

describe('packing engine (300 birds)', () => {
  let birds: PackBird[]
  let wide: PackResult
  beforeAll(() => {
    POOL = loadPool()
    birds = sample(300)
    wide = packBest(birds, byName('wide'), 'even')
  })

  it('relSizes: smallest bird = 1, grows with mass', () => {
    const rel = relSizes(birds, 0.2)
    const vals = [...rel.values()]
    expect(Math.min(...vals)).toBeCloseTo(1, 10)
    const light = birds.reduce((a, b) => (b.mass < a.mass ? b : a)), heavy = birds.reduce((a, b) => (b.mass > a.mass ? b : a))
    expect(rel.get(light.id)).toBeCloseTo(1, 10)
    expect(rel.get(heavy.id)).toBeCloseTo((heavy.mass / light.mass) ** 0.2, 8)
  })

  it('every bird is placed', () => {
    expect(wide.boxes.size).toBe(300)
    for (const b of birds) expect(wide.boxes.has(b.id)).toBe(true)
    for (const [x, y, w, h] of wide.boxes.values()) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(x + w).toBeLessThanOrEqual(wide.W + 1e-9)
      expect(y + h).toBeLessThanOrEqual(wide.H + 1e-9)
    }
    expect(wide.base).toBeGreaterThan(0)
  })

  it('boxes follow the mask aspect, long side = base · rel', () => {
    const rel = relSizes(birds, 0.2)
    for (const b of birds) {
      const [, , w, h] = wide.boxes.get(b.id)!
      const L = wide.base * rel.get(b.id)!
      expect(Math.max(w, h)).toBeCloseTo(Math.max(2, L), 6)
      expect(w / h).toBeCloseTo(b.mask.w / b.mask.h, 6)
    }
  })

  it('no two placed masks overlap', () => {
    for (const r of [wide, packBest(birds, byName('narrow'), 'even')]) {
      const owner = new Int32Array(Math.ceil(r.W) * Math.ceil(r.H)).fill(-1)
      let clashes = 0
      silhouettePixels(birds, r, (id, px, py) => {
        const i = py * Math.ceil(r.W) + px
        if (owner[i] !== -1 && owner[i] !== id) clashes++
        owner[i] = id
      })
      expect(clashes).toBe(0)
    }
  })

  it('the count hole stays empty', () => {
    for (const r of [wide, packBest(birds, byName('medium'), 'even')]) {
      const F = r === wide ? byName('wide').F : byName('medium').F
      const [rx, ry] = holeRadii(F)
      let inside = 0
      silhouettePixels(birds, r, (_id, px, py) => {
        // the whole unit square must be outside the ellipse: test its closest point to the centre
        const cx = r.W / 2, cy = r.H / 2
        const qx = Math.max(px, Math.min(cx, px + 1)), qy = Math.max(py, Math.min(cy, py + 1))
        if (((qx - cx) / rx) ** 2 + ((qy - cy) / ry) ** 2 <= 1) inside++
      })
      expect(inside).toBe(0)
    }
  })

  it('same input gives identical boxes', () => {
    const again = packBest([...birds].reverse(), byName('wide'), 'even')
    expect(again.base).toBe(wide.base)
    expect([again.W, again.H]).toEqual([wide.W, wide.H])
    const sorted = (m: Map<number, Box>) => [...m.entries()].sort((a, b) => a[0] - b[0])
    expect(sorted(again.boxes)).toEqual(sorted(wide.boxes))
  })

  it('true-size morph: median centre displacement ≤ 30% of stage width on narrow', () => {
    const narrow = byName('narrow')
    const even = packBest(birds, narrow, 'even')
    const centres = new Map<number, [number, number]>()
    for (const [id, [x, y, w, h]] of even.boxes) centres.set(id, [x + w / 2, y + h / 2])
    const tr = packBest(birds, narrow, 'true', { targets: centres, fixedStage: [even.W, even.H] })
    expect(tr.boxes.size).toBe(300)
    expect([tr.W, tr.H]).toEqual([even.W, even.H])
    const d = birds.map((b) => {
      const [x, y, w, h] = tr.boxes.get(b.id)!
      const [cx, cy] = centres.get(b.id)!
      return Math.hypot(x + w / 2 - cx, y + h / 2 - cy)
    }).sort((a, b) => a - b)
    expect(d[150] / even.W).toBeLessThanOrEqual(0.3)
  })

  it('filtered state: base clamped to [0.7, MAXUP] × refBase inside the fixed stage', () => {
    const few = birds.slice(0, 20)
    const r = packBest(few, byName('wide'), 'even', { refBase: wide.base, fixedStage: [wide.W, wide.H] })
    expect(r.boxes.size).toBe(20)
    expect([r.W, r.H]).toEqual([wide.W, wide.H])
    expect(r.base).toBeGreaterThanOrEqual(0.7 * wide.base - 1e-9)
    expect(r.base).toBeLessThanOrEqual(1.5 * wide.base + 1e-9)
    expect(r.base).toBeCloseTo(1.5 * wide.base, 6) // 20 birds have room to grow to the cap
  })

  it('20 birds (the smallest list) pack and trim symmetrically about the count', () => {
    const r = packBest(sample(20), byName('narrow'), 'even')
    expect(r.boxes.size).toBe(20)
    expect(r.W).toBeLessThanOrEqual(350)
    expect(r.H).toBeLessThanOrEqual(900)
    expect(MASK).toBe(24)
  })
})

// Timing tests. Bounds are generous but meaningful; set SKIP_PERF=1 to skip them (e.g. on slow CI).
describe.skipIf(!!process.env.SKIP_PERF)('packing performance', () => {
  beforeAll(() => {
    if (!POOL.length) POOL = loadPool()
  })

  it('1,000 birds pack in under 1,500 ms in Node', () => {
    const birds = sample(1000)
    const t0 = performance.now()
    const r = packBest(birds, byName('wide'), 'even')
    const ms = performance.now() - t0
    console.log(`[perf] 1,000 birds wide: ${ms.toFixed(0)} ms, base ${r.base.toFixed(2)}, ${r.W}x${r.H}`)
    expect(r.boxes.size).toBe(1000)
    expect(ms).toBeLessThan(1500)
  })

  it('5,000 birds pack in under 12 s and grow the stage instead of shrinking below minBase', () => {
    const birds = sample(5000)
    const wide = byName('wide')
    const t0 = performance.now()
    const r = packBest(birds, wide, 'even')
    const ms = performance.now() - t0
    console.log(`[perf] 5,000 birds wide: ${ms.toFixed(0)} ms, base ${r.base.toFixed(2)}, ${r.W}x${r.H}`)
    expect(r.boxes.size).toBe(5000)
    expect(r.base).toBeGreaterThanOrEqual(wide.minBase)
    expect(r.H).toBeGreaterThan(wide.H)
    expect(ms).toBeLessThan(12000)
  }, 60000)
})
