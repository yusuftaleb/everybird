import type { Place, SourceRecord } from './model'
import { emptySaved, type Saved } from './storage'

/** public/data/sample.v1.json (scripts/build-data/build-sample.ts): code, first month and region only. */
export type SampleFile = { v: 1; note?: string; birds: { code: string; date?: string; place?: Place }[] }

const SAMPLE_URL = '/data/sample.v1.json'
let sampleP: Promise<Saved> | null = null

/** The landing demo's list as a Saved, ready for the store's 'restore'. Fetched once; a failure is not cached. */
export function loadSample(): Promise<Saved> {
  if (sampleP) return sampleP
  const p = (async () => {
    const res = await fetch(SAMPLE_URL)
    if (!res.ok) throw new Error(`Failed to load ${SAMPLE_URL}: ${res.status}`)
    return sampleToSaved((await res.json()) as SampleFile)
  })().catch((e) => {
    sampleP = null
    throw e
  })
  sampleP = p
  return p
}

export function sampleToSaved(f: SampleFile): Saved {
  const s = emptySaved()
  s.records.ebird = f.birds.map((b): SourceRecord => ({ ...b, source: 'ebird' }))
  return s
}
