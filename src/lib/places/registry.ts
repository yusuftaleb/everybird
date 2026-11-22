import type { Place, SourceRecord, Unmatched } from '@/lib/list/model'
import { foldName } from '@/lib/species/resolve'
import type { Regions } from '@/lib/species/types'

/** [country, native label, equivalent Everybird ID or null, verified parent if distinct]. */
export type CataloguePlace = [country: string, name: string, equivalent?: string | null, parent?: string]
export type PlaceCatalogue = {
  edition: string
  entries: Record<string, CataloguePlace>
  /** Country labels directly reported by this source, indexed by country code. */
  countryNames?: Record<string, string[]>
  /** Changes from the current rows in each older edition. A null marks an ID absent in that edition. */
  history?: Record<string, Record<string, CataloguePlace | null>>
  /** Identifiers whose meaning depends on the edition. */
  reused?: string[]
}
export type PlaceRegistry = { v: 1; catalogues: Record<string, PlaceCatalogue> }
type PlaceTables = Pick<Regions, 'countries' | 'sub1' | 'registry'>

/** Place data from an importer. Coordinates are resolved on-device before constructing a reference. */
type ImportPlace = {
  namespace: string
  id: string
  edition?: string
  country?: string
  county?: string
  label?: string
  /** A verified containing place from a source alias or on-device coordinates. */
  fallback?: string
}

const PREFIX = '-SRC'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

type Reference = { country: string; namespace: string; id: string; edition?: string; fallback?: string; label?: string }

function keyOf(ref: Reference): string {
  const payload = JSON.stringify([ref.namespace, ref.id, ref.edition ?? '', ref.fallback ?? '', ref.label ?? ''])
  const hex = Array.from(encoder.encode(payload), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return ref.country + PREFIX + hex
}

function referenceOf(key: string): Reference | undefined {
  if (key.slice(2, 6) !== PREFIX || !/^[A-Z]{2}$/.test(key.slice(0, 2))) return undefined
  const hex = key.slice(6)
  if (!/^(?:[a-f0-9]{2}){1,1000}$/.test(hex)) return undefined
  try {
    const bytes = Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16))
    const fields: unknown = JSON.parse(decoder.decode(bytes))
    if (!Array.isArray(fields) || fields.length !== 5 || !fields.every((field) => typeof field === 'string')) return undefined
    const [namespace, id, edition, fallback, label] = fields
    return { country: key.slice(0, 2), namespace, id, edition: edition || undefined, fallback: fallback || undefined, label: label || undefined }
  } catch {
    return undefined
  }
}

const own = <T>(object: Record<string, T> | undefined, key: string): T | undefined =>
  object && Object.hasOwn(object, key) ? object[key] : undefined

function lookup(ref: Pick<Reference, 'namespace' | 'id' | 'edition'>, tables: PlaceTables): CataloguePlace | undefined {
  const catalogue = own(tables.registry?.catalogues, ref.namespace)
  if (!catalogue) return undefined
  const changes = ref.edition && ref.edition !== catalogue.edition ? own(catalogue.history, ref.edition) : undefined
  if (changes && Object.hasOwn(changes, ref.id)) return changes[ref.id] ?? undefined
  if (!changes && ref.edition !== catalogue.edition && catalogue.reused?.includes(ref.id)) return undefined
  const current = own(catalogue.entries, ref.id)
  if (current || ref.edition) return current
  for (const edition of Object.keys(catalogue.history ?? {}).sort().reverse()) {
    const archived = own(catalogue.history?.[edition], ref.id)
    if (archived) return archived
  }
  return undefined
}

/** A stable, country-scoped key for a source that exports division names. */
export const divisionId = (country: string, name: string): string => country + ':' + name.normalize('NFC').trim()

/** Store the source identity before sightings are aggregated; canonical projection can be applied again on read. */
export function resolveImportedPlace(input: ImportPlace, tables: PlaceTables): Place | undefined {
  const id = input.id.trim()
  const candidate = lookup({ ...input, id }, tables)
  const country = candidate?.[0] ?? input.country?.toUpperCase()
  if (!country || !/^[A-Z]{2}$/.test(country)) return undefined
  if (!id || id.length > 200 || input.namespace.length > 40 || (input.edition?.length ?? 0) > 40) return { country }
  const ref = {
    country, namespace: input.namespace, id, edition: input.edition, fallback: input.fallback,
    label: candidate ? undefined : input.label?.replaceAll(', ', ' / ').trim().slice(0, 160),
  }
  const sub1 = keyOf(ref)
  return input.county ? { country, sub1, sub2: input.county } : { country, sub1 }
}

export function hasSourcePlaceKey(key: string): boolean {
  return key.slice(2, 6) === PREFIX
}

function fromLegacyEbird(place: Place, tables: PlaceTables): Place {
  const id = place.sub1
  if (!id || hasSourcePlaceKey(id)) return place
  const catalogue = tables.registry?.catalogues.ebird
  if (!catalogue) return place
  const edition = own(catalogue.entries, id) ? undefined :
    Object.keys(catalogue.history ?? {}).find((key) => own(catalogue.history?.[key], id))
  if (!own(catalogue.entries, id) && !edition) return place
  return resolveImportedPlace({
    namespace: 'ebird', id, edition, country: place.country,
    county: id.startsWith('VN-') || id === 'IN-DD' || id === 'IN-DN' ? undefined : place.sub2,
  }, tables) ?? place
}

/** Translate one stored source identity to its shared region, verified parent, native place or country. */
export function projectPlace(place: Place | undefined, tables: PlaceTables): Place | undefined {
  const ref = place?.sub1 ? referenceOf(place.sub1) : undefined
  if (!place || !ref) return place
  const entry = lookup(ref, tables)
  const country = entry?.[0] ?? ref.country
  const fallback = ref.fallback
  const validFallback = fallback?.startsWith(country + '-') && own(tables.sub1, fallback) ? fallback : undefined
  const target = entry?.[2] ?? (!entry ? validFallback : undefined)
  if (target === country) return validFallback ? { country, sub1: validFallback } : { country }
  if (target?.startsWith(country + '-') && own(tables.sub1, target)) {
    return place.sub2 ? { country, sub1: target, sub2: place.sub2 } : { country, sub1: target }
  }
  const parent = entry?.[3]
  if (parent?.startsWith(country + '-') && own(tables.sub1, parent)) {
    return { country, sub1: parent, sub2: place.sub1 }
  }
  return entry || ref.label ? { ...place, country } : { country }
}

/** The label of a native or shared place. Synthetic share IDs still use their own Names table. */
export function placeRegistryLabel(id: string, tables: PlaceTables): string | undefined {
  const shared = own(tables.sub1, id)
  if (shared) return shared
  const ref = referenceOf(id)
  return ref ? lookup(ref, tables)?.[1] ?? ref.label : undefined
}

function projectSightings(sightings: string[] | undefined, tables: PlaceTables, oldEbird: boolean): string[] | undefined {
  return sightings?.map((sighting) => {
    const first = sighting.indexOf('|')
    if (first < 0) return sighting
    const second = sighting.indexOf('|', first + 1)
    const code = sighting.slice(first + 1, second < 0 ? undefined : second)
    const country = code.slice(0, 2)
    if (!hasSourcePlaceKey(code) && !oldEbird) return sighting
    const stored = { country, sub1: code, sub2: second < 0 ? undefined : sighting.slice(second + 1) }
    const place = projectPlace(oldEbird ? fromLegacyEbird(stored, tables) : stored, tables)
    if (!place) return sighting
    const projected = place.sub1 ?? place.country ?? country
    return sighting.slice(0, first + 1) + projected + (place.sub2 ? '|' + place.sub2 : '')
  })
}

/** Re-project lifer, earliest sightings and all recorded months from the same identities. */
export function projectRecord<T extends SourceRecord | Unmatched>(record: T, tables: PlaceTables, oldEbird = record.source === 'ebird'): T {
  const place = record.place && oldEbird ? fromLegacyEbird(record.place, tables) : record.place
  return {
    ...record,
    place: projectPlace(place, tables),
    seen: projectSightings(record.seen, tables, oldEbird),
    seenMonths: projectSightings(record.seenMonths, tables, oldEbird),
  }
}

type CatalogueUpdateReport = {
  added: string[]
  retired: string[]
  reused: string[]
  parentChanges: string[]
  errors: string[]
}

export function validateCatalogueUpdate(previous: PlaceCatalogue, next: PlaceCatalogue): CatalogueUpdateReport {
  const added: string[] = []
  const retired: string[] = []
  const reused: string[] = []
  const parentChanges: string[] = []
  const errors: string[] = []
  const prior = next.history?.[previous.edition]
  const reusedSet = new Set(next.reused ?? [])

  for (const id of Object.keys(next.entries)) {
    if (!Object.hasOwn(previous.entries, id)) added.push(id)
  }
  for (const [id, old] of Object.entries(previous.entries)) {
    const cur = own(next.entries, id)
    if (!cur) {
      retired.push(id)
      if (previous.edition !== next.edition && (!prior || !Object.hasOwn(prior, id))) {
        errors.push(`retired:${id}`)
      }
      continue
    }
    const isReused = old[0] !== cur[0] || foldName(old[1]) !== foldName(cur[1])
    if (isReused) {
      reused.push(id)
      if (previous.edition !== next.edition) {
        if (!reusedSet.has(id)) errors.push(`reused:${id}`)
        if (!prior || !Object.hasOwn(prior, id)) errors.push(`history:${id}`)
      }
      continue
    }
    if ((old[2] ?? null) !== (cur[2] ?? null) || (old[3] ?? null) !== (cur[3] ?? null)) {
      parentChanges.push(id)
      if (previous.edition !== next.edition && (!prior || !Object.hasOwn(prior, id))) {
        errors.push(`history:${id}`)
      }
    }
  }
  added.sort()
  retired.sort()
  reused.sort()
  parentChanges.sort()
  return { added, retired, reused, parentChanges, errors }
}
