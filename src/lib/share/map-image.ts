// The Map view's share image (view-image.ts has the frame): the map as on screen, the world or the open country's
// provinces (mapLayer), fitted whole in the collage's area, each place in its shade step (the five of map.css: Accent
// mixed into Surface), with the steps' ranges in a legend under it. No outline for checked places, no hover line.
import { formatInt } from '@/i18n/format'
import { clearPlaces, filterPlaceKeys, placeCounts } from '@/lib/list/filters'
import { loadMapCountries, loadMapProvinces, mapGroupOf, mapLayer, shadeRanges, shadeStep } from '@/lib/map/shapes'
import { MAP_FOOTER, clipText, fitBox, renderViewImage, type ViewImageOpts } from './view-image'

/** Accent's share of each step over Surface (map.css). */
const STEP_MIX = [0, 0.18, 0.34, 0.52, 0.72, 1]
const LEGEND = { swatch: 28, h: 18, gap: 10, between: 28, size: 20, above: 28 }

/** `a` mixed into `b` by `p` (sRGB, as CSS color-mix), both #rrggbb. */
function mix(a: string, b: string, p: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16)
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) * p + ch(b, i) * (1 - p)).toString(16).padStart(2, '0')).join('')}`
}

export async function renderMapImage(o: ViewImageOpts): Promise<Blob> {
  const { state, species, at, t } = o
  const [world, provinces] = await Promise.all([loadMapCountries(), mapGroupOf(at.place) !== undefined ? loadMapProvinces().catch(() => null) : null])
  // The Map view's counts (placeCountsFor): every place under the other filters.
  const counts = placeCounts(state.list, clearPlaces(state.filter), species, state.seen)
  const { layer, shapes } = mapLayer(world, provinces, counts, new Set(filterPlaceKeys(state.filter)), at.place)
  if (!layer) throw new Error('No map to draw')
  const max = shapes.reduce((m, s) => Math.max(m, s.n), 0)
  const ranges = shadeRanges(max)
  return renderViewImage(o, MAP_FOOTER, (ctx, card, area) => {
    const C = card.colors
    const legendH = ranges.length ? LEGEND.h + LEGEND.above : 0
    const box = fitBox(layer.w, layer.h, { ...area, h: area.h - legendH })
    ctx.save()
    ctx.translate(box.x, box.y)
    ctx.scale(box.s, box.s)
    ctx.strokeStyle = C.paper
    ctx.lineWidth = 1 / box.s
    ctx.lineJoin = 'round'
    for (const s of shapes) {
      const p = new Path2D(s.d)
      ctx.fillStyle = mix(C.accent, C.surface, STEP_MIX[shadeStep(s.n, max)])
      ctx.fill(p, 'evenodd')
      ctx.stroke(p)
    }
    ctx.restore()
    if (!ranges.length) return
    // The legend, under the map at the text's left edge: each step's swatch and its range, then the count's word.
    const items = ranges.map(([step, from, to]) => ({ color: mix(C.accent, C.surface, STEP_MIX[step]), text: from === to ? formatInt(from, t.num) : `${formatInt(from, t.num)}–${formatInt(to, t.num)}` }))
    const y = box.y + layer.h * box.s + LEGEND.above
    let size = LEGEND.size
    const width = () => {
      ctx.font = card.fonts.footer(size)
      return items.reduce((w, it) => w + LEGEND.swatch + LEGEND.gap + ctx.measureText(it.text).width + LEGEND.between, 0)
    }
    while (size > 14 && width() > area.w) size--
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    let x = area.x
    for (const it of items) {
      ctx.fillStyle = it.color
      ctx.beginPath()
      if (ctx.roundRect) ctx.roundRect(x, y, LEGEND.swatch, LEGEND.h, 4)
      else ctx.rect(x, y, LEGEND.swatch, LEGEND.h)
      ctx.fill()
      x += LEGEND.swatch + LEGEND.gap
      ctx.fillStyle = C.muted
      ctx.fillText(it.text, x, y + LEGEND.h / 2)
      x += ctx.measureText(it.text).width + LEGEND.between
    }
    const room = area.x + area.w - x
    if (room > 40) ctx.fillText(clipText(ctx, t.count.label, room), x, y + LEGEND.h / 2)
  }, undefined, t.count.label)
}
