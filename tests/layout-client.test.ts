import { describe, expect, it } from 'vitest'
import { createLayoutClient, type StateLayout } from '@/lib/layout/layout-client'
import { createLayoutHandler } from '@/lib/layout/layout.worker'
import { maskFromAlpha } from '@/lib/layout/mask'
import type { Filter } from '@/lib/list/filters'
import type { MaskTable, WorkerReply, WorkerRequest } from '@/lib/layout/layout.worker'

type LayoutMsg = Extract<WorkerRequest, { type: 'layout' }>

type Entry = { code: string; mass: number; ord: string }
const entries: Entry[] = Array.from({ length: 24 }, (_, i) => ({
  code: `b${String(i).padStart(2, '0')}`,
  mass: 8 * 1.35 ** i,
  ord: i % 3 === 0 ? 'Alpha' : i % 3 === 1 ? 'Beta' : 'Gamma',
}))
const resolve = (f: Filter) => entries.filter((e) => !f.order || e.ord === f.order).map((e) => e.code)

// Synthetic mask: a solid block (code b00 gets one; every other species uses the fallback ellipse).
const block = (): [number, number, string] => maskFromAlpha(new Uint8Array(48 * 24).fill(255), 48, 24)

function setup(opts: { manual?: boolean; loaded?: string[] } = {}) {
  const handler = createLayoutHandler(async (order) => {
    opts.loaded?.push(order)
    return (order === 'Alpha' ? { b00: block() } : {}) as MaskTable
  })
  const worker = {
    log: [] as WorkerRequest[],
    pending: [] as (() => void)[],
    onmessage: null as null | ((e: { data: WorkerReply }) => void),
    postMessage(msg: WorkerRequest) {
      this.log.push(msg)
      const run = async () => this.onmessage?.({ data: await handler(msg) })
      if (opts.manual) this.pending.push(() => void run())
      else setTimeout(() => void run(), 0)
    },
    layouts() { return this.log.filter((m): m is LayoutMsg => m.type === 'layout') },
  }
  const client = createLayoutClient(worker as unknown as Worker, { resolve })
  return { worker, client }
}
const until = async (cond: () => boolean) => { for (let i = 0; i < 400 && !cond(); i++) await new Promise((r) => setTimeout(r, 5)) }

describe('layout client', () => {
  it('second get for same key is served from cache', async () => {
    const { client, worker } = setup()
    client.setList(entries)
    const a = await client.get({}, 'medium', 'even')
    const n = worker.layouts().length
    expect(n).toBe(1)
    const b = await client.get({}, 'medium', 'even')
    expect(b).toBe(a)
    expect(worker.layouts().length).toBe(n)
    // a filtered state reuses the cached full collage: one more message, not two
    await client.get({ order: 'Beta' }, 'medium', 'even')
    expect(worker.layouts().length).toBe(n + 1)
  })

  it('packs for real: full collage first, filtered states share its stage and refBase', async () => {
    const loaded: string[] = []
    const { client, worker } = setup({ loaded })
    client.setList(entries)
    const full = await client.get({}, 'medium', 'even')
    const beta = await client.get({ order: 'Beta' }, 'medium', 'even')
    expect(full.scale).toBe(1)
    expect(full.boxes.size).toBe(24)
    expect(beta.boxes.size).toBe(8)
    expect([...beta.boxes.keys()].every((c) => entries.find((e) => e.code === c)!.ord === 'Beta')).toBe(true)
    expect(beta.W).toBe(full.W)
    expect(beta.H).toBe(full.H)
    expect(beta.scale).toBeGreaterThanOrEqual(0.7 - 1e-6)
    expect(beta.scale).toBeLessThanOrEqual(1.5 + 1e-6)
    const [, , w, h] = full.boxes.get('b00')!
    expect(w / h).toBeCloseTo(2, 0) // the real block mask (aspect 2:1)
    const [, , w1, h1] = full.boxes.get('b01')!
    expect(w1 / h1).toBeCloseTo(1, 5) // fallback ellipse mask, aspect 1
    for (const [x, y, bw, bh] of full.boxes.values()) {
      expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0)
      expect(x + bw).toBeLessThanOrEqual(full.W + 1e-6); expect(y + bh).toBeLessThanOrEqual(full.H + 1e-6)
    }
    const second = worker.layouts()[1]
    expect(second.refBase).toBeGreaterThan(0)
    expect(second.refBase).toBeCloseTo(full.base, 3)
    expect(second.fixedStage).toEqual([full.W, full.H])
    expect(loaded.sort()).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('only fetches the orders present in the list', async () => {
    const loaded: string[] = []
    const { client } = setup({ loaded })
    client.setList(entries.filter((e) => e.ord === 'Beta'), (f) => resolve(f).filter((c) => entries.find((e) => e.code === c)!.ord === 'Beta'))
    await client.get({}, 'narrow', 'even')
    expect(loaded).toEqual(['Beta'])
  })

  it('true mode requests the even layout first and passes its centres as targets', async () => {
    const { client, worker } = setup()
    client.setList(entries)
    const f = { order: 'Beta' }
    const t = await client.get(f, 'medium', 'true')
    const msgs = worker.layouts()
    const iEven = msgs.findIndex((m) => m.mode === 'even' && m.codes.length === 8)
    const iTrue = msgs.findIndex((m) => m.mode === 'true' && m.codes.length === 8)
    expect(iEven).toBeGreaterThanOrEqual(0)
    expect(iTrue).toBeGreaterThan(iEven)
    const even = await client.get(f, 'medium', 'even') // cached
    const m = msgs[iTrue]
    expect(m.fixedStage).toEqual([even.W, even.H])
    expect(m.targets).toBeInstanceOf(Float32Array)
    m.codes.forEach((c: string, i: number) => {
      const [x, y, w, h] = even.boxes.get(c)!
      expect(m.targets![2 * i]).toBeCloseTo(x + w / 2, 2)
      expect(m.targets![2 * i + 1]).toBeCloseTo(y + h / 2, 2)
    })
    expect(t.mode).toBe('true')
    expect(t.W).toBe(even.W)
    expect(t.boxes.size).toBe(8)
    expect(worker.layouts().filter((x) => x.mode === 'even' && x.codes.length === 24).length).toBe(1)
  })

  it('out-of-order worker replies never overwrite a newer request', async () => {
    const { client, worker } = setup({ manual: true })
    client.setList(entries)
    await Promise.resolve()
    const order: string[] = []
    const p1 = client.get({ order: 'Alpha' }, 'medium', 'even').then((r) => (order.push('1:' + r.key), r))
    const p2 = client.get({ order: 'Beta' }, 'medium', 'even').then((r) => (order.push('2:' + r.key), r))
    // release worker jobs one by one in arrival order until both are done
    let done = 0
    p1.then(() => done++); p2.then(() => done++)
    for (let i = 0; i < 60 && done < 2; i++) { worker.pending.shift()?.(); await new Promise((r) => setTimeout(r, 5)) }
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r2.key).toBe('medium|even|o:Beta')
    expect(r1).toBe(r2) // the older request resolves with the newer result
    expect(order[0]).toBe('2:medium|even|o:Beta')
    expect(order).toContain('1:medium|even|o:Beta')
  })

  it('setList clears the cache and aborts in-flight requests', async () => {
    const { client, worker } = setup({ manual: true })
    client.setList(entries)
    const old = client.get({}, 'medium', 'even')
    const caught = old.catch((e) => e)
    client.setList(entries)
    expect(((await caught) as Error).name).toBe('AbortError')
    // fresh list: computed again, not served from the old cache
    const p = client.get({}, 'medium', 'even')
    for (let i = 0; i < 40 && !(await Promise.race([p.then(() => true), new Promise((r) => setTimeout(() => r(false), 5))])); i++) worker.pending.shift()?.()
    const r: StateLayout = await p
    expect(r.boxes.size).toBe(24)
    const before = worker.layouts().length
    client.setList(entries)
    const p2 = client.get({}, 'medium', 'even')
    for (let i = 0; i < 40 && !(await Promise.race([p2.then(() => true), new Promise((r) => setTimeout(() => r(false), 5))])); i++) worker.pending.shift()?.()
    await p2
    expect(worker.layouts().length).toBeGreaterThan(before)
  })

  it('a get never waits behind queued prefetches', async () => {
    const { client, worker } = setup({ manual: true })
    client.setList(entries)
    await Promise.resolve()
    client.prefetch([{ order: 'Alpha' }, { order: 'Beta' }, { order: 'Gamma' }], 'medium')
    await until(() => worker.layouts().length >= 1) // prefetch's full collage is in flight
    const g = client.get({ order: 'Gamma' }, 'medium', 'even')
    let done = false
    g.then(() => (done = true))
    for (let i = 0; i < 40 && !done; i++) { worker.pending.shift()?.(); await new Promise((r) => setTimeout(r, 5)) }
    expect(done).toBe(true)
    const sent = worker.layouts().map((m) => m.codes.length)
    // full (24), then Gamma (8) right after it, ahead of Alpha and Beta
    expect(sent.slice(0, 2)).toEqual([24, 8])
  })

  it('prefetch warms the cache in even mode', async () => {
    const { client, worker } = setup()
    client.setList(entries)
    client.prefetch([{ order: 'Alpha' }], 'wide')
    await until(() => worker.layouts().length >= 2)
    await new Promise((r) => setTimeout(r, 30))
    const n = worker.layouts().length
    const a = await client.get({ order: 'Alpha' }, 'wide', 'even')
    expect(a.boxes.size).toBe(8)
    expect(worker.layouts().length).toBe(n)
  })
})
