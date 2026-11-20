// The Map and Tree views' share images (map-image.ts, tree-image.ts): the collage card's frame from image.ts (the title,
// the count, the filter in words, the footer line with the sticker credit and the date stamp, Dark image and Transparent
// background), with no stickers, around a drawing of the view in the area the collage would take. The count sits on top
// of that area, centred, with an optional line under it (the tree's orders, families and genera); the drawing gets the
// rest. The map's footer is the collage's (MAP_FOOTER, FOOTER_LINE); the tree's adds the tree's credit (TREE_FOOTER).
// Loaded only when Share is pressed in one of those views.
import type { Ui } from '@/i18n/messages/en'
import { DIGIT_CAP, MONO_CAP } from '@/lib/layout/count-box'
import type { AppState } from '@/lib/list/store'
import type { TreeLevel } from '@/lib/tree/levels'
import type { TreeLayout } from '@/lib/tree-mine'
import { FOOTER_LINE, IMAGE_SCALE, ensureViewFonts, paintCard, prepareCard, type ImageFormat, type ImagePack, type PreparedCard, type ShareImageOpts } from './image'

/** The footer lines (before the date stamp; English in every language, as FOOTER_LINE): the map's the collage's (the
 *  site and the sticker credit, Yusuf 2026-11-20), the tree's FOOTER_LINE and the tree's credit (AvesData is CC BY 4.0,
 *  so an image of it carries the credit), in the credits' one form. */
export const MAP_FOOTER = FOOTER_LINE
export const TREE_FOOTER = `${FOOTER_LINE} · Tree: AvesData, CC BY 4.0`

/** The level the view had open when Share was pressed: the country the map has open (`names`: how the map names its
 *  places, in the UI language), or the tree's (`mine`: its "Lifers only" switch; `layout`: the layout on screen, which
 *  every tree image draws). */
export type ShareAt = { place?: string; names?: (key: string) => string; tree?: TreeLevel; mine?: boolean; layout?: TreeLayout }
/** A view image's input: the share image's, with the view's level, the app state it reads and the UI strings. */
export type ViewImageOpts = ShareImageOpts & {
  at: ShareAt; state: Pick<AppState, 'list' | 'filter' | 'seen' | 'sci'>; t: Ui; hideTotals?: boolean
  /** Device px per design unit (a poster's, print.ts viewPosterScale); default the format's IMAGE_SCALE, 1 for a poster's preview. */
  scale?: number
}
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
  const card = await prepareCard({ ...opts, footer, pack: NO_BIRDS, latest: false, showNames: false })
  await ensureViewFonts(card, `${(under ?? []).join('')}${sample}`)
  const { L, K } = card
  const c = L.collage
  const blockH = K.size > 0 ? DIGIT_CAP * K.size + K.gap + MONO_CAP * K.labelSize : 0
  const s = opts.scale ?? IMAGE_SCALE[opts.format as ImageFormat] ?? 1
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
  paintCard(ctx, { ...card, fit: { ...card.fit, cx: c.x + c.w / 2, cy: c.y + blockH / 2 } }, new Map())
  ctx.font = card.fonts.footer(subPx)
  ctx.fillStyle = card.colors.muted
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  lines.forEach((line, i) => ctx.fillText(line, c.x + c.w / 2, c.y + blockH + (i + 1) * lineH))
  paint(ctx, card, { x: c.x, y: c.y + top, w: c.w, h: c.h - top })
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
