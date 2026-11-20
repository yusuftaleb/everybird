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
import { abortError, cardLayout, goalText, imagePackSpec, packForImage, renderShareImage, type CardFormat, type CountSize, type ImagePack, type ImageFormat, type PackSpec, type ShareImageOpts } from './image'
import type { makePoster as MakePoster, Poster, PosterOpts } from './poster'
import { printDesign, type PrintSize } from './print'

/** The Birds per poster (or image) choices when splitting by number of birds: all of them in one, or at most this many. */
export const BULK_BATCH_OPTIONS = [100, 250, 500, 1000] as const
export type BulkBatch = (typeof BULK_BATCH_OPTIONS)[number] | 'all'

/** An older most-birds-per-poster number (it was a free box) as a choice: the nearest one at or above it, else All. */
export function batchChoice(n: unknown): BulkBatch {
  if (n === 'all' || typeof n !== 'number' || !Number.isFinite(n)) return 'all'
  return BULK_BATCH_OPTIONS.find((o) => o >= n) ?? 'all'
}

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
  /** Splitting by number of birds: the most per poster or image (default All: one group of every bird). */
  batchSize?: BulkBatch
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
    const choice = batchChoice(opts.batchSize ?? 'all')
    const size = choice === 'all' ? sorted.length : choice
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
  /** The Big Year goal's target: the label under the count reads "OF 300 SPECIES", so its hole is sized for that. */
  target?: number
  showNames: boolean
  species: SpeciesIndex
  nameOf?: (row: SpeciesRow) => string
  measure?: TextMeasurer
  arrangement?: Arrangement
}

/** What to pack for one group's poster (every poster has its group's label line), with names planned for its own birds. */
export function bulkPackSpec(entries: ListEntry[], o: BulkPackOpts): PackSpec {
  const format: CardFormat = o.landscape ? 'printLandscape' : 'print'
  const content = { name: o.named, filter: true, latest: true, count: entries.length, target: o.target, countSize: o.countSize }
  if (!o.showNames) return imagePackSpec(format, content, o.size, undefined, o.arrangement)
  const L = cardLayout(format, content, printDesign(o.size, o.landscape))
  const plan = planCaptions(entries, o.species, o.size, L.collage.w, o.nameOf, o.measure)
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

/** The view's label line, which each file's label line starts with ("Canada · Herons"). */
function viewLabel(o: Pick<BulkPosterOpts, 'filterLabel' | 'goal' | 'strings'>): string {
  return o.filterLabel?.trim() || (o.goal ? goalText(o.goal, o.strings) : '')
}
const groupLabel = (view: string, group: BulkGroup) => [view, group.label].filter(Boolean).join(' · ')

/**
 * One file per group, written into a ZIP as each is done: its bytes go straight into Blob parts (which the browser may
 * keep off the JS heap) and are dropped, so finished files are never held twice and nothing copies the whole archive.
 */
async function zipGroups(
  groups: readonly BulkGroup[],
  signal: AbortSignal | undefined,
  onProgress: BulkZipOpts['onProgress'],
  file: (group: BulkGroup, check: () => void) => Promise<{ name: string; bytes: Uint8Array }>,
): Promise<Blob> {
  const check = () => { if (signal?.aborted) throw abortError() }
  check()
  const parts: Blob[] = []
  let zipError: Error | null = null
  const zip = new Zip((err, chunk) => {
    if (err) zipError = err
    else parts.push(new Blob([chunk as Uint8Array<ArrayBuffer>]))
  })
  const total = groups.length
  try {
    for (let i = 0; i < total; i++) {
      check()
      const group = groups[i]
      const { name, bytes } = await file(group, check)
      check()
      const entry = new ZipPassThrough(name)
      zip.add(entry)
      entry.push(bytes, true)
      if (zipError) throw zipError
      onProgress?.(i + 1, total, group)
    }
    check()
    zip.end()
    if (zipError) throw zipError
  } catch (e) {
    zip.terminate()
    parts.length = 0
    throw e
  }
  return new Blob(parts, { type: 'application/zip' })
}

/** The ZIP, and how many of its posters asked for names but have none (they didn't fit). */
export async function makeBulkZip(opts: BulkZipOpts): Promise<{ blob: Blob; namesDropped: number }> {
  const { groups, kind, poster: posterOpts, species, packSpec, onProgress, deps } = opts
  const { signal } = posterOpts
  if (signal?.aborted) throw abortError()
  const packFn = deps?.pack ?? packForImage
  const makePosterFn = deps?.makePoster ?? (await import('./poster')).makePoster
  const view = viewLabel(posterOpts)
  let namesDropped = 0
  const blob = await zipGroups(groups, signal, onProgress, async (group, check) => {
    const pack = await packFn(group.entries, species, packSpec(group.entries, group), signal)
    check()
    let p: Poster | null = null
    try {
      p = await makePosterFn({ ...posterOpts, entries: group.entries, species, pack, filterLabel: groupLabel(view, group) }, () => {})
      check()
      const bytes = new Uint8Array(await (await p.file(kind)).arrayBuffer())
      if (p.namesDropped) namesDropped++
      return { name: `${group.stem}.${kind}`, bytes }
    } finally {
      p?.dispose()
    }
  })
  return { blob, namesDropped }
}

/** The share images' options for every group's image (`filterLabel` and `goal` are the view's, as BulkPosterOpts). */
export type BulkImageOpts = Omit<ShareImageOpts, 'entries' | 'pack' | 'species' | 'format'> & { format: ImageFormat }

export type ImageZipOpts = {
  groups: readonly BulkGroup[]
  image: BulkImageOpts
  species: SpeciesIndex
  onProgress?: BulkZipOpts['onProgress']
  deps?: {
    pack?: (entries: ListEntry[], species: SpeciesIndex, spec: PackSpec, signal?: AbortSignal) => Promise<ImagePack>
    render?: (opts: ShareImageOpts) => Promise<Blob>
  }
}

/** What to pack for one group's share image: the dialog's own pack for its format, with the group's label line. */
export function bulkImagePackSpec(entries: ListEntry[], o: Pick<BulkImageOpts, 'format' | 'name' | 'goal' | 'countSize' | 'arrangement'>): PackSpec {
  return imagePackSpec(o.format, { name: !!o.name?.trim(), filter: true, latest: true, count: entries.length, target: o.goal?.target, countSize: o.countSize }, undefined, undefined, o.arrangement)
}

/** A ZIP of one share image (PNG) per group, in the dialog's format and with its options. */
export async function makeImageZip(opts: ImageZipOpts): Promise<Blob> {
  const { groups, image, species, onProgress, deps } = opts
  const packFn = deps?.pack ?? packForImage
  const render = deps?.render ?? renderShareImage
  const view = viewLabel(image)
  return zipGroups(groups, image.signal, onProgress, async (group, check) => {
    const pack = await packFn(group.entries, species, bulkImagePackSpec(group.entries, image), image.signal)
    check()
    const png = await render({ ...image, entries: group.entries, species, pack, filterLabel: groupLabel(view, group) })
    return { name: `${group.stem}.png`, bytes: new Uint8Array(await png.arrayBuffer()) }
  })
}
