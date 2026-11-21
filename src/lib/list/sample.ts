import type { Place, SourceRecord } from './model'
import { emptySaved, type Saved } from './storage'

/** public/data/sample.v1.json (scripts/build-data/build-sample.ts): code, first month and region only. */
export type SampleFile = { v: 1; note?: string; birds: { code: string; date?: string; place?: Place }[] }

export function sampleToSaved(f: SampleFile): Saved {
  const s = emptySaved()
  s.records.ebird = f.birds.map((b): SourceRecord => ({ ...b, source: 'ebird' }))
  return s
}
