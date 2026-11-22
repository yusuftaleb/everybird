import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createLayoutHandler, type MaskTable, type ListEntryMsg, type WorkerReply } from '../src/lib/layout/layout.worker'
import { decodeMask, maskCell, type Mask } from '../src/lib/layout/mask'
import { boxGap, type Box } from '../src/lib/layout/pack'
import { bulkImagePackSpec } from '../src/lib/share/bulk'
import { cardLayout, fitBox, fitPack, maxTileSide, packFromReply, type CountSize, type ImageFormat } from '../src/lib/share/image'
import type { Arrangement } from '../src/lib/arrangement'
import type { ListEntry } from '../src/lib/list/model'

// A batch export's image of N birds is arranged as well as a single share image of those N birds: one even group,
// centred in its area, filling it (round 6: 21-trogons.png, six birds loose, one alone at the top, off centre).
// Real masks and masses from public/data; no personal list.
const DATA = resolve(__dirname, '../public/data')
const TABLES: Record<string, MaskTable> = {}
let POOL: ListEntryMsg[] = []
const MASKS = new Map<string, Mask>()

beforeAll(() => {
  for (const f of readdirSync(resolve(DATA, 'masks')).sort()) TABLES[f.split('.')[0]] = JSON.parse(readFileSync(resolve(DATA, 'masks', f), 'utf8'))
  POOL = (JSON.parse(readFileSync(resolve(DATA, 'species.v1.json'), 'utf8')).species as { code: string; g: number; ord: string }[])
    .filter((s) => TABLES[s.ord]?.[s.code])
    .map((s) => ({ code: s.code, mass: s.g, ord: s.ord }))
  for (const e of POOL) MASKS.set(e.code, decodeMask(TABLES[e.ord][e.code] as Parameters<typeof decodeMask>[0]))
})

/** n birds: the trogons for six (the reported image), else an even stride through the taxonomy. */
function group(n: number): ListEntryMsg[] {
  if (n === 6) return POOL.filter((e) => e.ord === 'Trogoniformes').filter((_, i) => i % 6 === 0).slice(0, 6)
  const step = POOL.length / n
  return Array.from({ length: n }, (_, i) => POOL[Math.floor(i * step + step / 2)])
}

/** A sticker's silhouette edge as points in design units (the mask's set cells next to an unset one or the edge). */
function outline(code: string, [x, y, w, h]: Box): [number, number][] {
  const m = MASKS.get(code)!, pts: [number, number][] = []
  const on = (i: number, j: number) => i >= 0 && j >= 0 && i < m.w && j < m.h && maskCell(m, i, j)
  for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) {
    if (on(i, j) && !(on(i - 1, j) && on(i + 1, j) && on(i, j - 1) && on(i, j + 1))) pts.push([x + ((i + 0.5) * w) / m.w, y + ((j + 0.5) * h) / m.h])
  }
  return pts
}

type Metrics = { off: number; fill: number; gapRatio: number; median: number }
/**
 * off: the birds' bounding box's centre from the area's centre (design units). fill: the birds' box on the binding axis
 * (the larger of its width and height shares of the area). gapRatio: the widest gap from a bird to its nearest
 * neighbour's silhouette over the median of those gaps.
 */
function measure(codes: string[], boxes: Box[], area: { x: number; y: number; w: number; h: number }, count?: Box): Metrics {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y, w, h] of count ? [...boxes, count] : boxes) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h) }
  const off = Math.hypot((x0 + x1) / 2 - (area.x + area.w / 2), (y0 + y1) / 2 - (area.y + area.h / 2))
  const fill = Math.max((x1 - x0) / area.w, (y1 - y0) / area.h)
  if (boxes.length < 2) return { off, fill, gapRatio: 1, median: 0 }
  const lines = codes.map((c, i) => outline(c, boxes[i]))
  const near = boxes.map((b, i) => {
    const cands = boxes.map((o, j) => [j, boxGap(b, o)] as const).filter(([j]) => j !== i).sort((a, c) => a[1] - c[1]).slice(0, 8)
    let best = count ? Math.min(...lines[i].map(([px, py]) => boxGap([px, py, 0, 0], count))) : Infinity
    for (const [j] of cands) for (const [px, py] of lines[i]) for (const [qx, qy] of lines[j]) best = Math.min(best, Math.hypot(px - qx, py - qy))
    return best
  })
  const sorted = [...near].sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)]
  return { off, fill, gapRatio: Math.max(...near) / Math.max(median, 1), median }
}

async function batchImage(n: number, format: ImageFormat, arrangement: Arrangement, countSize: CountSize): Promise<Metrics> {
  const birds = group(n)
  const entries = birds as unknown as ListEntry[] // bulkImagePackSpec reads only the length
  const o = { format, name: 'My Birds', arrangement, latest: true, countSize }
  const spec = bulkImagePackSpec(entries, o)
  const handle = createLayoutHandler(async (ord) => TABLES[ord] ?? {})
  const reply = (await handle({ type: 'image', id: 1, entries: birds, aspect: spec.aspect, hole: spec.hole, maxTile: spec.maxTile, ...(spec.oval ? { oval: true } : {}), ...(spec.free ? { free: true } : {}) })) as WorkerReply
  const pack = packFromReply(reply)
  const L = cardLayout(format, { name: true, filter: true, latest: true, count: n, countSize })
  const fit = fitPack(pack, L.collage, maxTileSide(L.collage.w, L.maxTile, L.maxSide), undefined, L.count.hole)
  const codes = [...pack.boxes.keys()]
  // The count's text (design units about the frame's centre, grown with a short list): part of the group the birds ring.
  const h = L.count.hole, k = Math.max(1, fit.grow)
  const [l, t, r, b] = [Math.min(h.num[0], h.label[0]), h.num[1], Math.max(h.num[2], h.label[2]), h.label[3]].map((v) => v * k)
  const count: Box | undefined = L.count.size ? [fit.cx + l, fit.cy + t, r - l, b - t] : undefined
  return measure(codes, codes.map((c) => fitBox(fit, pack.boxes.get(c)!)), L.collage, count)
}

// Before the fix (round 6): groups of 2 to 24 birds sat 30 to 200 design units off their area's centre with the count beside
// the title (the trogons' story 132), and 5 to 100 off with it in the middle (one bird beside the count: 200 to 350), the
// fill on the binding axis held back by the far side. Now every group is centred; the fill is the area's but where the
// tile cap holds one to three birds at a sensible size (one bird: 0.55 to 0.8), and gaps are as even as before.
const SIZES = [1, 2, 3, 6, 12, 24, 60, 150, 500]
const minFill = (n: number) => (n === 1 ? 0.5 : n === 2 ? 0.65 : n < 60 ? 0.85 : 0.95)
// A small group is one snug cluster; from SMALL_GROUP (40) Fit spreads a list to the frame's walls (spreadEven), so
// its gaps vary more (the single image's look, unchanged).
const maxGap = (n: number) => (n < 40 ? 2 : 3.5)
describe('batch images are arranged as well as single ones (same spec, the same fit)', () => {
  for (const countSize of ['title', 'medium'] as CountSize[]) for (const format of ['story', 'post', 'square'] as ImageFormat[]) {
    it(`${format}, count ${countSize === 'title' ? 'beside the title' : 'in the middle'}: centred, filled, even, in Free, Fit and Oval`, async () => {
      for (const arr of ['free', 'packed', 'oval'] as Arrangement[]) for (const n of SIZES) {
        const m = await batchImage(n, format, arr, countSize)
        const at = `${arr}, ${n} birds`
        expect(m.off, at).toBeLessThan(2)
        expect(m.fill, at).toBeGreaterThan(minFill(n))
        expect(m.gapRatio, at).toBeLessThan(maxGap(n))
      }
    }, 120_000)
  }
})
