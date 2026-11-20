// Which rows the share dialog shows, by what it draws and whether it is Print. Pure, so it is tested on its own.
// The collage (from Collage or List) has the sticker options; the Tree and Map draw their own picture, in Share and in
// Print alike, so they show only what that drawing reads: the Tree its Lifers only and Hide totals, the Map Hide totals.
// The Goal is Share's alone (posters never draw one). Export in batches is the collage's alone, with the same Split by
// in both, Number of birds first (Birds per image or per poster under it).
import type { BulkSplit } from '@/lib/share/bulk'
import type { ViewKind } from '@/lib/view-resume'

export type Subject = 'collage' | 'tree' | 'map'

export const BULK_SPLITS: readonly BulkSplit[] = ['batches', 'family', 'order', 'country', 'continent', 'province', 'year']

/** What the dialog draws for the view it was opened in: the Tree's and the Map's own drawing, else the collage. */
export const subjectOf = (view: ViewKind | undefined): Subject => (view === 'tree' || view === 'map' ? view : 'collage')

export type DialogRows = {
  /** Fit or Oval. */
  arrangement: boolean
  count: boolean
  goal: boolean
  latest: boolean
  /** Show species names (the collage poster). */
  names: boolean
  lifersOnly: boolean
  hideTotals: boolean
  /** Export in batches. */
  bulk: boolean
  /** Birds per image (per poster in Print), under Split by's Number of birds. */
  batchSize: boolean
  splits: readonly BulkSplit[]
}

export function dialogRows(subject: Subject, print: boolean): DialogRows {
  const collage = subject === 'collage'
  return {
    arrangement: collage,
    count: collage,
    goal: collage && !print,
    latest: collage,
    names: collage && print,
    lifersOnly: subject === 'tree',
    hideTotals: !collage,
    bulk: collage,
    batchSize: collage,
    splits: collage ? BULK_SPLITS : [],
  }
}
