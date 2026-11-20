// The Tree view's share image (view-image.ts has the frame): the level on screen (levelView: the open branch with its
// tips at the rank the view draws) in the collage's area, drawn in the layout on screen in every format, the tall story
// included (`at.layout`: the Fan, the Radial or Rectangular; fan.ts for the first two): on the list in Ink, the rest in
// Line, rounded corners, branches simply joining, every tip one small hollow dot, a tip placed without genetic data
// dotted. Every tip is named, as on screen: along its radius (or row) its dot, a gap, its sticker in a fixed box, a gap,
// the name, the count; fitRound sizes the fan or circle so every name fits whole, the counts going first when room is
// short (a fan or circle that cannot name every tip even so is drawn as rows); Rectangular gives the drawing half the
// width and sets the counts right-aligned in a column just after the longest name. A group with no bird on the list
// shows its representative sticker dimmed (groupSticker). Under it, when there is room and the time scale is on
// (`at.time`, the bar's switch; off: the splits spaced evenly, bySplits, and no axis, rings or ages), the age axis (the
// circle's ages on its radius straight up, never over a branch end), and a one-line key for the mark and the dotted
// line when the image has them. "Lifers only" (`at.mine`) as on screen. With "Show oldest lineage" (`oldest`) the
// oldest lineage takes the latest lifer's place and style (latestAs; on a poster, its foot). On top, instead of the
// big count, four equal totals: species, genera, families and orders, each "count / total" over its rank, the same
// size and weight ("Hide totals": the species alone). The footer credits the stickers and the tree (TREE_FOOTER).
import { fmt } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import type { Ui } from '@/i18n/messages/en'
import { loadSpecies } from '@/lib/species/load'
import { familyName } from '@/lib/species/names'
import type { SpeciesRow } from '@/lib/species/types'
import { stickerUrl } from '@/lib/sticker-url'
import { LABEL_COUNT, LABEL_GAP, LABEL_STICKER, clearOfEnds, drawFan, fanLabel, fanRing, fitRound, polar, ringLabels, type FanBox, type LabelSizes, type LabelSpan } from '@/lib/tree/fan'
import { loadTree } from '@/lib/tree/load'
import { levelView, ROW_H, taxonCover, tipOn, type TreeRow } from '@/lib/tree/levels'
import { ageTicks, bySplits, circlePath, drawTree, formatAge, oldestLineage, type Drawing } from '@/lib/tree/tree'
import { IMAGE_SCALE, loadStickers, type ImageFormat } from './image'
import { TREE_FOOTER, clipText, renderViewImage, type Area, type ViewImageOpts } from './view-image'

/** The Rectangular image's names: the largest size, and how much of a row's pitch they and the sticker's box take. */
const NAME_MAX = 30
/** A row is never drawn taller than this (a genus of three species would fill the card). */
const PITCH_MAX = 72
const AXIS_H = 44, KEY_H = 40, MONO = 18
/** The Fan's and Radial's names in the image (design units): as on screen at about twice the size, shrinking further
 *  than the screen's, so a level the screen names whole is named whole in the image too. */
export const IMAGE_SIZES: LabelSizes = { base: 24, floor: 9, dot: 5, rMin: 40, rMax: Infinity, below: 40 }
/** The totals: the largest number, the gap under the numbers, and before the drawing. */
const TOTAL_MAX = 56, TOTAL_GAP = 12, TOTALS_BELOW = 32

type Tip = Exclude<TreeRow, { kind: 'order' }>
export type TotalRank = 'species' | 'genera' | 'families' | 'orders'
/** The four totals, in this order. */
export const TOTALS: readonly TotalRank[] = ['species', 'genera', 'families', 'orders']

/**
 * The totals' size: one number size for every block (the largest that fits each "count / total" in its share of
 * `width` with a little air, TOTAL_MAX at most), and the rank's label under it. `widthAt1(text)` measures a number at
 * size 1.
 */
export function totalsSize(texts: readonly string[], width: number, widthAt1: (text: string) => number): { num: number; label: number } {
  const col = width / Math.max(1, texts.length)
  const num = Math.floor(Math.min(TOTAL_MAX, ...texts.map((s) => (col - 24) / Math.max(1e-6, widthAt1(s)))))
  return { num, label: Math.max(16, Math.min(22, Math.round(num * 0.4))) }
}

/** The share of the area's width the Rectangular image's drawing takes (round 6: half, as on screen). */
export const ROWS_TREE = 0.5

/**
 * Rectangular in the image: every tip named. The names' size (the largest the rows' `pitch` allows, NAME_MAX at most,
 * and smaller where a name would not fit `textW` beside its sticker's box), the box's side, which tips keep their count
 * (dropped where it would touch the name) and `col`, the right edge of the counts' column from the text's start: just
 * after the longest name and count (plus the gap), never past `textW`, so the counts line up right-aligned without a
 * wide gap. `name`/`count` are widths at size 1.
 */
export function rowsLabels(spans: readonly LabelSpan[], pitch: number, textW: number): { px: number; box: number; counts: boolean[]; col: number } {
  let px = Math.min(NAME_MAX, pitch * 0.75)
  const box = Math.min(pitch * 0.92, px * LABEL_STICKER)
  for (const s of spans) px = Math.min(px, (textW - box - 2 * LABEL_GAP * px) / Math.max(1e-6, s.name))
  px = Math.max(1, px)
  const reach = (s: LabelSpan) => box + px * (2 * LABEL_GAP + s.name + (s.count ? LABEL_GAP + s.count : 0))
  const fits = spans.map((s) => !!s.count && reach(s) <= textW)
  const name = Math.max(0, ...spans.map((s) => s.name)), count = Math.max(0, ...spans.filter((_, i) => fits[i]).map((s) => s.count))
  const col = Math.min(textW, box + px * (2 * LABEL_GAP + name + (count ? LABEL_GAP + count : 0)))
  const counts = spans.map((s, i) => fits[i] && reach(s) <= col + 1e-6)
  return { px, box, counts, col }
}

export async function renderTreeImage(o: ViewImageOpts): Promise<Blob> {
  const { state, entries, at, t } = o
  const [{ tree }, all] = await Promise.all([loadTree(), loadSpecies()])
  const codes = new Set(entries.map((e) => e.code))
  const view = levelView(tree, all, at.tree ?? {}, codes, at.mine)
  if (!view) throw new Error('No tree to draw')
  const tt = t.collage.tree
  const timeScale = at.time !== false
  // The oldest lineage in the latest lifer's place ("Show oldest lineage").
  const old = o.oldest ? oldestLineage(tree, codes) : undefined
  const oldRow = old && (o.species.byCode.get(old.code) ?? all.byCode.get(old.code))
  const oldAge = old ? formatAge(old.age, t.num) : ''
  const latestAs = oldRow ? { row: oldRow, label: fmt(tt.oldestLabel, { age: oldAge }), poster: fmt(tt.oldestPoster, { name: o.nameOf?.(oldRow) ?? oldRow.com, age: oldAge }) } : undefined
  const root = view.root && (timeScale ? view.root : bySplits(view.root))
  const stem = timeScale ? view.stem : 1
  const cover = taxonCover(all.rows, codes)
  const totals = (o.hideTotals ? ['species'] as const : TOTALS).map((k) => ({ k, n: formatInt(cover[k][0], t.num), total: formatInt(cover[k][1], t.num), label: tt.rank[k].toUpperCase() }))
  const rank = view.tips
  const nameOf = (r: Tip): string =>
    r.kind === 'species' ? (state.sci ? r.row.sci : o.nameOf?.(r.row) ?? r.row.com)
      : rank === 'genera' ? r.key
        : rank === 'orders' ? (state.sci ? r.row.ord : (t.orders as Record<string, string>)[r.row.ord] ?? r.row.ord)
          : state.sci ? r.row.fam : familyName(r.row)
  const tips = view.rows.filter((r): r is Tip => r.kind !== 'order')
  const onOf = (r: Tip) => (r.kind === 'species' ? Number(r.on) : r.on)
  const dotted = tips.some((r) => r.dotted)
  // The stickers, as on screen: the species' own, else one bird of the group on the list.
  const scale = o.scale ?? IMAGE_SCALE[o.format as ImageFormat] ?? 1
  const stickerOf = (r: Tip): SpeciesRow | undefined => { const row = r.kind === 'species' ? r.row : r.sticker; return row?.st ? row : undefined }
  const urlOf = (row: SpeciesRow) => stickerUrl(row.code, 64, scale, row.sv)
  const imgs = await loadStickers([...new Set(tips.flatMap((r) => { const row = stickerOf(r); return row ? [urlOf(row)] : [] }))], { signal: o.signal })
  const countText = (r: Tip) => (r.kind === 'group' ? fmt(tt.tipOf, { n: formatInt(r.on, t.num), total: formatInt(r.total, t.num) }) : '')

  return renderViewImage({ ...o, countSize: 'hide', latestAs }, TREE_FOOTER, (ctx, card, full) => {
    const C = card.colors
    const font = card.fonts
    // The totals on top: the same size for all, "count" in Ink and " / total" in Muted, the rank under it.
    const { num, label: labelPx } = totalsSize(totals.map((x) => `${x.n} / ${x.total}`), full.w, (s) => { ctx.font = font.count(100); return ctx.measureText(s).width / 100 })
    const col = full.w / totals.length
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    const numCap = num * 0.72, labelCap = labelPx * 0.72
    totals.forEach((x, i) => {
      const cx = full.x + col * (i + 0.5)
      ctx.font = font.count(num)
      const nw = ctx.measureText(x.n).width, rest = ` / ${x.total}`
      const w = nw + ctx.measureText(rest).width
      ctx.fillStyle = C.ink
      ctx.fillText(x.n, cx - w / 2, full.y + numCap)
      ctx.fillStyle = C.muted
      ctx.fillText(rest, cx - w / 2 + nw, full.y + numCap)
      ctx.font = font.footer(labelPx)
      ctx.textAlign = 'center'
      ctx.fillText(x.label, cx, full.y + numCap + TOTAL_GAP + labelCap)
      ctx.textAlign = 'left'
    })
    const head = numCap + TOTAL_GAP + labelCap + TOTALS_BELOW
    const area: Area = { x: full.x, y: full.y + head, w: full.w, h: full.h - head }

    const axis = timeScale && area.h >= 520 && tips.length > 0
    const bottom = (axis ? AXIS_H : 0) + KEY_H
    const stroke = (on: boolean) => {
      ctx.strokeStyle = on ? C.ink : C.line
      ctx.globalAlpha = on ? 1 : 0.55
      ctx.lineWidth = on ? 2.5 : 1.5
    }
    const branch = (d: string, on: boolean, dash: boolean) => {
      if (!d) return
      ctx.save()
      stroke(on)
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      if (dash) ctx.setLineDash([3, 5])
      ctx.stroke(new Path2D(d))
      ctx.restore()
    }
    // The tips' hollow dots: Paper inside (the line's colour on a transparent image), so no branch shows through.
    const tipDots = (points: [number, number][], on: (i: number) => boolean) => {
      for (const want of [false, true]) {
        const d = points.filter((_, i) => on(i) === want).map(([x, y]) => circlePath(x, y, IMAGE_SIZES.dot)).join('')
        if (!d) continue
        const p = new Path2D(d)
        ctx.save()
        ctx.fillStyle = card.transparent ? (want ? C.ink : C.line) : C.paper
        ctx.fill(p)
        stroke(want)
        ctx.stroke(p)
        ctx.restore()
      }
    }
    const paintDrawing = (d: Drawing) => {
      branch(d.unseen, false, false)
      branch(d.seen, true, false)
      branch(d.unseenDot, false, true)
      branch(d.seenDot, true, true)
    }
    /** A tip's sticker, upright, contained in its `side` box centred at (x, y); a species off the list dimmed. */
    const sticker = (r: Tip, x: number, y: number, side: number) => {
      const row = stickerOf(r)
      const img = row ? imgs.get(urlOf(row)) : undefined
      if (!row || !img) return
      const ar = row.ar > 0 ? row.ar : 1
      const w = ar >= 1 ? side : side * ar, h = ar >= 1 ? side / ar : side
      ctx.save()
      if (onOf(r) === 0) ctx.globalAlpha = 0.4
      ctx.drawImage(img, x - w / 2, y - h / 2, w, h)
      ctx.restore()
    }
    const isMarked = (r: Tip) => r.kind === 'group' && !!r.with
    const tipIsOn = (i: number) => onOf(tips[i]) > 0
    // Each tip's name and count widths at size 1 (the name's face; the count in mono at LABEL_COUNT of it).
    const spans: LabelSpan[] = tips.map((r) => {
      ctx.font = font.lifer(100)
      const nw = ctx.measureText(nameOf(r)).width / 100 + (isMarked(r) ? 0.8 : 0)
      ctx.font = font.footer(100 * LABEL_COUNT)
      const c = countText(r)
      return { name: nw, count: c ? ctx.measureText(c).width / 100 : 0, on: onOf(r) > 0 }
    })
    let marked = false
    let y: number
    let axisAt: (v: number) => number[]
    let axisY: number
    const want = root ? at.layout ?? 'rows' : 'rows'
    const fit = want === 'rows' ? undefined : fitRound(spans, want === 'circle' ? 'circle' : 'fan', { w: area.w, h: area.h - bottom }, IMAGE_SIZES)
    const shape = fit ? (fit.shape ?? 'fan') : 'rows'

    if (fit) {
      // The fan or circle, centred in the area above the axis and the key.
      const box: FanBox = { cx: area.x + fit.cx, cy: area.y + (area.h - bottom - fit.h) / 2 + fit.cy, R: fit.R, shape: fit.shape }
      const d = drawFan(root!, tipOn(tips), stem, (_, i) => tips[i].dotted, box)
      if (timeScale) {
        ctx.save()
        ctx.strokeStyle = C.hairline
        ctx.lineWidth = 1.5
        for (const v of ageTicks(d.rootAge)) if (v > 0) ctx.stroke(new Path2D(fanRing(box, (1 - v / d.rootAge) * box.R)))
        ctx.restore()
      }
      paintDrawing(d)
      tipDots(d.tips.map((p) => [p.x, p.y]), tipIsOn)
      const { px } = fit
      const S = px * LABEL_STICKER, g = px * LABEL_GAP, from = IMAGE_SIZES.dot + g
      ctx.textBaseline = 'middle'
      d.tips.forEach((p, i) => {
        const r = tips[i]
        // The sticker upright in its box, then the name and the count turned along the radius (mirrored on the left).
        const [sx, sy] = polar(box, box.R + from + S / 2, p.a)
        sticker(r, sx, sy, S)
        const l = fanLabel(box, p.a, from)
        const dir = l.flip ? -1 : 1
        ctx.save()
        ctx.translate(l.x, l.y)
        ctx.rotate((l.rot * Math.PI) / 180)
        ctx.textAlign = l.flip ? 'right' : 'left'
        let x = dir * (S + g)
        const name = nameOf(r)
        ctx.font = font.lifer(px)
        ctx.fillStyle = onOf(r) > 0 ? C.ink : C.muted
        ctx.fillText(name, x, 0)
        x += dir * ctx.measureText(name).width
        if (isMarked(r)) {
          marked = true
          diamond(ctx, x + dir * px * 0.4, 0, px * 0.22, C.ink)
          x += dir * px * 0.8
        }
        const count = countText(r)
        if (count && fit.counts[i]) {
          ctx.font = font.footer(px * LABEL_COUNT)
          ctx.fillStyle = C.muted
          ctx.fillText(count, x + dir * g, 0)
        }
        ctx.restore()
      })
      if (shape === 'circle') {
        // The ages on their rings where they cross the radius straight up (no branch runs there), on Paper, except one
        // whose patch would hide a branch end; the axis's title under the circle.
        y = box.cy + fit.h / 2
        axisY = y + 10
        axisAt = () => []
      } else {
        y = box.cy + 8
        axisY = y + 10
        axisAt = (v) => ringLabels(box, (1 - v / d.rootAge) * box.R).map(([x]) => x)
      }
      if (axis && shape === 'circle') {
        ctx.font = font.footer(MONO)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        for (const v of ageTicks(d.rootAge).filter((a) => a > 0 && a / d.rootAge <= 0.97)) {
          for (const [x, ry] of ringLabels(box, (1 - v / d.rootAge) * box.R)) {
            const text = formatAge(v, t.num)
            const w = ctx.measureText(text).width + 10
            if (!clearOfEnds(d.ends, x, ry, w, MONO * 1.4)) continue
            if (!card.transparent) {
              ctx.fillStyle = C.paper
              ctx.fillRect(x - w / 2, ry - MONO * 0.7, w, MONO * 1.4)
            }
            ctx.fillStyle = C.muted
            ctx.fillText(text, x, ry)
          }
        }
      }
    } else {
      const k = Math.min((area.h - bottom) / view.height, PITCH_MAX / ROW_H)
      const bodyH = view.height * k
      const top = area.y + (area.h - bottom - bodyH) / 2
      const treeW = Math.round(area.w * ROWS_TREE)
      const dotX = area.x + treeW
      const ys = tips.map((r) => top + (r.top + ROW_H / 2) * k)
      if (root) {
        ctx.save()
        ctx.translate(area.x, 0)
        paintDrawing(drawTree(root, tipOn(tips), (i) => ys[i], stem, (_, i) => tips[i].dotted, treeW))
        ctx.restore()
        tipDots(ys.map((v) => [dotX, v]), tipIsOn)
      }
      // Every tip named: past its dot a gap, the sticker's box, a gap, the name; the count right-aligned in the column
      // just after the longest name, where it fits.
      const textX = dotX + IMAGE_SIZES.dot
      const { px, box, counts, col } = rowsLabels(spans, ROW_H * k, area.x + area.w - textX)
      const g = px * LABEL_GAP
      ctx.textBaseline = 'middle'
      tips.forEach((r, i) => {
        sticker(r, textX + g + box / 2, ys[i], box)
        const count = countText(r)
        if (count && counts[i]) {
          ctx.font = font.footer(px * LABEL_COUNT)
          ctx.textAlign = 'right'
          ctx.fillStyle = C.muted
          ctx.fillText(count, textX + col, ys[i])
        }
        ctx.font = font.lifer(px)
        ctx.textAlign = 'left'
        ctx.fillStyle = onOf(r) > 0 ? C.ink : C.muted
        const name = nameOf(r)
        const nameX = textX + g + box + g
        ctx.fillText(name, nameX, ys[i])
        if (isMarked(r)) {
          marked = true
          diamond(ctx, nameX + ctx.measureText(name).width + px * 0.4, ys[i], px * 0.22, C.ink)
        }
      })
      y = top + bodyH
      axisY = y + 18
      axisAt = (v) => [area.x + (1 - v / view.drawing.rootAge) * treeW]
      if (axis) {
        ctx.fillStyle = C.hairline
        ctx.fillRect(area.x, y + 8, treeW, 2)
      }
    }

    ctx.font = font.footer(MONO)
    ctx.fillStyle = C.muted
    if (axis) {
      // The age axis: the ticks' ages (under the rows' hairline, or under the fan's centre; the circle's are on its
      // rings), its title beside or under them.
      const rootAge = view.drawing.rootAge
      ctx.textBaseline = 'top'
      ctx.textAlign = 'center'
      for (const v of ageTicks(rootAge).filter((a) => a / rootAge <= 0.97 || a === 0)) for (const x of axisAt(v)) ctx.fillText(formatAge(v, t.num), x, axisY)
      if (shape === 'fan') ctx.fillText(clipText(ctx, tt.axis, area.w), area.x + area.w / 2, axisY + MONO + 6)
      else if (shape === 'circle') ctx.fillText(clipText(ctx, tt.axis, area.w), area.x + area.w / 2, axisY)
      else {
        const textX = area.x + Math.round(area.w * ROWS_TREE) + 16
        ctx.textAlign = 'left'
        ctx.fillText(clipText(ctx, tt.axis, area.x + area.w - textX), textX, axisY)
      }
      y += AXIS_H + (shape === 'fan' ? MONO + 6 : 0)
    }
    // The key: only what the image shows.
    let x = area.x
    const keyY = y + KEY_H / 2 + 4
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    if (marked) {
      diamond(ctx, x + 6, keyY, 5, C.muted)
      x += 22
      ctx.fillStyle = C.muted
      ctx.fillText(clipText(ctx, tt.keyMark, area.x + area.w - x), x, keyY)
      x += ctx.measureText(tt.keyMark).width + 32
    }
    if (dotted && x + 120 < area.x + area.w) {
      ctx.save()
      ctx.strokeStyle = C.ink
      ctx.lineWidth = 2.5
      ctx.setLineDash([3, 5])
      ctx.beginPath()
      ctx.moveTo(x, keyY)
      ctx.lineTo(x + 32, keyY)
      ctx.stroke()
      ctx.restore()
      x += 44
      ctx.fillStyle = C.muted
      ctx.fillText(clipText(ctx, tt.keyDotted, area.x + area.w - x), x, keyY)
    }
  }, undefined, sampleText(tips.map(nameOf), tips.map(countText), totals, tt))
}

/** Every text the image draws besides the frame's, so its fonts are loaded first. */
function sampleText(names: string[], counts: string[], totals: readonly { n: string; total: string; label: string }[], tt: Ui['collage']['tree']): string {
  return `${names.join('')}${counts.join('')}${totals.map((x) => `${x.n} / ${x.total}${x.label}`).join('')}${tt.axis}${tt.keyMark}${tt.keyDotted}`
}

/** The split-group mark: a diamond outline (the screen's rotated square), after a name and in the key. */
function diamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, cy - r)
  ctx.lineTo(cx + r, cy)
  ctx.lineTo(cx, cy + r)
  ctx.lineTo(cx - r, cy)
  ctx.closePath()
  ctx.stroke()
  ctx.restore()
}
