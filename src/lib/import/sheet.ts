import Papa from 'papaparse'
import type { ImportResult, Place, SourceRecord, Unmatched } from '@/lib/list/model'
import { SeenAgg } from '@/lib/list/seen'
import { IMPORT_REGION_ALIASES } from '@/lib/places/region-mapping'
import { divisionId, resolveImportedPlace } from '@/lib/places/registry'
import { foldName, resolveName, suggestName, type TaxonomyIndex } from '@/lib/species/resolve'
import type { Regions } from '@/lib/species/types'
import { countryNameMap, OBSORG_SUB1_ALIASES } from './obsorg-places'
import { makeSub1Index, SUB1_ALIASES } from './sub1-index'
import { SUB1_PARENT } from './sub1-parents'
import { excelSerialToIso, readXlsx } from './xlsx'

/** `noDate`: rows left out because the sheet's date column marks which birds were seen and they have none. */
export type SheetParseResult = ImportResult & { duplicates: number; noDate?: number }

type ColMap = {
  sci: number
  com: number
  country: number
  place: number
  date: number
  mark: number
  singleNameCol: boolean
}

const MONTHS: Record<string, string> = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
}

const SCI_HEADERS = new Set([
  'scientific name', 'scientific', 'sci name', 'sci', 'binomial', 'latin', 'latin name',
  'taxon', 'taxon name', 'species scientific', 'wetenschappelijke naam',
  'nombre cientifico', 'nombre científico', 'nome cientifico', 'nome científico',
])
const COM_HEADERS = new Set([
  'common name', 'common', 'english name', 'english', 'species', 'species name',
  'bird', 'bird name', 'name', 'vernacular', 'vernacular name', 'naam', 'soort',
  'nombre comun', 'nombre común', 'nome comum',
])
const COUNTRY_HEADERS = new Set(['country', 'countries', 'country code', 'nation', 'land', 'pais', 'país'])
const PLACE_HEADERS = new Set([
  'place', 'places', 'location', 'region', 'state', 'province', 'state province',
  'state/province', 'subnational1', 'county', 'area', 'site', 'locality', 'provincie', 'estado',
])
const DATE_HEADERS = new Set([
  'date', 'first seen', 'date seen', 'observed', 'observation date', 'date observed',
  'first observed', 'year', 'datum', 'fecha', 'data',
])
const MARK_HEADERS = new Set([
  'seen', 'tick', 'ticked', 'check', 'checked', 'marked', 'mark', 'lifelist',
  'life list', 'countable', 'status', 'x',
])

const MARK_YES = new Set(['x', '✓', '✔', '☑', '1', 'yes', 'y', 'true'])
const MARK_NO = new Set(['', '0', 'no', 'n', 'false', '-'])

const normHeader = (s: string) => s.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
const padDate = (d: string) => (d.length === 4 ? `${d}-00-00` : d.length === 7 ? `${d}-00` : d)
const earlier = (a: string | undefined, b: string | undefined) => !!a && (!b || padDate(a) < padDate(b))
const divisionKey = (folded: string) => folded.replace(/\s*\([^()]*\)\s*$/, '').trim()
const isNonSpeciesShape = (s: string) => /\b(?:sp|spp|spec)\.?$/i.test(s.trim()) || /\s+[×x]\s+/i.test(s)

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function validYmd(y: number, m: number, d: number): string | undefined {
  if (y < 1800 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return undefined
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`
}

type DateOrder = 'dmy' | 'mdy' | 'ambiguous'

function detectDateOrder(values: string[]): DateOrder {
  let dmy = false
  let mdy = false
  for (const raw of values) {
    const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(raw.trim())
    if (!m) continue
    const a = Number(m[1])
    const b = Number(m[2])
    if (a > 12 && b <= 12) dmy = true
    else if (b > 12 && a <= 12) mdy = true
  }
  if (dmy && !mdy) return 'dmy'
  if (mdy && !dmy) return 'mdy'
  return 'ambiguous'
}

export function parseSheetDate(raw: string | undefined, order: DateOrder = 'ambiguous', allowSerial = false): string | undefined {
  const s = (raw ?? '').trim()
  if (!s) return undefined

  let m = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:[T\s].*)?$/.exec(s)
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]))

  m = /^(\d{4})[./-](\d{1,2})$/.exec(s)
  if (m) {
    const y = Number(m[1]), mo = Number(m[2])
    if (y >= 1800 && y <= 2100 && mo >= 1 && mo <= 12) return `${y}-${pad2(mo)}`
  }

  if (/^\d{4}$/.test(s)) {
    const y = Number(s)
    if (y >= 1800 && y <= 2100) return s
  }

  m = /^(\d{1,2})[\s-]+([A-Za-z]+)\.?,?[\s-]+(\d{4})$/.exec(s)
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()]
    if (mo) return validYmd(Number(m[3]), Number(mo), Number(m[1]))
  }

  m = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s)
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()]
    if (mo) return validYmd(Number(m[3]), Number(mo), Number(m[2]))
  }

  m = /^([A-Za-z]+)\.?\s+(\d{4})$/.exec(s)
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()]
    const y = Number(m[2])
    if (mo && y >= 1800 && y <= 2100) return `${y}-${mo}`
  }

  m = /^(\d{4})\s+([A-Za-z]+)\.?$/.exec(s)
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()]
    const y = Number(m[1])
    if (mo && y >= 1800 && y <= 2100) return `${y}-${mo}`
  }

  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s)
  if (m) {
    const a = Number(m[1]), b = Number(m[2]), y = Number(m[3])
    if (y < 1800 || y > 2100) return undefined
    if (a > 12 && b <= 12) return validYmd(y, b, a)
    if (b > 12 && a <= 12) return validYmd(y, a, b)
    if (a === b && a <= 12) return validYmd(y, a, b)
    if (a <= 12 && b <= 12) {
      if (order === 'dmy') return validYmd(y, b, a)
      if (order === 'mdy') return validYmd(y, a, b)
      return String(y)
    }
  }

  if (allowSerial && /^\d{5}(?:\.\d+)?$/.test(s)) {
    const n = Number(s)
    if (n >= 10000 && n <= 80000) return excelSerialToIso(n)
  }

  return undefined
}

function makePlaceResolver(regions?: Regions) {
  if (!regions) {
    return {
      resolveCountries: () => [] as string[],
      resolvePlace: () => undefined as Place | undefined,
    }
  }
  const countries = countryNameMap(regions)
  const topOf = (code: string) => (Object.hasOwn(SUB1_PARENT, code) ? SUB1_PARENT[code] : code)
  const sub1Index = makeSub1Index(regions, [IMPORT_REGION_ALIASES, SUB1_ALIASES, OBSORG_SUB1_ALIASES], divisionKey, {
    onClash: 'none',
    rollUp: topOf,
  })

  const countryCode = (token: string): string | undefined => {
    const s = token.trim()
    if (!s) return undefined
    const upper = s.toUpperCase()
    if (/^[A-Z]{2}$/.test(upper)) {
      if (upper === 'UK') return 'GB'
      if (Object.hasOwn(regions.countries, upper)) return upper
    }
    const folded = foldName(s)
    if (folded === 'world') return undefined
    return countries.get(folded)
  }

  // Whole names first: "Congo, Democratic Republic of the" is one country, "Canada, Kenya" two. In an `address`
  // (a Location cell, "San Diego, CA, USA") a two-letter part is a province code once a part names a country in full.
  const resolveCountries = (raw: string, address = false): string[] => {
    const out: string[] = []
    const codeOnly: string[] = []
    const push = (code: string | undefined, part: string) => {
      if (!code || out.includes(code)) return
      out.push(code)
      if (/^[A-Za-z]{2}$/.test(part.trim())) codeOnly.push(code)
    }
    for (const seg of raw.split(/[;/]+/)) {
      const whole = countryCode(seg)
      if (whole) push(whole, seg)
      else for (const part of seg.split(',')) push(countryCode(part), part)
    }
    return address && codeOnly.length < out.length ? out.filter((c) => !codeOnly.includes(c)) : out
  }

  // A province by name or by its code after the country's ("BC" in Canada).
  const sub1Of = (country: string, name: string): string | undefined => {
    const byName = sub1Index(country, name)
    if (byName) return byName
    const code = `${country}-${name.trim().toUpperCase()}`
    return /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(code) && Object.hasOwn(regions.sub1, code) ? code : undefined
  }

  /** `division` is the place cell; the parts naming one of the row's `countries` are not a division. The rest is tried
   *  whole, then part by part, against the province index; only an unmatched rest becomes a province of its own. */
  const resolvePlace = (country: string, division: string, rowCountries: readonly string[] = [country]): Place | undefined => {
    const whole = division.trim()
    const isRowCountry = (s: string) => rowCountries.includes(countryCode(s) ?? '')
    const parts = isRowCountry(whole) ? [] : whole.split(',').map((s) => s.trim()).filter(Boolean)
    const rest = parts.filter((s) => !isRowCountry(s))
    let div = !rest.length ? '' : rest.length === parts.length ? whole : rest.join(', ')
    let rawSub1 = div ? sub1Of(country, div) : undefined
    if (!rawSub1 && rest.length > 1) {
      const part = rest.find((s) => sub1Of(country, s))
      if (part) {
        div = part
        rawSub1 = sub1Of(country, part)
      }
    }
    const top = rawSub1 ? topOf(rawSub1) : undefined
    const sub1 = top && regions.sub1[top] ? top : rawSub1
    if (regions.registry && (div || sub1)) {
      return resolveImportedPlace(
        {
          namespace: 'sheet',
          id: divisionId(country, div || sub1 || ''),
          country,
          fallback: sub1,
          label: div || undefined,
        },
        regions,
      )
    }
    return sub1 ? { country, sub1 } : { country }
  }

  return { resolveCountries, resolvePlace }
}

function findHeaderRow(rows: string[][]): { idx: number; cols: Partial<ColMap> } | null {
  const limit = Math.min(rows.length, 15)
  let bestIdx = -1
  let bestScore = 0
  let bestCols: Partial<ColMap> = {}

  for (let i = 0; i < limit; i++) {
    const row = rows[i]
    const cols: Partial<ColMap> = {}
    let score = 0
    for (let c = 0; c < row.length; c++) {
      const h = normHeader(row[c] ?? '')
      if (!h) continue
      if (SCI_HEADERS.has(h) && cols.sci === undefined) {
        cols.sci = c
        score += 2
      } else if (COM_HEADERS.has(h) && cols.com === undefined) {
        cols.com = c
        score += 2
      } else if (COUNTRY_HEADERS.has(h) && cols.country === undefined) {
        cols.country = c
        score += 1
      } else if (PLACE_HEADERS.has(h) && cols.place === undefined) {
        cols.place = c
        score += 1
      } else if (DATE_HEADERS.has(h) && cols.date === undefined) {
        cols.date = c
        score += 1
      } else if (MARK_HEADERS.has(h) && cols.mark === undefined) {
        cols.mark = c
        score += 1
      }
    }
    if (score > bestScore && (score >= 2 || (cols.sci !== undefined || cols.com !== undefined))) {
      bestScore = score
      bestIdx = i
      bestCols = cols
    }
  }

  return bestIdx >= 0 ? { idx: bestIdx, cols: bestCols } : null
}

function detectColumns(
  dataRows: string[][],
  headerCols: Partial<ColMap>,
  t: TaxonomyIndex,
  resolveCountries: (raw: string) => string[],
): ColMap {
  const maxCols = dataRows.slice(0, 50).reduce((m, r) => Math.max(m, r.length), 0)
  const sample = dataRows.slice(0, 50)

  let sci = headerCols.sci ?? -1
  let com = headerCols.com ?? -1
  let country = headerCols.country ?? -1
  const place = headerCols.place ?? -1
  let date = headerCols.date ?? -1
  let mark = headerCols.mark ?? -1

  const taken = () => new Set([sci, com, country, place, date, mark].filter((x) => x >= 0))

  if (sci < 0 && com < 0 && maxCols > 0) {
    let bestSci = -1, bestSciScore = 0
    let bestCom = -1, bestComScore = 0
    for (let c = 0; c < maxCols; c++) {
      if (taken().has(c)) continue
      let sciHits = 0
      let comHits = 0
      for (const r of sample) {
        const v = (r[c] ?? '').trim()
        if (!v) continue
        if (resolveName(t, { sci: v }, { suggest: false }).code) sciHits++
        if (resolveName(t, { com: v }, { suggest: false }).code) comHits++
      }
      if (sciHits > bestSciScore) {
        bestSciScore = sciHits
        bestSci = c
      }
      if (comHits > bestComScore) {
        bestComScore = comHits
        bestCom = c
      }
    }
    if (bestSci >= 0 && bestSci === bestCom) {
      if (bestSciScore >= bestComScore) sci = bestSci
      else com = bestCom
    } else {
      if (bestSci >= 0) sci = bestSci
      if (bestCom >= 0) com = bestCom
    }
    if (sci < 0 && com < 0) {
      for (let c = 0; c < maxCols; c++) {
        if (!taken().has(c) && sample.some((r) => (r[c] ?? '').trim())) {
          com = c
          break
        }
      }
    }
  }

  if (date < 0) {
    let bestDate = -1, bestScore = 0
    for (let c = 0; c < maxCols; c++) {
      if (taken().has(c)) continue
      let hits = 0, nonEmpty = 0
      for (const r of sample) {
        const v = (r[c] ?? '').trim()
        if (!v) continue
        nonEmpty++
        if (parseSheetDate(v, 'ambiguous', false)) hits++
      }
      if (nonEmpty > 0 && hits / nonEmpty >= 0.5 && hits > bestScore) {
        bestScore = hits
        bestDate = c
      }
    }
    if (bestDate >= 0) date = bestDate
  }

  if (country < 0) {
    let bestCountry = -1, bestScore = 0
    for (let c = 0; c < maxCols; c++) {
      if (taken().has(c)) continue
      let hits = 0, nonEmpty = 0
      for (const r of sample) {
        const v = (r[c] ?? '').trim()
        if (!v) continue
        nonEmpty++
        if (resolveCountries(v).length > 0) hits++
      }
      if (nonEmpty > 0 && hits / nonEmpty >= 0.4 && hits > bestScore) {
        bestScore = hits
        bestCountry = c
      }
    }
    if (bestCountry >= 0) country = bestCountry
  }

  if (mark < 0) {
    for (let c = 0; c < maxCols; c++) {
      if (taken().has(c)) continue
      let yes = 0, no = 0, other = 0
      for (const r of dataRows) {
        const v = (r[c] ?? '').trim().toLowerCase()
        if (MARK_YES.has(v)) yes++
        else if (MARK_NO.has(v)) no++
        else other++
      }
      if (yes > 0 && no > 0 && other === 0) {
        mark = c
        break
      }
    }
  }

  const singleNameCol = (sci >= 0) !== (com >= 0)
  return { sci, com, country, place, date, mark, singleNameCol }
}

function shouldFilterByMark(dataRows: string[][], cols: ColMap, dateOrder: DateOrder): 'mark' | 'date' | null {
  if (cols.mark >= 0) {
    let yes = 0, no = 0, other = 0
    for (const r of dataRows) {
      const raw = (r[cols.mark] ?? '').trim()
      const low = raw.toLowerCase()
      if (MARK_YES.has(low) || parseSheetDate(raw, dateOrder, true)) yes++
      else if (MARK_NO.has(low)) no++
      else other++
    }
    if (yes > 0 && no > 0 && other === 0) return 'mark'
  }
  if (cols.date >= 0 && dataRows.length >= 20) {
    let dated = 0, undated = 0
    for (const r of dataRows) {
      const raw = (r[cols.date] ?? '').trim()
      if (parseSheetDate(raw, dateOrder, true)) dated++
      else undated++
    }
    if (dated > 0 && undated >= dated * 3) return 'date'
  }
  return null
}

function isRowMarked(row: string[], col: number, dateOrder: DateOrder): boolean {
  const raw = (row[col] ?? '').trim()
  return MARK_YES.has(raw.toLowerCase()) || !!parseSheetDate(raw, dateOrder, true)
}

/** `lines[i]` is row i's number in the birder's file ("Spreadsheet row 6"), when `rows` leaves blank rows out. */
export function parseSheetRows(
  rows: string[][],
  t: TaxonomyIndex,
  regions?: Regions,
  onProgress?: (rows: number) => void,
  lines: readonly number[] = rows.map((_, i) => i + 1),
): SheetParseResult | { error: 'no-birds' } {
  const kept = rows.map((_, i) => i).filter((i) => rows[i].some((c) => c.trim()))
  const nonEmpty = kept.map((i) => rows[i])
  const lineOf = kept.map((i) => lines[i] ?? i + 1)
  if (!nonEmpty.length) return { error: 'no-birds' }

  const header = findHeaderRow(nonEmpty)
  const dataRows = header ? nonEmpty.slice(header.idx + 1) : nonEmpty
  const rowNo = header ? lineOf.slice(header.idx + 1) : lineOf
  if (!dataRows.length) return { error: 'no-birds' }

  const { resolveCountries, resolvePlace } = makePlaceResolver(regions)
  const cols = detectColumns(dataRows, header?.cols ?? {}, t, resolveCountries)
  if (cols.sci < 0 && cols.com < 0) return { error: 'no-birds' }

  const dateValues = cols.date >= 0 ? dataRows.map((r) => r[cols.date] ?? '') : []
  const dateOrder = detectDateOrder(dateValues)
  const filterMode = shouldFilterByMark(dataRows, cols, dateOrder)

  const seen = new SeenAgg()
  const byCode = new Map<string, SourceRecord>()
  const unmatchedMap = new Map<string, Unmatched>()
  const suggestions = new Map<string, string | undefined>()
  let duplicates = 0
  let noDate = 0
  let readRows = 0

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i]
    readRows++
    if (onProgress && readRows % 500 === 0) onProgress(readRows)

    if (filterMode === 'mark' && !isRowMarked(r, cols.mark, dateOrder)) continue
    if (filterMode === 'date' && !parseSheetDate(r[cols.date], dateOrder, true)) {
      noDate++
      continue
    }

    const rawSci = cols.sci >= 0 ? (r[cols.sci] ?? '').trim() : ''
    const rawCom = cols.com >= 0 ? (r[cols.com] ?? '').trim() : ''
    const sci = rawSci || undefined
    const com = rawCom || undefined
    if (!sci && !com) continue

    const query = cols.singleNameCol
      ? { sci: sci ?? com, com: com ?? sci }
      : { sci, com }
    const res = resolveName(t, query, { suggest: false })

    if (res.code === null && (res.reason === 'not-species' || (sci && isNonSpeciesShape(sci)) || (com && isNonSpeciesShape(com)))) {
      const key = `${sci ?? ''}\u0000${com ?? ''}`
      if (!unmatchedMap.has(key)) {
        unmatchedMap.set(key, {
          source: 'sheet',
          row: rowNo[i],
          ...(sci && !cols.singleNameCol ? { sci } : {}),
          ...(com ? { com } : sci ? { sci } : {}),
          reason: 'not-species',
        })
      }
      continue
    }

    const rawDate = cols.date >= 0 ? r[cols.date] : cols.mark >= 0 ? r[cols.mark] : undefined
    const date = parseSheetDate(rawDate, dateOrder, cols.date >= 0 || cols.mark >= 0)
    const rawCountry = cols.country >= 0 ? (r[cols.country] ?? '').trim() : ''
    const rawPlace = cols.place >= 0 ? (r[cols.place] ?? '').trim() : ''

    let countryCodes = rawCountry ? resolveCountries(rawCountry) : []
    if (!countryCodes.length && rawPlace && cols.country < 0) {
      countryCodes = resolveCountries(rawPlace, true)
    }

    const rowPlaces: Place[] = []
    for (const cc of countryCodes) {
      const p = resolvePlace(cc, rawPlace, countryCodes)
      if (p) rowPlaces.push(p)
    }
    const primaryPlace = rowPlaces[0]

    if (res.code === null) {
      const key = `${sci ?? ''}\u0000${com ?? ''}`
      if (!unmatchedMap.has(key)) {
        let suggestion: string | undefined
        if (suggestions.has(key)) {
          suggestion = suggestions.get(key)
        } else if (suggestions.size < 100) {
          suggestion = suggestName(t, query)
          suggestions.set(key, suggestion)
        }
        unmatchedMap.set(key, {
          source: 'sheet',
          row: rowNo[i],
          ...(sci && !cols.singleNameCol ? { sci } : {}),
          ...(com ? { com } : sci ? { sci } : {}),
          reason: 'no-match',
          ...(suggestion ? { suggestion } : {}),
          ...(date ? { date } : {}),
          ...(primaryPlace ? { place: primaryPlace } : {}),
        })
      }
      continue
    }

    for (const p of rowPlaces) seen.add(res.code, p, date)

    const prev = byCode.get(res.code)
    if (!prev) {
      const rec: SourceRecord = { code: res.code, source: 'sheet' }
      if (date) rec.date = date
      if (primaryPlace) rec.place = primaryPlace
      byCode.set(res.code, rec)
    } else {
      duplicates++
      // The lifer is the earliest row, with that row's own place (none if it has none, as in the Scythebill import);
      // a later row's place is in `seen`, never the lifer's.
      if (earlier(date, prev.date)) {
        prev.date = date
        if (primaryPlace) prev.place = primaryPlace
        else delete prev.place
      } else if (date === prev.date && !prev.place && primaryPlace) {
        prev.place = primaryPlace
      }
    }
  }

  // No row names a species: a budget or a notes file, not a bird list (its cells would be "unmatched names").
  if (!byCode.size) return { error: 'no-birds' }

  const records = [...byCode.values()]
  for (const r of records) {
    const s = seen.get(r.code)
    if (s?.length) r.seen = s
    if (regions?.registry) {
      const sm = seen.getMonths(r.code)
      if (sm?.length) r.seenMonths = sm
    }
  }

  return {
    records,
    unmatched: [...unmatchedMap.values()],
    skipped: 0,
    rows: dataRows.length,
    duplicates,
    ...(noDate ? { noDate } : {}),
  }
}

/** The text's rows, blank ones kept (as ['']), so a row's index is its line in the file. */
export function textToRows(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '')
  if (!clean.trim()) return []
  // The delimiter is guessed without the blank rows (they would sway papaparse's guess), then every row is kept.
  const delimiter = clean.includes('\t') ? '\t' : Papa.parse<string[]>(clean, { preview: 10, skipEmptyLines: 'greedy' }).meta.delimiter
  const parse = (quoteChar?: string) => Papa.parse<string[]>(clean, {
    header: false,
    delimiter,
    ...(quoteChar ? { quoteChar } : {}),
    skipEmptyLines: false,
  })
  let parsed = parse()
  // A quote that never closes ("Mallard pasted with a stray quote) would swallow every later line: read the text
  // without quoting instead, and drop the stray quotes around cells.
  const unclosed = parsed.errors.some((e) => e.code === 'MissingQuotes')
  if (unclosed) parsed = parse('\u0000')
  return parsed.data.map((r) => r.map((c) => {
    const cell = typeof c === 'string' ? c : String(c ?? '')
    return unclosed ? cell.replace(/^\s*"|"\s*$/g, '') : cell
  }))
}

export function parseSheetText(
  text: string,
  t: TaxonomyIndex,
  regions?: Regions,
  onProgress?: (rows: number) => void,
): SheetParseResult | { error: 'no-birds' } {
  return parseSheetRows(textToRows(text), t, regions, onProgress)
}

export function parseSheetXlsx(
  data: Uint8Array | ArrayBuffer,
  t: TaxonomyIndex,
  regions?: Regions,
  onProgress?: (rows: number) => void,
): SheetParseResult | { error: 'no-birds' } {
  const sheets = readXlsx(data)
  if (sheets.length === 1) return parseSheetRows(sheets[0].rows, t, regions, onProgress, sheets[0].lines)

  let bestResult: SheetParseResult | null = null
  for (const sheet of sheets) {
    const res = parseSheetRows(sheet.rows, t, regions, onProgress, sheet.lines)
    if ('error' in res) continue
    if (!bestResult || res.records.length > bestResult.records.length) {
      bestResult = res
    }
  }
  return bestResult ?? { error: 'no-birds' }
}
