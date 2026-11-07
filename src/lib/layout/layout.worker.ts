// Layout worker: owns the sticker masks and runs packBest off the main thread.
//
// Protocol (structured-clone friendly):
//   main -> worker  { type: 'setList', id, entries: [{ code, mass, ord }] }
//                   { type: 'layout', id, key, codes, layout, mode, refBase?, fixedStage?, targets?, fit? }
//                   { type: 'image', id, entries: [{ code, mass, ord }], aspect, hole?, maxTile? }
//                                                             (share images; no setList needed)
//   worker -> main  { type: 'ready', id }                      (setList done: masks loaded)
//                   { type: 'result', id, key, layout, mode, base, W, H, codes, boxes }
//                   { type: 'image', id, W, H, codes, boxes }  (packFrame: these birds only, evened out, the hole
//                                                             (count-box.ts Hole) and maxTile as fractions of the frame's width)
//                   { type: 'error', id, message }
// `codes` in a result is the request's codes that the list knows, in request order; `boxes` is a flat
// Float32Array [x, y, w, h] * codes.length. `targets` (request) is a Float32Array [cx, cy] * codes.length,
// aligned with the request's `codes` (even-mode centres, used by true mode), in fixedStage's coordinates.
// `fit` (filtered states): the result's stage height is trimmed about the count (pack.ts fitStage), so W/H
// can be smaller than fixedStage. Relative sizes are always computed over the whole list (setList), per mode.
//
// Species without a mask (st:false in species.v1.json, drawn as a silhouette icon) get FALLBACK_MASK: a solid
// ellipse on a square 24 x 24 grid (aspect 1), so they pack as round blobs, and are sized by the outline they draw
// (OUTLINE_SHAPE, see relSizes), not by the ellipse.
import { EXP, EXP_TRUE, LAYOUTS, OUTLINE_SHAPE } from './constants'
import { decodeMask, MASK, type Mask } from './mask'
import { packBest, packFrame, relSizes, type PackBird } from './pack'
import type { Hole } from './count-box'

export type ListEntryMsg = { code: string; mass: number; ord: string }
export type LayoutName = 'wide' | 'medium' | 'narrow'
export type WorkerRequest =
  | { type: 'setList'; id: number; entries: ListEntryMsg[] }
  | {
      type: 'layout'; id: number; key: string; codes: string[]; layout: LayoutName; mode: 'even' | 'true'
      refBase?: number; fixedStage?: [number, number]; targets?: Float32Array; fit?: boolean
    }
  | { type: 'image'; id: number; entries: ListEntryMsg[]; aspect: number; hole?: Hole; maxTile?: number }
export type WorkerReply =
  | { type: 'ready'; id: number }
  | {
      type: 'result'; id: number; key: string; layout: LayoutName; mode: 'even' | 'true'
      base: number; W: number; H: number; codes: string[]; boxes: Float32Array
    }
  | { type: 'image'; id: number; W: number; H: number; codes: string[]; boxes: Float32Array }
  | { type: 'error'; id: number; message: string }

export type MaskTable = Record<string, [number, number, string]>
/** Loads one order's masks (code -> [w, h, base64 bits]). Injectable for tests. */
export type MaskLoader = (order: string) => Promise<MaskTable>

function ellipseMask(): Mask {
  const w = MASK, h = MASK
  const bits = new Uint8Array(Math.ceil((w * h) / 8))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - w / 2) / (w / 2), dy = (y + 0.5 - h / 2) / (h / 2)
      if (dx * dx + dy * dy <= 1) { const i = y * w + x; bits[i >> 3] |= 0x80 >> (i & 7) }
    }
  }
  return { w, h, bits }
}
export const FALLBACK_MASK: Mask = ellipseMask()

export const fetchOrderMasks: MaskLoader = async (order) => {
  const url = `/data/masks/${order}.v1.json`
  const origin = typeof self !== 'undefined' ? self.location?.origin : undefined
  const res = await fetch(origin && origin !== 'null' ? new URL(url, origin).href : url)
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`)
  return (await res.json()) as MaskTable
}

// rel: relative sizes over the whole list per mode (smallest bird of the list = 1), shared by every state.
type ListState = { ids: Map<string, number>; birds: Map<string, PackBird>; rel: { even: Map<number, number>; true: Map<number, number> } }

/** Each entry as a PackBird (id = its index), with its sticker mask or FALLBACK_MASK. */
export async function loadBirds(entries: ListEntryMsg[], load: MaskLoader): Promise<Map<string, PackBird>> {
  const orders = [...new Set(entries.map((e) => e.ord))]
  const tables = new Map<string, MaskTable>()
  // A failed order file must not poison the list: its species fall back to FALLBACK_MASK (ellipse blobs).
  await Promise.all(orders.map(async (o) => {
    try { tables.set(o, await load(o)) } catch (e) {
      console.warn(`layout worker: masks for ${o} unavailable, using fallback ellipses`, e)
      tables.set(o, {})
    }
  }))
  const birds = new Map<string, PackBird>()
  entries.forEach((e, i) => {
    const raw = tables.get(e.ord)?.[e.code]
    birds.set(e.code, raw ? { id: i, mass: e.mass, mask: decodeMask(raw) } : { id: i, mass: e.mass, mask: FALLBACK_MASK, shape: OUTLINE_SHAPE })
  })
  return birds
}

async function buildList(entries: ListEntryMsg[], load: MaskLoader): Promise<ListState> {
  const birds = await loadBirds(entries, load)
  const ids = new Map([...birds].map(([code, b]) => [code, b.id]))
  const all = [...birds.values()]
  return { ids, birds, rel: { even: relSizes(all, EXP), true: relSizes(all, EXP_TRUE) } }
}

/** The message handler, with mask loading injected. Messages must be handed over in arrival order. */
export function createLayoutHandler(loadOrder: MaskLoader = fetchOrderMasks) {
  let list: Promise<ListState> | null = null
  // Order files are fetched once per worker (a failure is not remembered, so it can be retried).
  const tables = new Map<string, Promise<MaskTable>>()
  const load: MaskLoader = (order) => {
    let p = tables.get(order)
    if (!p) {
      p = loadOrder(order)
      tables.set(order, p)
      p.catch(() => { if (tables.get(order) === p) tables.delete(order) })
    }
    return p
  }
  return async function handle(msg: WorkerRequest): Promise<WorkerReply> {
    try {
      if (msg.type === 'image') {
        const birds = await loadBirds(msg.entries, load)
        const codes = [...birds.keys()]
        const r = packFrame([...birds.values()], msg.aspect, { hole: msg.hole, maxTile: msg.maxTile })
        const boxes = new Float32Array(codes.length * 4)
        codes.forEach((c, i) => boxes.set(r.boxes.get(birds.get(c)!.id)!, i * 4))
        return { type: 'image', id: msg.id, W: r.W, H: r.H, codes, boxes }
      }
      if (msg.type === 'setList') {
        const p = buildList(msg.entries, load)
        list = p
        p.catch(() => {}) // surfaced to layout requests below
        await p
        return { type: 'ready', id: msg.id }
      }
      if (!list) throw new Error('layout requested before setList')
      const { birds, rel } = await list
      const known: string[] = []
      const pack: PackBird[] = []
      const centres: number[] = []
      msg.codes.forEach((c, i) => {
        const b = birds.get(c)
        if (!b) return
        known.push(c)
        pack.push(b)
        if (msg.targets) centres.push(msg.targets[2 * i], msg.targets[2 * i + 1])
      })
      const layout = LAYOUTS.find((l) => l.name === msg.layout)
      if (!layout) throw new Error(`unknown layout ${msg.layout}`)
      const targets = msg.targets ? new Map(pack.map((b, i) => [b.id, [centres[2 * i], centres[2 * i + 1]] as [number, number]])) : undefined
      const r = packBest(pack, layout, msg.mode, {
        targets, refBase: msg.refBase, fixedStage: msg.fixedStage, rel: rel[msg.mode], fit: msg.fit,
      })
      const boxes = new Float32Array(known.length * 4)
      pack.forEach((b, i) => boxes.set(r.boxes.get(b.id)!, i * 4))
      return { type: 'result', id: msg.id, key: msg.key, layout: msg.layout, mode: msg.mode, base: r.base, W: r.W, H: r.H, codes: known, boxes }
    } catch (e) {
      return { type: 'error', id: msg.id, message: e instanceof Error ? e.message : String(e) }
    }
  }
}

// Wire up only inside a real worker (importing this module elsewhere, e.g. in tests, has no side effects).
const scope = globalThis as unknown as {
  WorkerGlobalScope?: unknown
  postMessage(m: unknown, transfer?: Transferable[]): void
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null
}
if (typeof scope.WorkerGlobalScope !== 'undefined' && globalThis instanceof (scope.WorkerGlobalScope as typeof Object)) {
  const handle = createLayoutHandler()
  scope.onmessage = (e) => {
    void handle(e.data).then((r) => scope.postMessage(r, r.type === 'result' || r.type === 'image' ? [r.boxes.buffer] : []))
  }
}
