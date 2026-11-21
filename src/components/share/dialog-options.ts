// Which rows the share dialog shows, by what it draws and whether it is Print. Pure, so it is tested on its own.
// The collage (from Collage or List) has the sticker options; the Tree and Map draw their own picture, in Share and in
// Print alike, so they show only what that drawing reads: the Tree its Arrangement (Fan, Radial or Rectangular: the
// dock's Layout), Totals (species, genera, families and orders, each on or off), Show oldest lineage, Lifers only and Time scale (and
// in Print, Down to: the screen's rank or the next one down, round 6), the Map Totals (species and countries). Compare
// (Share only) draws its comparison card or wish list: What (Comparison | Wish list), Appearance and Transparent
// background, nothing else. dialogTitle names what is shared or printed: the collage, the map or the tree.
// The Goal is Share's alone (posters never draw one). Export in batches is the collage's alone, with the same Split by
// in both, Number of birds first (Birds per image or per poster under it). optionRows puts them in the one list's order
// (round 6); treeOrientation is the Tree's rule for its image and poster: Fan horizontal, Rectangular and Radial vertical.
import type { BulkSplit } from '@/lib/share/bulk'
import type { FormatSlot, Orientation } from '@/lib/share/image'
import type { Theme } from '@/lib/theme'
import type { TreeLayout } from '@/lib/tree-mine'
import type { ViewKind } from '@/lib/view-resume'
import type { TotalKey } from '@/lib/share/view-image'
import type { TreeLevel } from '@/lib/tree/levels'

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

/** The totals each view's image can draw on top, in its order (map-image.ts' MAP_TOTALS, tree-image.ts' TOTALS). */
export const VIEW_TOTALS: Record<'map' | 'tree', readonly TotalKey[]> = {
  map: ['species', 'countries'],
  tree: ['species', 'genera', 'families', 'orders'],
}

/**
 * The Tree's totals offered at its level (round 6): only the ranks at and below the scope. All birds: Species, Genera,
 * Families, Orders; inside an order: Species, Genera, Families; inside a family: Species, Genera; inside a genus: Species.
 */
export function treeTotals(level: TreeLevel | undefined): TotalKey[] {
  const all = VIEW_TOTALS.tree
  return [...all.slice(0, level?.genus ? 1 : level?.fam ? 2 : level?.ord ? 3 : all.length)]
}

/** `chosen` with `k` turned on or off, kept in `all`'s order. */
export const toggleTotal = (all: readonly TotalKey[], chosen: readonly TotalKey[], k: TotalKey): TotalKey[] =>
  all.filter((x) => (x === k ? !chosen.includes(k) : chosen.includes(x)))

/** The dialog's titles, from the UI strings (share.title, share.viewTitle, share.print.title and its viewTitle). */
type TitleStrings = { title: string; viewTitle: Record<'map' | 'tree', string>; print: { title: string; viewTitle: Record<'map' | 'tree', string> } }
/** The dialog's title: what it shares or prints, the collage (Collage and List), the map or the tree; Compare keeps `compareTitle`. */
export function dialogTitle(subject: Subject, print: boolean, s: TitleStrings, compareTitle: string): string {
  if (subject === 'compare') return compareTitle
  const set = print ? s.print : s
  return subject === 'collage' ? set.title : set.viewTitle[subject]
}

export const BULK_SPLITS: readonly BulkSplit[] = ['batches', 'family', 'order', 'country', 'continent', 'province', 'year']

/** What the dialog draws for the view it was opened in: the Tree's and the Map's own drawing, else the collage. */
export const subjectOf = (view: ViewKind | undefined): Subject => (view === 'tree' || view === 'map' ? view : 'collage')

export type DialogRows = {
  /** Compare's What: Comparison or Wish list. */
  what: boolean
  /** Fit, Oval or Free. */
  arrangement: boolean
  count: boolean
  goal: boolean
  latest: boolean
  /** The Tree's: its layout (the dock's Layout menu) and Show oldest lineage. */
  treeLayout: boolean
  /** The Tree poster's Down to: the screen's rank or the next one down (the dialog hides it when the screen shows the species). */
  treeDepth: boolean
  oldest: boolean
  /** The Tree's Time scale (the dock's switch): its ages, axis and rings, or the splits spaced evenly (round 6, item 12). */
  timeScale: boolean
  /** Show species names (the collage poster). */
  names: boolean
  lifersOnly: boolean
  /** The totals the image draws on top, each a chip of the Totals row (none: no row). */
  totals: readonly TotalKey[]
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
    timeScale: subject === 'tree',
    names: collage && print,
    lifersOnly: subject === 'tree',
    totals: subject === 'tree' || subject === 'map' ? VIEW_TOTALS[subject] : [],
    bulk: collage,
    batchSize: collage,
    splits: collage ? BULK_SPLITS : [],
  }
}

/** One row of the options list. */
export type OptionRow = 'what' | 'size' | 'treeDepth' | 'arrangement' | 'treeLayout' | 'colours' | 'count' | 'totals' | 'latest' | 'names' | 'lifersOnly' | 'timeScale' | 'oldest' | 'transparent' | 'goal'

/**
 * The options list, top to bottom (round 6, the maintainer's layout): Compare's What or Print's Poster size first (the
 * Tree poster's Down to under it), the choices
 * (Arrangement, Appearance, then Count or the views' Totals), then the switches, Transparent background last of them, and Share's Goal at the end.
 * Show latest lifer is listed wherever the image can draw one; the dialog leaves it out when no bird in view has a date.
 */
export function optionRows(rows: DialogRows, print: boolean): OptionRow[] {
  const order: [OptionRow, boolean][] = [
    ['what', rows.what], ['size', print], ['treeDepth', rows.treeDepth], ['arrangement', rows.arrangement], ['treeLayout', rows.treeLayout], ['colours', true], ['count', rows.count], ['totals', rows.totals.length > 0],
    ['latest', rows.latest], ['names', rows.names], ['lifersOnly', rows.lifersOnly], ['timeScale', rows.timeScale], ['oldest', rows.oldest],
    ['transparent', true], ['goal', rows.goal],
  ]
  return order.filter(([, on]) => on).map(([r]) => r)
}

/** The one orientation a tree arrangement is drawn in (the maintainer's rule): a Fan is horizontal, Rectangular and Radial vertical. */
export const treeOrientation = (layout: TreeLayout): Orientation => (layout === 'fan' ? 'horizontal' : 'vertical')
