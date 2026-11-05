import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { EXP, GAP, LAYOUTS, holeRadii } from '../src/lib/layout/constants'
import { MASK, decodeMask, maskCell, type Mask } from '../src/lib/layout/mask'
import { MAX_BASE, packBest, relSizes, type Box, type PackBird, type PackResult } from '../src/lib/layout/pack'
import { Grid, SPIRAL_T, spiral, toCellMask } from '../src/lib/layout/grid'

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

  it('silhouettes dilated by GAP units never clash (catches a one-cell placement error)', () => {
    for (const r of [wide, packBest(birds, byName('medium'), 'even')]) {
      // Set grid cells of two birds are ≥ 3 cells apart (both dilated by 1 cell), so their silhouettes are
      // ≥ 5 units apart; dilating each by GAP = 2 units still can't clash, but a one-cell slip would.
      const W = Math.ceil(r.W) + 4, H = Math.ceil(r.H) + 4
      const owner = new Int32Array(W * H).fill(-1)
      let clashes = 0
      silhouettePixels(birds, r, (id, px, py) => {
        for (let y = py - GAP; y <= py + GAP; y++) for (let x = px - GAP; x <= px + GAP; x++) {
          const i = (y + GAP) * W + (x + GAP)
          if (owner[i] !== -1 && owner[i] !== id) clashes++
          owner[i] = id
        }
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

  it('filtered single heavy bird keeps its full-collage size (rel over the full list)', () => {
    const rel = relSizes(birds, EXP)
    const heavy = birds.reduce((a, b) => (b.mass > a.mass ? b : a))
    const r = packBest([heavy], byName('wide'), 'even', { refBase: wide.base, fixedStage: [wide.W, wide.H], rel })
    const long = (b: Box) => Math.max(b[2], b[3])
    const k = long(r.boxes.get(heavy.id)!) / long(wide.boxes.get(heavy.id)!)
    expect(k).toBeGreaterThanOrEqual(0.7 - 1e-9)
    expect(k).toBeLessThanOrEqual(1.5 + 1e-9)
  })

  it('fit: a filtered stage is trimmed symmetric about the count, width and x unchanged', () => {
    const rel = relSizes(birds, EXP)
    const few = birds.filter((_, i) => i % 50 === 0) // 6 birds spread over the mass range
    const opts = { refBase: wide.base, fixedStage: [wide.W, wide.H] as [number, number], rel }
    const r0 = packBest(few, byName('wide'), 'even', opts)
    const r1 = packBest(few, byName('wide'), 'even', { ...opts, fit: true })
    expect([r0.W, r0.H]).toEqual([wide.W, wide.H]) // without fit: the full stage, as before
    expect(r1.W).toBe(wide.W)
    expect(r1.H).toBeLessThan(wide.H)
    expect(r1.base).toBe(r0.base)
    const off = (r0.H - r1.H) / 2
    expect(Number.isInteger(off)).toBe(true)
    let ext = holeRadii(byName('wide').F)[1] + 24
    for (const [id, [x, y, w, h]] of r1.boxes) {
      const [x0, y0, w0, h0] = r0.boxes.get(id)!
      expect([x, y + off, w, h]).toEqual([x0, y0, w0, h0])
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y + h).toBeLessThanOrEqual(r1.H + 1e-9)
      ext = Math.max(ext, r1.H / 2 - y, y + h - r1.H / 2)
    }
    // tight: half height = extent about the centre + 10 (rounded out to whole units)
    expect(r1.H / 2 - (ext + 10)).toBeGreaterThanOrEqual(-1e-9)
    expect(r1.H / 2 - (ext + 10)).toBeLessThan(1)
    // the count hole (at the new centre) stays empty
    const [rx, ry] = holeRadii(byName('wide').F)
    let inside = 0
    silhouettePixels(few, r1, (_id, px, py) => {
      const cx = r1.W / 2, cy = r1.H / 2
      const qx = Math.max(px, Math.min(cx, px + 1)), qy = Math.max(py, Math.min(cy, py + 1))
      if (((qx - cx) / rx) ** 2 + ((qy - cy) / ry) ** 2 <= 1) inside++
    })
    expect(inside).toBe(0)
  })

  it('fit never makes a stage taller than the one packed in', () => {
    const r = packBest(birds, byName('narrow'), 'even')
    const f = packBest(birds, byName('narrow'), 'even', { refBase: r.base, fixedStage: [r.W, r.H], fit: true })
    expect(f.H).toBeLessThanOrEqual(r.H)
    expect(f.W).toBe(r.W)
  })

  it('20 birds (the smallest list) pack and trim symmetrically about the count', () => {
    const r = packBest(sample(20), byName('narrow'), 'even')
    expect(r.boxes.size).toBe(20)
    expect(r.W).toBeLessThanOrEqual(350)
    expect(r.H).toBeLessThanOrEqual(900)
    expect(MASK).toBe(24)
    // the full collage never goes past the reference's ceiling, even when the estimate would
    for (const l of LAYOUTS) expect(packBest(sample(20), l, 'even').base).toBeLessThanOrEqual(MAX_BASE)
  })
})

// Deterministic LCG for the grid tests.
function lcg(seed: number) {
  let x = seed >>> 0
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32)
}

describe('occupancy grid', () => {
  it('collides/stamp match a brute-force boolean grid at word boundaries and wide masks', () => {
    const rnd = lcg(7)
    const GW = 230, GH = 40 // grid of 230 x 40 cells (cell = 1, so layout units = cells)
    for (const pw of [1, 5, 31, 32, 33, 40, 64, 70, 97]) {
      const ph = 1 + Math.floor(rnd() * 9)
      const cells = new Uint8Array(pw * ph).map(() => (rnd() < 0.35 ? 1 : 0))
      cells[0] = 1; cells[pw * ph - 1] = 1 // touch both edges
      const m = toCellMask(cells, pw, ph)
      const g = new Grid(GW, GH, 1)
      const ref = new Uint8Array(GW * GH)
      // scatter some occupied cells, written through stamp of 1x1 masks so both stay in sync
      const dot = toCellMask(new Uint8Array([1]), 1, 1)
      for (let k = 0; k < 600; k++) {
        const x = Math.floor(rnd() * GW), y = Math.floor(rnd() * GH)
        g.stamp(dot, x, y); ref[y * GW + x] = 1
      }
      const brute = (gx: number, gy: number) => {
        for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) if (cells[y * pw + x] && ref[(gy + y) * GW + gx + x]) return true
        return false
      }
      const xs = [0, 1, 30, 31, 32, 33, 63, 64, 65, 95, 96, 127, 128, GW - pw].filter((x) => x >= 0 && x + pw <= GW)
      for (const gx of xs) {
        for (const gy of [0, 3, GH - ph]) {
          expect(g.collides(m, gx, gy), `pw ${pw} at ${gx},${gy}`).toBe(brute(gx, gy))
        }
      }
      // stamp at a word-straddling offset, then the grid equals the brute-force union cell for cell
      const gx = Math.min(GW - pw, 31), gy = 2
      g.stamp(m, gx, gy)
      for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) if (cells[y * pw + x]) ref[(gy + y) * GW + gx + x] = 1
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) expect(g.get(x, y)).toBe(ref[y * GW + x] === 1)
    }
  })

  it('spiral: the reference table (t < 1400) is a prefix of any extended one', () => {
    const base = spiral(SPIRAL_T)
    const n0 = base.n, d0 = base.dx.slice(0, n0)
    const big = spiral(3 * SPIRAL_T)
    expect(big.n).toBeGreaterThan(n0)
    expect(spiral(SPIRAL_T).n).toBe(n0)
    expect(big.dx.slice(0, n0)).toEqual(d0)
    expect(big.rad[big.n - 1]).toBeLessThan(2.2 * 3 * SPIRAL_T)
  })
})

// 5,000-bird lists: computed once per layout and timed; the minBase checks always run, only the timing
// bounds sit in the skippable perf block below.
const BIG = new Map<string, { r: PackResult; ms: number }>()
function big(name: string) {
  if (!POOL.length) POOL = loadPool()
  if (!BIG.has(name)) {
    const birds = sample(5000)
    const t0 = performance.now()
    const r = packBest(birds, byName(name), 'even')
    BIG.set(name, { r, ms: performance.now() - t0 })
    console.log(`[perf] 5,000 birds ${name}: ${BIG.get(name)!.ms.toFixed(0)} ms, base ${r.base.toFixed(2)}, ${r.W}x${r.H}`)
  }
  return BIG.get(name)!
}

describe('large lists grow the stage instead of shrinking below minBase', () => {
  for (const name of ['wide', 'medium', 'narrow']) {
    it(`5,000 birds on ${name}`, () => {
      const { r } = big(name)
      expect(r.boxes.size).toBe(5000)
      expect(r.base).toBeGreaterThanOrEqual(byName(name).minBase)
      expect(r.H).toBeGreaterThan(byName(name).H)
    }, 60000)
  }
})

// Timing bounds. Generous but meaningful; set SKIP_PERF=1 to skip them (e.g. on slow CI).
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

  for (const name of ['wide', 'medium', 'narrow']) {
    it(`5,000 birds pack in under 12 s on ${name}`, () => {
      expect(big(name).ms).toBeLessThan(12000)
    }, 60000)
  }
})
