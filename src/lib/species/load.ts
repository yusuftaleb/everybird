import type { SpeciesFile, SpeciesRow, TaxonRow, TaxonomyFile } from './types'
import { exactSci, foldName, normalizeSci } from './resolve'

export type SpeciesIndex = {
  rows: SpeciesRow[]
  byCode: Map<string, SpeciesRow>
  search(q: string, limit?: number): SpeciesRow[]
}
export type TaxonomyIndex = {
  rows: TaxonRow[]
  bySci: Map<string, TaxonRow> // normalizeSci keys
  exactSci: Map<string, TaxonRow> // lower-cased, space-collapsed full names (group/parenthetical kept)
  byCom: Map<string, TaxonRow> // lower-case, accents stripped
  byOrder: Map<number, TaxonRow>
}

const SPECIES_URL = '/data/species.v1.json'
const TAXONOMY_URL = '/data/taxonomy.v1.json'

let speciesP: Promise<SpeciesIndex> | null = null
let taxonomyP: Promise<TaxonomyIndex> | null = null

/** Test hook: forget cached promises. */
export function resetCaches(): void {
  speciesP = null
  taxonomyP = null
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`)
  return (await res.json()) as T
}

/** Fetch once and cache; a failed load is not cached so callers can retry. */
function cached<T>(get: () => Promise<T> | null, set: (p: Promise<T> | null) => void, make: () => Promise<T>): Promise<T> {
  const hit = get()
  if (hit) return hit
  const p = make().catch((e) => {
    set(null)
    throw e
  })
  set(p)
  return p
}

export function loadSpecies(): Promise<SpeciesIndex> {
  return cached(
    () => speciesP,
    (p) => (speciesP = p),
    async () => buildSpeciesIndex((await fetchJson<SpeciesFile>(SPECIES_URL)).species),
  )
}

export function loadTaxonomy(): Promise<TaxonomyIndex> {
  return cached(
    () => taxonomyP,
    (p) => (taxonomyP = p),
    async () => buildTaxonomyIndex((await fetchJson<TaxonomyFile>(TAXONOMY_URL)).taxa),
  )
}

/** Species rows beat forms that normalize to the same key; otherwise first row wins. */
function put(map: Map<string, TaxonRow>, key: string, row: TaxonRow) {
  const prev = map.get(key)
  if (!prev || (prev.cat !== 'species' && row.cat === 'species')) map.set(key, row)
}

export function buildTaxonomyIndex(rows: TaxonRow[]): TaxonomyIndex {
  const bySci = new Map<string, TaxonRow>()
  const exact = new Map<string, TaxonRow>()
  const byCom = new Map<string, TaxonRow>()
  const byOrder = new Map<number, TaxonRow>()
  for (const r of rows) {
    put(bySci, normalizeSci(r.sci), r)
    put(exact, exactSci(r.sci), r)
    if (r.com) put(byCom, foldName(r.com), r)
    byOrder.set(r.to, r)
  }
  return { rows, bySci, exactSci: exact, byCom, byOrder }
}

const wordsOf = (s: string) => (s ? s.split(' ') : [])

export function buildSpeciesIndex(rows: SpeciesRow[]): SpeciesIndex {
  const byCode = new Map(rows.map((r) => [r.code, r]))
  // Precompute normalized names and word lists once; search() only scans these.
  const pre = rows.map((r) => {
    const com = searchKey(r.com)
    const sci = searchKey(r.sci)
    return { r, com, sci, cw: wordsOf(com), sw: wordsOf(sci) }
  })
  const hasPrefix = (ws: string[], t: string) => ws.some((w) => w.startsWith(t))

  function search(q: string, limit = 20): SpeciesRow[] {
    const key = searchKey(q)
    if (!key) return []
    const toks = key.split(' ')
    const hits: { r: SpeciesRow; tier: number }[] = []
    for (const p of pre) {
      let tier: number
      if (p.com === key || p.sci === key) tier = 0
      else if (toks.every((t) => hasPrefix(p.cw, t))) tier = 1
      else if (toks.every((t) => hasPrefix(p.sw, t))) tier = 2
      else if (toks.every((t) => hasPrefix(p.cw, t) || hasPrefix(p.sw, t))) tier = 3
      else continue
      hits.push({ r: p.r, tier })
    }
    hits.sort((a, b) => a.tier - b.tier || a.r.to - b.r.to)
    return hits.slice(0, limit).map((h) => h.r)
  }
  return { rows, byCode, search }
}

/** Accent-stripped, lower-case, apostrophes dropped, other punctuation to spaces. */
function searchKey(s: string): string {
  return foldName(s)
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
