// Name matching shared by species.search (the whole taxonomy) and the collage search (the birder's own list):
// word prefixes of the common or scientific name, accent- and case-insensitive.
import { foldName } from './resolve'
import type { SpeciesRow } from './types'

/** Accent-stripped, lower-case, apostrophes dropped, other punctuation to spaces. */
export function searchKey(s: string): string {
  return foldName(s)
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

type Pre = { com: string; sci: string; cw: string[]; sw: string[] }
const wordsOf = (s: string) => (s ? s.split(' ') : [])
const PRE = new WeakMap<object, Pre>()

/** A row's normalised names and words, computed once per row. */
export function prepared(r: Pick<SpeciesRow, 'com' | 'sci'>): Pre {
  let p = PRE.get(r)
  if (!p) {
    const com = searchKey(r.com ?? ''), sci = searchKey(r.sci ?? '')
    p = { com, sci, cw: wordsOf(com), sw: wordsOf(sci) }
    PRE.set(r, p)
  }
  return p
}

const hasPrefix = (ws: string[], t: string) => ws.some((w) => w.startsWith(t))

/**
 * How well a row matches a search key (from searchKey): 0 exact common or scientific name, 1 every word a prefix
 * of a common-name word, 2 of a scientific-name word, 3 of either; -1 no match. An empty key matches nothing.
 */
export function nameTier(key: string, r: Pick<SpeciesRow, 'com' | 'sci'>): number {
  if (!key) return -1
  const p = prepared(r)
  if (p.com === key || p.sci === key) return 0
  const toks = key.split(' ')
  if (toks.every((t) => hasPrefix(p.cw, t))) return 1
  if (toks.every((t) => hasPrefix(p.sw, t))) return 2
  if (toks.every((t) => hasPrefix(p.cw, t) || hasPrefix(p.sw, t))) return 3
  return -1
}

/** Rank rows for a query: best tier first, then taxonomic order. */
export function rankByName(rows: Iterable<SpeciesRow>, q: string, limit: number): SpeciesRow[] {
  const key = searchKey(q)
  if (!key) return []
  const hits: { r: SpeciesRow; tier: number }[] = []
  for (const r of rows) {
    const tier = nameTier(key, r)
    if (tier >= 0) hits.push({ r, tier })
  }
  hits.sort((a, b) => a.tier - b.tier || a.r.to - b.r.to)
  return hits.slice(0, limit).map((h) => h.r)
}

/** Suggestions for the collage search: birds among `entries` (the current list) whose names match `q`. */
export function suggestBirds(
  entries: readonly { code: string }[],
  q: string,
  species: { byCode: Map<string, SpeciesRow> },
  limit = 8,
): SpeciesRow[] {
  const rows: SpeciesRow[] = []
  for (const e of entries) {
    const r = species.byCode.get(e.code)
    if (r) rows.push(r)
  }
  return rankByName(rows, q, limit)
}
