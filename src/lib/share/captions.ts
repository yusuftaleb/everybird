import { touchesHole, type Hole } from '@/lib/layout/count-box'
import type { ListEntry } from '@/lib/list/model'
import type { SpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { CAPTION_CAPS, captionMinPx, type PrintSize } from './print'

export const CAPTION_LINE_HEIGHT = 1.2
export const CAPTION_GAP_RATIO = 0.35
export const CAPTION_PAD_X = 2

export type TextMeasurer = (px: number, text: string) => number

export type CaptionPlanEntry = { w: number; h: number; lines: string[] }

export type CaptionPlan =
  | { ok: true; fontPx: number; lineH: number; gap: number; maxLineW: number; byCode: Map<string, CaptionPlanEntry> }
  | { ok: false; reason: 'cap' | 'fit' }

export type CaptionBox = {
  code: string
  x: number
  y: number
  w: number
  h: number
  cx: number
  lines: string[]
  fontPx: number
  lineH: number
}

export type CaptionFitResult =
  | { ok: true; captions: CaptionBox[]; fontPx: number }
  | { ok: false; reason: 'cap' | 'fit' }

export type PlacedTile = { code: string; x: number; y: number; w: number; h: number }

export function defaultCaptionMeasure(px: number, text: string): number {
  return text.length * 0.56 * px
}

export function wrapCaption(text: string, maxW: number, measure: (s: string) => number): string[] | null {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (!clean) return null
  if (measure(clean) <= maxW) return [clean]

  let best: [string, string] | null = null
  let bestDiff = Infinity

  for (let i = 1; i < clean.length - 1; i++) {
    const ch = clean[i]
    let a: string
    let b: string
    if (ch === ' ') {
      a = clean.slice(0, i).trimEnd()
      b = clean.slice(i + 1).trimStart()
    } else if (ch === '-' || ch === '/') {
      a = clean.slice(0, i + 1)
      b = clean.slice(i + 1).trimStart()
    } else {
      continue
    }
    if (!a || !b) continue
    const wa = measure(a)
    const wb = measure(b)
    if (wa <= maxW && wb <= maxW) {
      const diff = Math.abs(wa - wb)
      if (diff < bestDiff) {
        bestDiff = diff
        best = [a, b]
      }
    }
  }
  return best
}

export function planCaptions(
  entries: ListEntry[],
  species: SpeciesIndex,
  printSize: PrintSize,
  collageW: number,
  nameOf?: (row: SpeciesRow) => string,
  measure: TextMeasurer = defaultCaptionMeasure,
): CaptionPlan {
  if (entries.length > CAPTION_CAPS[printSize]) return { ok: false, reason: 'cap' }
  const fontPx = captionMinPx(printSize)
  const lineH = fontPx * CAPTION_LINE_HEIGHT
  const gap = Math.max(3, fontPx * CAPTION_GAP_RATIO)
  const maxLineW = Math.min(collageW * 0.28, Math.max(fontPx * 14, collageW * 0.22))
  const byCode = new Map<string, CaptionPlanEntry>()
  const m = (s: string) => measure(fontPx, s)

  for (const e of entries) {
    const row = species.byCode.get(e.code)
    if (!row) continue
    const label = nameOf?.(row) ?? row.com
    const lines = wrapCaption(label, maxLineW, m)
    if (!lines) return { ok: false, reason: 'fit' }
    const textW = Math.max(...lines.map(m))
    byCode.set(e.code, { w: textW + 2 * CAPTION_PAD_X, h: gap + lines.length * lineH, lines })
  }
  return { ok: true, fontPx, lineH, gap, maxLineW, byCode }
}

function rectsOverlap(ax0: number, ay0: number, ax1: number, ay1: number, bx0: number, by0: number, bx1: number, by1: number): boolean {
  return ax0 < bx1 - 1e-6 && ax1 > bx0 + 1e-6 && ay0 < by1 - 1e-6 && ay1 > by0 + 1e-6
}

export function verifyAndPlaceCaptions(
  placed: PlacedTile[],
  collage: { x: number; y: number; w: number; h: number },
  holeCenter: { cx: number; cy: number },
  hole: Hole,
  plan: Extract<CaptionPlan, { ok: true }>,
): CaptionFitResult {
  const captions: CaptionBox[] = []
  for (const t of placed) {
    const p = plan.byCode.get(t.code)
    if (!p) continue
    const cx = t.x + t.w / 2
    const x = cx - p.w / 2
    const y = t.y + t.h + plan.gap
    const h = p.lines.length * plan.lineH
    const x1 = x + p.w
    const y1 = y + h

    if (x < collage.x - 1e-6 || x1 > collage.x + collage.w + 1e-6 || y < collage.y - 1e-6 || y1 > collage.y + collage.h + 1e-6) {
      return { ok: false, reason: 'fit' }
    }
    if (touchesHole([x - holeCenter.cx, y - holeCenter.cy, x1 - holeCenter.cx, y1 - holeCenter.cy], hole)) {
      return { ok: false, reason: 'fit' }
    }
    for (const o of placed) {
      if (rectsOverlap(x, y, x1, y1, o.x, o.y, o.x + o.w, o.y + o.h)) {
        return { ok: false, reason: 'fit' }
      }
    }
    for (const oc of captions) {
      if (rectsOverlap(x, y, x1, y1, oc.x, oc.y, oc.x + oc.w, oc.y + oc.h)) {
        return { ok: false, reason: 'fit' }
      }
    }
    captions.push({ code: t.code, x, y, w: p.w, h, cx, lines: p.lines, fontPx: plan.fontPx, lineH: plan.lineH })
  }
  return { ok: true, captions, fontPx: plan.fontPx }
}
