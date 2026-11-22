// The Map view's share image (view-image.ts has the frame): the whole world, whatever the view's zoom (the Map has no
// country or province levels since round 6), shaded by the birds the filters leave (mapCounts, the Places filter
// included) on the view's continuous scale (RAMP in shapes.ts), with the legend ramp under it, and under that the six
// countries with the most species in two columns of three (ranks 1-3 down the left, 4-6 down the right; fewer fill the
// left first), each row its flag, its name (clipped) and its count at the column's right edge on one baseline, at the
// card's small row's size (image.ts SMALL_ROW), in every format and poster alike; the map takes the rest of the height.
// On top, instead of the big count, the totals the dialog's Totals row keeps (the species and the countries, either,
// both or none), as the tree image's (view-image.ts viewTotals): one right-aligned group at the top right, beside the
// title when both fit; with none, the map has their room. Hairline Paper borders on every shape. No outline, no tooltip.
import { plural, pluralWord } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { parsePlaceKey } from '@/lib/list/place-keys'
import { flagSrc } from '@/lib/flag'
import { countRange, loadMapCountries, mapCounts, mapRows, mapShapes, RAMP, shadeMix } from '@/lib/map/shapes'
import { chosenTotals, clipText, fitBox, renderViewImage, viewTotals, type Area, type ViewImageOpts } from './view-image'
import { SMALL_ROW } from './image'

/** How many places the image lists. */
export const TOP_PLACES = 6
/** The map image's totals, in this order. */
export const MAP_TOTALS = ['species', 'countries'] as const
/** The list's columns and the rows in each (two by three for the six places). */
export const LIST_COLS = 2, LIST_ROWS = 3
/** Design units: the legend (ramp height, text size, room above), one listed place and the list. */
const LEGEND = { ramp: 12, size: 20, above: 24, rampMax: 360, gap: 14 }
/** A listed place (r6): its name at the share card's small row's size (SMALL_ROW, the latest lifer's), its count in
 *  mono at that row's label size, on one baseline; `h` its line, `pitch` one row's top to the next one's. */
export const ROW = { name: SMALL_ROW.name, count: SMALL_ROW.label, h: 32, pitch: 44 }
/** The list: the room above it, the gap between its columns, a column's least comfortable width. */
export const LIST = { above: 32, gap: 48, colMin: 380 }
/** The borders' width in design units: hairlines (the page's .5px). */
const STROKE = 0.6
/** A listed country's flag (design units): flag-icons' 4:3, the Places filter's 18×13 at the names' scale, and its gap. */
const FLAG = { w: 30, h: 22, gap: 12 }

/** The list's place: its area (`y` its top under the map once painted), how many places and how many in each column. */
type MapImageLayout = { map: Area; legendH: number; list: Area | null; rows: number; perCol: number }

/**
 * Where the map, its legend and the top places go in `area`: the map across the area's width, the legend under it, the
 * places under that in LIST_COLS columns of up to LIST_ROWS rows (at most TOP_PLACES; only the lines that fit in 45% of
 * the area), the left column filled first. The map box is all that is left, so the spare height is the map's; the map
 * is fitted whole in it (fitBox), and the painter centres the map, legend and list in the area as one block.
 */
export function mapImageLayout(area: Area, rows: number, legend: boolean): MapImageLayout {
  const legendH = legend ? LEGEND.above + Math.max(LEGEND.ramp, LEGEND.size) : 0
  const want = Math.min(rows, TOP_PLACES)
  const fit = Math.floor((area.h * 0.45 - ROW.h) / ROW.pitch) + 1
  const perCol = Math.max(0, Math.min(LIST_ROWS, want, fit))
  const n = Math.min(want, perCol * LIST_COLS)
  const h = n ? (perCol - 1) * ROW.pitch + ROW.h : 0
  const list = n ? { x: area.x, y: area.y + area.h - h, w: area.w, h } : null
  return { map: { x: area.x, y: area.y, w: area.w, h: area.h - legendH - h - (n ? LIST.above : 0) }, legendH, list, rows: n, perCol }
}

/**
 * The list's columns under a map drawn `mapW` wide, centred on `cx`: as wide as the map, or the area's whole width when
 * the map is narrower than two comfortable columns (LIST.colMin) with their gap. Each column's left edge and width.
 */
export function listColumns(area: Area, cx: number, mapW: number): { x: number; w: number }[] {
  const w = Math.min(area.w, mapW >= LIST_COLS * LIST.colMin + LIST.gap ? mapW : area.w)
  const x0 = Math.max(area.x, Math.min(area.x + area.w - w, cx - w / 2))
  const col = (w - (LIST_COLS - 1) * LIST.gap) / LIST_COLS
  return Array.from({ length: LIST_COLS }, (_, i) => ({ x: x0 + i * (col + LIST.gap), w: col }))
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
    const shade = (p: number) => mix(C.accent, C.paper, p)
    // The totals at the top right, as the tree image's (beside the title when both fit). None: the map takes their room.
    const group = viewTotals(ctx, card, full, totals)
    group.draw()
    const area: Area = { x: full.x, y: full.y + group.head, w: full.w, h: full.h - group.head }
    const L = mapImageLayout(area, top.length, max > 0)
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

    // The top places in two columns, down the left first: the flag (its slot kept when the set has none, so the names
    // line up) and the name (clipped), the count at the column's right edge, on one baseline.
    if (!L.list) return
    const listY = mapBottom + L.legendH + LIST.above
    const cols = listColumns(area, fit.x + mapW / 2, mapW)
    ctx.textBaseline = 'alphabetic'
    top.slice(0, L.rows).forEach((r, i) => {
      const { x, w } = cols[Math.floor(i / L.perCol)]
      const mid = listY + (i % L.perCol) * ROW.pitch + ROW.h / 2
      // The name's caps centred on the row's middle (caps 0.72 of the size).
      const base = mid + 0.36 * ROW.name
      const count = formatInt(r.count, t.num)
      ctx.font = card.fonts.mono(ROW.count)
      const cw = ctx.measureText(count).width
      ctx.fillStyle = C.muted
      ctx.textAlign = 'right'
      ctx.fillText(count, x + w, base)
      const flag = flags.get(r.value)
      if (flag) ctx.drawImage(flag, x, mid - FLAG.h / 2, FLAG.w, FLAG.h)
      ctx.font = card.fonts.lifer(ROW.name)
      ctx.fillStyle = C.ink
      ctx.textAlign = 'left'
      ctx.fillText(clipText(ctx, r.label, w - cw - 16 - FLAG.w - FLAG.gap), x + FLAG.w + FLAG.gap, base)
    })
  }, undefined, `${totals.map((x) => x.n + x.label).join('')}${minText}${maxText}${top.map((r) => `${r.label}${formatInt(r.count, t.num)}`).join('')}0123456789`)
}
