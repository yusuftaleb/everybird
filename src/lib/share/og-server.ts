// Server side of the link preview: species and masks read from public/data with fs, fonts from Fontshare and Google
// (cached in memory), sticker bytes fetched with a timeout, converted to PNG and embedded as data URLs.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import type { MaskLoader, MaskTable } from '@/lib/layout/layout.worker'
import { stickerUrl } from '@/lib/sticker-url'
import type { SpeciesFile, SpeciesRow } from '@/lib/species/types'

const dataFile = (...p: string[]) => path.join(process.cwd(), 'public', 'data', ...p)

let speciesP: Promise<Map<string, SpeciesRow>> | null = null
/** species.v1.json by code, read once per server process. */
export function serverSpecies(): Promise<Map<string, SpeciesRow>> {
  if (!speciesP) {
    speciesP = readFile(dataFile('species.v1.json'), 'utf8').then((t) => new Map((JSON.parse(t) as SpeciesFile).species.map((r) => [r.code, r])))
    speciesP.catch(() => { speciesP = null })
  }
  return speciesP
}

const maskTables = new Map<string, Promise<MaskTable>>()
/** The layout worker's MaskLoader, reading the order's file from disk (loadBirds falls back to ellipses on failure). */
export const serverMasks: MaskLoader = (order) => {
  let p = maskTables.get(order)
  if (!p) {
    p = readFile(dataFile('masks', `${order}.v1.json`), 'utf8').then((t) => JSON.parse(t) as MaskTable)
    maskTables.set(order, p)
    p.catch(() => maskTables.delete(order))
  }
  return p
}

// --- fonts ---

export type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 500 | 700; style: 'normal' }
const FONT_TIMEOUT_MS = 2000
const FONT_RETRY_MS = 30_000
const UA = 'Mozilla/5.0 (X11; U; Linux x86_64) AppleWebKit/533.0 (KHTML, like Gecko) Version/4.0 Safari/533.0' // old: Google answers with TTF

async function get(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) })
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return res
}

/** The @font-face blocks of a CSS file as family, weight and the first TTF/WOFF/OTF url (never WOFF2: satori can't read it). */
export function parseFontFaces(css: string): { family: string; weight: number; url: string }[] {
  const out: { family: string; weight: number; url: string }[] = []
  for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
    const family = /font-family:\s*['"]?([^;'"]+)['"]?/.exec(block)?.[1]?.trim()
    const weight = Number(/font-weight:\s*(\d+)/.exec(block)?.[1])
    const urls = [...block.matchAll(/url\(\s*['"]?([^)'"]+)['"]?\s*\)\s*format\(\s*['"]?(truetype|opentype|woff)['"]?\s*\)/g)]
    const pick = urls.find((u) => u[2] !== 'woff') ?? urls[0]
    if (family && weight && pick) out.push({ family, weight, url: pick[1].startsWith('//') ? `https:${pick[1]}` : pick[1] })
  }
  return out
}

async function loadFamily(cssUrl: string, want: { family: string; weight: number }[]): Promise<OgFont[]> {
  const css = await (await get(cssUrl, FONT_TIMEOUT_MS, { headers: { 'user-agent': UA } })).text()
  const faces = parseFontFaces(css).filter((f) => want.some((w) => w.family === f.family && w.weight === f.weight))
  return Promise.all(faces.map(async (f) => ({
    name: f.family, weight: f.weight as OgFont['weight'], style: 'normal' as const,
    data: await (await get(f.url, FONT_TIMEOUT_MS)).arrayBuffer(),
  })))
}

// One request per family: Fontshare's CSS API answers a two-family query with only the first.
const SOURCES = [
  { css: 'https://api.fontshare.com/v2/css?f[]=satoshi@500&display=swap', want: [{ family: 'Satoshi', weight: 500 }] },
  { css: 'https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@700&display=swap', want: [{ family: 'Cabinet Grotesk', weight: 700 }] },
  { css: 'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400', want: [{ family: 'Geist Mono', weight: 400 }] },
]
const fontCache: (OgFont[] | { failedAt: number } | undefined)[] = []
const inflight: (Promise<OgFont[]> | undefined)[] = []

/** The fonts that could be fetched (each source cached once it works; a failed source is retried after 30 s). Never throws. */
export async function ogFonts(): Promise<OgFont[]> {
  const parts = await Promise.all(SOURCES.map(async (s, i) => {
    const hit = fontCache[i]
    if (Array.isArray(hit)) return hit
    if (hit && Date.now() - hit.failedAt < FONT_RETRY_MS) return []
    const run = (inflight[i] ??= loadFamily(s.css, s.want).finally(() => { inflight[i] = undefined }))
    try {
      const fonts = await run
      fontCache[i] = fonts
      return fonts
    } catch (e) {
      console.warn(`og image: fonts from ${s.css} unavailable, using the default font`, e)
      fontCache[i] = { failedAt: Date.now() }
      return []
    }
  }))
  return parts.flat()
}

// --- stickers ---

const STICKER_TIMEOUT_MS = 1500
const STICKER_CACHE_MAX = 300
const stickerCache = new Map<string, string>() // "code@size" -> data URL (insertion order = age)
/** Tiles drawn longer than this (px) get the 384 px file (scaled to LARGE_PX), so they don't upscale soft. */
export const OG_LARGE_TILE = 140
const LARGE_PX = 256

/**
 * The stickers as data URLs: the 128 px file, or for codes in `large` the 384 px file scaled down to 256 px. Fetched
 * in parallel with a timeout each and `budgetMs` overall. A sticker that fails, times out or isn't an image is simply
 * left out of the result (the caller draws nothing for it), so the image always renders. Satori would throw on a
 * failed <img> fetch, which is why the bytes are fetched here.
 */
export async function fetchStickers(codes: string[], budgetMs = 2500, large: ReadonlySet<string> = new Set()): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const deadline = Date.now() + budgetMs
  await Promise.all(codes.map(async (code) => {
    const big = large.has(code)
    const key = `${code}@${big ? LARGE_PX : 128}`
    const hit = stickerCache.get(key)
    if (hit) { out.set(code, hit); return }
    try {
      const res = await get(stickerUrl(code, big ? 384 : 128, 1), Math.max(1, Math.min(STICKER_TIMEOUT_MS, deadline - Date.now())))
      if (!(res.headers.get('content-type') ?? 'image/webp').startsWith('image/')) return
      // Satori can't draw WebP (it renders nothing), so each sticker goes in as a PNG.
      let img = sharp(Buffer.from(await res.arrayBuffer()))
      if (big) img = img.resize({ width: LARGE_PX, height: LARGE_PX, fit: 'inside', withoutEnlargement: true })
      const png = await img.png({ compressionLevel: 3 }).toBuffer()
      const url = `data:image/png;base64,${png.toString('base64')}`
      out.set(code, url)
      if (stickerCache.size >= STICKER_CACHE_MAX) stickerCache.delete(stickerCache.keys().next().value!)
      stickerCache.set(key, url)
    } catch { /* left out */ }
  }))
  return out
}
