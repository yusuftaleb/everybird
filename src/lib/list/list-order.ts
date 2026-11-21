// The List view's sort (the controls bar's Sort menu): taxonomic (ListView adds family headings), by lifer date either
// way (Newest first the default), or by body mass either way.
// Pure, so the store, the resumed view and ListView share one list of values and one comparison.
import type { SpeciesRow } from '../species/types'
import type { ListEntry } from './model'

/** In the menu's order. */
export const LIST_ORDERS = ['family', 'newest', 'oldest', 'heaviest', 'lightest'] as const
export type ListOrder = (typeof LIST_ORDERS)[number]
export const DEFAULT_LIST_ORDER: ListOrder = 'newest'

/** A carried value read back: a known order as it is (the old `heaviest` and `lightest` included), else the default. */
export const listOrderOf = (v: unknown): ListOrder => ((LIST_ORDERS as readonly unknown[]).includes(v) ? (v as ListOrder) : DEFAULT_LIST_ORDER)

type Item = { entry: ListEntry; row: SpeciesRow }

/** The comparison for `order`. Ties, and Family itself, fall back to taxonomic order (`row.to`). Dates are ISO
 *  ("YYYY", "YYYY-MM" or "YYYY-MM-DD"), compared as strings, so a partial date sorts as the start of its period; a bird
 *  with no date goes last in both directions. */
export function listCompare(order: ListOrder): (a: Item, b: Item) => number {
  const tax = (a: Item, b: Item) => a.row.to - b.row.to
  if (order === 'heaviest' || order === 'lightest') {
    const dir = order === 'heaviest' ? -1 : 1
    return (a, b) => dir * (a.row.g - b.row.g) || tax(a, b)
  }
  if (order === 'family') return tax
  const dir = order === 'newest' ? -1 : 1
  return (a, b) => {
    const x = a.entry.date, y = b.entry.date
    if (x !== y) {
      if (!x) return 1
      if (!y) return -1
      return dir * (x < y ? -1 : 1)
    }
    return tax(a, b)
  }
}
