export type Source = 'ebird' | 'inat' | 'obsorg' | 'sheet' | 'scythebill' | 'igoterra' | 'manual'
/**
 * Where a source's records are kept in Saved.records. The two eBird files keep their own slots, so importing one
 * never replaces the other: 'ebird' holds the full MyEBirdData export (places down to the county), 'ebird-list' the
 * quick life list download (state or province only). Records in both carry source 'ebird'. observation.org uses
 * 'obsorg' for observations and 'obsorg-list' for its place-free species list; both carry source 'obsorg'.
 */
export type Slot = Source | 'ebird-list' | 'obsorg-list'
export const SLOTS: readonly Slot[] = ['ebird', 'ebird-list', 'inat', 'obsorg', 'obsorg-list', 'sheet', 'scythebill', 'igoterra', 'manual']
/** The source a slot's records come from. */
export const slotSource = (slot: Slot): Source => (slot === 'ebird-list' ? 'ebird' : slot === 'obsorg-list' ? 'obsorg' : slot)
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
  /**
   * Seen here (seen.ts): every place this source saw the species, each "date|region[|county]" with the earliest date
   * there. MyEBirdData, iNaturalist and observation.org observations; absent elsewhere (the lifer place then stands in).
   */
  seen?: string[]
  /** Per place: "YYYY-MM,YYYY-MM|region[|county]", sorted unique months (seen.ts). Absent on older saves. */
  seenMonths?: string[]
  /**
   * iNaturalist lumps some species eBird splits (willet, horned owl); the import picks one by a region rule
   * (inat-rules.ts). 'region': placed by where and when it was seen; 'default': the place could not tell.
   */
  assigned?: 'region' | 'default'
}
export type Unmatched = {
  source: Source
  /** The slot the row was imported into, when it differs from `source` ('ebird-list' or 'obsorg-list'). */
  slot?: Slot
  row: number
  sci?: string
  com?: string
  reason: 'no-match' | 'not-species'
  suggestion?: string
  /** First date and place of the row, so a row fixed by hand keeps them. */
  date?: string
  place?: Place
  /** Every place the name was seen (seen.ts encoding), so a row fixed by hand keeps its seen-here too. */
  seen?: string[]
  /** Per place: "YYYY-MM,YYYY-MM|region[|county]", sorted unique months (seen.ts). Absent on older saves. */
  seenMonths?: string[]
}
export type ImportResult = {
  records: SourceRecord[]
  unmatched: Unmatched[]
  skipped: number /* rows that are not countable species */
  /** Species the eBird life list marks not countable (escapees and the like): off the list whatever source has them. */
  notCountable?: string[]
  /** Data rows read from an eBird file (for "Your sources"); not stored with the records. */
  rows?: number
}
export type MarkKey = 'heard' | 'dead' | 'media'
export type Edits = {
  removed: string[]
  added: SourceRecord[]
  marks: Record<string, Partial<Record<MarkKey, boolean>>>
  fixes: Record<string, string> /* unmatchedKey(u) ("slot:row") -> eBird code, from fixing unmatched rows */
}
export type Rules = { hideHeard: boolean; hideDead: boolean; researchOnly: boolean }
export type ListEntry = {
  code: string; date?: string; place?: Place; heard: boolean; dead: boolean; media: boolean; sources: Source[]
  /** Set when every record of the species was assigned by an iNaturalist region rule (SourceRecord.assigned). */
  assigned?: 'region' | 'default'
}

export const EMPTY_EDITS: Edits = { removed: [], added: [], marks: {}, fixes: {} }
export const DEFAULT_RULES: Rules = { hideHeard: false, hideDead: false, researchOnly: false }

/** An unmatched row's key in edits.fixes: "slot:row" ("ebird:12", "ebird-list:12", "inat:3"). */
export const unmatchedKey = (u: Pick<Unmatched, 'source' | 'slot' | 'row'>): string => `${u.slot ?? u.source}:${u.row}`
