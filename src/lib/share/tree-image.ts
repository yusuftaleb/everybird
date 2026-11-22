// The Tree view's share image (view-image.ts has the frame): the level on screen (levelView: the open branch with its
// tips at the rank the view draws) in the collage's area, drawn in the layout on screen in every format, the tall story
// included (`at.layout`: the Fan, the Radial or Rectangular; fan.ts for the first two): on the list in Ink, the rest in
// Line, rounded corners, branches simply joining, every tip one small hollow dot, a tip placed without genetic data
// dotted. Every tip is named, as on screen: along its radius (or row) its dot, a gap, its sticker in a fixed box, a gap,
// the name, the count. The arrangement picked is always the one drawn (round 6, item 9: every one is offered at every
// level, on every card): fitImage sizes the fan or circle at the one largest size round it at which every name and count
// fits whole, as small as that takes; Rectangular's rows run from the top of their room to its bottom (item 11), the
// drawing takes half the width (up to ROWS_TREE_MAX where the text has room to spare), the names are as large as the pitch allows (a long one wrapping onto two lines
// before it shrinks), and the counts are right-aligned in a column at the card's right edge. On a share card no name
// is over NAME_CAP; under NAME_READ (names) or COUNT_READ (counts) the image still draws and tells the dialog
// (onTreeText), which shows a quiet note offering Print. The dialog draws a Fan horizontally and the others
// vertically. The totals, the drawing, its axis and key are one block centred in the card's area (round 6), so neither
// a Fan, a Radial nor the rows leave an empty band above or below them; room is kept only for the axis and key drawn,
// and the Tree card's gaps are tighter than the collage card's (TIGHT_GAPS, item 9). A group with no bird on the list
// shows its representative sticker dimmed (groupSticker). Under it, when there is room and the time scale is on
// (`at.time`, the bar's switch; off: the splits spaced evenly, bySplits, and no axis, rings or ages), the age axis (the
// circle's ages on its radius straight up, never over a branch end), and a one-line key for the mark and the dotted
// line when the image has them. "Lifers only" (`at.mine`) as on screen. With "Show oldest lineage" (`oldest`) the
// oldest lineage takes the latest lifer's place and style (latestAs; on a poster, its foot). On top, instead of the
// big count, the totals the dialog's Totals row keeps (species, genera, families and orders at and below the level on
// screen, any of them, none included), each a plain count over its rank ("65" over "FAMILIES", no "/ 250"), the same
// size and weight; with none, the drawing has their room. The oldest lineage is the card's small row (SMALL_ROW). The footer links to the credits (image.ts FOOTER_LINE), the tree's among them.
// A share image and a poster alike draw the rank on screen, its Level (round 6, item 22: Print's own "Down to" went).
import { fmt, pluralWord, type Plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import type { Ui } from '@/i18n/messages/en'
import { loadSpecies } from '@/lib/species/load'
import { familyName } from '@/lib/species/names'
import type { SpeciesRow } from '@/lib/species/types'
import { stickerUrl } from '@/lib/sticker-url'
import { LABEL_COUNT, LABEL_GAP, LABEL_STICKER, RADIAL_GAP, drawFan, fanLabel, fanRing, fitRound, inOpening, largestFit, polar, ringLabels, type FanBox, type LabelSizes, type LabelSpan, type RoundFit } from '@/lib/tree/fan'
import { loadTree } from '@/lib/tree/load'
import { levelView, ROW_H, taxonCover, tipOn, type LevelView, type TreeRow } from '@/lib/tree/levels'
import { ageTicks, bySplits, circlePath, drawTree, formatAge, oldestLineage, type Drawing } from '@/lib/tree/tree'
import { IMAGE_SCALE, SMALL_ROW, loadStickers, type ImageFormat } from './image'
import type { PrintSize } from './print'
import { chosenTotals, clipText, renderViewImage, type Area, type ViewImageOpts } from './view-image'

/** The Rectangular poster's names: the largest size (round 6: as large as the room allows, up to this). */
const NAME_MAX = 48
/**
 * Readable sizes, in design units, the same on every share card (round 6, item 9): a tip's name from the latest lifer
 * row's name's size (SMALL_ROW.name, 26) and its count from the footer's mono line's (the card's credit, 20). The image
 * still draws under them, as small as the arrangement needs, and says so (onTreeText: the dialog's note). NAME_CAP: on a
 * share card no name is larger than about 1.4 times the readable size (posters keep their own sizes, NAME_MAX).
 */
export const NAME_READ = SMALL_ROW.name, COUNT_READ = 20, NAME_CAP = 36
/** The axis's rows (round 6, item 9: closer and smaller than they were, 44 and 18), the key's line (was 40) and the mono size of both. */
const AXIS_H = 32, KEY_H = 28, MONO = 16
/** A wrapped name's line height, in units of its size. */
const WRAP_LINE = 1.15
/** The row pitch a full-size tip dot and its stroke need (a 5 radius, 2.5 stroke) with a little air. */
const DOT_PITCH = 14
/** The Fan's and Radial's name size from which tip dots and branches are drawn full size; under it they shrink with the
 *  names (Yusuf, 2026-11-21: a dense fan's dots outweighed its tiny names). */
const DOT_FULL_PX = 14
/** The round layouts' axis beyond their own room: the fan's title line under the ages its `below` holds; the circle's title. */
const FAN_AXIS = 22, CIRCLE_AXIS = 28
/** The Fan's and Radial's names in the image (design units): as on screen at about twice the size or more where the
 *  card has room (round 6, item 5: up to 32), shrinking further than the screen's, so a level the screen names whole is
 *  named whole in the image too. */
export const IMAGE_SIZES: LabelSizes = { base: 32, floor: 9, dot: 5, rMin: 40, rMax: Infinity, below: 40 }
/** The image's Fan and Radial keep their radius at least this share of their reach (the radius and the longest label):
 *  never a tiny knot under long labels (round 6, item 15). */
const BALANCE = 0.33

/** The smallest size the image's labels shrink to (design units): past it a Fan or Radial is drawn as rows. */
const SHRINK_MIN = 0.5

/**
 * The share image's Fan or Radial (round 6, items 5, 9 and 15): fitRound with the labels' reach centred in the width
 * (`fill`), every name and every count kept, at one size round the tree: the largest up to `sizes.base` at which they
 * all fit, as small as that takes (the chosen arrangement is always drawn, item 9); of those, the largest whose radius
 * is at least BALANCE of the reach, so the drawing and its names share the card; when no size balances, the plain fit.
 * Undefined only when not even SHRINK_MIN names them.
 */
function fitImage(spans: readonly LabelSpan[], shape: 'fan' | 'circle', room: { w: number; h: number }, sizes: LabelSizes = IMAGE_SIZES): RoundFit | undefined {
  const at = (px: number) => fitRound(spans, shape, room, { ...sizes, base: px, floor: px, fill: true, keepCounts: true })
  const reach = (f: RoundFit) => Math.max(0, ...spans.map((sp, i) => (sizes.dot) + f.st + f.px * (2 * LABEL_GAP + sp.name + (f.counts[i] && sp.count ? LABEL_GAP + sp.count : 0))))
  const balanced = (f: RoundFit) => f.R >= BALANCE * (f.R + reach(f))
  // The largest size that fits (fan.ts largestFit, the screen's search too).
  const first = at(sizes.base) ?? largestFit(at, SHRINK_MIN, sizes.base)
  if (!first) return undefined
  if (balanced(first)) return first
  let lo = SHRINK_MIN, hi = first.px, best: RoundFit | undefined
  for (let i = 0; i < 12; i++) {
    const m = (lo + hi) / 2
    const f = at(m)
    if (f && balanced(f)) { best = f; lo = m } else hi = m
  }
  return best ?? first
}

/**
 * The age labels to write of `items` (any order, an age on both sides of the Fan's centre twice): none over another
 * (`pad` units of air). The youngest (0) and the oldest are taken first (round 6, item 15), then the others, youngest
 * first, each only where it clears those taken. Each item: its age and its box.
 */
function clearTicks<T extends { v: number; x0: number; x1: number; y0: number; y1: number }>(items: readonly T[], pad = 6): T[] {
  if (!items.length) return []
  const lo = Math.min(...items.map((x) => x.v)), hi = Math.max(...items.map((x) => x.v))
  const rank = (x: T) => (x.v === lo ? 0 : x.v === hi ? 1 : 2)
  const order = [...items].sort((a, b) => rank(a) - rank(b) || a.v - b.v)
  const clear = (a: T, b: T) => a.x1 + pad <= b.x0 || b.x1 + pad <= a.x0 || a.y1 + pad <= b.y0 || b.y1 + pad <= a.y0
  const kept: T[] = []
  for (const it of order) if (kept.every((k) => clear(it, k))) kept.push(it)
  return kept.sort((a, b) => a.v - b.v)
}
/** The totals: the largest number, the gap under the numbers, and before the drawing (round 6, item 9: 20, was 32). */
const TOTAL_MAX = 56, TOTAL_GAP = 12, TOTALS_BELOW = 20

type Tip = Exclude<TreeRow, { kind: 'head' }>
type TotalRank = 'species' | 'genera' | 'families' | 'orders'
/** The four totals, in this order. */
export const TOTALS: readonly TotalRank[] = ['species', 'genera', 'families', 'orders']
/** Each total's word, by its count ("1 family", "5 families"; Russian's few and many forms too). */
const RANK_WORD: Record<TotalRank, (t: Ui) => Plural> = {
  species: (t) => t.collage.stats.species, genera: (t) => t.collage.tree.genera, families: (t) => t.collage.stats.families, orders: (t) => t.collage.stats.orders,
}

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
const ROWS_TREE = 0.5
const ROWS_TREE_MIN = 0.2
/** Where the names have their largest size and room to spare (a long level held small by its rows' pitch, or the cap),
 *  the drawing takes that room, up to this share of the width, so no wide gap opens between a name and its count
 *  (round 6, item 9: the share image's spacing tightened). */
export const ROWS_TREE_MAX = 0.7

/**
 * Rectangular in the image: every tip named and counted (round 6, items 6, 9 and 13). The rows span `width` (the area's,
 * less the tips' dot): the drawing on the left, half of it (ROWS_TREE), or up to ROWS_TREE_MAX where the text has room to
 * spare, then each tip's sticker box, its name and, in
 * a column at the right edge, its count. The names' size is the largest the rows' `pitch` allows (`cap` at most:
 * NAME_CAP on a share card, NAME_MAX on a poster); when a tip's sticker, name and count don't fit beside a half-width
 * drawing, the drawing gives way first, down to ROWS_TREE_MIN of the width; then a long name with `lines` (its best two
 * lines' widths) wraps onto two where the pitch holds them and that keeps the size larger (item 9); only then do the
 * names shrink, so no count is ever dropped. `treeW`: the drawing's width; `px`, `box`: the names' size and the sticker
 * box's side; `counts`: every tip with a count keeps it; `wrap`: the tips whose names take two lines; `col`: the
 * counts' right edge from the text's start. `name`/`count`/`lines` are widths at size 1. `maxTree`: the most the drawing
 * may take beyond its half (the axis caption's room after the 0 tick).
 */
export function rowsLabels(spans: readonly (LabelSpan & { lines?: readonly [number, number] })[], pitch: number, width: number, cap = NAME_MAX, maxTree = Infinity): { px: number; box: number; counts: boolean[]; wrap: boolean[]; col: number; treeW: number } {
  const want = Math.min(cap, pitch * 0.75)
  const boxAt = (px: number) => Math.min(pitch * 0.92, px * LABEL_STICKER)
  // A tip's text at size 1: the gap, the box's gap, the name (one line or its longer wrapped line), the count's gap and count.
  const len = (sp: LabelSpan, name: number) => 2 * LABEL_GAP + name + (sp.count ? LABEL_GAP + sp.count : 0)
  // The most two wrapped lines may be: both inside the row.
  const twoLines = pitch / (2 * WRAP_LINE)
  const wrapLen = (sp: (typeof spans)[number]) => (sp.lines ? len(sp, Math.max(sp.lines[0], sp.lines[1])) : Infinity)
  const need = (px: number) => Math.max(0, ...spans.map((sp) => boxAt(px) + px * Math.min(len(sp, sp.name), px <= twoLines ? wrapLen(sp) : Infinity)))
  const treeW = Math.round(Math.max(width * ROWS_TREE_MIN, Math.min(Math.max(width * ROWS_TREE, Math.min(width * ROWS_TREE_MAX, maxTree)), width - need(want))))
  const textW = width - treeW
  // The largest size whose text of length L fits textW (the box either follows the size or is the pitch's).
  const limit = (L: number) => Math.max(textW / (LABEL_STICKER + L), (textW - pitch * 0.92) / L)
  const one = spans.map((sp) => limit(len(sp, sp.name)))
  const two = spans.map((sp) => Math.min(twoLines, limit(wrapLen(sp))))
  const px = Math.max(1e-3, Math.min(want, ...spans.map((_, i) => Math.max(one[i], two[i]))))
  return { px, box: boxAt(px), counts: spans.map((sp) => !!sp.count), wrap: spans.map((_, i) => px > one[i] + 1e-9), col: textW, treeW }
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
  const totals = chosenTotals(TOTALS, o.totals).map((k) => ({ k, n: formatInt(cover[k][0], t.num), total: formatInt(cover[k][1], t.num), label: pluralWord(RANK_WORD[k](t), cover[k][0]).toUpperCase() }))
  /** What drawing a level takes: its drawing's tree (without its time scale when that is off), its tips and their names. */
  const prep = (view: LevelView) => {
    const rank = view.tips
    const nameOf = (r: Tip): string =>
      r.kind === 'species' ? (state.sci ? r.row.sci : o.nameOf?.(r.row) ?? r.row.com)
        : rank === 'genera' ? r.key
          : rank === 'orders' ? (state.sci ? r.row.ord : (t.orders as Record<string, string>)[r.row.ord] ?? r.row.ord)
            : state.sci ? r.row.fam : familyName(r.row)
    const tips = view.rows.filter((r): r is Tip => r.kind !== 'head')
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

  return renderViewImage({ ...o, countSize: 'hide', latestAs, tight: true }, (ctx, card, full) => {
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
    // A name of several words also gets its best two lines (the split whose longer line is shortest), for Rectangular's
    // wrap (rowsLabels); `splits` keeps the two lines' words.
    const splits: ([string, string] | undefined)[] = []
    const spansOf = (tips: readonly Tip[], nameOf: (r: Tip) => string): (LabelSpan & { lines?: [number, number] })[] => tips.map((r, i) => {
      ctx.font = font.lifer(100)
      const name = nameOf(r), mark = isMarked(r) ? 0.8 : 0
      const nw = ctx.measureText(name).width / 100 + mark
      const words = name.split(' ')
      let lines: [number, number] | undefined
      splits[i] = undefined
      for (let k = 1; k < words.length; k++) {
        const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ')
        const w: [number, number] = [ctx.measureText(a).width / 100, ctx.measureText(b).width / 100 + mark]
        if (!lines || Math.max(...w) < Math.max(...lines)) { lines = w; splits[i] = [a, b] }
      }
      ctx.font = font.footer(100 * LABEL_COUNT)
      const c = countText(r)
      const st = stickerOf(r)
      return { name: nw, count: c ? ctx.measureText(c).width / 100 : 0, on: onOf(r) > 0, ...(st ? { ar: st.ar > 0 ? st.ar : 1 } : {}), ...(lines ? { lines } : {}) }
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
    let rowsPx = 0
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
    // The arrangement asked for is the one drawn (round 6, item 9): its labels shrink as far as it needs, never over
    // NAME_CAP on a share card. Only a Fan or Radial that not even SHRINK_MIN names (none on the shipped tree's levels)
    // is drawn as rows.
    const roundSizes = posterSize ? IMAGE_SIZES : { ...IMAGE_SIZES, base: Math.min(IMAGE_SIZES.base, NAME_CAP) }
    const fit = want === 'rows' ? undefined : round(shownSpans, want, roundSizes, shown.view.drawing.rootAge)
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
      lineK = Math.min(1, fit.px / DOT_FULL_PX)
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
      const S = px * LABEL_STICKER, g = px * LABEL_GAP, from = IMAGE_SIZES.dot * lineK + g
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
        axisY = y + 8
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
      // The labels first (rowsLabels): the drawing takes what they leave, half the width to ROWS_TREE_MAX.
      // The rows from the area's top to its bottom (round 6, item 11): the first row's text and sticker at the top edge,
      // the last's at the bottom (no half a pitch left under it), so the tree runs down to the gap above the footer's
      // row or hairline. The pitch sets the labels' size and they set the rows' ends, so both are settled together,
      // the pitch only ever shrinking at the last step, so nothing passes the edge.
      const cap = posterSize ? NAME_MAX : NAME_CAP
      const centres = tips.map((r) => r.top + ROW_H / 2)
      const span = centres.length > 1 ? centres[centres.length - 1] - centres[0] : 0
      // The axis caption follows the 0 tick at the drawing's end (16 units on): the drawing leaves it its room.
      ctx.font = font.footer(MONO)
      const maxTree = timeScale ? Math.floor(area.w - 17 - ctx.measureText(tt.axis).width) : Infinity
      const labelsAt = (kk: number) => rowsLabels(spans, ROW_H * kk, area.w - IMAGE_SIZES.dot, cap, maxTree)
      const half = (lab: ReturnType<typeof labelsAt>) => Math.max(lab.box, lab.px * (lab.wrap.some(Boolean) ? 2 * WRAP_LINE : 1.2), 2 * IMAGE_SIZES.dot) / 2
      let kk = k, lab = labelsAt(kk)
      if (span > 0) {
        for (let i = 0; i < 4; i++) { kk = (bodyH - 2 * half(lab)) / span; lab = labelsAt(kk) }
        if (span * kk + 2 * half(lab) > bodyH) { kk = (bodyH - 2 * half(lab)) / span; lab = labelsAt(kk) }
      }
      const { px, box, counts, wrap, col, treeW } = lab
      rowsPx = px
      const dotX = area.x + treeW
      const ys = span > 0 ? centres.map((c) => top + half(lab) + (c - centres[0]) * kk) : tips.map(() => top + bodyH / 2)
      lineK = Math.min(1, (ROW_H * kk) / DOT_PITCH)
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
        // A wrapped name: its two lines about the row's centre, the mark after the second.
        const two = wrap[i] ? splits[i] : undefined
        const lh = px * WRAP_LINE
        const last = two ? two[1] : name, lastY = two ? ys[i] + lh / 2 : ys[i]
        if (two) ctx.fillText(two[0], nameX, ys[i] - lh / 2)
        ctx.fillText(last, nameX, lastY)
        if (isMarked(r)) {
          marked = true
          diamond(ctx, nameX + ctx.measureText(last).width + px * 0.4, lastY, px * 0.22, C.ink)
        }
      })
      y = top + bodyH
      axisY = y + 12
      axisAt = (v) => [area.x + (1 - v / view.drawing.rootAge) * treeW]
      rowsTreeEnd = area.x + treeW
      if (axis) {
        ctx.fillStyle = C.hairline
        ctx.fillRect(area.x, y + 6, treeW, 2)
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
      if (shape === 'fan') ctx.fillText(clipText(ctx, tt.axis, area.w), area.x + area.w / 2, axisY + MONO + 4)
      else if (shape === 'circle') ctx.fillText(clipText(ctx, tt.axis, area.w), area.x + area.w / 2, axisY)
      else {
        const textX = rowsTreeEnd + 16
        ctx.textAlign = 'left'
        ctx.fillText(clipText(ctx, tt.axis, area.x + area.w - textX), textX, axisY)
      }
      y = shape === 'fan' ? axisY + 2 * MONO + 8 : shape === 'circle' ? axisY + MONO + 4 : y + AXIS_H
    }
    // The names' size, for the dialog's note (round 6, item 9): under the readable sizes, the image still draws.
    const namesPx = fit ? fit.px : rowsPx
    const small = namesPx < NAME_READ - 1e-9 || (spans.some((sp) => sp.count > 0) && namesPx * LABEL_COUNT < COUNT_READ - 1e-9)
    o.onTreeText?.({ layout: shape, px: namesPx, small })
    // The key: only what the image shows.
    let x = area.x
    const keyY = y + KEY_H / 2 + 2
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
