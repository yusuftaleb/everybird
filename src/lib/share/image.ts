// Share images: a story (1080 × 1920), post (1080 × 1350) or square (1080 × 1080) PNG of the collage, or of the current filtered view.
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
// reply bar); the post and the square use 64px margins all round.
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
import { rangeLabel } from '@/lib/list/timeline'
import type { ListEntry } from '@/lib/list/model'
import type { Trip } from '@/lib/list/trips'
import type { SpeciesIndex } from '@/lib/species/load'
import { orderLabel } from '@/lib/species/orders'

export type ImageFormat = 'story' | 'post' | 'square' // 1080×1920, 1080×1350, 1080×1080
export const IMAGE_SIZE: Record<ImageFormat, [w: number, h: number]> = { story: [1080, 1920], post: [1080, 1350], square: [1080, 1080] }
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

/**
 * The latest lifer row's two lines: the mono label "Latest lifer · Sep 2026" (the date part only when there is one)
 * and the bird's name.
 */
export function latestText(latest: { com: string; date?: string }): { label: string; name: string } {
  const d = formatDate(latest.date)
  return { label: `Latest lifer${d ? ` · ${d}` : ''}`, name: latest.com }
}

/**
 * The current filter in words, birds then place then time: "Egypt · 2026", "Herons · Egypt". A trip stands for its
 * country and year (its label is "Egypt · Sep 2026"); a range reads "Mar 2020 to Jun 2021" (timeline.ts rangeLabel).
 * Undefined when nothing is filtered.
 */
export function filterLabel(
  f: Filter,
  ctx: { species: SpeciesIndex; trips: Trip[]; countryName: (iso2: string) => string; regionName?: (code: string) => string },
): string | undefined {
  // A place reads as its deepest level: "Okanagan-Similkameen, British Columbia", "British Columbia" or "Canada".
  const region = (code: string) => ctx.regionName?.(code) ?? code
  const place = f.sub1 ? (f.sub2 ? `${f.sub2}, ${region(f.sub1)}` : region(f.sub1)) : f.country ? ctx.countryName(f.country) : undefined
  const parts: string[] = []
  if (f.family) parts.push(ctx.species.rows.find((r) => r.fam === f.family)?.famCom || f.family)
  else if (f.order) parts.push(orderLabel(f.order))
  const trip = f.trip ? ctx.trips.find((t) => t.id === f.trip) : undefined
  if (trip) {
    if (place && (f.sub1 || f.country !== trip.country)) parts.push(place)
    parts.push(trip.label)
  } else {
    if (place) parts.push(place)
    const range = rangeLabel(f.from, f.to)
    if (range) parts.push(range)
    else if (f.year) parts.push(f.year)
  }
  return parts.length ? parts.join(' · ') : undefined
}

// --- layout ---

const M = 64
/** Clear of the platform's own chrome: Instagram/LinkedIn stories cover about 250px at the top and 340px at the bottom. */
export const SAFE: Record<ImageFormat, { top: number; bottom: number }> = {
  story: { top: 250, bottom: 340 }, post: { top: M, bottom: M }, square: { top: M, bottom: M },
}
/**
 * The count's largest size (Cabinet Grotesk 700, px) per format; it shrinks for long numbers (countLayout). It reads
 * as a label in the ring, in /lifelist's proportion: "197" is about 17% of the collage wide (the site's medium
 * layout: 11.5%, narrow: 16%).
 */
const COUNT_MAX: Record<ImageFormat, number> = { story: 112, post: 104, square: 96 }
/** The link preview's (1200 × 630, a 640px collage). */
export const OG_COUNT_MAX = 72
/** The number is never wider than this share of the collage's width. */
const COUNT_W = 0.22
// Cabinet Grotesk 700 metrics (em): tabular digits 0.5, the comma 0.25, digit height 0.6875; drawn at -0.02em tracking.
// Geist Mono: 0.6em per character, caps 0.73em high.
const DIGIT_EM = 0.5, COMMA_EM = 0.25, DIGIT_CAP = 0.6875, TRACK = -0.02, MONO_EM = 0.6, MONO_CAP = 0.73, MONO_TRACK = 0.06

type Text = { y: number; size: number }
/** The count at the centre of the collage: the number (size, px), the mono label under it, and the hole kept for them. */
export type CountLayout = {
  number: string
  label: string
  size: number
  labelSize: number
  /** Gap between the number's baseline and the label's cap line. */
  gap: number
  /** Ellipse radii [rx, ry] (px) the packer keeps empty at the collage's centre. */
  hole: [number, number]
}
export type CardLayout = {
  W: number
  H: number
  name?: Text
  filter?: Text
  collage: { x: number; y: number; w: number; h: number }
  count: CountLayout
  /** The latest lifer row: its sticker (icon, px square) beside two lines, a mono label and the bird's name. */
  latest?: { y: number; icon: number; label: number; name: number }
  rule: { y: number }
  footer: Text & { credit: number }
  /** The largest sticker's long side as a share of the collage width (maxTileFrac of the count). */
  maxTile: number
}
export type CardContent = { name: boolean; filter: boolean; latest: boolean; count: number; total?: number }

/**
 * The count in the middle, as the app's Tally and /lifelist's .yt-ll-mid: "197" over "SPECIES" ("6" over "OF 197
 * SPECIES" for a filtered view). The number shrinks so it never takes more than 40% of the collage's width.
 * `format` sets the largest size (or pass it in px: the link preview's smaller card).
 */
export function countLayout(format: ImageFormat | number, count: number, total: number | undefined, collageW: number): CountLayout {
  const max = typeof format === 'number' ? format : COUNT_MAX[format]
  const number = count.toLocaleString('en-US')
  const label = (total !== undefined && count < total ? `of ${total.toLocaleString('en-US')} species` : 'species').toUpperCase()
  const commas = number.split(',').length - 1
  const em = (number.length - commas) * DIGIT_EM + commas * COMMA_EM + number.length * TRACK
  const size = Math.round(Math.min(max, (COUNT_W * collageW) / em))
  const labelSize = Math.round(Math.max(Math.min(22, size * 0.2), Math.min(28, size * 0.14)))
  const gap = Math.round(size * 0.14)
  // Half the text block (a × b), then the ellipse around it: 1.2a wide, and tall enough that the block's corners sit on
  // it, plus air all round.
  const a = Math.max(em * size, label.length * labelSize * (MONO_EM + MONO_TRACK)) / 2
  const b = (DIGIT_CAP * size + gap + MONO_CAP * labelSize) / 2
  const pad = 0.1 * size
  const rx = 1.2 * a
  const ry = 0.92 * b / Math.sqrt(1 - (a / rx) ** 2) // the block's corners are glyph corners, not solid: a little in
  return { number, label, size, labelSize, gap, hole: [Math.round(rx + pad), Math.round(ry + pad)] }
}

/** Where everything goes; text y is the top of its em box (textBaseline 'top'). The count sits at the collage's centre. */
export function cardLayout(format: ImageFormat, c: CardContent): CardLayout {
  const [W, H] = IMAGE_SIZE[format]
  const { top: T, bottom: B } = SAFE[format]
  // Top: only the name and the filter in words; with neither, the collage starts at the safe line.
  const name = c.name ? { y: T, size: 60 } : undefined
  const filter = c.filter ? { y: name ? name.y + 76 : T, size: 34 } : undefined
  const headBottom = filter ? filter.y + filter.size : name ? name.y + name.size : undefined
  // Bottom, upwards: the footer (wordmark, site and credit on one line), a hairline, the latest lifer row.
  const footer = { y: H - B - 30, size: 30, credit: 19 }
  const rule = { y: footer.y - 30 }
  const icon = format === 'story' ? 76 : 68 // post and square
  const latest = c.latest ? { y: rule.y - 32 - icon, icon, label: 20, name: 34 } : undefined
  const top = headBottom === undefined ? T : headBottom + 48
  const bottom = (latest ? latest.y : rule.y) - 40
  const collage = { x: M, y: top, w: W - 2 * M, h: bottom - top }
  return { W, H, name, filter, collage, count: countLayout(format, c.count, c.total, collage.w), latest, rule, footer, maxTile: maxTileFrac(c.count) }
}

/** What the layout worker packs for: the collage frame's aspect and the hole as fractions of the frame's width. */
export type PackSpec = { aspect: number; hole: [number, number]; maxTile: number }
export function packSpec(L: CardLayout): PackSpec {
  const { w, h } = L.collage
  return { aspect: w / h, hole: [L.count.hole[0] / w, L.count.hole[1] / w], maxTile: L.maxTile }
}

/**
 * Largest a sticker is drawn (long side) as a share of the collage's width: 30%, or 36% for a short list (up to 24
 * birds) so its ring around the count fills more of the frame. Either stays under the 384px files' sharpness.
 */
export const MAX_TILE = 0.3, MAX_TILE_SHORT = 0.36
export const maxTileFrac = (n: number) => (n <= 24 ? MAX_TILE_SHORT : MAX_TILE)
/** That largest side in px (never past 440, the 384px files' sharp size). */
export function maxTileSide(collageW: number, frac = MAX_TILE): number {
  return Math.min(440, collageW * frac)
}

// --- packing (off the main thread) ---

export type ImagePack = { W: number; H: number; boxes: Map<string, Box> }

/**
 * Pack `entries` for the collage frame (spec: its aspect and the count's hole) in a short-lived layout worker ('image'
 * message; relative sizes over these entries). Aborting terminates the worker and rejects with an AbortError.
 */
export function packForImage(entries: ListEntry[], species: SpeciesIndex, spec: PackSpec, signal?: AbortSignal): Promise<ImagePack> {
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
    const msg: WorkerRequest = { type: 'image', id: 1, entries: birds, aspect: spec.aspect, hole: spec.hole, maxTile: spec.maxTile }
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
 * What to pack for a format and a view: the collage frame (with or without the name, the filter line and the latest
 * lifer) and the count's hole. The dialog packs once per format and name-or-not; the drawing maps the pack onto
 * whatever frame it gets.
 */
export function imagePackSpec(format: ImageFormat, c: CardContent): PackSpec {
  return packSpec(cardLayout(format, c))
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

/** The smallest size the credit takes beside the wordmark before it moves to its own line. */
export const CREDIT_MIN = 17
/**
 * Where the sticker credit goes, never truncated: beside the wordmark and site (`inlineRoom` px) at `size` down to
 * CREDIT_MIN, else on its own line (`fullRoom` px) at `size`, shrinking only if even the full width is too narrow.
 * `measure(px)` is the credit's width at that size.
 */
export function placeCredit(measure: (px: number) => number, inlineRoom: number, fullRoom: number, size: number): { size: number; below: boolean } {
  for (let px = size; px >= CREDIT_MIN; px--) if (measure(px) <= inlineRoom) return { size: px, below: false }
  let px = size
  while (px > 8 && measure(px) > fullRoom) px--
  return { size: px, below: true }
}

export type ShareImageOpts = {
  format: ImageFormat
  entries: ListEntry[]
  species: SpeciesIndex
  filterLabel?: string
  /** The whole list's size, for a filtered view: the count reads "6" over "of 197 species". */
  total?: number
  name?: string
  theme: 'light' | 'dark'
  /** A pack made earlier by packForImage for this format, these entries and name-or-not (the dialog keeps them). */
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

/**
 * `grow`: how much the scale-up past the width fit enlarged the birds (and the hole), at least 1. `sy`: the extra
 * vertical spread of the birds' centres (not their sizes) above the centre, `syDown` below it, each at least 1.
 */
/** How far the story may spread the birds vertically to fill its tall frame. */
export const STORY_SPREAD = 1.6
export type PackFit = { s: number; cx: number; cy: number; ux: number; uy: number; grow: number; sy: number; syDown: number }
/** Where a tile's centre lands vertically: above the centre spread by `sy`, below by `syDown`. */
export const spreadY = (f: PackFit, yc: number) => f.cy + (yc - f.uy) * f.s * (yc < f.uy ? f.sy : f.syDown)
/**
 * How a pack lands on the collage area: the frame's centre (the hole) on the area's centre, the frame's width on the
 * area's width (or its height, if that is tighter), then scaled about the centre until the birds reach the area's
 * edge or the largest tile reaches `maxTile` px. Then, up to `spreadMax` (the story's tall frame), the birds' centres
 * spread vertically until the top or bottom bird reaches the area's edge: sizes are kept and distances only grow, so
 * nothing overlaps, and the ring and its hole become a taller oval. A layout unit at (x, y) is drawn at
 * (cx + (x − ux)·s, cy + (y − uy)·s) before the spread; a tile's centre moves to cy + (yc − uy)·s·sy.
 */
export function fitPack(pack: ImagePack, area: { x: number; y: number; w: number; h: number }, maxTile: number, spreadMax = 1): PackFit {
  const ux = pack.W / 2, uy = pack.H / 2
  const cx = area.x + area.w / 2, cy = area.y + area.h / 2
  const k = Math.min(area.w / pack.W, area.h / pack.H)
  let dx = 0, dy = 0, maxL = 0
  for (const [x, y, w, h] of pack.boxes.values()) {
    dx = Math.max(dx, ux - x, x + w - ux)
    dy = Math.max(dy, uy - y, y + h - uy)
    maxL = Math.max(maxL, w, h)
  }
  if (!maxL) return { s: k, cx, cy, ux, uy, grow: 1, sy: 1, syDown: 1 }
  const fill = Math.min(area.w / 2 / (dx * k), area.h / 2 / (dy * k), maxTile / (maxL * k))
  const s = k * fill
  // Above and below the centre spread separately, so a lopsided ring (one big bird low) still reaches both edges.
  let up = spreadMax, down = spreadMax
  for (const [, y, , h] of pack.boxes.values()) {
    const c = (y + h / 2 - uy) * s
    const room = (area.h / 2 - (h * s) / 2) / Math.abs(c)
    if (c < -1e-6) up = Math.min(up, room)
    else if (c > 1e-6) down = Math.min(down, room)
  }
  return { s, cx, cy, ux, uy, grow: Math.max(1, fill), sy: Math.max(1, up), syDown: Math.max(1, down) }
}

/** Draw the share image on a new canvas (renderShareImage encodes it). */
export async function drawShareImage(opts: ShareImageOpts): Promise<HTMLCanvasElement> {
  const { format, entries, species, theme, signal } = opts
  const check = () => { if (signal?.aborted) throw abortError() }
  const C = SHARE_COLORS[theme]
  const shown = entries.filter((e) => species.byCode.has(e.code))
  const latestE = latestLifer(shown, (c) => species.byCode.get(c)?.to ?? Number.MAX_SAFE_INTEGER)
  const latestRow = latestE && species.byCode.get(latestE.code)!
  const latest = latestRow && latestText({ com: latestRow.com, date: latestE!.date })
  const label = opts.filterLabel?.trim() || undefined
  const name = opts.name?.trim() || undefined
  const content: CardContent = { name: !!name, filter: !!label, latest: !!latest, count: shown.length, total: opts.total }
  const L = cardLayout(format, content)
  const pack = opts.pack ?? (await packForImage(shown, species, packSpec(L), signal))
  check()

  // The pack on the collage area, its centre (the count) on the area's centre.
  const area = L.collage
  const fit = fitPack(pack, area, maxTileSide(area.w, L.maxTile), format === 'story' ? STORY_SPREAD : 1)
  const tiles: Tile[] = shown.flatMap((e) => {
    const b = pack.boxes.get(e.code)
    if (!b) return []
    const row = species.byCode.get(e.code)!
    const [w, h] = [b[2] * fit.s, b[3] * fit.s]
    const [x, y] = [fit.cx + (b[0] - fit.ux) * fit.s, spreadY(fit, b[1] + b[3] / 2) - h / 2]
    return [{ x, y, w, h, url: row.st ? stickerUrl(e.code, Math.max(w, h), 1) : null }]
  })
  // The latest lifer's sticker, contained in its square at the sticker's own aspect.
  let lifer: Tile | null = null
  if (latestRow && L.latest) {
    const { icon, y } = L.latest
    const ar = latestRow.st && latestRow.ar > 0 ? latestRow.ar : 1
    const w = ar >= 1 ? icon : icon * ar, h = ar >= 1 ? icon / ar : icon
    lifer = { x: M + (icon - w) / 2, y: y + (icon - h) / 2, w, h, url: latestRow.st ? stickerUrl(latestRow.code, icon, 1) : null }
  }

  const F = families()
  const font = {
    name: (px: number) => `700 ${px}px ${F.display}`,
    filter: (px: number) => `500 ${px}px ${F.body}`,
    count: (px: number) => `700 ${px}px ${F.display}`,
    mono: (px: number) => `500 ${px}px ${F.mono}`,
    lifer: (px: number) => `600 ${px}px ${F.body}`,
    brand: (px: number) => `700 ${px}px ${F.display}`,
    footer: (px: number) => `400 ${px}px ${F.mono}`,
  }
  // The count grows with the birds when a short list is scaled up past the width fit (its hole grew as much).
  const g = Math.min(fit.grow, 1.3)
  const K = { ...L.count, size: Math.round(L.count.size * g), labelSize: Math.round(L.count.labelSize * Math.min(g, 1.15)), gap: Math.round(L.count.gap * g) }
  const [imgs] = await Promise.all([
    loadStickers([...new Set([...tiles, ...(lifer ? [lifer] : [])].flatMap((t) => (t.url ? [t.url] : [])))], { signal }),
    fontsReady(
      [font.name(L.name?.size ?? 60), font.filter(34), font.count(K.size), font.mono(K.labelSize), font.lifer(34), font.brand(30), font.footer(20)],
      `${name ?? ''}${label ?? ''}${K.number}${K.label}${latest ? latest.label.toUpperCase() + latest.name : ''}Everybird${SITE_LABEL}${STICKER_CREDIT}`,
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

  const maxW = L.W - 2 * M
  const track = (em: number, px: number) => { if ('letterSpacing' in ctx) ctx.letterSpacing = `${(em * px).toFixed(2)}px` }

  // The count in the middle: the number (Cabinet Grotesk 700, -0.02em) over the mono label, centred as one block on
  // the collage's centre (the hole), measured from the digits' real height.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = font.count(K.size)
  track(-0.02, K.size)
  const digitH = ctx.measureText('0').actualBoundingBoxAscent || 0.6875 * K.size
  ctx.font = font.mono(K.labelSize)
  track(0.06, K.labelSize)
  const capH = ctx.measureText('S').actualBoundingBoxAscent || 0.73 * K.labelSize
  const blockTop = fit.cy - (digitH + K.gap + capH) / 2
  ctx.font = font.count(K.size)
  track(-0.02, K.size)
  ctx.fillStyle = C.ink
  ctx.fillText(K.number, fit.cx, blockTop + digitH)
  ctx.font = font.mono(K.labelSize)
  track(0.06, K.labelSize)
  ctx.fillStyle = C.muted
  ctx.fillText(K.label, fit.cx, blockTop + digitH + K.gap + capH)
  track(0, 0)

  // Text.
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  const draw = (str: string, f: (px: number) => string, t: Text, min: number, color: string, x = M, w = maxW) => {
    const out = fitText(ctx, str, f, t.size, min, w)
    ctx.fillStyle = color
    ctx.fillText(out, x, t.y)
  }
  if (name && L.name) draw(name, font.name, L.name, 36, C.ink)
  if (label && L.filter) draw(label, font.filter, L.filter, 24, C.accent)

  // Footer, quiet: the wordmark and the site on the left, the sticker credit (required, CC BY 4.0, never truncated) on
  // the right on one baseline. If it doesn't fit there at 17px or more, it takes its own line under them at the bottom
  // safe line, and the wordmark row, the hairline and the latest lifer row move up by that line.
  ctx.textBaseline = 'alphabetic'
  ctx.font = font.brand(L.footer.size)
  const brandW = ctx.measureText('Everybird').width + 16
  ctx.font = font.footer(20)
  const siteW = ctx.measureText(SITE_LABEL).width
  const credit = placeCredit((px) => { ctx.font = font.footer(px); return ctx.measureText(STICKER_CREDIT).width },
    maxW - brandW - siteW - 32, maxW, L.footer.credit)
  const shift = credit.below ? credit.size + 12 : 0
  const base = L.footer.y + L.footer.size * 0.8

  // The latest lifer: its sticker, then the mono label over the bird's name, centred on the sticker.
  ctx.textBaseline = 'top'
  if (latest && lifer && L.latest) {
    paintTiles(ctx, [{ ...lifer, y: lifer.y - shift }], imgs, C.line)
    const { icon } = L.latest
    const y = L.latest.y - shift
    const tx = M + icon + 20, tw = maxW - icon - 20
    const blockH = L.latest.label + 10 + L.latest.name
    const top = y + (icon - blockH) / 2
    track(0.06, L.latest.label)
    draw(latest.label.toUpperCase(), font.mono, { y: top, size: L.latest.label }, 16, C.muted, tx, tw)
    track(0, 0)
    draw(latest.name, font.lifer, { y: top + L.latest.label + 10, size: L.latest.name }, 24, C.ink, tx, tw)
  }

  ctx.fillStyle = C.hairline
  ctx.fillRect(M, L.rule.y - shift, maxW, 2)
  ctx.textBaseline = 'alphabetic'
  ctx.font = font.brand(L.footer.size)
  ctx.fillStyle = C.ink
  ctx.fillText('Everybird', M, base - shift)
  ctx.font = font.footer(20)
  ctx.fillStyle = C.muted
  ctx.fillText(SITE_LABEL, M + brandW, base - shift)
  ctx.font = font.footer(credit.size)
  if (credit.below) {
    ctx.textAlign = 'left'
    ctx.fillText(STICKER_CREDIT, M, base)
  } else {
    ctx.textAlign = 'right'
    ctx.fillText(STICKER_CREDIT, L.W - M, base)
  }
  return canvas
}
