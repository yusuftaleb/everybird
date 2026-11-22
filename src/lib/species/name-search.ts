// Name matching shared by species.search (the whole taxonomy) and the collage search (the birds on show):
// word prefixes of the common or scientific name, accent- and case-insensitive.
import { HTML_LANG, type Lang } from '@/i18n/langs'
import type { Ui } from '@/i18n/messages/en-ui'
import { orderLabel } from './orders'
import { displayName, familyName, localName, namesVersion } from './names'
import { foldName } from './resolve'
import type { SpeciesRow } from './types'

/** The English order labels: orderLabel's fallback is orders.ts's ORDERS, which is en-ui's `orders` (tests/i18n.test.ts),
 *  so the English dictionary stays out of the client bundle. */
const EN_ORDERS: Pick<Ui, 'orders'> = { orders: {} as Ui['orders'] }

/** Accent-stripped, lower-case, apostrophes dropped, other punctuation to spaces. Cyrillic, katakana (hiragana folds
 *  to it), its voicing marks and long-vowel mark ー, and Han are kept as letters; a Latin name's key is unchanged. */
export function searchKey(s: string): string {
  return foldName(s)
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9\p{Script=Cyrillic}\p{Script=Katakana}\p{Script=Han}\u3099\u309a\u30fc]+/gu, ' ')
    .trim()
}

type Pre = { com: string; sci: string; cw: string[]; sw: string[]; loc: string; lw: string[]; v: number }
const wordsOf = (s: string) => (s ? s.split(' ') : [])
const PRE = new WeakMap<object, Pre>()

/**
 * A row's normalised names and words, computed once per row and again when the names change (a names file arrived,
 * the switch flipped). A row without a code (an order or family) has no local name.
 */
export function prepared(r: Pick<SpeciesRow, 'com' | 'sci'> & { code?: string }): Pre {
  const v = namesVersion()
  let p = PRE.get(r)
  if (!p || p.v !== v) {
    const com = searchKey(r.com ?? ''), sci = searchKey(r.sci ?? '')
    const local = r.code ? localName(r.code) : undefined
    const loc = local ? searchKey(local) : com
    p = { com, sci, cw: wordsOf(com), sw: wordsOf(sci), loc, lw: loc === com ? wordsOf(com) : wordsOf(loc), v }
    PRE.set(r, p)
  }
  return p
}

/** Chinese and Japanese names have no spaces to split words at: a search word in Han or katakana matches anywhere in
 *  a name ("海雕" finds 白头海雕, "ワシ" オオワシ); every other word matches a word's start. */
const CJK = /^[\p{Script=Han}\p{Script=Katakana}]/u
const hasPrefix = (ws: string[], t: string) => (CJK.test(t) ? ws.some((w) => w.includes(t)) : ws.some((w) => w.startsWith(t)))

/**
 * How well a row matches a search key (from searchKey): 0 exact local, English or scientific name, 1 every word a
 * prefix of a local-name word (or of an English-name word), 2 of a scientific-name word, 3 of any of them mixed; -1 no
 * match. An empty key matches nothing. With no names set the local name is the English one, so tiers are as ever.
 */
export function nameTier(key: string, r: Pick<SpeciesRow, 'com' | 'sci'> & { code?: string }): number {
  if (!key) return -1
  const p = prepared(r)
  if (p.loc === key || p.com === key || p.sci === key) return 0
  const toks = key.split(' ')
  if (toks.every((t) => hasPrefix(p.lw, t)) || toks.every((t) => hasPrefix(p.cw, t))) return 1
  if (toks.every((t) => hasPrefix(p.sw, t))) return 2
  if (toks.every((t) => hasPrefix(p.lw, t) || hasPrefix(p.cw, t) || hasPrefix(p.sw, t))) return 3
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
 * before species, then taxonomic order) before sorting. Order labels come from `opts.t` (the English label matches too), and names
 * sort in `opts.lang`.
 */
export function searchCollage(
  entries: readonly { code: string }[],
  q: string,
  species: { byCode: Map<string, SpeciesRow> },
  opts: { shown?: ReadonlySet<string>; limit?: number; t: Ui; lang?: Lang },
): CollageHit[] {
  const { shown, limit = 50, t, lang = 'en' } = opts
  const key = searchKey(q)
  if (!key) return []
  const orders = new Map<string, Group & { fams: Set<string> }>()
  const fams = new Map<string, Group & { com: string; en: string; order: string }>()
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
    const f = fams.get(r.fam) ?? { count: 0, shown: 0, to: r.to, com: familyName(r), en: r.famCom || r.fam, order: r.ord }
    f.count++
    if (on) f.shown++
    f.to = Math.min(f.to, r.to)
    fams.set(r.fam, f)
    const tier = nameTier(key, r)
    if (tier >= 0) found.push({ hit: { kind: 'species', value: r.code, com: displayName(r), sci: r.sci, count: 1, order: r.ord, inFilter: on }, tier, to: r.to })
  }
  for (const [ord, o] of orders) {
    const com = orderLabel(ord, t)
    const tiers = [nameTier(key, { com, sci: ord }), nameTier(key, { com: orderLabel(ord, EN_ORDERS), sci: ord })].filter((x) => x >= 0)
    const tier = tiers.length ? Math.min(...tiers) : -1
    if (tier >= 0) found.push({ hit: { kind: 'order', value: ord, com, sci: ord, count: o.shown || o.count, inFilter: o.shown > 0 }, tier, to: o.to })
  }
  for (const [fam, f] of fams) {
    const o = orders.get(f.order)!
    // A family named like its order's only family is left out; either language's name counts, English order label too.
    const famKeys = [searchKey(f.com), searchKey(f.en)]
    if (o.fams.size === 1 && famKeys.some((k) => k === searchKey(orderLabel(f.order, t)) || k === searchKey(orderLabel(f.order, EN_ORDERS)))) continue
    const tiers = [nameTier(key, { com: f.com, sci: fam }), nameTier(key, { com: f.en, sci: fam })].filter((x) => x >= 0)
    const tier = tiers.length ? Math.min(...tiers) : -1
    if (tier >= 0) found.push({ hit: { kind: 'family', value: fam, com: f.com, sci: fam, count: f.shown || f.count, order: f.order, inFilter: f.shown > 0 }, tier, to: f.to })
  }
  const out = (x: { hit: CollageHit }) => (x.hit.inFilter ? 0 : 1)
  const best = found.length > limit
    ? [...found].sort((a, b) => out(a) - out(b) || a.tier - b.tier || KIND_RANK[a.hit.kind] - KIND_RANK[b.hit.kind] || a.to - b.to).slice(0, limit)
    : found
  return best
    .sort((a, b) => out(a) - out(b) || a.hit.com.localeCompare(b.hit.com, HTML_LANG[lang]) || KIND_RANK[a.hit.kind] - KIND_RANK[b.hit.kind] || a.to - b.to)
    .map((x) => x.hit)
}
