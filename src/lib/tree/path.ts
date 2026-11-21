// The Tree view's open branch and the taxonomy filter (the chip row under the dock) are one path (Yusuf, 2026-11-20):
// the order, family and genus the filter holds (round 6: the genus is a filter too) are the tree's open order, family
// and genus, so picking a chip opens it in the tree and opening it in the tree picks the chip (the other views follow
// the filter, as always). What the filter cannot hold, a family or genus the shown index lacks (the landing sample's
// index holds only its own birds), the tree keeps beside it (`TreeDeep`) for as long as the filter's taxonomy stays. Pure.
import type { Filter } from '@/lib/list/filters'

/** The branch the tree has open: an order, a family in it, a genus in that; `with`, opening a marked row, the other
 *  groups its branch holds at its deepest rank (the filter's `with`, so every view shows the branch's birds). */
export type OpenBranch = { ord?: string; fam?: string; genus?: string; with?: readonly string[] }
/** What the tree opens past the filter: `at` the filter's order, family and genus it belongs to; `famName` the family's
 *  name as shown (the shown index may not have it). */
export type TreeDeep = { at: string; fam?: string; famName?: string; genus?: string }

type Taxa = Pick<Filter, 'order' | 'family' | 'genus'>
const deepestOf = (b: OpenBranch) => (b.genus ? 'genus' : b.fam ? 'family' : b.ord ? 'order' : undefined)
const atOf = (f: Taxa): string => `${f.order ?? ''}|${f.family ?? ''}|${f.genus ?? ''}`

/** The branch the tree opens for `filter`, with what it keeps beside it while the filter's taxonomy stays. */
export function treeBranch(filter: Taxa, deep: TreeDeep | null): OpenBranch {
  const d = deep && deep.at === atOf(filter) ? deep : undefined
  const fam = filter.family ?? (filter.order ? d?.fam : undefined)
  const genus = filter.genus ?? (fam ? d?.genus : undefined)
  return { ...(filter.order ? { ord: filter.order } : {}), ...(fam ? { fam } : {}), ...(genus ? { genus } : {}) }
}

/**
 * Opening `b` in the tree: the filter with `b`'s order, family and genus (each only while `holds` says the filter would
 * keep it, with the steps above it) and `b.with` when its deepest step is kept, its other fields unchanged, and what the
 * tree keeps beside it (null: nothing).
 */
export function openBranch(filter: Filter, b: OpenBranch, holds: (ord: string, fam: string, genus?: string) => boolean, famName?: string): { filter: Filter; deep: TreeDeep | null } {
  const next: Filter = { ...filter }
  delete next.order
  delete next.family
  delete next.genus
  delete next.with
  if (b.ord) next.order = b.ord
  const famKept = !!(b.ord && b.fam && holds(b.ord, b.fam))
  if (famKept) next.family = b.fam
  const genusKept = famKept && !!b.genus && holds(b.ord!, b.fam!, b.genus)
  if (genusKept) next.genus = b.genus
  const kept = genusKept ? 'genus' : famKept ? 'family' : b.ord ? 'order' : undefined
  if (b.with?.length && kept && kept === deepestOf(b)) next.with = [...b.with].sort()
  const fam = b.ord && b.fam && !famKept ? b.fam : undefined
  const genus = b.fam && b.genus && !genusKept ? b.genus : undefined
  if (!fam && !genus) return { filter: next, deep: null }
  return { filter: next, deep: { at: atOf(next), ...(fam ? { fam, ...(famName ? { famName } : {}) } : {}), ...(genus ? { genus } : {}) } }
}

/** Closing the tree's steps past `keep` of them (0: back to the filter's own last step; 1: keep a family the filter
 *  could not hold, close its genus). */
export function closeDeep(deep: TreeDeep | null, keep: number): TreeDeep | null {
  if (!deep || keep <= 0 || !deep.fam) return null
  return { at: deep.at, fam: deep.fam, ...(deep.famName ? { famName: deep.famName } : {}) }
}
