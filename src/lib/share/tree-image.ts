// The Tree view's share image (view-image.ts has the frame): the level on screen (levelView: every family, the open
// family's genera or the open genus's species) in the collage's area, its branches drawn as on screen (on the list in
// Ink, the rest in Line, a tip placed without genetic data dotted), and the names of the rows with a bird on the list,
// as many as fit (keepNames), the split-group mark after a name. Under it, when there is room, the age axis, and a
// one-line key for the mark and the dotted line when the image has them. "Only my birds" (`at.mine`) as on screen.
import { formatInt } from '@/i18n/format'
import { loadSpecies } from '@/lib/species/load'
import { familyName } from '@/lib/species/names'
import { loadTree } from '@/lib/tree/load'
import { levelView, ROW_H, type TreeRow } from '@/lib/tree/levels'
import { ageTicks, formatAge } from '@/lib/tree/tree'
import { clipText, renderViewImage, type ViewImageOpts } from './view-image'

/**
 * Which rows get their name: those with a bird on the list (`n` > 0), largest `n` first (the upper on a tie), each kept
 * unless its centre `y` would come within `h` (a name's height and its air) of a name already kept. Indexes into `rows`.
 */
export function keepNames(rows: readonly { y: number; n: number }[], h: number): Set<number> {
  const order = rows.map((_, i) => i).filter((i) => rows[i].n > 0).sort((a, b) => rows[b].n - rows[a].n || a - b)
  const kept: number[] = []
  for (const i of order) if (kept.every((j) => Math.abs(rows[j].y - rows[i].y) >= h)) kept.push(i)
  return new Set(kept)
}

/** Name sizes (px): the largest, and the smallest still readable on a phone's view of the image. */
const NAME_MAX = 30, NAME_MIN = 18
/** A row is never drawn taller than this (a genus of three species would fill the card). */
const PITCH_MAX = 72
const AXIS_H = 44, KEY_H = 40, MONO = 18

type Tip = Exclude<TreeRow, { kind: 'order' }>

export async function renderTreeImage(o: ViewImageOpts): Promise<Blob> {
  const { state, entries, at, t } = o
  const [{ tree }, all] = await Promise.all([loadTree(), loadSpecies()])
  const view = levelView(tree, all, at.tree ?? {}, new Set(entries.map((e) => e.code)), at.mine)
  if (!view) throw new Error('No tree to draw')
  const tt = t.collage.tree
  const nameOf = (r: Tip): string =>
    r.kind === 'species' ? (state.sci ? r.row.sci : o.nameOf?.(r.row) ?? r.row.com) : view.level.fam ? r.key : state.sci ? r.row.fam : familyName(r.row)
  const tips = view.rows.filter((r): r is Tip => r.kind !== 'order')
  const dotted = !!(view.drawing.seenDot || view.drawing.unseenDot)

  return renderViewImage(o, (ctx, card, area) => {
    const C = card.colors
    const font = card.fonts
    const axis = area.h >= 520 && tips.length > 0
    const bottom = (axis ? AXIS_H : 0) + KEY_H
    const k = Math.min((area.h - bottom) / view.height, PITCH_MAX / ROW_H)
    const bodyH = view.height * k
    const top = area.y + (area.h - bottom - bodyH) / 2
    const treeW = Math.round(area.w * 0.42)
    const textX = area.x + treeW + 16, textW = area.x + area.w - textX

    // Branches: the drawing is 1000 wide and view.height tall (row centres at top + ROW_H / 2).
    const m = new DOMMatrix([treeW / 1000, 0, 0, k, area.x, top])
    const branch = (d: string, on: boolean, dash: boolean) => {
      if (!d) return
      const p = new Path2D()
      p.addPath(new Path2D(d), m)
      ctx.save()
      ctx.strokeStyle = on ? C.ink : C.line
      ctx.globalAlpha = on ? 1 : 0.55
      ctx.lineWidth = on ? 2.5 : 1.5
      ctx.lineJoin = 'round'
      if (dash) ctx.setLineDash([3, 5])
      ctx.stroke(p)
      ctx.restore()
    }
    branch(view.drawing.unseen, false, false)
    branch(view.drawing.seen, true, false)
    branch(view.drawing.unseenDot, false, true)
    branch(view.drawing.seenDot, true, true)

    // Names: as large as the rows allow, never under NAME_MIN; when rows are closer, only those keepNames keeps.
    const size = Math.max(NAME_MIN, Math.min(NAME_MAX, Math.floor(ROW_H * k * 0.75)))
    const ys = tips.map((r) => top + (r.top + ROW_H / 2) * k)
    const kept = keepNames(tips.map((r, i) => ({ y: ys[i], n: r.kind === 'species' ? Number(r.on) : r.on })), size * 1.15)
    let marked = false
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

    let y = top + bodyH
    ctx.font = font.footer(MONO)
    ctx.fillStyle = C.muted
    if (axis) {
      // The age axis under the drawing: a hairline, the ticks' ages, its title beside them.
      const rootAge = view.drawing.rootAge
      ctx.fillStyle = C.hairline
      ctx.fillRect(area.x, y + 8, treeW, 2)
      ctx.fillStyle = C.muted
      ctx.textBaseline = 'top'
      ctx.textAlign = 'center'
      for (const v of ageTicks(rootAge).filter((a) => a / rootAge <= 0.97 || a === 0)) ctx.fillText(formatAge(v, t.num), area.x + (1 - v / rootAge) * treeW, y + 18)
      ctx.textAlign = 'left'
      ctx.fillText(clipText(ctx, tt.axis, textW), textX, y + 18)
      y += AXIS_H
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
  })
}

/** The split-group mark: a diamond outline (the screen's rotated square). */
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
