// Share images: a story (1080 × 1920) or post (1080 × 1350) PNG of the collage, or of the current filtered view.
//
// Layout (cardLayout), on Paper with 64px side margins, all text left-aligned. It leads with the birder, not the
// product: people share a brag, not an app card.
//   top     the name, if given (Cabinet Grotesk 700, 56px), then the count (Cabinet 96px, "197 species"), then, for a
//           filtered view, the filter in words (Satoshi 500 32px, Accent)
//   middle  the collage, packed for the space left (layout worker 'image' message: packFrame, no centre hole); no
//           sticker wider than 22% of the collage, so a short list sits as a cluster with air around it
//   bottom  a Hairline rule, "Latest lifer: Western Grebe · Sep 2026" (Satoshi 32px), then the footer: the Everybird
//           wordmark and "everybird.vercel.app" on the left, the sticker credit on the right (Geist Mono 22px, Muted)
// The story keeps Instagram's safe zones clear: nothing in the top 250px (the profile bar) or the bottom 340px (the
// reply bar); the post uses 64px margins all round.
// Stickers load with crossOrigin = 'anonymous' (the stickers site sends access-control-allow-origin: *), so the
// canvas stays exportable. Species without a sticker, and stickers that fail to load, are drawn as a thin outline of
// the Phosphor Bird in Line (a solid silhouette would be the heaviest shape in the image). Text waits for the real
// fonts (document.fonts.load) before drawing.
import { SHARE_ORIGIN } from '@/lib/share/origin'
import { stickerUrl } from '@/lib/sticker-url'
import { formatDate } from '@/lib/format'
import type { Box } from '@/lib/layout/pack'
import type { ListEntryMsg, WorkerReply, WorkerRequest } from '@/lib/layout/layout.worker'
import { latestLifer } from '@/lib/list/build-list'
import type { Filter } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import type { Trip } from '@/lib/list/trips'
import type { SpeciesIndex } from '@/lib/species/load'
import { orderLabel } from '@/lib/species/orders'

export type ImageFormat = 'story' | 'post' // 1080×1920, 1080×1350
export const IMAGE_SIZE: Record<ImageFormat, [w: number, h: number]> = { story: [1080, 1920], post: [1080, 1350] }
/** The longest name the dialog accepts: what a share link carries (link.ts NAME_MAX; a test keeps them equal). */
export const NAME_MAX_LEN = 40
/** The footer's site name: the share origin's host ("everybird.vercel.app"). */
export const SITE_LABEL = new URL(SHARE_ORIGIN).host
export const STICKER_CREDIT = 'Stickers: huashu-bird-sticker, CC BY 4.0'

/** The design tokens (tokens.css; a test keeps them equal). The image follows the page's current theme. */
export const SHARE_COLORS = {
  light: { ink: '#1e1e24', paper: '#f6f4ef', accent: '#92140c', muted: '#5f5f69', line: '#857f74', hairline: '#dedad2', surface: '#ebe8e1' },
  dark: { ink: '#ffffff', paper: '#1e1e24', accent: '#f06a5f', muted: '#a9a9b2', line: '#6e6e78', hairline: '#3d3d45', surface: '#28282f' },
} as const

/** "197 species" and "Latest lifer: Western Grebe · Sep 2026" (the date part only when there is one). */
export function shareCardText(n: number, latest?: { com: string; date?: string }): { count: string; latest?: string } {
  const out: { count: string; latest?: string } = { count: `${n.toLocaleString('en-US')} species` }
  if (latest) {
    const d = formatDate(latest.date)
    out.latest = `Latest lifer: ${latest.com}${d ? ` · ${d}` : ''}`
  }
  return out
}

/**
 * The current filter in words, birds then place then time: "Egypt · 2026", "Herons · Egypt". A trip stands for its
 * country and year (its label is "Egypt · Sep 2026"). Undefined when nothing is filtered.
 */
export function filterLabel(
  f: Filter,
  ctx: { species: SpeciesIndex; trips: Trip[]; countryName: (iso2: string) => string },
): string | undefined {
  const parts: string[] = []
  if (f.family) parts.push(ctx.species.rows.find((r) => r.fam === f.family)?.famCom || f.family)
  else if (f.order) parts.push(orderLabel(f.order))
  const trip = f.trip ? ctx.trips.find((t) => t.id === f.trip) : undefined
  if (trip) {
    if (f.country && f.country !== trip.country) parts.push(ctx.countryName(f.country))
    parts.push(trip.label)
  } else {
    if (f.country) parts.push(ctx.countryName(f.country))
    if (f.year) parts.push(f.year)
  }
  return parts.length ? parts.join(' · ') : undefined
}

// --- layout ---

const M = 64
/** Clear of the platform's own chrome: Instagram/LinkedIn stories cover about 250px at the top and 340px at the bottom. */
const SAFE: Record<ImageFormat, { top: number; bottom: number }> = { story: { top: 250, bottom: 340 }, post: { top: M, bottom: M } }
type Text = { y: number; size: number }
export type CardLayout = {
  W: number
  H: number
  name?: Text
  count: Text
  filter?: Text
  collage: { x: number; y: number; w: number; h: number }
  rule: { y: number }
  latest?: Text
  footer: Text
}

/** Where everything goes; text y is the top of its em box (textBaseline 'top'). */
export function cardLayout(format: ImageFormat, hasName: boolean, hasFilter: boolean, hasLatest: boolean): CardLayout {
  const [W, H] = IMAGE_SIZE[format]
  const { top: T, bottom: B } = SAFE[format]
  const name = hasName ? { y: T, size: 56 } : undefined
  const count = { y: name ? name.y + 68 : T, size: 96 }
  const filter = hasFilter ? { y: count.y + 106, size: 32 } : undefined
  const headBottom = filter ? filter.y + filter.size : count.y + count.size
  const footer = { y: H - B - 22, size: 22 }
  const latest = hasLatest ? { y: footer.y - 36 - 32, size: 32 } : undefined
  const rule = { y: (latest ? latest.y : footer.y) - 28 }
  const top = headBottom + 44
  const bottom = rule.y - 40
  return { W, H, name, count, filter, collage: { x: M, y: top, w: W - 2 * M, h: bottom - top }, rule, latest, footer }
}

/** Largest a sticker is drawn (long side, px): 22% of the collage's width, and never past the 384px files' sharpness. */
export function maxTileSide(collageW: number): number {
  return Math.min(440, collageW * 0.22)
}

// --- packing (off the main thread) ---

export type ImagePack = { W: number; H: number; boxes: Map<string, Box> }

/**
 * Pack `entries` for a frame of the given aspect in a short-lived layout worker ('image' message; relative sizes over
 * these entries). Aborting terminates the worker and rejects with an AbortError.
 */
export function packForImage(entries: ListEntry[], species: SpeciesIndex, aspect: number, signal?: AbortSignal): Promise<ImagePack> {
  const birds: ListEntryMsg[] = []
  for (const e of entries) {
    const row = species.byCode.get(e.code)
    if (row) birds.push({ code: e.code, mass: row.g, ord: row.ord })
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const w = new Worker(new URL('../layout/layout.worker.ts', import.meta.url), { type: 'module' })
    const done = () => { w.terminate(); signal?.removeEventListener('abort', onAbort) }
    const onAbort = () => { done(); reject(abortError()) }
    signal?.addEventListener('abort', onAbort)
    w.onmessage = (e: MessageEvent<WorkerReply>) => {
      done()
      try { resolve(packFromReply(e.data)) } catch (err) { reject(err) }
    }
    w.onerror = (e) => { done(); reject(new Error(`layout worker failed: ${e.message ?? 'error'}`)) }
    const msg: WorkerRequest = { type: 'image', id: 1, entries: birds, aspect }
    w.postMessage(msg)
  })
}
/** The worker's reply as an ImagePack: boxes [x, y, w, h] per code, in the reply's order. Throws on an error reply. */
export function packFromReply(r: WorkerReply): ImagePack {
  if (r.type !== 'image') throw new Error(r.type === 'error' ? r.message : 'unexpected layout reply')
  const boxes = new Map<string, Box>()
  r.codes.forEach((c, i) => boxes.set(c, [r.boxes[4 * i], r.boxes[4 * i + 1], r.boxes[4 * i + 2], r.boxes[4 * i + 3]]))
  return { W: r.W, H: r.H, boxes }
}

/** The error a cancelled render (or a superseded one, in the dialog) rejects with. */
export const abortError = (message = 'share image cancelled') => {
  const e = new Error(message)
  e.name = 'AbortError'
  return e
}

/**
 * The collage frame's aspect for a format (with or without the filter line and the latest lifer), packed for the
 * frame with a name: the name can be typed after packing, and the drawing fits the pack into whatever frame it gets.
 */
export function collageAspect(format: ImageFormat, hasFilter: boolean, hasLatest: boolean): number {
  const c = cardLayout(format, true, hasFilter, hasLatest).collage
  return c.w / c.h
}

// --- drawing ---

/** Phosphor's Bird (fill weight), on its 256 × 256 grid: the silhouette fallback. */
const BIRD_PATH = 'M236.44,73.34,213.21,57.86A60,60,0,0,0,156,16h-.29C122.79,16.16,96,43.47,96,76.89V96.63L11.63,197.88l-.1.12A16,16,0,0,0,24,224h88A104.11,104.11,0,0,0,216,120V100.28l20.44-13.62a8,8,0,0,0,0-13.32ZM126.15,133.12l-60,72a8,8,0,1,1-12.29-10.24l60-72a8,8,0,1,1,12.29,10.24ZM164,80a12,12,0,1,1,12-12A12,12,0,0,1,164,80Z'
const SILHOUETTE = 0.72
const LOADS_AT_ONCE = 12
const LOAD_TIMEOUT_MS = 20_000 // per sticker
/** All stickers of one render must arrive within this; whatever is still pending is drawn as the silhouette. */
export const LOAD_BUDGET_MS = 40_000

const images = new Map<string, Promise<HTMLImageElement | null>>()
// Bumped by clearStickerCache: loads started before it never write to the cache again.
let generation = 0
/** Drop the loaded stickers (the dialog keeps them while open, for fast re-renders, and calls this on close). */
export function clearStickerCache(): void {
  generation++
  images.clear()
}
/** Test hook: how many stickers the cache holds (loaded or loading). */
export function stickerCacheSize(): number {
  return images.size
}

/**
 * A sticker as a CORS-clean image, or null if it fails, times out or `signal` aborts (an abort also stops the fetch).
 * Only successes stay cached, and only while the cache hasn't been cleared since the load began.
 */
function loadSticker(url: string, signal?: AbortSignal): Promise<HTMLImageElement | null> {
  const hit = images.get(url)
  if (hit) return hit
  const gen = generation
  const p: Promise<HTMLImageElement | null> = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    const finish = (v: HTMLImageElement | null) => {
      clearTimeout(t)
      signal?.removeEventListener('abort', stop)
      img.onload = img.onerror = null
      resolve(v)
    }
    const stop = () => { img.removeAttribute('src'); finish(null) }
    const t = setTimeout(() => finish(null), LOAD_TIMEOUT_MS)
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => finish(img)
    img.onerror = () => finish(null)
    signal?.addEventListener('abort', stop)
    img.src = url
  }).then((img) => {
    if ((!img || gen !== generation || signal?.aborted) && images.get(url) === p) images.delete(url)
    return img
  })
  images.set(url, p)
  return p
}

/**
 * Load `urls`, LOADS_AT_ONCE at a time. Resolves when all have settled or when the budget (counted from this call)
 * runs out: a URL missing from the result, or mapped to null, is drawn as the silhouette. On abort, stops pulling
 * URLs, stops the loads in flight and rejects with an AbortError.
 */
export async function loadStickers(
  urls: string[], opts: { signal?: AbortSignal; budgetMs?: number } = {},
): Promise<Map<string, HTMLImageElement | null>> {
  const { signal, budgetMs = LOAD_BUDGET_MS } = opts
  if (signal?.aborted) throw abortError()
  const out = new Map<string, HTMLImageElement | null>()
  let over = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const budget = new Promise<void>((resolve) => { timer = setTimeout(() => { over = true; resolve() }, budgetMs) })
  let onAbort = () => {}
  const aborted = new Promise<never>((_, reject) => { onAbort = () => reject(abortError()) })
  aborted.catch(() => {})
  signal?.addEventListener('abort', onAbort)
  let next = 0
  const stopped = () => over || !!signal?.aborted
  const worker = async () => {
    while (next < urls.length && !stopped()) {
      const u = urls[next++]
      const img = await Promise.race([loadSticker(u, signal), budget.then(() => null)])
      if (!stopped()) out.set(u, img)
    }
  }
  try {
    await Promise.race([Promise.all(Array.from({ length: Math.min(LOADS_AT_ONCE, urls.length) }, worker)), budget, aborted])
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
  if (signal?.aborted) throw abortError()
  return out
}

export type Tile = { x: number; y: number; w: number; h: number; url: string | null }
/** Draw the collage's tiles: the sticker when it loaded, else a thin outline of the bird in `line` (never a hole). */
export function paintTiles(ctx: CanvasRenderingContext2D, tiles: Tile[], imgs: Map<string, HTMLImageElement | null>, line: string): void {
  const bird = new Path2D(BIRD_PATH)
  for (const t of tiles) {
    const img = t.url ? imgs.get(t.url) : null
    if (img) {
      ctx.drawImage(img, t.x, t.y, t.w, t.h)
      continue
    }
    // Outline: the icon's 256 grid, fitted (contain) at SILHOUETTE of the tile and centred, stroked 2px thin at any
    // scale, so a missing sticker reads as a quiet placeholder, not the darkest shape in the image.
    const k = (SILHOUETTE * Math.min(t.w, t.h)) / 256
    ctx.save()
    ctx.translate(t.x + (t.w - 256 * k) / 2, t.y + (t.h - 256 * k) / 2)
    ctx.scale(k, k)
    ctx.strokeStyle = line
    ctx.lineWidth = 2 / k
    ctx.lineJoin = 'round'
    ctx.stroke(bird)
    ctx.restore()
  }
}

/** The families canvas text uses: the page's own fonts (Fontshare and next/font), with the CSS fallbacks. */
function families(): { display: string; body: string; mono: string } {
  let mono = ''
  if (typeof document !== 'undefined') mono = getComputedStyle(document.documentElement).getPropertyValue('--font-geist-mono').trim()
  return {
    display: '"Cabinet Grotesk", "Satoshi", system-ui, sans-serif',
    body: '"Satoshi", system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: `${mono ? `${mono}, ` : ''}"Geist Mono", ui-monospace, Menlo, monospace`,
  }
}

/** Wait (at most 3 s) for each font the image uses, so the canvas draws with the real faces. */
async function fontsReady(fonts: string[], sample: string): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  const load = Promise.all(fonts.map((f) => document.fonts.load(f, sample).catch(() => [])))
  await Promise.race([load, new Promise((r) => setTimeout(r, 3000))])
}

/** Set the font at `size`, shrinking (to `min`) and then ellipsizing so `text` fits `maxW`; returns the text to draw. */
function fitText(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, size: number, min: number, maxW: number): string {
  let px = size
  ctx.font = font(px)
  while (px > min && ctx.measureText(text).width > maxW) ctx.font = font((px -= 2))
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

export type ShareImageOpts = {
  format: ImageFormat
  entries: ListEntry[]
  species: SpeciesIndex
  filterLabel?: string
  name?: string
  theme: 'light' | 'dark'
  /** A pack made earlier by packForImage for this format and these entries (the dialog keeps one per format). */
  pack?: ImagePack
  signal?: AbortSignal
}

/** The share image as a PNG. Throws an AbortError when `signal` aborts. */
export async function renderShareImage(opts: ShareImageOpts): Promise<Blob> {
  const canvas = await drawShareImage(opts)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))), 'image/png')
  })
}

/** Draw the share image on a new canvas (renderShareImage encodes it). */
export async function drawShareImage(opts: ShareImageOpts): Promise<HTMLCanvasElement> {
  const { format, entries, species, theme, signal } = opts
  const check = () => { if (signal?.aborted) throw abortError() }
  const C = SHARE_COLORS[theme]
  const shown = entries.filter((e) => species.byCode.has(e.code))
  const latestE = latestLifer(shown, (c) => species.byCode.get(c)?.to ?? Number.MAX_SAFE_INTEGER)
  const text = shareCardText(shown.length, latestE && { com: species.byCode.get(latestE.code)!.com, date: latestE.date })
  const label = opts.filterLabel?.trim() || undefined
  const name = opts.name?.trim() || undefined
  const L = cardLayout(format, !!name, !!label, !!text.latest)
  const pack = opts.pack ?? (await packForImage(shown, species, L.collage.w / L.collage.h, signal))
  check()

  // Fit the packed birds (their own bounding box) into the collage area, centred; cap the largest tile.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, maxL = 0
  for (const [x, y, w, h] of pack.boxes.values()) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); maxL = Math.max(maxL, w, h)
  }
  const area = L.collage
  const s = pack.boxes.size ? Math.min(area.w / (x1 - x0), area.h / (y1 - y0), maxTileSide(area.w) / maxL) : 1
  const ox = area.x + (area.w - (x1 - x0) * s) / 2 - x0 * s
  const oy = area.y + (area.h - (y1 - y0) * s) / 2 - y0 * s
  const tiles: Tile[] = shown.flatMap((e) => {
    const b = pack.boxes.get(e.code)
    if (!b) return []
    const row = species.byCode.get(e.code)!
    const [x, y, w, h] = [ox + b[0] * s, oy + b[1] * s, b[2] * s, b[3] * s]
    return [{ x, y, w, h, url: row.st ? stickerUrl(e.code, Math.max(w, h), 1) : null }]
  })

  const F = families()
  const font = {
    name: (px: number) => `700 ${px}px ${F.display}`,
    brand: (px: number) => `700 ${px}px ${F.display}`,
    filter: (px: number) => `500 ${px}px ${F.body}`,
    count: (px: number) => `700 ${px}px ${F.display}`,
    latest: (px: number) => `500 ${px}px ${F.body}`,
    footer: (px: number) => `400 ${px}px ${F.mono}`,
  }
  const [imgs] = await Promise.all([
    loadStickers([...new Set(tiles.flatMap((t) => (t.url ? [t.url] : [])))], { signal }),
    fontsReady(
      [font.name(56), font.brand(26), font.filter(32), font.count(96), font.latest(32), font.footer(22)],
      `${name ?? ''}${label ?? ''}${text.count}${text.latest ?? ''}Everybird${SITE_LABEL}${STICKER_CREDIT}`,
    ),
  ])
  check()

  const canvas = document.createElement('canvas')
  canvas.width = L.W
  canvas.height = L.H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.fillStyle = C.paper
  ctx.fillRect(0, 0, L.W, L.H)

  // The collage.
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  paintTiles(ctx, tiles, imgs, C.line)

  // Text.
  const maxW = L.W - 2 * M
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  const draw = (str: string, f: (px: number) => string, t: Text, min: number, color: string) => {
    const out = fitText(ctx, str, f, t.size, min, maxW)
    ctx.fillStyle = color
    ctx.fillText(out, M, t.y)
  }
  if (name && L.name) draw(name, font.name, L.name, 36, C.ink)
  draw(text.count, font.count, L.count, 64, C.ink)
  if (label && L.filter) draw(label, font.filter, L.filter, 24, C.accent)

  ctx.fillStyle = C.hairline
  ctx.fillRect(M, L.rule.y, maxW, 2)
  if (text.latest && L.latest) draw(text.latest, font.latest, L.latest, 22, C.ink)
  // Footer: the wordmark and the site on the left, the sticker credit (required, CC BY 4.0) on the right.
  ctx.font = font.brand(26)
  ctx.fillStyle = C.ink
  ctx.fillText('Everybird', M, L.footer.y - 3)
  const brandW = ctx.measureText('Everybird').width + 14
  ctx.font = font.footer(L.footer.size)
  ctx.fillStyle = C.muted
  ctx.fillText(SITE_LABEL, M + brandW, L.footer.y)
  const left = M + brandW + ctx.measureText(SITE_LABEL).width + 24
  ctx.textAlign = 'right'
  ctx.fillText(fitText(ctx, STICKER_CREDIT, font.footer, L.footer.size, 16, L.W - M - left), L.W - M, L.footer.y)
  return canvas
}
