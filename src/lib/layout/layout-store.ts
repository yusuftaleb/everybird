// The device's layout cache: finished collages the birder has seen (their full collage per layout class, mode and
// arrangement, and recent filter states), in IndexedDB database 'everybird-layouts', so a repeat visit shows a big
// list's collage at once instead of packing it again. It never leaves the browser, like the list it is made from, and
// Forget clears it with the list (storage.ts forget).
//
// Records (idb-keyval, one object store): `l:<id>` the layout, `m:<id>` its { at, bytes } for the LRU, kept apart so
// pruning reads only the small ones. At most MAX_ENTRIES and MAX_BYTES; the least recently used go first. The id
// (layout-client.ts) covers everything that changes a layout, so any change is a miss, never a stale hit.
//
// Every failure is a miss or a no-op (private mode, a blocked or broken database): the collage then packs as before.
import { clear, createStore, delMany, get, getMany, keys, set, setMany, type UseStore } from 'idb-keyval'
import type { StateLayout } from './layout-client'
import type { Box } from './pack'

export const LAYOUT_DB = 'everybird-layouts'
export const MAX_ENTRIES = 20
export const MAX_BYTES = 4_000_000
/** A read slower than this is a miss: a hung database open (it happens in private windows) never holds the collage up. */
export const READ_MS = 500

type Stored = Omit<StateLayout, 'boxes'> & { codes: string; boxes: Float32Array }
type Meta = { at: number; bytes: number }

export type LayoutStore = {
  get(id: string): Promise<StateLayout | undefined>
  /** Best effort, in the background. */
  put(id: string, layout: StateLayout): void
}

/** A short, stable hash of a long string (cyrb53, base 36), for the list's part of an id. */
export function hashText(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

function toStored(l: StateLayout): Stored {
  const codes = [...l.boxes.keys()]
  const boxes = new Float32Array(codes.length * 4)
  codes.forEach((c, i) => boxes.set(l.boxes.get(c)!, i * 4))
  return { key: l.key, layout: l.layout, mode: l.mode, W: l.W, H: l.H, scale: l.scale, base: l.base, codes: codes.join('\n'), boxes }
}

function fromStored(s: Stored): StateLayout | undefined {
  const codes = s.codes ? s.codes.split('\n') : []
  if (!(s.boxes instanceof Float32Array) || s.boxes.length !== codes.length * 4) return undefined
  const boxes = new Map<string, Box>()
  codes.forEach((c, i) => boxes.set(c, [s.boxes[4 * i], s.boxes[4 * i + 1], s.boxes[4 * i + 2], s.boxes[4 * i + 3]]))
  return { key: s.key, layout: s.layout, mode: s.mode, W: s.W, H: s.H, boxes, scale: s.scale, base: s.base }
}

let store: UseStore | null = null
let broken = false
function db(): UseStore | null {
  if (broken || typeof indexedDB === 'undefined') return null
  try {
    return (store ??= createStore(LAYOUT_DB, 'kv'))
  } catch {
    broken = true
    return null
  }
}
const fail = () => { broken = true; store = null }

async function prune(s: UseStore): Promise<void> {
  const all = (await keys(s)) as string[]
  const metaKeys = all.filter((k) => k.startsWith('m:'))
  const metas = (await getMany(metaKeys, s)) as (Meta | undefined)[]
  const ranked = metaKeys.map((k, i) => ({ id: k.slice(2), m: metas[i] })).sort((a, b) => (b.m?.at ?? 0) - (a.m?.at ?? 0))
  const keep = new Set<string>()
  let bytes = 0
  for (const { id, m } of ranked) {
    if (!m || keep.size >= MAX_ENTRIES || bytes + m.bytes > MAX_BYTES) continue
    keep.add(id)
    bytes += m.bytes
  }
  // Everything else goes, layouts whose meta another tab's prune removed too.
  const drop = all.filter((k) => !keep.has(k.slice(2)))
  if (drop.length) await delMany(drop, s)
}

/** The layout cache, or one that misses and drops everything when IndexedDB isn't there. */
export function layoutStore(): LayoutStore {
  return {
    async get(id) {
      const s = db()
      if (!s) return undefined
      let timer: number | undefined
      try {
        const raw = await Promise.race([
          get<Stored>(`l:${id}`, s),
          new Promise<undefined>((r) => { timer = setTimeout(r, READ_MS) as unknown as number }),
        ])
        const got = raw ? fromStored(raw) : undefined
        if (got) void set(`m:${id}`, { at: Date.now(), bytes: raw!.boxes.byteLength + raw!.codes.length } satisfies Meta, s).catch(() => {})
        return got
      } catch {
        fail()
        return undefined
      } finally {
        clearTimeout(timer)
      }
    },
    put(id, layout) {
      const s = db()
      if (!s) return
      const rec = toStored(layout)
      const meta: Meta = { at: Date.now(), bytes: rec.boxes.byteLength + rec.codes.length }
      if (meta.bytes > MAX_BYTES) return
      void setMany([[`l:${id}`, rec], [`m:${id}`, meta]], s).then(() => prune(s)).catch(fail)
    },
  }
}

/** Forget: drops every stored layout. Rejects when the database exists but can't be cleared. */
export async function clearLayouts(): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  await clear((store ??= createStore(LAYOUT_DB, 'kv')))
}
