import Papa from 'papaparse'
import type { ImportResult, Place, SourceRecord, Unmatched } from '@/lib/list/model'
import { SeenAgg } from '@/lib/list/seen'
import { IMPORT_REGION_ALIASES } from '@/lib/places/region-mapping'
import { vietnamEdition } from '@/lib/places/region-mapping'
import { divisionId, resolveImportedPlace } from '@/lib/places/registry'
import { foldName, resolveName, suggestName, type Resolution, type TaxonomyIndex } from '@/lib/species/resolve'
import type { Regions } from '@/lib/species/types'
import { importEbirdPlace } from './ebird-places'
import { DamagedCsvError } from './obsorg'
import { countryNameMap, OBSORG_SUB1_ALIASES } from './obsorg-places'
import { makeSub1Index, SUB1_ALIASES } from './sub1-index'
import { SUB1_PARENT } from './sub1-parents'

const PROGRESS_EVERY = 5000
const SUGGEST_MAX = 200
const REQUIRED_CSV_HEADERS = ['scientific', 'subspecies', 'index', 'trip name'] as const

type CsvRow = Record<string, string | undefined>

const padDate = (d: string) => (d.length === 4 ? `${d}-00-00` : d.length === 7 ? `${d}-00` : d)
const earlier = (date: string | undefined, prev: string | undefined) => !!date && (!prev || padDate(date) < padDate(prev))
const placeDetail = (p: Place | undefined) => (p?.sub2 ? 3 : p?.sub1 ? 2 : p?.country ? 1 : 0)
const divisionKey = (folded: string) => folded.replace(/\s*\([^()]*\)\s*$/, '').trim()
const isHeardOnly = (v: string | undefined) => /^(?:y|yes|true|1)$/i.test((v ?? '').trim())

function isoDate(raw: string | undefined): string | undefined {
  const s = (raw ?? '').trim()
  return /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(s) ? s : undefined
}

function parseUsDate(raw: string | undefined): string | undefined {
  const s = (raw ?? '').trim()
  if (!s) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (!m) return undefined
  const mo = Number(m[1])
  const d = Number(m[2])
  const y = Number(m[3])
  if (y < 1800 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return undefined
  const check = new Date(Date.UTC(y, mo - 1, d))
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return undefined
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function makeCsvPlaceResolver(regions?: Regions): (countryRaw: string, stateRaw: string, countyRaw: string) => Place | undefined {
  if (!regions) return () => undefined
  const countries = countryNameMap(regions)
  const topOf = (code: string) => (Object.hasOwn(SUB1_PARENT, code) ? SUB1_PARENT[code] : code)
  const sub1Index = makeSub1Index(regions, [IMPORT_REGION_ALIASES, SUB1_ALIASES, OBSORG_SUB1_ALIASES], divisionKey, {
    onClash: 'none',
    rollUp: topOf,
  })
  const cache = new Map<string, Place | undefined>()

  return (countryRaw, stateRaw, countyRaw) => {
    const cRaw = countryRaw.trim()
    const sRaw = stateRaw.trim()
    const kRaw = countyRaw.trim()
    const key = `${cRaw}\u0000${sRaw}\u0000${kRaw}`
    if (cache.has(key)) return cache.get(key)

    let country: string | undefined
    if (cRaw) {
      const folded = foldName(cRaw)
      if (folded !== 'world') {
        country = countries.get(folded)
        if (!country && /^[A-Z]{2}$/i.test(cRaw)) {
          const upper = cRaw.toUpperCase()
          if (Object.hasOwn(regions.countries, upper)) country = upper
        }
      }
    }

    let place: Place | undefined
    if (country) {
      const rawSub1 = sRaw ? sub1Index(country, sRaw) : undefined
      const top = rawSub1 ? topOf(rawSub1) : undefined
      const sub1 = top && regions.sub1[top] ? top : rawSub1
      if (regions.registry && (sRaw || sub1)) {
        place = resolveImportedPlace(
          {
            namespace: 'scythebill',
            id: divisionId(country, sRaw || sub1 || ''),
            country,
            county: kRaw || undefined,
            fallback: sub1,
            label: sRaw || undefined,
          },
          regions,
        )
      } else {
        place = { country }
        if (sub1) place.sub1 = sub1
        if (kRaw) place.sub2 = kRaw
      }
    }

    cache.set(key, place)
    return place
  }
}

function resolveScythebillName(
  t: TaxonomyIndex,
  sci: string | undefined,
  com: string | undefined,
  canSuggest: () => boolean,
): Resolution {
  if (sci) {
    const direct = resolveName(t, { sci }, { suggest: false })
    if (direct.code !== null || direct.reason === 'not-species') return direct
    if (/\/|\s+x\s+|×|(?:^|\s)sp\.?$/i.test(sci)) return { code: null, reason: 'not-species' }
    if (!/\(/.test(sci)) {
      const words = sci.trim().split(/\s+/)
      if (words.length > 2) {
        const binomial = `${words[0]} ${words[1]}`
        const sub = resolveName(t, { sci: binomial }, { suggest: false })
        if (sub.code !== null || sub.reason === 'not-species') return sub
      }
    }
  }
  if (com) {
    const byCom = resolveName(t, { com }, { suggest: false })
    if (byCom.code !== null || byCom.reason === 'not-species') return byCom
  }
  const suggestion = canSuggest() ? suggestName(t, { sci, com }) : undefined
  return suggestion ? { code: null, reason: 'no-match', suggestion } : { code: null, reason: 'no-match' }
}

type Agg = {
  addRow: (
    rowNo: number,
    sci: string | undefined,
    com: string | undefined,
    date: string | undefined,
    place: Place | undefined,
    heard: boolean,
  ) => void
  finish: (totalRows: number) => ImportResult | { error: 'no-birds' }
}

function createAggregator(t: TaxonomyIndex): Agg {
  const byCode = new Map<string, SourceRecord>()
  const heardAll = new Map<string, boolean>()
  const unmatchedByName = new Map<string, Unmatched>()
  const resolved = new Map<string, Resolution>()
  const seen = new SeenAgg()
  const seenUnmatched = new SeenAgg()
  let skipped = 0
  let suggestions = 0
  const canSuggest = () => {
    if (suggestions >= SUGGEST_MAX) return false
    suggestions++
    return true
  }

  return {
    addRow(rowNo, sci, com, date, place, heard) {
      if (!sci && !com) return
      const key = `${sci ?? ''}\u0000${com ?? ''}`
      let res = resolved.get(key)
      if (!res) {
        res = resolveScythebillName(t, sci, com, canSuggest)
        resolved.set(key, res)
      }
      if (res.code === null) {
        if (res.reason === 'not-species') {
          skipped++
          return
        }
        seenUnmatched.add(key, place, date)
        const prev = unmatchedByName.get(key)
        if (!prev || earlier(date, prev.date)) {
          const u: Unmatched = { source: 'scythebill', row: rowNo, reason: res.reason }
          if (sci) u.sci = sci
          if (com) u.com = com
          if (res.suggestion) u.suggestion = res.suggestion
          if (date) u.date = date
          if (place) u.place = place
          unmatchedByName.set(key, u)
        }
        return
      }
      seen.add(res.code, place, date)
      const prev = byCode.get(res.code)
      if (!prev) {
        const rec: SourceRecord = { code: res.code, source: 'scythebill' }
        if (date) rec.date = date
        if (place) rec.place = place
        byCode.set(res.code, rec)
        heardAll.set(res.code, heard)
        return
      }
      if (!heard) heardAll.set(res.code, false)
      if (earlier(date, prev.date) || (date === prev.date && placeDetail(place) > placeDetail(prev.place))) {
        byCode.set(res.code, {
          code: res.code,
          source: 'scythebill',
          ...(date ? { date } : {}),
          ...(place ? { place } : {}),
        })
      }
    },
    finish(totalRows) {
      if (byCode.size === 0 && unmatchedByName.size === 0 && skipped === 0) return { error: 'no-birds' }
      const records = [...byCode.values()]
      for (const r of records) {
        r.seen = seen.get(r.code) ?? []
        r.seenMonths = seen.getMonths(r.code) ?? []
        if (heardAll.get(r.code)) r.heard = true
      }
      const unmatched: Unmatched[] = []
      for (const [key, u] of unmatchedByName) {
        unmatched.push({ ...u, seen: seenUnmatched.get(key) ?? [], seenMonths: seenUnmatched.getMonths(key) ?? [] })
      }
      return { records, unmatched, skipped, rows: totalRows }
    },
  }
}

export function parseScythebillCsv(
  csv: string,
  t: TaxonomyIndex,
  regions?: Regions,
  onProgress?: (rows: number) => void,
): ImportResult | { error: 'no-birds' } {
  const text = csv.replace(/^\uFEFF/, '')
  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })
  if (parsed.errors.some((e) => e.type === 'Quotes')) throw new DamagedCsvError()
  const fields = parsed.meta.fields ?? []
  if (!fields.length) return { error: 'no-birds' }
  if (!REQUIRED_CSV_HEADERS.every((h) => fields.includes(h))) throw new DamagedCsvError()
  if (parsed.data.length === 0) return { error: 'no-birds' }

  const resolvePlace = makeCsvPlaceResolver(regions)
  const agg = createAggregator(t)

  for (let i = 0; i < parsed.data.length; i++) {
    const rowNo = i + 1
    if (onProgress && rowNo % PROGRESS_EVERY === 0) onProgress(rowNo)
    const r = parsed.data[i]
    const sci = r['scientific']?.trim() || undefined
    const com = r['common']?.trim() || undefined
    const date = isoDate(r['date'])
    const place = resolvePlace(r['country'] ?? '', r['state'] ?? '', r['county'] ?? '')
    const heard = isHeardOnly(r['heard only'])
    agg.addRow(rowNo, sci, com, date, place, heard)
  }

  return agg.finish(parsed.data.length)
}

function rowSpCode(row: string[]): string {
  const state = (row[10] ?? '').trim().toUpperCase()
  const country = (row[11] ?? '').trim().toUpperCase()
  if (state && country) return state.startsWith(country + '-') ? state : `${country}-${state}`
  return state || country
}

export function parseScythebillEbird(
  csv: string,
  t: TaxonomyIndex,
  regions?: Regions,
  onProgress?: (rows: number) => void,
): ImportResult | { error: 'no-birds' } {
  const text = csv.replace(/^\uFEFF/, '')
  const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true })
  if (parsed.errors.some((e) => e.type === 'Quotes')) throw new DamagedCsvError()
  if (parsed.data.length === 0) return { error: 'no-birds' }

  const edition = vietnamEdition(parsed.data.map(rowSpCode))
  const agg = createAggregator(t)

  for (let i = 0; i < parsed.data.length; i++) {
    const rowNo = i + 1
    if (onProgress && rowNo % PROGRESS_EVERY === 0) onProgress(rowNo)
    const row = parsed.data[i]
    if (row.length < 12) continue
    const com = (row[0] ?? '').trim() || undefined
    const genus = (row[1] ?? '').trim()
    const epithet = (row[2] ?? '').trim()
    const sci = genus && epithet ? `${genus} ${epithet}` : genus || undefined
    const date = parseUsDate(row[8])
    const place = importEbirdPlace(rowSpCode(row), edition, undefined, regions)
    agg.addRow(rowNo, sci, com, date, place, false)
  }

  return agg.finish(parsed.data.length)
}
