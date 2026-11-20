// The comparison card (Compare, /c/): the share image's post frame from image.ts (the title, a line under it, the
// footer with the sticker credit and the date stamp, in the page's theme), and in the collage's place the Venn
// diagram of the first list against one other (venn.ts: the same paths the page lays over the card as pointer
// shortcuts) over a grid of the comparison's stickers, those on the first list alone, then both, then the other's.
// The card never says "you": it travels. Loaded only when a comparison shows.
import { fmt } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import type { Ui } from '@/i18n/messages/en'
import type { SpeciesIndex } from '@/lib/species/load'
import { stickerUrl } from '@/lib/sticker-url'
import { clipText } from './view-image'
import { ensureViewFonts, loadStickers, paintCard, paintTiles, prepareCard, type ImagePack, type Tile } from './image'
import { PAIR_PARTS, type PairPart } from './compare'
import { vennLayout, type Venn, type VennCounts } from './venn'

export type CompareCardOpts = {
  /** The card's title (the lists' names) and the line under it (each list's count). */
  title: string
  line: string
  /** The two circles' names: the first list's and the other's. */
  names: [first: string, other: string]
  counts: VennCounts
  /** The birds to draw as stickers, left to right, top to bottom (compare.ts spread). */
  stickers: string[]
  species: SpeciesIndex
  theme: 'light' | 'dark'
  t: Ui
  now?: Date
}
/** The card as a PNG, its design size, and its Venn in the same units (for the page's pointer regions). */
export type CompareCard = { blob: Blob; W: number; H: number; venn: Venn }

const NO_BIRDS: ImagePack = { W: 1, H: 1, boxes: new Map() }
/** The Venn's share of the collage area's height; the stickers take the rest, below a gap. */
const VENN_H = 0.6
const GAP = 40
const COLS = 9
export const CARD_STICKERS = 36
/** Each region's number (Cabinet Grotesk 700) and name (Satoshi 600) under it, shrunk to fit the region. */
const NUM_MAX = 84, NUM_MIN = 30, NAME_MAX = 28, NAME_MIN = 18

export async function drawCompareCard(o: CompareCardOpts): Promise<CompareCard> {
  const { t, counts, species } = o
  const card = await prepareCard({
    format: 'post', entries: [], species, name: o.title, filterLabel: o.line, theme: o.theme, strings: t,
    pack: NO_BIRDS, latest: false, countSize: 'hide', now: o.now,
  })
  const caption: Record<PairPart, string> = {
    first: fmt(t.compare.only, { name: o.names[0] }),
    both: t.compare.both,
    other: fmt(t.compare.only, { name: o.names[1] }),
  }
  const nums = PAIR_PARTS.map((p) => formatInt(counts[p], t.num))
  await ensureViewFonts(card, `${Object.values(caption).join('')}${nums.join('')}`)
  const { L, colors: C, fonts } = card
  const c = L.collage
  const vh = Math.round(c.h * VENN_H)
  const venn = vennLayout(counts, { x: c.x, y: c.y, w: c.w, h: vh })

  // The stickers: a grid under the Venn, each contained in its cell at its own aspect.
  const n = o.stickers.length
  const cols = Math.min(COLS, Math.max(1, n))
  const rows = Math.ceil(n / cols)
  const gy = c.y + vh + GAP, gh = c.h - vh - GAP
  const cell = n ? Math.min(c.w / cols, gh / rows, 160) : 0
  const gx = c.x + (c.w - cols * cell) / 2, gTop = gy + (gh - rows * cell) / 2
  const pad = cell * 0.08
  const tiles: Tile[] = o.stickers.flatMap((code, i) => {
    const row = species.byCode.get(code)
    if (!row) return []
    const side = cell - 2 * pad
    const ar = row.st && row.ar > 0 ? row.ar : 1
    const [w, h] = ar >= 1 ? [side, side / ar] : [side * ar, side]
    const x = gx + (i % cols) * cell + (cell - w) / 2, y = gTop + Math.floor(i / cols) * cell + (cell - h) / 2
    return [{ x, y, w, h, url: row.st ? stickerUrl(code, side, 1, row.sv) : null }]
  })
  const imgs = await loadStickers([...new Set(tiles.flatMap((x) => (x.url ? [x.url] : [])))])

  const canvas = document.createElement('canvas')
  canvas.width = L.W
  canvas.height = L.H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  paintCard(ctx, card, new Map())

  // The Venn: each circle Surface, the overlap Hairline, both outlined in Ink; in every region its number and name.
  ctx.fillStyle = C.surface
  ctx.fill(new Path2D(venn.paths.first))
  ctx.fill(new Path2D(venn.paths.other))
  if (venn.paths.both) {
    ctx.fillStyle = C.hairline
    ctx.fill(new Path2D(venn.paths.both))
  }
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 4
  for (const k of [venn.a, venn.b]) {
    ctx.beginPath()
    ctx.arc(k.cx, k.cy, k.r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  PAIR_PARTS.forEach((p, i) => {
    const s = venn.spots[p]
    const room = s.w * 0.84
    let num = NUM_MAX
    ctx.font = fonts.count(num)
    while (num > NUM_MIN && ctx.measureText(nums[i]).width > room) ctx.font = fonts.count((num -= 2))
    let nm = Math.max(NAME_MIN, Math.min(NAME_MAX, Math.round(num * 0.36)))
    ctx.font = fonts.lifer(nm)
    while (nm > NAME_MIN && ctx.measureText(caption[p]).width > room) ctx.font = fonts.lifer((nm -= 1))
    const name = clipText(ctx, caption[p], Math.max(room, 1))
    const blockH = num * 0.72 + 10 + nm * 0.72
    const top = s.y - blockH / 2
    ctx.font = fonts.count(num)
    ctx.fillStyle = C.ink
    ctx.fillText(nums[i], s.x, top + num * 0.72)
    ctx.font = fonts.lifer(nm)
    ctx.fillStyle = C.muted
    ctx.fillText(name, s.x, top + blockH)
  })

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  paintTiles(ctx, tiles, imgs, C.line)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))), 'image/png')
  })
  return { blob, W: L.W, H: L.H, venn }
}
