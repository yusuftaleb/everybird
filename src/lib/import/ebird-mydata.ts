import Papa from 'papaparse'
import type { ImportResult, SourceRecord, Unmatched } from '@/lib/list/model'
import { resolveName, type Resolution, type TaxonomyIndex } from '@/lib/species/resolve'
import { parseEbirdDate } from './ebird-lifelist'
import { SeenAgg } from '@/lib/list/seen'
import { importEbirdPlace } from './ebird-places'
import type { Regions } from '@/lib/species/types'
import { ebirdRegion, vietnamEdition } from '@/lib/places/region-mapping'
import { loadVietnamCoordinateRegion, type CoordinateRegion } from '@/lib/places/coordinate-region'

const PROGRESS_EVERY = 5000
type Row = Record<string, string | undefined>

/** eBird's MyEBirdData.csv uses ISO dates; the life-list style ('30 Sep 2026') is tolerated too. */
function rowDate(s: string | undefined): string | undefined {
  const v = (s ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : parseEbirdDate(v)
}

const provinceCode = (r: Row) => (r['State/Province'] ?? '').trim().toUpperCase()

/** Only distinct Vietnam codes are kept while determining the export's edition. */
function vietnamCodes(input: string | File): Promise<Set<string>> {
  const codes = new Set<string>()
  return new Promise((resolve, reject) => {
    Papa.parse<Row>(input as never, {
      header: true,
      skipEmptyLines: true,
      step: ({ data }) => {
        const code = provinceCode(data)
        if (code === 'VN' || code.startsWith('VN-')) codes.add(code)
      },
      complete: () => resolve(codes),
      error: reject,
    })
  })
}

const earlier = (date: string | undefined, prev: string | undefined) => !!date && (!prev || date < prev)

/**
 * Stream eBird's full export (MyEBirdData.csv). Only per-species state is kept, never the rows.
 * Coordinates are read only when needed to identify an ambiguous Vietnamese province. Only the region is kept.
 * - `skipped` counts ROWS that resolve to not-species (sp., slash, hybrid, domestic).
 * - `unmatched` has one entry per distinct (sci, com) name; `row` is the 1-based data-row index of that
 *   name's earliest-dated row, which also supplies its date and place.
 * - Per species the earliest row wins (date and place); `media` is true if ANY row has ML Catalog Numbers.
 * - Seen here (seen.ts): every record and unmatched name gets `seen`, one entry per place (province + county) it was
 *   seen in, with the earliest date there; seenMonths keeps all distinct months at each place. Aggregated per species and place as the rows stream by; rows are not kept.
 */
export async function parseEbirdMyData(
  csv: string | File, t: TaxonomyIndex, onProgress?: (rows: number) => void,
  loadCoordinates: () => Promise<CoordinateRegion | undefined> = loadVietnamCoordinateRegion,
  regions?: Regions,
): Promise<ImportResult> {
  const input = typeof csv === 'string' ? csv.replace(/^\uFEFF/, '') :
    typeof FileReader === 'undefined' ? (await csv.text()).replace(/^\uFEFF/, '') : csv
  const codes = await vietnamCodes(input)
  const edition = vietnamEdition(codes)
  const needsCoordinates = [...codes].some((code) => ebirdRegion(code, edition) === 'VN')
  const coordinateRegion = needsCoordinates ? await loadCoordinates() : undefined

  function rowPlace(r: Row) {
    const code = provinceCode(r)
    const coordinate = coordinateRegion && ebirdRegion(code, edition) === 'VN'
      ? coordinateRegion(r.Longitude, r.Latitude) : undefined
    return importEbirdPlace(code, edition, r.County?.trim(), regions, coordinate)
  }
  const byCode = new Map<string, SourceRecord>()
  const unmatchedByName = new Map<string, Unmatched>()
  const resolved = new Map<string, Resolution>()
  const seen = new SeenAgg()
  const seenUnmatched = new SeenAgg()
  let skipped = 0
  let rowNo = 0

  function onRow(r: Row) {
    rowNo++
    if (onProgress && rowNo % PROGRESS_EVERY === 0) onProgress(rowNo)
    const sci = r['Scientific Name']?.trim() || undefined
    const com = r['Common Name']?.trim() || undefined
    if (!sci && !com) return
    const key = `${sci ?? ''}\u0000${com ?? ''}`
    let res = resolved.get(key)
    if (!res) {
      res = resolveName(t, { sci, com })
      resolved.set(key, res)
    }
    if (res.code === null) {
      if (res.reason === 'not-species') {
        skipped++
        return
      }
      const date = rowDate(r['Date'])
      const place = rowPlace(r)
      seenUnmatched.add(key, place, date)
      const prev = unmatchedByName.get(key)
      if (!prev || earlier(date, prev.date)) {
        const u: Unmatched = { source: 'ebird', row: rowNo, reason: res.reason }
        if (sci) u.sci = sci
        if (com) u.com = com
        if (res.suggestion) u.suggestion = res.suggestion
        if (date) u.date = date
        if (place) u.place = place
        unmatchedByName.set(key, u)
      }
      return
    }
    const date = rowDate(r['Date'])
    const media = (r['ML Catalog Numbers'] ?? '').trim() !== ''
    const place = rowPlace(r)
    seen.add(res.code, place, date)
    const prev = byCode.get(res.code)
    if (!prev) {
      const rec: SourceRecord = { code: res.code, source: 'ebird' }
      if (date) rec.date = date
      if (place) rec.place = place
      if (media) rec.media = true
      byCode.set(res.code, rec)
      return
    }
    if (media) prev.media = true
    if (earlier(date, prev.date)) {
      prev.date = date
      if (place) prev.place = place
    }
  }

  const finish = (): ImportResult => {
    const records = [...byCode.values()]
    for (const r of records) {
      r.seen = seen.get(r.code) ?? []
      r.seenMonths = seen.getMonths(r.code) ?? []
    }
    const unmatched: Unmatched[] = []
    for (const [key, u] of unmatchedByName) unmatched.push({ ...u, seen: seenUnmatched.get(key) ?? [], seenMonths: seenUnmatched.getMonths(key) ?? [] })
    return { records, unmatched, skipped, rows: rowNo }
  }

  const run = (input: string | File) =>
    new Promise<ImportResult>((resolve, reject) => {
      Papa.parse<Row>(input as never, {
        header: true,
        skipEmptyLines: true,
        step: (results) => onRow(results.data),
        complete: () => resolve(finish()),
        error: (e: unknown) => reject(e instanceof Error ? e : new Error(String(e))),
      })
    })

  return run(input)
}
