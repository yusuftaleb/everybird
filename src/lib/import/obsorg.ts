import Papa from 'papaparse'
import type { ImportResult, Place, SourceRecord, Unmatched } from '@/lib/list/model'
import { resolveName, suggestName, type Resolution, type TaxonomyIndex } from '@/lib/species/resolve'
import type { Regions } from '@/lib/species/types'
import { SeenAgg } from '@/lib/list/seen'
import { coordinates, hasCoordinateBoundaries, loadCoordinateRegion, type CoordinateRegion } from '@/lib/places/coordinate-region'
import { divisionId, projectPlace, resolveImportedPlace } from '@/lib/places/registry'
import { makeObsOrgPlaces } from './obsorg-places'
import { REGION_RULES } from './inat-rules'

type ObsOrgRowKind = 'species' | 'subspecies' | 'synonym' | 'skip'

// eBird's Milvus migrans aegyptius/parasitus is an issf of Black Kite, not a separate species.
export const OBSORG_SYNONYMS: Readonly<Record<string, string>> = { 'milvus aegyptius': 'blakit1' }

const ROW_TYPES: Record<string, ObsOrgRowKind> = {
  soort: 'species', species: 'species', ondersoort: 'subspecies', subspecies: 'subspecies',
  synoniem: 'synonym', synonym: 'synonym', verzamelsoort: 'skip', aggregate: 'skip',
  'species group': 'skip', 'species aggregate': 'skip', hybride: 'skip', hybrid: 'skip',
  forma: 'skip', form: 'skip', 'variëteit': 'skip', variety: 'skip',
}

/** Classify before resolving: the shared resolver strips parentheses, which would otherwise count forms. */
export function rowKind(type: string | undefined, sci: string): ObsOrgRowKind {
  // NFC: 'variëteit' may arrive decomposed (e + combining diaeresis).
  const key = (type ?? '').normalize('NFC').trim().toLowerCase()
  const known = Object.hasOwn(ROW_TYPES, key) ? ROW_TYPES[key] : undefined
  if (known) return known
  if (/\/|\s+x\s+|×|\(|(?:^|\s)\S+\.(?:\s|$)/i.test(sci)) return 'skip'
  const words = sci.trim().split(/\s+/).length
  return words === 2 ? 'species' : words === 3 ? 'subspecies' : 'skip'
}

const binomialOf = (sci: string) => sci.trim().split(/\s+/).slice(0, 2).join(' ')

/**
 * Scientific names only; exact taxonomy, then local and iNaturalist synonyms; only subspecies reduce. A subspecies of
 * a name iNaturalist lumps but eBird splits (REGION_RULES) takes the code its epithet names before reducing
 * ("Muscicapa striata tyrrhenica" is Mediterranean Flycatcher); never the rules' place or default guesses, so a plain
 * species name keeps the birder's own identification. Never suggests
 * (a suggestion scans the whole taxonomy): the parsers call `obsOrgSuggester` for the few names left unmatched.
 */
export function resolveObsOrgName(
  t: TaxonomyIndex, sci: string, kind: Exclude<ObsOrgRowKind, 'skip'>, synonyms: Record<string, string>,
): Resolution {
  const resolve = (name: string): Resolution => {
    const result = resolveName(t, { sci: name }, { suggest: false })
    if (result.code !== null) return result
    const lower = name.toLowerCase()
    const code = (Object.hasOwn(OBSORG_SYNONYMS, lower) ? OBSORG_SYNONYMS[lower] : undefined)
      ?? (Object.hasOwn(synonyms, name) ? synonyms[name] : undefined)
    return code ? { code, via: 'sci' } : result
  }
  const result = resolve(sci.trim())
  if (result.code !== null || kind !== 'subspecies') return result
  const binomial = binomialOf(sci)
  const rule = Object.hasOwn(REGION_RULES, binomial) ? REGION_RULES[binomial] : undefined
  const ssp = sci.trim().split(/\s+/)[2]
  if (rule && ssp && Object.hasOwn(rule.subspecies, ssp)) return { code: rule.subspecies[ssp], via: 'sci' }
  return binomial === sci.trim() ? result : resolve(binomial)
}

/** At most this many distinct unmatched names get a suggestion per import; the rest are listed without one. */
export const SUGGEST_MAX = 200

/**
 * Suggestions for unmatched names, once per distinct name (a subspecies by its binomial, as it was resolved), for the
 * first SUGGEST_MAX distinct names asked about.
 */
function obsOrgSuggester(t: TaxonomyIndex): (sci: string, kind: Exclude<ObsOrgRowKind, 'skip'>) => string | undefined {
  const cache = new Map<string, string | undefined>()
  return (sci, kind) => {
    const name = kind === 'subspecies' ? binomialOf(sci) : sci.trim()
    if (cache.has(name)) return cache.get(name)
    if (cache.size >= SUGGEST_MAX) return undefined
    const suggestion = suggestName(t, { sci: name })
    cache.set(name, suggestion)
    return suggestion
  }
}

type Row = Record<string, string | undefined>
const isoDate = (value: string | undefined): string | undefined => {
  const date = value?.trim()
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined
}
const earlier = (date: string | undefined, previous: string | undefined) => !!date && (!previous || date < previous)
/** How precise a place is, as buildList ranks it: a province over a country only over none. */
const detail = (p: Place | undefined) => (p?.sub1 ? 2 : p?.country ? 1 : 0)
/** Thrown when the file can't be read as an observation.org CSV; the worker reports it as 'damaged'. */
export class DamagedCsvError extends Error {
  readonly code = 'damaged'
  constructor() {
    super('Malformed observation.org CSV.')
    this.name = 'DamagedCsvError'
  }
}
/**
 * A quoting error breaks the file's structure (an unclosed quote swallows every row after it): the file is damaged.
 * A row with too few or too many fields is read as it is, like eBird's parser does, so one short row never loses a file.
 */
const broken = (errors: readonly Papa.ParseError[]) => errors.some((e) => e.type === 'Quotes')
/** Without a scientific name column there is nothing to read (an empty file has no columns: no birds). */
const missingColumns = (fields: readonly string[] | undefined) => !!fields?.length && !fields.includes('scientific name')
const PARSE = { header: true, skipEmptyLines: true, transformHeader: (h: string) => h.trim().toLowerCase() } as const

/**
 * `undated`: counted species (codes) without any ISO `YYYY-MM-DD` date on any of their rows. Dates are read as ISO
 * only (observation.org writes them so); any other form is not guessed at, and the bird counts undated.
 */
type ObsOrgSpeciesResult = ImportResult & { undated: number }

/**
 * Observed species: dates and names only, with whole nonbird groups dropped. No places or marks are inferred. Every
 * name is resolved exactly first and the group rule applied; only then do the unmatched rows of kept groups get
 * suggestions (`obsOrgSuggester`). Throws DamagedCsvError on a quoting error or without a scientific name column.
 */
export function parseObsOrgSpecies(csv: string, t: TaxonomyIndex, synonyms: Record<string, string>): ObsOrgSpeciesResult | { error: 'no-birds' } {
  const parsed = Papa.parse<Row>(csv.replace(/^﻿/, ''), PARSE)
  if (broken(parsed.errors) || missingColumns(parsed.meta.fields)) throw new DamagedCsvError()
  type Miss = { u: Unmatched; sci: string; kind: Exclude<ObsOrgRowKind, 'skip'> | null }
  type Group = { records: Map<string, SourceRecord>; unmatched: Miss[] }
  const groups = new Map<string, Group>()
  parsed.data.forEach((r, i) => {
    const group = r.group ?? ''
    let g = groups.get(group)
    if (!g) groups.set(group, (g = { records: new Map(), unmatched: [] }))
    const sci = r['scientific name']?.trim() ?? ''
    const com = r.name?.trim() || undefined
    const kind = rowKind(r['species type'], sci)
    const result: Resolution = kind === 'skip' ? { code: null, reason: 'not-species' } : resolveObsOrgName(t, sci, kind, synonyms)
    const date = isoDate(r['date first observed'])
    if (result.code === null) {
      const u: Unmatched = { source: 'obsorg', row: i + 1, reason: result.reason }
      if (sci) u.sci = sci
      if (com) u.com = com
      if (date) u.date = date
      g.unmatched.push({ u, sci, kind: kind === 'skip' ? null : kind })
    } else {
      const previous = g.records.get(result.code)
      if (!previous || earlier(date, previous.date)) g.records.set(result.code, { code: result.code, source: 'obsorg', ...(date ? { date } : {}) })
    }
  })
  const byCode = new Map<string, SourceRecord>()
  const misses: Miss[] = []
  for (const g of groups.values()) {
    if (!g.records.size) continue
    misses.push(...g.unmatched)
    for (const r of g.records.values()) {
      const previous = byCode.get(r.code)
      if (!previous || earlier(r.date, previous.date)) byCode.set(r.code, r)
    }
  }
  if (!byCode.size && !misses.length) return { error: 'no-birds' }
  misses.sort((a, b) => a.u.row - b.u.row)
  const suggest = obsOrgSuggester(t)
  for (const m of misses) {
    if (m.u.reason !== 'no-match' || !m.kind || !m.sci) continue
    const suggestion = suggest(m.sci, m.kind)
    if (suggestion) m.u.suggestion = suggestion
  }
  const records = [...byCode.values()]
  return { records, unmatched: misses.map((m) => m.u), skipped: 0, rows: parsed.data.length, undated: records.filter((r) => !r.date).length }
}

export type ObsOrgObservationsResult = ImportResult & {
  /** Rows left out, each counted once: an escape first, else an uncertain record. */
  excluded: { escape: number; uncertain: number }
  /** Counted species without any ISO date (as ObsOrgSpeciesResult's). */
  undated: number
}

/**
 * Observations, row by row (papaparse `step`; a File streams in chunks where FileReader exists, as eBird's parser
 * does), retaining only per-name/species/place aggregates. Per species the earliest dated row gives the date and
 * place; on equal dates the row with more place detail wins, as in buildList.
 * Coordinates are read to resolve a missing subdivision where a local boundary pack exists, when the export
 * marks the point as unobscured and supplies accuracy and embargo fields. Raw points never enter stored records.
 * Names are resolved exactly, once per distinct name; suggestions are computed
 * at the end, for unmatched names only (`obsOrgSuggester`).
 */
export async function parseObsOrgObservations(
  csv: string | File, t: TaxonomyIndex, synonyms: Record<string, string>, regions: Regions,
  onProgress?: (rows: number, frac?: number) => void,
  loadCoordinates: (country: string) => Promise<CoordinateRegion | undefined> = loadCoordinateRegion,
): Promise<ObsOrgObservationsResult | { error: 'no-birds' }> {
  const placeOf = makeObsOrgPlaces(regions)
  const byCode = new Map<string, SourceRecord>()
  const unmatched = new Map<string, Unmatched>()
  const kinds = new Map<string, Exclude<ObsOrgRowKind, 'skip'>>()
  const resolutions = new Map<string, Resolution>()
  const seen = new SeenAgg()
  const seenUnmatched = new SeenAgg()
  const excluded = { escape: 0, uncertain: 0 }
  let rows = 0
  // How far through the file: papaparse's cursor (decoded characters) over the file's size (bytes, near enough).
  const total = typeof csv === 'string' ? csv.length : csv.size
  let cursor = 0

  const onRow = (r: Row, location?: Place) => {
    rows++
    if (rows % 5000 === 0) onProgress?.(rows, total ? cursor / total : undefined)
    if (r['is escape']?.trim().toLowerCase() === 'true') {
      excluded.escape++
      return
    }
    if (r['is certain']?.trim().toLowerCase() === 'false') {
      excluded.uncertain++
      return
    }
    const sci = r['scientific name']?.trim() ?? ''
    if (!sci) return
    const kind = rowKind(r['species type'], sci)
    const key = `${kind}\u0000${sci}`
    let result = resolutions.get(key)
    if (!result) {
      result = kind === 'skip' ? { code: null, reason: 'not-species' } : resolveObsOrgName(t, sci, kind, synonyms)
      resolutions.set(key, result)
    }
    if (result.code === null && result.reason === 'not-species') {
      if (!unmatched.has(sci)) unmatched.set(sci, { source: 'obsorg', row: rows, sci, reason: 'not-species' })
      return
    }
    const date = isoDate(r.date)
    const division = r['country division']?.trim() ?? ''
    const place = regions.registry && location?.country && (division || location.sub1)
      ? resolveImportedPlace({
          namespace: 'obsorg', id: divisionId(location.country, division), country: location.country, fallback: location.sub1,
        }, regions)
      : location
    if (result.code === null) {
      if (kind !== 'skip' && !kinds.has(sci)) kinds.set(sci, kind)
      seenUnmatched.add(sci, place, date)
      const previous = unmatched.get(sci)
      if (!previous || earlier(date, previous.date)) {
        unmatched.set(sci, {
          source: 'obsorg', row: rows, sci, reason: result.reason,
          ...(date ? { date } : {}), ...(place ? { place } : {}),
        })
      }
    } else {
      seen.add(result.code, place, date)
      const previous = byCode.get(result.code)
      const tie = !!date && date === previous?.date &&
        detail(projectPlace(place, regions)) > detail(projectPlace(previous.place, regions))
      if (!previous || earlier(date, previous.date) || tie) {
        // Replace the whole lifer so an earlier unplaced row cannot inherit a later row's place.
        byCode.set(result.code, { code: result.code, source: 'obsorg', ...(date ? { date } : {}), ...(place ? { place } : {}) })
      }
    }
  }

  const finish = (): ObsOrgObservationsResult | { error: 'no-birds' } => {
    if (!byCode.size && !unmatched.size) return { error: 'no-birds' }
    const records = [...byCode.values()]
    for (const r of records) {
      r.seen = seen.get(r.code) ?? []
      if (regions.registry) r.seenMonths = seen.getMonths(r.code) ?? []
    }
    const list = [...unmatched.values()].sort((a, b) => a.row - b.row)
    const suggest = obsOrgSuggester(t)
    for (const u of list) {
      if (u.reason !== 'no-match') continue
      u.seen = seenUnmatched.get(u.sci!) ?? []
      if (regions.registry) u.seenMonths = seenUnmatched.getMonths(u.sci!) ?? []
      const suggestion = suggest(u.sci!, kinds.get(u.sci!) ?? 'species')
      if (suggestion) u.suggestion = suggestion
    }
    return { records, unmatched: list, skipped: 0, rows, excluded, undated: records.filter((r) => !r.date).length }
  }

  const run = (input: string | File) =>
    new Promise<ObsOrgObservationsResult | { error: 'no-birds' }>((resolve, reject) => {
      let failed = false
      let checked = false
      const lookups = new Map<string, CoordinateRegion | undefined>()
      const stream = typeof input !== 'string' ? input as unknown as {
        pause?: () => void; resume?: () => void; stop?: () => void
      } : undefined
      const fail = (parser: Papa.Parser, error: Error) => {
        failed = true
        reject(error)
        parser.abort()
        stream?.stop?.()
      }
      Papa.parse<Row>(input as never, {
        ...PARSE,
        step: (result: Papa.ParseStepResult<Row>, parser: Papa.Parser) => {
          if (failed) return
          if (!checked) {
            checked = true
            if (missingColumns(result.meta?.fields)) return fail(parser, new DamagedCsvError())
          }
          if (broken(result.errors)) return fail(parser, new DamagedCsvError())
          cursor = result.meta.cursor
          const row = result.data
          const place = placeOf(row.country ?? '', row['country division'] ?? '')
          const country = place?.country
          const publicPoint = country && hasCoordinateBoundaries(country) && !place?.sub1 &&
            row.obscurity?.trim().toLowerCase() === 'false' && row['embargo date']?.trim() === '' &&
            row.accuracy?.trim() && coordinates(row.lng, row.lat)
          if (!country || !publicPoint) {
            onRow(row, place)
            return
          }
          const processPoint = () => {
            const sub1 = lookups.get(country)?.(...publicPoint, row.accuracy)
            onRow(row, sub1?.startsWith(country + '-') && Object.hasOwn(regions.sub1, sub1) ? { country, sub1 } : place)
          }
          if (lookups.has(country)) {
            processPoint()
            return
          }
          stream?.pause?.()
          parser.pause()
          void loadCoordinates(country).catch(() => undefined).then((candidate) => {
            lookups.set(country, candidate)
            processPoint()
            parser.resume()
            stream?.resume?.()
          }).catch((error) => fail(parser, error instanceof Error ? error : new Error(String(error))))
        },
        complete: () => {
          if (!failed) resolve(finish())
        },
        error: () => {
          if (failed) return
          failed = true
          reject(new Error('Could not read observation.org CSV.'))
        },
      })
    })

  if (typeof csv === 'string') return run(csv.replace(/^\ufeff/, ''))
  // Browsers and workers stream a File through FileReader; Node has no FileReader, so read it as text there.
  if (typeof FileReader === 'undefined') return run((await csv.text()).replace(/^\ufeff/, ''))
  return run(textStream(csv) as unknown as File)
}

/**
 * A File as the Node-style readable papaparse streams from ("data", "end", "error"), decoded by one streaming
 * TextDecoder. papaparse's own File reader decodes each byte slice on its own, so a character split across two slices
 * ("België", "Île-de-France" at a chunk boundary) would turn into U+FFFD and its place stop resolving. Slices of
 * Papa.LocalChunkSize bytes, read one after another; the decoder drops a leading BOM.
 */
function textStream(file: File) {
  const listeners: Record<string, ((x?: unknown) => void)[]> = {}
  const emit = (ev: string, x?: unknown) => { for (const f of [...(listeners[ev] ?? [])]) f(x) }
  const decoder = new TextDecoder('utf-8')
  const size = Math.max(1, Papa.LocalChunkSize)
  let started = false
  let stopped = false
  let paused = false
  let next = 0
  const read = (start: number) => {
    if (stopped) return
    if (paused) {
      next = start
      return
    }
    if (start >= file.size) {
      const tail = decoder.decode()
      if (tail) emit('data', tail)
      stopped = true
      emit('end')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (stopped) return
      const text = decoder.decode(new Uint8Array(reader.result as ArrayBuffer), { stream: true })
      if (text) emit('data', text)
      read(start + size)
    }
    reader.onerror = () => {
      stopped = true
      emit('error', reader.error ?? new Error('Could not read observation.org CSV.'))
    }
    reader.readAsArrayBuffer(file.slice(start, start + size))
  }
  return {
    readable: true as const,
    read: () => null,
    pause() {
      paused = true
    },
    resume() {
      if (!paused || stopped) return
      paused = false
      read(next)
    },
    on(ev: string, f: (x?: unknown) => void) {
      ;(listeners[ev] ??= []).push(f)
      // papaparse listens for "data", "end" and "error" in turn: start once all three are in place.
      if (!started && listeners.data && listeners.end && listeners.error) {
        started = true
        read(0)
      }
      return this
    },
    removeListener(ev: string, f: (x?: unknown) => void) {
      // papaparse's clean-up after the end or an error: nothing more to read.
      listeners[ev] = (listeners[ev] ?? []).filter((g) => g !== f)
      if (ev === 'data') stopped = true
      return this
    },
    /** The parse gave up (a damaged file, `fail`): read no further. */
    stop() {
      stopped = true
    },
  }
}
