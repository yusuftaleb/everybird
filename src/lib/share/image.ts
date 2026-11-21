// Share images: a story (1080 × 1920), post (1080 × 1350) or square (1080 × 1080) PNG of the collage, or of the current filtered view,
// and the print poster's card (A4 to A1 and three US sizes, drawn by poster code in strips). Horizontal (the dialog's orientation switch): the
// story becomes a desktop wallpaper (1920 × 1080 units drawn at 2×, a 3840 × 2160 PNG, all its content in the central 3:2 column, DESKTOP_SIDE) and the post a 5:4 wide (1350 × 1080);
// the poster turns to landscape (print.ts). The tables below have a row for each; imageShape picks a slot's shape.
//
// Layout (cardLayout), on Paper with 64px side margins, all text left-aligned. It leads with the birder, not the
// product: people share a brag, not an app card.
//   top     the name, if given (Cabinet Grotesk 700, 60px), then, for a filtered view, the filter in words (Satoshi 500
//           34px, Accent). With the Count menu's "Beside title" the count is on the name's line, at its right, in the
//           label style ("96 SPECIES", Geist Mono 34px, Ink), or alone at the top left without a name.
//   middle  the collage, packed for the space left (layout worker 'image' message: packFrame, the count's hole at its
//           centre, the birds spread evenly to the frame's edges; under Fit a big list packed dense, as on the page, and
//           settled into the rectangle); no sticker longer than 30% of the collage wide (36% up
//           to 24 birds)
//   bottom  the latest lifer row, the head's gap under the collage (round 6): its sticker, then "LATEST LIFER · SEP 2026 ·
//           BRITISH COLUMBIA, CANADA" (the province or state and the country where it was seen, in the image's language:
//           liferPlace; the place on its own line where the label doesn't fit, never cut) over the name; unless the
//           dialog's "Show latest lifer" switch is off, when the collage takes its room. Then a Hairline rule and the
//           footer: the Everybird wordmark and one
//           quiet line beside it, the site, the sticker credit and the date the image was made
//           ("everybird.yusuftaleb.com · Stickers: huashu-bird-sticker, CC BY 4.0 · 14 Nov 2026", stamp.ts; Geist Mono
//           20px, Muted; on its own line under the wordmark where it does not fit beside it: placeCredit).
//           The full credit, with the licence, travels in the share text.
// The story keeps the story safe zones clear: nothing in the top 160px (the profile row; the title from 184) or the
// bottom 156px (the reply bar); the post and the square use 64px margins all round. The story's collage is tall (about 952 × 1284 with
// a name and the latest lifer): packFrame packs it for that aspect and spreads the birds evenly over it, edge to edge.
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
// Its head and foot are quieter than an image's: the head is the title alone (the collage title, else the filter in
// words, in Accent), with the count at its right under "Beside title"; the foot is one line under the hairline, the
// wordmark then "everybird.yusuftaleb.com · Stickers: huashu-bird-sticker, CC BY 4.0 · 20 Nov 2026" at the left and, at the
// right end in the same size and style, the bird's sticker (posterIcon, sized to the line) then "Latest lifer: Hooded
// Crow, Sep 2026, British Columbia, Canada" (POSTER_FOOT; the latest lifer only with "Show latest lifer"; on a second
// line, right-aligned, where the two don't fit on one: placePosterFoot), with no latest lifer row. The Tree's poster
// has the same foot, "Oldest lineage: Osprey, about 39 million years" in the lifer's place (latestAs).
import { SHARE_ORIGIN } from '@/lib/share/origin'
import { BIRD_PATH, OUTLINE_SCALE } from '@/lib/bird-outline'
import { printStickerUrl, stickerUrl } from '@/lib/sticker-url'
import { fmt, plural } from '@/i18n/core'
import { formatMonth } from '@/i18n/format'
import { PRINT_DESIGN_W, captionMinPx, printDesign, printPackH, type PrintSize } from '@/lib/share/print'
import { defaultCaptionMeasure, planCaptions, verifyAndPlaceCaptions, type CaptionBox, type CaptionPlan, type PlacedTile, type TextMeasurer } from '@/lib/share/captions'
import { stampDate, stampStrings, withStamp } from '@/lib/share/stamp'
import type { Box } from '@/lib/layout/pack'
import type { Arrangement } from '@/lib/arrangement'
import { COMMA_DROP, DIGIT_CAP, LABEL, MONO_CAP, goalLabelCells, MONO_CAP_ACCENT, MONO_LINE, NO_HOLE, NUM_LINE, columnBoxes, countDisplay, countText, labelEm, numberEm, scaleHole, type Hole } from '@/lib/layout/count-box'
import type { Ui } from '@/i18n/messages/en'
import type { ListEntryMsg, WorkerReply, WorkerRequest } from '@/lib/layout/layout.worker'
import { latestLifer, liferOrder } from '@/lib/list/build-list'
import { continentNames, namesLabel, placesLabel, regionNames, seenLabels, statusLabel } from '@/lib/list/filter-summary'
import type { Filter } from '@/lib/list/filters'
import { rangeLabel } from '@/lib/list/timeline'
import type { ListEntry, Place } from '@/lib/list/model'
import { formatPlace } from '@/lib/import/places'
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
/** The sticker credit on every image, poster and link preview, in the one form the credits take ("Tree: AvesData, CC BY 4.0"). */
export const STICKER_CREDIT = 'Stickers: huashu-bird-sticker, CC BY 4.0'
/**
 * The footer's one line beside (or under) the wordmark on share images and link previews: the site and the sticker
 * credit. Share images end it with the date stamp (stamp.ts withStamp); link previews don't.
 */
export const FOOTER_LINE = `${SITE_LABEL} · ${STICKER_CREDIT}`
/** The full sticker credit (CC BY 4.0), for the share sheet's text: the image itself carries FOOTER_LINE. */
export const SHARE_CREDIT = 'Stickers: huashu-bird-sticker (CC BY 4.0) github.com/alchaincyf/huashu-bird-sticker'

/** The design tokens (tokens.css; a test keeps them equal). The image follows the page's current theme. */
export const SHARE_COLORS = {
  light: { ink: '#1e1e24', paper: '#f6f4ef', accent: '#92140c', muted: '#5f5f69', line: '#857f74', hairline: '#dedad2', surface: '#ebe8e1' },
  dark: { ink: '#ffffff', paper: '#1e1e24', accent: '#f06a5f', muted: '#a9a9b2', line: '#76767f', hairline: '#3d3d45', surface: '#28282f' },
} as const
export type ShareColors = { [K in keyof typeof SHARE_COLORS.light]: string }

/**
 * The latest lifer row's two lines: the mono label "Latest lifer · Oct 2026 · British Columbia, Canada" ("Última especie
 * nueva · oct 2026 · …"; the date part only when there is one, the place only when the record has one: `place`, the
 * province or state and the country, or the country alone, placeName) and the bird's name. `place` is also given apart,
 * so a label too long for its row can put it on a line of its own (paintCard) rather than cut it.
 */
export function latestText(latest: { com: string; date?: string; place?: string }, t: Pick<Ui, 'share' | 'date'>): LatestText {
  const d = formatMonth(latest.date, t.date.months)
  const head = `${t.share.latestLifer}${d ? ` · ${d}` : ''}`
  return latest.place ? { label: `${head} · ${latest.place}`, name: latest.com, head, place: latest.place } : { label: head, name: latest.com }
}
/** The latest lifer row's words: the whole mono label and the name; with a place, the label before it (`head`) and the place. */
export type LatestText = { label: string; name: string; head?: string; place?: string }

/**
 * Where a lifer was seen, for its row and the poster's foot: the province or state and the country ("British Columbia,
 * Canada"), the country alone without one, nothing without a place. Never a county or a locality. `regions` names them
 * (the dialog passes them in the image's language, i18n-places.ts regionsIn, as the Places filter and the Map).
 */
export function liferPlace(place: Place | undefined, regions: Regions): string {
  return place ? formatPlace({ country: place.country, sub1: place.sub1 }, regions) : ''
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
  if (f.genus) parts.push(f.genus)
  else if (f.family) { const r = ctx.species.rows.find((x) => x.fam === f.family); parts.push(r ? (ctx.familyName?.(r) ?? r.famCom) || f.family : f.family) }
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
 * 2,464 units of text). Where the credit at 17px and the whole name don't both fit beside the wordmark, the credit takes
 * its own line under it (placeFooter), and only then is a long name shrunk or clipped. The 5:4 card (1,222) and
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
 * The gaps (px) between the head and the collage, the collage and the hairline (`collage`), and the latest lifer row and
 * the hairline (`latest`). A stacked latest lifer row keeps the head's gap above it, from the collage (cardLayout). The
 * story, the post and the print keep them tighter so their collages take the height; the square keeps its own.
 */
const GAPS: Record<CardFormat, { head: number; collage: number; latest: number }> = {
  story: { head: 40, collage: 32, latest: 24 }, post: { head: 40, collage: 32, latest: 24 }, square: { head: 48, collage: 40, latest: 32 },
  print: { head: 40, collage: 32, latest: 24 }, desktop: { head: 40, collage: 24, latest: 24 }, wide: { head: 40, collage: 32, latest: 24 },
  printLandscape: { head: 40, collage: 32, latest: 24 },
}
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
  /** The label box's width in characters (labelEm): COUNT_LABEL_CHARS, or a goal's (goalLabelCells). */
  cells?: number
  /** The hole (px, about the collage's centre) the packer keeps empty: the drawn text's boxes, grown by its pad. */
  hole: Hole
}
export type CardLayout = {
  W: number
  H: number
  /** The head's first line: the name (on a poster, its title), and, with "Beside title", the count's row too. */
  name?: Text
  filter?: Text
  /** "Beside title": the count on the name's baseline, right-aligned (left without a name): the number at `num` px (the
   *  count's Cabinet 700), then its label at `label` px (the count label's Geist Mono, upper case), `gap` between. */
  titleCount?: typeof TITLE_COUNT
  collage: { x: number; y: number; w: number; h: number }
  count: CountLayout
  /**
   * The latest lifer row. Stacked (`oneLine` false): its sticker (icon px square, at x) beside two lines in a column `tw`
   * wide, a mono label over the bird's name, above the hairline. One line (LATEST_ONE_LINE): the sticker at y on the
   * footer's line, the label and name on its baseline, all placed by placeFooter from the text's measured widths.
   */
  latest?: { x: number; y: number; icon: number; tw: number; label: number; name: number; oneLine: boolean }
  rule: { y: number }
  /** The wordmark's size (`size`, Cabinet 700) and the line's beside it (`credit`, Geist Mono; placeCredit may shrink it). */
  footer: Text & { credit: number }
  /** The largest sticker's long side as a share of the collage width (maxTileFrac of the count). */
  maxTile: number
  /** The largest sticker's long side in px (maxTileSide's cap; 440, the desktop 512). */
  maxSide: number
}
/** The Count menu: the count in the middle at one of three sizes, none, or 'title', beside the title (no hole). */
export type CountSize = 'small' | 'medium' | 'large' | 'hide' | 'title'
/**
 * The count beside the title, in the big count's own type scaled to the title (60px): the number as tall as the title
 * (Cabinet Grotesk 700, -0.02em), then its label in the count label's style (Geist Mono 500, upper case, tracked 0.06em,
 * Muted) at the size the label under a medium count takes, on one baseline, `gap` px apart.
 */
export const TITLE_COUNT = { num: 60, label: 22, gap: 12 } as const
/**
 * The poster's foot: the wordmark and the line beside it, smaller than an image's so the line, with the latest lifer in
 * it, stays one line beside the wordmark (it shrinks to `min`, then takes its own line under the wordmark).
 */
export const POSTER_FOOT = { brand: 24, line: 16, min: 12 }
/** The poster foot's sticker before the latest lifer's words: a square 1.5 × the line's size (24 at 16px), half the size
 *  before the words, centred on the line's capitals (placeFooter). */
export const posterIcon = (px: number) => Math.round(px * 1.5)
const posterIconGap = (px: number) => Math.round(px * 0.5)

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
  if (countSize === 'hide' || countSize === 'title') return { number: '', label: '', size: 0, labelSize: 0, gap: 0, hole: NO_HOLE }
  const baseMax = typeof format === 'number' ? format : COUNT_MAX[format]
  const max = countSize === 'small' ? baseMax * 0.72 : countSize === 'large' ? baseMax * 1.28 : baseMax
  const countW = countSize === 'small' ? COUNT_W * 0.72 : countSize === 'large' ? Math.min(0.68, COUNT_W * 1.2) : COUNT_W
  // A goal never changes the number (its size stays the no-goal one): it goes in the label, "OF 150 SPECIES".
  const number = countText(count)
  const label = LABEL
  const cells = target !== undefined ? goalLabelCells(target) : undefined
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
  const boxes = columnBoxes(em * size, DIGIT_CAP * size + drop, gap - drop - accent, labelEm(cells) * labelSize, MONO_CAP_ACCENT * labelSize)
  return { number, label, size, labelSize, gap, ...(cells ? { cells } : {}), hole: { ...boxes, pad: COUNT_PAD * size } }
}

/**
 * The link preview's hole for its count (px): satori draws the column with line boxes, the number on a 0.85 line box,
 * the label on a 1.3 one (opengraph-image.tsx sets both), 0.6 x the gap between them.
 */
export function ogCountHole(K: CountLayout): Hole {
  const em = numberEm(K.number)
  const boxes = columnBoxes(em * K.size, Math.max(NUM_LINE, DIGIT_CAP + COMMA_DROP) * K.size, K.gap * 0.6 - Math.max(0, DIGIT_CAP + COMMA_DROP - NUM_LINE) * K.size, labelEm(K.cells) * K.labelSize, MONO_LINE * K.labelSize)
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
  // Top: only the name and the filter in words; with neither, the collage starts at the safe line. "Beside title" puts the
  // count on the name's line, so that line is there without a name too. A poster's head is one line, its title (the
  // name, else the filter in words: draftCard), so it has no filter line.
  const print = isPrint(format)
  const titleCount = c.countSize === 'title'
  const name = c.name || titleCount || (print && c.filter) ? { y: TITLE_TOP[format], size: 60 } : undefined
  const filter = c.filter && !print ? { y: name ? name.y + 76 : T, size: 34 } : undefined
  const headBottom = filter ? filter.y + filter.size : name ? name.y + name.size : undefined
  // Bottom, upwards: the footer (wordmark, site and credit on one line), a hairline, the latest lifer row.
  // The story's footer sits 4px higher so its descenders ("y", "(") clear the bottom safe line too.
  if (print) {
    // The poster: the hairline, then one quiet line (the latest lifer is in it, POSTER_FOOT), no row above the hairline.
    const footer = { y: H - B - POSTER_FOOT.brand, size: POSTER_FOOT.brand, credit: POSTER_FOOT.line }
    const rule = { y: footer.y - 24 }
    const top = headBottom === undefined ? T : headBottom + GAPS[format].head
    const collage = { x: X, y: top, w: W - 2 * X, h: rule.y - GAPS[format].collage - top }
    return { W, H, name, filter, ...(titleCount ? { titleCount: TITLE_COUNT } : {}), collage, count: countLayout(format, c.count, collage.w, c.target, c.countSize), rule, footer, maxTile: maxTileFrac(c.count), maxSide: MAX_SIDE[format] ?? 440 }
  }
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
  // A stacked row keeps the head's gap from the collage (round 6: it sat too close), the collage giving up the room.
  const bottom = latest && !oneLine ? latest.y - G.head : rule.y - G.collage
  const collage = { x: X, y: top, w: W - 2 * X, h: bottom - top }
  return { W, H, name, filter, ...(titleCount ? { titleCount: TITLE_COUNT } : {}), collage, count: countLayout(format, c.count, collage.w, c.target, c.countSize), latest, rule, footer, maxTile: maxTileFrac(c.count), maxSide: MAX_SIDE[format] ?? 440 }
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
/** `oval` and `free`: the share dialog's Oval and Free (arrangement.ts); both left out for Fit. */
export type PackSpec = { aspect: number; hole: Hole; maxTile: number; captionBoxes?: Record<string, { w: number; h: number }>; oval?: true; free?: true }
export function packSpec(L: CardLayout): PackSpec {
  const { w, h } = L.collage
  // The tile cap the drawing keeps (maxTileSide: the share, and the sticker files' sharp size), so the pack is made at the
  // size it is drawn and fitPack never shrinks it off the frame's edges.
  return { aspect: w / h, hole: scaleHole(L.count.hole, 1 / w), maxTile: Math.min(L.maxTile, L.maxSide / w) }
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
    const msg: WorkerRequest = { type: 'image', id: 1, entries: birds, aspect: spec.aspect, hole: spec.hole, maxTile: spec.maxTile, ...(captions ? { captions } : {}), ...(spec.oval ? { oval: true } : {}), ...(spec.free ? { free: true } : {}) }
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
  const spec: PackSpec = { ...packSpec(L), ...(arrangement === 'oval' ? { oval: true } : arrangement === 'free' ? { free: true } : {}) }
  if (!captionPlan) return spec
  const captionBoxes: NonNullable<PackSpec['captionBoxes']> = {}
  for (const [code, entry] of captionPlan.byCode) {
    captionBoxes[code] = { w: entry.w / L.collage.w, h: entry.h / L.collage.w }
  }
  return { ...spec, captionBoxes }
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
  ctx: CanvasRenderingContext2D, tiles: Tile[], imgs: Map<string, CanvasImageSource | null>, line: string, range?: PaintRange,
): void {
  const bird = new Path2D(BIRD_PATH)
  for (const t of tiles) {
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
 * Where the footer line (the site and the sticker credit) goes, never truncated and never without the credit: beside
 * the wordmark (`inlineRoom` px) at `size` down to `min` (CREDIT_MIN; the poster's POSTER_FOOT.min), else on its own line
 * (`fullRoom` px) at `size`, shrinking only if even the full width is too narrow. `measure(px)` is the line's width at that size.
 */
export function placeCredit(measure: (px: number) => number, inlineRoom: number, fullRoom: number, size: number, min = CREDIT_MIN): { size: number; below: boolean } {
  for (let px = size; px >= min; px--) if (measure(px) <= inlineRoom) return { size: px, below: false }
  let px = size
  while (px > 8 && measure(px) > fullRoom) px--
  return { size: px, below: true }
}

/**
 * The poster's foot: the wordmark and the site, credit and date beside it at the left, the latest lifer (`latest(px)` its
 * width) at the right end of the same line, FOOTER_GAP apart, from POSTER_FOOT.line down to POSTER_FOOT.min. Where the two
 * don't fit on one line at any of those sizes, the latest lifer takes a second line under them, right-aligned, and the
 * first line is placed alone (placeCredit, so at its largest size that fits).
 */
export function placePosterFoot(credit: (px: number) => number, latest: (px: number) => number, maxW: number, brandW: number): { size: number; below: boolean; latestBelow: boolean } {
  for (let px = POSTER_FOOT.line; px >= POSTER_FOOT.min; px--) {
    if (brandW + credit(px) + FOOTER_GAP + latest(px) <= maxW) return { size: px, below: false, latestBelow: false }
  }
  return { ...placeCredit(credit, maxW - brandW, maxW, POSTER_FOOT.line, POSTER_FOOT.min), latestBelow: true }
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
  /** Another bird in the latest lifer's place and style, with its own words (the Tree image's oldest lineage): `label`
   *  the row's mono label, `poster` the poster foot's line. */
  latestAs?: { row: SpeciesRow; label: string; poster: string }
  /** The UI language's strings the image draws: the count's number and label, the latest lifer's label and month, and
   *  the stamp's month. The filter label comes in words already (`filterLabel`, from the same strings). */
  strings: ShareStrings
  /** A bird's name to draw (the latest lifer's); default its English name. The dialog passes the display name. */
  nameOf?: (row: SpeciesRow) => string
  /** The places' names in the image's language (i18n-places.ts regionsIn), for where the latest lifer was seen
   *  (liferPlace); without them the row and the poster's foot name no place. */
  regions?: Regions
  /** A species goal: the label under the count reads "OF 300 SPECIES". With `year`, the card's line names it ("Big Year 2026"); without, it is
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

/** `grow`: how much the scale-up past the width fit enlarged the birds (and the hole), at least 1. */
export type PackFit = { s: number; cx: number; cy: number; ux: number; uy: number; grow: number }
/**
 * How a pack lands on the collage area: the frame's centre (the hole) on the area's centre, the frame's width on the
 * area's width (or its height, if that is tighter), then scaled about the centre until the birds reach the area's
 * edge or the largest tile reaches `maxTile` px. A layout unit at (x, y) is drawn at (cx + (x − ux)·s, cy + (y − uy)·s)
 * (fitBox). The pack already fills its frame evenly (packFrame), and the frame has the area's shape, so nothing is
 * stretched: the gaps stay even.
 */
export function fitPack(
  pack: ImagePack, area: { x: number; y: number; w: number; h: number }, maxTile: number,
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
  if (!maxL) return { s: k, cx, cy, ux, uy, grow: 1 }
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
  return { s: k * fill, cx, cy, ux, uy, grow: Math.max(1, fill) }
}
/** A pack's box [x, y, w, h] (layout units) as drawn on the card (design units), by fitPack's `f`. */
export const fitBox = (f: PackFit, [x, y, w, h]: Box): Box => [f.cx + (x - f.ux) * f.s, f.cy + (y - f.uy) * f.s, w * f.s, h * f.s]

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
  /** "Beside title": the count on the title's line, its number and its upper-cased label ("96", "SPECIES" or "OF 150 SPECIES"). */
  countLine?: { num: string; label: string }
  footerLine: string
  /** The poster's latest lifer in words ("Latest lifer: Hooded Crow, Sep 2026"), drawn at the foot's right end. */
  posterLatest?: string
  latest?: LatestText
  name?: string
  label?: string
  fonts: CardFonts
  /** The wordmark's width plus the gap before the footer line beside it. */
  brandW: number
  /** The one-line row (LATEST_ONE_LINE): the block's left edge, the label's width and the name as drawn (its text and font size). */
  oneLine?: { x: number; labelW: number; nameText: string; nameSize: number }
  /** The footer line's size, and whether it took its own line under the wordmark (placeCredit); on a poster, whether its
   *  latest lifer took a line of its own under them, right-aligned (placePosterFoot). */
  credit: { size: number; below: boolean; latestBelow?: boolean }
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
): { fit: PackFit; placed: PlacedTile[]; captions?: CaptionBox[]; ok: boolean } {
  const L = cardLayout(format, content, printDesign(printSize, format === 'printLandscape'))
  const area = L.collage
  const caps = new Map<string, { w: number; below: number }>()
  for (const [code, p] of captionPlan.byCode) caps.set(code, { w: p.w, below: p.h })
  const fit = fitPack(pack, area, maxTileSide(area.w, L.maxTile, L.maxSide), caps)
  const placed: PlacedTile[] = []
  for (const e of entries) {
    const b = pack.boxes.get(e.code)
    if (!b) continue
    const [x, y, w, h] = fitBox(fit, b)
    placed.push({ code: e.code, x, y, w, h })
  }
  const verified = verifyAndPlaceCaptions(placed, area, { cx: fit.cx, cy: fit.cy }, scaleHole(L.count.hole, Math.max(1, fit.grow)), captionPlan)
  return verified.ok ? { fit, placed, captions: verified.captions, ok: true } : { fit, placed, ok: false }
}

/** The poster foot's latest lifer: "Latest lifer: Hooded Crow, Sep 2026", with where it was seen when there is a place
 *  ("…, Oct 2026, British Columbia, Canada": share.posterLatestPlace; the month as on the images). */
export function posterLatest(name: string, date: string | undefined, t: Pick<Ui, 'share' | 'date'>, place?: string): string {
  const d = formatMonth(date, t.date.months) || (date ?? '')
  return place ? fmt(t.share.posterLatestPlace, { name, date: d, place }) : fmt(t.share.posterLatest, { name, date: d })
}

/** The Big Year goal's line on the card ("Big Year 2027"), in the image's language; none for an All time goal. */
export function goalText(goal: NonNullable<ShareImageOpts['goal']>, strings: ShareStrings): string {
  if (goal.year === undefined) return ''
  return fmt(goal.basis === 'lifer' ? strings.share.bigYear.cardLifer : strings.share.bigYear.card, { year: goal.year })
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
  const latestRow = opts.latestAs?.row ?? (latestE && species.byCode.get(latestE.code)!)
  const strings = opts.strings
  const latestName = latestRow ? opts.nameOf?.(latestRow) ?? latestRow.com : ''
  const latestWhere = !opts.latestAs && latestE && opts.regions ? liferPlace(latestE.place, opts.regions) || undefined : undefined
  const latest = opts.latest !== false && latestRow ? (opts.latestAs ? { label: opts.latestAs.label, name: latestName } : latestText({ com: latestName, date: latestE!.date, place: latestWhere }, strings)) : undefined
  const goal = opts.goal
  const goalLabel = goal ? goalText(goal, strings) : undefined
  const filterText = opts.filterLabel?.trim() || goalLabel || undefined
  const named = opts.name?.trim() || undefined
  const content: CardContent = { name: !!named, filter: !!filterText, latest: !!latest, count: shown.length, target: goal?.target, countSize: opts.countSize }
  // A poster's head is its title alone: the name, else the filter in words. Its foot carries the latest lifer in words.
  const name = print ? named ?? filterText : named
  const label = print ? undefined : filterText
  const stamped = withStamp(opts.footer ?? FOOTER_LINE, stampDate(opts.now ?? new Date(), stampStrings(strings)))
  const footerLine = stamped
  const posterLifer = print && latest ? (opts.latestAs ? opts.latestAs.poster : posterLatest(latestName, latestE!.date, strings, latestWhere)) : undefined
  const printSize = opts.printSize ?? 'A2'
  const L = cardLayout(format, content, print ? printDesign(printSize, format === 'printLandscape') : undefined)
  let captionPlan: CaptionPlan | undefined
  if (print && opts.showNames) {
    const sample = shown.map((e) => {
      const r = species.byCode.get(e.code)
      return r ? (opts.nameOf?.(r) ?? r.com) : ''
    }).join('')
    await ensureCaptionFont(captionMinPx(printSize), sample)
    if (signal?.aborted) throw abortError()
    captionPlan = planCaptions(shown, species, printSize, L.collage.w, opts.nameOf, captionMeasurer())
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
  const capFit = captionPlan?.ok ? fitCaptionPack(pack, shown, format, content, printSize, captionPlan) : undefined
  if (capFit && !capFit.ok && !opts.pack) {
    pack = await packForImage(shown, species, imagePackSpec(format, content, opts.printSize, undefined, opts.arrangement), signal)
    if (signal?.aborted) throw abortError()
  }
  const fit = capFit?.ok ? capFit.fit : fitPack(pack, area, maxTileSide(area.w, L.maxTile, L.maxSide))
  const captions = capFit?.ok ? capFit.captions : undefined
  // Names asked for but not drawn (over the cap, a name too long, or a pack they don't fit): the caller says so.
  const namesDropped = print && !!opts.showNames && !captions
  const tiles: Tile[] = shown.flatMap((e) => {
    const b = pack.boxes.get(e.code)
    if (!b) return []
    const row = species.byCode.get(e.code)!
    const [x, y, w, h] = fitBox(fit, b)
    const tile: Tile = { x, y, w, h, ...(row.st ? sticker(e.code, Math.max(w, h), row.sv) : { url: null }) }
    return [tile]
  })
  // The latest lifer's sticker, contained in its square at the sticker's own aspect: in its row, or on a poster before the
  // foot's words (placeFooter puts it there, sized to the line).
  let lifer: Tile | null = null
  const liferSide = L.latest?.icon ?? (posterLifer ? posterIcon(POSTER_FOOT.line) : 0)
  if (latestRow && liferSide) {
    const ar = latestRow.st && latestRow.ar > 0 ? latestRow.ar : 1
    const w = ar >= 1 ? liferSide : liferSide * ar, h = ar >= 1 ? liferSide / ar : liferSide
    const x = L.latest?.x ?? 0, y = L.latest?.y ?? 0
    lifer = { x: x + (liferSide - w) / 2, y: y + (liferSide - h) / 2, w, h, ...(latestRow.st ? sticker(latestRow.code, liferSide, latestRow.sv) : { url: null }) }
  }
  // The count grows with the birds when a short list is scaled up past the width fit (its hole grew as much).
  const g = Math.min(fit.grow, 1.3)
  const K = { ...L.count, size: Math.round(L.count.size * g), labelSize: Math.round(L.count.labelSize * Math.min(g, 1.15)), gap: Math.round(L.count.gap * g) }
  // What the count draws, in the UI language ("1.089", "ESPÉCIES"); K's number and label are the geometry's.
  // With a goal the label says it ("OF 150 SPECIES"); the number is the count alone, at its no-goal size.
  // Beside the title the same two parts, on the title's line.
  const numText = countDisplay(content.count, strings.num)
  const labelText = (goal?.target !== undefined ? plural(strings.share.bigYear.ofTarget, goal.target, { n: countDisplay(goal.target, strings.num) }) : strings.count.label).toUpperCase()
  const countNum = K.size > 0 ? numText : ''
  const countLabel = K.size > 0 ? labelText : ''
  const countLine = L.titleCount ? { num: numText, label: labelText } : undefined
  return { format, L, colors, fit, tiles, lifer, K, countNum, countLabel, ...(countLine ? { countLine } : {}), footerLine, ...(posterLifer ? { posterLatest: posterLifer } : {}), latest, name, label, fonts: cardFonts(), ...(captions ? { captions } : {}), ...(namesDropped ? { namesDropped: true as const } : {}), ...(opts.transparent ? { transparent: true as const } : {}) }
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
  const { L, fonts: font, K, name, label, latest, footerLine, posterLatest: lifer, countNum, countLabel, countLine, captions } = d
  const fonts = [font.name(L.name?.size ?? 60), font.filter(34), ...(K.size > 0 ? [font.count(K.size), font.mono(K.labelSize)] : []), ...(countLine ? [font.count(TITLE_COUNT.num), font.mono(TITLE_COUNT.label)] : []), font.lifer(34), font.brand(30), font.footer(20)]
  if (captions?.length) fonts.push(font.filter(captions[0].fontPx))
  const captionSample = captions?.length ? captions.map((c) => c.lines.join('')).join('') : ''
  return fontsReady(
    fonts,
    `${name ?? ''}${label ?? ''}${countNum}${countLabel}${countLine ? countLine.num + countLine.label : ''}${latest ? latest.label.toUpperCase() + latest.name : ''}Everybird${footerLine}${lifer ?? ''}${captionSample}`,
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
  // Stickers: huashu-bird-sticker, CC BY 4.0 · 14 Nov 2026", never truncated). If it doesn't fit there at 17px or more, it takes its
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
    // `left`: where the credit's line starts, after the wordmark (beside it) or at the margin (under it).
    const place = (left: number) => {
      const room = maxW - FOOTER_GAP - left - creditMin - icon - ONE_LINE.gap
      const full = nameW(d.latest!.name, ns)
      const nameSize = full <= room ? ns : Math.max(ns * ONE_LINE.nameMin, Math.min(ns, Math.floor((ns * room) / full)))
      const nameText = clipTo((t) => nameW(t, nameSize), d.latest!.name, room)
      const x = X0 + maxW - (icon + ONE_LINE.gap + Math.max(labelW, nameW(nameText, nameSize)))
      const roomCredit = x - FOOTER_GAP - X0 - left
      return { nameSize, nameText, x, roomCredit, fits: nameText === d.latest!.name && roomCredit >= creditMin }
    }
    // Beside the wordmark when the credit (17px or more) and the whole name fit; else, as on every card, the credit takes
    // its own line under the wordmark (the two on the row's two baselines, paintCard), so it has the wordmark's width too.
    const beside = place(brandW)
    const at = beside.fits ? beside : place(0)
    const credit = { ...placeCredit(footerW, at.roomCredit, at.roomCredit, L.footer.credit), below: !beside.fits }
    const { x, nameText, nameSize } = at
    const lifer = d.lifer && { ...d.lifer, x: x + (icon - d.lifer.w) / 2, y: L.latest.y + (icon - d.lifer.h) / 2 }
    return { ...d, lifer, brandW, credit, shift: 0, oneLine: { x, labelW, nameText, nameSize } }
  }
  // A poster's right part: the bird's sticker (when it has one to show), then its words, the sticker counted in its width.
  const sticker = (px: number) => (d.lifer ? posterIcon(px) + posterIconGap(px) : 0)
  const posterW = (px: number) => measure(font.footer(px), px, d.posterLatest!, 0.6)
  const credit: PreparedCard['credit'] = d.posterLatest
    ? placePosterFoot(footerW, (px) => sticker(px) + posterW(px), maxW, brandW)
    : placeCredit(footerW, maxW - brandW, maxW, L.footer.credit, isPrint(d.format) ? POSTER_FOOT.min : CREDIT_MIN)
  // Each line under the wordmark's lifts the wordmark, the hairline and the latest lifer row by a line.
  const shift = ((credit.below ? 1 : 0) + (credit.latestBelow ? 1 : 0)) * (credit.size + 12)
  if (d.posterLatest && d.lifer) {
    // On the foot's bottom line (the right part's own line when it took one), ending where the words start, its middle on
    // the capitals' middle (mono caps are about 0.7 of the size).
    const px = credit.size, side = posterIcon(px)
    const base = L.footer.y + L.footer.size * 0.8
    const k = side / Math.max(d.lifer.w, d.lifer.h)
    const w = d.lifer.w * k, h = d.lifer.h * k
    const left = X0 + maxW - posterW(px) - posterIconGap(px) - side
    const lifer = { ...d.lifer, x: left + (side - w) / 2, y: base - 0.35 * px - h / 2, w, h }
    return { ...d, lifer, brandW, credit, shift }
  }
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
  paintTiles(ctx, card.tiles, imgs, C.line, range)
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
  // The head: the name (a poster's title, in Accent), with "Beside title" the count on its baseline at the right (alone,
  // at the left, without a name), in the big count's type: the number in Ink (Cabinet 700, -0.02em), then its label in
  // Muted (Geist Mono, upper case, tracked 0.06em), as under the count in the middle.
  let nameW = maxW
  if (card.countLine && L.name && L.titleCount) {
    const { num: ns, label: ls, gap } = L.titleCount
    // The name is drawn from its em box's top: its baseline is that far below (0.8 of the size where the canvas can't say).
    ctx.font = font.name(L.name.size)
    ctx.textBaseline = 'top'
    const drop = Math.abs(ctx.measureText('H').alphabeticBaseline ?? 0)
    const base = L.name.y + (Number.isFinite(drop) && drop > 0 ? drop : 0.8 * L.name.size)
    ctx.font = font.count(ns)
    track(-0.02, ns)
    const numW = ctx.measureText(card.countLine.num).width
    ctx.font = font.mono(ls)
    track(0.06, ls)
    const labelW = ctx.measureText(card.countLine.label).width
    const w = numW + gap + labelW
    const x = name ? X0 + maxW - w : X0
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    ctx.fillStyle = C.muted
    ctx.fillText(card.countLine.label, x + numW + gap, base)
    track(0, 0)
    ctx.font = font.count(ns)
    track(-0.02, ns)
    ctx.fillStyle = C.ink
    ctx.fillText(card.countLine.num, x, base)
    track(0, 0)
    ctx.textBaseline = 'top'
    nameW = maxW - w - 32
  }
  if (name && L.name) draw(name, font.name, L.name, 36, isPrint(card.format) ? C.accent : C.ink, X0, nameW)
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
    const ls = L.latest.label
    // The label on one line where it fits at 16px or more; else the place takes a line of its own under it, never cut.
    const tooLong = () => {
      ctx.font = font.mono(16)
      track(0.06, 16)
      return ctx.measureText(latest.label.toUpperCase()).width > tw
    }
    const lines = latest.place && latest.head && tooLong() ? [latest.head, latest.place] : [latest.label]
    const blockH = lines.length * ls + (lines.length - 1) * 6 + 10 + L.latest.name
    const top = y + (icon - blockH) / 2
    track(0.06, ls)
    lines.forEach((line, i) => draw(line.toUpperCase(), font.mono, { y: top + i * (ls + 6), size: ls }, 16, C.muted, tx, tw))
    track(0, 0)
    draw(latest.name, font.lifer, { y: top + lines.length * (ls + 6) + 4, size: L.latest.name }, 24, C.ink, tx, tw)
  }

  // The footer (placed by prepareCard): the hairline, the wordmark, the line beside or under it.
  // A one-line row: the wordmark and the credit lifted to the lifer block's middle; or, the credit under the wordmark, the
  // two on the block's two baselines (its label's 30 above its name's).
  const stack = !!card.oneLine && credit.below
  const base = L.footer.y + L.footer.size * 0.8 - (card.oneLine && !stack ? FOOTER_LIFT : 0)
  ctx.fillStyle = C.hairline
  ctx.fillRect(X0, L.rule.y - shift, maxW, 2)
  ctx.textBaseline = 'alphabetic'
  ctx.font = font.brand(L.footer.size)
  ctx.fillStyle = C.ink
  ctx.fillText('Everybird', X0, stack ? base - 30 : base - shift)
  ctx.font = font.footer(credit.size)
  ctx.fillStyle = C.muted
  // A poster's latest lifer at the right end of the bottom line: the wordmark's, or its own under it (placePosterFoot),
  // the site and credit then a line up.
  ctx.fillText(footerLine, credit.below ? X0 : X0 + brandW, credit.latestBelow ? base - (credit.size + 12) : base)
  if (card.posterLatest) {
    ctx.textAlign = 'right'
    ctx.fillText(card.posterLatest, X0 + maxW, base)
    ctx.textAlign = 'left'
    if (lifer) paintTiles(ctx, [lifer], imgs, C.line, range)
  }
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
