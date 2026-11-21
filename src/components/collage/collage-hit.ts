// Silhouette hit-testing for the collage, as LifeList.tsx's hitMask: birds take no pointer events; the stage
// finds the topmost bird whose mask covers the pointer. Masks are the packer's (masks.v3.bin, every order in
// one file), fetched on the first pointer interaction (the browser cache shares them with the layout worker).
// Until a bird's mask is in, and for species without a sticker, the inscribed ellipse stands in.
import type { StateLayout } from '@/lib/layout/layout-client'
import { decodeMask, maskCell, type Mask } from '@/lib/layout/mask'
import { fetchAllMasks, masksInHand, type MaskTable } from '@/lib/data-url'

const orderFiles = new Map<string, Promise<MaskTable>>()
const decoded = new Map<string, Mask>()

function loadOrder(ord: string) {
  let p = orderFiles.get(ord)
  if (!p) {
    p = fetchAllMasks()
      .then((all) => all[ord] ?? {})
      .catch(() => ({}))
    orderFiles.set(ord, p)
  }
  return p
}

/**
 * Start loading the masks of these orders (once each); resolves when they are decoded. With `birds`, when every one's
 * mask is already on the page (the landing sample's pack, data-url.ts addMasks), those are decoded and nothing is fetched.
 */
export async function ensureMasks(orders: Iterable<string>, birds?: Iterable<{ code: string; ord: string }>): Promise<void> {
  const given = birds && masksInHand(birds)
  if (given) {
    for (const table of Object.values(given)) for (const [code, raw] of Object.entries(table)) if (!decoded.has(code)) decoded.set(code, decodeMask(raw))
    return
  }
  if (typeof fetch !== 'function') return
  await Promise.all([...new Set(orders)].map(async (o) => {
    const table = await loadOrder(o)
    for (const [code, raw] of Object.entries(table)) if (!decoded.has(code)) decoded.set(code, decodeMask(raw))
  }))
}

function covers(code: string, u: number, v: number): boolean {
  const m = decoded.get(code)
  if (!m) return (u - 0.5) ** 2 + (v - 0.5) ** 2 <= 0.25
  const cx = Math.min(m.w - 1, Math.max(0, Math.floor(u * m.w)))
  const cy = Math.min(m.h - 1, Math.max(0, Math.floor(v * m.h)))
  return maskCell(m, cx, cy)
}

/**
 * The bird under (px, py), in layout units. `top` lists every code topmost first (reverse draw order); `on` the shown ones.
 * With `slop` (layout units, touch), falls back to the nearest bird centre within that distance.
 */
export function birdAt(layout: StateLayout, top: string[], on: Set<string>, px: number, py: number, slop: number): string | null {
  for (const code of top) {
    if (!on.has(code)) continue
    const b = layout.boxes.get(code)
    if (!b) continue
    const [x, y, w, h] = b
    if (px < x || py < y || px > x + w || py > y + h) continue
    if (covers(code, (px - x) / w, (py - y) / h)) return code
  }
  if (!slop) return null
  let best: string | null = null, bd = slop
  for (const code of top) {
    if (!on.has(code)) continue
    const b = layout.boxes.get(code)
    if (!b) continue
    const d = Math.hypot(b[0] + b[2] / 2 - px, b[1] + b[3] / 2 - py)
    if (d < bd) { bd = d; best = code }
  }
  return best
}
