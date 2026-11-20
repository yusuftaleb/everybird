// The Tree view's share image (view-image.ts has the frame): the level on screen (levelView: the open branch with its
// tips at the rank the view shows, orders to start) in the collage's area, drawn as on screen: on the list in Ink, the
// rest in Line, rounded corners, branches simply joining, every tip one small hollow dot, a tip placed without genetic
// data dotted. A wide or square area (post, square, the horizontal images) draws the layout on screen (`at.layout`:
// the fan, the circle or rows; fan.ts for the first two: the root at the centre, the tips on the arc or all round, the
// age axis as rings); a tall one (the story) draws rows. The names of the tips with a bird on the list, as many as fit
// in full without touching (keepNames; a name is never cut), with their counts; the split-group mark after a name.
// Under it, when there is room, the age axis, and a one-line key for the mark and the dotted line when the image has
// them. "Lifers only" (`at.mine`) as on screen; under the count, the orders, families and genera the birds cover
// (taxonCover); the footer credits the tree (TREE_FOOTER).
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { loadSpecies } from '@/lib/species/load'
import { familyName } from '@/lib/species/names'
import { drawFan, fanLabel, fanRing, keepNames, ringLabels, type FanBox, type FanShape } from '@/lib/tree/fan'
import { loadTree } from '@/lib/tree/load'
import { levelView, ROW_H, taxonCover, tipOn, type TreeRow } from '@/lib/tree/levels'
import { ageTicks, circlePath, drawTree, formatAge, type Drawing } from '@/lib/tree/tree'
import { TREE_FOOTER, clipText, renderViewImage, type Area, type ViewImageOpts } from './view-image'

export { keepNames }

/** Name sizes (px): the largest, and the smallest still readable on a phone's view of the image. */
const NAME_MIN = 18, NAME_MAX = 30
/** A row is never drawn taller than this (a genus of three species would fill the card). */
const PITCH_MAX = 72
const AXIS_H = 44, KEY_H = 40, MONO = 18
/** The fan's names: their size, their room past the tips, and the gap before them. */
const FAN_NAME = 20, FAN_ROOM = 230, FAN_GAP = 14

type Tip = Exclude<TreeRow, { kind: 'order' }>

/** A tip's hollow dot (design units). */
const TIP_DOT = 5

/** Whether an area this shape draws the layout on screen: about as wide as it is tall, or wider (else rows). */
export const fanFits = (area: Pick<Area, 'w' | 'h'>): boolean => area.w >= area.h * 0.9

/** The fan or circle in `area` with room for the names past the tips and `below` px under it: its centre and radius. */
export function imageFanBox(area: Area, below: number, shape: FanShape = 'fan'): FanBox {
  const out = FAN_GAP + FAN_ROOM
  if (shape === 'circle') {
    const R = Math.max(40, Math.min(area.w / 2 - out, (area.h - below) / 2 - out))
    return { cx: area.x + area.w / 2, cy: area.y + (area.h - below) / 2, R, shape }
  }
  const R = Math.max(40, Math.min(area.w / 2 - out, area.h - out - below))
  return { cx: area.x + area.w / 2, cy: area.y + (area.h - below - (R + out)) / 2 + out + R, R }
}

export async function renderTreeImage(o: ViewImageOpts): Promise<Blob> {
  const { state, entries, at, t } = o
  const [{ tree }, all] = await Promise.all([loadTree(), loadSpecies()])
  const codes = new Set(entries.map((e) => e.code))
  const view = levelView(tree, all, at.tree ?? {}, codes, at.mine)
  if (!view) throw new Error('No tree to draw')
  const tt = t.collage.tree
  const cover = taxonCover(all.rows, codes)
  // "Hide totals" (the dialog's switch) keeps the species count and drops the orders, families and genera under it.
  const under = o.hideTotals ? undefined : (['orders', 'families', 'genera'] as const).map((k) => { const [n, total] = cover[k]; return plural(tt.cover[k], total, { n: formatInt(n, t.num), total: formatInt(total, t.num) }) })
  const rank = view.tips
  const nameOf = (r: Tip): string =>
    r.kind === 'species' ? (state.sci ? r.row.sci : o.nameOf?.(r.row) ?? r.row.com)
      : rank === 'genera' ? r.key
        : rank === 'orders' ? (state.sci ? r.row.ord : (t.orders as Record<string, string>)[r.row.ord] ?? r.row.ord)
          : state.sci ? r.row.fam : familyName(r.row)
  const tips = view.rows.filter((r): r is Tip => r.kind !== 'order')
  const onOf = (r: Tip) => (r.kind === 'species' ? Number(r.on) : r.on)
  const dotted = tips.some((r) => r.dotted)

  return renderViewImage(o, TREE_FOOTER, (ctx, card, area) => {
    const C = card.colors
    const font = card.fonts
    const shape: FanShape | 'rows' = view.root && fanFits(area) ? (at.layout === 'rows' ? 'rows' : at.layout ?? 'fan') : 'rows'
    const axis = area.h >= 520 && tips.length > 0
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
        const d = points.filter((_, i) => on(i) === want).map(([x, y]) => circlePath(x, y, TIP_DOT)).join('')
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
    const countText = (r: Tip) => (r.kind === 'group' ? fmt(tt.tipOf, { n: formatInt(r.on, t.num), total: formatInt(r.total, t.num) }) : '')
    const isMarked = (r: Tip) => r.kind === 'group' && !!r.with
    const tipIsOn = (i: number) => onOf(tips[i]) > 0
    let marked = false
    let y: number
    let axisAt: (v: number) => number[]
    let axisY: number

    if (shape !== 'rows') {
      // The fan or circle, centred in the area above the axis and the key.
      const box = imageFanBox(area, bottom, shape)
      const d = drawFan(view.root!, tipOn(tips), view.stem, (_, i) => tips[i].dotted, box)
      ctx.save()
      ctx.strokeStyle = C.hairline
      ctx.lineWidth = 1.5
      for (const v of ageTicks(d.rootAge)) if (v > 0) ctx.stroke(new Path2D(fanRing(box, (1 - v / d.rootAge) * box.R)))
      ctx.restore()
      paintDrawing(d)
      tipDots(d.tips.map((p) => [p.x, p.y]), tipIsOn)
      const from = FAN_GAP
      const countSize = Math.round(FAN_NAME * 0.8)
      // Each label's width (name, mark, count), so only names that fit in full are kept.
      const widths = tips.map((r) => {
        ctx.font = font.lifer(FAN_NAME)
        const nw = ctx.measureText(nameOf(r)).width
        ctx.font = font.footer(countSize)
        const c = countText(r)
        return nw + (isMarked(r) ? FAN_NAME * 0.8 : 0) + (c ? ctx.measureText(c).width + 10 : 0)
      })
      const at0 = box.R + from
      const kept = keepNames(d.tips.map((p, i) => ({ y: p.a * at0, n: onOf(tips[i]), w: widths[i] })), FAN_NAME * 1.2, FAN_ROOM, shape === 'circle' ? 2 * Math.PI * at0 : undefined)
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      d.tips.forEach((p, i) => {
        if (!kept.has(i)) return
        const r = tips[i]
        const l = fanLabel(box, p.a, from)
        ctx.save()
        ctx.translate(l.x, l.y)
        ctx.rotate((l.rot * Math.PI) / 180)
        const name = nameOf(r)
        ctx.font = font.lifer(FAN_NAME)
        const nw = ctx.measureText(name).width
        // On the left half the label ends at the tip and reads toward it.
        let x = l.flip ? -widths[i] : 0
        ctx.fillStyle = C.ink
        ctx.fillText(name, x, 0)
        x += nw
        if (isMarked(r)) {
          marked = true
          diamond(ctx, x + FAN_NAME * 0.4, 0, FAN_NAME * 0.22, C.ink)
          x += FAN_NAME * 0.8
        }
        const count = countText(r)
        if (count) {
          ctx.font = font.footer(countSize)
          ctx.fillStyle = C.muted
          ctx.fillText(count, x + 10, 0)
        }
        ctx.restore()
      })
      if (shape === 'circle') {
        // The ages on their rings where they cross the downward radius, on Paper; the axis's title under the circle.
        y = box.cy + box.R + FAN_GAP + FAN_ROOM
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
      const treeW = Math.round(area.w * 0.42)
      const textX = area.x + treeW + 16, textW = area.x + area.w - textX
      const ys = tips.map((r) => top + (r.top + ROW_H / 2) * k)
      // Branches in px about the area (round corners and dots stay round).
      if (view.root) {
        ctx.save()
        ctx.translate(area.x, 0)
        paintDrawing(drawTree(view.root, tipOn(tips), (i) => ys[i], view.stem, (_, i) => tips[i].dotted, treeW))
        ctx.restore()
        tipDots(ys.map((v) => [area.x + treeW, v]), tipIsOn)
      }
      // Names: as large as the rows allow, never under NAME_MIN; only those that fit in full beside their count and
      // do not touch another (keepNames).
      const size = Math.max(NAME_MIN, Math.min(NAME_MAX, Math.floor(ROW_H * k * 0.75)))
      const countOf = (r: Tip) => (r.kind === 'group' ? `${formatInt(r.on, t.num)} / ${formatInt(r.total, t.num)}` : '')
      const widths = tips.map((r) => {
        ctx.font = font.lifer(size)
        const nw = ctx.measureText(nameOf(r)).width
        ctx.font = font.footer(Math.min(MONO, size))
        const c = countOf(r)
        return nw + (isMarked(r) ? size : 0) + (c ? ctx.measureText(c).width + 16 : 0)
      })
      const kept = keepNames(tips.map((r, i) => ({ y: ys[i], n: onOf(r), w: widths[i] })), size * 1.15, textW)
      ctx.textBaseline = 'middle'
      for (const i of kept) {
        const r = tips[i]
        const count = countOf(r)
        if (count) {
          // The count on the list over the group's total, right-aligned, as on screen.
          ctx.font = font.footer(Math.min(MONO, size))
          ctx.textAlign = 'right'
          ctx.fillStyle = C.muted
          ctx.fillText(count, area.x + area.w, ys[i])
        }
        ctx.font = font.lifer(size)
        ctx.textAlign = 'left'
        ctx.fillStyle = C.ink
        const name = nameOf(r)
        ctx.fillText(name, textX, ys[i])
        if (isMarked(r)) {
          marked = true
          diamond(ctx, textX + ctx.measureText(name).width + size * 0.55, ys[i], size * 0.24, C.ink)
        }
      }
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
        const textX = area.x + Math.round(area.w * 0.42) + 16
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
  }, under, `${tips.map(nameOf).join('')}${tips.map((r) => r.kind === 'group' ? fmt(tt.tipOf, { n: formatInt(r.on, t.num), total: formatInt(r.total, t.num) }) : '').join('')}${tt.axis}${tt.keyMark}${tt.keyDotted}`)
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
