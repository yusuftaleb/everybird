// Link previews (Open Graph images), the pure parts: which birds to draw and what the metadata says.
// The server pieces (fonts, masks, stickers, the image itself) are in og-server.ts and the route's opengraph-image.tsx.
import { TAGLINE } from './image'
import { decodeShare, type SharePayload } from './link'

export const OG_SIZE = { width: 1200, height: 630 } as const
/** The collage's area on the left of the image. */
export const OG_COLLAGE = { w: 640, h: 560 } as const
export const OG_MAX_BIRDS = 60
export const OG_DESCRIPTION = TAGLINE

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

/** The page header's name part: "Ada's Everybird", or "An Everybird" with no name (the shared page's h1). */
export function ogName(p: Pick<SharePayload, 'name'>): string {
  return p.name?.trim() ? `${p.name.trim()}'s Everybird` : 'An Everybird'
}

/** "Ada's Everybird — 197 species", "An Everybird — 197 species" without a name; "Everybird" for a broken link. */
export function ogTitle(p: SharePayload | null): string {
  return p ? `${ogName(p)} — ${p.birds.length.toLocaleString('en-US')} species` : 'Everybird'
}

/** The payload a route's `[token]` segment carries, or null for a broken, oversized or newer-version link. */
export function tryDecodeShare(token: string): SharePayload | null {
  try {
    return decodeShare(decodeURIComponent(token))
  } catch {
    return null
  }
}
