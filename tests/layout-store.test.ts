// The device's layout cache (layout-store.ts) and the layout client's use of it, plus the provisional collage.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateLayout } from '@/lib/layout/layout-client'
import type { Mask } from '@/lib/layout/mask'
import type { ListEntryMsg, MaskTable, WorkerReply, WorkerRequest } from '@/lib/layout/layout.worker'
import type { Filter } from '@/lib/list/filters'

// A small threshold, so the provisional path runs on a list that packs in a moment.
vi.mock('@/lib/layout/provisional', async (orig) => ({ ...(await orig<typeof import('@/lib/layout/provisional')>()), PROVISIONAL_FROM: 30 }))

async function fresh() {
  vi.resetModules()
  return {
    store: await import('@/lib/layout/layout-store'),
    client: await import('@/lib/layout/layout-client'),
    worker: await import('@/lib/layout/layout.worker'),
  }
}
beforeEach(() => { (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory() })
afterEach(() => { vi.unstubAllGlobals(); vi.doUnmock('idb-keyval'); vi.doUnmock('@/lib/data-files') })

// Synthetic birds: ellipse masks of varied aspect (no real data), three orders.
function ellipse(w: number, h: number): Mask {
  const bits = new Uint8Array(Math.ceil((w * h) / 8))
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x + 0.5 - w / 2) / (w / 2), dy = (y + 0.5 - h / 2) / (h / 2)
    if (dx * dx + dy * dy <= 1) { const i = y * w + x; bits[i >> 3] |= 0x80 >> (i & 7) }
  }
  return { w, h, bits }
}
const ORDERS = ['Alpha', 'Beta', 'Gamma']
function birds(n: number, massBy = 1): { entries: ListEntryMsg[]; tables: Record<string, MaskTable> } {
  const tables: Record<string, MaskTable> = { Alpha: {}, Beta: {}, Gamma: {} }
  const entries = Array.from({ length: n }, (_, i) => {
    const code = `b${String(i).padStart(4, '0')}`
    const ord = ORDERS[i % 3]
    const long = 24, short = 8 + ((i * 7) % 17)
    tables[ord][code] = i % 2 ? ellipse(long, short) : ellipse(short, long)
    return { code, mass: massBy * (5 + ((i * 37) % 400)), ord }
  })
  return { entries, tables }
}
const byOrder = (entries: ListEntryMsg[]) => (f: Filter) => entries.filter((e) => !f.order || e.ord === f.order).map((e) => e.code)

type W = Awaited<ReturnType<typeof fresh>>['worker']
function fakeWorker(w: W, tables: Record<string, MaskTable>, opts: { failOrder?: string; delay?: number } = {}) {
  const handle = w.createLayoutHandler(async (o) => {
    if (o === opts.failOrder) throw new Error('offline')
    return tables[o] ?? {}
  })
  return {
    log: [] as WorkerRequest[],
    terminated: false,
    onmessage: null as null | ((e: { data: WorkerReply }) => void),
    onerror: null as null | (() => void),
    onmessageerror: null,
    postMessage(msg: WorkerRequest) {
      this.log.push(msg)
      setTimeout(() => void handle(msg).then((r) => { if (!this.terminated) this.onmessage?.({ data: r }) }), msg.type === 'layout' ? opts.delay ?? 0 : 0)
    },
    terminate() { this.terminated = true },
    layouts() { return this.log.filter((m) => m.type === 'layout') },
  }
}
const until = async (cond: () => boolean) => { for (let i = 0; i < 400 && !cond(); i++) await new Promise((r) => setTimeout(r, 5)) }
/** Lets the store's background writes and prunes land. */
const settle = () => new Promise((r) => setTimeout(r, 60))

function client(m: Awaited<ReturnType<typeof fresh>>, list: ReturnType<typeof birds>, opts: { store?: boolean; failOrder?: string; delay?: number; spawn?: () => Worker } = {}) {
  const worker = fakeWorker(m.worker, list.tables, opts)
  const c = m.client.createLayoutClient(worker as unknown as Worker, {
    resolve: byOrder(list.entries), ...(opts.store === false ? {} : { store: m.store.layoutStore() }), ...(opts.spawn ? { spawn: opts.spawn } : {}),
  })
  c.setList(list.entries)
  return { c, worker }
}

describe('layout store', () => {
  const box = (n: number): StateLayout => ({
    key: `wide|even|o:${n}`, layout: 'wide', mode: 'even', W: 1120, H: 700, scale: 0.9, base: 21.5,
    boxes: new Map([['a', [1.5, 2.25, 30.125, 20]], ['b', [100, 50.5, 12, 40.75]]]),
  })

  it('a stored layout comes back equal; an unknown id misses', async () => {
    const { store } = await fresh()
    const s = store.layoutStore()
    s.put('x', box(1))
    await settle()
    expect(await s.get('x')).toEqual(box(1))
    expect(await s.get('y')).toBeUndefined()
  })

  it('keeps at most MAX_ENTRIES, least recently used first; a read counts as a use', async () => {
    const { store } = await fresh()
    const s = store.layoutStore()
    for (let i = 0; i < store.MAX_ENTRIES; i++) { s.put(`k${i}`, box(i)); await settle() }
    expect(await s.get('k0')).toEqual(box(0)) // k0 is now the most recent
    await settle()
    s.put('new', box(99))
    await settle()
    expect(await s.get('k1')).toBeUndefined() // the least recently used went
    expect(await s.get('k0')).toEqual(box(0))
    expect(await s.get('new')).toEqual(box(99))
    expect(await s.get(`k${store.MAX_ENTRIES - 1}`)).toEqual(box(store.MAX_ENTRIES - 1))
  })

  it('keeps the total under MAX_BYTES', async () => {
    const { store } = await fresh()
    const s = store.layoutStore()
    const big = (n: number): StateLayout => {
      const boxes = new Map(Array.from({ length: 40_000 }, (_, i) => [`c${i}`, [i, n, 1, 1] as [number, number, number, number]]))
      return { ...box(n), boxes }
    }
    for (let i = 0; i < 5; i++) { s.put(`b${i}`, big(i)); await settle() } // about 1 MB each
    const kept = await Promise.all([0, 1, 2, 3, 4].map(async (i) => !!(await s.get(`b${i}`))))
    expect(kept).toEqual([false, true, true, true, true])
  })

  it('without IndexedDB (private mode): every read misses, writes do nothing, nothing throws', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const { store } = await fresh()
    const s = store.layoutStore()
    s.put('x', box(1))
    expect(await s.get('x')).toBeUndefined()
    await expect(store.clearLayouts()).resolves.toBeUndefined()
  })

  it('a database that fails to open, or hangs: misses, quietly', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new DOMException('denied', 'SecurityError') } })
    const failing = await fresh()
    expect(await failing.store.layoutStore().get('x')).toBeUndefined()
    vi.unstubAllGlobals()
    vi.doMock('idb-keyval', async (orig) => ({ ...(await orig<typeof import('idb-keyval')>()), get: () => new Promise(() => {}) }))
    const hung = await fresh()
    const t0 = Date.now()
    expect(await hung.store.layoutStore().get('x')).toBeUndefined()
    expect(Date.now() - t0).toBeLessThan(hung.store.READ_MS + 400)
  })

  it('Forget clears it with the list', async () => {
    const { store } = await fresh()
    const storage = await import('@/lib/list/storage')
    const s = store.layoutStore()
    s.put('x', box(1))
    await settle()
    expect(await storage.forget()).toBe('forgotten')
    expect(await s.get('x')).toBeUndefined()
  })
})

describe('layout client with the store', () => {
  it('a repeat visit shows the stored layouts, packing nothing, deep-equal to a fresh pack', async () => {
    const m = await fresh()
    const list = birds(40)
    const first = client(m, list)
    const full = await first.c.get({}, 'medium', 'even')
    const beta = await first.c.get({ order: 'Beta' }, 'medium', 'even')
    const tru = await first.c.get({ order: 'Beta' }, 'medium', 'true')
    await settle()
    first.c.dispose()

    const again = client(m, list)
    expect(await again.c.get({ order: 'Beta' }, 'medium', 'true')).toEqual(tru) // no even or full collage needed first
    expect(await again.c.get({}, 'medium', 'even')).toEqual(full)
    expect(await again.c.get({ order: 'Beta' }, 'medium', 'even')).toEqual(beta)
    expect(again.worker.layouts()).toEqual([])

    const plain = client(m, list, { store: false }) // the same states packed with no store at all
    expect(await plain.c.get({}, 'medium', 'even')).toEqual(full)
    expect(await plain.c.get({ order: 'Beta' }, 'medium', 'even')).toEqual(beta)
  })

  it('misses on every change: the list, the layout class, the mode, the arrangement, the filter, its resolution', async () => {
    const m = await fresh()
    const list = birds(30)
    const a = client(m, list)
    await a.c.get({ order: 'Beta' }, 'medium', 'even')
    await settle()
    const packed = async (c: ReturnType<typeof client>, run: () => Promise<unknown>) => { const n = c.worker.layouts().length; await run(); return c.worker.layouts().length - n }

    const b = client(m, list)
    expect(await packed(b, () => b.c.get({ order: 'Beta' }, 'medium', 'even'))).toBe(0)
    expect(await packed(b, () => b.c.get({ order: 'Beta' }, 'wide', 'even'))).toBe(2) // class: its full collage, then Beta
    expect(await packed(b, () => b.c.get({}, 'medium', 'true'))).toBe(1) // mode
    expect(await packed(b, () => b.c.get({}, 'medium', 'even', 'oval'))).toBe(1) // arrangement
    expect(await packed(b, () => b.c.get({ order: 'Gamma' }, 'medium', 'even'))).toBe(1) // filter
    b.c.refilter((f) => byOrder(list.entries)(f).filter((c) => c !== 'b0001')) // same filter, other birds
    expect(await packed(b, () => b.c.get({ order: 'Beta' }, 'medium', 'even'))).toBe(1)

    const heavier = client(m, birds(30, 2)) // the list: same codes, other masses
    expect(await packed(heavier, () => heavier.c.get({}, 'medium', 'even'))).toBe(1)
  })

  it('the id changes with the pack version and the species and masks files', async () => {
    const m = await fresh()
    const id = m.client.storeId('list', 'wide|even|', ['a', 'b'])
    expect(id.startsWith(`${m.client.PACK_VERSION}|`)).toBe(true)
    vi.doMock('@/lib/data-files', async (orig) => {
      const real = await orig<typeof import('@/lib/data-files')>()
      return { ...real, DATA_FILES: { ...real.DATA_FILES, 'masks.v3.bin': 'masks.v3.changed.bin' } }
    })
    const masks = await fresh()
    expect(masks.client.storeId('list', 'wide|even|', ['a', 'b'])).not.toBe(id)
    vi.doMock('@/lib/data-files', async (orig) => {
      const real = await orig<typeof import('@/lib/data-files')>()
      return { ...real, DATA_FILES: { ...real.DATA_FILES, 'species.v1.json': 'species.v1.changed.json' } }
    })
    const species = await fresh()
    expect(species.client.storeId('list', 'wide|even|', ['a', 'b'])).not.toBe(id)
    expect(m.client.storeId('list', 'wide|even|', ['a', 'c'])).not.toBe(id)
  })

  it('stores what a get asked for, not prefetches the birder never saw, and nothing packed with fallback masks', async () => {
    const m = await fresh()
    const list = birds(30)
    const a = client(m, list)
    await a.c.get({}, 'medium', 'even')
    a.c.prefetch([{ order: 'Gamma' }], 'medium')
    await until(() => a.worker.layouts().length === 2)
    await settle()
    const b = client(m, list)
    await b.c.get({ order: 'Gamma' }, 'medium', 'even')
    expect(b.worker.layouts().map((l) => l.key)).toEqual(['medium|even|o:Gamma'])

    // The idle prefetch of a next visit finds the state the birder saw in the store: nothing packed, then served at once.
    const c = client(m, list)
    c.c.prefetch([{ order: 'Gamma' }], 'medium')
    await settle()
    expect(c.worker.layouts()).toEqual([])
    await c.c.get({ order: 'Gamma' }, 'medium', 'even')
    expect(c.worker.layouts()).toEqual([])

    const offline = client(m, birds(31), { failOrder: 'Beta' })
    await offline.c.get({}, 'narrow', 'even')
    await settle()
    const online = client(m, birds(31))
    await online.c.get({}, 'narrow', 'even')
    expect(online.worker.layouts().length).toBe(1)
  })
})

describe('provisional collage', () => {
  it('a big list that misses the store gets a quick full collage first, then exactly the final one', async () => {
    const m = await fresh()
    const list = birds(60)
    const quick: ReturnType<typeof fakeWorker>[] = []
    const spawn = () => { const w = fakeWorker(m.worker, list.tables); quick.push(w); return w as unknown as Worker }
    const a = client(m, list, { store: false, spawn, delay: 400 }) // the final is held back, as a big list's is
    const early: StateLayout[] = []
    const final = await a.c.get({}, 'medium', 'even', 'packed', (l) => early.push(l))
    expect(early.length).toBe(1)
    const plain = client(m, list, { store: false })
    expect(final).toEqual(await plain.c.get({}, 'medium', 'even'))
    expect(quick.length).toBe(1)
    expect(quick[0].log.map((x) => x.type)).toEqual(['provisional'])
    expect(quick[0].terminated).toBe(true)
    expect(early[0]).not.toEqual(final) // provisional: a state of its own, then the final replaces it
    for (const l of early) {
      expect(l.key).toBe('medium|even|')
      expect(l.boxes.size).toBe(60)
      expect(l.W).toBeLessThanOrEqual(final.W) // trimmed to its birds, as a full collage is
    }
  })

  it('none for a list under PROVISIONAL_FROM, a stored collage, or a filtered get', async () => {
    const m = await fresh()
    let spawned = 0
    const small = birds(20)
    const spawn = () => { spawned++; return fakeWorker(m.worker, small.tables) as unknown as Worker }
    await client(m, small, { spawn }).c.get({}, 'medium', 'even', 'packed', () => {})
    const big = birds(40)
    const a = client(m, big, { spawn: () => { spawned++; return fakeWorker(m.worker, big.tables) as unknown as Worker } })
    await a.c.get({ order: 'Beta' }, 'medium', 'even')
    await a.c.get({}, 'medium', 'even', 'packed', () => {})
    expect(spawned).toBe(0) // the first two never asked, the third was already packed
    await settle()
    const b = client(m, big, { spawn: () => { spawned++; return fakeWorker(m.worker, big.tables) as unknown as Worker } })
    await b.c.get({}, 'medium', 'even', 'packed', () => {})
    await settle()
    expect(spawned).toBe(0) // stored
  })

  it('provisionalPack places every bird on the layout\'s width, in one pass', async () => {
    const m = await fresh()
    const { provisionalPack } = await import('@/lib/layout/provisional')
    const { LAYOUTS } = await import('@/lib/layout/constants')
    const list = birds(700)
    const pb = [...(await m.worker.loadBirds(list.entries, async (o) => list.tables[o])).values()]
    for (const L of LAYOUTS) {
      const r = provisionalPack(pb, L)
      expect(r.boxes.size).toBe(700)
      expect(r.W).toBe(L.W)
      for (const [x, y, w, h] of r.boxes.values()) {
        expect(x).toBeGreaterThanOrEqual(-1e-6); expect(y).toBeGreaterThanOrEqual(-1e-6)
        expect(x + w).toBeLessThanOrEqual(r.W + 1e-6); expect(y + h).toBeLessThanOrEqual(r.H + 1e-6)
      }
    }
  })
})

// Stored layouts are shown without packing again, so a change to what packing gives must bump PACK_VERSION. These
// fingerprints of synthetic lists (no data files: those have their own hashes in the id) catch a change: when one
// fails, add the new fingerprint under PACK_VERSION + 1 and bump PACK_VERSION in layout-client.ts.
const FINGERPRINTS: Record<number, string> = {
  1: '222981303.919', // re-recorded with fix/r6-batch-pack's filtered shapes before any layout was stored
}
describe('pack version', () => {
  it('the packer still gives the layouts PACK_VERSION was recorded for', async () => {
    const m = await fresh()
    let s = 0
    for (const [n, layout] of [[12, 'wide'], [150, 'medium'], [420, 'narrow']] as const) {
      const list = birds(n)
      const c = client(m, list, { store: false })
      for (const arr of ['packed', 'oval', 'free'] as const) {
        for (const l of [await c.c.get({}, layout, 'even', arr), await c.c.get({ order: 'Beta' }, layout, 'true', arr)]) {
          s += l.base + l.W + 3 * l.H
          let i = 0
          for (const [x, y, w, h] of l.boxes.values()) s += ((i++ % 97) + 1) * (x + 3 * y + 7 * w + 11 * h)
        }
      }
    }
    const fp = s.toFixed(3)
    expect(new Set(Object.values(FINGERPRINTS)).size).toBe(Object.keys(FINGERPRINTS).length)
    expect(fp).toBe(FINGERPRINTS[m.client.PACK_VERSION])
  }, 60_000)
})
