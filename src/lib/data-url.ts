// Where the app's data files come from. With NEXT_PUBLIC_DATA_BASE set (production and preview: the R2 bucket,
// https://stickers.yusuftaleb.com/data) a file is fetched by its content-hashed name (src/lib/data-files.ts,
// cached for a year), and /data/<name> on this deployment is the fallback when that fails (a preview whose data
// changed before an upload, an R2 outage). Unset (dev, the e2e servers, tests): /data/<name> only.
// Works in the layout worker too (relative URLs resolve against self.location).
import { DATA_FILES, type DataFile } from './data-files'

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
export async function fetchData<T>(name: DataFile, init?: RequestInit): Promise<T> {
  let last: unknown
  for (const url of dataUrls(name)) {
    try {
      const res = await (init ? fetch(absolute(url), init) : fetch(absolute(url)))
      if (res.ok) return (await res.json()) as T
      last = new Error(`Failed to load ${url}: ${res.status}`)
    } catch (e) {
      last = e
    }
  }
  throw last
}

export type MaskTable = Record<string, [number, number, string]>
let masksP: Promise<Record<string, MaskTable>> | null = null
/** Every order's masks, one request per page or worker (a failure is not cached). */
export function fetchAllMasks(): Promise<Record<string, MaskTable>> {
  masksP ??= fetchData<Record<string, MaskTable>>('masks.v2.json').catch((e) => {
    masksP = null
    throw e
  })
  return masksP
}
