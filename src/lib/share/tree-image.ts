// The Tree view's share image (view-image.ts has the frame): the level on screen (levelView: the open branch with its
// tips at the rank the view draws) in the collage's area, drawn in the layout on screen in every format, the tall story
// included (`at.layout`: the Fan, the Radial or Rectangular; fan.ts for the first two): on the list in Ink, the rest in
// Line, rounded corners, branches simply joining, every tip one small hollow dot, a tip placed without genetic data
// dotted. Every tip is named, as on screen: along its radius (or row) its dot, a gap, its sticker in a fixed box, a gap,
// the name, the count; fitRound sizes the fan or circle so every name fits whole, the counts going first when room is
// short (a fan or circle that cannot name every tip even so is drawn as rows, and onTreeFits tells the dialog, which
// shows it off with its reason; the dialog draws a Fan horizontally and the others vertically); Rectangular gives the drawing half the
// width, its rows and names as large as the room allows, and sets the counts right-aligned in a column at the card's
// right edge. The totals, the drawing, its axis and key are one block centred in the card's area (round 6), so neither a
// Fan, a Radial nor the rows leave an empty band above or below them; room is kept only for the axis and key drawn. A group with no bird on the list
// shows its representative sticker dimmed (groupSticker). Under it, when there is room and the time scale is on
// (`at.time`, the bar's switch; off: the splits spaced evenly, bySplits, and no axis, rings or ages), the age axis (the
// circle's ages on its radius straight up, never over a branch end), and a one-line key for the mark and the dotted
// line when the image has them. "Lifers only" (`at.mine`) as on screen. With "Show oldest lineage" (`oldest`) the
// oldest lineage takes the latest lifer's place and style (latestAs; on a poster, its foot). On top, instead of the
// big count, the totals the dialog's Totals row keeps (species, genera, families and orders at and below the level on
// screen, any of them, none included), each a plain count over its rank ("65" over "FAMILIES", no "/ 250"), the same
// size and weight; with none, the drawing has their room. The oldest lineage is the card's small row (SMALL_ROW). The footer credits the stickers and the tree (TREE_FOOTER).
// A share image and a poster alike draw the rank on screen, its Level (round 6, item 22: Print's own "Down to" went).
import { fmt } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import type { Ui } from '@/i18n/messages/en'
import { loadSpecies } from '@/lib/species/load'
import { familyName } from '@/lib/species/names'
import type { SpeciesRow } from '@/lib/species/types'
import { stickerUrl } from '@/lib/sticker-url'
import { LABEL_COUNT, LABEL_GAP, LABEL_STICKER, RADIAL_GAP, drawFan, fanLabel, fanRing, fitRound, inOpening, polar, ringLabels, type FanBox, type LabelSizes, type LabelSpan, type RoundFit } from '@/lib/tree/fan'
import { loadTree } from '@/lib/tree/load'
import { levelView, ROW_H, taxonCover, tipOn, type LevelView, type TreeRow } from '@/lib/tree/levels'
import { ageTicks, bySplits, circlePath, drawTree, formatAge, oldestLineage, type Drawing } from '@/lib/tree/tree'
import { IMAGE_SCALE, cardLayout, loadStickers, type CardFormat, type ImageFormat } from './image'
import { printDesign, type PrintSize } from './print'
import { TREE_FOOTER, chosenTotals, clipText, renderViewImage, type Area, type ViewImageOpts } from './view-image'

/** The Rectangular image's names: the largest size (round 6: as large as the room allows, up to this). */
const NAME_MAX = 48
const AXIS_H = 44, KEY_H = 40, MONO = 18
/** The row pitch a full-size tip dot and its stroke need (a 5 radius, 2.5 stroke) with a little air. */
const DOT_PITCH = 14
/** The round layouts' axis beyond their own room: the fan's title line under the ages its `below` holds; the circle's title. */
const FAN_AXIS = 26, CIRCLE_AXIS = 34
/** The Fan's and Radial's names in the image (design units): as on screen at about twice the size or more where the
 *  card has room (round 6, item 5: up to 32), shrinking further than the screen's, so a level the screen names whole is
 *  named whole in the image too. */
export const IMAGE_SIZES: LabelSizes = { base: 32, floor: 9, dot: 5, rMin: 40, rMax: Infinity, below: 40 }
/** The image's Fan and Radial keep their radius at least this share of their reach (the radius and the longest label):
 *  never a tiny knot under long labels (round 6, item 15). */
export const BALANCE = 0.33

/**
 * The share image's Fan or Radial (round 6, items 5 and 15): fitRound with the labels' reach centred in the width
 * (`fill`), at the largest name size up to `sizes.base` whose radius is at least BALANCE of the reach, so the drawing
 * and its names share the card; when no size balances, the plain fit. Undefined when not every tip can be named.
 */
export function fitImage(spans: readonly LabelSpan[], shape: 'fan' | 'circle', room: { w: number; h: number }, sizes: LabelSizes = IMAGE_SIZES): RoundFit | undefined {
  const at = (base: number) => fitRound(spans, shape, room, { ...sizes, base: Math.max(sizes.floor, base), fill: true })
  const reach = (f: RoundFit) => Math.max(0, ...spans.map((sp, i) => (sizes.dot) + f.st + f.px * (2 * LABEL_GAP + sp.name + (f.counts[i] && sp.count ? LABEL_GAP + sp.count : 0))))
  const balanced = (f: RoundFit) => f.R >= BALANCE * (f.R + reach(f))
  const first = at(sizes.base)
  if (!first || balanced(first)) return first
  let lo = sizes.floor, hi = first.px, best: RoundFit | undefined
  for (let i = 0; i < 12; i++) {
    const m = (lo + hi) / 2
    const f = at(m)
    if (f && balanced(f) && f.px <= m + 1e-9) { best = f; lo = m } else hi = m
  }
  return best ?? first
}

/**
 * The age labels to write of `items` (any order, an age on both sides of the Fan's centre twice): none over another
 * (`pad` units of air). The youngest (0) and the oldest are taken first (round 6, item 15), then the others, youngest
 * first, each only where it clears those taken. Each item: its age and its box.
 */
export function clearTicks<T extends { v: number; x0: number; x1: number; y0: number; y1: number }>(items: readonly T[], pad = 6): T[] {
  if (!items.length) return []
  const lo = Math.min(...items.map((x) => x.v)), hi = Math.max(...items.map((x) => x.v))
  const rank = (x: T) => (x.v === lo ? 0 : x.v === hi ? 1 : 2)
  const order = [...items].sort((a, b) => rank(a) - rank(b) || a.v - b.v)
  const clear = (a: T, b: T) => a.x1 + pad <= b.x0 || b.x1 + pad <= a.x0 || a.y1 + pad <= b.y0 || b.y1 + pad <= a.y0
  const kept: T[] = []
  for (const it of order) if (kept.every((k) => clear(it, k))) kept.push(it)
  return kept.sort((a, b) => a.v - b.v)
}
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

/** The share of the area's width the Rectangular image's drawing takes at most (round 6: half, as on screen), and at
 *  least, when the names and counts need the rest (round 6, item 13: the branches give way first). */
export const ROWS_TREE = 0.5
export const ROWS_TREE_MIN = 0.2

/**
 * Rectangular in the image: every tip named and counted (round 6, items 6 and 13). The rows span `width` (the area's,
 * less the tips' dot): the drawing on the left, at most ROWS_TREE of it, then each tip's sticker box, its name and, in
 * a column at the right edge, its count. The names' size is the largest the rows' `pitch` allows (NAME_MAX at most);
 * when a tip's sticker, name and count don't fit beside a half-width drawing, the drawing gives way first, down to
 * ROWS_TREE_MIN of the width, and only then do the names shrink, so no count is ever dropped. `treeW`: the drawing's
 * width; `px`, `box`: the names' size and the sticker box's side; `counts`: every tip with a count keeps it; `col`: the
 * counts' right edge from the text's start. `name`/`count` are widths at size 1.
 */
export function rowsLabels(spans: readonly LabelSpan[], pitch: number, width: number): { px: number; box: number; counts: boolean[]; col: number; treeW: number } {
  const want = Math.min(NAME_MAX, pitch * 0.75)
  const boxAt = (px: number) => Math.min(pitch * 0.92, px * LABEL_STICKER)
  // A tip's text at size px: the gap, the box, the gap, the name, then the gap and the count when it has one.
  const len = (sp: LabelSpan) => 2 * LABEL_GAP + sp.name + (sp.count ? LABEL_GAP + sp.count : 0)
  const need = (px: number) => Math.max(0, ...spans.map((sp) => boxAt(px) + px * len(sp)))
  const treeW = Math.round(Math.max(width * ROWS_TREE_MIN, Math.min(width * ROWS_TREE, width - need(want))))
  const textW = width - treeW
  // The largest size up to `want` whose every row fits textW (the box either follows the size or is the pitch's).
  let px = want
  for (const sp of spans) {
    const L = len(sp)
    px = Math.min(px, Math.max(textW / (LABEL_STICKER + L), (textW - pitch * 0.92) / L))
  }
  px = Math.max(1, px)
  return { px, box: boxAt(px), counts: spans.map((sp) => !!sp.count), col: textW, treeW }
}

export async function renderTreeImage(o: ViewImageOpts): Promise<Blob> {
  const { state, entries, at, t } = o
  const [{ tree }, all] = await Promise.all([loadTree(), loadSpecies()])
  const codes = new Set(entries.map((e) => e.code))
  // The rank on screen, Down to's included (round 6: the screen's rank is the deeper of its Down to and the step).
  const shownView = levelView(tree, all, at.tree ?? {}, codes, at.mine, undefined, at.rank)
  if (!shownView) throw new Error('No tree to draw')
  // A poster: its size given, on the print card.
  const posterSize: PrintSize | undefined = o.printSize && (o.format === 'print' || o.format === 'printLandscape') ? o.printSize : undefined
  const tt = t.collage.tree
  const timeScale = at.time !== false
  // The oldest lineage in the latest lifer's place ("Show oldest lineage").
  const old = o.oldest ? oldestLineage(tree, codes) : undefined
  const oldRow = old && (o.species.byCode.get(old.code) ?? all.byCode.get(old.code))
  const oldAge = old ? formatAge(old.age, t.num) : ''
  // The frame draws it as the latest lifer's row (image.ts paintRow, round 6, items 4 and 17): on Desktop, Post and
  // Square one line, the name first and then the detail (or its short form, `label`); stacked on the Story; a poster's foot.
  const latestAs = oldRow ? { row: oldRow, label: fmt(tt.oldestLabel, { age: oldAge }), detail: fmt(tt.oldestDetail, { age: oldAge }), poster: fmt(tt.oldestPoster, { name: o.nameOf?.(oldRow) ?? oldRow.com, age: oldAge }) } : undefined
  const cover = taxonCover(all.rows, codes)
  const totals = chosenTotals(TOTALS, o.totals).map((k) => ({ k, n: formatInt(cover[k][0], t.num), total: formatInt(cover[k][1], t.num), label: tt.rank[k].toUpperCase() }))
  /** What drawing a level takes: its drawing's tree (without its time scale when that is off), its tips and their names. */
  const prep = (view: LevelView) => {
    const rank = view.tips
    const nameOf = (r: Tip): string =>
      r.kind === 'species' ? (state.sci ? r.row.sci : o.nameOf?.(r.row) ?? r.row.com)
        : rank === 'genera' ? r.key
          : rank === 'orders' ? (state.sci ? r.row.ord : (t.orders as Record<string, string>)[r.row.ord] ?? r.row.ord)
            : state.sci ? r.row.fam : familyName(r.row)
    const tips = view.rows.filter((r): r is Tip => r.kind !== 'order')
    return { view, root: view.root && (timeScale ? view.root : bySplits(view.root)), stem: timeScale ? view.stem : 1, nameOf, tips }
  }
  const shown = prep(shownView)
  const onOf = (r: Tip) => (r.kind === 'species' ? Number(r.on) : r.on)
  // The stickers, as on screen: the species' own, else one bird of the group on the list.
  const scale = o.scale ?? IMAGE_SCALE[o.format as ImageFormat] ?? 1
  const stickerOf = (r: Tip): SpeciesRow | undefined => { const row = r.kind === 'species' ? r.row : r.sticker; return row?.st ? row : undefined }
  const urlOf = (row: SpeciesRow) => stickerUrl(row.code, 64, scale, row.sv)
  const imgs = await loadStickers([...new Set(shown.tips.flatMap((r) => { const row = stickerOf(r); return row ? [urlOf(row)] : [] }))], { signal: o.signal })
  const countText = (r: Tip) => (r.kind === 'group' ? fmt(tt.tipOf, { n: formatInt(r.on, t.num), total: formatInt(r.total, t.num) }) : '')

  return renderViewImage({ ...o, countSize: 'hide', latestAs }, TREE_FOOTER, (ctx, card, full) => {
    const C = card.colors
    const font = card.fonts
    // The totals on top of the drawing (round 6: counts only, "65" over "FAMILIES"): the same size for all, in Ink, the
    // rank under it; drawn with the block once it is placed (drawTotals).
    const totalsAt = (w: number) => {
      const { num, label } = totalsSize(totals.map((x) => x.n), w, (s) => { ctx.font = font.count(100); return ctx.measureText(s).width / 100 })
      return { num, label, head: totals.length ? num * 0.72 + TOTAL_GAP + label * 0.72 + TOTALS_BELOW : 0 }
    }
    const { num, label: labelPx, head } = totalsAt(full.w)
    const drawTotals = (y0: number) => {
      const col = full.w / Math.max(1, totals.length)
      const numCap = num * 0.72, labelCap = labelPx * 0.72
      ctx.textBaseline = 'alphabetic'
      ctx.textAlign = 'center'
      totals.forEach((x, i) => {
        const cx = full.x + col * (i + 0.5)
        ctx.font = font.count(num)
        ctx.fillStyle = C.ink
        ctx.fillText(x.n, cx, y0 + numCap)
        ctx.font = font.footer(labelPx)
        ctx.fillStyle = C.muted
        ctx.fillText(x.label, cx, y0 + numCap + TOTAL_GAP + labelCap)
      })
      ctx.textAlign = 'left'
    }
    // The room under the totals, for fitting the drawing; the block (totals, drawing, axis, key) is centred in `full`
    // once its height is known (round 6: no empty band above or below it).
    const room: Area = { x: full.x, y: full.y + head, w: full.w, h: full.h - head }

    // The axis wherever the time scale is on (round 6, item 14: no height it needs first; Square had none).
    const axisIn = (h: number) => timeScale && h > 0 && shown.tips.length > 0
    const axis = axisIn(room.h)
    // The key's line only when the image has a mark or a dotted tip.
    const keyH = shown.tips.some((r) => r.dotted || (r.kind === 'group' && !!r.with)) ? KEY_H : 0
    /** What a layout needs under its drawing: the axis's lines beyond the drawing's own room, then the key. */
    const under = (kind: 'fan' | 'circle' | 'rows') => (axis ? (kind === 'rows' ? AXIS_H : kind === 'fan' ? FAN_AXIS : CIRCLE_AXIS) : 0) + keyH
    // The lines' and dots' scale: 1, except for rows closer than a dot and its stroke (DOT_PITCH), where both shrink with
    // the pitch so neighbouring dots never run together (Perching birds' 141 families).
    let lineK = 1
    const stroke = (on: boolean) => {
      ctx.strokeStyle = on ? C.ink : C.line
      ctx.globalAlpha = on ? 1 : 0.55
      ctx.lineWidth = (on ? 2.5 : 1.5) * lineK
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
        const d = points.filter((_, i) => on(i) === want).map(([x, y]) => circlePath(x, y, IMAGE_SIZES.dot * lineK)).join('')
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
    // Each tip's name and count widths at size 1 (the name's face; the count in mono at LABEL_COUNT of it).
    const spansOf = (tips: readonly Tip[], nameOf: (r: Tip) => string): LabelSpan[] => tips.map((r) => {
      ctx.font = font.lifer(100)
      const nw = ctx.measureText(nameOf(r)).width / 100 + (isMarked(r) ? 0.8 : 0)
      ctx.font = font.footer(100 * LABEL_COUNT)
      const c = countText(r)
      return { name: nw, count: c ? ctx.measureText(c).width / 100 : 0, on: onOf(r) > 0 }
    })
    const shownSpans = spansOf(shown.tips, shown.nameOf)
    const want = shown.root ? at.layout ?? 'rows' : 'rows'
    const { view, root, stem, nameOf, tips } = shown
    const spans = shownSpans
    const dotted = tips.some((r) => r.dotted)
    const tipIsOn = (i: number) => onOf(tips[i]) > 0
    let marked = false
    let y: number
    let axisAt: (v: number) => number[]
    let axisY: number
    let rowsTreeEnd = 0
    // Whether each round layout names every tip of the screen's rank here, told to the dialog (onTreeFits), which shows
    // one that cannot as off and asks for Rectangular instead; a layout that cannot is drawn as rows meanwhile, never cut.
    // The Radial with its time scale opens at the top (RADIAL_GAP), as on screen, and its ages are written there, where
    // no branch runs (round 6, item 5): each that fits the opening, 0 on the tips' ring included.
    const ageW = (v: number) => { ctx.font = font.footer(MONO); return ctx.measureText(formatAge(v, t.num)).width + 10 }
    const AGE_H = MONO * 1.4
    // The image's ages are larger than the screen's, so the opening widens (4° at a time, to 48° at most) until 0 and
    // the next age fit it, as long as the names keep three quarters of their size.
    const fitIn = (sp: LabelSpan[], kind: 'fan' | 'circle', rm: { w: number; h: number }, sizes: LabelSizes, rootAge: number) => {
      if (kind === 'fan' || !timeScale) return fitImage(sp, kind, rm, sizes)
      // 0 on the tips' ring and the first age far enough inside it not to touch 0's label.
      const fits = (f: RoundFit) => {
        const next = ageTicks(rootAge).find((a) => a > 0 && a / rootAge <= 0.97 && (a / rootAge) * f.R >= AGE_H + 2)
        return inOpening(f, sp.length, f.R, ageW(0) + f.st, AGE_H) && (next === undefined || inOpening(f, sp.length, (1 - next / rootAge) * f.R, ageW(next), AGE_H))
      }
      const first = fitImage(sp, kind, rm, { ...sizes, gap: RADIAL_GAP })
      if (!first || fits(first)) return first
      for (let deg = 20; deg <= 48; deg += 4) {
        const f = fitImage(sp, kind, rm, { ...sizes, gap: (deg * Math.PI) / 180 })
        if (!f || f.px < first.px * 0.75) break
        if (fits(f)) return f
      }
      return first
    }
    const round = (sp: LabelSpan[], kind: 'fan' | 'circle', sizes: LabelSizes, rootAge: number) => (shown.root ? fitIn(sp, kind, { w: room.w, h: room.h - under(kind) }, sizes, rootAge) : undefined)
    const shownAge = shown.view.drawing.rootAge
    const shownFans = { fan: round(shownSpans, 'fan', IMAGE_SIZES, shownAge), circle: round(shownSpans, 'circle', IMAGE_SIZES, shownAge) }
    // The same for this card's other orientation (round 6, item 11: the Fan is drawn on the horizontal card, the others on
    // the vertical one), so the dialog offers only what each one's image can draw, before it is drawn.
    const pair = PAIR_CARD[o.format]
    const byCard: Partial<Record<CardFormat, Record<'fan' | 'circle', boolean>>> = { [o.format]: { fan: !!shownFans.fan, circle: !!shownFans.circle } }
    if (pair && shown.root) {
      const c2 = cardLayout(pair, { name: !!o.name?.trim(), filter: !!o.filterLabel?.trim(), latest: !!oldRow, count: 0, countSize: 'hide', viewFooter: true }, posterSize ? printDesign(posterSize, pair === 'printLandscape') : undefined).collage
      const h2 = c2.h - totalsAt(c2.w).head
      const fitsOn = (kind: 'fan' | 'circle') => !!fitIn(shownSpans, kind, { w: c2.w, h: h2 - (axisIn(h2) ? (kind === 'fan' ? FAN_AXIS : CIRCLE_AXIS) : 0) - keyH }, IMAGE_SIZES, shownAge)
      byCard[pair] = { fan: fitsOn('fan'), circle: fitsOn('circle') }
    }
    o.onTreeFits?.({ fan: !!shownFans.fan, circle: !!shownFans.circle }, byCard)
    const fit = want === 'rows' ? undefined : shownFans[want]
    const shape = fit ? (fit.shape ?? 'fan') : 'rows'
    // The rows' scale (round 6, item 5: the pitch the whole room allows, so the rows fill it) and the drawing's height,
    // then the block's top.
    const k = (room.h - under('rows')) / view.height
    const drawH = fit ? fit.up + fit.down : view.height * k
    const blockTop = full.y + Math.max(0, (full.h - head - drawH - under(shape)) / 2)
    drawTotals(blockTop)
    const area: Area = { x: full.x, y: blockTop + head, w: full.w, h: drawH }

    if (fit) {
      // The fan or circle, centred across, its top at the block's.
      const box: FanBox = { cx: area.x + fit.cx, cy: area.y + fit.up, R: fit.R, shape: fit.shape, ...(fit.open ? { open: fit.open } : {}) }
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
        y = box.cy + fit.down
        axisY = y + 10
        axisAt = () => []
      } else {
        y = box.cy + 8
        axisY = y + 10
        axisAt = (v) => ringLabels(box, (1 - v / d.rootAge) * box.R).map(([x]) => x)
      }
      if (axis && shape === 'circle') {
        // The ages on the radius straight up, inside the opening (round 6: where no branch runs, as on screen), 0 on
        // the tips' ring included; on Paper over their rings, none over another (clearTicks keeps 0 and the oldest).
        const items = ageTicks(d.rootAge).filter((a) => a / d.rootAge <= 0.97).flatMap((v) => {
          const rr = (1 - v / d.rootAge) * box.R, w = ageW(v)
          if (!inOpening(box, tips.length, rr, w + (v === 0 ? S : 0), AGE_H)) return []
          const [x, ry] = ringLabels(box, rr)[0]
          return [{ v, x, ry, w, x0: x - w / 2, x1: x + w / 2, y0: ry - AGE_H / 2, y1: ry + AGE_H / 2 }]
        })
        ctx.font = font.footer(MONO)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        for (const a of clearTicks(items, 0)) {
          if (!card.transparent) {
            ctx.fillStyle = C.paper
            ctx.fillRect(a.x0, a.y0, a.w, AGE_H)
          }
          ctx.fillStyle = C.muted
          ctx.fillText(formatAge(a.v, t.num), a.x, a.ry)
        }
      }
    } else {
      const bodyH = drawH
      const top = area.y
      // The labels first (rowsLabels): the drawing takes what they leave, at most half the width.
      const { px, box, counts, col, treeW } = rowsLabels(spans, ROW_H * k, area.w - IMAGE_SIZES.dot)
      const dotX = area.x + treeW
      const ys = tips.map((r) => top + (r.top + ROW_H / 2) * k)
      lineK = Math.min(1, (ROW_H * k) / DOT_PITCH)
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
      rowsTreeEnd = area.x + treeW
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
      // Each side's ages none over another (the Fan's two sides apart): 0 and the oldest kept first (clearTicks).
      const ticks = ageTicks(rootAge).filter((a) => a / rootAge <= 0.97 || a === 0)
      const items = ticks.flatMap((v) => axisAt(v).map((x) => {
        const w = ctx.measureText(formatAge(v, t.num)).width
        return { v, x, x0: x - w / 2, x1: x + w / 2, y0: axisY, y1: axisY + MONO }
      }))
      for (const a of clearTicks(items)) ctx.fillText(formatAge(a.v, t.num), a.x, axisY)
      if (shape === 'fan') ctx.fillText(clipText(ctx, tt.axis, area.w), area.x + area.w / 2, axisY + MONO + 6)
      else if (shape === 'circle') ctx.fillText(clipText(ctx, tt.axis, area.w), area.x + area.w / 2, axisY)
      else {
        const textX = rowsTreeEnd + 16
        ctx.textAlign = 'left'
        ctx.fillText(clipText(ctx, tt.axis, area.x + area.w - textX), textX, axisY)
      }
      y = shape === 'fan' ? axisY + 2 * MONO + 12 : shape === 'circle' ? axisY + MONO + 6 : y + AXIS_H
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
  }, undefined, sampleText(shown.tips.map(shown.nameOf), shown.tips.map(countText), totals, tt))
}

/** Each card's other orientation: the Fan's horizontal card for the others' vertical one, and back (Square is both). */
const PAIR_CARD: Partial<Record<CardFormat, CardFormat>> = { story: 'desktop', desktop: 'story', post: 'wide', wide: 'post', print: 'printLandscape', printLandscape: 'print' }
/** Every text the image draws besides the frame's, so its fonts are loaded first. */
function sampleText(names: string[], counts: string[], totals: readonly { n: string; total: string; label: string }[], tt: Ui['collage']['tree']): string {
  return `${names.join('')}${counts.join('')}${totals.map((x) => `${x.n}${x.label}`).join('')}${tt.axis}${tt.keyMark}${tt.keyDotted}`
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
