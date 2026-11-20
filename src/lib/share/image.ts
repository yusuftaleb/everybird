// Share images: a story (1080 × 1920), post (1080 × 1350) or square (1080 × 1080) PNG of the collage, or of the current filtered view,
// and the print poster's card (A4 to A1 and three US sizes, drawn by poster code in strips). Horizontal (the dialog's orientation switch): the
// story becomes a desktop wallpaper (1920 × 1080 units drawn at 2×, a 3840 × 2160 PNG, all its content in the central 3:2 column, DESKTOP_SIDE) and the post a 5:4 wide (1350 × 1080);
// the poster turns to landscape (print.ts). The tables below have a row for each; imageShape picks a slot's shape.
//
// Layout (cardLayout), on Paper with 64px side margins, all text left-aligned. It leads with the birder, not the
// product: people share a brag, not an app card.
//   top     the name, if given (Cabinet Grotesk 700, 56px), then the count (Cabinet 96px, "197 species"), then, for a
//           filtered view, the filter in words (Satoshi 500 32px, Accent)
//   middle  the collage, packed for the space left (layout worker 'image' message: packFrame, the count's hole at its
//           centre); no sticker longer than 30% of the collage wide (36% up to 24 birds)
//   bottom  a Hairline rule, "Latest lifer: Western Grebe · Sep 2026" (Satoshi 32px; unless the dialog's "Show latest
//           lifer" switch is off, when the collage takes its room), then the footer: the Everybird wordmark and one
//           quiet line beside it, the site, the sticker credit and the date the image was made
//           ("everybird.yusuftaleb.com · stickers by huashu · 14 Nov 2026", stamp.ts; Geist Mono 20px, Muted).
//           The full credit, with the licence, travels in the share text.
// The story keeps the story safe zones clear: nothing in the top 160px (the profile row; the title from 184) or the
// bottom 156px (the reply bar); the post and the square use 64px margins all round. The story's collage is tall (about 952 × 1284 with
// a name and the latest lifer): packFrame packs it for that aspect (the spiral stretched to it, as the narrow layout's
// 0.55), so it is a tall rounded cluster, and fitPack spreads a short list's ring to its height (SPREAD).
// Stickers load with crossOrigin = 'anonymous' (the stickers site sends access-control-allow-origin: *), so the
// canvas stays exportable. Species without a sticker, and stickers that fail to load, are drawn as a thin outline of
// the Phosphor Bird in Line (a solid silhouette would be the heaviest shape in the image). Text waits for the real
// fonts (document.fonts.load) before drawing.
//
// Two steps: prepareCard computes everything (layout, pack, fit, tiles and their URLs, text, fonts, where the footer
// line goes) and paintCard only draws it, in 1080-wide design units under the caller's transform, culling tiles to a
// y-range (tileInRange) but never text. drawShareImage is the two on one canvas at identity.
// The print poster ('print', print.ts) is the same card 1080 units wide and as tall as its size (printDesignH), with
// 64px margins all round, in the dialog's theme, packed once per shape (printPackH); prepareCard's `scale` (device px per unit)
// picks its sticker tier (printStickerUrl: 1024 with the 384 fallback for big tiles), and the poster paints it in strips.
import { SHARE_ORIGIN } from '@/lib/share/origin'
import { BIRD_PATH, OUTLINE_SCALE } from '@/lib/bird-outline'
import { printStickerUrl, stickerUrl } from '@/lib/sticker-url'
import { fmt } from '@/i18n/core'
import { formatMonth } from '@/i18n/format'
import { PRINT_DESIGN_W, captionMinPx, printDesign, printPackH, type PrintSize } from '@/lib/share/print'
import { RING_PAD, defaultCaptionMeasure, planCaptions, verifyAndPlaceCaptions, type CaptionBox, type CaptionPlan, type PlacedTile, type TextMeasurer } from '@/lib/share/captions'
import { stampDate, stampStrings, withStamp } from '@/lib/share/stamp'
import type { Box } from '@/lib/layout/pack'
import type { Arrangement } from '@/lib/arrangement'
import { COMMA_DROP, DIGIT_CAP, LABEL, MONO_CAP, MONO_CAP_ACCENT, MONO_LINE, NO_HOLE, NUM_LINE, columnBoxes, countDisplay, countText, labelEm, numberEm, scaleHole, type Hole } from '@/lib/layout/count-box'
import type { Ui } from '@/i18n/messages/en'
import type { ListEntryMsg, WorkerReply, WorkerRequest } from '@/lib/layout/layout.worker'
import { firstLifer, latestLifer, liferOrder } from '@/lib/list/build-list'
import { continentNames, namesLabel, placesLabel, regionNames, seenLabels, statusLabel } from '@/lib/list/filter-summary'
import type { Filter } from '@/lib/list/filters'
import { rangeLabel } from '@/lib/list/timeline'
import type { ListEntry } from '@/lib/list/model'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { orderLabel } from '@/lib/species/orders'

/**
 * A share image's shape: vertical 9:16 (story, 1080×1920), 4:5 (post, 1080×1350) and 1:1 (square), or horizontal 16:9
 * (desktop, a wallpaper, 1920×1080 design units drawn at 2×: 3840×2160) and 5:4 (wide, 1350×1080). The dialog's format
 * slot and its orientation pick one (imageShape); the analytics names are these.
 */
export type ImageFormat = 'story' | 'post' | 'square' | 'desktop' | 'wide'
/** The dialog's three format buttons. Horizontal turns story into desktop and post into wide; square stays square. */
export type FormatSlot = 'story' | 'post' | 'square'
export type Orientation = 'vertical' | 'horizontal'
/** The shape a slot makes in an orientation. */
export function imageShape(slot: FormatSlot, orientation: Orientation): ImageFormat {
  if (orientation === 'vertical' || slot === 'square') return slot
  return slot === 'story' ? 'desktop' : 'wide'
}

/** The UI language's strings a share image draws: the count, the filter label (orders, places, months, ranges), the
 *  latest lifer row's label and the date stamp. The credit line (FOOTER_LINE) is the same in every language. */
export type ShareStrings = Pick<Ui, 'share' | 'count' | 'num' | 'date' | 'filters' | 'orders' | 'places' | 'iucn'>
/** A share image's design size in units (the card is laid out in these). */
export const IMAGE_SIZE: Record<ImageFormat, [w: number, h: number]> = {
  story: [1080, 1920], post: [1080, 1350], square: [1080, 1080], desktop: [1920, 1080], wide: [1350, 1080],
}
/**
 * Device px per design unit when the image is drawn, so the PNG is IMAGE_SIZE × IMAGE_SCALE: the desktop image is
 * twice its design (3840 × 2160; sharp on a 4K or Retina screen), the others 1:1 with their design. A poster has no entry: it draws at its
 * own scale (prepareCard's `scale`, device px per unit), and its preview (drawShareImage) at 1.
 */
export const IMAGE_SCALE: Record<ImageFormat, number> = { story: 1, post: 1, square: 1, desktop: 2, wide: 1 }
/** A card's format: a share image, or the print poster, portrait or landscape (1080 design units across the short side; print.ts). */
export type CardFormat = ImageFormat | 'print' | 'printLandscape'
/** Whether a card is a poster (portrait or landscape) rather than a share image. */
export const isPrint = (f: CardFormat): f is 'print' | 'printLandscape' => f === 'print' || f === 'printLandscape'
/** The longest name the dialog accepts: what a share link carries (link.ts NAME_MAX; a test keeps them equal). */
export const NAME_MAX_LEN = 40
/** The footer's site name: the share origin's host ("everybird.yusuftaleb.com"). */
export const SITE_LABEL = new URL(SHARE_ORIGIN).host
/**
 * The footer's one line beside the wordmark on share images and link previews: the site and the sticker credit. Share
 * images end it with the date stamp (stamp.ts withStamp); link previews don't.
 */
export const FOOTER_LINE = `${SITE_LABEL} · stickers by huashu`
/** The full sticker credit (CC BY 4.0), for the share sheet's text: the image itself carries FOOTER_LINE. */
export const SHARE_CREDIT = 'Stickers: huashu-bird-sticker (CC BY 4.0) github.com/alchaincyf/huashu-bird-sticker'

/** The design tokens (tokens.css; a test keeps them equal). The image follows the page's current theme. */
export const SHARE_COLORS = {
  light: { ink: '#1e1e24', paper: '#f6f4ef', accent: '#92140c', muted: '#5f5f69', line: '#857f74', hairline: '#dedad2', surface: '#ebe8e1' },
  dark: { ink: '#ffffff', paper: '#1e1e24', accent: '#f06a5f', muted: '#a9a9b2', line: '#76767f', hairline: '#3d3d45', surface: '#28282f' },
} as const
export type ShareColors = { [K in keyof typeof SHARE_COLORS.light]: string }

/**
 * The latest lifer row's two lines: the mono label "Latest lifer · Sep 2026" ("Última especie nueva · sept 2026"; the
 * date part only when there is one) and the bird's name.
 */
export function latestText(latest: { com: string; date?: string }, t: Pick<Ui, 'share' | 'date'>): { label: string; name: string } {
  const d = formatMonth(latest.date, t.date.months)
  return { label: `${t.share.latestLifer}${d ? ` · ${d}` : ''}`, name: latest.com }
}

/**
 * The current filter in words, in `t`'s language, birds (a group, an order or family) then status then places then time: "Egypt · 2026", "Herons · Canada + Egypt",
 * "Herons · Threatened · Canada" (filter-summary.ts statusLabel); a range reads
 * "Mar 2020 to Jun 2021" (timeline.ts rangeLabel). With `regions`, places at every level by their short names
 * ("Owls · British Columbia"); without, the countries only. Country names are whatever `regions` and `countryName` say
 * (the dialog passes them localized, i18n-places.ts regionsIn); family names are the data's.
 * Undefined when nothing is filtered.
 */
export function filterLabel(
  f: Filter,
  ctx: { species: SpeciesIndex; countryName: (iso2: string) => string; regions?: Pick<Regions, 'countries' | 'sub1'>; /** A family's name to show (default: English). */ familyName?: (row: SpeciesRow) => string; /** A bird group's name in the UI language (Filter.group). */ groupName?: (id: string) => string | undefined },
  t: ShareStrings,
): string | undefined {
  // Places: "Africa + Canada", "Canada + Egypt", "Capital and 2 more" (continents first).
  const place = ctx.regions ? placesLabel(f, ctx.regions, t) : namesLabel([...continentNames(f.continents, t), ...regionNames(f.regions, t), ...(f.countries ?? []).map((c) => ctx.countryName(c.slice(0, 2)))], t)
  const parts: string[] = []
  if (f.group) parts.push(ctx.groupName?.(f.group) ?? f.group)
  if (f.family) { const r = ctx.species.rows.find((x) => x.fam === f.family); parts.push(r ? (ctx.familyName?.(r) ?? r.famCom) || f.family : f.family) }
  else if (f.order) parts.push(orderLabel(f.order, t))
  const status = statusLabel(f.statuses, t)
  if (status) parts.push(status)
  // Basis 'seen': "Seen in Canada · 2026" (a range alone: "Seen: 2026").
  const said = seenLabels(f, place, rangeLabel(f.from, f.to, t), t)
  if (said.place) parts.push(said.place)
  if (said.range) parts.push(said.range)
  else if (f.year) parts.push(f.year)
  return parts.length ? parts.join(' · ') : undefined
}

// --- layout ---

const M = 64
/**
 * The desktop wallpaper is crop-proof without knowing the screen (Safari hides it): everything sits in the central 3:2
 * column, 1620 units wide, so 150 units each side are plain Paper. The OS's "fill" on a 3:2 to 16:10 screen crops only
 * those bands; on 16:9 they are quiet side margins. The usual M applies inside the column (text from x = 214).
 */
export const DESKTOP_SIDE = 150
/** A card's left and right margin: M, and on the desktop the empty band as well. */
const sideMargin = (format: CardFormat) => M + (format === 'desktop' ? DESKTOP_SIDE : 0)
/**
 * Clear of the platform's own chrome: a story keeps the top 160px (the progress bar and the profile row) and the bottom
 * 156px (the reply bar) empty; the post and the square use 64px margins all round. The story's numbers come from a real
 * Vertical story view (2026-11-06): its title starts at 184 (TITLE_TOP), with air under the profile row, and the footer
 * ends about 150px of the phone's screen above "Say something", in the band the reply bar leaves empty.
 */
export const SAFE: Record<CardFormat, { top: number; bottom: number }> = {
  story: { top: 160, bottom: 156 }, post: { top: M, bottom: M }, square: { top: M, bottom: M }, print: { top: M, bottom: M },
  // A desktop wallpaper keeps clear of the menu bar (about 37 units at the top of a 1080-unit screen: 72 leaves air under
  // it) and the Windows taskbar up to 150% or a Mac Dock's lower part (80 units: the footer line ends 86 above the edge and
  // the latest lifer row's sticker 80); the sides keep M inside the central column (DESKTOP_SIDE).
  desktop: { top: 72, bottom: 86 }, wide: { top: M, bottom: M }, printLandscape: { top: M, bottom: M },
}
/** Where the title starts (the collage starts at SAFE.top when there's no title). */
export const TITLE_TOP: Record<CardFormat, number> = { story: 184, post: M, square: M, print: M, desktop: 72, wide: M, printLandscape: M }
/** The latest lifer's sticker: 76 square for the tall and wide cards, 68 for the post and square (the 5:4 included). */
const ICON: Record<CardFormat, number> = { story: 76, post: 68, square: 68, print: 76, desktop: 76, wide: 68, printLandscape: 76 }
/**
 * The cards whose footer is one line: the wordmark, the site and the credit on the left and the latest lifer row on the
 * right, all on the footer's baseline (cardLayout, placeFooter). Only the desktop: its width follows the screen (1,308 to
 * 2,464 units of text), and placeFooter clips a long name to the room the credit leaves at 17px. The 5:4 card (1,222) and
 * the landscape poster (about 1,400, with the credit at 17px) are too narrow for the row beside the credit, so they keep
 * the row stacked above the hairline (tests/orientation.test.ts measures it).
 */
const LATEST_ONE_LINE: Partial<Record<CardFormat, true>> = { desktop: true }
/**
 * The footer-line latest row's sticker (px square), label and name sizes and the gap after the sticker. The row is two
 * lines inside the footer's line, right-aligned: the mono label over the name (the name on the footer's baseline), the
 * sticker to their left, centred on the pair. A name too wide for the room left shrinks to nameMin (80%) before it is clipped.
 */
/** How far the wordmark and the credit line are lifted when the two-line row is on, to centre their caps on the row's block. */
export const FOOTER_LIFT = 11.5
const ONE_LINE = { icon: 40, label: 20, name: 30, gap: 14, nameMin: 0.8 }
/** The gap between the footer line and the latest row on its right. */
const FOOTER_GAP = 32
/**
 * The gaps (px) between the head and the collage, the collage and the latest lifer row, and that row and the hairline.
 * The story, the post and the print keep them tighter so their collages take the height; the square keeps its own.
 */
const GAPS: Record<CardFormat, { head: number; collage: number; latest: number }> = {
  story: { head: 40, collage: 32, latest: 24 }, post: { head: 40, collage: 32, latest: 24 }, square: { head: 48, collage: 40, latest: 32 },
  print: { head: 40, collage: 32, latest: 24 }, desktop: { head: 40, collage: 24, latest: 24 }, wide: { head: 40, collage: 32, latest: 24 },
  printLandscape: { head: 40, collage: 32, latest: 24 },
}
/**
 * How far fitPack may spread the birds' centres vertically to fill a tall collage (sizes kept, distances only grow):
 * the story's tall frame most, the post's a little, the square not at all. The print (about 0.71 wide to tall) sits
 * between the story and the post.
 */
export const SPREAD: Record<CardFormat, number> = { story: 1.6, post: 1.25, square: 1, print: 1.4, desktop: 1.25, wide: 1, printLandscape: 1.25 }
/**
 * The count's largest size (Cabinet Grotesk 700, px) per format; it shrinks for long numbers (countLayout). It reads
 * as a label in the ring, in /lifelist's proportion: "197" is about 17% of the collage wide (the site's medium
 * layout: 11.5%, narrow: 16%).
 */
const COUNT_MAX: Record<CardFormat, number> = { story: 112, post: 104, square: 96, print: 112, desktop: 112, wide: 104, printLandscape: 112 }
/** The link preview's (1200 × 630, a 640px collage). */
export const OG_COUNT_MAX = 72
/**
 * The number is never wider than this share of the collage's width (measured with count-box.ts's widths): "197" stays
 * at the format's largest size, "1,089" and "11,019" shrink so the hole doesn't eat the collage.
 */
const COUNT_W = 0.26
/** Air between the count's text and the edge of its hole, as a share of the number's size (as the collage's 0.17 F). */
const COUNT_PAD = 0.17

type Text = { y: number; size: number }
/**
 * The count at the centre of the collage: the number (size, px), the mono label under it, and the hole kept for them.
 * `number` and `label` are the geometry's text (en-US countText, "SPECIES"), for measuring only: what is drawn is the
 * UI language's (countDisplay, `count.label` upper-cased), never wider, so the hole is the same in every language.
 */
export type CountLayout = {
  number: string
  label: string
  size: number
  labelSize: number
  /** Gap between the number's baseline and the label's cap line. */
  gap: number
  /** The hole (px, about the collage's centre) the packer keeps empty: the drawn text's boxes, grown by its pad. */
  hole: Hole
}
export type CardLayout = {
  W: number
  H: number
  name?: Text
  filter?: Text
  collage: { x: number; y: number; w: number; h: number }
  count: CountLayout
  /**
   * The latest lifer row. Stacked (`oneLine` false): its sticker (icon px square, at x) beside two lines in a column `tw`
   * wide, a mono label over the bird's name, above the hairline. One line (LATEST_ONE_LINE): the sticker at y on the
   * footer's line, the label and name on its baseline, all placed by placeFooter from the text's measured widths.
   */
  latest?: { x: number; y: number; icon: number; tw: number; label: number; name: number; oneLine: boolean }
  rule: { y: number }
  footer: Text & { credit: number }
  /** The largest sticker's long side as a share of the collage width (maxTileFrac of the count). */
  maxTile: number
  /** The largest sticker's long side in px (maxTileSide's cap; 440, the desktop 512). */
  maxSide: number
}
export type CountSize = 'small' | 'medium' | 'large' | 'hide'

export type CardContent = { name: boolean; filter: boolean; latest: boolean; count: number; target?: number; countSize?: CountSize }

/**
 * The count in the middle, as the app's Tally and /lifelist's .yt-ll-mid: the shown count over "SPECIES" (a filtered
 * view too: the filter label on top says what it is). The number shrinks so it never takes more than COUNT_W of the
 * collage's width. `format` sets the largest size (or pass it in px: the link preview's smaller card).
 * The hole holds the text as renderShareImage draws it: one column centred on the collage's centre, the digits' height
 * (the comma's foot below the baseline counted in), the gap, the label's caps. The label's box reaches up to an
 * accented capital's ink (MONO_CAP_ACCENT, pt's "ESPÉCIES") into the gap, and holds COUNT_LABEL_CHARS characters; the
 * column's height, and so where the text is drawn, stays the caps'.
 */
export function countLayout(format: CardFormat | number, count: number, collageW: number, target?: number, countSize: CountSize = 'medium'): CountLayout {
  if (countSize === 'hide') return { number: '', label: '', size: 0, labelSize: 0, gap: 0, hole: NO_HOLE }
  const baseMax = typeof format === 'number' ? format : COUNT_MAX[format]
  const max = countSize === 'small' ? baseMax * 0.72 : countSize === 'large' ? baseMax * 1.28 : baseMax
  const countW = countSize === 'small' ? COUNT_W * 0.72 : countSize === 'large' ? Math.min(0.68, COUNT_W * 1.2) : COUNT_W
  const number = target !== undefined ? `${countText(count)} / ${countText(target)}` : countText(count)
  const label = LABEL
  const em = numberEm(number)
  const size = Math.round(Math.min(max, (countW * collageW) / em))
  // The label: a fifth of the number up to 22px, never under 18px on the share images (a long count's number is smaller).
  const labelMin = typeof format === 'number' ? 0 : countSize === 'small' ? 14 : 18
  const labelSize = Math.round(Math.max(Math.min(22, size * 0.2), Math.min(28, size * 0.14), labelMin))
  const gap = Math.round(size * 0.14)
  const drop = COMMA_DROP * size
  const accent = (MONO_CAP_ACCENT - MONO_CAP) * labelSize
  // `gap - drop - accent` is negative at most sizes: the comma's foot and the accent's ink share the gap, so the two boxes
  // overlap by design (the column's height is still digits + gap + caps). Clamping it would move the text.
  const boxes = columnBoxes(em * size, DIGIT_CAP * size + drop, gap - drop - accent, labelEm() * labelSize, MONO_CAP_ACCENT * labelSize)
  return { number, label, size, labelSize, gap, hole: { ...boxes, pad: COUNT_PAD * size } }
}

/**
 * The link preview's hole for its count (px): satori draws the column with line boxes, the number on a 0.85 line box,
 * the label on a 1.3 one (opengraph-image.tsx sets both), 0.6 x the gap between them.
 */
export function ogCountHole(K: CountLayout): Hole {
  const em = numberEm(K.number)
  const boxes = columnBoxes(em * K.size, Math.max(NUM_LINE, DIGIT_CAP + COMMA_DROP) * K.size, K.gap * 0.6 - Math.max(0, DIGIT_CAP + COMMA_DROP - NUM_LINE) * K.size, labelEm() * K.labelSize, MONO_LINE * K.labelSize)
  return { ...boxes, pad: COUNT_PAD * K.size }
}

/**
 * Where everything goes; text y is the top of its em box (textBaseline 'top'). The count sits at the collage's centre.
 * `dims` is the card's design size (width, height): the format's own by default (cardDims), or a number for the height
 * alone (the print's default width). The poster passes printDesign(size, landscape) to lay out one size exactly.
 */
export function cardLayout(format: CardFormat, c: CardContent, dims?: readonly [w: number, h: number] | number): CardLayout {
  // A number is the height alone (the default width): the print's height is the one thing a caller varies.
  const [W, H] = typeof dims === 'number' ? [cardDims(format)[0], dims] : (dims ?? cardDims(format))
  const { top: T, bottom: B } = SAFE[format]
  const X = sideMargin(format)
  // Top: only the name and the filter in words; with neither, the collage starts at the safe line.
  const name = c.name ? { y: TITLE_TOP[format], size: 60 } : undefined
  const filter = c.filter ? { y: name ? name.y + 76 : T, size: 34 } : undefined
  const headBottom = filter ? filter.y + filter.size : name ? name.y + name.size : undefined
  // Bottom, upwards: the footer (wordmark, site and credit on one line), a hairline, the latest lifer row.
  // The story's footer sits 4px higher so its descenders ("y", "(") clear the bottom safe line too.
  const footer = { y: H - B - 30 - (format === 'story' ? 4 : 0), size: 30, credit: 20 }
  const icon = ICON[format]
  const G = GAPS[format]
  // One line (LATEST_ONE_LINE): the row is on the footer's own line, on its right, so the hairline sits just above the
  // footer and the collage gets the height a stacked row took. Otherwise the row stacks above the hairline.
  // The one-line formats keep that geometry with the row off too (the row only leaves the line), so the collage's frame,
  // and with it the pack, is the same either way: the switch never moves a bird.
  const oneLine = !!LATEST_ONE_LINE[format]
  let rule: { y: number }
  let latest: CardLayout['latest']
  if (oneLine) {
    // With the row: the label's caps start at footer.y - 20, so the hairline is 40 above the footer line (20 of air over the
    // row). Without it the hairline is 20 above, as a one-line footer needs, and the collage fits the same pack to the room.
    rule = { y: footer.y - (c.latest ? 40 : 20) }
    latest = c.latest ? { x: X, y: footer.y - 18, icon: ONE_LINE.icon, tw: 0, label: ONE_LINE.label, name: ONE_LINE.name, oneLine } : undefined
  } else {
    rule = { y: footer.y - 30 }
    latest = c.latest ? { x: X, y: rule.y - G.latest - icon, icon, tw: W - 2 * X - icon - 20, label: 20, name: 34, oneLine } : undefined
  }
  const top = headBottom === undefined ? T : headBottom + G.head
  const bottom = (latest && !oneLine ? latest.y : rule.y) - G.collage
  const collage = { x: X, y: top, w: W - 2 * X, h: bottom - top }
  return { W, H, name, filter, collage, count: countLayout(format, c.count, collage.w, c.target, c.countSize), latest, rule, footer, maxTile: maxTileFrac(c.count), maxSide: MAX_SIDE[format] ?? 440 }
}

/**
 * A card's design size by default: the share image's, or the print's at its shape's pack height (printPackH: one pack
 * serves every A size, another each US shape; `size` defaults to A2; the landscape print is the same two swapped). The
 * print's real size comes from printDesign (print.ts).
 */
export function cardDims(format: CardFormat, size: PrintSize = 'A2'): [number, number] {
  if (format === 'print') return [PRINT_DESIGN_W, printPackH(size)]
  if (format === 'printLandscape') return [printPackH(size), PRINT_DESIGN_W]
  return IMAGE_SIZE[format]
}

/** What the layout worker packs for: the collage frame's aspect and the hole as fractions of the frame's width. */
/** `oval`: the share dialog's Oval (arrangement.ts); left out for Packed. */
export type PackSpec = { aspect: number; hole: Hole; maxTile: number; captionBoxes?: Record<string, { w: number; h: number; ring?: number }>; oval?: true }
export function packSpec(L: CardLayout): PackSpec {
  const { w, h } = L.collage
  return { aspect: w / h, hole: scaleHole(L.count.hole, 1 / w), maxTile: L.maxTile }
}

/**
 * Largest a sticker is drawn (long side) as a share of the collage's width: 30%, or 36% for a short list (up to 24
 * birds) so its ring around the count fills more of the frame. Either stays under the 384px files' sharpness.
 */
export const MAX_TILE = 0.3, MAX_TILE_SHORT = 0.36
export const maxTileFrac = (n: number) => (n <= 24 ? MAX_TILE_SHORT : MAX_TILE)
/**
 * That largest side in px (never past `cap`: 440, the 384px files' sharp size at 1×; the desktop's 2× tiles draw from the
 * 1024 file, so its cap is 512, MAX_SIDE).
 */
export function maxTileSide(collageW: number, frac = MAX_TILE, cap = 440): number {
  return Math.min(cap, collageW * frac)
}
/** The largest tile's side cap per format (design units; see maxTileSide). */
const MAX_SIDE: Partial<Record<CardFormat, number>> = { desktop: 512 }

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
    const captions = spec.captionBoxes ? birds.map((b) => spec.captionBoxes![b.code] ?? { w: 0, h: 0 }) : undefined
    const msg: WorkerRequest = { type: 'image', id: 1, entries: birds, aspect: spec.aspect, hole: spec.hole, maxTile: spec.maxTile, ...(captions ? { captions } : {}), ...(spec.oval ? { oval: true } : {}) }
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
 * lifer) and the count's hole. The dialog packs once per format, name-or-not and lifer-or-not; the drawing maps the pack onto
 * whatever frame it gets. The print packs once per shape (cardDims with `size`: every A size at PRINT_DESIGN_H).
 */
export function imagePackSpec(format: CardFormat, c: CardContent, size?: PrintSize, captionPlan?: Extract<CaptionPlan, { ok: true }>, arrangement: Arrangement = 'packed'): PackSpec {
  // Always the frame with the latest lifer row (the smaller one): the "Show latest lifer" switch never changes the pack.
  // With the row off, the same pack is fitted into the taller area (fitPack), so every bird keeps its place.
  const L = cardLayout(format, { ...c, latest: true }, cardDims(format, size))
  const spec: PackSpec = { ...packSpec(L), ...(arrangement === 'oval' ? { oval: true } : {}) }
  if (!captionPlan) return spec
  const captionBoxes: NonNullable<PackSpec['captionBoxes']> = {}
  for (const [code, entry] of captionPlan.byCode) {
    captionBoxes[code] = { w: entry.w / L.collage.w, h: entry.h / L.collage.w, ...(entry.ring ? { ring: RING_PAD / L.collage.w } : {}) }
  }
  return { ...spec, maxTile: Math.min(spec.maxTile, L.maxSide / L.collage.w), captionBoxes }
}

// --- drawing ---

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

export type Tile = {
  x: number; y: number; w: number; h: number; url: string | null
  /** The print's 384 file, tried when its 1024 file (`url`) fails; absent or null otherwise. */
  fallback?: string | null
  mark?: 'newest' | 'first' | 'both'
}
/** A band of the card in design units, top (y0) to bottom (y1): the part a poster strip paints. */
export type PaintRange = { y0: number; y1: number }
/**
 * Whether a tile reaches into `range`, with 1 design unit of margin on both sides (antialiased edges and rounding).
 * The one test for culling: paintTiles draws exactly these tiles, and the poster loads and releases stickers by it,
 * so a tile is never drawn without its image.
 */
export function tileInRange(t: { y: number; h: number }, range: PaintRange): boolean {
  return t.y < range.y1 + 1 && t.y + t.h > range.y0 - 1
}
/**
 * Draw the collage's tiles: the sticker when it loaded, else a thin outline of the bird in `line` (never a hole). With
 * `range`, only the tiles tileInRange keeps.
 */
export function paintTiles(
  ctx: CanvasRenderingContext2D, tiles: Tile[], imgs: Map<string, CanvasImageSource | null>, line: string, range?: PaintRange, colors?: Pick<ShareColors, 'accent' | 'ink'>,
): void {
  const bird = new Path2D(BIRD_PATH)
  const ringed: Tile[] = []
  for (const t of tiles) {
    if (t.mark && (!range || (t.y - 7 < range.y1 && t.y + t.h + 7 > range.y0))) ringed.push(t)
    if (range && !tileInRange(t, range)) continue
    const img = t.url ? imgs.get(t.url) : null
    if (img) {
      ctx.drawImage(img, t.x, t.y, t.w, t.h)
      continue
    }
    // Outline: the icon's 256 grid, fitted (contain) at OUTLINE_SCALE of the tile and centred, stroked 2px thin at any
    // scale, so a missing sticker reads as a quiet placeholder, not the darkest shape in the image.
    const k = (OUTLINE_SCALE * Math.min(t.w, t.h)) / 256
    ctx.save()
    ctx.translate(t.x + (t.w - 256 * k) / 2, t.y + (t.h - 256 * k) / 2)
    ctx.scale(k, k)
    ctx.strokeStyle = line
    ctx.lineWidth = 2 / k
    ctx.lineJoin = 'round'
    ctx.stroke(bird)
    ctx.restore()
  }
  for (const t of ringed) {
    ctx.save()
    ctx.beginPath()
    const pad = 5, r = 10
    if (ctx.roundRect) ctx.roundRect(t.x - pad, t.y - pad, t.w + pad * 2, t.h + pad * 2, r)
    else ctx.rect(t.x - pad, t.y - pad, t.w + pad * 2, t.h + pad * 2)
    ctx.strokeStyle = t.mark === 'first' ? (colors?.ink ?? '#1e1e24') : (colors?.accent ?? '#92140c')
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.restore()
  }
}

/** The families canvas text uses: the page's own fonts (Fontshare and next/font), with the CSS fallbacks; on a page in
 *  Russian, Japanese or Chinese its Noto family (tokens.css --font-noto) after the Latin ones. */
function families(): { display: string; body: string; mono: string } {
  let mono = '', noto = ''
  if (typeof document !== 'undefined') {
    const css = getComputedStyle(document.documentElement)
    mono = css.getPropertyValue('--font-geist-mono').trim()
    noto = css.getPropertyValue('--font-noto').trim()
  }
  const n = noto ? `${noto}, ` : ''
  return {
    display: `"Cabinet Grotesk", "Satoshi", ${n}system-ui, sans-serif`,
    body: `"Satoshi", ${n}system-ui, -apple-system, "Segoe UI", sans-serif`,
    mono: `${mono ? `${mono}, ` : ''}"Geist Mono", ${n}ui-monospace, Menlo, monospace`,
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

/** The smallest size the footer line takes beside the wordmark before it moves to its own line. */
export const CREDIT_MIN = 17
/**
 * Where the footer line (the site and "stickers by huashu") goes, never truncated and never without the credit: beside
 * the wordmark (`inlineRoom` px) at `size` down to CREDIT_MIN, else on its own line (`fullRoom` px) at `size`,
 * shrinking only if even the full width is too narrow. `measure(px)` is the line's width at that size.
 */
export function placeCredit(measure: (px: number) => number, inlineRoom: number, fullRoom: number, size: number): { size: number; below: boolean } {
  for (let px = size; px >= CREDIT_MIN; px--) if (measure(px) <= inlineRoom) return { size: px, below: false }
  let px = size
  while (px > 8 && measure(px) > fullRoom) px--
  return { size: px, below: true }
}

export type ShareImageOpts = {
  format: CardFormat
  entries: ListEntry[]
  species: SpeciesIndex
  filterLabel?: string
  name?: string
  /** The page's theme. The print follows it too: dark is light ink on the dark paper. */
  theme: 'light' | 'dark'
  /** No background fill: a PNG of the birds and the text alone (to print on fabric). The text keeps `theme`'s ink. */
  transparent?: boolean
  /** The print's size (print only; default A2): the card's height is printDesignH(size). */
  printSize?: PrintSize
  /** A pack made earlier by packForImage for this format, these entries, name-or-not and lifer-or-not (the dialog keeps them). */
  pack?: ImagePack
  /** When the image is made, for the footer's date stamp; default `new Date()`. */
  now?: Date
  /** The footer line before its date stamp; default FOOTER_LINE. The Map and Tree images draw no stickers (view-image.ts). */
  footer?: string
  /** The latest lifer row; default true. False leaves it out and gives its room to the collage (cardLayout's `latest: false`). */
  latest?: boolean
  markNewest?: boolean
  markFirst?: boolean
  /** The UI language's strings the image draws: the count's number and label, the latest lifer's label and month, and
   *  the stamp's month. The filter label comes in words already (`filterLabel`, from the same strings). */
  strings: ShareStrings
  /** A bird's name to draw (the latest lifer's); default its English name. The dialog passes the display name. */
  nameOf?: (row: SpeciesRow) => string
  /** A species goal: the count reads "190 / 300". With `year`, the card's line names it ("Big Year 2026"); without, it is
   *  the shown list's goal (All time) and the line is the filter's. */
  goal?: { year?: number; target?: number; basis: 'seen' | 'lifer' }
  countSize?: CountSize
  showNames?: boolean
  /** How the birds are placed (default Packed); used when `pack` is not given. */
  arrangement?: Arrangement
  signal?: AbortSignal
}

/** The share image as a PNG (the print: its 1080-wide preview). Throws an AbortError when `signal` aborts. */
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
export function fitPack(
  pack: ImagePack, area: { x: number; y: number; w: number; h: number }, maxTile: number, spreadMax = 1,
  caps?: Map<string, { w: number; below: number }>,
): PackFit {
  const ux = pack.W / 2, uy = pack.H / 2
  const cx = area.x + area.w / 2, cy = area.y + area.h / 2
  const k = Math.min(area.w / pack.W, area.h / pack.H)
  let dx = 0, dy = 0, maxL = 0
  for (const [, [x, y, w, h]] of pack.boxes) {
    dx = Math.max(dx, ux - x, x + w - ux)
    dy = Math.max(dy, uy - y, y + h - uy)
    maxL = Math.max(maxL, w, h)
  }
  if (!maxL) return { s: k, cx, cy, ux, uy, grow: 1, sy: 1, syDown: 1 }
  let fill = Math.min(area.w / 2 / (dx * k), area.h / 2 / (dy * k), maxTile / (maxL * k))
  // `caps`: each name's width and its reach below its sticker, in design units (they don't scale with the birds), centred
  // under the sticker: it stays inside the area too.
  if (caps) {
    for (const [code, [x, y, w, h]] of pack.boxes) {
      const c = caps.get(code)
      if (!c) continue
      const mid = Math.abs(x + w / 2 - ux), low = y + h - uy
      if (mid > 1e-9) fill = Math.min(fill, (area.w / 2 - c.w / 2) / (mid * k))
      if (low > 1e-9) fill = Math.min(fill, (area.h / 2 - c.below) / (low * k))
    }
  }
  const s = k * fill
  // Above and below the centre spread separately, so a lopsided ring (one big bird low) still reaches both edges.
  let up = spreadMax, down = spreadMax
  for (const [code, [, y, , h]] of pack.boxes) {
    const c = (y + h / 2 - uy) * s
    if (c < -1e-6) up = Math.min(up, (area.h / 2 - (h * s) / 2) / Math.abs(c))
    else if (c > 1e-6) down = Math.min(down, (area.h / 2 - (h * s) / 2 - (caps?.get(code)?.below ?? 0)) / Math.abs(c))
  }
  return { s, cx, cy, ux, uy, grow: Math.max(1, fill), sy: Math.max(1, up), syDown: Math.max(1, down) }
}

/** The canvas fonts of one card, as functions of the size in px. */
export type CardFonts = Record<'name' | 'filter' | 'count' | 'mono' | 'lifer' | 'brand' | 'footer', (px: number) => string>
function cardFonts(): CardFonts {
  const F = families()
  return {
    name: (px) => `700 ${px}px ${F.display}`,
    filter: (px) => `500 ${px}px ${F.body}`,
    count: (px) => `700 ${px}px ${F.display}`,
    mono: (px) => `500 ${px}px ${F.mono}`,
    lifer: (px) => `600 ${px}px ${F.body}`,
    brand: (px) => `700 ${px}px ${F.display}`,
    footer: (px) => `400 ${px}px ${F.mono}`,
  }
}

/**
 * Everything a card needs before it is drawn: the layout, the pack fitted to the collage, the tiles and their sticker
 * URLs, the text, the fonts (loaded) and where the footer line goes. paintCard only draws it.
 */
export type PreparedCard = {
  format: CardFormat
  L: CardLayout
  colors: ShareColors
  fit: PackFit
  tiles: Tile[]
  /** The latest lifer's sticker, contained in its square, at its final y (moved up by `shift` with its row). */
  lifer: Tile | null
  /** The count as drawn: L.count grown with the birds when a short list is scaled up. */
  K: CountLayout
  /** What the count draws, in the UI language ("1.089", "ESPÉCIES"); K's number and label are the geometry's. */
  countNum: string
  countLabel: string
  footerLine: string
  latest?: { label: string; name: string }
  name?: string
  label?: string
  fonts: CardFonts
  /** The wordmark's width plus the gap before the footer line beside it. */
  brandW: number
  /** The one-line row (LATEST_ONE_LINE): the block's left edge, the label's width and the name as drawn (its text and font size). */
  oneLine?: { x: number; labelW: number; nameText: string; nameSize: number }
  /** The footer line's size, and whether it took its own line under the wordmark (placeCredit). */
  credit: { size: number; below: boolean }
  /** How far the wordmark, the hairline and the latest lifer row move up when the footer line is below the wordmark. */
  shift: number
  captions?: CaptionBox[]
  /** Print names were asked for (showNames) but none are drawn: they didn't fit. */
  namesDropped?: true
  /** No Paper fill (ShareImageOpts.transparent). */
  transparent?: true
}
type CardDraft = Omit<PreparedCard, 'brandW' | 'credit' | 'shift'>

export function fitCaptionPack(
  pack: ImagePack,
  entries: ListEntry[],
  format: CardFormat,
  content: CardContent,
  printSize: PrintSize,
  captionPlan: Extract<CaptionPlan, { ok: true }>,
  markedCodes?: Set<string>,
): { fit: PackFit; placed: PlacedTile[]; captions?: CaptionBox[]; ok: boolean } {
  const L = cardLayout(format, content, printDesign(printSize, format === 'printLandscape'))
  const area = L.collage
  const caps = new Map<string, { w: number; below: number }>()
  for (const [code, p] of captionPlan.byCode) caps.set(code, { w: p.w, below: p.h })
  const fit = fitPack(pack, area, maxTileSide(area.w, L.maxTile, L.maxSide), SPREAD[format], caps)
  const placed: PlacedTile[] = []
  for (const e of entries) {
    const b = pack.boxes.get(e.code)
    if (!b) continue
    const [w, h] = [b[2] * fit.s, b[3] * fit.s]
    const [x, y] = [fit.cx + (b[0] - fit.ux) * fit.s, spreadY(fit, b[1] + b[3] / 2) - h / 2]
    placed.push({ code: e.code, x, y, w, h, ...(markedCodes?.has(e.code) ? { marked: true } : {}) })
  }
  const verified = verifyAndPlaceCaptions(placed, area, { cx: fit.cx, cy: fit.cy }, scaleHole(L.count.hole, Math.max(1, fit.grow)), captionPlan)
  return verified.ok ? { fit, placed, captions: verified.captions, ok: true } : { fit, placed, ok: false }
}

/** The Big Year goal's line on the card ("Big Year 2027"), in the image's language; none for an All time goal. */
export function goalText(goal: NonNullable<ShareImageOpts['goal']>, strings: ShareStrings): string {
  if (goal.year === undefined) return ''
  return fmt(goal.basis === 'lifer' ? strings.share.bigYear.cardLifer : strings.share.bigYear.card, { year: goal.year })
}

/** The birds the lifer rings mark among `entries`: the latest lifer and the first, as the card draws them. */
export function markedCodesOf(entries: ListEntry[], species: SpeciesIndex, marks: { newest?: boolean; first?: boolean }): Set<string> {
  const s = new Set<string>()
  if (!marks.newest && !marks.first) return s
  const order = liferOrder(species.byCode)
  const newest = marks.newest ? latestLifer(entries, order)?.code : undefined
  const first = marks.first ? firstLifer(entries, order)?.code : undefined
  if (newest) s.add(newest)
  if (first) s.add(first)
  return s
}

export function ensureCaptionFont(px: number, sample: string): Promise<void> {
  return fontsReady([cardFonts().filter(px)], sample)
}

/** Wait for the faces a view image draws its own text with (names, ticks, the key: the lifer and footer fonts), for
 *  every character of `sample`: a CJK family is split into many files, and only those `sample` touches are loaded. */
export function ensureViewFonts(card: Pick<PreparedCard, 'fonts'>, sample: string): Promise<void> {
  return fontsReady([card.fonts.lifer(20), card.fonts.footer(20)], sample)
}

/** The card without its fonts and footer placement: layout, pack, fit, tiles, text. `scale`: device px per design unit. */
async function draftCard(opts: ShareImageOpts, scale: number): Promise<CardDraft> {
  const { format, entries, species, theme, signal } = opts
  const print = isPrint(format)
  const colors: ShareColors = SHARE_COLORS[theme]
  const shown = entries.filter((e) => species.byCode.has(e.code))
  const order = liferOrder(species.byCode)
  const latestE = latestLifer(shown, order)
  const firstE = opts.markFirst ? firstLifer(shown, order) : undefined
  const markNewestCode = opts.markNewest ? latestE?.code : undefined
  const markFirstCode = opts.markFirst ? firstE?.code : undefined
  const latestRow = latestE && species.byCode.get(latestE.code)!
  const strings = opts.strings
  const latest = opts.latest !== false && latestRow ? latestText({ com: opts.nameOf?.(latestRow) ?? latestRow.com, date: latestE!.date }, strings) : undefined
  const goal = opts.goal
  const goalLabel = goal ? goalText(goal, strings) : undefined
  const label = opts.filterLabel?.trim() || goalLabel || undefined
  const name = opts.name?.trim() || undefined
  const footerLine = withStamp(opts.footer ?? FOOTER_LINE, stampDate(opts.now ?? new Date(), stampStrings(strings)))
  const content: CardContent = { name: !!name, filter: !!label, latest: !!latest, count: shown.length, target: goal?.target, countSize: opts.countSize }
  const printSize = opts.printSize ?? 'A2'
  const L = cardLayout(format, content, print ? printDesign(printSize, format === 'printLandscape') : undefined)
  const markedCodes = markedCodesOf(shown, species, { newest: opts.markNewest, first: opts.markFirst })
  let captionPlan: CaptionPlan | undefined
  if (print && opts.showNames) {
    const sample = shown.map((e) => {
      const r = species.byCode.get(e.code)
      return r ? (opts.nameOf?.(r) ?? r.com) : ''
    }).join('')
    await ensureCaptionFont(captionMinPx(printSize), sample)
    if (signal?.aborted) throw abortError()
    captionPlan = planCaptions(shown, species, printSize, L.collage.w, opts.nameOf, captionMeasurer(), markedCodes)
  }
  // Packed for the format's own frame (the print: at its shape's printPackH, one pack for every A size, as imagePackSpec).
  let pack = opts.pack ?? (await packForImage(shown, species, imagePackSpec(format, content, opts.printSize, captionPlan?.ok ? captionPlan : undefined, opts.arrangement), signal))
  if (signal?.aborted) throw abortError()

  // A tile's sticker: the share images' 128/384 by its size; the print's by its device px (1024 with the 384 fallback).
  // A 2× image (the desktop) takes the print's device tiers, so its big stickers come from the 1024 file, with the 384 as
  // a fallback (drawShareImage maps it in when the 1024 one fails).
  const sticker = (code: string, side: number, sv?: string): Pick<Tile, 'url' | 'fallback'> =>
    print || scale > 1 ? printStickerUrl(code, side * scale, sv) : { url: stickerUrl(code, side, scale, sv) }

  // The pack on the collage area, its centre (the count) on the area's centre.
  const area = L.collage
  const capFit = captionPlan?.ok ? fitCaptionPack(pack, shown, format, content, printSize, captionPlan, markedCodes) : undefined
  if (capFit && !capFit.ok && !opts.pack) {
    pack = await packForImage(shown, species, imagePackSpec(format, content, opts.printSize, undefined, opts.arrangement), signal)
    if (signal?.aborted) throw abortError()
  }
  const fit = capFit?.ok ? capFit.fit : fitPack(pack, area, maxTileSide(area.w, L.maxTile, L.maxSide), SPREAD[format])
  const captions = capFit?.ok ? capFit.captions : undefined
  // Names asked for but not drawn (over the cap, a name too long, or a pack they don't fit): the caller says so.
  const namesDropped = print && !!opts.showNames && !captions
  const tiles: Tile[] = shown.flatMap((e) => {
    const b = pack.boxes.get(e.code)
    if (!b) return []
    const row = species.byCode.get(e.code)!
    const [w, h] = [b[2] * fit.s, b[3] * fit.s]
    const [x, y] = [fit.cx + (b[0] - fit.ux) * fit.s, spreadY(fit, b[1] + b[3] / 2) - h / 2]
    const isNewest = e.code === markNewestCode, isFirst = e.code === markFirstCode
    const mark: Tile['mark'] = isNewest && isFirst ? 'both' : isNewest ? 'newest' : isFirst ? 'first' : undefined
    const tile: Tile = { x, y, w, h, ...(row.st ? sticker(e.code, Math.max(w, h), row.sv) : { url: null }), ...(mark ? { mark } : {}) }
    return [tile]
  })
  // The latest lifer's sticker, contained in its square at the sticker's own aspect.
  let lifer: Tile | null = null
  if (latestRow && L.latest) {
    const { icon, y } = L.latest
    const ar = latestRow.st && latestRow.ar > 0 ? latestRow.ar : 1
    const w = ar >= 1 ? icon : icon * ar, h = ar >= 1 ? icon / ar : icon
    lifer = { x: L.latest.x + (icon - w) / 2, y: y + (icon - h) / 2, w, h, ...(latestRow.st ? sticker(latestRow.code, icon, latestRow.sv) : { url: null }) }
  }
  // The count grows with the birds when a short list is scaled up past the width fit (its hole grew as much).
  const g = Math.min(fit.grow, 1.3)
  const K = { ...L.count, size: Math.round(L.count.size * g), labelSize: Math.round(L.count.labelSize * Math.min(g, 1.15)), gap: Math.round(L.count.gap * g) }
  // What the count draws, in the UI language ("1.089", "ESPÉCIES"); K's number and label are the geometry's.
  const countNum = K.size > 0 ? (goal?.target !== undefined ? `${countDisplay(content.count, strings.num)} / ${countDisplay(goal.target, strings.num)}` : countDisplay(content.count, strings.num)) : ''
  const countLabel = K.size > 0 ? strings.count.label.toUpperCase() : ''
  return { format, L, colors, fit, tiles, lifer, K, countNum, countLabel, footerLine, latest, name, label, fonts: cardFonts(), ...(captions ? { captions } : {}), ...(namesDropped ? { namesDropped: true as const } : {}), ...(opts.transparent ? { transparent: true as const } : {}) }
}

export function captionMeasurer(): TextMeasurer {
  if (typeof document === 'undefined') return defaultCaptionMeasure
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return defaultCaptionMeasure
  const f = cardFonts().filter
  return (px, text) => { ctx.font = f(px); return ctx.measureText(text).width }
}

/**
 * A text measurer for the footer's placement: a scratch canvas's measureText (the same widths the card's own canvas
 * gets; measureText ignores the transform), else, without a DOM (Node tests), an estimate of `em` per character.
 * Throws when there is a DOM but no 2D canvas, as drawing would.
 */
function textMeasurer(): (font: string, px: number, text: string, em: number) => number {
  if (typeof document === 'undefined') return (_font, px, text, em) => text.length * em * px
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  return (font, _px, text) => { ctx.font = font; return ctx.measureText(text).width }
}

/** Wait (at most 3 s) for every font the card draws with. */
function cardFontsReady(d: CardDraft): Promise<void> {
  const { L, fonts: font, K, name, label, latest, footerLine, countNum, countLabel, captions } = d
  const fonts = [font.name(L.name?.size ?? 60), font.filter(34), ...(K.size > 0 ? [font.count(K.size), font.mono(K.labelSize)] : []), font.lifer(34), font.brand(30), font.footer(20)]
  if (captions?.length) fonts.push(font.filter(captions[0].fontPx))
  const captionSample = captions?.length ? captions.map((c) => c.lines.join('')).join('') : ''
  return fontsReady(
    fonts,
    `${name ?? ''}${label ?? ''}${countNum}${countLabel}${latest ? latest.label.toUpperCase() + latest.name : ''}Everybird${footerLine}${captionSample}`,
  )
}

/**
 * Place the footer line (and so the rows above it that move with it). Call it once the fonts have settled, and for a
 * share image once the stickers have too (the moment the card was measured before the split), so it measures the faces
 * the card is drawn with.
 */
function placeFooter(d: CardDraft): PreparedCard {
  const { L, fonts: font, footerLine } = d
  // Footer, quiet: the wordmark, then one line on its baseline, the site, the sticker credit and the date stamp ("… ·
  // stickers by huashu · 14 Nov 2026", never truncated). If it doesn't fit there at 17px or more, it takes its
  // own line under the wordmark at the bottom safe line, and the wordmark, the hairline and the latest lifer row move
  // up by that line. Estimates without a DOM: Cabinet Grotesk 700 about 0.55 em a character, Geist Mono 0.6.
  const X0 = L.collage.x, maxW = L.collage.w
  const measure = textMeasurer()
  const brandW = measure(font.brand(L.footer.size), L.footer.size, 'Everybird', 0.55) + 16
  const footerW = (px: number) => measure(font.footer(px), px, footerLine, 0.6)
  if (L.latest?.oneLine && d.latest) {
    // The one-line row: two lines right-aligned to the margin, the mono label (tracked 0.06em) over the name (Satoshi 600)
    // on the footer's baseline, the sticker to their left. The credit keeps CREDIT_MIN beside the wordmark, so the name
    // gets all the room that leaves: if it is still too wide it shrinks to ONE_LINE.nameMin of its size, and only then is
    // it clipped with an ellipsis. The credit's room ends where the block starts, less FOOTER_GAP.
    const { icon, label: ls, name: ns } = L.latest
    const labelText = d.latest.label.toUpperCase()
    const labelW = measure(font.mono(ls), ls, labelText, 0.6) + labelText.length * 0.06 * ls
    const nameW = (t: string, px: number) => measure(font.lifer(px), px, t, 0.56)
    const creditMin = footerW(CREDIT_MIN)
    const room = maxW - FOOTER_GAP - brandW - creditMin - icon - ONE_LINE.gap
    const full = nameW(d.latest.name, ns)
    const nameSize = full <= room ? ns : Math.max(ns * ONE_LINE.nameMin, Math.min(ns, Math.floor((ns * room) / full)))
    const nameText = clipTo((t) => nameW(t, nameSize), d.latest.name, room)
    const blockW = icon + ONE_LINE.gap + Math.max(labelW, nameW(nameText, nameSize))
    const x = X0 + maxW - blockW
    const roomCredit = x - FOOTER_GAP - X0 - brandW
    const credit = { ...placeCredit(footerW, roomCredit, roomCredit, L.footer.credit), below: false }
    const lifer = d.lifer && { ...d.lifer, x: x + (icon - d.lifer.w) / 2, y: L.latest.y + (icon - d.lifer.h) / 2 }
    return { ...d, lifer, brandW, credit, shift: 0, oneLine: { x, labelW, nameText, nameSize } }
  }
  const credit = placeCredit(footerW, maxW - brandW, maxW, L.footer.credit)
  const shift = credit.below ? credit.size + 12 : 0
  const lifer = d.lifer && { ...d.lifer, y: d.lifer.y - shift }
  return { ...d, lifer, brandW, credit, shift }
}

/** `text` as `width` says it fits `max`, clipped with an ellipsis (the footer's one-line name). */
function clipTo(width: (t: string) => number, text: string, max: number): string {
  if (width(text) <= max) return text
  let t = text
  while (t.length > 1 && width(`${t}…`) > max) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

/**
 * Everything drawShareImage computes before its canvas: the pack (made here when `opts.pack` is absent), the fit, the
 * tiles and their sticker URLs, the text, the fonts (awaited) and the footer's placement. `scale` is device px per
 * design unit; it only picks the print's sticker tier (printStickerUrl). Throws an AbortError when `opts.signal` aborts.
 */
export async function prepareCard(opts: ShareImageOpts, scale = 1): Promise<PreparedCard> {
  const draft = await draftCard(opts, scale)
  await cardFontsReady(draft)
  if (opts.signal?.aborted) throw abortError()
  return placeFooter(draft)
}

/** The unique sticker URLs a card draws (tiles, then the latest lifer), in that order. Fallbacks are not included. */
export function cardUrls(card: Pick<PreparedCard, 'tiles' | 'lifer'>): string[] {
  return [...new Set([...card.tiles, ...(card.lifer ? [card.lifer] : [])].flatMap((t) => (t.url ? [t.url] : [])))]
}

/**
 * Draw a prepared card in design units (0..L.W, 0..L.H) under whatever transform the caller set: identity for a share
 * image, `setTransform(k, 0, 0, k, 0, -y)` for a poster strip. It starts with Paper over the whole card. With `range`
 * (design y), tiles outside it (tileInRange) are skipped; text is always drawn (cheap, and the canvas clips it).
 */
export function paintCard(ctx: CanvasRenderingContext2D, card: PreparedCard, imgs: Map<string, CanvasImageSource | null>, range?: PaintRange): void {
  const { L, colors: C, fit, K, countNum, countLabel, fonts: font, latest, name, label, lifer, footerLine, brandW, credit, shift } = card
  if (!card.transparent) {
    ctx.fillStyle = C.paper
    ctx.fillRect(0, 0, L.W, L.H)
  }

  // The collage.
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  paintTiles(ctx, card.tiles, imgs, C.line, range, C)
  if (card.captions?.length) {
    ctx.font = font.filter(card.captions[0].fontPx)
    ctx.fillStyle = C.ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (const cap of card.captions) {
      if (range && !tileInRange({ y: cap.y - 2, h: cap.h + 4 }, range)) continue
      for (let i = 0; i < cap.lines.length; i++) ctx.fillText(cap.lines[i], cap.cx, cap.y + i * cap.lineH)
    }
  }

  const X0 = L.collage.x, maxW = L.collage.w
  const track = (em: number, px: number) => { if ('letterSpacing' in ctx) ctx.letterSpacing = `${(em * px).toFixed(2)}px` }

  if (K.size > 0) {
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
    ctx.fillText(countNum, fit.cx, blockTop + digitH)
    ctx.font = font.mono(K.labelSize)
    track(0.06, K.labelSize)
    ctx.fillStyle = C.muted
    ctx.fillText(countLabel, fit.cx, blockTop + digitH + K.gap + capH)
    track(0, 0)
  }

  // Text.
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  const draw = (str: string, f: (px: number) => string, t: Text, min: number, color: string, x = X0, w = maxW) => {
    const out = fitText(ctx, str, f, t.size, min, w)
    ctx.fillStyle = color
    ctx.fillText(out, x, t.y)
  }
  if (name && L.name) draw(name, font.name, L.name, 36, C.ink)
  if (label && L.filter) draw(label, font.filter, L.filter, 24, C.accent)

  // The latest lifer: its sticker, then the mono label over the bird's name, centred on the sticker.
  if (latest && card.oneLine && lifer && L.latest) {
    // One line on the footer's baseline: the sticker, the mono label, the name (placeFooter placed them).
    const { x, nameText, nameSize } = card.oneLine
    const { icon, label: ls } = L.latest
    const base = L.footer.y + L.footer.size * 0.8
    const tx = x + icon + ONE_LINE.gap
    paintTiles(ctx, [lifer], imgs, C.line, range)
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    ctx.font = font.mono(ls)
    track(0.06, ls)
    ctx.fillStyle = C.muted
    ctx.fillText(latest.label.toUpperCase(), tx, base - 30)
    track(0, 0)
    ctx.font = font.lifer(nameSize)
    ctx.fillStyle = C.ink
    ctx.fillText(nameText, tx, base)
  } else if (latest && lifer && L.latest) {
    paintTiles(ctx, [lifer], imgs, C.line, range)
    const { icon } = L.latest
    const y = L.latest.y - shift
    const tx = L.latest.x + icon + 20, tw = L.latest.tw
    const blockH = L.latest.label + 10 + L.latest.name
    const top = y + (icon - blockH) / 2
    track(0.06, L.latest.label)
    draw(latest.label.toUpperCase(), font.mono, { y: top, size: L.latest.label }, 16, C.muted, tx, tw)
    track(0, 0)
    draw(latest.name, font.lifer, { y: top + L.latest.label + 10, size: L.latest.name }, 24, C.ink, tx, tw)
  }

  // The footer (placed by prepareCard): the hairline, the wordmark, the line beside or under it.
  const base = L.footer.y + L.footer.size * 0.8 - (card.oneLine ? FOOTER_LIFT : 0) // lifted to the lifer block's middle when it is on
  ctx.fillStyle = C.hairline
  ctx.fillRect(X0, L.rule.y - shift, maxW, 2)
  ctx.textBaseline = 'alphabetic'
  ctx.font = font.brand(L.footer.size)
  ctx.fillStyle = C.ink
  ctx.fillText('Everybird', X0, base - shift)
  ctx.font = font.footer(credit.size)
  ctx.fillStyle = C.muted
  ctx.fillText(footerLine, credit.below ? X0 : X0 + brandW, base)
}

/**
 * Draw the share image on a new canvas (renderShareImage encodes it): prepare, load the stickers, paint. For the print
 * this is the 1080-wide preview (at scale 1 no tile passes 440 px, so it uses the 128/384 files).
 */
export async function drawShareImage(opts: ShareImageOpts): Promise<HTMLCanvasElement> {
  const { signal } = opts
  // A share image draws at its output scale (a desktop image 2×); a poster's preview at 1 (its strips use their own).
  const s = isPrint(opts.format) ? 1 : IMAGE_SCALE[opts.format as ImageFormat]
  const draft = await draftCard(opts, s)
  // The stickers load while the fonts do; the footer is measured once both have settled, as before the split.
  const tiles = [...draft.tiles, ...(draft.lifer ? [draft.lifer] : [])]
  const fallbacks = tiles.flatMap((t) => (t.url && t.fallback ? [t.fallback] : []))
  const [imgs] = await Promise.all([loadStickers([...new Set([...cardUrls(draft), ...fallbacks])], { signal }), cardFontsReady(draft)])
  if (signal?.aborted) throw abortError()
  for (const t of tiles) if (t.url && t.fallback && !imgs.get(t.url)) imgs.set(t.url, imgs.get(t.fallback) ?? null)
  const card = placeFooter(draft)

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(card.L.W * s)
  canvas.height = Math.round(card.L.H * s)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  // The print's height is fractional (A4 1527.7 rounds up to 1528): Paper over the whole canvas covers its last row.
  if (!card.transparent && canvas.height > card.L.H * s) {
    ctx.fillStyle = card.colors.paper
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  if (s !== 1) ctx.setTransform(s, 0, 0, s, 0, 0)
  paintCard(ctx, card, imgs)
  return canvas
}
