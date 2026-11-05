// Share images: a story (1080 × 1920) or post (1080 × 1350) PNG of the collage, or of the current filtered view.
//
// Layout (cardLayout), on Paper with 64px margins, all text left-aligned:
//   top     the title, "Everybird" or "Ada's Everybird" (Cabinet Grotesk 700, 56px), the tagline under it
//           (Satoshi 30px, Muted) and, for a filtered view, the filter in words (Satoshi 500 32px, Accent)
//   middle  the collage, packed for the space left (layout worker 'image' message: packFrame, no centre hole)
//   bottom  the count (Cabinet 96px, "197 species") and "Latest lifer: Western Grebe · Sep 2026" (Satoshi 32px)
//   footer  a Hairline rule, then "everybird.vercel.app" and the sticker credit (Geist Mono 22px, Muted)
// Stickers load with crossOrigin = 'anonymous' (the stickers site sends access-control-allow-origin: *), so the
// canvas stays exportable. Species without a sticker, and stickers that fail to load, are drawn as the Phosphor
// Bird silhouette in Muted, as on the page. Text waits for the real fonts (document.fonts.load) before drawing.
import { stickerUrl } from '@/components/collage/Sticker'
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
export const TAGLINE = "Every bird you've ever seen."
export const SITE_LABEL = 'everybird.vercel.app'
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

/** "Everybird", or "Ada Birder's Everybird" with a name (as the shared page's title). */
export function shareTitle(name?: string): string {
  const n = name?.trim()
  return n ? `${n}'s Everybird` : 'Everybird'
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
type Text = { y: number; size: number }
export type CardLayout = {
  W: number
  H: number
  title: Text
  tagline: Text
  filter?: Text
  collage: { x: number; y: number; w: number; h: number }
  count: Text
  latest?: Text
  rule: { y: number }
  footer: Text
}

/** Where everything goes; text y is the top of its em box (textBaseline 'top'). */
export function cardLayout(format: ImageFormat, hasFilter: boolean, hasLatest: boolean): CardLayout {
  const [W, H] = IMAGE_SIZE[format]
  const title = { y: M, size: 56 }
  const tagline = { y: title.y + 70, size: 30 }
  const filter = hasFilter ? { y: tagline.y + 50, size: 32 } : undefined
  const headBottom = filter ? filter.y + 40 : tagline.y + 38
  const footer = { y: H - M - 22, size: 22 }
  const rule = { y: footer.y - 28 }
  const latest = hasLatest ? { y: rule.y - 36 - 40, size: 32 } : undefined
  const count = { y: (latest ? latest.y - 12 : rule.y - 36) - 96, size: 96 }
  const top = headBottom + 48
  const bottom = count.y - 44
  return { W, H, title, tagline, filter, collage: { x: M, y: top, w: W - 2 * M, h: bottom - top }, count, latest, rule, footer }
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
      const r = e.data
      if (r.type !== 'image') return reject(new Error(r.type === 'error' ? r.message : 'unexpected layout reply'))
      const boxes = new Map<string, Box>()
      r.codes.forEach((c, i) => boxes.set(c, [r.boxes[4 * i], r.boxes[4 * i + 1], r.boxes[4 * i + 2], r.boxes[4 * i + 3]]))
      resolve({ W: r.W, H: r.H, boxes })
    }
    w.onerror = (e) => { done(); reject(new Error(`layout worker failed: ${e.message ?? 'error'}`)) }
    const msg: WorkerRequest = { type: 'image', id: 1, entries: birds, aspect }
    w.postMessage(msg)
  })
}
const abortError = () => {
  const e = new Error('share image cancelled')
  e.name = 'AbortError'
  return e
}

/** The collage frame's aspect for a format (with or without the filter line and the latest lifer). */
export function collageAspect(format: ImageFormat, hasFilter: boolean, hasLatest: boolean): number {
  const c = cardLayout(format, hasFilter, hasLatest).collage
  return c.w / c.h
}

// --- drawing ---

/** Phosphor's Bird (fill weight), on its 256 × 256 grid: the silhouette fallback. */
const BIRD_PATH = 'M236.44,73.34,213.21,57.86A60,60,0,0,0,156,16h-.29C122.79,16.16,96,43.47,96,76.89V96.63L11.63,197.88l-.1.12A16,16,0,0,0,24,224h88A104.11,104.11,0,0,0,216,120V100.28l20.44-13.62a8,8,0,0,0,0-13.32ZM126.15,133.12l-60,72a8,8,0,1,1-12.29-10.24l60-72a8,8,0,1,1,12.29,10.24ZM164,80a12,12,0,1,1,12-12A12,12,0,0,1,164,80Z'
/** Largest a sticker is drawn (long side, px): the 384px files stay sharp; a tiny list doesn't blow one up. */
const MAX_TILE = 440
const SILHOUETTE = 0.72
const LOADS_AT_ONCE = 12
const LOAD_TIMEOUT_MS = 20_000

const images = new Map<string, Promise<HTMLImageElement | null>>()
/** Drop the loaded stickers (the dialog keeps them while open, for fast re-renders, and calls this on close). */
export function clearStickerCache(): void {
  images.clear()
}
/** A sticker as a CORS-clean image, or null if it fails. Successes are kept for the next render. */
function loadSticker(url: string): Promise<HTMLImageElement | null> {
  let p = images.get(url)
  if (p) return p
  p = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    const t = setTimeout(() => resolve(null), LOAD_TIMEOUT_MS)
    img.onload = () => { clearTimeout(t); resolve(img) }
    img.onerror = () => { clearTimeout(t); resolve(null) }
    img.src = url
  }).then((img) => { if (!img) images.delete(url); return img })
  images.set(url, p)
  return p
}

async function loadAll(urls: string[]): Promise<Map<string, HTMLImageElement | null>> {
  const out = new Map<string, HTMLImageElement | null>()
  let next = 0
  const worker = async () => {
    while (next < urls.length) {
      const u = urls[next++]
      out.set(u, await loadSticker(u))
    }
  }
  await Promise.all(Array.from({ length: Math.min(LOADS_AT_ONCE, urls.length) }, worker))
  return out
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
  const L = cardLayout(format, !!label, !!text.latest)
  const pack = opts.pack ?? (await packForImage(shown, species, L.collage.w / L.collage.h, signal))
  check()

  // Fit the packed birds (their own bounding box) into the collage area, centred; cap the largest tile.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, maxL = 0
  for (const [x, y, w, h] of pack.boxes.values()) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); maxL = Math.max(maxL, w, h)
  }
  const area = L.collage
  const s = pack.boxes.size ? Math.min(area.w / (x1 - x0), area.h / (y1 - y0), MAX_TILE / maxL) : 1
  const ox = area.x + (area.w - (x1 - x0) * s) / 2 - x0 * s
  const oy = area.y + (area.h - (y1 - y0) * s) / 2 - y0 * s
  const tiles = shown.flatMap((e) => {
    const b = pack.boxes.get(e.code)
    if (!b) return []
    const row = species.byCode.get(e.code)!
    const [x, y, w, h] = [ox + b[0] * s, oy + b[1] * s, b[2] * s, b[3] * s]
    return [{ x, y, w, h, url: row.st ? stickerUrl(e.code, Math.max(w, h), 1) : null }]
  })

  const F = families()
  const font = {
    title: (px: number) => `700 ${px}px ${F.display}`,
    tagline: (px: number) => `400 ${px}px ${F.body}`,
    filter: (px: number) => `500 ${px}px ${F.body}`,
    count: (px: number) => `700 ${px}px ${F.display}`,
    latest: (px: number) => `500 ${px}px ${F.body}`,
    footer: (px: number) => `400 ${px}px ${F.mono}`,
  }
  const title = shareTitle(opts.name)
  const [imgs] = await Promise.all([
    loadAll([...new Set(tiles.flatMap((t) => (t.url ? [t.url] : [])))]),
    fontsReady(
      [font.title(56), font.tagline(30), font.filter(32), font.count(96), font.latest(32), font.footer(22)],
      `${title}${label ?? ''}${text.count}${text.latest ?? ''}${SITE_LABEL}${STICKER_CREDIT}${TAGLINE}`,
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
  const bird = new Path2D(BIRD_PATH)
  for (const t of tiles) {
    const img = t.url ? imgs.get(t.url) : null
    if (img) {
      ctx.drawImage(img, t.x, t.y, t.w, t.h)
      continue
    }
    // Silhouette: the icon's 256 grid, fitted (contain) at SILHOUETTE of the tile and centred. A solid icon reads
    // heavier than a sticker (whose bird never fills its tile), so it is drawn a little smaller.
    const k = (SILHOUETTE * Math.min(t.w, t.h)) / 256
    ctx.save()
    ctx.translate(t.x + (t.w - 256 * k) / 2, t.y + (t.h - 256 * k) / 2)
    ctx.scale(k, k)
    ctx.fillStyle = C.muted
    ctx.fill(bird)
    ctx.restore()
  }

  // Text.
  const maxW = L.W - 2 * M
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  const draw = (str: string, f: (px: number) => string, t: Text, min: number, color: string) => {
    const out = fitText(ctx, str, f, t.size, min, maxW)
    ctx.fillStyle = color
    ctx.fillText(out, M, t.y)
  }
  draw(title, font.title, L.title, 36, C.ink)
  draw(TAGLINE, font.tagline, L.tagline, 24, C.muted)
  if (label && L.filter) draw(label, font.filter, L.filter, 24, C.accent)
  draw(text.count, font.count, L.count, 64, C.ink)
  if (text.latest && L.latest) draw(text.latest, font.latest, L.latest, 22, C.ink)

  ctx.fillStyle = C.hairline
  ctx.fillRect(M, L.rule.y, maxW, 2)
  ctx.font = font.footer(L.footer.size)
  ctx.fillStyle = C.muted
  ctx.fillText(SITE_LABEL, M, L.footer.y)
  ctx.textAlign = 'right'
  ctx.fillText(STICKER_CREDIT, L.W - M, L.footer.y)
  return canvas
}
