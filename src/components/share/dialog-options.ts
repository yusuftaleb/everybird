// Which rows the share dialog shows, by what it draws and whether it is Print. Pure, so it is tested on its own.
// The collage (from Collage or List) has the sticker options; the Tree and Map draw their own picture, in Share and in
// Print alike, so they show only what that drawing reads: the Tree its Lifers only and Hide totals, the Map Hide totals.
// Export in batches is the collage's alone; in Share it has no Birds per image row, so its Split by leaves out Number of
// birds (one image of every bird would be the Download button again).
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
  /** Birds per poster, under Split by's Number of birds. */
  batchSize: boolean
  splits: readonly BulkSplit[]
}

export function dialogRows(subject: Subject, print: boolean): DialogRows {
  const collage = subject === 'collage'
  return {
    arrangement: collage,
    count: collage,
    goal: collage,
    latest: collage,
    names: collage && print,
    lifersOnly: subject === 'tree',
    hideTotals: !collage,
    bulk: collage,
    batchSize: collage && print,
    splits: !collage ? [] : print ? BULK_SPLITS : BULK_SPLITS.filter((s) => s !== 'batches'),
  }
}
