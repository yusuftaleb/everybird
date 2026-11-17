// Server side of the link preview: species and masks read from public/data (from disk on Node, from the Worker's static
// assets on Cloudflare: public-text.ts), fonts from Fontshare and Google (cached in memory), sticker bytes fetched with a
// timeout, converted to PNG (sticker-png.ts) and embedded as data URLs.
import type { MaskLoader, MaskTable } from '@/lib/layout/layout.worker'
import { readPublicText } from './public-text'
import { stickerPng } from './sticker-png'
import { stickerUrl } from '@/lib/sticker-url'
import { baseOfLang } from '@/lib/species/name-locales'
import type { SpeciesFile, SpeciesRow } from '@/lib/species/types'

const dataFile = (...p: string[]) => ['data', ...p].join('/')

let speciesP: Promise<Map<string, SpeciesRow>> | null = null
/** species.v1.json by code, read once per server process. */
export function serverSpecies(): Promise<Map<string, SpeciesRow>> {
  if (!speciesP) {
    speciesP = readPublicText(dataFile('species.v1.json')).then((t) => new Map((JSON.parse(t) as SpeciesFile).species.map((r) => [r.code, r])))
    speciesP.catch(() => { speciesP = null })
  }
  return speciesP
}

const namesByBase = new Map<string, Promise<Record<string, string>>>()
/**
 * The card's local bird names for a URL's language: the base set (es, pt_BR, nl; never a regional one, since the card
 * is cached a year per URL), read from disk like the species file. English gives none (`{}`); a failed read gives `null`, which the card treats as
 * incomplete (cached a minute, not a year, with English names).
 */
export function serverNames(lang: string): Promise<Record<string, string> | null> {
  const base = baseOfLang(lang)
  if (!base) return Promise.resolve({})
  let p = namesByBase.get(base)
  if (!p) {
    p = readPublicText(dataFile(`names.${base}.v1.json`)).then((t) => (JSON.parse(t) as { names: Record<string, string> }).names)
    namesByBase.set(base, p)
    p.catch(() => { namesByBase.delete(base) })
  }
  return p.catch(() => null)
}

const maskTables = new Map<string, Promise<MaskTable>>()
/** The layout worker's MaskLoader, reading the order's file from disk (loadBirds falls back to ellipses on failure). */
export const serverMasks: MaskLoader = (order) => {
  let p = maskTables.get(order)
  if (!p) {
    p = readPublicText(dataFile('masks', `${order}.v1.json`)).then((t) => JSON.parse(t) as MaskTable)
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

export type FontFace = { family: string; weight: number; url: string; range?: string }

/**
 * The @font-face blocks of a CSS file as family, weight, the first TTF/WOFF/OTF url (never WOFF2: satori can't read it)
 * and the `unicode-range` when the block has one (Google splits a family into subsets by it).
 */
export function parseFontFaces(css: string): FontFace[] {
  const out: FontFace[] = []
  for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
    const family = /font-family:\s*['"]?([^;'"]+)['"]?/.exec(block)?.[1]?.trim()
    const weight = Number(/font-weight:\s*(\d+)/.exec(block)?.[1])
    const urls = [...block.matchAll(/url\(\s*['"]?([^)'"]+)['"]?\s*\)\s*format\(\s*['"]?(truetype|opentype|woff)['"]?\s*\)/g)]
    const pick = urls.find((u) => u[2] !== 'woff') ?? urls[0]
    const range = /unicode-range:\s*([^;}]+)/.exec(block)?.[1]?.trim()
    if (family && weight && pick) out.push({ family, weight, url: pick[1].startsWith('//') ? `https:${pick[1]}` : pick[1], ...(range ? { range } : {}) })
  }
  return out
}

/** Latin-1's letters, U+00C0 to U+00FF: every accented letter Spanish, Portuguese and Dutch write (á, ã, ç, é, ë, ñ, ú …). */
const LATIN1 = [0xc0, 0xff] as const

/** Polish's letters outside Latin-1 (ą ć ę ł ń ś ź ż and their capitals; ó/Ó are U+00F3/00D3, already in Latin-1). */
const POLISH_EXTRA = [0x104, 0x105, 0x106, 0x107, 0x118, 0x119, 0x141, 0x142, 0x143, 0x144, 0x15a, 0x15b, 0x179, 0x17a, 0x17b, 0x17c]

/** A `unicode-range` value ("U+0000-00FF, U+0131") as [start, end] spans; `?` wildcards expanded to their full span. */
function spansOf(range: string): [number, number][] {
  return range.split(',').flatMap((part) => {
    const m = /U\+([0-9a-f?]+)(?:-([0-9a-f]+))?/i.exec(part.trim())
    if (!m) return []
    if (m[1].includes('?')) return [[parseInt(m[1].replace(/\?/g, '0'), 16), parseInt(m[1].replace(/\?/g, 'f'), 16)] as [number, number]]
    const a = parseInt(m[1], 16)
    return [[a, m[2] ? parseInt(m[2], 16) : a] as [number, number]]
  })
}

/** Whether a `unicode-range` value covers all of U+00C0–U+00FF; no range covers everything. */
export function coversLatin1(range: string | undefined): boolean {
  if (!range) return true
  const spans = spansOf(range)
  // Each code point of the span must sit in some range (spans may be split, e.g. U+00C0-00DF, U+00E0-00FF).
  for (let c = LATIN1[0]; c <= LATIN1[1]; c++) if (!spans.some(([a, b]) => c >= a && c <= b)) return false
  return true
}

/** Whether a `unicode-range` value covers any of Polish's Latin Extended-A letters; no range covers everything. */
export function coversPolishExtra(range: string | undefined): boolean {
  if (!range) return true
  const spans = spansOf(range)
  return POLISH_EXTRA.some((cp) => spans.some(([a, b]) => cp >= a && cp <= b))
}

/**
 * The faces to load for `want`: per family and weight, the faces whose range covers Latin-1 (so the card's "Última
 * especie nueva" and "Lista de vida de Ada" draw in the real font, not the fallback), or all of them when none does;
 * plus, when the Latin-1 face doesn't already cover them (Google splits Geist Mono this way), a face for Polish's
 * extra letters (ł, ż, …), so a Polish "Kolaż Ady" draws them too instead of falling back. Satori tries each font
 * registered under a family and weight in order, so passing both is enough.
 */
export function pickFaces(faces: readonly FontFace[], want: readonly { family: string; weight: number }[]): FontFace[] {
  return want.flatMap((w) => {
    const all = faces.filter((f) => f.family === w.family && f.weight === w.weight)
    const latin = all.filter((f) => coversLatin1(f.range))
    if (!latin.length) return all
    const extra = all.filter((f) => !latin.includes(f) && coversPolishExtra(f.range))
    return [...latin, ...extra]
  })
}

async function loadFamily(cssUrl: string, want: { family: string; weight: number }[]): Promise<OgFont[]> {
  const css = await (await get(cssUrl, FONT_TIMEOUT_MS, { headers: { 'user-agent': UA } })).text()
  const faces = pickFaces(parseFontFaces(css), want)
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
 * The stickers as data URLs (keyed by code): the 128 px file, or for codes in `large` the 384 px file scaled down to
 * 256 px; each code's sticker version `sv` (species.v1.json) picks the rebuilt file when it has one. Fetched
 * in parallel with a timeout each and `budgetMs` overall. A sticker that fails, times out or isn't an image is simply
 * left out of the result (the caller draws nothing for it), so the image always renders. Satori would throw on a
 * failed <img> fetch, which is why the bytes are fetched here.
 */
export async function fetchStickers(
  stickers: readonly { code: string; sv?: string }[], budgetMs = 2500, large: ReadonlySet<string> = new Set(),
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const deadline = Date.now() + budgetMs
  await Promise.all(stickers.map(async ({ code, sv }) => {
    const big = large.has(code)
    const key = `${code}${sv ? `.${sv}` : ''}@${big ? LARGE_PX : 128}`
    const hit = stickerCache.get(key)
    if (hit) { out.set(code, hit); return }
    try {
      const res = await get(stickerUrl(code, big ? 384 : 128, 1, sv), Math.max(1, Math.min(STICKER_TIMEOUT_MS, deadline - Date.now())))
      if (!(res.headers.get('content-type') ?? 'image/webp').startsWith('image/')) return
      // Satori can't draw WebP (it renders nothing), so each sticker goes in as a PNG.
      const png = await stickerPng(await res.arrayBuffer(), big ? LARGE_PX : undefined)
      const url = `data:image/png;base64,${png.toString('base64')}`
      out.set(code, url)
      if (stickerCache.size >= STICKER_CACHE_MAX) stickerCache.delete(stickerCache.keys().next().value!)
      stickerCache.set(key, url)
    } catch { /* left out */ }
  }))
  return out
}
