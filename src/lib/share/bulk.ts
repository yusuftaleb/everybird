import { zipSync } from 'fflate'
import { seenBasis, type Filter } from '@/lib/list/filters'
import { inRange } from '@/lib/list/in-range'
import type { ListEntry } from '@/lib/list/model'
import { countryKeyOf, placeName } from '@/lib/list/place-keys'
import { seenOf, type SeenIndex } from '@/lib/list/seen'
import { makeWhere, sightingKeys, whereOf } from '@/lib/list/sighting'
import { continentOfPlace, type ContinentId } from '@/lib/places/continents'
import type { SpeciesIndex } from '@/lib/species/load'
import { familyName } from '@/lib/species/names'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { abortError, packForImage, type ImagePack, type PackSpec } from './image'
import type { makePoster as MakePoster, Poster, PosterOpts } from './poster'

export const BULK_BATCH_SIZE = 1000

export type BulkSplit = 'batches' | 'family' | 'order' | 'country' | 'continent' | 'province' | 'year'

export type BulkGroup = {
  id: string
  label: string
  stem: string
  entries: ListEntry[]
}

export type BulkGroupsOpts = {
  species: SpeciesIndex
  regions: Regions
  seen?: SeenIndex
  filter?: Filter
  continents?: Partial<Record<ContinentId, string>>
  batchLabel?: (n: number) => string
  familyLabel?: (row: Pick<SpeciesRow, 'fam' | 'famCom'>) => string
  orderLabel?: (ord: string) => string
  locale?: string
}

const RESERVED_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const YEAR_RE = /^(\d{4})/

export function sanitizeGroupStem(label: string, fallback = 'group'): string {
  const ascii = label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[/\\]+/g, ' ')
    .replace(/\.{2,}/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
  const base = ascii || fallback
  return RESERVED_WINDOWS.test(base) ? `${base}-group` : base
}

function uniqueStems(groups: { id: string; label: string; entries: ListEntry[] }[]): BulkGroup[] {
  const used = new Set<string>()
  return groups.map((g, i) => {
    const base = sanitizeGroupStem(g.label, `group-${i + 1}`)
    let stem = base
    let n = 2
    while (used.has(stem)) {
      stem = `${base}-${n}`
      n++
    }
    used.add(stem)
    return { ...g, stem }
  })
}

function sortTaxonomic(entries: readonly ListEntry[], species: SpeciesIndex): ListEntry[] {
  return [...entries].sort((a, b) => {
    const ta = species.byCode.get(a.code)?.to ?? Number.POSITIVE_INFINITY
    const tb = species.byCode.get(b.code)?.to ?? Number.POSITIVE_INFINITY
    return ta - tb
  })
}

function addToBucket(
  buckets: Map<string, { label: string; entries: ListEntry[]; seen: Set<string> }>,
  id: string,
  label: string,
  entry: ListEntry,
): void {
  let b = buckets.get(id)
  if (!b) {
    b = { label, entries: [], seen: new Set() }
    buckets.set(id, b)
  }
  if (b.seen.has(entry.code)) return
  b.seen.add(entry.code)
  b.entries.push(entry)
}

export function bulkGroups(split: BulkSplit, entries: readonly ListEntry[], opts: BulkGroupsOpts): BulkGroup[] {
  const sorted = sortTaxonomic(entries, opts.species)
  if (!sorted.length) return []

  if (split === 'batches') {
    const out: { id: string; label: string; entries: ListEntry[] }[] = []
    for (let i = 0; i < sorted.length; i += BULK_BATCH_SIZE) {
      const n = Math.floor(i / BULK_BATCH_SIZE) + 1
      out.push({
        id: `batch-${n}`,
        label: opts.batchLabel ? opts.batchLabel(n) : `Batch ${n}`,
        entries: sorted.slice(i, i + BULK_BATCH_SIZE),
      })
    }
    return uniqueStems(out)
  }

  if (split === 'family' || split === 'order') {
    const buckets = new Map<string, { label: string; entries: ListEntry[]; seen: Set<string> }>()
    const famLabel = opts.familyLabel ?? familyName
    const ordLabel = opts.orderLabel ?? ((ord: string) => ord)
    for (const e of sorted) {
      const row = opts.species.byCode.get(e.code)
      if (!row) continue
      const id = split === 'family' ? row.fam : row.ord
      const label = split === 'family' ? famLabel(row) : ordLabel(row.ord)
      addToBucket(buckets, id, label, e)
    }
    return uniqueStems([...buckets.entries()].map(([id, b]) => ({ id, label: b.label, entries: b.entries })))
  }

  const filter = opts.filter
  const useSeenBasis = !!(filter && seenBasis(filter))
  const when = useSeenBasis ? makeWhere(undefined, filter.from, filter.to) : undefined
  const where = useSeenBasis ? whereOf(filter) : undefined

  if (split === 'country' || split === 'continent' || split === 'province') {
    const buckets = new Map<string, { label: string; entries: ListEntry[]; seen: Set<string> }>()
    for (const e of sorted) {
      const here = when ? sightingKeys(e, opts.seen, when) : undefined
      for (const p of seenOf(opts.seen, e)) {
        if (here && !here.has(p.sub2 ? `${p.sub1 ?? p.country}|${p.sub2}` : (p.sub1 ?? p.country))) continue
        if (split === 'country') {
          const id = countryKeyOf(p)
          addToBucket(buckets, id, placeName(id, opts.regions, opts.continents), e)
        } else if (split === 'continent') {
          const cont = continentOfPlace(p)
          if (!cont) continue
          const id = `n:${cont}`
          addToBucket(buckets, id, placeName(id, opts.regions, opts.continents), e)
        } else {
          if (!p.sub1) continue
          const id = `s:${p.sub1}`
          addToBucket(buckets, id, placeName(id, opts.regions, opts.continents), e)
        }
      }
    }
    const items = [...buckets.entries()]
      .map(([id, b]) => ({ id, label: b.label, entries: b.entries }))
      .sort((a, b) => a.label.localeCompare(b.label, opts.locale))
    return uniqueStems(items)
  }

  const buckets = new Map<string, { label: string; entries: ListEntry[]; seen: Set<string> }>()
  for (const e of sorted) {
    const months = opts.seen?.byCode.get(e.code)?.months
    const years = new Set<string>()
    if (months) {
      for (const pm of months) {
        if (where && where.keys.length && !pm.keys.some((k) => where.keys.includes(k))) continue
        for (const ord of pm.ords) {
          if (where && (ord < where.lo || ord > where.hi)) continue
          years.add(String(Math.floor(ord / 12)).padStart(4, '0'))
        }
      }
    }
    if (!years.size) {
      if (e.date) {
        const m = YEAR_RE.exec(e.date)
        if (m && (!when || inRange(e.date, when.from, when.to))) years.add(m[1])
      }
      for (const p of seenOf(opts.seen, e)) {
        if (!p.date) continue
        const m = YEAR_RE.exec(p.date)
        if (m && (!when || inRange(p.date, when.from, when.to))) years.add(m[1])
      }
    }
    for (const y of years) addToBucket(buckets, y, y, e)
  }
  const items = [...buckets.entries()]
    .map(([id, b]) => ({ id, label: b.label, entries: b.entries }))
    .sort((a, b) => a.id.localeCompare(b.id))
  return uniqueStems(items)
}

export type BulkPosterOpts = Omit<PosterOpts, 'entries' | 'pack' | 'filterLabel' | 'species'>

export type BulkZipOpts = {
  groups: readonly BulkGroup[]
  kind: 'png' | 'pdf'
  poster: BulkPosterOpts
  species: SpeciesIndex
  packSpec: (entries: ListEntry[], group: BulkGroup) => PackSpec
  onProgress?: (doneGroups: number, totalGroups: number, group: BulkGroup) => void
  deps?: {
    pack?: (entries: ListEntry[], species: SpeciesIndex, spec: PackSpec, signal?: AbortSignal) => Promise<ImagePack>
    makePoster?: typeof MakePoster
  }
}

export async function makeBulkZip(opts: BulkZipOpts): Promise<Blob> {
  const { groups, kind, poster: posterOpts, species, packSpec, onProgress, deps } = opts
  const { signal } = posterOpts
  const check = () => { if (signal?.aborted) throw abortError() }
  check()
  const packFn = deps?.pack ?? packForImage
  const makePosterFn = deps?.makePoster ?? (await import('./poster')).makePoster
  const files: Record<string, Uint8Array> = {}
  const total = groups.length
  for (let i = 0; i < total; i++) {
    check()
    const group = groups[i]
    const spec = packSpec(group.entries, group)
    const pack = await packFn(group.entries, species, spec, signal)
    check()
    let p: Poster | null = null
    try {
      p = await makePosterFn(
        {
          ...posterOpts,
          entries: group.entries,
          species,
          pack,
          filterLabel: group.label,
        },
        () => {},
      )
      check()
      const blob = await p.file(kind)
      check()
      files[`${group.stem}.${kind}`] = new Uint8Array(await blob.arrayBuffer())
      onProgress?.(i + 1, total, group)
    } finally {
      p?.dispose()
    }
  }
  check()
  const zipped = zipSync(files, { level: 0 })
  return new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
}
