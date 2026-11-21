// The Map and Tree views' share images (map-image.ts, tree-image.ts): the collage card's frame from image.ts (the title,
// the count, the filter in words, the footer line with the sticker credit and the date stamp, Appearance and Transparent
// background), with no stickers, around a drawing of the view in the area the collage would take. The count sits on top
// of that area, centred, with an optional line under it (the tree's orders, families and genera); the drawing gets the
// rest. The map's footer is the site alone (MAP_FOOTER: it draws no stickers); the tree's adds the tree's credit (TREE_FOOTER).
// Loaded only when Share is pressed in one of those views.
import type { Ui } from '@/i18n/messages/en'
import { DIGIT_CAP, MONO_CAP } from '@/lib/layout/count-box'
import type { AppState } from '@/lib/list/store'
import type { TipRank, TreeLevel } from '@/lib/tree/levels'
import type { TreeLayout } from '@/lib/tree-mine'
import type { PrintSize } from './print'
import { FOOTER_LINE, IMAGE_SCALE, SITE_LABEL, ensureViewFonts, loadStickers, paintCard, prepareCard, type CardFormat, type ImageFormat, type ImagePack, type PreparedCard, type ShareImageOpts } from './image'

/** The footer lines (before the date stamp; English in every language, as FOOTER_LINE): the map's the site alone (it
 *  draws no stickers, so no sticker credit), the tree's FOOTER_LINE (its tips carry stickers) and the tree's credit
 *  (AvesData is CC BY 4.0, so an image of it carries the credit), in the credits' one form. */
export const MAP_FOOTER = SITE_LABEL
export const TREE_FOOTER = `${FOOTER_LINE} · Tree: AvesData, CC BY 4.0`

/** The level the view had open when Share was pressed: the country the map has open (`names`: how the map names its
 *  places, in the UI language), or the tree's (`mine`: its "Lifers only" switch; `layout`: the layout on screen, which
 *  every tree image draws, or the dialog's Arrangement row's; `rank`: the rank the tree draws, for Print's Down to; `time`: its "Time scale" switch, on unless false; `fits`:
 *  whether the Fan and the Radial name every tip on screen, for that row's reasons). */
export type ShareAt = { place?: string; names?: (key: string) => string; tree?: TreeLevel; rank?: TipRank; mine?: boolean; layout?: TreeLayout; time?: boolean; fits?: Record<'fan' | 'circle', boolean> }
/** A total a view image can draw on top: the Map's species and countries, the Tree's species, genera, families and orders. */
export type TotalKey = 'species' | 'countries' | 'genera' | 'families' | 'orders'
/** `all` (an image's totals, in its order) kept to those `chosen` (the dialog's Totals row; unset, every one). */
export const chosenTotals = <K extends TotalKey>(all: readonly K[], chosen?: readonly TotalKey[]): K[] => all.filter((k) => !chosen || chosen.includes(k))
/** A view image's input: the share image's, with the view's level, the app state it reads and the UI strings
 *  (`totals`: the totals drawn on top, any of the image's in any combination, none included; unset, all of them;
 *  `oldest`: the Tree image draws its oldest lineage in the latest lifer's place). */
export type ViewImageOpts = ShareImageOpts & {
  at: ShareAt; state: Pick<AppState, 'list' | 'filter' | 'seen' | 'sci'>; t: Ui; totals?: readonly TotalKey[]; oldest?: boolean
  /** Device px per design unit (a poster's, print.ts viewPosterScale); default the format's IMAGE_SCALE, 1 for a poster's preview. */
  scale?: number
  /** The Tree image's: called with whether the Fan and the Radial name every tip in this image's area, so the dialog
   *  shows one that cannot as off (its reason) rather than drawing another layout without a word; `byCard` has the same
   *  for this card and its other orientation's (round 6, item 11), keyed by card format. */
  onTreeFits?: (fits: Record<'fan' | 'circle', boolean>, byCard?: Partial<Record<CardFormat, Record<'fan' | 'circle', boolean>>>) => void
  /** The Tree poster's (Print's "Down to"): draw the rank under the one on screen, where every name prints at
   *  TREE_NAME_MIN_PT or more at this size; at a size where it does not, the screen's rank. */
  deeper?: boolean
  /** The Tree poster's: called with the rank under the screen's and which sizes print it readably (DeeperFits), or null
   *  when the screen shows the species or nothing is under its rank. */
  onDeeper?: (deeper: DeeperFits | null) => void
}
/** The rank under the one on screen, and per poster size whether every one of its names prints whole at
 *  TREE_NAME_MIN_PT or more, in this orientation and arrangement. */
export type DeeperFits = { rank: TipRank; fits: Record<PrintSize, boolean> }
export type Area = { x: number; y: number; w: number; h: number }

/** A `w` × `h` drawing fitted whole in `area` (contain), centred: its top-left corner and scale. */
export function fitBox(w: number, h: number, area: Area): { x: number; y: number; s: number } {
  const s = Math.min(area.w / w, area.h / h)
  return { x: area.x + (area.w - w * s) / 2, y: area.y + (area.h - h * s) / 2, s }
}

const NO_BIRDS: ImagePack = { W: 1, H: 1, boxes: new Map() }
/** Between the count and the drawing under it. */
const COUNT_GAP = 32

/** `parts` joined with " · ", broken between parts onto as many lines as `max` (in `width`'s units) needs. */
export function wrapParts(parts: readonly string[], width: (text: string) => number, max: number): string[] {
  const lines: string[] = []
  for (const p of parts) {
    const joined = lines.length ? `${lines[lines.length - 1]} · ${p}` : ''
    if (joined && width(joined) <= max) lines[lines.length - 1] = joined
    else lines.push(p)
  }
  return lines
}

/**
 * The card's frame, its footer line `footer`, with `paint` drawing the view into its area (design units), as a PNG.
 * `under`: the parts of a line under the count, at the footer's size (two lines when one does not fit); none when the
 * count is hidden. `sample`: every other text `paint` draws, so the fonts it needs are loaded first.
 */
export async function renderViewImage(opts: ShareImageOpts & { scale?: number }, footer: string, paint: (ctx: CanvasRenderingContext2D, card: PreparedCard, area: Area) => void, under?: readonly string[], sample = ''): Promise<Blob> {
  // No latest lifer, unless the view gives a bird for its place (latestAs: the Tree's oldest lineage), drawn as the
  // collage image draws its latest lifer.
  const s = opts.scale ?? IMAGE_SCALE[opts.format as ImageFormat] ?? 1
  const card = await prepareCard({ ...opts, footer, pack: NO_BIRDS, latest: !!opts.latestAs, showNames: false }, s)
  const lifer = card.lifer?.url ? card.lifer : null
  const imgs = lifer ? await loadStickers([...new Set([lifer.url!, ...(lifer.fallback ? [lifer.fallback] : [])])], { signal: opts.signal }) : new Map<string, HTMLImageElement | null>()
  if (lifer?.fallback && !imgs.get(lifer.url!)) imgs.set(lifer.url!, imgs.get(lifer.fallback) ?? null)
  await ensureViewFonts(card, `${(under ?? []).join('')}${sample}`)
  const { L, K } = card
  const c = L.collage
  const blockH = K.size > 0 ? DIGIT_CAP * K.size + K.gap + MONO_CAP * K.labelSize : 0
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(L.W * s)
  canvas.height = Math.round(L.H * s)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  // A poster's height is fractional (A4 1527.7): Paper over the whole canvas covers its last row.
  if (!card.transparent && canvas.height > L.H * s) {
    ctx.fillStyle = card.colors.paper
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  if (s !== 1) ctx.setTransform(s, 0, 0, s, 0, 0)
  const subPx = L.footer.credit, lineH = Math.round(subPx * 1.5)
  ctx.font = card.fonts.footer(subPx)
  const lines = blockH && under?.length ? wrapParts(under, (text) => ctx.measureText(text).width, c.w) : []
  const top = blockH ? blockH + lines.length * lineH + COUNT_GAP : 0
  // paintCard centres the count on fit's centre: moved to the top of the area.
  paintCard(ctx, { ...card, fit: { ...card.fit, cx: c.x + c.w / 2, cy: c.y + blockH / 2 } }, imgs)
  ctx.font = card.fonts.footer(subPx)
  ctx.fillStyle = card.colors.muted
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  lines.forEach((line, i) => ctx.fillText(line, c.x + c.w / 2, c.y + blockH + (i + 1) * lineH))
  // A row lifted with the footer (placeFooter's shift) by more than the room kept for it (L.latest.lift): the Tree's
  // longer footer on Post 5:4. The drawing ends that much higher, so the row keeps its gap.
  const lifted = L.latest ? Math.max(0, card.shift - (L.latest.lift ?? 0)) : 0
  paint(ctx, card, { x: c.x, y: c.y + top, w: c.w, h: c.h - top - lifted })
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))), 'image/png')
  })
}

/** `text` clipped with an ellipsis to `max` px in the context's current font. */
export function clipText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}
