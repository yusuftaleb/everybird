// The comparison card (the Share dialog's Comparison on /compare): the share image's frame from image.ts in the dialog's
// format, Story, Post or Square (Paper unless transparent, the footer with the sticker credit and the date stamp, in the
// dialog's colours) holding, top down:
// - the title, the lists' names joined the usual way, "Robin, Sam & Ada" (titlePart; one or two lines), and under it each list's species count on one line,
//   most first; when even the smallest size is too wide, the names are shortened evenly, never the numbers;
// - the diagram (venn.ts: two circles, three, or the flower from four lists), each circle in its list's colour
//   (compare.ts listColorHex, as on the page), each region's number with its name, as large as the room between the
//   head and the footer's hairline allows, keeping the collage card's gaps to both (diagramBox). No birds: the wish
//   list is the picture with the birds.
// Loaded only when the dialog draws it.
import { fmt } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import type { Ui } from '@/i18n/messages/en'
import type { SpeciesIndex } from '@/lib/species/load'
import { clipText } from './view-image'
import { ensureViewFonts, GAPS, paintCard, prepareCard, type CardFormat, type CardLayout, type FormatSlot, type ImagePack } from './image'
import { listColorHex, ranking, titlePart } from './compare'
import { diagramLayout, type Box, type Diagram } from './venn'

export { titlePart }

type CompareCardOpts = {
  /** Every list's name, in list order. */
  names: string[]
  /** Every list's species count, in list order. */
  sizes: number[]
  /** The diagram's numbers: species per combination of lists, by mask (compare.ts regionCounts). */
  counts: number[]
  species: SpeciesIndex
  theme: 'light' | 'dark'
  /** Default 'post'. */
  format?: FormatSlot
  /** No Paper fill (as the share images' Transparent background). */
  transparent?: boolean
  t: Ui
  now?: Date
}
type CompareCard = { blob: Blob; W: number; H: number }

const NO_BIRDS: ImagePack = { W: 1, H: 1, boxes: new Map() }
/** Type sizes (px, design units) and their floors: the title (Cabinet 700), the counts line (Satoshi), each region's
 *  number (Cabinet 700) and its name (Satoshi 600) under it. */
const TITLE = [60, 40], LINE = [30, 22], NUM = [84, 24], NAME = [28, 16]

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

/** The circles' outline on the card (px): half of it lies outside each circle. */
const OUTLINE = 4
/** The collage card's gaps in `format` (image.ts GAPS): `head` under the head's last line, `collage` above the footer's
 *  hairline. */
const cardGaps = (format: CardFormat): { head: number; collage: number } => GAPS[format]
/**
 * The diagram's room on the card: from the collage card's head gap under the head (`headBottom`, the counts line's
 * foot) to its collage gap above the footer's hairline, which sits `shift` higher when the credit takes a line of its
 * own (image.ts placeFooter), less the outline's outer half all round. diagramLayout draws the diagram as large as
 * this allows, centred in it.
 */
export function diagramBox(format: CardFormat, L: CardLayout, headBottom: number, shift: number): Box {
  const g = cardGaps(format)
  const top = headBottom + g.head + OUTLINE / 2
  const bottom = L.rule.y - shift - g.collage - OUTLINE / 2
  return { x: L.collage.x + OUTLINE / 2, y: top, w: L.collage.w - OUTLINE, h: Math.max(0, bottom - top) }
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
    format: o.format ?? 'post', entries: [], species, theme: o.theme, transparent: o.transparent, strings: t, pack: NO_BIRDS, latest: false, countSize: 'hide', now: o.now,
  })
  const order = ranking(sizes)
  const sample = `${names.join('')}${t.compare.both}${t.compare.everyone}${t.compare.only}0123456789,.`
  await ensureViewFonts(card, sample)
  if (typeof document !== 'undefined' && document.fonts) {
    // The title and the numbers' face, for the names' letters (ensureViewFonts loads the body and mono faces).
    await Promise.race([document.fonts.load(card.fonts.name(60), sample).catch(() => []), new Promise((r) => setTimeout(r, 3000))])
  }
  const { L, colors: C, fonts } = card
  const X = L.collage.x, CW = L.collage.w

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
  const title = fitParts({ ctx, font: fonts.name }, names, (n, i) => titlePart(n, i, names.length), ' ', TITLE, CW, 2)
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
  y += counts.px

  // The diagram, between the head and the footer's hairline.
  const d = diagramLayout(o.counts, diagramBox(card.format, L, y, card.shift))
  const circle = (c: { cx: number; cy: number; r: number }) => { ctx.beginPath(); ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2) }
  // Each circle a light wash of its list's colour (where circles overlap the washes add up) and a 4px outline in it.
  const colour = d.circles.map((_, i) => listColorHex(i, C))
  ctx.globalAlpha = 0.14
  d.circles.forEach((c, i) => { ctx.fillStyle = colour[i]; circle(c); ctx.fill() })
  ctx.globalAlpha = 1
  ctx.lineWidth = OUTLINE
  d.circles.forEach((c, i) => { ctx.strokeStyle = colour[i]; circle(c); ctx.stroke() })
  if (d.core) {
    // The flower's centre, every list's: Surface over the petals' inner ends, outlined in Ink.
    circle(d.core)
    ctx.fillStyle = C.surface
    ctx.fill()
    ctx.strokeStyle = C.ink
    ctx.stroke()
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

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))), 'image/png')
  })
  return { blob, W: L.W, H: L.H }
}
