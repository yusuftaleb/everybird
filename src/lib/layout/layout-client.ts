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
//  - Cache key is `${layout}|${mode}|${filterKey(f)}`, the layout class marked `${layout}~oval` for Oval and `${layout}~free`
//    for Free (arrangement.ts: every state packed inside the stage's ellipse, or settled as Fit was before it filled the
//    rectangle, each with its own full collage first); it is also StateLayout.key.
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
//  - refilter(resolve?) is for a list whose codes and masses are unchanged but whose filters resolve differently
//    (new dates, places or trips): it keeps the full collages and drops every filtered state, which re-resolves
//    on its next get. Filtered work already under way finishes into the dropped entries (no one reads them again).
//  - setList clears the cache and invalidates all in-flight work: their promises REJECT with an AbortError
//    (unless a newer get() superseded them, in which case they follow that get as above). The UI ignores aborts.
//  - A new get() demotes the still-queued jobs of earlier gets for its layout class to prefetch priority (they
//    still warm the cache), so the newest request runs next.
//  - The cache is an LRU (default 300 states); settled full-collage entries are never evicted.
//  - worker.onerror / onmessageerror reject in-flight and queued work; a setList error reply is remembered and
//    rejects every get() of that list.
//  - A get() never waits behind queued prefetches (only behind the single job already on the worker); a get
//    also bumps the priority of anything it depends on that is still queued.
//
// The device's layout cache (`store`, layout-store.ts; the birder's own collage only): every state first looks itself up
// there and is packed only on a miss. Full collages are stored once packed, other states once a get() has asked for
// them (prefetches the birder never saw are not). The id is storeId's: the pack version, the species and masks files,
// the list (codes, masses, orders), the state's key and the codes its filter resolved to, so any change is a miss. A
// hit was packed from the same inputs by the same code, so it is the layout a fresh pack gives: it is shown as is,
// not packed again to check (that would hold the worker for seconds and every filter behind it). A result packed
// with fallback masks (a masks download failed) is never stored.
//
// Provisional (provisional.ts): a get() given `early` whose full collage misses the store and holds at least
// PROVISIONAL_FROM birds also starts a short-lived second worker for a quick one-pass full collage, handed to `early`
// unless the final one lands first. The final is packed exactly as without it.
import { filterKey, type Filter } from '@/lib/list/filters'
import type { Arrangement } from '@/lib/arrangement'
import type { Box } from './pack'
import type { LayoutName, ListEntryMsg, WorkerReply, WorkerRequest } from './layout.worker'
import type { MaskTable } from '../data-url'
import { DATA_FILES } from '../data-files'
import { hashText, type LayoutStore } from './layout-store'
import { PROVISIONAL_FROM } from './provisional'

/**
 * Bump when packing gives different layouts for the same inputs (pack.ts, grid.ts, count-box.ts, constants.ts, the
 * worker), so stored layouts miss. tests/layout-store.test.ts fingerprints the packer's output per version.
 */
export const PACK_VERSION = 1

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
  /** `masks`: every entry's mask by order then code (data-url.ts masksInHand), so the worker needn't fetch the masks file. */
  setList(entries: ListEntryMsg[], resolve?: (f: Filter) => string[], masks?: Record<string, MaskTable>): void
  /** Same entries, new filter resolution: keeps the full collages, drops the filtered states (see the header). */
  refilter(resolve?: (f: Filter) => string[]): void
  /** `arrangement`: Fit (the default), Oval (packed inside the stage's ellipse) or Free (arrangement.ts). */
  get(f: Filter, layout: LayoutName, mode: 'even' | 'true', arrangement?: Arrangement, early?: (l: StateLayout) => void): Promise<StateLayout>
  prefetch(fs: Filter[], layout: LayoutName, arrangement?: Arrangement): void
  /** Terminate the worker; in-flight and queued work rejects with an AbortError, later calls reject. */
  dispose(): void
}
type Mode = 'even' | 'true'

const HIGH = 2, LOW = 1
type Job = { prio: number; msg: WorkerRequest | null; resolve: (r: WorkerReply) => void; reject: (e: unknown) => void; epoch: number }
type Entry = {
  promise: Promise<StateLayout>; prio: number; job?: Job; deps: Entry[]; done: boolean; full: boolean
  /** A get() asked for it; `save` stores it once it is packed (and clears itself). */
  seen?: boolean; save?: () => void
  /** Full collages: true once the store missed and it goes to the worker; `quick` the provisional, started on demand. */
  missed?: Promise<boolean>; quick?: Promise<StateLayout | null>; endQuick?: () => void
}

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

const CACHE_CAP = 300
/** A state's key without its filter part: "wide|even|", "wide~oval|true|". */
const fullKey = (layout: LayoutName, mode: Mode, arr: Arrangement) => `${layout}${arr === 'packed' ? '' : `~${arr}`}|${mode}|`

const newWorker = () => new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' })
let spare: Worker | null = null

/**
 * Start a layout worker and its masks download before any collage asks for one (`/` as soon as storage says the device
 * holds a list, EverybirdProvider), so they overlap the species download. The next createLayoutClient() takes it.
 */
export function warmLayoutWorker(): void {
  if (spare || typeof Worker === 'undefined') return
  spare = newWorker()
  spare.postMessage({ type: 'warm' })
}

/** A stored state's id: what its layout depends on (see the header). */
export function storeId(list: string, key: string, codes: string[]): string {
  return `${PACK_VERSION}|${DATA_FILES['species.v1.json']}|${DATA_FILES['masks.v3.bin']}|${list}|${key}|${hashText(codes.join(','))}`
}

export function createLayoutClient(
  worker?: Worker,
  opts: { resolve?: (f: Filter) => string[]; cacheCap?: number; store?: LayoutStore; spawn?: () => Worker } = {},
): LayoutClient {
  const { store } = opts
  const spawn = opts.spawn ?? newWorker
  const cap = opts.cacheCap ?? CACHE_CAP
  const w: Worker = worker ?? spare ?? newWorker()
  if (w === spare) spare = null
  let epoch = 0
  let hasList = false
  let allCodes: string[] = []
  let listEntries: ListEntryMsg[] = []
  let listId = ''
  const quicks = new Set<() => void>() // provisional workers still running: ended by setList and dispose
  let resolveFn: ((f: Filter) => string[]) | undefined = opts.resolve
  let cache = new Map<string, Entry>()
  let nextId = 1
  const queue: Job[] = []
  const inflight = new Map<number, Job>()
  let busy = false
  let listError: Error | null = null
  let disposed = false
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
  function ensure(f: Filter, layout: LayoutName, mode: Mode, prio: number, arr: Arrangement = 'packed'): Entry {
    const key = fullKey(layout, mode, arr) + filterKey(f)
    const hit = cache.get(key)
    if (hit) { bump(hit, prio); cache.delete(key); cache.set(key, hit); return hit } // refresh LRU position
    const my = epoch
    const isFull = filterKey(f) === ''
    const entry: Entry = { prio, deps: [], done: false, full: isFull, promise: undefined as unknown as Promise<StateLayout> }
    let missed: (m: boolean) => void = () => {}
    if (isFull && mode === 'even') entry.missed = new Promise((r) => { missed = r })
    cache.set(key, entry)
    entry.promise = (async () => {
      // The store first: a stored state needs none of its dependencies (a stored true-mode or filtered state shows
      // without its even or full collage being packed). Its codes are those of the list in hand (refilter drops it).
      const first = store && listId ? codesFor(f) : undefined
      const id = first ? storeId(listId, key, first) : ''
      if (first) {
        const hit = await store!.get(id)
        if (my !== epoch) throw abortError()
        if (hit && hit.key === key && hit.boxes.size === first.length && first.every((c) => hit.boxes.has(c))) {
          missed(false)
          entry.done = true
          return hit
        }
      }
      missed(true)
      // Dependencies are registered synchronously after the lookup (before the next await) so bump() can reach them.
      const evenE = mode === 'true' ? ensure(f, layout, 'even', entry.prio, arr) : undefined
      const fullE = isFull ? undefined : ensure({}, layout, mode, entry.prio, arr)
      if (evenE) entry.deps.push(evenE)
      if (fullE) entry.deps.push(fullE)
      const [even, full] = await Promise.all([evenE?.promise, fullE?.promise])
      if (my !== epoch) throw abortError()
      if (listError) throw listError
      const codes = first ?? codesFor(f)
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
        refBase: full?.base, fixedStage: stage ? [stage.W, stage.H] : undefined, targets, fit: !isFull, ...(arr === 'oval' ? { oval: true } : arr === 'free' ? { free: true } : {}),
      }, entry)
      if (reply.type !== 'result') throw new Error('unexpected worker reply')
      const boxes = new Map<string, Box>()
      reply.codes.forEach((c, i) => boxes.set(c, [reply.boxes[4 * i], reply.boxes[4 * i + 1], reply.boxes[4 * i + 2], reply.boxes[4 * i + 3]]))
      const fullBase = full ? full.base : reply.base
      entry.done = true
      entry.deps = []
      entry.job = undefined
      entry.endQuick?.()
      const result: StateLayout = { key, layout, mode, W: reply.W, H: reply.H, boxes, base: reply.base, scale: fullBase ? reply.base / fullBase : 1 }
      if (id && !reply.degraded) {
        entry.save = () => { entry.save = undefined; store!.put(id, result) }
        if (entry.full || entry.seen) entry.save()
      }
      return result
    })()
    entry.promise.catch(() => {
      missed(false)
      entry.endQuick?.()
      if (cache.get(key) === entry) cache.delete(key) // failures can be retried
    })
    for (const [k, e] of cache) { // LRU cap: oldest settled non-full entry goes first
      if (cache.size <= cap) break
      if (e.done && !e.full) cache.delete(k)
    }
    return entry
  }

  // The provisional full collage for a full entry that missed the store (see the header), started once.
  function quick(entry: Entry, layout: LayoutName, arr: Arrangement): Promise<StateLayout | null> {
    const my = epoch
    const entries = listEntries
    return (entry.quick ??= entry.missed!.then((miss) => {
      if (!miss || entry.done || my !== epoch || disposed || entries.length < PROVISIONAL_FROM || (typeof Worker === 'undefined' && !opts.spawn)) return null
      const q = spawn()
      return new Promise<StateLayout | null>((res) => {
        const end = (l: StateLayout | null) => { if (entry.endQuick) quicks.delete(entry.endQuick); entry.endQuick = undefined; q.terminate(); res(l) }
        entry.endQuick = () => end(null)
        quicks.add(entry.endQuick)
        q.onmessage = (e: MessageEvent<WorkerReply>) => {
          const r = e.data
          if (r.type !== 'result' || entry.done || my !== epoch) return end(null)
          const boxes = new Map<string, Box>()
          r.codes.forEach((c, i) => boxes.set(c, [r.boxes[4 * i], r.boxes[4 * i + 1], r.boxes[4 * i + 2], r.boxes[4 * i + 3]]))
          end({ key: r.key, layout, mode: 'even', W: r.W, H: r.H, boxes, base: r.base, scale: 1 })
        }
        q.onerror = () => end(null)
        q.postMessage({ type: 'provisional', id: 0, key: fullKey(layout, 'even', arr), entries, layout, ...(arr === 'oval' ? { oval: true } : arr === 'free' ? { free: true } : {}) } satisfies WorkerRequest)
      })
    }))
  }

  return {
    setList(entries, resolve, masks) {
      if (disposed) return
      epoch++
      cache = new Map()
      ;[...quicks].forEach((end) => end())
      const aborted = queue.splice(0)
      aborted.forEach((j) => j.reject(abortError()))
      // jobs already on the worker finish there; their replies are rejected as stale in onmessage
      listError = null
      for (const k of Object.keys(getEntries)) delete getEntries[k]
      resolveFn = resolve ?? opts.resolve
      allCodes = entries.map((e) => e.code)
      listEntries = entries
      // The landing sample (masks handed over) has its seed layouts and is never stored.
      listId = store && !masks ? hashText(entries.map((e) => `${e.code}:${e.mass}:${e.ord}`).join(',')) : ''
      hasList = true
      const myEpoch = epoch
      const job: Job = { prio: HIGH, msg: { type: 'setList', id: nextId++, entries, ...(masks ? { masks } : {}) }, resolve: () => {}, reject: (e) => { if (epoch === myEpoch) listError = e instanceof Error ? e : new Error(String(e)) }, epoch }
      queue.unshift(job)
      pump()
    },

    refilter(resolve) {
      if (disposed) return
      if (resolve) resolveFn = resolve
      for (const [k, e] of cache) if (!e.full) cache.delete(k)
    },

    get(f, layout, mode, arr = 'packed', early) {
      if (disposed) return Promise.reject(new Error('layout client disposed'))
      if (!hasList) return Promise.reject(new Error('setList() must be called before get()'))
      const tok = (seq[layout] = (seq[layout] ?? 0) + 1)
      const stale = () => tok !== seq[layout]
      // The newest request runs next: earlier gets' queued jobs drop to prefetch priority (they still cache).
      ;(getEntries[layout] ?? []).forEach(demote)
      const entry = ensure(f, layout, mode, HIGH, arr)
      entry.seen = true
      entry.save?.()
      getEntries[layout] = [entry]
      const fullE = early && cache.get(fullKey(layout, 'even', arr))
      if (fullE?.missed && !fullE.done) void quick(fullE, layout, arr).then((l) => { if (l && !stale() && !entry.done) early!(l) })
      const p = entry.promise.then(
        (r) => (stale() ? latest[layout] : r),
        (e) => { if (stale()) return latest[layout]; throw e },
      )
      latest[layout] = p
      return p
    },

    prefetch(fs, layout, arr = 'packed') {
      const my = epoch
      idle(() => {
        if (my !== epoch || disposed) return
        for (const f of fs) ensure(f, layout, 'even', LOW, arr).promise.catch(() => {})
      })
    },

    dispose() {
      if (disposed) return
      disposed = true
      epoch++
      cache = new Map()
      ;[...quicks].forEach((end) => end())
      failAll(abortError())
      w.terminate()
    },
  }
}
