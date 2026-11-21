// The Map view's share image (view-image.ts has the frame): the whole world, whatever the view's zoom (the Map has no
// country or province levels since round 6), shaded by the birds the filters leave (mapCounts, the Places filter
// included) on the view's continuous scale (RAMP in shapes.ts), with the legend ramp under it, and the five countries
// with the most species beside it (wide areas) or under it, each with its flag, its count and a bar in its shade. On top,
// instead of the big count, two equal totals, the same size and weight as the tree image's: the species and the
// countries, each over its word ("Hide totals": the species alone). Hairline Paper borders on every shape. No outline,
// no tooltip.
import { plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { parsePlaceKey } from '@/lib/list/place-keys'
import { flagSrc } from '@/lib/flag'
import { countRange, loadMapCountries, mapCounts, mapRows, mapShapes, RAMP, shadeMix } from '@/lib/map/shapes'
import { MAP_FOOTER, clipText, fitBox, renderViewImage, type Area, type ViewImageOpts } from './view-image'

/** How many places the image lists. */
export const TOP_PLACES = 5
/** Design units: the legend (ramp height, text size, room above), one listed place (name and count, bar, row) and gaps. */
const LEGEND = { ramp: 12, size: 20, above: 24, rampMax: 360, gap: 14 }
const ROW = { name: 26, count: 22, bar: 6, h: 64, barTop: 40 }
const SIDE = { gap: 48, minW: 280, maxW: 460, share: 0.32, from: 1.2 }
const LIST_GAP = 40
/** The borders' width in design units: hairlines (the page's .5px). */
const STROKE = 0.6
/** The totals, as the tree image's: the largest number, the gap under the numbers and the labels, room before the map. */
const TOTAL_MAX = 56, TOTAL_GAP = 12, TOTALS_BELOW = 32
/** A listed country's flag (design units): flag-icons' 4:3, the Places filter's 18×13 at the names' scale, and its gap. */
const FLAG = { w: 30, h: 22, gap: 12 }

export type MapImageLayout = { map: Area; legendH: number; list: Area | null; rows: number; side: boolean }

/**
 * Where the map, its legend and the top places go in `area`: the list beside the map when the area is wide (at least
 * SIDE.from times as wide as tall), else under it; as many of `rows` places as fit (at most TOP_PLACES; under the map,
 * the list takes at most 45% of the area). The map is fitted whole in `map` (fitBox) with the legend under it; under the
 * map, the list's `y` is its lowest place (the painter moves the map, legend and list up together as one block).
 */
export function mapImageLayout(area: Area, rows: number, legend: boolean): MapImageLayout {
  const legendH = legend ? LEGEND.above + Math.max(LEGEND.ramp, LEGEND.size) : 0
  const want = Math.min(rows, TOP_PLACES)
  if (area.w >= area.h * SIDE.from && want > 0) {
    const listW = Math.min(SIDE.maxW, Math.max(SIDE.minW, area.w * SIDE.share))
    const n = Math.min(want, Math.floor(area.h / ROW.h))
    const listH = n * ROW.h
    const list = { x: area.x + area.w - listW, y: area.y + (area.h - listH) / 2, w: listW, h: listH }
    return { map: { x: area.x, y: area.y, w: area.w - listW - SIDE.gap, h: area.h - legendH }, legendH, list: n ? list : null, rows: n, side: true }
  }
  const n = Math.min(want, Math.floor((area.h * 0.45) / ROW.h))
  const listH = n ? n * ROW.h + LIST_GAP : 0
  const list = n ? { x: area.x, y: area.y + area.h - n * ROW.h, w: area.w, h: n * ROW.h } : null
  return { map: { x: area.x, y: area.y, w: area.w, h: area.h - legendH - listH }, legendH, list, rows: n, side: false }
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
  const totals = [
    { n: formatInt(entries.length, t.num), label: t.collage.tree.rank.species.toUpperCase() },
    ...(o.hideTotals || !rows.length ? [] : [{ n: formatInt(rows.length, t.num), label: t.places.head.country.toUpperCase() }]),
  ]
  const minText = formatInt(min, t.num)
  const maxText = plural(t.collage.stats.species, max, { n: formatInt(max, t.num) })
  return renderViewImage({ ...o, countSize: 'hide' }, MAP_FOOTER, (ctx, card, full) => {
    const C = card.colors
    const font = card.fonts
    const shade = (p: number) => mix(C.accent, C.paper, p)
    // The totals on top, as the tree image's: one number size for both (the largest that fits each in its half), in
    // Ink, its word under it in Muted capitals.
    const col = full.w / totals.length
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
    const headH = numCap + TOTAL_GAP + labelCap + TOTALS_BELOW
    const area: Area = { x: full.x, y: full.y + headH, w: full.w, h: full.h - headH }
    const L = mapImageLayout(area, top.length, max > 0)
    const fit = fitBox(box.w, box.h, L.map)
    // Under the map, the map, its legend and the list are one block, centred in the area.
    if (!L.side) fit.y = area.y + (L.map.h - box.h * fit.s) / 2
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
      const room = (L.side ? fit.x + box.w * fit.s : area.x + area.w) - fit.x
      const ramp = Math.max(0, Math.min(LEGEND.rampMax, room - lw - rw - 2 * LEGEND.gap))
      const x0 = L.side ? fit.x : area.x
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

    // The top places: the name (clipped), the count at the right edge, a bar in the place's shade, as long as its share of the most.
    if (!L.list) return
    const list = L.side ? L.list : { ...L.list, y: mapBottom + L.legendH + LIST_GAP }
    const most = top[0]?.count ?? 1
    top.slice(0, L.rows).forEach((r, i) => {
      const y = list.y + i * ROW.h
      const count = formatInt(r.count, t.num)
      ctx.font = card.fonts.mono(ROW.count)
      const cw = ctx.measureText(count).width
      ctx.fillStyle = C.muted
      ctx.textAlign = 'right'
      ctx.fillText(count, list.x + list.w, y + ROW.name / 2 + 4)
      // A country's flag before its name (its slot kept when the set has none, so the names line up).
      const fx = FLAG.w + FLAG.gap
      const flag = flags.get(r.value)
      if (flag) ctx.drawImage(flag, list.x, y + ROW.name / 2 + 4 - FLAG.h / 2, FLAG.w, FLAG.h)
      ctx.font = card.fonts.lifer(ROW.name)
      ctx.fillStyle = C.ink
      ctx.textAlign = 'left'
      ctx.fillText(clipText(ctx, r.label, list.w - cw - 16 - fx), list.x + fx, y + ROW.name / 2 + 4)
      ctx.fillStyle = shade(shadeMix(r.count, min, max) || RAMP.hi)
      ctx.beginPath()
      const w = Math.max(ROW.bar, (list.w * r.count) / most)
      if (ctx.roundRect) ctx.roundRect(list.x, y + ROW.barTop, w, ROW.bar, ROW.bar / 2)
      else ctx.rect(list.x, y + ROW.barTop, w, ROW.bar)
      ctx.fill()
    })
  }, undefined, `${totals.map((x) => x.n + x.label).join('')}${minText}${maxText}${top.map((r) => `${r.label}${formatInt(r.count, t.num)}`).join('')}0123456789`)
}
