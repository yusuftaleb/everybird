import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearStickerCache, loadStickers, packForImage, packFromReply, paintTiles, stickerCacheSize, type Tile,
} from '@/lib/share/image'
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
