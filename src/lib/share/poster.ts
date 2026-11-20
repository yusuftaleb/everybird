// The print poster, made strip by strip. prepareCard lays it out once, in design units. Each strip of whole device
// rows is painted into one reused canvas under setTransform(k, 0, 0, k, 0, -y), read back, and its pixels are
// transferred to the print worker, which deflates them into one zlib stream for both the PNG and the PDF.
//
// Stickers: each URL is fetched once, for the first strip that draws it, and released right after the last strip that
// draws it, both decided by tileInRange (the test paintCard culls with), so no tile is drawn without its image and no
// URL is released with a get still pending. At most 12 gets run at once, and only for the current and the next strip,
// so a long list never holds every bitmap at once.
//
// Strips: at most STRIP_AREA px and STRIP_DESIGN_ROWS design rows each (A4 138 device rows in 13 strips, A3 195 in 13,
// A2 276 in 13, A1 298 in 17), so two strips stay a small part of the card. Never a canvas over IOS_CANVAS_AREA: the
// strip canvas is width × rows, capped by it.
//
// An abort disposes the encoder at once, so a wait on it (backpressure, end) rejects even if the worker never replies.
//
// The Tree's and the Map's posters (makeViewPoster) have no stickers of their own to stream: their image is drawn whole
// (renderTreeImage, renderMapImage, at viewPosterScale) and cut into the same strips for the same encoder.
import { abortError, paintCard, prepareCard, tileInRange, type CardFormat, type PaintRange, type ShareImageOpts, type Tile } from './image'
import { IOS_CANVAS_AREA, STRIP_AREA, STRIP_DESIGN_ROWS, printPt, printPx, printScale, stripRanges, viewPosterScale, type PrintSize } from './print'
import { createPrintStickers, type PrintStickers } from './print-stickers'
import type { PrintWorkerReply, PrintWorkerRequest } from './print.worker'

/** `landscape`: the poster is wider than it is tall (the A size's sides swapped; print.ts printPx, printPt, printDesign). */
export type PosterOpts = Omit<ShareImageOpts, 'format' | 'printSize' | 'signal'> & { size: PrintSize; landscape?: boolean; signal?: AbortSignal }

export type Poster = {
  size: PrintSize
  /** Landscape: the file's pixels and page are the A size's, swapped. */
  landscape: boolean
  /** The compressed image data, without either file's wrapper. */
  bytes: number
  /** Stickers drawn from their 384 file because the 1024 one failed. */
  soft: number
  /** Stickers drawn as the outline because every attempt failed. */
  missing: number
  /** Names were asked for (showNames) but the poster has none: they didn't fit. */
  namesDropped: boolean
  /** The file, asked of the encoder once per kind, as a main-thread copy (it survives dispose). */
  file(kind: 'png' | 'pdf'): Promise<Blob>
  /** Terminates the encoder. Files already returned stay valid. */
  dispose(): void
}

export type EncoderPort = {
  /** `alpha`: keep the alpha channel (an RGBA PNG; no PDF). */
  begin(width: number, height: number, alpha?: boolean): void
  /** Transfers the buffer; resolves once at most 1 strip is unacknowledged (so at most 2 are ever in flight). */
  strip(rgba: Uint8ClampedArray, rows: number): Promise<void>
  /** Resolves with the encoded bytes. */
  end(): Promise<number>
  file(kind: 'png' | 'pdf', page: readonly [number, number]): Promise<Blob>
  dispose(): void
}

export type PosterStrip = { ctx: CanvasRenderingContext2D; read(rows: number): Uint8ClampedArray }

export type PosterDeps = {
  strip(width: number, rows: number): PosterStrip
  encoder(): EncoderPort
  stickers: PrintStickers
  frame(): Promise<void>
  /** Rows per strip, instead of posterRows (tests); still capped by IOS_CANVAS_AREA. */
  rows: number | undefined
}

const GETS_IN_FLIGHT = 12
const FONTS_WAIT_MS = 5_000
const FRAME_WAIT_MS = 100

const memoryError = () => new Error('poster-memory')
/** What image.ts throws when a browser gives it no 2D canvas: the strip canvas would fail the same way. */
const NO_CANVAS = 'Canvas is not available'

/** Device rows per strip for a poster `width` px wide at `k` device px per design unit. */
export function posterRows(width: number, k: number, override?: number): number {
  const cap = Math.max(1, Math.floor(IOS_CANVAS_AREA / width))
  return Math.min(override ?? Math.min(Math.floor(STRIP_AREA / width), Math.ceil(STRIP_DESIGN_ROWS * k)), cap)
}

/** One `<canvas>` for every strip, read back with getImageData. A null context or a failed read is poster-memory. */
export function canvasStrip(width: number, rows: number): PosterStrip {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = rows
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) { canvas.width = 1; canvas.height = 1; throw memoryError() }
  return {
    ctx,
    read(n) {
      try { return ctx.getImageData(0, 0, width, n).data }
      catch { throw memoryError() }
    },
  }
}

/** The next animation frame, or 100 ms, whichever comes first (a background tab runs no frames). */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let raf: number | undefined
    const done = () => {
      clearTimeout(timer)
      if (raf !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
      resolve()
    }
    const timer = setTimeout(done, FRAME_WAIT_MS)
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(done)
  })
}

/** The part of a Worker the encoder uses (a test passes a fake). */
export type WorkerLike = {
  postMessage(message: PrintWorkerRequest, transfer: Transferable[]): void
  terminate(): void
  onmessage: ((e: MessageEvent<PrintWorkerReply>) => void) | null
  onerror: ((e: ErrorEvent) => void) | null
}

/**
 * The print worker as an EncoderPort. Its first `error` reply (or onerror) is fatal: every pending and later call
 * rejects with it and the worker is terminated, never reused.
 */
export function workerEncoder(
  create: () => WorkerLike = () => new Worker(new URL('./print.worker.ts', import.meta.url), { type: 'module' }),
): EncoderPort {
  const worker = create()
  let failure: Error | null = null
  let unacked = 0
  type Waiter<T> = { resolve: (v: T) => void; reject: (e: Error) => void }
  const stripWaiters: Waiter<void>[] = []
  const endWaiters: Waiter<number>[] = []
  const fileWaiters: Waiter<Blob>[] = []
  const send = (msg: PrintWorkerRequest, transfer: Transferable[] = []) => worker.postMessage(msg, transfer)

  function fail(error: Error) {
    if (failure) return
    failure = error
    worker.onmessage = null
    worker.onerror = null
    worker.terminate()
    for (const w of [...stripWaiters.splice(0), ...endWaiters.splice(0), ...fileWaiters.splice(0)]) w.reject(error)
  }
  // Only the strip currently being sent waits, and only until at most 1 strip is unacknowledged.
  const releaseStrips = () => { while (unacked <= 1 && stripWaiters.length) stripWaiters.shift()!.resolve() }

  worker.onmessage = ({ data }) => {
    switch (data.type) {
      case 'took': unacked--; releaseStrips(); break
      case 'encoded': endWaiters.shift()?.resolve(data.bytes); break
      case 'file': fileWaiters.shift()?.resolve(data.blob); break
      case 'error': fail(new Error(data.message)); break
    }
  }
  worker.onerror = (e) => { e.preventDefault?.(); fail(new Error(e.message || 'print worker failed')) }

  return {
    begin(width, height, alpha) {
      if (failure) throw failure
      send({ type: 'begin', width, height, ...(alpha ? { alpha } : {}) })
    },
    strip(rgba, rows) {
      if (failure) return Promise.reject(failure)
      // The worker reads the whole buffer, so send exactly this view's bytes.
      const whole = rgba.byteOffset === 0 && rgba.byteLength === rgba.buffer.byteLength
      const buffer = (whole ? rgba.buffer : rgba.slice().buffer) as ArrayBuffer
      unacked++
      send({ type: 'strip', rgba: buffer, rows }, [buffer])
      return new Promise((resolve, reject) => { stripWaiters.push({ resolve, reject }); releaseStrips() })
    },
    end() {
      if (failure) return Promise.reject(failure)
      send({ type: 'end' })
      return new Promise((resolve, reject) => endWaiters.push({ resolve, reject }))
    },
    file(kind, page) {
      if (failure) return Promise.reject(failure)
      send({ type: 'file', kind, page: [page[0], page[1]] })
      return new Promise((resolve, reject) => fileWaiters.push({ resolve, reject }))
    },
    dispose() { fail(new Error('print encoder disposed')) },
  }
}

/** Wait for the page's fonts (at most 5 s, or until the signal aborts), so no face changes between strips. */
async function fontsSettled(signal?: AbortSignal): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts || signal?.aborted) return
  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  try {
    await Promise.race([
      document.fonts.ready.then(() => undefined, () => undefined),
      new Promise<void>((r) => { timer = setTimeout(r, FONTS_WAIT_MS) }),
      new Promise<void>((r) => { onAbort = () => r(); signal?.addEventListener('abort', onAbort, { once: true }) }),
    ])
  } finally {
    clearTimeout(timer)
    if (onAbort) signal?.removeEventListener('abort', onAbort)
  }
}

/** The Poster for an encoder that has ended: its files asked once per kind, as main-thread copies. */
function finished(done: EncoderPort, info: Omit<Poster, 'file' | 'dispose'>): Poster {
  const files = new Map<'png' | 'pdf', Promise<Blob>>()
  return {
    ...info,
    file(kind) {
      let p = files.get(kind)
      if (!p) {
        p = done.file(kind, printPt(info.size, info.landscape)).then(async (blob) => new Blob([await blob.arrayBuffer()], { type: blob.type }))
        p.catch(() => files.delete(kind))
        files.set(kind, p)
      }
      return p
    },
    dispose: () => done.dispose(),
  }
}

/** For each sticker URL, the tile to load it with and the first and last strip that draw it. */
export function stickerSpans(tiles: Tile[], ranges: PaintRange[]): Map<string, { tile: Tile; first: number; last: number }> {
  const spans = new Map<string, { tile: Tile; first: number; last: number }>()
  for (const t of tiles) {
    if (!t.url) continue
    for (let i = 0; i < ranges.length; i++) {
      if (!tileInRange(t, ranges[i])) continue
      const s = spans.get(t.url)
      if (!s) spans.set(t.url, { tile: t, first: i, last: i })
      else { s.first = Math.min(s.first, i); s.last = Math.max(s.last, i) }
    }
  }
  return spans
}

/**
 * Make a poster: lay it out, paint it strip by strip, encode it. `onProgress(done, total)` after each strip and once
 * more when the encoder has finished (total is the strip count plus 1, so 100% means the file is ready). Rejects
 * with an AbortError when `opts.signal` aborts, and with Error('poster-memory') when the canvas can't be made or read.
 */
export async function makePoster(
  opts: PosterOpts, onProgress: (done: number, total: number) => void, deps: Partial<PosterDeps> = {},
): Promise<Poster> {
  const { size, landscape = false, signal, ...rest } = opts
  const check = () => { if (signal?.aborted) throw abortError() }
  const stickers = deps.stickers ?? createPrintStickers()
  const frame = deps.frame ?? nextFrame
  let encoder: EncoderPort | null = null
  let strip: PosterStrip | null = null
  const onAbort = () => encoder?.dispose()
  try {
    check()
    const k = printScale(size)
    const [width, height] = printPx(size, landscape)
    const format: CardFormat = landscape ? 'printLandscape' : 'print'
    const card = await prepareCard({ ...rest, format, printSize: size, signal }, k).catch((error: unknown) => {
      throw error instanceof Error && error.message === NO_CANVAS ? memoryError() : error
    })
    check()
    await fontsSettled(signal)
    check()

    const strips = stripRanges(width, height, posterRows(width, k, deps.rows))
    const ranges = strips.map(({ y, rows }) => ({ y0: y / k, y1: (y + rows) / k }))
    const spans = stickerSpans([...card.tiles, ...(card.lifer ? [card.lifer] : [])], ranges)
    const byFirst = strips.map(() => [] as string[])
    const byLast = strips.map(() => [] as string[])
    for (const [url, s] of spans) { byFirst[s.first].push(url); byLast[s.last].push(url) }

    // Gets, at most GETS_IN_FLIGHT at once, first in first out. Each promise has a no-op catch so a prefetch that
    // fails after an abort or an earlier error is never an unhandled rejection; it is still awaited where it is drawn.
    const loads = new Map<string, Promise<ImageBitmap | null>>()
    const queue: (() => void)[] = []
    let active = 0
    const pump = () => { while (active < GETS_IN_FLIGHT && queue.length) { active++; queue.shift()!() } }
    const load = (url: string) => {
      const { tile } = spans.get(url)!
      const p = new Promise<ImageBitmap | null>((resolve, reject) => {
        queue.push(() => {
          // Called inside a promise, so an injected get that throws still frees its slot.
          Promise.resolve()
            .then(() => stickers.get({ url, fallback: tile.fallback ?? null }, signal))
            .then(resolve, reject)
            .finally(() => { active--; pump() })
        })
      })
      p.catch(() => {})
      loads.set(url, p)
      pump()
    }
    const startStrip = (i: number) => { if (i < strips.length) for (const url of byFirst[i]) load(url) }

    strip = (deps.strip ?? canvasStrip)(width, strips[0].rows)
    if (!strip?.ctx) throw memoryError()
    const { ctx } = strip
    encoder = (deps.encoder ?? workerEncoder)()
    signal?.addEventListener('abort', onAbort, { once: true })
    if (card.transparent) encoder.begin(width, height, true)
    else encoder.begin(width, height)

    const imgs = new Map<string, CanvasImageSource | null>()
    startStrip(0)
    for (let i = 0; i < strips.length; i++) {
      const { y, rows } = strips[i]
      startStrip(i + 1)
      for (const url of byFirst[i]) imgs.set(url, await loads.get(url)!)
      check()

      // Paper over the whole strip in device px (it covers the last row, which the card's fractional height may not);
      // transparent, the reused strip is cleared instead.
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      if (card.transparent) ctx.clearRect(0, 0, width, rows)
      else {
        ctx.fillStyle = card.colors.paper
        ctx.fillRect(0, 0, width, rows)
      }
      ctx.setTransform(k, 0, 0, k, 0, -y)
      paintCard(ctx, card, imgs, ranges[i])
      const rgba = strip.read(rows)
      for (const url of byLast[i]) { imgs.delete(url); loads.delete(url); stickers.release(url) }
      await encoder.strip(rgba, rows)
      check()
      onProgress(i + 1, strips.length + 1)
      await frame()
      check()
    }
    const bytes = await encoder.end()
    check()
    onProgress(strips.length + 1, strips.length + 1)
    const { soft, missing } = stickers.stats()
    return finished(encoder, { size, landscape, bytes, soft, missing, namesDropped: !!card.namesDropped })
  } catch (error) {
    encoder?.dispose()
    // A sticker released with a get pending is a bug, never a cancel.
    if (signal?.aborted && !(error instanceof Error && error.name === 'StickerReleased')) throw abortError()
    throw error
  } finally {
    signal?.removeEventListener('abort', onAbort)
    stickers.dispose()
    const canvas = strip?.ctx?.canvas
    if (canvas) { canvas.width = 1; canvas.height = 1 }
  }
}

/** The Tree's or the Map's poster: `render(scale)` draws the view's image (renderTreeImage, renderMapImage) at the
 *  poster's size in design units, `scale` device px per unit. */
export type ViewPosterOpts = { size: PrintSize; landscape?: boolean; transparent?: boolean; signal?: AbortSignal; render: (scale: number) => Promise<Blob> }

/** A decoded drawing the strips are cut from (createImageBitmap's; a test passes a fake). */
export type Drawn = { width: number; height: number; close(): void }

/**
 * Make the Tree's or the Map's poster: draw the view once at viewPosterScale (one canvas, never over IOS_CANVAS_AREA),
 * decode it, then cut it into the collage poster's strips, stretched to the poster's own px, for the same encoder (the
 * PNG and the PDF from one stream). `onProgress(done, total)`: once the drawing is ready, after each strip and when the
 * encoder has finished (total is the strip count plus 2). Rejects as makePoster does.
 */
export async function makeViewPoster(
  opts: ViewPosterOpts, onProgress: (done: number, total: number) => void,
  deps: Partial<Pick<PosterDeps, 'strip' | 'encoder' | 'frame' | 'rows'>> & { decode?: (blob: Blob) => Promise<Drawn> } = {},
): Promise<Poster> {
  const { size, landscape = false, transparent = false, signal, render } = opts
  const check = () => { if (signal?.aborted) throw abortError() }
  const frame = deps.frame ?? nextFrame
  let encoder: EncoderPort | null = null
  let strip: PosterStrip | null = null
  let drawn: Drawn | null = null
  const onAbort = () => encoder?.dispose()
  try {
    check()
    const [width, height] = printPx(size, landscape)
    const strips = stripRanges(width, height, posterRows(width, printScale(size), deps.rows))
    const total = strips.length + 2
    const blob = await render(viewPosterScale(size, landscape)).catch((error: unknown) => {
      throw error instanceof Error && error.message === NO_CANVAS ? memoryError() : error
    })
    check()
    drawn = await (deps.decode ?? ((b: Blob) => createImageBitmap(b)))(blob).catch(() => { throw memoryError() })
    check()
    onProgress(1, total)

    strip = (deps.strip ?? canvasStrip)(width, strips[0].rows)
    if (!strip?.ctx) throw memoryError()
    const { ctx } = strip
    encoder = (deps.encoder ?? workerEncoder)()
    signal?.addEventListener('abort', onAbort, { once: true })
    if (transparent) encoder.begin(width, height, true)
    else encoder.begin(width, height)
    for (let i = 0; i < strips.length; i++) {
      const { y, rows } = strips[i]
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, width, rows)
      ctx.drawImage(drawn as unknown as CanvasImageSource, 0, -y, width, height)
      await encoder.strip(strip.read(rows), rows)
      check()
      onProgress(i + 2, total)
      await frame()
      check()
    }
    const bytes = await encoder.end()
    check()
    onProgress(total, total)
    return finished(encoder, { size, landscape, bytes, soft: 0, missing: 0, namesDropped: false })
  } catch (error) {
    encoder?.dispose()
    if (signal?.aborted) throw abortError()
    throw error
  } finally {
    signal?.removeEventListener('abort', onAbort)
    drawn?.close()
    const canvas = strip?.ctx?.canvas
    if (canvas) { canvas.width = 1; canvas.height = 1 }
  }
}
