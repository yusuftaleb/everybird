import Papa from 'papaparse'
import type { ImportResult, Place } from '@/lib/list/model'
import { foldName, resolveName, type TaxonomyIndex } from '@/lib/species/resolve'
import type { Regions } from '@/lib/species/types'
import { DamagedCsvError } from './obsorg'
import { createAggregator } from './scythebill'

const PROGRESS_EVERY = 5000
/** The columns read; every other one (coordinates, location names, comments, diary notes) is never touched. */
const REQUIRED = ['common name', 'scientific name', 'date', 'country code', 'state', 'state code', 'only heard', "don't count", 'main group'] as const

type Row = Record<string, string | undefined>

const isoDate = (raw: string | undefined) => {
  const s = (raw ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined
}
/** Any value but empty or 0 marks a sighting the birder doesn't count (the column was empty in every sample). */
const notCounted = (v: string | undefined) => {
  const s = (v ?? '').trim()
  return s !== '' && s !== '0'
}

/** Country from its ISO code; the province from State Code, else from State only when it names one exactly. */
function makePlaceResolver(regions?: Regions): (countryCode: string, state: string, stateCode: string) => Place | undefined {
  const byName = new Map<string, string>()
  for (const [code, name] of Object.entries(regions?.sub1 ?? {})) {
    const key = `${code.slice(0, 2)}\u0000${foldName(name)}`
    byName.set(key, byName.has(key) ? '' : code) // a name two provinces share names neither
  }
  return (countryCode, state, stateCode) => {
    const country = countryCode.trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(country)) return undefined
    if (!regions) return { country }
    const sc = stateCode.trim().toUpperCase()
    const coded = sc ? (sc.startsWith(country + '-') ? sc : `${country}-${sc}`) : ''
    const sub1 = (coded && Object.hasOwn(regions.sub1, coded) ? coded : '') ||
      (state.trim() ? byName.get(`${country}\u0000${foldName(state)}`) : '')
    return sub1 ? { country, sub1 } : { country }
  }
}

/**
 * Parse iGoTerra's sightings export (Backup.csv). Only birds (`Main Group` "Birds"); names by scientific name, then
 * common name; the earliest dated row per species gives its date and place (iGoTerra's FO column is not trusted).
 * Rows marked Don't Count are left out; a species with no other row is one skipped entry.
 */
export function parseIgoterra(
  csv: string,
  t: TaxonomyIndex,
  regions?: Regions,
  onProgress?: (rows: number) => void,
): ImportResult | { error: 'no-birds' } {
  const parsed = Papa.parse<Row>(csv.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })
  // A stray quote inside a free-text field (InvalidQuotes) still splits the row right; one that runs on, or rows that
  // no longer line up with the header, mean the file is damaged.
  if (parsed.errors.some((e) => e.code === 'MissingQuotes' || e.type === 'FieldMismatch')) throw new DamagedCsvError()
  const fields = parsed.meta.fields ?? []
  if (!REQUIRED.every((h) => fields.includes(h))) throw new DamagedCsvError()

  const placeOf = makePlaceResolver(regions)
  const agg = createAggregator(t, 'igoterra')
  const dontCount = new Set<string>()
  for (let i = 0; i < parsed.data.length; i++) {
    const rowNo = i + 1
    if (onProgress && rowNo % PROGRESS_EVERY === 0) onProgress(rowNo)
    const r = parsed.data[i]
    if ((r['main group'] ?? '').trim().toLowerCase() !== 'birds') continue
    const sci = r['scientific name']?.trim() || r['scientific subspecies']?.trim() || undefined
    const com = r['common name']?.trim() || undefined
    if (notCounted(r["don't count"])) {
      const code = resolveName(t, { sci, com }, { suggest: false }).code
      if (code) dontCount.add(code)
      continue
    }
    const place = placeOf(r['country code'] ?? '', r['state'] ?? '', r['state code'] ?? '')
    agg.addRow(rowNo, sci, com, isoDate(r['date']), place, (r['only heard'] ?? '').trim() === '1')
  }

  const out = agg.finish(parsed.data.length)
  const counted = 'error' in out ? new Set<string>() : new Set(out.records.map((r) => r.code))
  const offList = [...dontCount].filter((code) => !counted.has(code)).length
  if ('error' in out) return offList ? { records: [], unmatched: [], skipped: offList, rows: parsed.data.length } : out
  return { ...out, skipped: out.skipped + offList }
}
