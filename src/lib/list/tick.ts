// Tick by hand, the pure parts: which species the browsable list shows, and how a batch of ticks lands in the edits.
import { nameTier, searchKey } from '@/lib/species/name-search'
import type { SpeciesRow } from '@/lib/species/types'
import type { Edits, Place, SourceRecord } from './model'

/**
 * The rows to show: the whole taxonomy in taxonomic order, narrowed to an order (then a family) when chosen; with a
 * search, only rows whose common or scientific name matches by word prefixes (accent-insensitive), best match first.
 */
export function filterTickRows(rows: readonly SpeciesRow[], f: { q?: string; order?: string; family?: string }): SpeciesRow[] {
  const inGroup = (r: SpeciesRow) => (!f.order || r.ord === f.order) && (!f.family || r.fam === f.family)
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
