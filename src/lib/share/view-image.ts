// The Map and Tree views' share images (map-image.ts, tree-image.ts): the collage card's frame from image.ts (the title,
// the count, the filter in words, the footer line with the sticker credit and the date stamp, Dark image and Transparent
// background), with no stickers, around a drawing of the view in the area the collage would take. The count sits on top
// of that area, centred; the drawing gets the rest. Loaded only when Share is pressed in one of those views.
import type { Ui } from '@/i18n/messages/en'
import { DIGIT_CAP, MONO_CAP } from '@/lib/layout/count-box'
import type { AppState } from '@/lib/list/store'
import type { TreeLevel } from '@/lib/tree/levels'
import { IMAGE_SCALE, paintCard, prepareCard, type ImageFormat, type ImagePack, type PreparedCard, type ShareImageOpts } from './image'

/** The level the view had open when Share was pressed: the Places level the map follows, or the tree's (`mine`: its
 *  "Only my birds" switch). */
export type ShareAt = { place?: string; tree?: TreeLevel; mine?: boolean }
/** A view image's input: the share image's, with the view's level, the app state it reads and the UI strings. */
export type ViewImageOpts = ShareImageOpts & { at: ShareAt; state: Pick<AppState, 'list' | 'filter' | 'seen' | 'sci'>; t: Ui }
export type Area = { x: number; y: number; w: number; h: number }

/** A `w` × `h` drawing fitted whole in `area` (contain), centred: its top-left corner and scale. */
export function fitBox(w: number, h: number, area: Area): { x: number; y: number; s: number } {
  const s = Math.min(area.w / w, area.h / h)
  return { x: area.x + (area.w - w * s) / 2, y: area.y + (area.h - h * s) / 2, s }
}

const NO_BIRDS: ImagePack = { W: 1, H: 1, boxes: new Map() }
/** Between the count and the drawing under it. */
const COUNT_GAP = 32

/** The card's frame with `paint` drawing the view into its area (design units), as a PNG. */
export async function renderViewImage(opts: ShareImageOpts, paint: (ctx: CanvasRenderingContext2D, card: PreparedCard, area: Area) => void): Promise<Blob> {
  const card = await prepareCard({ ...opts, pack: NO_BIRDS, latest: false, markNewest: false, markFirst: false, showNames: false })
  const { L, K } = card
  const c = L.collage
  const blockH = K.size > 0 ? DIGIT_CAP * K.size + K.gap + MONO_CAP * K.labelSize : 0
  const top = blockH ? blockH + COUNT_GAP : 0
  const s = IMAGE_SCALE[opts.format as ImageFormat]
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(L.W * s)
  canvas.height = Math.round(L.H * s)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  if (s !== 1) ctx.setTransform(s, 0, 0, s, 0, 0)
  // paintCard centres the count on fit's centre: moved to the top of the area.
  paintCard(ctx, { ...card, fit: { ...card.fit, cx: c.x + c.w / 2, cy: c.y + blockH / 2 } }, new Map())
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
