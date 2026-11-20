// Link previews (Open Graph images), the pure parts: which birds to draw and what the metadata says.
// The server pieces (fonts, masks, stickers, the image itself) are in og-server.ts and the route's opengraph-image.tsx.
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import type { Ui } from '@/i18n/messages/en'
import { decodeShare, type SharePayload } from './link'

/** The strings the shared page's title, h1 and metadata read: the shared view's (`ui.shared`, one source with the
 *  page), the share area's old-link and untitled titles, and the number separators. */
export type OgStrings = Pick<Ui, 'share' | 'shared' | 'num'>

export const OG_SIZE = { width: 1200, height: 630 } as const
/** The collage's area on the left of the image. */
export const OG_COLLAGE = { w: 640, h: 560 } as const
export const OG_MAX_BIRDS = 60
/** For someone who has never heard of Everybird: the shared page's lede under its title (`ui.shared.lede`), so the
 *  page and its metadata say the same in every language. */
export function ogDescription(t: OgStrings): string {
  return t.shared.lede
}

/**
 * At most `max` birds, chosen by stepping evenly through the list in taxonomic order (`to`), so every group of the
 * taxonomy is represented in proportion to the list. Returns them in taxonomic order. A list within `max` is kept whole.
 */
export function pickOgBirds<T extends { to: number }>(birds: readonly T[], max = OG_MAX_BIRDS): T[] {
  const sorted = [...birds].sort((a, b) => a.to - b.to)
  const n = sorted.length
  if (n <= max) return sorted
  // The middle of each of `max` equal slices: indices are strictly increasing because n / max > 1.
  return Array.from({ length: max }, (_, i) => sorted[Math.floor(((i + 0.5) * n) / max)])
}

/** The birds the card draws: only species with a sticker (`st`), then pickOgBirds, so no slot is left empty. */
export function pickOgStickers<T extends { to: number; st: boolean }>(birds: readonly T[], max = OG_MAX_BIRDS): T[] {
  return pickOgBirds(birds.filter((b) => b.st), max)
}

/**
 * A shared link's title, or null without one: a new link's title verbatim in every language ("Birds of 2026",
 * F_TITLE), an old link's bare name as `t.share.oldLinkTitle` ("Ada" -> "Ada's life list", "Lista de vida de Ada").
 */
export function shareTitle(p: Pick<SharePayload, 'name' | 'titled'>, t: OgStrings): string | null {
  const name = p.name?.trim()
  if (!name) return null
  return p.titled ? name : fmt(t.share.oldLinkTitle, { name })
}

/** The shared page's h1 and the link preview's title: shareTitle, or `ui.shared.untitled` ("A birder's life list"). */
export function ogName(p: Pick<SharePayload, 'name' | 'titled'>, t: OgStrings): string {
  return shareTitle(p, t) ?? t.shared.untitled
}

/** The document title: "<title> · Everybird"; "A life list: 197 species" without a title ("Una lista de vida: 1.234
 *  especies"); "Everybird" for a broken link. */
export function ogTitle(p: SharePayload | null, t: OgStrings): string {
  if (!p) return 'Everybird'
  const title = shareTitle(p, t)
  const n = p.birds.length
  return title ? `${title} · Everybird` : plural(t.share.untitledTitle, n, { n: formatInt(n, t.num) })
}

/** The payload a route's `[token]` segment carries, or null for a broken, oversized or newer-version link. */
export function tryDecodeShare(token: string): SharePayload | null {
  try {
    return decodeShare(decodeURIComponent(token))
  } catch {
    return null
  }
}

export const OG_FONT_COUNT = 3 // Satoshi 500, Cabinet Grotesk 700, Geist Mono 400
/** The fonts a card in `lang` needs to be complete: a Russian card's Noto Sans 500 and 700 too (og-server's SOURCES). */
export const ogFontCount = (lang?: string): number => OG_FONT_COUNT + (lang === 'ru' ? 2 : 0)
/**
 * A complete card never changes: the token is content-addressed (the link encodes the list, so a different list is a
 * different URL). Browsers keep it a day, the CDN a year (one render per token per region until evicted), and a stale
 * copy is served for a week while it revalidates.
 */
export const OG_CACHE_COMPLETE = 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800'
/** A card missing a font or a sticker: a minute, so a fetch hiccup doesn't stick. */
export const OG_CACHE_DEGRADED = 'public, max-age=60, s-maxage=60'
export const ogCacheControl = (complete: boolean) => (complete ? OG_CACHE_COMPLETE : OG_CACHE_DEGRADED)

/**
 * ImageResponse options that depend on how the card came out. No fonts at all -> `fonts: undefined`, so next/og keeps
 * its default font (an empty array would replace it and satori would throw). A card with a missing font or fewer
 * stickers than expected, a collage that failed, a names file that didn't load, or a broken token is cached only briefly (ogCacheControl), so a
 * fetch hiccup doesn't stick for a year.
 */
export function ogResponseOptions<F>(fonts: F[], card: { placed: number; expected: number; failed?: boolean; broken?: boolean; namesFailed?: boolean; lang?: string }) {
  // `failed`: the collage threw (species, masks or stickers), so the text card stood in. `broken`: the token didn't
  // decode. Neither is the token's real card, so neither is cached for a year.
  const complete = !card.failed && !card.broken && !card.namesFailed && fonts.length >= ogFontCount(card.lang) && card.placed >= card.expected
  return { fonts: fonts.length ? fonts : undefined, headers: { 'cache-control': ogCacheControl(complete) } }
}

/**
 * The card's root `lang` (satori's locale): next/og fills the characters the card's fonts lack from Google Fonts by it,
 * so Chinese text never gets Japanese letter forms: ja-JP (Noto Sans JP), zh-CN (SC), zh-TW (TC). Undefined otherwise.
 */
export function ogLang(lang: string): string | undefined {
  return ({ ja: 'ja-JP', 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW' } as Partial<Record<string, string>>)[lang]
}
