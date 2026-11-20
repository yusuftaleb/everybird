// The comparison card (Compare's Share card, and the picture on the page): the share image's post frame from image.ts
// (Paper, the footer with the sticker credit and the date stamp, in the page's theme) holding, top down:
// - the title, the lists' names joined by " & " (one or two lines), and under it each list's species count on one line,
//   most first; when even the smallest size is too wide, the names are shortened evenly, never the numbers;
// - the diagram (venn.ts: two circles, three, or the flower from four lists), each region's number with its name;
// - the caption ("55 of Sam's birds you've yet to see", or the chosen group's) over an even strip of up to
//   STRIP_MAX of those birds' stickers, every one in the same square.
// Loaded only when a comparison shows.
import { fmt } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import type { Ui } from '@/i18n/messages/en'
import type { SpeciesIndex } from '@/lib/species/load'
import { stickerUrl } from '@/lib/sticker-url'
import { clipText } from './view-image'
import { ensureViewFonts, loadStickers, paintCard, paintTiles, prepareCard, type ImagePack, type Tile } from './image'
import { evenly, ranking } from './compare'
import { diagramLayout, type Diagram } from './venn'

export type CompareCardOpts = {
  /** Every list's name, in list order. */
  names: string[]
  /** Every list's species count, in list order. */
  sizes: number[]
  /** The diagram's numbers: species per combination of lists, by mask (compare.ts regionCounts). */
  counts: number[]
  /** The line over the strip, and the birds it shows (in order; the strip takes up to STRIP_MAX, evenly). */
  caption: string
  codes: string[]
  species: SpeciesIndex
  theme: 'light' | 'dark'
  t: Ui
  now?: Date
}
export type CompareCard = { blob: Blob; W: number; H: number }

const NO_BIRDS: ImagePack = { W: 1, H: 1, boxes: new Map() }
/** The strip: STRIP_COLS stickers a row, two rows at most, each in a square a STRIP_COLS-th of the width. */
export const STRIP_COLS = 9
export const STRIP_MAX = 2 * STRIP_COLS
/** Type sizes (px, design units) and their floors: the title (Cabinet 700), the counts line and the caption (Satoshi),
 *  each region's number (Cabinet 700) and its name (Satoshi 600) under it. */
const TITLE = [60, 40], LINE = [30, 22], CAPTION = [30, 22], NUM = [84, 24], NAME = [28, 16]

type Measure = { ctx: CanvasRenderingContext2D; font: (px: number) => string }

/**
 * `parts` (each made from a name by `part`) joined by `sep` in at most `maxLines` lines of `maxW`: at the largest size
 * that fits, the break where the lines are most even; at the floor, the names shortened evenly to the widest that fits.
 */
export function fitParts(
  { ctx, font }: Measure, names: readonly string[], part: (name: string, i: number) => string, sep: string,
  [size, min]: readonly number[], maxW: number, maxLines: number,
): { px: number; lines: string[] } {
  const w = (s: string) => ctx.measureText(s).width
  const split = (texts: string[]): string[] | null => {
    let best: string[] | null = null, bestW = Infinity
    const tries = maxLines > 1 && texts.length > 1 ? texts.length : 1
    for (let k = 0; k < tries; k++) {
      // k = 0: one line; else the first k parts on the first line.
      const lines = k === 0 ? [texts.join(sep)] : [texts.slice(0, k).join(sep), texts.slice(k).join(sep)]
      const widest = Math.max(...lines.map(w))
      if (widest <= maxW && (k === 0 || widest < bestW)) {
        if (k === 0) return lines
        best = lines
        bestW = widest
      }
    }
    return best
  }
  for (let px = size; px >= min; px -= 2) {
    ctx.font = font(px)
    const lines = split(names.map(part))
    if (lines) return { px, lines }
  }
  ctx.font = font(min)
  let lo = 0, hi = Math.max(...names.map(w))
  for (let i = 0; i < 16; i++) {
    const cap = (lo + hi) / 2
    if (split(names.map((n, j) => part(clipText(ctx, n, cap), j)))) lo = cap
    else hi = cap
  }
  const texts = names.map((n, j) => part(clipText(ctx, n, lo), j))
  return { px: min, lines: split(texts) ?? [clipText(ctx, texts.join(sep), maxW)] }
}

/** The name drawn under a region's number: two lists' "Only Ada" and "Both"; a list's own name; the flower's centre. */
function regionName(d: Diagram, mask: number, names: readonly string[], t: Ui): string {
  const n = names.length
  const one = mask && !(mask & (mask - 1)) ? Math.log2(mask) : -1
  if (d.kind === 'two') return mask === 3 ? t.compare.both : fmt(t.compare.only, { name: names[one] })
  if (one >= 0) return names[one]
  return d.kind === 'flower' && mask === (1 << n) - 1 ? t.compare.everyone : ''
}

export async function drawCompareCard(o: CompareCardOpts): Promise<CompareCard> {
  const { t, species, names, sizes } = o
  const card = await prepareCard({
    format: 'post', entries: [], species, theme: o.theme, strings: t, pack: NO_BIRDS, latest: false, countSize: 'hide', now: o.now,
  })
  const order = ranking(sizes)
  const sample = `${names.join('')}${o.caption}${t.compare.both}${t.compare.everyone}${t.compare.only}0123456789,.`
  await ensureViewFonts(card, sample)
  if (typeof document !== 'undefined' && document.fonts) {
    // The title and the numbers' face, for the names' letters (ensureViewFonts loads the body and mono faces).
    await Promise.race([document.fonts.load(card.fonts.name(60), sample).catch(() => []), new Promise((r) => setTimeout(r, 3000))])
  }
  const { L, colors: C, fonts } = card
  const X = L.collage.x, CW = L.collage.w, bottom = L.collage.y + L.collage.h

  const canvas = document.createElement('canvas')
  canvas.width = L.W
  canvas.height = L.H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  paintCard(ctx, card, new Map())
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // The head: the names, then each list's count.
  let y = L.collage.y
  const title = fitParts({ ctx, font: fonts.name }, names, (n) => n, ' & ', TITLE, CW, 2)
  ctx.font = fonts.name(title.px)
  ctx.fillStyle = C.ink
  for (const line of title.lines) {
    ctx.fillText(line, X, y + title.px * 0.8)
    y += Math.round(title.px * 1.15)
  }
  y += 8
  const counts = fitParts(
    { ctx, font: fonts.filter }, order.map((i) => names[i]),
    (n, j) => fmt(t.compare.cardCount, { label: n, n: formatInt(sizes[order[j]], t.num) }), ' · ', LINE, CW, 1,
  )
  ctx.font = fonts.filter(counts.px)
  ctx.fillStyle = C.muted
  ctx.fillText(counts.lines[0], X, y + counts.px * 0.8)
  y += counts.px + 40

  // The bottom, upwards: the strip, the caption over it.
  const drawable = o.codes.filter((c) => species.byCode.get(c)?.st)
  const shown = evenly(drawable.length ? drawable : o.codes, STRIP_MAX)
  const cell = CW / STRIP_COLS
  const rows = Math.ceil(shown.length / STRIP_COLS)
  const stripTop = bottom - rows * cell
  const caption = fitParts({ ctx, font: fonts.lifer }, [o.caption], (n) => n, '', CAPTION, CW, 1)
  const captionY = stripTop - (rows ? 20 : 0)

  // The diagram, between the head and the caption.
  const box = { x: X, y, w: CW, h: captionY - caption.px - 48 - y }
  const d = diagramLayout(o.counts, box)
  const circle = (c: { cx: number; cy: number; r: number }) => { ctx.beginPath(); ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2) }
  ctx.fillStyle = C.surface
  for (const c of d.circles) { circle(c); ctx.fill() }
  if (d.core) {
    ctx.strokeStyle = C.ink
    ctx.lineWidth = 4
    for (const c of d.circles) { circle(c); ctx.stroke() }
    circle(d.core)
    ctx.fillStyle = C.hairline
    ctx.fill()
    ctx.stroke()
  } else {
    // Where circles overlap: Hairline.
    ctx.fillStyle = C.hairline
    d.circles.forEach((a, i) => d.circles.forEach((b, j) => {
      if (j <= i) return
      ctx.save()
      circle(a)
      ctx.clip()
      circle(b)
      ctx.fill()
      ctx.restore()
    }))
    ctx.strokeStyle = C.ink
    ctx.lineWidth = 4
    for (const c of d.circles) { circle(c); ctx.stroke() }
  }
  ctx.textAlign = 'center'
  for (const s of d.spots) {
    const num = formatInt(o.counts[s.mask] ?? 0, t.num)
    const label = regionName(d, s.mask, names, t)
    const room = s.w * 0.82
    let np = Math.max(NUM[1], Math.min(NUM[0], Math.round(s.h * (label ? 0.42 : 0.6))))
    ctx.font = fonts.count(np)
    while (np > NUM[1] && ctx.measureText(num).width > room) ctx.font = fonts.count((np -= 2))
    let lp = Math.max(NAME[1], Math.min(NAME[0], Math.round(np * 0.4)))
    ctx.font = fonts.lifer(lp)
    while (lp > NAME[1] && ctx.measureText(label).width > room) ctx.font = fonts.lifer((lp -= 1))
    const name = label ? clipText(ctx, label, Math.max(room, 1)) : ''
    const blockH = np * 0.72 + (name ? 10 + lp * 0.72 : 0)
    const top = s.y - blockH / 2
    ctx.font = fonts.count(np)
    ctx.fillStyle = C.ink
    ctx.fillText(num, s.x, top + np * 0.72)
    if (name) {
      ctx.font = fonts.lifer(lp)
      ctx.fillStyle = C.muted
      ctx.fillText(name, s.x, top + blockH)
    }
  }

  ctx.textAlign = 'left'
  ctx.font = fonts.lifer(caption.px)
  ctx.fillStyle = C.accent
  ctx.fillText(caption.lines[0], X, captionY)

  // The strip: each sticker contained in its square, at its own aspect.
  const pad = cell * 0.08
  const tiles: Tile[] = shown.flatMap((code, i) => {
    const row = species.byCode.get(code)
    if (!row) return []
    const side = cell - 2 * pad
    const ar = row.st && row.ar > 0 ? row.ar : 1
    const [w, h] = ar >= 1 ? [side, side / ar] : [side * ar, side]
    return [{ x: X + (i % STRIP_COLS) * cell + (cell - w) / 2, y: stripTop + Math.floor(i / STRIP_COLS) * cell + (cell - h) / 2, w, h, url: row.st ? stickerUrl(code, side, 1, row.sv) : null }]
  })
  const imgs = await loadStickers([...new Set(tiles.flatMap((x) => (x.url ? [x.url] : [])))])
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  paintTiles(ctx, tiles, imgs, C.line)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))), 'image/png')
  })
  return { blob, W: L.W, H: L.H }
}
