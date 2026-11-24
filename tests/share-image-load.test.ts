import { en } from '@/i18n/messages/en'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearStickerCache, loadStickers, packForImage, packFromReply, paintCard, paintTiles, prepareCard, stickerCacheSize, tileInRange, type ImagePack, type Tile,
} from '@/lib/share/image'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import type { WorkerReply } from '@/lib/layout/layout.worker'
import { NO_HOLE, type Hole } from '@/lib/layout/count-box'
import type { ListEntry } from '@/lib/list/model'
import type { SpeciesIndex } from '@/lib/species/load'

// A stand-in for HTMLImageElement: the test decides when (and whether) each image loads.
class FakeImage {
  static all: FakeImage[] = []
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  crossOrigin = ''
  decoding = ''
  src = ''
  removed = false
  constructor() { FakeImage.all.push(this) }
  removeAttribute(name: string) { if (name === 'src') { this.src = ''; this.removed = true } }
  load() { this.onload?.() }
  fail() { this.onerror?.() }
}
class FakePath2D { constructor(public d: string) {} }

/** Records the drawing calls paintTiles makes. */
function recorder() {
  const calls: { op: string; arg?: unknown; fill?: string }[] = []
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: '',
    drawImage: (img: unknown) => calls.push({ op: 'drawImage', arg: img }),
    fill: (p: unknown) => calls.push({ op: 'fill', arg: p, fill: ctx.fillStyle }),
    stroke: (p: unknown) => calls.push({ op: 'stroke', arg: p, fill: ctx.strokeStyle }),
    save: () => {}, restore: () => {}, translate: () => {}, scale: () => {},
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}
const tile = (url: string | null): Tile => ({ x: 0, y: 0, w: 100, h: 80, url })
const urls = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `https://stickers.test/${prefix}/${i}.webp`)
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  FakeImage.all = []
  vi.stubGlobal('Image', FakeImage)
  vi.stubGlobal('Path2D', FakePath2D)
  clearStickerCache()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('sticker loading and painting', () => {
  it('a failed load is drawn as the Muted silhouette, a loaded one as the sticker (no hole)', async () => {
    const [a, b] = urls('fail', 2)
    const p = loadStickers([a, b])
    await flush()
    expect(FakeImage.all.map((i) => i.crossOrigin)).toEqual(['anonymous', 'anonymous'])
    FakeImage.all[0].fail()
    FakeImage.all[1].load()
    const imgs = await p
    expect(imgs.get(a)).toBeNull()
    expect(imgs.get(b)).toBe(FakeImage.all[1])
    expect(stickerCacheSize()).toBe(1) // only the success stays cached

    const { ctx, calls } = recorder()
    paintTiles(ctx, [tile(a), tile(b), tile(null)], imgs, '#857f74')
    // A missing sticker is a thin outline in Line, not a solid silhouette.
    expect(calls.map((c) => c.op)).toEqual(['stroke', 'drawImage', 'stroke'])
    expect(calls.filter((c) => c.op === 'stroke').every((c) => c.fill === '#857f74' && c.arg instanceof FakePath2D)).toBe(true)
  })

  it('when the overall budget runs out, the pending stickers become silhouettes and no more are pulled', async () => {
    vi.useFakeTimers()
    const list = urls('budget', 20)
    const p = loadStickers(list, { budgetMs: 1000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(FakeImage.all.length).toBe(12) // 12 at a time
    FakeImage.all[0].load()
    await vi.advanceTimersByTimeAsync(1000)
    const imgs = await p
    expect(imgs.get(list[0])).toBe(FakeImage.all[0])
    expect(imgs.size).toBe(1) // only the one that loaded; the 13th started in its slot and is still pending → absent
    expect(imgs.get(list[12])).toBeUndefined()
    expect(FakeImage.all.length).toBe(13)
    await vi.advanceTimersByTimeAsync(60_000) // nothing else starts later
    expect(FakeImage.all.length).toBe(13)

    const { ctx, calls } = recorder()
    paintTiles(ctx, list.map(tile), imgs, '#a9a9b2')
    expect(calls.filter((c) => c.op === 'drawImage').length).toBe(1)
    expect(calls.filter((c) => c.op === 'stroke').length).toBe(19)
  })

  it('the per-sticker timeout still applies inside the budget', async () => {
    vi.useFakeTimers()
    const [a] = urls('slow', 1)
    const p = loadStickers([a], { budgetMs: 60_000 })
    await vi.advanceTimersByTimeAsync(20_000)
    expect((await p).get(a)).toBeNull()
  })

  it('abort rejects with an AbortError, stops pulling and in-flight loads, and writes nothing to the cache', async () => {
    const list = urls('abort', 30)
    const c = new AbortController()
    const p = loadStickers(list, { signal: c.signal })
    await flush()
    expect(FakeImage.all.length).toBe(12)
    expect(stickerCacheSize()).toBe(12) // loading
    c.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    await flush()
    expect(FakeImage.all.length).toBe(12) // no more URLs pulled
    expect(FakeImage.all.every((i) => i.removed && i.onload === null)).toBe(true) // fetches stopped
    expect(stickerCacheSize()).toBe(0)
    FakeImage.all.forEach((i) => i.load()) // a late load event changes nothing
    await flush()
    expect(stickerCacheSize()).toBe(0)
    await expect(loadStickers(list, { signal: c.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(FakeImage.all.length).toBe(12)
  })

  it('a load that finishes after clearStickerCache does not repopulate the cache', async () => {
    const [a] = urls('cleared', 1)
    const p = loadStickers([a])
    await flush()
    clearStickerCache()
    FakeImage.all[0].load()
    expect((await p).get(a)).toBe(FakeImage.all[0]) // the render that asked still gets it
    expect(stickerCacheSize()).toBe(0)
  })
})

describe('worker image reply', () => {
  const reply: WorkerReply = { type: 'image', id: 1, W: 300, H: 400, codes: ['a', 'b'], boxes: new Float32Array([1, 2, 30, 20, 50, 60, 10, 12]) }

  it('maps codes to their [x, y, w, h] boxes', () => {
    const pack = packFromReply(reply)
    expect(pack.W).toBe(300)
    expect(pack.H).toBe(400)
    expect([...pack.boxes]).toEqual([['a', [1, 2, 30, 20]], ['b', [50, 60, 10, 12]]])
  })

  it('an error reply throws its message', () => {
    expect(() => packFromReply({ type: 'error', id: 1, message: 'boom' })).toThrow('boom')
  })

  // A worker stand-in that answers the image request with `answer`, or never (to test abort).
  function fakeWorker(answer?: (msg: { entries: unknown[]; aspect: number }) => WorkerReply) {
    const made: { msgs: unknown[]; terminated: boolean }[] = []
    class W {
      onmessage: ((e: { data: WorkerReply }) => void) | null = null
      onerror: ((e: { message: string }) => void) | null = null
      rec = { msgs: [] as unknown[], terminated: false }
      constructor() { made.push(this.rec) }
      postMessage(m: { entries: unknown[]; aspect: number }) {
        this.rec.msgs.push(m)
        if (answer) setTimeout(() => this.onmessage?.({ data: answer(m) }), 0)
      }
      terminate() { this.rec.terminated = true }
    }
    vi.stubGlobal('Worker', W)
    return made
  }
  const row = (code: string) => ({ code, com: code, sci: code, ord: 'Passeriformes', fam: 'X', famCom: 'X', to: 1, g: 10, gSrc: 'avonet' as const, st: true, ar: 1, q: true })
  const species: SpeciesIndex = { rows: [row('a'), row('b')], byCode: new Map([['a', row('a')], ['b', row('b')]]) as never, search: () => [] }
  const entries = ['a', 'b', 'unknown'].map((code) => ({ code, heard: false, dead: false, media: false, sources: ['ebird'] })) as ListEntry[]

  it('packForImage sends the known birds and the aspect, maps the reply, and ends the worker', async () => {
    const made = fakeWorker(() => reply)
    const hole = { num: [-0.2, -0.1, 0.2, 0.05], label: [-0.1, 0.07, 0.1, 0.1], pad: 0.02 } as Hole
    const pack = await packForImage(entries, species, { aspect: 0.7, hole, maxTile: 0.36 })
    expect(made[0].msgs).toEqual([{ type: 'image', id: 1, aspect: 0.7, hole, maxTile: 0.36, entries: [{ code: 'a', mass: 10, ord: 'Passeriformes' }, { code: 'b', mass: 10, ord: 'Passeriformes' }] }])
    expect(pack.boxes.get('b')).toEqual([50, 60, 10, 12])
    expect(made[0].terminated).toBe(true)
  })

  it('aborting packForImage terminates the worker and rejects with an AbortError', async () => {
    const made = fakeWorker()
    const c = new AbortController()
    const p = packForImage(entries, species, { aspect: 1, hole: NO_HOLE, maxTile: 0.3 }, c.signal)
    c.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(made[0].terminated).toBe(true)
  })
})

describe('painting in ranges (the poster strips)', () => {
  /** A fuller recording ctx: every call paintCard makes, with the text it draws. */
  function fullRecorder() {
    const calls: { op: string; args: unknown[] }[] = []
    const rec = (op: string) => (...args: unknown[]) => { calls.push({ op, args }) }
    const ctx = {
      fillStyle: '', strokeStyle: '', lineWidth: 1, lineJoin: '', font: '', letterSpacing: '0px', textAlign: '', textBaseline: '',
      imageSmoothingEnabled: false, imageSmoothingQuality: '',
      measureText: (text: string) => ({ width: text.length * 10, actualBoundingBoxAscent: 0 }),
      fillText: rec('fillText'), fillRect: rec('fillRect'), drawImage: rec('drawImage'), stroke: rec('stroke'),
      save: rec('save'), restore: rec('restore'), translate: rec('translate'), scale: rec('scale'),
      setTransform: rec('setTransform'), resetTransform: rec('resetTransform'),
    }
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
  }
  const tiles: Tile[] = [0, 90, 180, 400, 610, 1000].map((y, i) => ({ x: 10 * i, y, w: 100, h: 120, url: `u${i}` }))

  it('paintTiles with a range draws exactly the tiles tileInRange keeps', () => {
    const imgs = new Map(tiles.map((t) => [t.url!, { id: t.url } as unknown as CanvasImageSource]))
    for (const range of [{ y0: 0, y1: 100 }, { y0: 100, y1: 300 }, { y0: 520, y1: 610 }, { y0: 2000, y1: 3000 }]) {
      const { ctx, calls } = fullRecorder()
      paintTiles(ctx, tiles, imgs, '#857f74', range)
      const drawn = calls.filter((c) => c.op === 'drawImage').map((c) => (c.args[0] as { id: string }).id)
      expect(drawn).toEqual(tiles.filter((t) => tileInRange(t, range)).map((t) => t.url))
    }
    // The 1 unit margin: a tile ending at 520 still counts for a band from 520.5, not for one from 521.5.
    expect(tileInRange({ y: 400, h: 120 }, { y0: 520.5, y1: 600 })).toBe(true)
    expect(tileInRange({ y: 400, h: 120 }, { y0: 521.5, y1: 600 })).toBe(false)
    expect(tileInRange({ y: 610, h: 10 }, { y0: 0, y1: 609.5 })).toBe(true)
    expect(tileInRange({ y: 610, h: 10 }, { y0: 0, y1: 608.5 })).toBe(false)
  })

  /** A1 print card of synthetic birds, packed by hand in a ring so tiles spread over the card's height. */
  async function ringCard() {
    const codes = Array.from({ length: 10 }, (_, i) => `bird${i}`)
    const row = (code: string, i: number) => ({ code, com: `Bird ${i}`, sci: code, ord: 'Passeriformes', fam: 'X', famCom: 'X', to: i, g: 10 + i, gSrc: 'family', st: i !== 3, ar: 1, q: true }) as SpeciesRow
    const species = buildSpeciesIndex(codes.map(row))
    const entries = codes.map((code, i) => ({ code, date: `2020-${String(i + 1).padStart(2, '0')}`, heard: false, dead: false, media: false, sources: ['ebird'] })) as ListEntry[]
    const boxes = new Map(codes.map((c, i) => {
      const a = (i / codes.length) * 2 * Math.PI
      return [c, [500 + 380 * Math.cos(a) - 50, 500 + 380 * Math.sin(a) - 50, 100, 100]] as [string, [number, number, number, number]]
    }))
    const pack: ImagePack = { W: 1000, H: 1000, boxes }
    return prepareCard({ format: 'print', printSize: 'A1', theme: 'light', entries, species, pack, name: 'A test list', filterLabel: 'Perching birds', now: new Date(2026, 10, 15), strings: en.ui }, 3.248)
  }

  it('paintCard over bands covering the card: each tile in exactly the bands it meets, all the text in every band', async () => {
    const card = await ringCard()
    // A poster names its latest lifer in the foot, its sticker before the words (round 6): painted after the collage's.
    expect(card.lifer).not.toBeNull()
    // Half the stickers loaded, the rest (and bird3, which has none) drawn as outlines.
    const all = [...card.tiles, card.lifer!]
    const imgs = new Map<string, CanvasImageSource | null>()
    all.forEach((t, i) => { if (t.url) imgs.set(t.url, i % 2 ? null : ({ id: t.url } as unknown as CanvasImageSource)) })
    const loaded = (t: Tile) => !!(t.url && imgs.get(t.url))

    const step = 97.3
    const bands = Array.from({ length: Math.ceil(card.L.H / step) }, (_, i) => ({ y0: i * step, y1: Math.min(card.L.H, (i + 1) * step) }))
    let texts: unknown[] | undefined
    const drawnIn = new Map<Tile, number>()
    let strokes = 0
    for (const band of bands) {
      const { ctx, calls } = fullRecorder()
      paintCard(ctx, card, imgs, band)
      expect(calls.some((c) => c.op === 'setTransform' || c.op === 'resetTransform')).toBe(false) // the caller's transform
      expect(calls[0]).toEqual({ op: 'fillRect', args: [0, 0, card.L.W, card.L.H] }) // Paper over the whole card first
      const t = calls.filter((c) => c.op === 'fillText').map((c) => c.args[0])
      if (texts) expect(t).toEqual(texts)
      else texts = t
      const draws = calls.filter((c) => c.op === 'drawImage').map((c) => c.args)
      const want = all.filter((x) => tileInRange(x, band))
      expect(draws).toEqual(want.filter(loaded).map((x) => [imgs.get(x.url!), x.x, x.y, x.w, x.h]))
      // An outline only for the tiles in the band without an image.
      const s = calls.filter((c) => c.op === 'stroke').length
      expect(s).toBe(want.filter((x) => !loaded(x)).length)
      strokes += s
      for (const x of want) drawnIn.set(x, (drawnIn.get(x) ?? 0) + 1)
    }
    // The poster's head: the title, the filter in words under it.
    expect(texts).toEqual(expect.arrayContaining(['A test list', 'Perching birds', 'Everybird', card.footerLine, card.K.number]))
    // Every tile drawn in at least one band, and in exactly the bands it meets.
    for (const x of all) expect(drawnIn.get(x)).toBe(bands.filter((b) => tileInRange(x, b)).length)
    expect(all.every((x) => (drawnIn.get(x) ?? 0) >= 1)).toBe(true)
    expect(strokes).toBeGreaterThan(0)
    // Without a range: every tile once.
    const { ctx, calls } = fullRecorder()
    paintCard(ctx, card, imgs)
    expect(calls.filter((c) => c.op === 'drawImage')).toHaveLength(all.filter(loaded).length)
    expect(calls.filter((c) => c.op === 'stroke')).toHaveLength(all.filter((x) => !loaded(x)).length)
  })

  it('every band painted on ONE context (as the poster reuses one) measures and draws the same text', async () => {
    const card = await ringCard()
    const imgs = new Map<string, CanvasImageSource | null>()
    const { ctx, calls } = fullRecorder()
    // Record measureText too: fitText's shrinking depends on it, so a state left over from one band would show here.
    const measure = ctx.measureText.bind(ctx)
    ;(ctx as unknown as { measureText: (t: string) => TextMetrics }).measureText = (t: string) => {
      calls.push({ op: 'measureText', args: [t, ctx.font, ctx.letterSpacing] })
      return measure(t)
    }
    // And the state each text is drawn in, so nothing one band leaves on the context changes the next.
    ;(ctx as unknown as { fillText: (...a: unknown[]) => void }).fillText = (...a: unknown[]) => {
      calls.push({ op: 'fillText', args: [...a, ctx.font, ctx.letterSpacing, ctx.fillStyle, ctx.textAlign, ctx.textBaseline] })
    }
    const step = 211.7
    const bands = Array.from({ length: Math.ceil(card.L.H / step) }, (_, i) => ({ y0: i * step, y1: Math.min(card.L.H, (i + 1) * step) }))
    const per: { texts: unknown[][]; measures: unknown[][] }[] = []
    for (const band of bands) {
      const from = calls.length
      paintCard(ctx, card, imgs, band)
      const mine = calls.slice(from)
      per.push({
        texts: mine.filter((c) => c.op === 'fillText').map((c) => c.args),
        measures: mine.filter((c) => c.op === 'measureText').map((c) => c.args),
      })
    }
    expect(per.length).toBeGreaterThan(3)
    expect(per[0].texts.length).toBeGreaterThan(4)
    expect(per[0].measures.length).toBeGreaterThan(2)
    for (const p of per.slice(1)) {
      expect(p.texts).toEqual(per[0].texts)
      expect(p.measures).toEqual(per[0].measures)
    }
  })
})
