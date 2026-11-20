// Add by hand, the pure parts: which species the browsable list shows, and how a bird added or taken off lands in the
// edits.
import { nameTier, searchKey } from '@/lib/species/name-search'
import type { SpeciesRow } from '@/lib/species/types'
import type { Edits, Place, SourceRecord } from './model'

/**
 * The rows to show: the whole taxonomy in taxonomic order, narrowed to a family when chosen; with a search, only rows
 * whose common or scientific name matches by word prefixes (accent-insensitive), best match first.
 */
export function filterTickRows(rows: readonly SpeciesRow[], f: { q?: string; family?: string }): SpeciesRow[] {
  const inGroup = (r: SpeciesRow) => !f.family || r.fam === f.family
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
