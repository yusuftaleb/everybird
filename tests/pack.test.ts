import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { EXP, EXP_TRUE, GAP, LAYOUTS, holeRadii } from '../src/lib/layout/constants'
import { MASK, decodeMask, maskCell, type Mask } from '../src/lib/layout/mask'
import { DETACH, MAX_BASE, boxGap, detached, packBest, packFrame, relSizes, type Box, type PackBird, type PackResult } from '../src/lib/layout/pack'
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

  it('clear undoes stamp exactly at word-straddling offsets, leaving neighbours alone', () => {
    const rnd = lcg(11)
    for (const pw of [3, 31, 33, 64, 70]) {
      const ph = 5
      const m = toCellMask(new Uint8Array(pw * ph).map(() => (rnd() < 0.5 ? 1 : 0)), pw, ph)
      const g = new Grid(200, 20, 1)
      const other = toCellMask(new Uint8Array([1, 1]), 2, 1)
      g.stamp(other, 0, 0)
      const before = g.bits.slice()
      for (const gx of [0, 1, 31, 32, 33, 63, 100]) {
        if (gx + pw > 200) continue
        g.stamp(m, gx, 6)
        g.clear(m, gx, 6)
        expect(g.bits).toEqual(before)
      }
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

// On-screen size of the median sticker's long side, in CSS px at the layout's reference container width
// (layout.W: layout units are CSS px there). The renderer maps the stage's W onto the container's width.
function medianPx(r: PackResult, layoutW: number): number {
  const longs = [...r.boxes.values()].map(([, , w, h]) => Math.max(w, h)).sort((a, b) => a - b)
  return (longs[longs.length >> 1] * layoutW) / r.W
}
const centres = (r: PackResult) => {
  const c = new Map<number, [number, number]>()
  for (const [id, [x, y, w, h]] of r.boxes) c.set(id, [x + w / 2, y + h / 2])
  return c
}

// Big lists: computed once per (layout, n) and timed; the floor and cap checks always run, only the timing
// bounds sit in the skippable perf block below.
const BIG = new Map<string, { r: PackResult; ms: number }>()
function big(name: string, n = 5000) {
  if (!POOL.length) POOL = loadPool()
  const key = `${name}|${n}`
  if (!BIG.has(key)) {
    const birds = sample(n)
    const t0 = performance.now()
    const r = packBest(birds, byName(name), 'even')
    BIG.set(key, { r, ms: performance.now() - t0 })
    console.log(`[perf] ${n.toLocaleString('en-US')} birds ${name}: ${BIG.get(key)!.ms.toFixed(0)} ms, base ${r.base.toFixed(2)}, median ${medianPx(r, byName(name).W).toFixed(1)} px, ${r.W}x${r.H}`)
  }
  return BIG.get(key)!
}

// Small lists keep today's layouts exactly: base, stage and every box, in both modes. Fingerprints recorded
// with the packer before the floor/cap rule (main de23fa4's pack.ts) on main's public/data (11,019 masked
// species in the pool); a change here means small lists moved, or the pool did (new masks shift the stride).
const fingerprint = (r: PackResult) => {
  let s = 0
  for (const [id, [x, y, w, h]] of [...r.boxes.entries()].sort((a, b) => a[0] - b[0])) s += ((id % 97) + 1) * (x + 3 * y + 7 * w + 11 * h)
  return `${r.base.toFixed(6)}|${r.W}x${r.H}|${s.toFixed(3)}`
}
const SMALL: [string, number, string, string][] = [
  ['wide', 20, '80.000000|696x432|2092946.430', '73.431516|696x432|2227689.580'],
  ['wide', 100, '47.637875|1120x700|13475522.797', '28.865483|1120x700|13170460.779'],
  ['wide', 200, '31.912958|1120x700|23661048.895', '18.729756|1120x700|23163088.446'],
  ['medium', 20, '80.000000|542x544|2314657.430', '73.379188|542x544|2411123.866'],
  ['medium', 100, '40.227866|700x800|12596451.618', '24.198605|700x800|12598082.268'],
  ['medium', 200, '26.279677|700x800|21824442.667', '15.332686|700x800|21670058.517'],
  ['narrow', 20, '79.853229|350x756|2370624.624', '66.196435|350x756|2387780.103'],
  ['narrow', 100, '28.971684|350x900|10785855.749', '17.220247|350x900|10721015.362'],
  ['narrow', 200, '18.705831|350x900|19882516.763', '10.773973|350x900|19840780.925'],
]

describe('small lists keep their layouts (identical boxes)', () => {
  beforeAll(() => { if (!POOL.length) POOL = loadPool() })
  for (const [name, n, even, tru] of SMALL) {
    it(`${n} birds on ${name}, even and true`, () => {
      const birds = sample(n)
      const r = packBest(birds, byName(name), 'even')
      expect(fingerprint(r)).toBe(even)
      const t = packBest(birds, byName(name), 'true', { targets: centres(r), fixedStage: [r.W, r.H] })
      expect(fingerprint(t)).toBe(tru)
    })
  }
})

// [layout, a list size whose floor is reachable under the cap]
const MID: [string, number][] = [['wide', 723], ['medium', 500], ['narrow', 500]]

describe('big lists: the stage grows taller until the median sticker reaches the floor, up to the cap', () => {
  for (const [name, n] of MID) {
    it(`${n} birds on ${name}: taller than the start, under the cap, median sticker at least the floor`, () => {
      const L = byName(name)
      const { r } = big(name, n)
      expect(r.boxes.size).toBe(n)
      expect(r.W).toBeLessThanOrEqual(L.W)
      expect(r.H).toBeGreaterThan(L.H)
      expect(r.H).toBeLessThanOrEqual(L.maxH)
      expect(medianPx(r, L.W)).toBeGreaterThanOrEqual(L.floor)
    }, 60000)
  }

  // [layout, a list size that cannot meet the floor under the cap, but stays above minBase there]
  const AT_CAP: [string, number][] = [['wide', 1500], ['medium', 1000], ['narrow', 1000]]
  for (const [name, n] of AT_CAP) {
    it(`${n} birds on ${name}: the stage stops at the cap and accepts smaller birds (down to minBase)`, () => {
      const L = byName(name)
      const { r } = big(name, n)
      expect(r.boxes.size).toBe(n)
      expect(r.H).toBeLessThanOrEqual(L.maxH)
      expect(r.H).toBeGreaterThanOrEqual(0.9 * L.maxH) // it grew all the way (less the trim)
      expect(medianPx(r, L.W)).toBeLessThan(L.floor)
      expect(r.base).toBeGreaterThanOrEqual(L.minBase)
    }, 60000)
  }

  for (const name of ['wide', 'medium', 'narrow']) {
    it(`5,000 birds on ${name}: past the cap only to keep base at least minBase, as before`, () => {
      const L = byName(name)
      const { r } = big(name)
      expect(r.boxes.size).toBe(5000)
      expect(r.H).toBeGreaterThan(L.maxH)
      expect(r.base).toBeGreaterThanOrEqual(L.minBase)
    }, 60000)
  }

  it('the count stays centred: the hole is empty on a grown stage', () => {
    const { r } = big('wide', 723)
    const birds = sample(723)
    const [rx, ry] = holeRadii(byName('wide').F)
    let inside = 0
    silhouettePixels(birds, r, (_id, px, py) => {
      const cx = r.W / 2, cy = r.H / 2
      const qx = Math.max(px, Math.min(cx, px + 1)), qy = Math.max(py, Math.min(cy, py + 1))
      if (((qx - cx) / rx) ** 2 + ((qy - cy) / ry) ** 2 <= 1) inside++
    })
    expect(inside).toBe(0)
  }, 60000)

  it('true mode packs in the even stage of a grown collage: same W x H, every bird placed', () => {
    const { r } = big('wide', 723)
    const birds = sample(723)
    const t = packBest(birds, byName('wide'), 'true', { targets: centres(r), fixedStage: [r.W, r.H] })
    expect([t.W, t.H]).toEqual([r.W, r.H])
    expect(t.boxes.size).toBe(723)
    expect(t.base).toBeLessThan(r.base) // true size spreads sizes further, so the base drops
  }, 60000)

  it('filtered states of a grown collage are never taller than the full stage, in both modes', () => {
    const L = byName('wide')
    const birds = sample(723)
    const { r } = big('wide', 723)
    const relE = relSizes(birds, EXP)
    const relT = relSizes(birds, EXP_TRUE)
    const fullTrue = packBest(birds, L, 'true', { targets: centres(r), fixedStage: [r.W, r.H], rel: relT })
    const heavy = birds.reduce((a, b) => (b.mass > a.mass ? b : a))
    for (const sub of [birds.filter((_, i) => i % 2 === 0), birds.filter((_, i) => i % 10 === 0), [heavy]]) {
      const e = packBest(sub, L, 'even', { refBase: r.base, fixedStage: [r.W, r.H], rel: relE, fit: true })
      expect(e.W).toBe(r.W)
      expect(e.H).toBeLessThanOrEqual(r.H)
      // true mode packs in the full (untrimmed) stage, from the even centres moved back into it
      const dy = (r.H - e.H) / 2
      const tg = new Map([...centres(e)].map(([id, [x, y]]) => [id, [x, y + dy] as [number, number]]))
      const t = packBest(sub, L, 'true', { targets: tg, refBase: fullTrue.base, fixedStage: [r.W, r.H], rel: relT, fit: true })
      expect(t.W).toBe(r.W)
      expect(t.H).toBeLessThanOrEqual(r.H)
    }
  }, 60000)
})

// Silhouette ownership raster (one cell per layout unit), for the density checks below.
function owners(birds: PackBird[], r: PackResult) {
  const W = Math.ceil(r.W), H = Math.ceil(r.H)
  const own = new Int32Array(W * H).fill(-1)
  silhouettePixels(birds, r, (id, px, py) => { if (px >= 0 && py >= 0 && px < W && py < H) own[py * W + px] = id })
  return { W, H, own }
}

describe('big lists: even density from the centre to the edge, no lattice', () => {
  for (const name of ['wide', 'narrow']) {
    it(`723 birds on ${name}: small birds keep GAP, the outer birds sit as close as the inner ones`, () => {
      const { r } = big(name, 723)
      const birds = sample(723)
      // 1. No overlaps, and every silhouette keeps at least GAP units (one GAP between small birds, as the
      //    packer promises): grow each by GAP / 2 and nothing clashes.
      const W = Math.ceil(r.W) + 2, H = Math.ceil(r.H) + 2, k = GAP / 2
      const grown = new Int32Array(W * H).fill(-1)
      let clashes = 0
      silhouettePixels(birds, r, (id, px, py) => {
        for (let y = py - k; y <= py + k; y++) for (let x = px - k; x <= px + k; x++) {
          const i = (y + 1) * W + (x + 1)
          if (grown[i] !== -1 && grown[i] !== id) clashes++
          grown[i] = id
        }
      })
      expect(clashes).toBe(0)
      // 2. Coverage in rings of the stage (L-infinity distance from the count, 5 rings; ring 4 is the ragged
      //    edge and the trim margin): the middle-to-outer rings stay full. On the spiral lattice ring 3 held
      //    0.39 of its area on wide and 0.29 on narrow; settled, 0.44 and 0.40.
      const { own } = owners(birds, r)
      const cx = r.W / 2, cy = r.H / 2, cov = [0, 0, 0, 0, 0], tot = [0, 0, 0, 0, 0]
      for (let y = 0; y < Math.ceil(r.H); y++) for (let x = 0; x < Math.ceil(r.W); x++) {
        const d = Math.max(Math.abs(x + 0.5 - cx) / cx, Math.abs(y + 0.5 - cy) / cy)
        const b = Math.min(4, Math.floor(d * 5))
        tot[b]++; if (own[y * Math.ceil(r.W) + x] !== -1) cov[b]++
      }
      const ring = cov.map((c, i) => c / tot[i])
      console.log(`[density] ${name} 723 rings: ${ring.map((v) => v.toFixed(3)).join(' ')}`)
      for (const i of [1, 2, 3]) expect(ring[i]).toBeGreaterThan(0.39)
      // 3. No lattice: almost every bird in the outer half rests against a neighbour (another silhouette within
      //    4 units). On the spiral's coarse steps they floated apart (narrow: 0 of 612 did).
      const Wc = Math.ceil(r.W), Hc = Math.ceil(r.H)
      const near = new Set<number>()
      for (let y = 0; y < Hc; y++) for (let x = 0; x < Wc; x++) {
        const id = own[y * Wc + x]
        if (id === -1 || near.has(id)) continue
        search: for (let yy = Math.max(0, y - 4); yy <= Math.min(Hc - 1, y + 4); yy++) {
          for (let xx = Math.max(0, x - 4); xx <= Math.min(Wc - 1, x + 4); xx++) {
            const o = own[yy * Wc + xx]
            if (o !== -1 && o !== id) { near.add(id); break search }
          }
        }
      }
      let outer = 0, resting = 0
      for (const [id, [x, y, w, h]] of r.boxes) {
        const d = Math.max(Math.abs(x + w / 2 - cx) / cx, Math.abs(y + h / 2 - cy) / cy)
        if (d < 0.5) continue
        outer++
        if (near.has(id)) resting++
      }
      console.log(`[density] ${name} 723: ${resting} of ${outer} outer birds rest against a neighbour`)
      expect(resting / outer).toBeGreaterThan(0.9)
    }, 60000)
  }

  it('a filtered state of a dense list is settled too, inside the full stage', () => {
    const L = byName('wide')
    const { r } = big('wide', 723)
    const birds = sample(723)
    const sub = birds.filter((_, i) => i % 3 === 0)
    const e = packBest(sub, L, 'even', { refBase: r.base, fixedStage: [r.W, r.H], rel: relSizes(birds, EXP), fit: true })
    expect(e.boxes.size).toBe(sub.length)
    for (const [x, y, w, h] of e.boxes.values()) {
      expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0)
      expect(x + w).toBeLessThanOrEqual(e.W + 1e-9); expect(y + h).toBeLessThanOrEqual(e.H + 1e-9)
    }
  }, 60000)
})

describe('packFrame (share images)', () => {
  beforeAll(() => {
    if (!POOL.length) POOL = loadPool()
  })

  for (const [n, aspect] of [[1, 0.7], [12, 1.2], [197, 0.7], [197, 1.19]] as const) {
    it(`${n} birds at aspect ${aspect}: every bird placed, inside the stage, no overlapping silhouettes`, () => {
      const birds = sample(n)
      const r = packFrame(birds, aspect)
      expect(r.boxes.size).toBe(n)
      expect(r.W / r.H).toBeCloseTo(aspect, 1)
      for (const [x, y, w, h] of r.boxes.values()) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(x + w).toBeLessThanOrEqual(r.W + 1e-6)
        expect(y + h).toBeLessThanOrEqual(r.H + 1e-6)
      }
      const owner = new Map<string, number>()
      let clash = false
      silhouettePixels(birds, r, (id, px, py) => {
        const k = `${px},${py}`
        if (owner.has(k) && owner.get(k) !== id) clash = true
        owner.set(k, id)
      })
      expect(clash).toBe(false)
    })
  }

  it('leaves no hole at the centre: the biggest bird sits there', () => {
    const birds = sample(60)
    const r = packFrame(birds, 0.8)
    const rel = relSizes(birds, EXP)
    const big = birds.reduce((a, b) => (rel.get(b.id)! > rel.get(a.id)! ? b : a))
    const [x, y, w, h] = r.boxes.get(big.id)!
    expect(Math.abs(x + w / 2 - r.W / 2)).toBeLessThan(w)
    expect(Math.abs(y + h / 2 - r.H / 2)).toBeLessThan(h)
  })

  it('fills the frame: the packed birds span most of its width or height', () => {
    const r = packFrame(sample(197), 0.7)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const [x, y, w, h] of r.boxes.values()) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h) }
    expect(Math.max((x1 - x0) / r.W, (y1 - y0) / r.H)).toBeGreaterThan(0.85)
  })
})

describe('packFrame with the count in the middle (share images)', () => {
  beforeAll(() => {
    if (!POOL.length) POOL = loadPool()
  })
  // The hole and the largest tile as fractions of the frame width, as the share image asks for them.
  const spec = { hole: [0.21, 0.15] as [number, number], maxTile: 0.24 }

  for (const [n, aspect] of [[1, 0.84], [12, 0.84], [197, 0.84], [197, 0.93], [1500, 0.84]] as const) {
    it(`${n} birds at aspect ${aspect}: no silhouette inside the hole, none overlapping, no tile past maxTile`, () => {
      const birds = sample(n)
      const r = packFrame(birds, aspect, spec)
      expect(r.boxes.size).toBe(n)
      expect(r.W / r.H).toBeCloseTo(aspect, 1)
      const [rx, ry] = [spec.hole[0] * r.W, spec.hole[1] * r.W]
      let inHole = 0, clash = false
      const owner = new Map<string, number>()
      silhouettePixels(birds, r, (id, px, py) => {
        const dx = (px + 0.5 - r.W / 2) / rx, dy = (py + 0.5 - r.H / 2) / ry
        if (dx * dx + dy * dy < 0.9) inHole++ // the packer's grid rounds the ellipse to whole cells
        const k = `${px},${py}`
        if (owner.has(k) && owner.get(k) !== id) clash = true
        owner.set(k, id)
      })
      expect(inHole).toBe(0)
      expect(clash).toBe(false)
      for (const [x, y, w, h] of r.boxes.values()) {
        expect(Math.max(w, h)).toBeLessThanOrEqual(spec.maxTile * r.W + 1e-6)
        expect(x).toBeGreaterThanOrEqual(0)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(x + w).toBeLessThanOrEqual(r.W + 1e-6)
        expect(y + h).toBeLessThanOrEqual(r.H + 1e-6)
      }
    }, 30000)
  }

  it('a big list still fills the frame around the hole', () => {
    const r = packFrame(sample(197), 0.84, spec)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const [x, y, w, h] of r.boxes.values()) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h) }
    expect(Math.max((x1 - x0) / r.W, (y1 - y0) / r.H)).toBeGreaterThan(0.85)
  })

  it('packBest never goes past maxBase', () => {
    const birds = sample(5)
    const r = packBest(birds, { W: 400, H: 400, stretch: 1, F: 0 }, 'even', { fixedStage: [400, 400], hole: [0, 0], maxBase: 20 })
    expect(r.base).toBeLessThanOrEqual(20)
  })
})

// No stragglers (Yusuf, 2026-11-06: small birds sat alone past the cluster's edge). Precisely: with d = DETACH (0.5) x
// the median sticker long side, (1) every box is within d of another box (rectangle to rectangle), and (2) linking
// boxes within d of each other makes one group, so no little cluster sits apart either. Both modes, all layouts.
describe('compact outline: no box detached from the collage', () => {
  beforeAll(() => { if (!POOL.length) POOL = loadPool() })
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]
  for (const n of [50, 200, 723, 1500, 3000]) {
    for (const L of LAYOUTS) {
      it(`${n} birds on ${L.name}, even and true size`, () => {
        const birds = sample(n)
        const even = packBest(birds, L, 'even')
        const centres = new Map([...even.boxes].map(([id, [x, y, w, h]]) => [id, [x + w / 2, y + h / 2] as [number, number]]))
        const tr = packBest(birds, L, 'true', { targets: centres, fixedStage: [even.W, even.H] })
        for (const r of [even, tr]) {
          const bs = [...r.boxes.values()]
          const d = DETACH * median(bs.map((b) => Math.max(b[2], b[3])))
          let far = 0
          bs.forEach((a, i) => { if (!bs.some((b, j) => j !== i && boxGap(a, b) <= d)) far++ })
          expect(far, 'boxes with no neighbour within half a median sticker').toBe(0)
          expect(detached(r.boxes), 'boxes outside the main group').toEqual([])
        }
      }, 60000)
    }
  }
})

// Timing bounds. Generous but meaningful; set SKIP_PERF=1 to skip them (e.g. on slow CI).
describe.skipIf(!!process.env.SKIP_PERF)('packing performance', () => {
  beforeAll(() => {
    if (!POOL.length) POOL = loadPool()
  })

  for (const name of ['wide', 'medium', 'narrow']) {
    it(`1,000 birds pack in under 1,500 ms in Node on ${name}`, () => {
      const birds = sample(1000)
      const t0 = performance.now()
      const r = packBest(birds, byName(name), 'even')
      const ms = performance.now() - t0
      console.log(`[perf] 1,000 birds ${name}: ${ms.toFixed(0)} ms, base ${r.base.toFixed(2)}, median ${medianPx(r, byName(name).W).toFixed(1)} px, ${r.W}x${r.H}`)
      expect(r.boxes.size).toBe(1000)
      expect(ms).toBeLessThan(1500)
    })
  }

  for (const name of ['wide', 'medium', 'narrow']) {
    it(`5,000 birds pack in under 12 s on ${name}`, () => {
      expect(big(name).ms).toBeLessThan(12000)
    }, 60000)
  }
})
