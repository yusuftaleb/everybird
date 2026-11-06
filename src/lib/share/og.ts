// Link previews (Open Graph images), the pure parts: which birds to draw and what the metadata says.
// The server pieces (fonts, masks, stickers, the image itself) are in og-server.ts and the route's opengraph-image.tsx.
import { decodeShare, type SharePayload } from './link'

export const OG_SIZE = { width: 1200, height: 630 } as const
/** The collage's area on the left of the image. */
export const OG_COLLAGE = { w: 640, h: 560 } as const
export const OG_MAX_BIRDS = 60
/** For someone who has never heard of Everybird (the shared page says the same under its title). */
export const OG_DESCRIPTION = "Everybird turns a birder's life list into a sticker collage."


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

/** The shared page's h1: "Ada's life list", or "A birder's life list" with no name. The brand stays in the site name. */
export function ogName(p: Pick<SharePayload, 'name'>): string {
  return p.name?.trim() ? `${p.name.trim()}'s life list` : "A birder's life list"
}

/** "Ada's life list: 197 species", "A life list: 197 species" without a name; "Everybird" for a broken link. */
export function ogTitle(p: SharePayload | null): string {
  if (!p) return 'Everybird'
  const who = p.name?.trim() ? `${p.name.trim()}'s life list` : 'A life list'
  return `${who}: ${p.birds.length.toLocaleString('en-US')} species`
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
 * stickers than expected is cached only briefly (ogCacheControl), so a fetch hiccup doesn't stick for a year.
 */
export function ogResponseOptions<F>(fonts: F[], stickers: { placed: number; expected: number }) {
  const complete = fonts.length >= OG_FONT_COUNT && stickers.placed >= stickers.expected
  return { fonts: fonts.length ? fonts : undefined, headers: { 'cache-control': ogCacheControl(complete) } }
}
