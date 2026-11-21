// Add by hand, the pure parts: which species the search shows, the levels of the list that opens in place (orders,
// families, genera, then a genus's species), and how a bird added or taken off lands in the edits.
import { nameTier, searchKey } from '@/lib/species/name-search'
import type { SpeciesRow } from '@/lib/species/types'
import type { Edits, Place, SourceRecord } from './model'

/** A group in the list: [] all birds, [order], [order, family] or [order, family, genus] (scientific names). */
export type TaxonPath = readonly string[]

/** A species' genus: the first word of its scientific name. */
export const genusOf = (sci: string): string => sci.split(' ', 1)[0]
const keyAt = (r: SpeciesRow, depth: number): string => (depth === 0 ? r.ord : depth === 1 ? r.fam : genusOf(r.sci))

/** Whether the species is inside the group `path` names. */
export const inTaxon = (r: SpeciesRow, path: TaxonPath): boolean => path.every((k, d) => keyAt(r, d) === k)

/** One group of the list: its id (the scientific name), its species count and its first species in taxonomic order (for its names). */
export type TaxonGroup = { id: string; n: number; first: SpeciesRow }

/**
 * The groups one level under `path` (the orders, an order's families, a family's genera; none under a genus), in
 * taxonomic order (by each one's first species), with their species counts and first species.
 */
export function taxonChildren(rows: readonly SpeciesRow[], path: TaxonPath): TaxonGroup[] {
  if (path.length >= 3) return []
  const out = new Map<string, TaxonGroup>()
  for (const r of rows) {
    if (!inTaxon(r, path)) continue
    const id = keyAt(r, path.length)
    const g = out.get(id)
    if (!g) out.set(id, { id, n: 1, first: r })
    else {
      g.n++
      if (r.to < g.first.to) g.first = r
    }
  }
  return [...out.values()].sort((a, b) => a.first.to - b.first.to)
}

/** A group of at most this many species opens straight on its species (the Tree's SPECIES_AT, round 6). */
export const TICK_SPECIES_AT = 12

/**
 * What an open group of `n` species shows (round 6, the Tree's rule: no lone levels): its species when it has
 * TICK_SPECIES_AT or fewer, else the groups under it, past every level that holds one group alone (an order with one
 * family shows that family's genera, a family with one genus its species). `path` is where the shown level sits;
 * `groups` is empty when the species are shown (those of `path`).
 */
export function taxonOpen(rows: readonly SpeciesRow[], path: TaxonPath, n: number): { path: TaxonPath; groups: TaxonGroup[] } {
  if (n <= TICK_SPECIES_AT) return { path, groups: [] }
  let groups = taxonChildren(rows, path)
  while (groups.length === 1) {
    path = [...path, groups[0].id]
    groups = taxonChildren(rows, path)
  }
  return { path, groups }
}

/**
 * The open groups (keys "order", "order/family", "order/family/genus", the full path even where a level is skipped)
 * after a press on `key`, one group open at a time at each level: an open one closes (what is open under it is kept
 * for its next opening); a closed one opens and its siblings (the keys under the same parent) close, with everything
 * open under them.
 */
export function toggleOpen(open: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(open)
  if (next.delete(key)) return next
  const parent = key.slice(0, key.lastIndexOf('/') + 1) // '' for an order
  for (const k of open) if (k.startsWith(parent) && !k.startsWith(`${key}/`)) next.delete(k)
  return next.add(key)
}

/**
 * The rows to show: the whole taxonomy in taxonomic order, narrowed to a group when given (a genus's species); with a search,
 * only rows whose common or scientific name matches by word prefixes (accent-insensitive), best match first.
 */
export function filterTickRows(rows: readonly SpeciesRow[], f: { q?: string; taxon?: TaxonPath }): SpeciesRow[] {
  const inGroup = (r: SpeciesRow) => !f.taxon?.length || inTaxon(r, f.taxon)
  const key = f.q ? searchKey(f.q) : ''
  if (!key) return rows.filter(inGroup).sort((a, b) => a.to - b.to)
  const hits: { r: SpeciesRow; tier: number }[] = []
  for (const r of rows) {
    if (!inGroup(r)) continue
    const tier = nameTier(key, r)
    if (tier >= 0) hits.push({ r, tier })
  }
  return hits.sort((a, b) => a.tier - b.tier || a.r.to - b.r.to).map((h) => h.r)
}

/** Add `codes` by hand with one date and place: replaces any earlier hand record of theirs and takes them out of `removed`. */
export function addTicked(edits: Edits, codes: string[], opts: { date?: string; place?: Place }): Edits {
  const set = new Set(codes)
  const recs = codes.map((code): SourceRecord => {
    const r: SourceRecord = { code, source: 'manual' }
    if (opts.date) r.date = opts.date
    if (opts.place) r.place = { ...opts.place }
    return r
  })
  return { ...edits, removed: edits.removed.filter((c) => !set.has(c)), added: [...edits.added.filter((r) => !set.has(r.code)), ...recs] }
}

/**
 * Take `codes` off the list from Add by hand, as the bird card's Remove does: each goes into `removed` (so a source
 * that has it no longer counts it) and any hand-added record of it is dropped. Marks and fixes stay.
 */
export function removeTicked(edits: Edits, codes: string[]): Edits {
  const set = new Set(codes)
  return { ...edits, removed: [...edits.removed, ...codes.filter((c) => !edits.removed.includes(c))], added: edits.added.filter((r) => !set.has(r.code)) }
}

/**
 * Undo a removal (the card's Remove, Add by hand's tap on a bird on the list) or an add by hand: for each of `codes`,
 * put back exactly what `before` had (whether it was in `removed`, its hand records as they were, its marks), and keep
 * every edit made since to other birds. Records from the sources are never touched by either, so they need nothing.
 */
export function undoEdit(now: Edits, before: Edits, codes: readonly string[]): Edits {
  const set = new Set(codes)
  const marks = { ...now.marks }
  for (const c of codes) {
    if (before.marks[c]) marks[c] = before.marks[c]
    else delete marks[c]
  }
  // Each hand record goes back where it stood (so with no edits since, `added` is exactly as before).
  const added = now.added.filter((r) => !set.has(r.code))
  before.added.forEach((r, i) => { if (set.has(r.code)) added.splice(Math.min(i, added.length), 0, r) })
  const removed = [...now.removed.filter((c) => !set.has(c)), ...before.removed.filter((c) => set.has(c))]
  return { ...now, removed, added, marks }
}
