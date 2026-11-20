import { Zip, ZipPassThrough } from 'fflate'
import { filterPlaceKeys, seenBasis, type Filter } from '@/lib/list/filters'
import { inRange } from '@/lib/list/in-range'
import type { ListEntry } from '@/lib/list/model'
import { countryKeyOf, keysOfPlace, placeName } from '@/lib/list/place-keys'
import { seenOf, type SeenIndex } from '@/lib/list/seen'
import { monthOrd, sightingKeys, whereOf } from '@/lib/list/sighting'
import { continentOfPlace, type ContinentId } from '@/lib/places/continents'
import type { SpeciesIndex } from '@/lib/species/load'
import { familyName } from '@/lib/species/names'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { planCaptions, type TextMeasurer } from './captions'
import type { Arrangement } from '@/lib/arrangement'
import { abortError, cardLayout, goalText, imagePackSpec, markedCodesOf, packForImage, type CardFormat, type CountSize, type ImagePack, type PackSpec } from './image'
import type { makePoster as MakePoster, Poster, PosterOpts } from './poster'
import { printDesign, type PrintSize } from './print'

export const BULK_BATCH_SIZE = 1000
/** The bounds of the most birds per poster the birder may ask for when splitting by number of birds. */
export const BULK_BATCH_MIN = 10
export const BULK_BATCH_MAX = 5000

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
  /** Splitting by number of birds: the most per poster (default BULK_BATCH_SIZE), clamped to BULK_BATCH_MIN..MAX. */
  batchSize?: number
}

const RESERVED_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const YEAR_RE = /^(\d{4})/

/** Latin letters NFKD does not split into a base letter and a mark, spelled in ASCII. */
const LATIN_EXTRA: Record<string, string> = { 'ł': 'l', 'đ': 'd', 'ð': 'd', 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'þ': 'th', 'ı': 'i', 'ħ': 'h', 'ŧ': 't', 'ŋ': 'ng' }

export function sanitizeGroupStem(label: string, fallback = 'group'): string {
  const ascii = label
    .toLowerCase()
    .replace(/[łđðøæœßþıħŧŋ]/g, (c) => LATIN_EXTRA[c])
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
    const size = Math.min(BULK_BATCH_MAX, Math.max(BULK_BATCH_MIN, Math.round(opts.batchSize ?? BULK_BATCH_SIZE)))
    const out: { id: string; label: string; entries: ListEntry[] }[] = []
    for (let i = 0; i < sorted.length; i += size) {
      const n = Math.floor(i / size) + 1
      out.push({
        id: `batch-${n}`,
        label: opts.batchLabel ? opts.batchLabel(n) : `Batch ${n}`,
        entries: sorted.slice(i, i + size),
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
  const placeKeys = filter ? filterPlaceKeys(filter) : []
  const placeMatches = (p: { country?: string; sub1?: string; sub2?: string }) => {
    if (!placeKeys.length) return true
    const country = p.country || p.sub1?.split('-')[0]
    return !!country && keysOfPlace({ country, sub1: p.sub1, sub2: p.sub2 }).some((k) => placeKeys.includes(k))
  }
  const useSeenBasis = !!(filter && seenBasis(filter))
  const where = useSeenBasis ? whereOf(filter) : undefined
  const fromBound = filter?.from ?? (filter?.year ? `${filter.year}-01` : undefined)
  const toBound = filter?.to ?? (filter?.year ? `${filter.year}-12` : undefined)
  const hasTime = !!(fromBound || toBound)
  const loOrd = fromBound ? monthOrd(fromBound) : Number.NEGATIVE_INFINITY
  const hiOrd = toBound ? monthOrd(toBound) : Number.POSITIVE_INFINITY

  if (split === 'country' || split === 'continent' || split === 'province') {
    const buckets = new Map<string, { label: string; entries: ListEntry[]; seen: Set<string> }>()
    for (const e of sorted) {
      const here = where ? sightingKeys(e, opts.seen, where) : undefined
      for (const p of seenOf(opts.seen, e)) {
        if (here && !here.has(p.sub2 ? `${p.sub1 ?? p.country}|${p.sub2}` : (p.sub1 ?? p.country))) continue
        if (!placeMatches(p)) continue
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
        if (placeKeys.length && !pm.keys.some((k) => placeKeys.includes(k))) continue
        for (const ord of pm.ords) {
          if (hasTime && (ord < loOrd || ord > hiOrd)) continue
          years.add(String(Math.floor(ord / 12)).padStart(4, '0'))
        }
      }
    }
    if (e.date) {
      const m = YEAR_RE.exec(e.date)
      const placeOk = !placeKeys.length || !!(e.place && placeMatches(e.place))
      if (m && placeOk && (!hasTime || inRange(e.date, fromBound, toBound))) years.add(m[1])
    }
    if (!months?.length) {
      for (const p of seenOf(opts.seen, e)) {
        if (!p.date || !placeMatches(p)) continue
        const m = YEAR_RE.exec(p.date)
        if (m && (!hasTime || inRange(p.date, fromBound, toBound))) years.add(m[1])
      }
    }
    for (const y of years) addToBucket(buckets, y, y, e)
  }
  const items = [...buckets.entries()]
    .map(([id, b]) => ({ id, label: b.label, entries: b.entries }))
    .sort((a, b) => a.id.localeCompare(b.id))
  return uniqueStems(items)
}

/** `filterLabel` and `goal` are the view's: each poster's label line is that, then its group ("Canada · Herons"). */
export type BulkPosterOpts = Omit<PosterOpts, 'entries' | 'pack' | 'species'>

export type BulkPackOpts = {
  size: PrintSize
  landscape: boolean
  /** The poster has a title line. */
  named: boolean
  countSize: CountSize
  /** The Big Year goal's target: the count reads "12 / 300", so its hole is sized for that. */
  target?: number
  showNames: boolean
  species: SpeciesIndex
  nameOf?: (row: SpeciesRow) => string
  measure?: TextMeasurer
  /** The lifer rings: each group rings its own latest and first lifer, as its poster draws them. */
  marks: { newest?: boolean; first?: boolean }
  arrangement?: Arrangement
}

/** What to pack for one group's poster (every poster has its group's label line), with names planned for its own birds. */
export function bulkPackSpec(entries: ListEntry[], o: BulkPackOpts): PackSpec {
  const format: CardFormat = o.landscape ? 'printLandscape' : 'print'
  const content = { name: o.named, filter: true, latest: true, count: entries.length, target: o.target, countSize: o.countSize }
  if (!o.showNames) return imagePackSpec(format, content, o.size, undefined, o.arrangement)
  const L = cardLayout(format, content, printDesign(o.size, o.landscape))
  const plan = planCaptions(entries, o.species, o.size, L.collage.w, o.nameOf, o.measure, markedCodesOf(entries, o.species, o.marks))
  return imagePackSpec(format, content, o.size, plan.ok ? plan : undefined, o.arrangement)
}

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

/** The ZIP, and how many of its posters asked for names but have none (they didn't fit). */
export async function makeBulkZip(opts: BulkZipOpts): Promise<{ blob: Blob; namesDropped: number }> {
  const { groups, kind, poster: posterOpts, species, packSpec, onProgress, deps } = opts
  const { signal } = posterOpts
  const check = () => { if (signal?.aborted) throw abortError() }
  check()
  const packFn = deps?.pack ?? packForImage
  const makePosterFn = deps?.makePoster ?? (await import('./poster')).makePoster
  // The archive is written as each poster is done: its bytes go straight into Blob parts (which the browser may keep off
  // the JS heap) and are dropped, so finished posters are never held twice and nothing copies the whole archive at once.
  const parts: Blob[] = []
  let zipError: Error | null = null
  const zip = new Zip((err, chunk) => {
    if (err) zipError = err
    else parts.push(new Blob([chunk as Uint8Array<ArrayBuffer>]))
  })
  const total = groups.length
  const view = posterOpts.filterLabel?.trim() || (posterOpts.goal ? goalText(posterOpts.goal, posterOpts.strings) : '')
  let namesDropped = 0
  try {
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
            filterLabel: [view, group.label].filter(Boolean).join(' · '),
          },
          () => {},
        )
        check()
        const blob = await p.file(kind)
        check()
        const bytes = new Uint8Array(await blob.arrayBuffer())
        check()
        const file = new ZipPassThrough(`${group.stem}.${kind}`)
        zip.add(file)
        file.push(bytes, true)
        if (zipError) throw zipError
        if (p.namesDropped) namesDropped++
        onProgress?.(i + 1, total, group)
      } finally {
        p?.dispose()
      }
    }
    check()
    zip.end()
    if (zipError) throw zipError
  } catch (e) {
    zip.terminate()
    parts.length = 0
    throw e
  }
  return { blob: new Blob(parts, { type: 'application/zip' }), namesDropped }
}
