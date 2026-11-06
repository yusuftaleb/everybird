// Name matching shared by species.search (the whole taxonomy) and the collage search (the birds on show):
// word prefixes of the common or scientific name, accent- and case-insensitive.
import { orderLabel } from './orders'
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

/** One dock-search result: an order or family (picking it drills the filter into it) or a species on the list. */
export type CollageHit = (
  | { kind: 'order'; value: string; com: string; sci: string; count: number }
  | { kind: 'family'; value: string; com: string; sci: string; count: number; order: string }
  | { kind: 'species'; value: string; com: string; sci: string; count: 1; order: string }
) & { /** In the current filter (else elsewhere on the list). */ inFilter: boolean }

const KIND_RANK = { order: 0, family: 1, species: 2 } as const
type Group = { count: number; shown: number; to: number }

/**
 * The collage's search (Photography's "Find a taxon", which covers every kingdom): orders, families and species on
 * the whole list (`entries`) whose common or scientific name matches `q` by word prefixes. Results read "Common
 * (scientific)"; those in the current filter (`shown`, the codes on show; every entry when left out) come first, then
 * the rest, each part sorted by common name. A group counts its birds in the filter, or on the whole list when none
 * are shown. A family that is its order's only family under the same name is left out (picking either shows the same
 * birds). Over `limit` hits, the best matches are kept (in the filter first, then tier, then orders before families
 * before species, then taxonomic order) before sorting.
 */
export function searchCollage(
  entries: readonly { code: string }[],
  q: string,
  species: { byCode: Map<string, SpeciesRow> },
  opts: { shown?: ReadonlySet<string>; limit?: number } = {},
): CollageHit[] {
  const { shown, limit = 50 } = opts
  const key = searchKey(q)
  if (!key) return []
  const orders = new Map<string, Group & { fams: Set<string> }>()
  const fams = new Map<string, Group & { com: string; order: string }>()
  const found: { hit: CollageHit; tier: number; to: number }[] = []
  for (const e of entries) {
    const r = species.byCode.get(e.code)
    if (!r) continue
    const on = !shown || shown.has(e.code)
    const o = orders.get(r.ord) ?? { count: 0, shown: 0, to: r.to, fams: new Set<string>() }
    o.count++
    if (on) o.shown++
    o.to = Math.min(o.to, r.to)
    o.fams.add(r.fam)
    orders.set(r.ord, o)
    const f = fams.get(r.fam) ?? { count: 0, shown: 0, to: r.to, com: r.famCom || r.fam, order: r.ord }
    f.count++
    if (on) f.shown++
    f.to = Math.min(f.to, r.to)
    fams.set(r.fam, f)
    const tier = nameTier(key, r)
    if (tier >= 0) found.push({ hit: { kind: 'species', value: r.code, com: r.com, sci: r.sci, count: 1, order: r.ord, inFilter: on }, tier, to: r.to })
  }
  for (const [ord, o] of orders) {
    const com = orderLabel(ord)
    const tier = nameTier(key, { com, sci: ord })
    if (tier >= 0) found.push({ hit: { kind: 'order', value: ord, com, sci: ord, count: o.shown || o.count, inFilter: o.shown > 0 }, tier, to: o.to })
  }
  for (const [fam, f] of fams) {
    const o = orders.get(f.order)!
    if (o.fams.size === 1 && searchKey(f.com) === searchKey(orderLabel(f.order))) continue
    const tier = nameTier(key, { com: f.com, sci: fam })
    if (tier >= 0) found.push({ hit: { kind: 'family', value: fam, com: f.com, sci: fam, count: f.shown || f.count, order: f.order, inFilter: f.shown > 0 }, tier, to: f.to })
  }
  const out = (x: { hit: CollageHit }) => (x.hit.inFilter ? 0 : 1)
  const best = found.length > limit
    ? [...found].sort((a, b) => out(a) - out(b) || a.tier - b.tier || KIND_RANK[a.hit.kind] - KIND_RANK[b.hit.kind] || a.to - b.to).slice(0, limit)
    : found
  return best
    .sort((a, b) => out(a) - out(b) || a.hit.com.localeCompare(b.hit.com, 'en') || KIND_RANK[a.hit.kind] - KIND_RANK[b.hit.kind] || a.to - b.to)
    .map((x) => x.hit)
}
