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

function setup(opts: { manual?: boolean; loaded?: string[]; failOrder?: string; cacheCap?: number } = {}) {
  const handler = createLayoutHandler(async (order) => {
    opts.loaded?.push(order)
    if (order === opts.failOrder) throw new Error('boom')
    return (order === 'Alpha' ? { b00: block() } : {}) as MaskTable
  })
  const worker = {
    log: [] as WorkerRequest[],
    pending: [] as (() => void)[],
    onmessage: null as null | ((e: { data: WorkerReply }) => void),
    onerror: null as null | ((e: { message: string }) => void),
    onmessageerror: null as null | (() => void),
    postMessage(msg: WorkerRequest) {
      this.log.push(msg)
      const run = async () => this.onmessage?.({ data: await handler(msg) })
      if (opts.manual) this.pending.push(() => void run())
      else setTimeout(() => void run(), 0)
    },
    layouts() { return this.log.filter((m): m is LayoutMsg => m.type === 'layout') },
  }
  const client = createLayoutClient(worker as unknown as Worker, { resolve, cacheCap: opts.cacheCap })
  return { worker, client }
}
const until = async (cond: () => boolean) => { for (let i = 0; i < 400 && !cond(); i++) await new Promise((r) => setTimeout(r, 5)) }

describe('layout client', () => {
  it('refilter keeps the full collage and re-resolves filtered states with the new function', async () => {
    const { client, worker } = setup()
    client.setList(entries)
    const full = await client.get({}, 'medium', 'even')
    const beta = await client.get({ order: 'Beta' }, 'medium', 'even')
    expect(beta.boxes.size).toBe(8)
    const n = worker.layouts().length
    client.refilter((f) => entries.filter((e) => !f.order || (e.ord === f.order && e.code !== 'b01')).map((e) => e.code))
    expect(await client.get({}, 'medium', 'even')).toBe(full) // no re-pack
    expect(worker.layouts().length).toBe(n)
    const beta2 = await client.get({ order: 'Beta' }, 'medium', 'even')
    expect(worker.layouts().length).toBe(n + 1)
    expect(beta2.boxes.size).toBe(7)
    expect(beta2.boxes.has('b01')).toBe(false)
  })

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
    expect(beta.H).toBeLessThanOrEqual(full.H) // the stage fits the group (packed in the full stage, then trimmed)
    expect(beta.scale).toBeGreaterThanOrEqual(0.7 - 1e-6)
    expect(beta.scale).toBeLessThanOrEqual(1.5 + 1e-6)
    const [, , w, h] = full.boxes.get('b00')!
    expect(w / h).toBeCloseTo(2, 0) // the real block mask (aspect 2:1)
    const [, , w1, h1] = full.boxes.get('b01')!
    expect(w1 / h1).toBeCloseTo(1, 3) // fallback ellipse mask, aspect 1
    for (const [x, y, bw, bh] of full.boxes.values()) {
      expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0)
      expect(x + bw).toBeLessThanOrEqual(full.W + 1e-6); expect(y + bh).toBeLessThanOrEqual(full.H + 1e-6)
    }
    const second = worker.layouts()[1]
    expect(second.refBase).toBeGreaterThan(0)
    expect(second.refBase).toBeCloseTo(full.base, 3)
    expect(second.fixedStage).toEqual([full.W, full.H])
    expect(second.fit).toBe(true)
    expect(worker.layouts()[0].fit).toBeFalsy() // the full collage is never fitted
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
    const full = await client.get({}, 'medium', 'even') // cached
    const m = msgs[iTrue]
    // packed in the untrimmed full stage, so the even state's (trimmed) centres go back into its coordinates
    expect(m.fixedStage).toEqual([full.W, full.H])
    expect(m.fit).toBe(true)
    const off = (full.H - even.H) / 2
    expect(m.targets).toBeInstanceOf(Float32Array)
    m.codes.forEach((c: string, i: number) => {
      const [x, y, w, h] = even.boxes.get(c)!
      expect(Math.abs(m.targets![2 * i] - (x + w / 2))).toBeLessThan(1e-3)
      expect(Math.abs(m.targets![2 * i + 1] - (y + h / 2 + off))).toBeLessThan(1e-3)
    })
    expect(t.mode).toBe('true')
    expect(t.W).toBe(even.W)
    expect(t.H).toBeLessThanOrEqual(full.H)
    expect(t.boxes.size).toBe(8)
    expect(worker.layouts().filter((x) => x.mode === 'even' && x.codes.length === 24).length).toBe(1)
  })

  const long = (b: [number, number, number, number]) => Math.max(b[2], b[3])
  // Families for the size tests: 'solo' is the heaviest bird alone, 'pair' two light birds.
  const famResolve = (f: Filter) =>
    f.family === 'solo' ? ['b23'] : f.family === 'pair' ? ['b02', 'b05'] : resolve(f)

  it('filtered single heavy bird keeps its full-collage size', async () => {
    const { client } = setup()
    client.setList(entries, famResolve)
    for (const layout of ['wide', 'medium', 'narrow'] as const) {
      for (const mode of ['even', 'true'] as const) {
        const full = await client.get({}, layout, mode)
        const solo = await client.get({ family: 'solo' }, layout, mode)
        const k = long(solo.boxes.get('b23')!) / long(full.boxes.get('b23')!)
        expect(k, `${layout} ${mode}`).toBeGreaterThanOrEqual(0.7 - 1e-3)
        expect(k, `${layout} ${mode}`).toBeLessThanOrEqual(1.5 + 1e-3)
      }
    }
  })

  it('relative sizes follow mass across states', async () => {
    const { client } = setup()
    client.setList(entries, famResolve)
    for (const mode of ['even', 'true'] as const) {
      const full = await client.get({}, 'medium', mode)
      for (const f of [{ order: 'Beta' }, { family: 'pair' }]) {
        const st = await client.get(f, 'medium', mode)
        const codes = [...st.boxes.keys()]
        const [a, b] = [codes[0], codes[codes.length - 1]]
        const rFull = long(full.boxes.get(a)!) / long(full.boxes.get(b)!)
        const rState = long(st.boxes.get(a)!) / long(st.boxes.get(b)!)
        expect(Math.abs(rState / rFull - 1)).toBeLessThanOrEqual(0.05)
        // every bird is drawn at its full-collage size times the state's scale
        for (const c of codes) expect(long(st.boxes.get(c)!) / long(full.boxes.get(c)!)).toBeCloseTo(st.scale, 3)
      }
    }
  })

  it('filtered stage height is symmetric about the count and ≤ full height', async () => {
    const { client } = setup()
    client.setList(entries, famResolve)
    for (const layout of ['wide', 'medium', 'narrow'] as const) {
      for (const mode of ['even', 'true'] as const) {
        const full = await client.get({}, layout, mode)
        const st = await client.get({ family: 'pair' }, layout, mode)
        expect(st.W, `${layout} ${mode}`).toBe(full.W)
        expect(st.H, `${layout} ${mode}`).toBeLessThan(full.H)
        const cy = st.H / 2
        let ext = 0
        for (const [x, y, w, h] of st.boxes.values()) {
          expect(x).toBeGreaterThanOrEqual(0); expect(x + w).toBeLessThanOrEqual(st.W + 1e-6)
          expect(y).toBeGreaterThanOrEqual(-1e-6); expect(y + h).toBeLessThanOrEqual(st.H + 1e-6)
          ext = Math.max(ext, cy - y, y + h - cy)
        }
        // the hole (count) is at H/2: the group's extent about it decides the height, plus the margin
        expect(cy, `${layout} ${mode}`).toBeGreaterThanOrEqual(ext)
        expect(cy, `${layout} ${mode}`).toBeLessThanOrEqual(Math.max(ext, 0.62 * 64 + 12 + 24) + 11)
      }
    }
    // the full collage keeps its stage
    const full = await client.get({}, 'medium', 'even')
    const trueFull = await client.get({}, 'medium', 'true')
    expect([trueFull.W, trueFull.H]).toEqual([full.W, full.H])
  })

  it('true-size morph keeps birds near their even positions on screen (fitted stages)', async () => {
    const { client, worker } = setup()
    client.setList(entries, famResolve)
    for (const layout of ['wide', 'medium', 'narrow'] as const) {
      for (const f of [{ order: 'Alpha' }, { family: 'pair' }]) {
        const even = await client.get(f, layout, 'even')
        const tr = await client.get(f, layout, 'true')
        const full = await client.get({}, layout, 'even')
        if (f.family === 'pair') {
          // the true pack's targets are the even centres in the full stage: shifted down by even's own trim
          const m = worker.layouts().find((x) => x.key === tr.key)!
          const off = (full.H - even.H) / 2
          expect(off).toBeGreaterThan(0)
          expect(m.fixedStage).toEqual([full.W, full.H])
          m.codes.forEach((c, i) => {
            const [, y, , h] = even.boxes.get(c)!
            expect(Math.abs(m.targets![2 * i + 1] - (y + h / 2 + off))).toBeLessThan(1e-3)
          })
        }
        // both stages are centred on the count: compare centre-relative positions
        const d = [...even.boxes].map(([c, [x, y, w, h]]) => {
          const [tx, ty, tw, th] = tr.boxes.get(c)!
          return Math.hypot(tx + tw / 2 - (x + w / 2), ty + th / 2 - tr.H / 2 - (y + h / 2 - even.H / 2))
        }).sort((a, b) => a - b)
        expect(d[Math.floor(d.length / 2)] / even.W, `${layout} ${JSON.stringify(f)}`).toBeLessThanOrEqual(0.2)
      }
    }
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
    const keys = worker.layouts().map((m) => m.key)
    // full first, then Gamma right after it, ahead of the queued Alpha and Beta prefetches
    expect(keys[0]).toBe('medium|even|')
    expect(keys[1]).toBe('medium|even|o:Gamma')
    for (const k of ['o:Alpha', 'o:Beta']) {
      const i = keys.indexOf(`medium|even|${k}`)
      expect(i === -1 || i > 1).toBe(true)
    }
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

  // Release held worker jobs one at a time until the predicate holds.
  const drain = async (worker: { pending: (() => void)[] }, cond: () => boolean) => {
    for (let i = 0; i < 80 && !cond(); i++) { worker.pending.shift()?.(); await new Promise((r) => setTimeout(r, 5)) }
  }

  it('the newest of several rapid gets runs next, ahead of stale ones', async () => {
    const { client, worker } = setup({ manual: true })
    client.setList(entries)
    const full = client.get({}, 'medium', 'even')
    let fullDone = false
    void full.then(() => (fullDone = true))
    await drain(worker, () => fullDone)
    await full
    const a = client.get({ order: 'Alpha' }, 'medium', 'even') // goes to the worker and stays in flight
    await until(() => worker.layouts().length === 2)
    const b = client.get({ order: 'Beta' }, 'medium', 'even')
    const c = client.get({ order: 'Gamma' }, 'medium', 'even')
    void a; void b
    worker.pending.shift()?.() // finish Alpha
    await until(() => worker.layouts().length === 3)
    expect(worker.layouts()[2].key).toBe('medium|even|o:Gamma')
    await drain(worker, () => worker.layouts().length === 4)
    expect(worker.layouts()[3].key).toBe('medium|even|o:Beta') // still computed, just later
    await c
  })

  it('a failed order file falls back to ellipse masks and the collage still lays out', async () => {
    const { client } = setup({ failOrder: 'Beta' })
    client.setList(entries)
    const full = await client.get({}, 'medium', 'even')
    expect(full.boxes.size).toBe(24)
    const [, , w, h] = full.boxes.get('b01')! // Beta species
    expect(w / h).toBeCloseTo(1, 3)
  })

  it('a worker error reply rejects the get, and a failed setList rejects every get', async () => {
    const fake = (failOn: 'layout' | 'setList') => {
      const w = {
        onmessage: null as null | ((e: { data: WorkerReply }) => void),
        postMessage(m: WorkerRequest) {
          const bad = m.type === failOn
          setTimeout(() => this.onmessage?.({ data: bad ? { type: 'error', id: m.id, message: 'nope' } : m.type === 'setList' ? { type: 'ready', id: m.id } : { type: 'error', id: m.id, message: 'x' } }), 0)
        },
      }
      return createLayoutClient(w as unknown as Worker, { resolve })
    }
    const c1 = fake('layout')
    c1.setList(entries)
    await expect(c1.get({}, 'medium', 'even')).rejects.toThrow('nope')
    const c2 = fake('setList')
    c2.setList(entries)
    await expect(c2.get({}, 'medium', 'even')).rejects.toThrow('nope')
  })

  it('a stale in-flight reply after setList is ignored', async () => {
    const { client, worker } = setup({ manual: true })
    client.setList(entries)
    const old = client.get({}, 'medium', 'even')
    const oldErr = old.catch((e) => e)
    await drain(worker, () => worker.layouts().length > 0) // the old layout job is now held in flight
    // old layout job is now in flight; swap the list for a 5-bird one
    const small = entries.slice(0, 5)
    client.setList(small, (f) => small.map((e) => e.code).filter(() => !f.order))
    const fresh = client.get({}, 'medium', 'even')
    await drain(worker, () => worker.pending.length === 0 && worker.layouts().length >= 2)
    await drain(worker, () => worker.pending.length === 0)
    const r = await fresh
    // the old get was superseded by the new list's get: it follows it, never the stale 24-bird reply
    expect(r.boxes.size).toBe(5)
    expect(await oldErr).toBe(r)
  })

  it('worker.onerror rejects in-flight and queued work and the client keeps working', async () => {
    const { client, worker } = setup({ manual: true })
    client.setList(entries)
    const p = client.get({}, 'medium', 'even')
    const err = p.catch((e) => e as Error)
    await drain(worker, () => worker.layouts().length > 0)
    worker.onerror?.({ message: 'crash' })
    expect(((await err) as Error).message).toContain('crash')
    const again = client.get({}, 'medium', 'even')
    await drain(worker, () => worker.layouts().length >= 2)
    await drain(worker, () => worker.pending.length === 0)
    expect((await again).boxes.size).toBe(24)
  })

  it('the cache is an LRU that never evicts the full collage', async () => {
    const { client, worker } = setup({ cacheCap: 3 })
    client.setList(entries)
    await client.get({}, 'medium', 'even')
    for (const fam of ['f1', 'f2', 'f3', 'f4']) await client.get({ family: fam }, 'medium', 'even')
    const n = worker.layouts().length
    expect(n).toBe(5)
    await client.get({ family: 'f4' }, 'medium', 'even') // newest: cached
    await client.get({}, 'medium', 'even') // full: never evicted
    expect(worker.layouts().length).toBe(n)
    await client.get({ family: 'f1' }, 'medium', 'even') // oldest: evicted, recomputed
    expect(worker.layouts().length).toBe(n + 1)
  })

  it('dispose terminates the worker and rejects pending work with an AbortError', async () => {
    const { client, worker } = setup({ manual: true })
    let terminated = 0
    ;(worker as unknown as { terminate: () => void }).terminate = () => { terminated++ }
    client.setList(entries)
    const p = client.get({}, 'medium', 'even')
    client.dispose()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(terminated).toBe(1)
    await expect(client.get({}, 'medium', 'even')).rejects.toThrow(/disposed/)
  })
})

describe('layout worker: image message', () => {
  it('packs the given birds at the asked aspect, without setList, and reuses loaded masks', async () => {
    const loaded: string[] = []
    const handle = createLayoutHandler(async (order) => {
      loaded.push(order)
      return (order === 'Alpha' ? { b00: block() } : {}) as MaskTable
    })
    const some = entries.slice(0, 9)
    const r = await handle({ type: 'image', id: 7, entries: some, aspect: 0.7 })
    expect(r.type).toBe('image')
    if (r.type !== 'image') return
    expect(r.id).toBe(7)
    expect(r.codes).toEqual(some.map((e) => e.code))
    expect(r.boxes.length).toBe(9 * 4)
    expect(r.W / r.H).toBeCloseTo(0.7, 1)
    // b00 has the 2:1 block mask, the others the round fallback
    expect(r.boxes[2] / r.boxes[3]).toBeCloseTo(2, 1)
    expect(r.boxes[6] / r.boxes[7]).toBeCloseTo(1, 1)
    await handle({ type: 'image', id: 8, entries: some, aspect: 1.2 })
    expect(loaded.sort()).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('an empty image request is an empty result', async () => {
    const handle = createLayoutHandler(async () => ({}))
    const r = await handle({ type: 'image', id: 1, entries: [], aspect: 1 })
    expect(r).toMatchObject({ type: 'image', id: 1, codes: [] })
  })
})
