import type { SpeciesFile, SpeciesRow, TaxonRow, TaxonomyFile } from './types'
import { rankByName } from './name-search'
import { exactSci, foldName, normalizeSci } from './resolve'
import { fetchData } from '../data-url'
import type { BirdGroup, GroupsFile } from '../search/groups'

export type SpeciesIndex = {
  rows: SpeciesRow[]
  byCode: Map<string, SpeciesRow>
  /** eBird's bird groups by id (Filter.group), when the groups file is loaded; undefined without it. */
  groups?: ReadonlyMap<string, BirdGroup>
  search(q: string, limit?: number): SpeciesRow[]
}
export type TaxonomyIndex = {
  rows: TaxonRow[]
  bySci: Map<string, TaxonRow> // normalizeSci keys
  exactSci: Map<string, TaxonRow> // lower-cased, space-collapsed full names (group/parenthetical kept)
  byCom: Map<string, TaxonRow> // lower-case, accents stripped
  byOrder: Map<number, TaxonRow>
}

let speciesP: Promise<SpeciesIndex> | null = null
let taxonomyP: Promise<TaxonomyIndex> | null = null

/** Test hook: forget cached promises. */
export function resetCaches(): void {
  speciesP = null
  taxonomyP = null
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
    async () => {
      // The groups file is small and optional: without it a group filter is ignored rather than the app failing.
      const [file, groups] = await Promise.all([fetchData<SpeciesFile>('species.v1.json'), loadGroupMap()])
      const index = buildSpeciesIndex(file.species)
      return groups ? { ...index, groups } : index
    },
  )
}

let groupsP: Promise<ReadonlyMap<string, BirdGroup> | undefined> | null = null

/**
 * The groups file as a map by id; undefined when it can't be loaded or isn't the expected shape. One fetch is shared by
 * the species index, the landing sample and the search; a failure is not cached.
 */
export function loadGroupMap(): Promise<ReadonlyMap<string, BirdGroup> | undefined> {
  groupsP ??= (async () => {
    try {
      const file = await fetchData<GroupsFile>('groups.v1.json')
      return Array.isArray(file?.groups) ? new Map(file.groups.map((g) => [g.id, g])) : undefined
    } catch {
      groupsP = null
      return undefined
    }
  })()
  return groupsP
}

export function loadTaxonomy(): Promise<TaxonomyIndex> {
  return cached(
    () => taxonomyP,
    (p) => (taxonomyP = p),
    async () => buildTaxonomyIndex((await fetchData<TaxonomyFile>('taxonomy.v1.json')).taxa),
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
  // No name preparation here: rankByName prepares each row's names on first use (cached per row), so loading the 11,201
  // species is not a ~200 ms main-thread task; the first search pays for it instead.
  const byCode = new Map(rows.map((r) => [r.code, r]))
  return { rows, byCode, search: (q: string, limit = 20) => rankByName(rows, q, limit) }
}
