// Print-only bitmap cache. Keys are the requested URLs, even when a 384 fallback is drawn.
// Until a print bitmap succeeds, probes are serial; three failures skip the tier for this instance.
// `release` is not reference-counted: it drops the URL for every caller at once. Release a URL only
// after its last use, with no `get` for it still pending. A pending `get` for a released URL rejects
// with a StickerReleased error, never an AbortError, so a release bug can't pass for a user cancel.
import { abortError } from './image'

type PrintStickerSource = { fetch: typeof fetch; decode: (b: Blob) => Promise<ImageBitmap> }
export type PrintStickers = {
  get(s: { url: string; fallback: string | null }, signal?: AbortSignal): Promise<ImageBitmap | null>
  release(url: string): void
  stats(): { soft: number; missing: number }
  dispose(): void
}

const LOAD_TIMEOUT_MS = 20_000 // fetch, response body and decode, per attempt
const RETRY_MS = 1_000
const PROBE_LIMIT = 3
type Entry = {
  controller: AbortController
  promise: Promise<ImageBitmap | null>
  bitmap: ImageBitmap | null
  done: boolean
  waiters: number
  released: boolean
}

function check(signal: AbortSignal) { if (signal.aborted) throw abortError() }

function releasedError(): Error {
  const error = new Error('print sticker released while loading')
  error.name = 'StickerReleased'
  return error
}

/** Stop waiting promptly even when the underlying source ignores cancellation. */
function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError())
  if (!signal) return promise
  return new Promise((resolve, reject) => {
    const onAbort = () => { cleanup(); reject(abortError()) }
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then((value) => { cleanup(); resolve(value) }, (error) => { cleanup(); reject(error) })
  })
}

async function pause(ms: number, signal: AbortSignal): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { await waitFor(new Promise<void>((resolve) => { timer = setTimeout(resolve, ms) }), signal) }
  finally { clearTimeout(timer) }
}

export function createPrintStickers(
  src: Partial<PrintStickerSource> = {},
  opts: { timeoutMs?: number; retryMs?: number } = {},
): PrintStickers {
  // Kept as plain functions and called without a receiver, so `window.fetch` or `createImageBitmap`
  // can be passed directly without an "Illegal invocation".
  const doFetch: typeof fetch = src.fetch ?? ((url, init) => fetch(url, init))
  const doDecode: PrintStickerSource['decode'] = src.decode ?? ((blob) => createImageBitmap(blob))
  const timeoutMs = opts.timeoutMs ?? LOAD_TIMEOUT_MS
  const retryMs = opts.retryMs ?? RETRY_MS
  const cache = new Map<string, Entry>()
  // A sticker can cross strip boundaries, be released, then be loaded again. Notes count URLs, not loads.
  const soft = new Set<string>(), missing = new Set<string>()
  let disposed = false, printHit = false, misses = 0
  let probe: Promise<void> | null = null

  function attempt(url: string, signal: AbortSignal): Promise<ImageBitmap> {
    check(signal)
    return new Promise((resolve, reject) => {
      const controller = new AbortController()
      let settled = false
      const finish = (error?: Error, bitmap?: ImageBitmap) => {
        if (settled) { bitmap?.close(); return }
        settled = true
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        if (error) { controller.abort(); reject(error) }
        else resolve(bitmap!)
      }
      const onAbort = () => finish(abortError())
      const timer = setTimeout(() => finish(new Error('print sticker timed out')), timeoutMs)
      signal.addEventListener('abort', onAbort, { once: true })
      void (async () => {
        try {
          const response = await doFetch(url, { mode: 'cors', signal: controller.signal })
          if (settled) return
          if (!response.ok) throw new Error(`print sticker HTTP ${response.status}`)
          const blob = await response.blob()
          if (settled) return
          finish(undefined, await doDecode(blob))
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)))
        }
      })()
    })
  }

  /** The lock covers fetch AND decode. An aborted probe does not count as a tier failure. */
  async function tryPrint(url: string, signal: AbortSignal): Promise<ImageBitmap | null> {
    while (!printHit && misses < PROBE_LIMIT) {
      check(signal)
      if (probe) { await waitFor(probe, signal); continue }
      let unlock!: () => void
      probe = new Promise<void>((resolve) => { unlock = resolve })
      try {
        const bitmap = await attempt(url, signal)
        printHit = true
        return bitmap
      } catch {
        check(signal)
        misses++
        return null
      } finally { probe = null; unlock() }
    }
    check(signal)
    if (!printHit) return null
    try { return await attempt(url, signal) }
    catch { check(signal); return null }
  }

  async function load(s: { url: string; fallback: string | null }, signal: AbortSignal): Promise<ImageBitmap | null> {
    let bitmap: ImageBitmap | null = null
    let fellBack = false
    if (s.fallback !== null) {
      bitmap = await tryPrint(s.url, signal)
      if (!bitmap) { check(signal); fellBack = true }
    }
    if (!bitmap) {
      const url = s.fallback ?? s.url
      try { bitmap = await attempt(url, signal) }
      catch {
        check(signal)
        await pause(retryMs, signal)
        try { bitmap = await attempt(url, signal) }
        catch { check(signal); missing.add(s.url) }
      }
    }
    // Cancellation can land after decode resolves but before this continuation stores the bitmap.
    if (signal.aborted) { bitmap?.close(); throw abortError() }
    // Soft means the 384 was drawn. A sticker that ends as an outline counts only as missing.
    if (bitmap && fellBack) soft.add(s.url)
    return bitmap
  }

  function release(url: string) {
    const entry = cache.get(url)
    if (!entry) return
    cache.delete(url)
    if (!disposed) entry.released = true
    entry.controller.abort()
    entry.bitmap?.close()
    entry.bitmap = null
  }

  return {
    async get(s, signal) {
      if (disposed || signal?.aborted) throw abortError()
      let entry = cache.get(s.url)
      if (!entry) {
        const controller = new AbortController()
        const created: Entry = {
          controller, bitmap: null, done: false, waiters: 0, released: false, promise: Promise.resolve(null),
        }
        created.promise = load(s, controller.signal).then((bitmap) => {
          created.done = true
          if (controller.signal.aborted) { bitmap?.close(); throw created.released ? releasedError() : abortError() }
          created.bitmap = bitmap
          return bitmap
        }, (error) => {
          created.done = true
          if (cache.get(s.url) === created) cache.delete(s.url)
          throw created.released ? releasedError() : error
        })
        entry = created
        cache.set(s.url, entry)
      }
      entry.waiters++
      try { return await waitFor(entry.promise, signal) }
      finally {
        entry.waiters--
        // Separate callers may share a URL. Only the last cancellation stops their shared load.
        if (!entry.done && entry.waiters === 0) {
          entry.controller.abort()
          if (cache.get(s.url) === entry) cache.delete(s.url)
        }
      }
    },
    release,
    stats: () => ({ soft: soft.size, missing: missing.size }),
    dispose() {
      disposed = true
      for (const url of cache.keys()) release(url)
    },
  }
}
