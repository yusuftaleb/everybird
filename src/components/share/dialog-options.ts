// Which rows the share dialog shows, by what it draws and whether it is Print. Pure, so it is tested on its own.
// The collage (from Collage or List) has the sticker options; the Tree and Map draw their own picture, in Share and in
// Print alike, so they show only what that drawing reads: the Tree its Arrangement (Fan, Radial or Rectangular: the
// dock's Layout), Show oldest lineage, Lifers only and Hide totals (and in Print, Down to: the screen's rank or the next
// one down, round 6), the Map Hide totals. Compare (Share only) draws its comparison card or wish list: What
// (Comparison | Wish list), Colours and Transparent background, nothing else.
// The Goal is Share's alone (posters never draw one). Export in batches is the collage's alone, with the same Split by
// in both, Number of birds first (Birds per image or per poster under it). optionRows puts them in the one list's order
// (round 6); treeOrientation is the Tree's rule for its image and poster: Fan horizontal, Rectangular and Radial vertical.
import type { BulkSplit } from '@/lib/share/bulk'
import type { FormatSlot, Orientation } from '@/lib/share/image'
import type { Theme } from '@/lib/theme'
import type { TreeLayout } from '@/lib/tree-mine'
import type { ViewKind } from '@/lib/view-resume'

export type Subject = 'collage' | 'tree' | 'map' | 'compare'

/** What Compare's dialog shares: the comparison card, or the wish list (the birds the viewer has yet to see). */
export type CompareWhat = 'comparison' | 'wish'
/** Compare's way into the dialog (subject 'compare'): it draws, the dialog shows, shares and downloads. */
export type CompareShare = {
  draw: (what: CompareWhat, o: { format: FormatSlot; theme: Theme; transparent: boolean }) => Promise<Blob>
  /** Changes whenever a drawing would (the lists, their names, the chosen group). */
  key: string
  /** Why the wish list can't be made (no list of the viewer's own, or every bird seen); unset when it can. */
  wishOff?: string
  /** The comparison link, or why there is none (over the link's limits). */
  link: { url: string } | { blocked: string }
  /** Each drawing's text alternative. */
  alt: Record<CompareWhat, string>
}

export const BULK_SPLITS: readonly BulkSplit[] = ['batches', 'family', 'order', 'country', 'continent', 'province', 'year']

/** What the dialog draws for the view it was opened in: the Tree's and the Map's own drawing, else the collage. */
export const subjectOf = (view: ViewKind | undefined): Subject => (view === 'tree' || view === 'map' ? view : 'collage')

export type DialogRows = {
  /** Compare's What: Comparison or Wish list. */
  what: boolean
  /** Fit or Oval. */
  arrangement: boolean
  count: boolean
  goal: boolean
  latest: boolean
  /** The Tree's: its layout (the dock's Layout menu) and Show oldest lineage. */
  treeLayout: boolean
  /** The Tree poster's Down to: the screen's rank or the next one down (the dialog hides it when the screen shows the species). */
  treeDepth: boolean
  oldest: boolean
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
    what: subject === 'compare',
    arrangement: collage,
    count: collage,
    goal: collage && !print,
    latest: collage,
    treeLayout: subject === 'tree',
    treeDepth: subject === 'tree' && print,
    oldest: subject === 'tree',
    names: collage && print,
    lifersOnly: subject === 'tree',
    hideTotals: subject === 'tree' || subject === 'map',
    bulk: collage,
    batchSize: collage,
    splits: collage ? BULK_SPLITS : [],
  }
}

/** One row of the options list. */
export type OptionRow = 'what' | 'size' | 'treeDepth' | 'arrangement' | 'treeLayout' | 'colours' | 'count' | 'latest' | 'names' | 'lifersOnly' | 'hideTotals' | 'oldest' | 'transparent' | 'goal'

/**
 * The options list, top to bottom (round 6, the maintainer's layout): Compare's What or Print's Poster size first (the
 * Tree poster's Down to under it), the choices
 * (Arrangement, Colours, Count), then the switches, Transparent background last of them, and Share's Goal at the end.
 * Show latest lifer is listed wherever the image can draw one; the dialog leaves it out when no bird in view has a date.
 */
export function optionRows(rows: DialogRows, print: boolean): OptionRow[] {
  const order: [OptionRow, boolean][] = [
    ['what', rows.what], ['size', print], ['treeDepth', rows.treeDepth], ['arrangement', rows.arrangement], ['treeLayout', rows.treeLayout], ['colours', true], ['count', rows.count],
    ['latest', rows.latest], ['names', rows.names], ['lifersOnly', rows.lifersOnly], ['hideTotals', rows.hideTotals], ['oldest', rows.oldest],
    ['transparent', true], ['goal', rows.goal],
  ]
  return order.filter(([, on]) => on).map(([r]) => r)
}

/** The one orientation a tree arrangement is drawn in (the maintainer's rule): a Fan is horizontal, Rectangular and Radial vertical. */
export const treeOrientation = (layout: TreeLayout): Orientation => (layout === 'fan' ? 'horizontal' : 'vertical')
