// The Tree view's share image (view-image.ts has the frame): the level on screen (levelView: the open branch with its
// tips at the rank the view shows, orders to start) in the collage's area, drawn as on screen: on the list in Ink, the
// rest in Line, rounded corners, every node a filled dot, a tip placed without genetic data dotted. A wide or square
// area (post, square, the horizontal images) draws the fan (fan.ts: the root at the centre, the tips on the arc, the age
// axis as rings); a tall one (the story) draws rows. The names of the tips with a bird on the list, as many as fit
// (keepNames), with their counts; the split-group mark after a row's name, or as the fan's tip. Under it, when there is
// room, the age axis, and a one-line key for the mark and the dotted line when the image has them. "Lifers only"
// (`at.mine`) as on screen; under the count, the orders, families and genera the birds cover (taxonCover); the footer
// credits the tree (TREE_FOOTER).
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { loadSpecies } from '@/lib/species/load'
import { familyName } from '@/lib/species/names'
import { drawFan, fanAngle, fanLabel, fanRing, keepNames, polar, type FanBox } from '@/lib/tree/fan'
import { loadTree } from '@/lib/tree/load'
import { levelView, ROW_H, taxonCover, tipOn, type TreeRow } from '@/lib/tree/levels'
import { ageTicks, drawTree, formatAge, type Drawing } from '@/lib/tree/tree'
import { TREE_FOOTER, clipText, renderViewImage, type Area, type ViewImageOpts } from './view-image'
import type { PreparedCard } from './image'

export { keepNames }

/** Name sizes (px): the largest, and the smallest still readable on a phone's view of the image. */
const NAME_MIN = 18, NAME_MAX = 30
/** A row is never drawn taller than this (a genus of three species would fill the card). */
const PITCH_MAX = 72
const AXIS_H = 44, KEY_H = 40, MONO = 18
/** The fan's names: their size, their room past the tips, and the gap before them. */
const FAN_NAME = 20, FAN_ROOM = 230, FAN_GAP = 14

type Tip = Exclude<TreeRow, { kind: 'order' }>

/** Whether an area this shape draws the fan: about as wide as it is tall, or wider. */
export const fanFits = (area: Pick<Area, 'w' | 'h'>): boolean => area.w >= area.h * 0.9

/** The fan in `area` with room for the names past the arc and `below` px under the centre: its centre and radius. */
export function imageFanBox(area: Area, below: number): FanBox {
  const out = FAN_GAP + FAN_ROOM
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
    const fan = !!view.root && fanFits(area)
    const axis = area.h >= 520 && tips.length > 0
    const bottom = (axis ? AXIS_H : 0) + KEY_H
    const branch = (d: string, on: boolean, dash: boolean) => {
      if (!d) return
      ctx.save()
      ctx.strokeStyle = on ? C.ink : C.line
      ctx.globalAlpha = on ? 1 : 0.55
      ctx.lineWidth = on ? 2.5 : 1.5
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      if (dash) ctx.setLineDash([3, 5])
      ctx.stroke(new Path2D(d))
      ctx.restore()
    }
    // The nodes' dots: Paper under the stroke (solid on a transparent image), so no line shows through.
    const nodes = (d: string, on: boolean) => {
      if (!d) return
      const p = new Path2D(d)
      ctx.save()
      ctx.fillStyle = card.transparent ? (on ? C.ink : C.line) : C.paper
      ctx.fill(p)
      ctx.strokeStyle = on ? C.ink : C.line
      ctx.globalAlpha = on ? 1 : 0.55
      ctx.lineWidth = on ? 2.5 : 1.5
      ctx.stroke(p)
      ctx.restore()
    }
    const paintDrawing = (d: Drawing) => {
      branch(d.unseen, false, false)
      branch(d.seen, true, false)
      branch(d.unseenDot, false, true)
      branch(d.seenDot, true, true)
      nodes(d.unseenNodes, false)
      nodes(d.seenNodes, true)
    }
    const countText = (r: Tip) => (r.kind === 'group' ? fmt(tt.tipOf, { n: formatInt(r.on, t.num), total: formatInt(r.total, t.num) }) : '')
    let marked = false
    let y: number
    let axisAt: (v: number) => number[]
    let axisY: number

    if (fan) {
      // The fan, centred in the area above the axis and the key; the ages under its centre.
      const box = imageFanBox(area, bottom)
      const d = drawFan(view.root!, tipOn(tips), view.stem, (_, i) => tips[i].dotted, box)
      ctx.save()
      ctx.strokeStyle = C.hairline
      ctx.lineWidth = 1.5
      for (const v of ageTicks(d.rootAge)) if (v > 0) ctx.stroke(new Path2D(fanRing(box, (1 - v / d.rootAge) * box.R)))
      ctx.restore()
      paintDrawing(d)
      const from = FAN_GAP
      const kept = keepNames(d.tips.map((p, i) => ({ y: p.a * (box.R + from), n: onOf(tips[i]) })), FAN_NAME * 1.2)
      ctx.textBaseline = 'middle'
      d.tips.forEach((p, i) => {
        const r = tips[i]
        const on = onOf(r) > 0
        if (r.kind === 'group' && r.with) {
          marked = true
          diamond(ctx, p.x, p.y, 7, on ? C.ink : C.line, card)
        }
        if (!kept.has(i)) return
        const l = fanLabel(box, fanAngle(i + 0.5, d.tips.length), from)
        ctx.save()
        ctx.translate(l.x, l.y)
        ctx.rotate((l.rot * Math.PI) / 180)
        const count = countText(r)
        ctx.font = font.footer(Math.round(FAN_NAME * 0.8))
        const cw = count ? ctx.measureText(count).width + 10 : 0
        ctx.font = font.lifer(FAN_NAME)
        const name = clipText(ctx, nameOf(r), FAN_ROOM - cw)
        const nw = ctx.measureText(name).width
        ctx.fillStyle = C.ink
        ctx.textAlign = 'left'
        ctx.fillText(name, l.flip ? -nw - cw : 0, 0)
        if (count) {
          ctx.font = font.footer(Math.round(FAN_NAME * 0.8))
          ctx.fillStyle = C.muted
          ctx.fillText(count, l.flip ? -cw + 10 : nw + 10, 0)
        }
        ctx.restore()
      })
      y = box.cy + 8
      axisY = y + 10
      axisAt = (v) => { const rr = (1 - v / d.rootAge) * box.R; return rr > 20 ? [polar(box, rr, 0)[0], polar(box, rr, Math.PI)[0]] : [box.cx] }
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
      }
      // Names: as large as the rows allow, never under NAME_MIN; when rows are closer, only those keepNames keeps.
      const size = Math.max(NAME_MIN, Math.min(NAME_MAX, Math.floor(ROW_H * k * 0.75)))
      const kept = keepNames(tips.map((r, i) => ({ y: ys[i], n: onOf(r) })), size * 1.15)
      ctx.textBaseline = 'middle'
      for (const i of kept) {
        const r = tips[i]
        let room = textW
        if (r.kind === 'group') {
          // The count on the list over the group's total, right-aligned, as on screen.
          const count = `${formatInt(r.on, t.num)} / ${formatInt(r.total, t.num)}`
          ctx.font = font.footer(Math.min(MONO, size))
          ctx.textAlign = 'right'
          ctx.fillStyle = C.muted
          ctx.fillText(count, area.x + area.w, ys[i])
          room -= ctx.measureText(count).width + 16
        }
        const mark = r.kind === 'group' && !!r.with
        ctx.font = font.lifer(size)
        ctx.textAlign = 'left'
        ctx.fillStyle = C.ink
        const name = clipText(ctx, nameOf(r), room - (mark ? size : 0))
        ctx.fillText(name, textX, ys[i])
        if (mark) {
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
      // The age axis: the ticks' ages (under the rows' hairline, or under the fan's centre), its title beside or under them.
      const rootAge = view.drawing.rootAge
      ctx.textBaseline = 'top'
      ctx.textAlign = 'center'
      for (const v of ageTicks(rootAge).filter((a) => a / rootAge <= 0.97 || a === 0)) for (const x of axisAt(v)) ctx.fillText(formatAge(v, t.num), x, axisY)
      if (fan) ctx.fillText(clipText(ctx, tt.axis, area.w), area.x + area.w / 2, axisY + MONO + 6)
      else {
        const textX = area.x + Math.round(area.w * 0.42) + 16
        ctx.textAlign = 'left'
        ctx.fillText(clipText(ctx, tt.axis, area.x + area.w - textX), textX, axisY)
      }
      y += AXIS_H + (fan ? MONO + 6 : 0)
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

/** The split-group mark: a diamond outline (the screen's rotated square); filled with Paper when `card` is given (a
 *  fan's tip, over its branch end). */
function diamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, card?: PreparedCard): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, cy - r)
  ctx.lineTo(cx + r, cy)
  ctx.lineTo(cx, cy + r)
  ctx.lineTo(cx - r, cy)
  ctx.closePath()
  if (card) {
    ctx.fillStyle = card.transparent ? color : card.colors.paper
    ctx.fill()
  }
  ctx.stroke()
  ctx.restore()
}
