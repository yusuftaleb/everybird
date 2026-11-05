// Main-thread side of the layout worker: per-state cache, full-collage-first ordering, true-mode chaining,
// latest-request-wins per layout class, and a priority queue (get > prefetch) feeding one job at a time.
// No React in here. Protocol: see layout.worker.ts.
//
// Amendments to the plan's signature:
//  - the client needs the codes visible under a Filter but stays independent of SpeciesIndex, so it takes a
//    `resolve(f) => codes` function: `createLayoutClient(worker?, { resolve })`, or per list via
//    `setList(entries, resolve)` (the second argument wins). Without either, only `{}` (every entry) works.
//  - StateLayout also carries `base` (the packer's base size; scale = base / full-collage base).
//  - `scale` is relative to the full collage of the SAME mode (true-mode states are scaled against the
//    true-mode full collage), and true-mode filtered states are searched around that base like even mode.
//  - Cache key is `${layout}|${mode}|${filterKey(f)}`; it is also StateLayout.key.
//
// Ordering rules:
//  - Per layout class and mode, the full list's layout is computed first; its trimmed stage and base fix
//    fixedStage / refBase for every filtered state (scale = base / fullBase). The true-mode full collage packs
//    in the even full collage's stage, so both modes share one full stage.
//  - Stage fits the group: a filtered state is packed in that full stage, then the worker trims its height
//    about the count (`fit`), so StateLayout.H of a filtered state is ≤ the full collage's H, W is the same.
//  - True mode: needs the even layout of the same state (targets = its box centres). True mode packs in the
//    full stage (untrimmed), so a filtered even state's centres are shifted back down by its own trim,
//    (full H - even H) / 2, into the full stage's coordinates; the true result is then trimmed on its own.
//  - get() superseded by a newer get() for the same layout class resolves with the newer get's result,
//    and never before it.
//  - setList clears the cache and invalidates all in-flight work: their promises REJECT with an AbortError
//    (unless a newer get() superseded them, in which case they follow that get as above). The UI ignores aborts.
//  - A new get() demotes the still-queued jobs of earlier gets for its layout class to prefetch priority (they
//    still warm the cache), so the newest request runs next.
//  - The cache is an LRU (default 300 states); settled full-collage entries are never evicted.
//  - worker.onerror / onmessageerror reject in-flight and queued work; a setList error reply is remembered and
//    rejects every get() of that list.
//  - A get() never waits behind queued prefetches (only behind the single job already on the worker); a get
//    also bumps the priority of anything it depends on that is still queued.
import { filterKey, type Filter } from '@/lib/list/filters'
import type { Box } from './pack'
import type { LayoutName, ListEntryMsg, WorkerReply, WorkerRequest } from './layout.worker'

export type StateLayout = {
  key: string
  layout: LayoutName
  mode: 'even' | 'true'
  W: number
  H: number
  boxes: Map<string, Box>
  scale: number // base / full-collage base
  base: number
}
export type LayoutClient = {
  setList(entries: ListEntryMsg[], resolve?: (f: Filter) => string[]): void
  get(f: Filter, layout: LayoutName, mode: 'even' | 'true'): Promise<StateLayout>
  prefetch(fs: Filter[], layout: LayoutName): void
}
type Mode = 'even' | 'true'

const HIGH = 2, LOW = 1
type Job = { prio: number; msg: WorkerRequest | null; resolve: (r: WorkerReply) => void; reject: (e: unknown) => void; epoch: number }
type Entry = { promise: Promise<StateLayout>; prio: number; job?: Job; deps: Entry[]; done: boolean; full: boolean }

const abortError = () => {
  const e = new Error('layout request aborted: the list changed')
  e.name = 'AbortError'
  return e
}
const idle = (fn: () => void) => {
  const g = globalThis as { requestIdleCallback?: (f: () => void) => number }
  if (g.requestIdleCallback) g.requestIdleCallback(fn)
  else setTimeout(fn, 0)
}

export const CACHE_CAP = 300

export function createLayoutClient(worker?: Worker, opts: { resolve?: (f: Filter) => string[]; cacheCap?: number } = {}): LayoutClient {
  const cap = opts.cacheCap ?? CACHE_CAP
  const w: Worker = worker ?? new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' })
  let epoch = 0
  let hasList = false
  let allCodes: string[] = []
  let resolveFn: ((f: Filter) => string[]) | undefined = opts.resolve
  let cache = new Map<string, Entry>()
  let nextId = 1
  const queue: Job[] = []
  const inflight = new Map<number, Job>()
  let busy = false
  let listError: Error | null = null
  const getEntries: Record<string, Entry[]> = {}
  const seq: Record<string, number> = {}
  const latest: Record<string, Promise<StateLayout>> = {}

  const codesFor = (f: Filter): string[] => {
    if (resolveFn) return resolveFn(f)
    if (filterKey(f) === '') return allCodes
    throw new Error('layout client has no resolve(filter) function')
  }

  // --- job queue: one job on the worker at a time, highest priority first, FIFO within a priority ---
  function pump() {
    if (busy || !queue.length) return
    let best = 0
    for (let i = 1; i < queue.length; i++) if (queue[i].prio > queue[best].prio) best = i
    const [job] = queue.splice(best, 1)
    if (listError && job.epoch === epoch && job.msg?.type === 'layout') { // the list never loaded
      job.msg = null
      job.reject(listError)
      return pump()
    }
    busy = true
    inflight.set(job.msg!.id, job)
    w.postMessage(job.msg)
  }
  w.onmessage = (e: MessageEvent<WorkerReply>) => {
    const r = e.data
    const job = inflight.get(r.id)
    if (!job) return
    inflight.delete(r.id)
    job.msg = null // drop the request (it can hold a targets array)
    if (job.epoch !== epoch) job.reject(abortError())
    else if (r.type === 'error') job.reject(new Error(r.message))
    else job.resolve(r)
    // Let the settled job's dependents enqueue (a few microtask hops) before choosing, so priority applies.
    // `busy` stays set until then, so enqueueing in between cannot send a low-priority job first.
    setTimeout(() => { if (!inflight.size) { busy = false; pump() } }, 0)
  }
  function failAll(e: Error) {
    const jobs = [...inflight.values(), ...queue.splice(0)]
    inflight.clear()
    busy = false
    jobs.forEach((j) => { j.msg = null; j.reject(e) })
  }
  w.onerror = (ev) => failAll(new Error(`layout worker failed: ${(ev as ErrorEvent)?.message ?? 'error'}`))
  w.onmessageerror = () => failAll(new Error('layout worker sent an unreadable message'))
  function send(msg: Omit<Extract<WorkerRequest, { type: 'layout' }>, 'id'>, entry: Entry): Promise<WorkerReply> {
    return new Promise((resolve, reject) => {
      const job: Job = { prio: entry.prio, msg: { ...msg, id: nextId++ }, resolve, reject, epoch }
      entry.job = job
      queue.push(job)
      pump()
    })
  }
  function demote(entry: Entry) {
    entry.prio = LOW
    if (entry.job && queue.includes(entry.job)) entry.job.prio = LOW
    entry.deps.forEach(demote)
  }
  function bump(entry: Entry, prio: number) {
    if (entry.prio >= prio) return
    entry.prio = prio
    if (entry.job) entry.job.prio = prio
    entry.deps.forEach((d) => bump(d, prio))
  }

  // --- states ---
  function ensure(f: Filter, layout: LayoutName, mode: Mode, prio: number): Entry {
    const key = `${layout}|${mode}|${filterKey(f)}`
    const hit = cache.get(key)
    if (hit) { bump(hit, prio); cache.delete(key); cache.set(key, hit); return hit } // refresh LRU position
    const my = epoch
    const isFull = filterKey(f) === ''
    const entry: Entry = { prio, deps: [], done: false, full: isFull, promise: undefined as unknown as Promise<StateLayout> }
    cache.set(key, entry)
    entry.promise = (async () => {
      // Dependencies are registered synchronously (before the first await) so bump() can reach them.
      const evenE = mode === 'true' ? ensure(f, layout, 'even', entry.prio) : undefined
      const fullE = isFull ? undefined : ensure({}, layout, mode, entry.prio)
      if (evenE) entry.deps.push(evenE)
      if (fullE) entry.deps.push(fullE)
      const [even, full] = await Promise.all([evenE?.promise, fullE?.promise])
      if (my !== epoch) throw abortError()
      if (listError) throw listError
      const codes = codesFor(f)
      let targets: Float32Array | undefined
      // Fixed stage: the full collage's (untrimmed) stage; for the true-mode full collage, the even one's.
      const stage = full ?? even
      if (even) {
        // even's boxes sit on its own fitted stage (centred on the count): move them into the stage packed in
        const dx = (stage!.W - even.W) / 2, dy = (stage!.H - even.H) / 2
        targets = new Float32Array(codes.length * 2)
        codes.forEach((c, i) => {
          const b = even.boxes.get(c)
          targets![2 * i] = b ? b[0] + b[2] / 2 + dx : stage!.W / 2
          targets![2 * i + 1] = b ? b[1] + b[3] / 2 + dy : stage!.H / 2
        })
      }
      const reply = await send({
        type: 'layout', key, codes, layout, mode,
        refBase: full?.base, fixedStage: stage ? [stage.W, stage.H] : undefined, targets, fit: !isFull,
      }, entry)
      if (reply.type !== 'result') throw new Error('unexpected worker reply')
      const boxes = new Map<string, Box>()
      reply.codes.forEach((c, i) => boxes.set(c, [reply.boxes[4 * i], reply.boxes[4 * i + 1], reply.boxes[4 * i + 2], reply.boxes[4 * i + 3]]))
      const fullBase = full ? full.base : reply.base
      entry.done = true
      entry.deps = []
      entry.job = undefined
      return { key, layout, mode, W: reply.W, H: reply.H, boxes, base: reply.base, scale: fullBase ? reply.base / fullBase : 1 }
    })()
    entry.promise.catch(() => { if (cache.get(key) === entry) cache.delete(key) }) // failures can be retried
    for (const [k, e] of cache) { // LRU cap: oldest settled non-full entry goes first
      if (cache.size <= cap) break
      if (e.done && !e.full) cache.delete(k)
    }
    return entry
  }

  return {
    setList(entries, resolve) {
      epoch++
      cache = new Map()
      const aborted = queue.splice(0)
      aborted.forEach((j) => j.reject(abortError()))
      // jobs already on the worker finish there; their replies are rejected as stale in onmessage
      listError = null
      for (const k of Object.keys(getEntries)) delete getEntries[k]
      resolveFn = resolve ?? opts.resolve
      allCodes = entries.map((e) => e.code)
      hasList = true
      const myEpoch = epoch
      const job: Job = { prio: HIGH, msg: { type: 'setList', id: nextId++, entries }, resolve: () => {}, reject: (e) => { if (epoch === myEpoch) listError = e instanceof Error ? e : new Error(String(e)) }, epoch }
      queue.unshift(job)
      pump()
    },

    get(f, layout, mode) {
      if (!hasList) return Promise.reject(new Error('setList() must be called before get()'))
      const tok = (seq[layout] = (seq[layout] ?? 0) + 1)
      const stale = () => tok !== seq[layout]
      // The newest request runs next: earlier gets' queued jobs drop to prefetch priority (they still cache).
      ;(getEntries[layout] ?? []).forEach(demote)
      const entry = ensure(f, layout, mode, HIGH)
      getEntries[layout] = [entry]
      const p = entry.promise.then(
        (r) => (stale() ? latest[layout] : r),
        (e) => { if (stale()) return latest[layout]; throw e },
      )
      latest[layout] = p
      return p
    },

    prefetch(fs, layout) {
      const my = epoch
      idle(() => {
        if (my !== epoch) return
        for (const f of fs) ensure(f, layout, 'even', LOW).promise.catch(() => {})
      })
    },
  }
}
