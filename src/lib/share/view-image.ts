// The Map and Tree views' share images (map-image.ts, tree-image.ts): the collage card's frame from image.ts (the title,
// the count, the filter in words, the footer line (the link to the credits and the date), Appearance and Transparent
// background), with no stickers, around a drawing of the view in the area the collage would take. The count sits on top
// of that area, centred, with an optional line under it (the tree's orders, families and genera); the drawing gets the
// rest. The footer is the collage card's (FOOTER_LINE: the credits page names the tree's and the maps' sources too).
// Loaded only when Share is pressed in one of those views.
import type { Ui } from '@/i18n/messages/en'
import { DIGIT_CAP, MONO_CAP } from '@/lib/layout/count-box'
import type { AppState } from '@/lib/list/store'
import type { TipRank, TreeLevel } from '@/lib/tree/levels'
import type { TreeLayout } from '@/lib/tree-mine'
import { IMAGE_SCALE, dropLast, ensureViewFonts, isPrint, loadStickers, paintCard, paintRow, paintTiles, prepareCard, wrapParts, type CardFonts, type ImageFormat, type ImagePack, type PreparedCard, type ShareImageOpts } from './image'

/** The level the view had open when Share was pressed: the country the map has open (`names`: how the map names its
 *  places, in the UI language), or the tree's (`mine`: its "Lifers only" switch; `layout`: the layout on screen, which
 *  every tree image draws, or the dialog's Arrangement row's; `rank`: the rank the tree draws (its Level), which every tree image and poster draws too, and the file's name says; `time`: its "Time scale" switch, on unless false). */
export type ShareAt = { place?: string; names?: (key: string) => string; tree?: TreeLevel; rank?: TipRank; mine?: boolean; layout?: TreeLayout; time?: boolean }
/** A total a view image can draw on top: the Map's species and countries, the Tree's species, genera, families and orders. */
export type TotalKey = 'species' | 'countries' | 'genera' | 'families' | 'orders'
/** `all` (an image's totals, in its order) kept to those `chosen` (the dialog's Totals row; unset, every one). */
export const chosenTotals = <K extends TotalKey>(all: readonly K[], chosen?: readonly TotalKey[]): K[] => all.filter((k) => !chosen || chosen.includes(k))
/** A view image's input: the share image's, with the view's level, the app state it reads and the UI strings
 *  (`totals`: the totals drawn on top, any of the image's in any combination, none included; unset, all of them;
 *  `oldest`: the Tree image draws its oldest lineage in the latest lifer's place). */
export type ViewImageOpts = ShareImageOpts & {
  at: ShareAt; state: Pick<AppState, 'list' | 'filter' | 'seen' | 'sci'>; t: Ui; totals?: readonly TotalKey[]; oldest?: boolean
  /** Device px per design unit (a poster's, print.ts printScale); default the format's IMAGE_SCALE, 1 for a poster's preview. */
  scale?: number
  /** A poster's: given the painter instead of a drawn canvas (no canvas is made; the Blob returned is empty). */
  onPainter?: (painter: ViewPainter) => void
  /** The Tree image's (round 6, item 9): called with the arrangement drawn (always the one asked for), its names' size
   *  and whether names or counts are under the readable sizes (NAME_READ, COUNT_READ), for the dialog's note. */
  onTreeText?: (text: { layout: 'fan' | 'circle' | 'rows'; px: number; small: boolean }) => void
  /** The Tree image's room under its totals and its drawing's real bounds in it, placed (design units; for tests). */
  onTreeBounds?: (b: { room: Area; drawing: Area }) => void
}
export type Area = { x: number; y: number; w: number; h: number }
/** A view image, drawn: `paint` draws all of it, in design units under the context's transform, the same every call
 *  (so a poster's strips are one drawing seen through different windows); `paper`, the card's background (null: transparent). */
export type ViewPainter = { paper: string | null; paint: (ctx: CanvasRenderingContext2D) => void }

/** A `w` × `h` drawing fitted whole in `area` (contain), centred: its top-left corner and scale. */
export function fitBox(w: number, h: number, area: Area): { x: number; y: number; s: number } {
  const s = Math.min(area.w / w, area.h / h)
  return { x: area.x + (area.w - w * s) / 2, y: area.y + (area.h - h * s) / 2, s }
}

const NO_BIRDS: ImagePack = { W: 1, H: 1, boxes: new Map() }
/** Between the count and the drawing under it. */
const COUNT_GAP = 32

// wrapParts lives in image.ts now (the collage card's filter label wraps with it too); re-exported for the views.
export { wrapParts }

/**
 * The card's frame, with `paint` drawing the view into its area (design units), as a PNG.
 * `under`: the parts of a line under the count, at the footer's size (two lines when one does not fit); none when the
 * count is hidden. `sample`: every other text `paint` draws, so the fonts it needs are loaded first.
 */
export async function renderViewImage(opts: ShareImageOpts & Pick<ViewImageOpts, 'scale' | 'onPainter'>, paint: (ctx: CanvasRenderingContext2D, card: PreparedCard, area: Area) => void, under?: readonly string[], sample = ''): Promise<Blob> {
  // No latest lifer, unless the view gives a bird for its place (latestAs: the Tree's oldest lineage), drawn as the
  // collage image draws its latest lifer.
  const s = opts.scale ?? IMAGE_SCALE[opts.format as ImageFormat] ?? 1
  const card = await prepareCard({ ...opts, pack: NO_BIRDS, latest: !!opts.latestAs, showNames: false }, s)
  const lifer = card.lifer?.url ? card.lifer : null
  const imgs = lifer ? await loadStickers([...new Set([lifer.url!, ...(lifer.fallback ? [lifer.fallback] : [])])], { signal: opts.signal }) : new Map<string, HTMLImageElement | null>()
  if (lifer?.fallback && !imgs.get(lifer.url!)) imgs.set(lifer.url!, imgs.get(lifer.fallback) ?? null)
  await ensureViewFonts(card, `${(under ?? []).join('')}${sample}`)
  const { L, K } = card
  // A two-line filter label (image.ts labelLines) moves the area's top down by its second line.
  const drop = card.headDrop ?? 0
  const c = drop ? { ...L.collage, y: L.collage.y + drop, h: L.collage.h - drop } : L.collage
  const blockH = K.size > 0 ? DIGIT_CAP * K.size + K.gap + MONO_CAP * K.labelSize : 0
  // The whole drawing, in design units under the context's transform (the canvas's scale, or a poster strip's).
  const draw = (ctx: CanvasRenderingContext2D) => {
    const subPx = L.footer.credit, lineH = Math.round(subPx * 1.5)
    ctx.font = card.fonts.footer(subPx)
    const lines = blockH && under?.length ? wrapParts(under, (text) => ctx.measureText(text).width, c.w) : []
    const top = blockH ? blockH + lines.length * lineH + COUNT_GAP : 0
    // A poster's row (the Tree's oldest lineage) is painted after the view, so its name can be the view's largest name
    // (round 6, item 24: never smaller than the tip names, read from the same distance); elsewhere paintCard draws it.
    const lateRow = isPrint(card.format) && card.latest && card.lifer && L.latest ? card.latest : undefined
    // paintCard centres the count on fit's centre: moved to the top of the area.
    paintCard(ctx, { ...card, fit: { ...card.fit, cx: c.x + c.w / 2, cy: c.y + blockH / 2 }, ...(lateRow ? { latest: undefined } : {}) }, imgs)
    ctx.font = card.fonts.footer(subPx)
    ctx.fillStyle = card.colors.muted
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    lines.forEach((line, i) => ctx.fillText(line, c.x + c.w / 2, c.y + blockH + (i + 1) * lineH))
    const seen = lateRow ? watchNames(ctx, card.fonts) : undefined
    paint(ctx, seen ? { ...card, fonts: seen.fonts } : card, { x: c.x, y: c.y + top, w: c.w, h: c.h - top })
    if (lateRow && seen && L.latest && card.lifer) {
      // The row's own size, or the view's largest name if larger (a Tree's tip names, at most 48 units: the sticker's line holds it).
      const R = L.latest, name = Math.max(R.name, seen.done())
      paintTiles(ctx, [card.lifer], imgs, card.colors.line)
      paintRow(ctx, card.fonts, card.colors, { ...R, name, label: Math.round((R.label * name) / R.name) }, lateRow)
    }
  }
  // A poster paints the drawing strip by strip itself (poster.ts makeViewPoster); its file comes from the encoder.
  if (opts.onPainter) {
    opts.onPainter({ paper: card.transparent ? null : card.colors.paper, paint: draw })
    return new Blob([])
  }
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
  draw(ctx)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))), 'image/png')
  })
}

/**
 * The largest size `paint` draws text at in the row's face (`fonts.lifer`, the Tree's tip names): every face a view
 * paints with comes from the card's fonts, so the face in use at each fillText is known; measuring (measureText) never
 * counts. `done` restores fillText and gives that size (0 for none).
 */
function watchNames(ctx: CanvasRenderingContext2D, fonts: CardFonts): { fonts: CardFonts; done: () => number } {
  let cur = 0, max = 0
  const wrapped = Object.fromEntries(Object.entries(fonts).map(([k, f]) => [k, (px: number) => { cur = k === 'lifer' ? px : 0; return f(px) }])) as CardFonts
  const own = Object.prototype.hasOwnProperty.call(ctx, 'fillText')
  const fill = ctx.fillText
  ctx.fillText = function (this: CanvasRenderingContext2D, ...a: Parameters<CanvasRenderingContext2D['fillText']>) { max = Math.max(max, cur); return fill.apply(this, a) }
  return { fonts: wrapped, done: () => { if (own) ctx.fillText = fill; else delete (ctx as { fillText?: unknown }).fillText; return max } }
}

/** `text` clipped with an ellipsis to `max` px in the context's current font. */
export function clipText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (Array.from(t).length > 1 && ctx.measureText(`${t}…`).width > max) t = dropLast(t)
  return `${t.trimEnd()}…`
}

/** The room between the totals and the drawing under them (round 6, item 9: 20, was 32). */
const TOTALS_BELOW = 20
/**
 * The totals' type, as the promo's tree poster (round 6): each number (Cabinet 700, Ink) over its rank (Geist Mono 500,
 * Muted, tracked .06em), right-aligned, `gap` between them; `between` the blocks, and between the title and the group.
 */
export const TOTALS_TYPE = { num: 44, label: 15, gap: 8, between: 48, track: 0.06 } as const

/**
 * Where the totals go (round 6, as the promo's tree poster): one right-aligned group at the content's top right. On the
 * title's band when the title (`titleW` wide at its size; undefined for none) and the group (`groupW` at TOTALS_TYPE)
 * fit the `width` side by side with TOTALS_TYPE.between between them; else under the title, or at the top with no
 * title. `k` shrinks the group only where it is wider than the width on its own.
 */
export function totalsPlace(groupW: number, titleW: number | undefined, width: number): { band: boolean; k: number } {
  return { band: titleW !== undefined && titleW + TOTALS_TYPE.between + groupW <= width, k: Math.min(1, width / Math.max(1e-6, groupW)) }
}

/**
 * The Tree's and the Map's totals (round 6, as the promo's tree poster: counts only, "65" over "FAMILIES"): one
 * right-aligned group at the top right of `full`, each number over its word, right-aligned. Beside the card's title on
 * its band (the title at the left, the numbers' caps level with its caps) when both fit (totalsPlace); else under the
 * title, or at the top without one. `head`: the room they take from the top of `full` (none on the title's band unless
 * they reach below the card's head; none without totals); `draw` paints them.
 */
export function viewTotals(ctx: CanvasRenderingContext2D, card: PreparedCard, full: Area, totals: readonly { n: string; label: string }[]): { head: number; draw: () => void } {
  const C = card.colors
  const font = card.fonts
  const T = TOTALS_TYPE
  const widthOf = (x: { n: string; label: string }, k: number) => {
    ctx.font = font.count(T.num * k)
    const nw = ctx.measureText(x.n).width
    ctx.font = font.mono(T.label * k)
    ctx.letterSpacing = `${T.track * T.label * k}px`
    const lw = ctx.measureText(x.label).width
    ctx.letterSpacing = '0px'
    return Math.max(nw, lw)
  }
  const groupW = (k: number) => totals.reduce((sum, x, i) => sum + widthOf(x, k) + (i ? T.between * k : 0), 0)
  // The line they sit beside (Yusuf, 2026-11-24): the title's; with no title, or one too long to share its line, the
  // filter caption's (when drawn on one line); else a band of their own under the head.
  const lines = [
    card.name && card.L.name ? { text: card.name, t: card.L.name, f: font.name } : undefined,
    card.label && card.L.filter && !(card.labelLines && card.labelLines.length > 1) ? { text: card.label, t: card.L.filter, f: font.filter } : undefined,
  ].filter((x) => x !== undefined)
  const widthAt = (x: (typeof lines)[number]) => { ctx.font = x.f(x.t.size); return ctx.measureText(x.text).width }
  const head = lines.find((x) => totalsPlace(groupW(1), widthAt(x), full.w).band)
  const place = totalsPlace(groupW(1), head ? widthAt(head) : undefined, full.w)
  const tk = place.k
  const numCap = T.num * tk * 0.72, labelCap = T.label * tk * 0.72
  const groupH = totals.length ? numCap + T.gap * tk + labelCap : 0
  // The title's caps' top (paintCard draws it from its em box's top; its baseline that far below, 0.8 of the size
  // where the canvas can't say).
  let groupTop = full.y
  if (place.band && head) {
    ctx.font = head.f(head.t.size)
    ctx.textBaseline = 'top'
    const drop = Math.abs(ctx.measureText('H').alphabeticBaseline ?? 0)
    groupTop = head.t.y + (Number.isFinite(drop) && drop > 0 ? drop : 0.8 * head.t.size) - 0.72 * head.t.size
  }
  const draw = () => {
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'right'
    let x = full.x + full.w
    for (let i = totals.length - 1; i >= 0; i--) {
      const tot = totals[i]
      ctx.font = font.count(T.num * tk)
      ctx.fillStyle = C.ink
      ctx.fillText(tot.n, x, groupTop + numCap)
      ctx.font = font.mono(T.label * tk)
      ctx.letterSpacing = `${T.track * T.label * tk}px`
      ctx.fillStyle = C.muted
      ctx.fillText(tot.label, x, groupTop + numCap + T.gap * tk + labelCap)
      ctx.letterSpacing = '0px'
      x -= widthOf(tot, tk) + T.between * tk
    }
    ctx.textAlign = 'left'
  }
  return { head: !totals.length ? 0 : Math.max(0, groupTop + groupH + TOTALS_BELOW - full.y), draw }
}
