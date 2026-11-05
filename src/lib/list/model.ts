export type Source = 'ebird' | 'inat' | 'manual'
export type Place = { country?: string /* ISO2 */; sub1?: string /* "CA-BC" */; sub2?: string /* "Okanagan-Similkameen" */ }
export type SourceRecord = {
  code: string
  source: Source
  date?: string /* YYYY-MM-DD | YYYY-MM | YYYY */
  place?: Place
  heard?: boolean
  dead?: boolean
  media?: boolean
  research?: boolean
}
export type Unmatched = {
  source: Source
  row: number
  sci?: string
  com?: string
  reason: 'no-match' | 'not-species'
  suggestion?: string
  /** First date and place of the row, so a row fixed by hand keeps them. */
  date?: string
  place?: Place
}
export type ImportResult = { records: SourceRecord[]; unmatched: Unmatched[]; skipped: number /* rows that are not countable species */ }
export type MarkKey = 'heard' | 'dead' | 'media'
export type Edits = {
  removed: string[]
  added: SourceRecord[]
  marks: Record<string, Partial<Record<MarkKey, boolean>>>
  fixes: Record<string, string> /* "source:row" -> eBird code, from fixing unmatched rows */
}
export type Rules = { hideHeard: boolean; hideDead: boolean; researchOnly: boolean }
export type ListEntry = { code: string; date?: string; place?: Place; heard: boolean; dead: boolean; media: boolean; sources: Source[] }

export const EMPTY_EDITS: Edits = { removed: [], added: [], marks: {}, fixes: {} }
export const DEFAULT_RULES: Rules = { hideHeard: false, hideDead: false, researchOnly: false }
