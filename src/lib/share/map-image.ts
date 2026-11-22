// The Map view's share image (view-image.ts has the frame): the whole world, whatever the view's zoom (the Map has no
// country or province levels since round 6), shaded by the birds the filters leave (mapCounts, the Places filter
// included) on the view's continuous scale (RAMP in shapes.ts), with the legend ramp under it, and under that the six
// countries with the most species, each with its flag, its name, its count and a bar in its shade: in the Story (and the
// portrait poster) one under another, the map at the area's full width and the rows grown (up to ROW_GROW_MAX, then
// spaced out) so the block fills the area to the footer; in every other format (Post, Square, Desktop, the 5:4
// post and the landscape poster) in a grid of three columns by two rows, so the map takes the image's width (or as
// much of it as the height allows). On top, instead of the big count, the totals the dialog's Totals row keeps (the
// species and the countries, either, both or none), the same size and weight as the tree image's, each over its word;
// with none, the map has their room. Hairline Paper borders on every shape. No outline, no tooltip.
import { plural, pluralWord } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { parsePlaceKey } from '@/lib/list/place-keys'
import { flagSrc } from '@/lib/flag'
import { countRange, loadMapCountries, mapCounts, mapRows, mapShapes, RAMP, shadeMix } from '@/lib/map/shapes'
import { chosenTotals, clipText, fitBox, renderViewImage, type Area, type ViewImageOpts } from './view-image'
import type { CardFormat } from './image'

/** How many places the image lists. */
export const TOP_PLACES = 6
/** The map image's totals, in this order. */
export const MAP_TOTALS = ['species', 'countries'] as const
/** The grid's columns (three by two for the six places). */
const GRID_COLS = 3
/** Design units: the legend (ramp height, text size, room above), one listed place (name and count, bar, row) and gaps. */
const LEGEND = { ramp: 12, size: 20, above: 24, rampMax: 360, gap: 14 }
const ROW = { name: 26, count: 22, bar: 6, h: 64, barTop: 40 }
/** A row's drawn height (the name line and the bar), without the space under it. */
const ROW_INK = ROW.barTop + ROW.bar
/** The column's rows (Story, portrait poster) grow with the room under the map up to this scale (a 52-unit name, under
 *  the totals' 56), then their pitch spreads, up to ROW_SPREAD_MAX of a row's height; past that the block is centred. */
const ROW_GROW_MAX = 2, ROW_SPREAD_MAX = 1.25
const LIST_GAP = 40
/** The grid: the gap between its columns, its cells' least width (the grid is the map's width, at least three of these). */
const GRID = { gap: 32, cellMin: 300, gapAbove: 32 }
/** The borders' width in design units: hairlines (the page's .5px). */
const STROKE = 0.6
/** The totals, as the tree image's: the largest number, the gap under the numbers and the labels, room before the map. */
const TOTAL_MAX = 56, TOTAL_GAP = 12, TOTALS_BELOW = 32
/** A listed country's flag (design units): flag-icons' 4:3, the Places filter's 18×13 at the names' scale, and its gap. */
const FLAG = { w: 30, h: 22, gap: 12 }

/** The formats whose places are listed one under another (the tall ones); every other lays them out in the grid. */
export const mapListsInColumn = (format: CardFormat) => format === 'story' || format === 'print'

/** The list's place: its area (`y` its top under the map once painted), how many places, its columns (1 or GRID_COLS),
 *  the rows' scale `k` (their text, flags and bars; 1 in the grid) and `pitch`, one row's top to the next one's. */
type MapImageLayout = { map: Area; legendH: number; list: Area | null; rows: number; cols: number; k: number; pitch: number }

/**
 * Where the map, its legend and the top places go in `area`: the map across the area's width, the legend under it, the
 * places under that, as many of `rows` as fit (at most TOP_PLACES; the list takes at most 45% of the area): one under
 * another (`grid` false: the Story and the portrait poster), else in GRID_COLS columns, so two rows for six. The map
 * box is what is left; the map is fitted whole in it (fitBox), and the painter moves the map, legend and list up
 * together as one block. In the column, `mapH` (the map's height at the area's full width) leaves the rest of the area
 * to the list: its rows grow by `k` (at most ROW_GROW_MAX) and spread (at most ROW_SPREAD_MAX) to fill it, the map
 * staying full width; what is still left over (a few places) the painter's centring shares above and below.
 */
export function mapImageLayout(area: Area, rows: number, legend: boolean, grid: boolean, mapH = 0): MapImageLayout {
  const legendH = legend ? LEGEND.above + Math.max(LEGEND.ramp, LEGEND.size) : 0
  const cols = grid ? GRID_COLS : 1
  const want = Math.min(rows, TOP_PLACES)
  // Lines of places that fit in 45% of the area (the last one without the space under a row), then the places on them.
  const lines = Math.min(Math.ceil(want / cols), Math.floor((area.h * 0.45 - ROW_INK) / ROW.h) + 1)
  const n = Math.max(0, Math.min(want, lines * cols))
  const used = Math.ceil(n / cols)
  const listH = n ? (used - 1) * ROW.h + ROW_INK : 0
  const gap = n ? (grid ? GRID.gapAbove : LIST_GAP) : 0
  let k = 1, pitch = ROW.h, h = listH
  const room = area.h - legendH - gap - mapH
  if (n && !grid && room > listH) {
    k = Math.min(ROW_GROW_MAX, room / listH)
    pitch = used > 1 ? Math.min(ROW.h * k * ROW_SPREAD_MAX, (room - ROW_INK * k) / (used - 1)) : ROW.h * k
    h = (used - 1) * pitch + ROW_INK * k
  }
  const list = n ? { x: area.x, y: area.y + area.h - h, w: area.w, h } : null
  return { map: { x: area.x, y: area.y, w: area.w, h: area.h - legendH - h - gap }, legendH, list, rows: n, cols, k, pitch }
}

/**
 * The grid's columns under a map drawn `mapW` wide, centred on `cx`: as wide as the map, at least GRID_COLS cells of
 * GRID.cellMin (a map the height keeps narrow, the desktop's), never wider than `area`. Each column's left edge and width.
 */
export function gridColumns(area: Area, cx: number, mapW: number): { x: number; w: number }[] {
  const w = Math.min(area.w, Math.max(mapW, GRID_COLS * GRID.cellMin + (GRID_COLS - 1) * GRID.gap))
  const x0 = Math.max(area.x, Math.min(area.x + area.w - w, cx - w / 2))
  const cell = (w - (GRID_COLS - 1) * GRID.gap) / GRID_COLS
  return Array.from({ length: GRID_COLS }, (_, i) => ({ x: x0 + i * (cell + GRID.gap), w: cell }))
}

/** `a` mixed into `b` by `p` (sRGB, as CSS color-mix), both #rrggbb. */
function mix(a: string, b: string, p: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16)
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) * p + ch(b, i) * (1 - p)).toString(16).padStart(2, '0')).join('')}`
}

/**
 * A country's flag for the canvas: flag-icons' SVG (same origin) given a size, since an SVG with only a viewBox has none
 * and some browsers won't draw it. null when the set has no flag or it fails.
 */
async function loadFlag(iso: string, signal?: AbortSignal): Promise<HTMLImageElement | null> {
  const src = flagSrc(iso)
  if (!src) return null
  try {
    const svg = (await (await fetch(src, { signal })).text()).replace(/<svg\b(?![^>]*\swidth=)/, '<svg width="640" height="480"')
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const img = new Image()
    img.src = url
    await img.decode().finally(() => URL.revokeObjectURL(url))
    return img
  } catch {
    return null
  }
}

export async function renderMapImage(o: ViewImageOpts): Promise<Blob> {
  const { state, species, at, t, entries } = o
  const name = at.names ?? ((k: string) => k.slice(2))
  const world = await loadMapCountries()
  const counts = mapCounts(state.list, state.filter, species, state.seen)
  const shapes = mapShapes(world, counts)
  const box = { x: 0, y: 0, w: world.w, h: world.h }
  const [min, max] = countRange(shapes)
  const rows = mapRows(counts, name)
  const top = rows.slice(0, TOP_PLACES)
  const flags = new Map(await Promise.all(top.map(async (r) => [r.value, await loadFlag(parsePlaceKey(r.value)?.country ?? '', o.signal)] as const)))
  // The totals the dialog keeps (the countries only when the list has places).
  const totals = chosenTotals(MAP_TOTALS, o.totals).flatMap((k) => k === 'species'
    ? [{ n: formatInt(entries.length, t.num), label: pluralWord(t.collage.stats.species, entries.length).toUpperCase() }]
    : rows.length ? [{ n: formatInt(rows.length, t.num), label: pluralWord(t.filters.countHead.country, rows.length).toUpperCase() }] : [])
  const minText = formatInt(min, t.num)
  const maxText = plural(t.collage.stats.species, max, { n: formatInt(max, t.num) })
  return renderViewImage({ ...o, countSize: 'hide' }, (ctx, card, full) => {
    const C = card.colors
    const font = card.fonts
    const shade = (p: number) => mix(C.accent, C.paper, p)
    // The totals on top, as the tree image's: one number size for both (the largest that fits each in its half), in
    // Ink, its word under it in Muted capitals. None: no head, the map takes its room.
    const col = full.w / Math.max(1, totals.length)
    ctx.font = font.count(100)
    const num = Math.floor(Math.min(TOTAL_MAX, ...totals.map((x) => (col - 24) / Math.max(1e-6, ctx.measureText(x.n).width / 100))))
    const labelPx = Math.max(16, Math.min(22, Math.round(num * 0.4)))
    const numCap = num * 0.72, labelCap = labelPx * 0.72
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'center'
    totals.forEach((x, i) => {
      const cx = full.x + col * (i + 0.5)
      ctx.font = font.count(num)
      ctx.fillStyle = C.ink
      ctx.fillText(x.n, cx, full.y + numCap)
      ctx.font = font.footer(labelPx)
      ctx.fillStyle = C.muted
      ctx.fillText(clipText(ctx, x.label, col - 16), cx, full.y + numCap + TOTAL_GAP + labelCap)
    })
    const headH = totals.length ? numCap + TOTAL_GAP + labelCap + TOTALS_BELOW : 0
    const area: Area = { x: full.x, y: full.y + headH, w: full.w, h: full.h - headH }
    const L = mapImageLayout(area, top.length, max > 0, !mapListsInColumn(o.format), (box.h * area.w) / box.w)
    const fit = fitBox(box.w, box.h, L.map)
    const mapW = box.w * fit.s
    // The map, its legend and the list are one block, centred in the area.
    fit.y = area.y + (L.map.h - box.h * fit.s) / 2
    // The whole world, clipped to its box.
    ctx.save()
    ctx.beginPath()
    ctx.rect(fit.x, fit.y, box.w * fit.s, box.h * fit.s)
    ctx.clip()
    ctx.translate(fit.x - box.x * fit.s, fit.y - box.y * fit.s)
    ctx.scale(fit.s, fit.s)
    ctx.strokeStyle = C.paper
    ctx.lineWidth = STROKE / fit.s
    ctx.lineJoin = 'round'
    for (const s of shapes) {
      const p = new Path2D(s.d)
      ctx.fillStyle = s.n > 0 ? shade(shadeMix(s.n, min, max)) : C.surface
      ctx.fill(p, 'evenodd')
      ctx.stroke(p)
    }
    ctx.restore()
    const mapBottom = fit.y + box.h * fit.s
    ctx.textBaseline = 'middle'

    // The legend under the map, from its left edge: the lowest count, the ramp, the highest with the count's word.
    if (max > 0) {
      const y = mapBottom + LEGEND.above + LEGEND.size / 2
      ctx.font = card.fonts.footer(LEGEND.size)
      const lw = ctx.measureText(minText).width, rw = ctx.measureText(maxText).width
      const room = mapW
      const ramp = Math.max(0, Math.min(LEGEND.rampMax, room - lw - rw - 2 * LEGEND.gap))
      const x0 = fit.x
      ctx.fillStyle = C.muted
      ctx.textAlign = 'left'
      ctx.fillText(minText, x0, y)
      const rx = x0 + lw + LEGEND.gap
      if (ramp > 0) {
        const g = ctx.createLinearGradient(rx, 0, rx + ramp, 0)
        g.addColorStop(0, shade(RAMP.lo))
        g.addColorStop(1, shade(RAMP.hi))
        ctx.fillStyle = g
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(rx, y - LEGEND.ramp / 2, ramp, LEGEND.ramp, LEGEND.ramp / 2)
        else ctx.rect(rx, y - LEGEND.ramp / 2, ramp, LEGEND.ramp)
        ctx.fill()
      }
      ctx.fillStyle = C.muted
      ctx.fillText(clipText(ctx, maxText, Math.max(0, room - lw - ramp - 2 * LEGEND.gap)), rx + ramp + LEGEND.gap, y)
    }

    // The top places, one under another or in the grid's cells (row by row): the flag and the name (clipped), the count
    // at the cell's right edge, a bar in the place's shade under them, as long as its share of the most.
    if (!L.list) return
    const listY = mapBottom + L.legendH + (L.cols > 1 ? GRID.gapAbove : LIST_GAP)
    const cells = L.cols > 1 ? gridColumns(area, fit.x + mapW / 2, mapW) : [{ x: L.list.x, w: L.list.w }]
    const most = top[0]?.count ?? 1
    const k = L.k
    top.slice(0, L.rows).forEach((r, i) => {
      const { x, w: cw0 } = cells[i % L.cols]
      const y = listY + Math.floor(i / L.cols) * L.pitch
      const mid = y + (ROW.name / 2 + 4) * k
      const count = formatInt(r.count, t.num)
      ctx.font = card.fonts.mono(ROW.count * k)
      const cw = ctx.measureText(count).width
      ctx.fillStyle = C.muted
      ctx.textAlign = 'right'
      ctx.fillText(count, x + cw0, mid)
      // A country's flag before its name (its slot kept when the set has none, so the names line up).
      const fx = (FLAG.w + FLAG.gap) * k
      const flag = flags.get(r.value)
      if (flag) ctx.drawImage(flag, x, mid - (FLAG.h * k) / 2, FLAG.w * k, FLAG.h * k)
      ctx.font = card.fonts.lifer(ROW.name * k)
      ctx.fillStyle = C.ink
      ctx.textAlign = 'left'
      ctx.fillText(clipText(ctx, r.label, cw0 - cw - 16 * k - fx), x + fx, mid)
      ctx.fillStyle = shade(shadeMix(r.count, min, max) || RAMP.hi)
      ctx.beginPath()
      const bar = ROW.bar * k
      const w = Math.max(bar, (cw0 * r.count) / most)
      if (ctx.roundRect) ctx.roundRect(x, y + ROW.barTop * k, w, bar, bar / 2)
      else ctx.rect(x, y + ROW.barTop * k, w, bar)
      ctx.fill()
    })
  }, undefined, `${totals.map((x) => x.n + x.label).join('')}${minText}${maxText}${top.map((r) => `${r.label}${formatInt(r.count, t.num)}`).join('')}0123456789`)
}
