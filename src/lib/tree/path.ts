// The Tree view's open branch and the taxonomy filter (the chip row under the dock) are one path (Yusuf, 2026-11-20):
// the order and family the filter holds are the tree's open order and family, so picking a chip opens it in the tree
// and opening it in the tree picks the chip (the other views follow the filter, as always). What the filter cannot
// hold, a genus, or a family it would drop (the landing sample's index holds only its own birds), the tree keeps beside
// it (`TreeDeep`) for as long as the filter's order and family stay. Pure.
import type { Filter } from '@/lib/list/filters'

/** The branch the tree has open: an order, a family in it, a genus in that. */
export type OpenBranch = { ord?: string; fam?: string; genus?: string }
/** What the tree opens past the filter: `at` the filter's order and family it belongs to; `famName` the family's name
 *  as shown (the shown index may not have it). */
export type TreeDeep = { at: string; fam?: string; famName?: string; genus?: string }

const atOf = (f: Pick<Filter, 'order' | 'family'>): string => `${f.order ?? ''}|${f.family ?? ''}`

/** The branch the tree opens for `filter`, with what it keeps beside it while the filter's order and family stay. */
export function treeBranch(filter: Pick<Filter, 'order' | 'family'>, deep: TreeDeep | null): OpenBranch {
  const d = deep && deep.at === atOf(filter) ? deep : undefined
  const fam = filter.family ?? (filter.order ? d?.fam : undefined)
  return { ...(filter.order ? { ord: filter.order } : {}), ...(fam ? { fam } : {}), ...(fam && d?.genus ? { genus: d.genus } : {}) }
}

/**
 * Opening `b` in the tree: the filter with `b`'s order and family (the family only when `holds(ord, fam)`, as the
 * filter would keep it), its other fields unchanged, and what the tree keeps beside it (null: nothing).
 */
export function openBranch(filter: Filter, b: OpenBranch, holds: (ord: string, fam: string) => boolean, famName?: string): { filter: Filter; deep: TreeDeep | null } {
  const next: Filter = { ...filter }
  delete next.order
  delete next.family
  if (b.ord) next.order = b.ord
  const kept = !!(b.ord && b.fam && holds(b.ord, b.fam))
  if (kept) next.family = b.fam
  const fam = b.ord && b.fam && !kept ? b.fam : undefined
  const genus = b.fam ? b.genus : undefined
  if (!fam && !genus) return { filter: next, deep: null }
  return { filter: next, deep: { at: atOf(next), ...(fam ? { fam, ...(famName ? { famName } : {}) } : {}), ...(genus ? { genus } : {}) } }
}

/** Closing the tree's steps past `keep` of them (0: back to the filter's own last step; 1: keep a family the filter
 *  could not hold, close its genus). */
export function closeDeep(deep: TreeDeep | null, keep: number): TreeDeep | null {
  if (!deep || keep <= 0 || !deep.fam) return null
  return { at: deep.at, fam: deep.fam, ...(deep.famName ? { famName: deep.famName } : {}) }
}
