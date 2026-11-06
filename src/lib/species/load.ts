import type { SpeciesFile, SpeciesRow, TaxonRow, TaxonomyFile } from './types'
import { prepared, rankByName } from './name-search'
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
  // Absolute-path URLs resolve against the page origin; make that explicit so it also holds in a worker.
  const origin = typeof self !== 'undefined' ? self.location?.origin : undefined
  const res = await fetch(origin && origin !== 'null' ? new URL(url, origin).href : url)
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

export function buildSpeciesIndex(rows: SpeciesRow[]): SpeciesIndex {
  const byCode = new Map(rows.map((r) => [r.code, r]))
  for (const r of rows) prepared(r) // normalise the names once, up front
  return { rows, byCode, search: (q: string, limit = 20) => rankByName(rows, q, limit) }
}
