// Where the app's data files come from. With NEXT_PUBLIC_DATA_BASE set (production and preview: the R2 bucket,
// https://stickers.yusuftaleb.com/data) a file is fetched by its content-hashed name (src/lib/data-files.ts,
// cached for a year), and /data/<name> on this deployment is the fallback when that fails (a preview whose data
// changed before an upload, an R2 outage). Unset (dev, the e2e servers, tests): /data/<name> only.
// Works in the layout worker too (relative URLs resolve against self.location).
import { DATA_FILES, type DataFile } from './data-files'
import type { Mask, RawMask } from './layout/mask'
import { readMaskFile } from './layout/mask-file'

export const DATA_BASE = (process.env.NEXT_PUBLIC_DATA_BASE || '').replace(/\/+$/, '')

/** The URLs to try for a data file, in order. */
export function dataUrls(name: DataFile, base: string = DATA_BASE): string[] {
  const local = `/data/${name}`
  return base ? [`${base}/${DATA_FILES[name]}`, local] : [local]
}

function absolute(url: string): string {
  if (/^https?:/.test(url)) return url
  const origin = typeof self !== 'undefined' ? self.location?.origin : undefined
  return origin && origin !== 'null' ? new URL(url, origin).href : url
}

/** Fetch and parse a data file, trying each of dataUrls in turn; throws the last failure. */
export function fetchData<T>(name: DataFile, init?: RequestInit): Promise<T> {
  return fetchFirst(name, init, (res) => res.json() as Promise<T>)
}

/** A binary data file's bytes, as fetchData. */
export function fetchDataBytes(name: DataFile, init?: RequestInit): Promise<ArrayBuffer> {
  return fetchFirst(name, init, (res) => res.arrayBuffer())
}

async function fetchFirst<T>(name: DataFile, init: RequestInit | undefined, read: (res: Response) => Promise<T>): Promise<T> {
  let last: unknown
  for (const url of dataUrls(name)) {
    try {
      const res = await (init ? fetch(absolute(url), init) : fetch(absolute(url)))
      if (res.ok) return await read(res)
      last = new Error(`Failed to load ${url}: ${res.status}`)
    } catch (e) {
      last = e
    }
  }
  throw last
}

/** One order's masks by code: decoded (masks.v3.bin) or as JSON holds them (the sample pack's); decodeMask takes both. */
export type MaskTable = Record<string, RawMask | Mask>

const inHand: Record<string, MaskTable> = {}
/** Masks already on the page without the masks file (the landing sample's, from its pack), by order then code. */
export function addMasks(tables: Record<string, MaskTable>): void {
  for (const [ord, t] of Object.entries(tables)) inHand[ord] = { ...inHand[ord], ...t }
}
/** These birds' masks by order when every one is in hand (addMasks), else undefined: then the masks file is needed. */
export function masksInHand(birds: Iterable<{ code: string; ord: string }>): Record<string, MaskTable> | undefined {
  const out: Record<string, MaskTable> = {}
  for (const { code, ord } of birds) {
    const m = inHand[ord]?.[code]
    if (!m) return undefined
    ;(out[ord] ??= {})[code] = m
  }
  return out
}
let masksP: Promise<Record<string, MaskTable>> | null = null
/** Every order's masks (masks.v3.bin, decoded), one request per page or worker (a failure is not cached). */
export function fetchAllMasks(): Promise<Record<string, MaskTable>> {
  masksP ??= fetchDataBytes('masks.v3.bin').then(readMaskFile).catch((e) => {
    masksP = null
    throw e
  })
  return masksP
}
