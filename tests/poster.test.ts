import { inflateSync } from 'node:zlib'
import sharp from 'sharp'
import { en } from '@/i18n/messages/en'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareCard, tileInRange, type ImagePack, type PreparedCard } from '@/lib/share/image'
import { IOS_CANVAS_AREA, PRINT_PT, PRINT_PX, printScale, stripRanges, type PrintSize } from '@/lib/share/print'
import { PosterEncoder } from '@/lib/share/poster-encoder'
import { makePoster, posterRows, workerEncoder, type EncoderPort, type PosterDeps, type PosterOpts, type WorkerLike } from '@/lib/share/poster'
import type { PrintStickers } from '@/lib/share/print-stickers'
import type { ListEntry } from '@/lib/list/model'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'

// Synthetic birds only: ten stacked down the collage, so strips see different stickers.
const CODES = Array.from({ length: 10 }, (_, i) => `synbird${i}`)
const row = (code: string, to: number) => ({ code, com: code, sci: code, ord: 'Struthioniformes', fam: 'Struthionidae', famCom: 'Ostriches', to, g: 100000, gSrc: 'family', st: true, ar: 1, q: true }) as SpeciesRow
const species = buildSpeciesIndex(CODES.map((c, i) => row(c, i + 1)))
// synbird0 is the latest lifer (the only 2024 date).
const entries: ListEntry[] = CODES.map((code, i) => ({ code, date: i === 0 ? '2024-05' : '2020-05', place: { country: 'CA' }, heard: false, dead: false, media: false, sources: ['ebird'] }))
// synbird0 small and at the very top (so its tile uses the 384 file, as the lifer's does at A1), the rest big and
// stacked down the frame, away from the centre's count.
const pack: ImagePack = {
  W: 1000, H: 1000,
  boxes: new Map(CODES.map((c, i) => [c, i === 0 ? [470, 0, 40, 40] : [i % 2 ? 100 : 700, (i - 1) * 105, 200, 100]])),
}
const NOW = new Date(2026, 10, 15)
const opts = (size: PrintSize, extra: Partial<PosterOpts> = {}): PosterOpts => ({ size, theme: 'light', entries, species, pack, now: NOW, strings: en.ui, ...extra })
// Many birds: a dense band of 48 small ones at the top (more than 12 gets queue at once) and 24 spread down the frame.
const MANY = Array.from({ length: 72 }, (_, i) => `synmany${i}`)
const manySpecies = buildSpeciesIndex(MANY.map((c, i) => row(c, i + 1)))
const manyEntries: ListEntry[] = MANY.map((code, i) => ({ code, date: i === 0 ? '2024-05' : '2020-05', place: { country: 'CA' }, heard: false, dead: false, media: false, sources: ['ebird'] }))
const manyPack: ImagePack = {
  W: 1000, H: 1000,
  boxes: new Map(MANY.map((c, i) => [c, i < 48
    ? [20 + (i % 12) * 80, Math.floor(i / 12) * 30, 60, 25]
    : [100 + ((i - 48) % 4) * 220, 200 + Math.floor((i - 48) / 4) * 130, 120, 60]])),
}
const manyOpts = (size: PrintSize, extra: Partial<PosterOpts> = {}): PosterOpts =>
  ({ size, theme: 'light', entries: manyEntries, species: manySpecies, pack: manyPack, now: NOW, strings: en.ui, ...extra })
const manyCard = (size: PrintSize) =>
  prepareCard({ format: 'print', theme: 'light', printSize: size, entries: manyEntries, species: manySpecies, pack: manyPack, now: NOW, strings: en.ui }, printScale(size))
const card = (size: PrintSize) => prepareCard({ format: 'print', theme: 'light', printSize: size, entries, species, pack, now: NOW, strings: en.ui }, printScale(size))

class FakePath2D { constructor(public d: string) {} }
beforeEach(() => { vi.stubGlobal('Path2D', FakePath2D) })
afterEach(() => { vi.unstubAllGlobals() })

type Bitmap = ImageBitmap & { url: string; closed: boolean }

/** A recording 2D context: setTransform and drawImage are kept, everything else is a no-op. */
function fakeCtx(onDraw?: (b: Bitmap) => void) {
  const canvas = { width: 0, height: 0 }
  const transforms: number[][] = []
  const target: Record<string, unknown> = {
    canvas, letterSpacing: '0px',
    measureText: (t: string) => ({ width: t.length * 10, actualBoundingBoxAscent: 10 }),
    setTransform: (...a: number[]) => { transforms.push(a) },
    drawImage: (img: Bitmap) => {
      if (img.closed) throw new Error(`drew a closed bitmap: ${img.url}`)
      onDraw?.(img)
    },
  }
  const ctx = new Proxy(target, {
    get: (t, p: string) => (p in t ? t[p] : () => {}),
    set: (t, p: string, v) => { t[p] = v; return true },
  }) as unknown as CanvasRenderingContext2D
  /** The y of the last strip transform (a ≠ 1): -f. */
  const stripY = () => { const t = transforms.filter((m) => m[0] !== 1).at(-1)!; return -t[5] }
  return { ctx, canvas, transforms, stripY }
}

/** Stickers that enforce the contract: a release with a get pending, or a second get of a held URL, throws. */
function fakeStickers() {
  const pending = new Set<string>(), held = new Map<string, Bitmap>()
  const gets: string[] = [], releases: string[] = []
  let maxInFlight = 0
  const stickers = {
    async get({ url }: { url: string }, signal?: AbortSignal): Promise<ImageBitmap | null> {
      if (held.has(url) || pending.has(url)) throw new Error(`fetched twice: ${url}`)
      gets.push(url)
      pending.add(url)
      maxInFlight = Math.max(maxInFlight, pending.size)
      await new Promise((r) => setTimeout(r, 0))
      pending.delete(url)
      if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      const b = { url, closed: false, width: 1, height: 1, close() { this.closed = true } } as Bitmap
      held.set(url, b)
      return b
    },
    release(url: string) {
      if (pending.has(url)) throw new Error(`released with a get pending: ${url}`)
      held.get(url)?.close()
      held.delete(url)
      releases.push(url)
    },
    stats: () => ({ soft: 1, missing: 2 }),
    dispose: vi.fn<() => void>(),
  } satisfies PrintStickers
  return { stickers, gets, releases, held, pending, maxInFlight: () => maxInFlight }
}

function fakeEncoder() {
  const rows: number[] = []
  const enc = {
    begin: vi.fn(), dispose: vi.fn(),
    strip: vi.fn(async (rgba: Uint8ClampedArray, n: number) => { rows.push(n) }),
    end: vi.fn(async () => 1234),
    file: vi.fn(async (kind: 'png' | 'pdf') => new Blob([kind], { type: kind === 'png' ? 'image/png' : 'application/pdf' })),
  } satisfies EncoderPort
  return { enc, rows }
}

/** A print worker that acknowledges each strip a tick later (or never, with `took: false`). */
function fakePrintWorker({ took = true, failOnStrip = 0 } = {}) {
  let strips = 0
  const w = {
    onmessage: null as WorkerLike['onmessage'], onerror: null as WorkerLike['onerror'],
    terminate: vi.fn(),
    postMessage(msg: { type: string }) {
      const reply = (data: unknown) => setTimeout(() => w.onmessage?.({ data } as MessageEvent))
      if (msg.type === 'strip') {
        strips++
        if (failOnStrip && strips === failOnStrip) reply({ type: 'error', message: 'deflate failed' })
        else if (took) reply({ type: 'took', rows: 1 })
      }
      if (msg.type === 'end') reply({ type: 'encoded', bytes: 1 })
    },
  }
  return { w, strips: () => strips }
}

function setup(extra: Partial<PosterDeps> = {}) {
  const f = fakeCtx(), s = fakeStickers(), e = fakeEncoder()
  const stripCalls: [number, number][] = []
  const deps: Partial<PosterDeps> = {
    strip(w, r) { stripCalls.push([w, r]); f.canvas.width = w; f.canvas.height = r; return { ctx: f.ctx, read: (n) => new Uint8ClampedArray(w * n * 4) } },
    encoder: () => e.enc, stickers: s.stickers, frame: async () => {}, ...extra,
  }
  return { f, s, e, stripCalls, deps }
}

/** For each URL, the first and last strip index whose design range tileInRange reaches. */
function spans(c: PreparedCard, size: PrintSize, rows?: number) {
  const [w, h] = PRINT_PX[size], k = printScale(size)
  const ranges = stripRanges(w, h, posterRows(w, k, rows)).map(({ y, rows: r }) => ({ y0: y / k, y1: (y + r) / k }))
  const out = new Map<string, { first: number; last: number }>()
  for (const t of [...c.tiles, ...(c.lifer ? [c.lifer] : [])]) ranges.forEach((r, i) => {
    if (!t.url || !tileInRange(t, r)) return
    const s = out.get(t.url)
    out.set(t.url, s ? { first: Math.min(s.first, i), last: Math.max(s.last, i) } : { first: i, last: i })
  })
  return { out, ranges }
}

describe('makePoster', () => {
  it('strip rows per size: A1 298 (17 strips), A2–A4, and US sizes under IOS_CANVAS_AREA', () => {
    const got = (['A1', 'A2', 'A3', 'A4', 'US24x36', 'US18x24', 'US12x18'] as const).map((size) => {
      const [w, h] = PRINT_PX[size], rows = posterRows(w, printScale(size))
      expect(w * rows).toBeLessThanOrEqual(IOS_CANVAS_AREA)
      return [size, rows, stripRanges(w, h, rows).length]
    })
    expect(got).toEqual([
      ['A1', 298, 17], ['A2', 276, 13], ['A3', 195, 13], ['A4', 138, 13],
      ['US24x36', 291, 19], ['US18x24', 300, 12], ['US12x18', 200, 14],
    ])
    expect(3600 * 5400).toBeGreaterThan(IOS_CANVAS_AREA)
  })

  it('A1: one strip canvas of 3508 × 298, rows sent in order summing to 4967, progress 1..18 of 18', async () => {
    const { deps, stripCalls, e, f } = setup()
    const progress: [number, number][] = []
    const endedAt: number[] = []
    const poster = await makePoster(opts('A1'), (d, n) => { progress.push([d, n]); endedAt.push(e.enc.end.mock.calls.length) }, deps)
    expect(stripCalls).toEqual([[3508, 298]])
    expect(e.enc.begin).toHaveBeenCalledWith(3508, 4967)
    expect(e.rows).toEqual(stripRanges(3508, 4967).map((s) => s.rows))
    expect(e.rows.reduce((a, b) => a + b, 0)).toBe(4967)
    expect(progress).toEqual(Array.from({ length: 18 }, (_, i) => [i + 1, 18]))
    // The last step comes only once the encoder has finished.
    expect(endedAt).toEqual([...Array(17).fill(0), 1])
    expect(e.rows).toHaveLength(17)
    expect([poster.size, poster.bytes, poster.soft, poster.missing]).toEqual(['A1', 1234, 1, 2])
    expect([f.canvas.width, f.canvas.height]).toEqual([1, 1]) // shrunk once done
  })

  it('paints the strips on the theme\'s paper: light #f6f4ef, dark #1e1e24', async () => {
    for (const [theme, paper] of [['light', '#f6f4ef'], ['dark', '#1e1e24']] as const) {
      const { deps, f } = setup()
      const fills: unknown[] = []
      const ctx = new Proxy(f.ctx, {
        get: (t, p) => (p === 'fillRect' ? () => { fills.push((t as unknown as Record<string, unknown>).fillStyle) } : Reflect.get(t, p)),
      })
      await makePoster(opts('A4', { theme }), () => {}, { ...deps, strip: (w) => ({ ctx, read: (n) => new Uint8ClampedArray(w * n * 4) }) })
      expect(fills[0]).toBe(paper)
    }
  })

  it('every sticker fetched is released by the end; none is held past the strip after its last', async () => {
    const c = await card('A1')
    const { out } = spans(c, 'A1')
    expect(out.size).toBeGreaterThan(5)
    expect(new Set(Array.from(out.values(), (s) => s.last)).size).toBeGreaterThan(3) // releases spread over strips
    const s = fakeStickers()
    const releasedAt = new Map<string, number>()
    let done = 0
    const release = s.stickers.release
    s.stickers.release = (url) => { releasedAt.set(url, done); release(url) }
    const { deps } = setup()
    await makePoster(opts('A1'), (d) => { done = d }, { ...deps, stickers: s.stickers })
    // Fetched once each, released once each, right after the last strip that draws it.
    expect(s.gets.sort()).toEqual([...out.keys()].sort())
    expect([...s.releases].sort()).toEqual([...out.keys()].sort())
    for (const [url, sp] of out) expect(releasedAt.get(url)).toBe(sp.last)
    expect(s.held.size).toBe(0)
    expect(s.maxInFlight()).toBeLessThanOrEqual(12)
    expect(s.stickers.dispose).toHaveBeenCalled()
  })

  it('never draws a tile without its image: each strip draws exactly the stickers tileInRange keeps', async () => {
    const c = await card('A2')
    const { ranges } = spans(c, 'A2')
    const perStrip: string[][] = [[]]
    const f = fakeCtx((b) => perStrip.at(-1)!.push(b.url))
    const { deps } = setup()
    await makePoster(opts('A2'), () => {}, { ...deps, strip: (w) => ({ ctx: f.ctx, read: (n) => { perStrip.push([]); return new Uint8ClampedArray(w * n * 4) } }) })
    perStrip.pop()
    const all = [...c.tiles, ...(c.lifer ? [c.lifer] : [])]
    ranges.forEach((r, i) => expect(perStrip[i].sort()).toEqual(all.filter((t) => t.url && tileInRange(t, r)).map((t) => t.url!).sort()))
  })

  it('a URL shared by a collage tile at the top and the lifer at the bottom is fetched once, released after the lifer', async () => {
    const c = await card('A1')
    const top = c.tiles.find((t) => t.url === c.lifer!.url)!
    expect(top).toBeDefined() // precondition: synbird0's collage tile and the lifer use the same 384 file
    const { out } = spans(c, 'A1')
    const [w, h] = PRINT_PX.A1, k = printScale('A1')
    const strips = stripRanges(w, h, posterRows(w, k))
    const lastOfTop = Math.max(...strips.flatMap((s, i) => (tileInRange(top, { y0: s.y / k, y1: (s.y + s.rows) / k }) ? [i] : [])))
    const sp = out.get(top.url!)!
    expect(lastOfTop).toBeLessThan(sp.last - 1) // the lifer's strip is well after the tile's
    const s = fakeStickers()
    let done = 0, releasedAt = -1
    const release = s.stickers.release
    s.stickers.release = (url) => { if (url === top.url) releasedAt = done; release(url) }
    const { deps } = setup()
    await makePoster(opts('A1'), (d) => { done = d }, { ...deps, stickers: s.stickers })
    expect(s.gets.filter((u) => u === top.url)).toHaveLength(1)
    expect(releasedAt).toBe(sp.last)
  })

  it('every strip transform has an integer f equal to -y; no canvas passes the iOS cap, even with a huge rows override', async () => {
    for (const [size, rows] of [['A1', undefined], ['A4', undefined], ['A1', 4967]] as const) {
      const { deps, f, stripCalls } = setup({ rows })
      await makePoster(opts(size), () => {}, deps)
      const [w, h] = PRINT_PX[size], k = printScale(size)
      const ys = stripRanges(w, h, posterRows(w, k, rows)).map((s) => s.y)
      const scaled = f.transforms.filter((m) => m[0] !== 1)
      expect(scaled.map((m) => m[5] + 0)).toEqual(ys.map((y) => -y + 0))
      for (const m of scaled) {
        expect(m.slice(0, 5)).toEqual([k, 0, 0, k, 0])
        expect(Number.isInteger(m[5])).toBe(true)
      }
      for (const [cw, cr] of stripCalls) expect(cw * cr).toBeLessThanOrEqual(IOS_CANVAS_AREA)
    }
  })

  it('rows override changes only the strip count', async () => {
    const a = setup(), b = setup({ rows: 100 })
    await makePoster(opts('A4'), () => {}, a.deps)
    await makePoster(opts('A4'), () => {}, b.deps)
    expect(a.e.rows).toEqual([...Array(12).fill(138), 98])
    expect(b.e.rows).toHaveLength(18)
    expect(b.e.rows.reduce((x, y) => x + y, 0)).toBe(1754)
    expect(b.stripCalls).toEqual([[1240, 100]])
    expect(b.e.enc.begin).toHaveBeenCalledWith(1240, 1754)
    expect([...b.s.gets].sort()).toEqual([...a.s.gets].sort())
  })

  it('abort mid-way rejects with AbortError, disposes stickers and encoder, sends no more strips', async () => {
    const { deps, e, s, f } = setup()
    const ac = new AbortController()
    const run = makePoster(opts('A1', { signal: ac.signal }), (d) => { if (d === 5) ac.abort() }, deps)
    await expect(run).rejects.toMatchObject({ name: 'AbortError' })
    expect(e.rows).toHaveLength(5)
    expect(e.enc.end).not.toHaveBeenCalled()
    expect(e.enc.dispose).toHaveBeenCalled()
    expect(s.stickers.dispose).toHaveBeenCalled()
    expect([f.canvas.width, f.canvas.height]).toEqual([1, 1])
  })

  it('a StickerReleased error is not an abort', async () => {
    const { deps, e } = setup()
    const ac = new AbortController()
    deps.stickers!.get = async () => { ac.abort(); throw Object.assign(new Error('released'), { name: 'StickerReleased' }) }
    await expect(makePoster(opts('A4', { signal: ac.signal }), () => {}, deps)).rejects.toMatchObject({ name: 'StickerReleased' })
    expect(e.enc.dispose).toHaveBeenCalled()
  })

  it('a 2d context that is null fails with poster-memory', async () => {
    const canvas = { width: 0, height: 0, getContext: () => null }
    vi.stubGlobal('document', { createElement: () => canvas })
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }))
    const { deps, s } = setup()
    const encoder = vi.fn(deps.encoder!)
    delete deps.strip
    await expect(makePoster(opts('A4'), () => {}, { ...deps, encoder })).rejects.toThrow('poster-memory')
    expect(encoder).not.toHaveBeenCalled()
    expect(s.stickers.dispose).toHaveBeenCalled()
    // Never left big: shrunk by canvasStrip, or never sized when prepareCard's measurer already gave up.
    expect(canvas.width).toBeLessThanOrEqual(1)
    expect(canvas.height).toBeLessThanOrEqual(1)
  })

  it('a getImageData that throws fails with poster-memory', async () => {
    const f = fakeCtx()
    const ctx = new Proxy(f.ctx, { get: (t, p) => (p === 'getImageData' ? () => { throw new RangeError('out of memory') } : Reflect.get(t, p)) })
    const canvas = { width: 0, height: 0, getContext: () => ctx }
    vi.stubGlobal('document', { createElement: () => canvas })
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }))
    const { deps, e } = setup()
    delete deps.strip
    await expect(makePoster(opts('A4'), () => {}, deps)).rejects.toThrow('poster-memory')
    expect(e.enc.dispose).toHaveBeenCalled()
  })

  it('at most 12 gets in flight, with 72 stickers and 48 of them in the first strips', async () => {
    const c = await manyCard('A1')
    const { out } = spans(c, 'A1')
    expect([...out.values()].filter((sp) => sp.first <= 1).length).toBeGreaterThan(12) // precondition
    const { deps, s } = setup()
    await makePoster(manyOpts('A1'), () => {}, deps)
    expect(s.gets).toHaveLength(out.size)
    expect(s.maxInFlight()).toBe(12)
  })

  it('prefetch never reaches past the next strip: every held or loading sticker is drawn by strip i or i + 1', async () => {
    for (const size of ['A1', 'A4'] as const) {
      const c = await manyCard(size)
      const { out } = spans(c, size)
      const s = fakeStickers()
      let done = 0, peak = 0, audits = 0
      const audit = () => {
        audits++
        const live = [...s.held.keys(), ...s.pending]
        for (const url of live) {
          const sp = out.get(url)!
          expect(sp.first, url).toBeLessThanOrEqual(done + 1)
          expect(sp.last, url).toBeGreaterThanOrEqual(done)
        }
        const near = [...out.values()].filter((sp) => sp.first <= done + 1 && sp.last >= done).length
        expect(s.held.size).toBeLessThanOrEqual(near)
        expect(s.held.size + s.pending.size).toBeLessThanOrEqual(near + 12)
        peak = Math.max(peak, live.length)
      }
      const get = s.stickers.get
      s.stickers.get = async (t, signal) => { const b = await get(t, signal); audit(); return b }
      const { deps } = setup()
      const read = deps.strip!
      await makePoster(manyOpts(size), (d) => { done = d }, {
        ...deps, stickers: s.stickers,
        strip: (w, r) => { const st = read(w, r); return { ctx: st.ctx, read: (n) => { audit(); return st.read(n) } } },
      })
      expect(audits).toBeGreaterThan(out.size)
      expect(peak).toBeLessThan(out.size) // never every sticker at once
    }
  })

  it('a get that throws synchronously, started from a queue slot freed by another, still rejects the make', async () => {
    const { deps, e, s } = setup()
    const get = s.stickers.get
    let calls = 0
    // The 20th get is never among the first 12, so it starts when an earlier one settles.
    deps.stickers!.get = (t, signal) => { if (++calls === 20) throw new Error('sync boom'); return get(t, signal) }
    await expect(makePoster(manyOpts('A1'), () => {}, deps)).rejects.toThrow('sync boom')
    expect(e.enc.dispose).toHaveBeenCalled()
    expect(s.stickers.dispose).toHaveBeenCalled()
  })

  it('abort during a held get rejects with AbortError promptly and disposes stickers and encoder', async () => {
    const { deps, e, s } = setup()
    const ac = new AbortController()
    let calls = 0
    deps.stickers!.get = (_t, signal) => {
      calls++
      if (calls === 1) setTimeout(() => ac.abort())
      return new Promise((_, reject) => signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
    }
    const t0 = Date.now()
    await expect(makePoster(opts('A4', { signal: ac.signal }), () => {}, deps)).rejects.toMatchObject({ name: 'AbortError' })
    expect(Date.now() - t0).toBeLessThan(1_000)
    expect(e.rows).toHaveLength(0)
    expect(e.enc.dispose).toHaveBeenCalled()
    expect(s.stickers.dispose).toHaveBeenCalled()
  })

  it('abort during encoder backpressure (a worker that never acknowledges) rejects with AbortError and terminates it', async () => {
    const pw = fakePrintWorker({ took: false })
    const { deps, s } = setup({ encoder: () => workerEncoder(() => pw.w) })
    const ac = new AbortController()
    const run = makePoster(opts('A1', { signal: ac.signal }), () => {}, deps)
    await vi.waitFor(() => expect(pw.strips()).toBe(2)) // the second strip waits for an ack that never comes
    await new Promise((r) => setTimeout(r, 10))
    expect(pw.strips()).toBe(2)
    ac.abort()
    await expect(run).rejects.toMatchObject({ name: 'AbortError' })
    expect(pw.w.terminate).toHaveBeenCalledTimes(1)
    expect(s.stickers.dispose).toHaveBeenCalled()
  })

  it('an encoder error mid-make rejects with that error and disposes the stickers', async () => {
    const pw = fakePrintWorker({ failOnStrip: 3 })
    const { deps, s } = setup({ encoder: () => workerEncoder(() => pw.w) })
    await expect(makePoster(opts('A1'), () => {}, deps)).rejects.toThrow('deflate failed')
    expect(pw.strips()).toBeLessThan(17)
    expect(pw.w.terminate).toHaveBeenCalledTimes(1)
    expect(s.stickers.dispose).toHaveBeenCalled()
  })

  it('files: asked once per kind with the ISO page, returned as a copy', async () => {
    const { deps, e } = setup()
    const poster = await makePoster(opts('A3'), () => {}, deps)
    const [a, b] = await Promise.all([poster.file('pdf'), poster.file('pdf')])
    expect(a).toBe(b)
    expect(a).toBeInstanceOf(Blob)
    expect(a).not.toBe(await e.enc.file.mock.results[0].value) // a copy, not the worker's Blob
    expect(await a.text()).toBe('pdf')
    expect(a.type).toBe('application/pdf')
    expect(e.enc.file).toHaveBeenCalledTimes(1)
    expect(e.enc.file).toHaveBeenCalledWith('pdf', PRINT_PT.A3)
    poster.dispose()
    expect(e.enc.dispose).toHaveBeenCalled()
  })
})

describe('workerEncoder', () => {
  function fakeWorker() {
    const posted: { msg: { type: string; rows?: number }; transfer: Transferable[] }[] = []
    const w = {
      onmessage: null as ((e: MessageEvent) => void) | null, onerror: null as ((e: ErrorEvent) => void) | null,
      postMessage: (msg: { type: string }, transfer: Transferable[]) => { posted.push({ msg, transfer }) },
      terminate: vi.fn(),
    }
    const reply = (data: unknown) => w.onmessage!({ data } as MessageEvent)
    return { w, posted, reply }
  }
  const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

  it('transfers each strip and keeps at most 2 unacknowledged; end and file resolve from their replies', async () => {
    const { w, posted, reply } = fakeWorker()
    const port = workerEncoder(() => w)
    port.begin(2, 3)
    let resolved = 0
    const strip = () => new Uint8ClampedArray(8)
    const a = strip()
    void port.strip(a, 1).then(() => resolved++)
    await flush()
    expect(resolved).toBe(1) // 1 unacknowledged: go on
    expect(posted[1].transfer).toEqual([a.buffer])
    void port.strip(strip(), 1).then(() => resolved++)
    await flush()
    expect(resolved).toBe(1) // 2 unacknowledged: wait
    reply({ type: 'took', rows: 1 })
    await flush()
    expect(resolved).toBe(2)
    reply({ type: 'took', rows: 1 })
    const end = port.end()
    reply({ type: 'encoded', bytes: 99 })
    expect(await end).toBe(99)
    const file = port.file('png', [1, 2])
    const blob = new Blob(['x'])
    reply({ type: 'file', kind: 'png', blob })
    expect(await file).toBe(blob)
    expect(posted.map((p) => p.msg.type)).toEqual(['begin', 'strip', 'strip', 'end', 'file'])
    port.dispose()
    expect(w.terminate).toHaveBeenCalled()
  })

  it('the first error reply rejects every pending and later call and terminates the worker', async () => {
    const { w, reply } = fakeWorker()
    const port = workerEncoder(() => w)
    port.begin(2, 3)
    await port.strip(new Uint8ClampedArray(8), 1)
    const pending = port.strip(new Uint8ClampedArray(8), 1)
    reply({ type: 'error', message: 'deflate failed' })
    await expect(pending).rejects.toThrow('deflate failed')
    await expect(port.end()).rejects.toThrow('deflate failed')
    expect(() => port.begin(2, 3)).toThrow('deflate failed')
    expect(w.terminate).toHaveBeenCalledTimes(1)
  })

  it('onerror is fatal too', async () => {
    const { w } = fakeWorker()
    const port = workerEncoder(() => w)
    const end = port.end()
    w.onerror!({ message: 'boom', preventDefault() {} } as ErrorEvent)
    await expect(end).rejects.toThrow('boom')
    expect(w.terminate).toHaveBeenCalled()
  })
})

describe('seams, end to end', () => {
  // A colour per absolute device pixel, so a strip drawn at the wrong offset or out of order changes the output.
  const pixel = (y: number, x: number) => {
    const v = Math.imul(y * 7919 + x * 104729, 2654435761) >>> 0
    return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255] as const
  }
  function inProcess(): EncoderPort {
    let enc: PosterEncoder
    return {
      begin(w, h) { enc = new PosterEncoder(w, h) },
      strip: (rgba, rows) => enc.strip(rgba, rows),
      end: async () => { await enc.end(); return enc.bytes },
      file: async (kind, page) => enc.file(kind, page),
      dispose() {},
    }
  }
  function unUp(filtered: Uint8Array, w: number) {
    const stride = 3 * w, rows = filtered.length / (stride + 1), rgb = Buffer.alloc(stride * rows)
    for (let y = 0; y < rows; y++) {
      expect(filtered[y * (stride + 1)]).toBe(2)
      for (let x = 0; x < stride; x++) rgb[y * stride + x] = (filtered[y * (stride + 1) + 1 + x] + (y ? rgb[(y - 1) * stride + x] : 0)) % 256
    }
    return rgb
  }
  async function make(rows: number) {
    const f = fakeCtx(), s = fakeStickers()
    const poster = await makePoster(opts('A4'), () => {}, {
      rows, stickers: s.stickers, encoder: inProcess, frame: async () => {},
      strip: (w) => ({
        ctx: f.ctx,
        read(n) {
          const y0 = f.stripY(), out = new Uint8ClampedArray(w * n * 4)
          for (let r = 0; r < n; r++) for (let x = 0; x < w; x++) {
            const [R, G, B] = pixel(y0 + r, x), i = (r * w + x) * 4
            out[i] = R; out[i + 1] = G; out[i + 2] = B; out[i + 3] = 255
          }
          return out
        },
      }),
    })
    return poster
  }

  it('A4 in 1 strip and in 19 decodes to the same pixels, in the PNG and in the PDF', async () => {
    const [w, h] = PRINT_PX.A4
    const expected = Buffer.alloc(w * h * 3)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) expected.set(pixel(y, x), (y * w + x) * 3)
    expect(stripRanges(w, h, 97)).toHaveLength(19)
    for (const rows of [1754, 97]) {
      const poster = await make(rows)
      const png = Buffer.from(await (await poster.file('png')).arrayBuffer())
      const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
      expect([info.width, info.height, info.channels]).toEqual([w, h, 3])
      expect(data.equals(expected)).toBe(true)
      const pdf = Buffer.from(await (await poster.file('pdf')).arrayBuffer())
      const text = pdf.toString('latin1')
      const image = /4 0 obj\n[\s\S]*?\/Length (\d+) >>\nstream\n/.exec(text)!
      const begin = image.index + image[0].length
      expect(unUp(inflateSync(pdf.subarray(begin, begin + Number(image[1]))), w).equals(expected)).toBe(true)
    }
  }, 60_000)
})
