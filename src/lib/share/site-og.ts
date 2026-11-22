// The site's own link preview (every public page but /s/ and /c/, which draw their list's card): the landing sample's
// collage in Free, its wide seed layout (public/data/sample-pack.v1.json) scaled to the card's width and cut to its
// middle band, with a badge in the middle where the app draws the count: the origami mark, "Everybird" and the
// language's tagline. Pure geometry here; scripts/build-data/build-og.ts draws it, once per language, into
// public/og/<lang>.jpg (static files, never rendered per request).
import type { Lang } from '@/i18n/langs'
import type { PackedLayout } from '@/lib/list/sample-pack'

export const SITE_OG = { width: 1200, height: 630 } as const
/** The badge, centred on the card: inside the central 630 × 630 square a chat may crop the card to. */
export const SITE_OG_BADGE = { w: 540, h: 224, r: 32, pad: 28 } as const
/** The badge's type (px): the mark and the wordmark (Cabinet Grotesk 700) on one row, the tagline (Satoshi 500) under
 *  them, centred, at most two lines (tests/site-og.test.ts measures every language's). */
export const SITE_OG_TYPE = { mark: 64, word: 64, gap: 14, tagline: 28, line: 1.25, below: 14 } as const
/** Air between the badge and every sticker's box. */
export const SITE_OG_GAP = 16

export type Rect = [x: number, y: number, w: number, h: number]
export type OgTile = { code: string; box: Rect }

/** The square a chat crops a wide card to: its middle, as tall as the card. */
export const centreSquare = (): Rect => [(SITE_OG.width - SITE_OG.height) / 2, 0, SITE_OG.height, SITE_OG.height]

export function badgeRect(): Rect {
  const { w, h } = SITE_OG_BADGE
  return [(SITE_OG.width - w) / 2, (SITE_OG.height - h) / 2, w, h]
}

/** Whether two rects overlap (touching edges count: "no sticker touches the badge"). */
export const overlaps = (a: Rect, b: Rect) => a[0] <= b[0] + b[2] && b[0] <= a[0] + a[2] && a[1] <= b[1] + b[3] && b[1] <= a[1] + a[3]

/**
 * The seed's stickers on the card: the stage scaled to the card's width (so the collage runs edge to edge, the
 * stickers at the app's own size), its vertical middle on the card's, each box in card px. Only boxes that show on the
 * card, and none within SITE_OG_GAP of the badge (the count's hole is smaller than the badge, so the badge's own hole
 * is cut from the seed: the birds there are left out, nothing is packed again).
 */
export function siteOgTiles(seed: Pick<PackedLayout, 'W' | 'H' | 'codes' | 'boxes'>): OgTile[] {
  const k = SITE_OG.width / seed.W
  const dy = SITE_OG.height / 2 - (seed.H / 2) * k
  const [bx, by, bw, bh] = badgeRect()
  const clear: Rect = [bx - SITE_OG_GAP, by - SITE_OG_GAP, bw + 2 * SITE_OG_GAP, bh + 2 * SITE_OG_GAP]
  return seed.codes.flatMap((code, i) => {
    const [x, y, w, h] = seed.boxes.slice(4 * i, 4 * i + 4)
    const box: Rect = [x * k, y * k + dy, w * k, h * k]
    // strictly inside the card: a box only touching its edge draws nothing
    const shows = box[0] < SITE_OG.width && box[0] + box[2] > 0 && box[1] < SITE_OG.height && box[1] + box[3] > 0
    return shows && !overlaps(clear, box) ? [{ code, box }] : []
  })
}

/** The card's tagline: the language's landing title without its "Everybird · " ("Turn your bird life list into a collage"). */
export function siteTagline(metaTitle: string): string {
  return metaTitle.replace(/^Everybird · /, '')
}

/** The card's file in public/: one per language. */
export const siteOgPath = (lang: Lang) => `/og/${lang}.jpg`
