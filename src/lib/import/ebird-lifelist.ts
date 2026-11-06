import Papa from 'papaparse'
import type { ImportResult, Place, SourceRecord, Unmatched } from '@/lib/list/model'
import { resolveName, type TaxonomyIndex } from '@/lib/species/resolve'
import { placeFromSubnational } from './places'

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * '30 Sep 2026' or '6 Sep 2026' -> '2026-09-30'. Empty, unparseable or non-English month names give
 * undefined (eBird may localise month names; we never guess).
 */
export function parseEbirdDate(s: string | undefined): string | undefined {
  const m = /^(\d{1,2})\s+([A-Za-z]{3})\.?\s+(\d{4})$/.exec((s ?? '').trim())
  if (!m) return undefined
  const mi = MONTHS.indexOf(m[2].toLowerCase())
  const day = Number(m[1])
  if (mi < 0 || day < 1 || day > 31) return undefined
  return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Parse eBird's "life list" CSV. Rows with Countable !== '1' are counted in `skipped`. A Countable=1 row
 * that does not resolve goes to `unmatched` (never dropped). `Unmatched.row` is the 1-based data row index
 * (first row after the header is 1). A species seen twice keeps its earliest date (and that row's place).
 * `Location` is ignored.
 */
export function parseEbirdLifeList(csv: string, t: TaxonomyIndex): ImportResult {
  const text = csv.replace(/^﻿/, '')
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
  const byCode = new Map<string, SourceRecord>()
  const unmatched: Unmatched[] = []
  let skipped = 0
  data.forEach((r, i) => {
    if ((r['Countable'] ?? '').trim() !== '1') {
      skipped++
      return
    }
    const sci = r['Scientific Name']?.trim() || undefined
    const com = r['Common Name']?.trim() || undefined
    const date = parseEbirdDate(r['Date'])
    const sp = (r['S/P'] ?? '').trim()
    const place: Place | undefined = sp ? placeFromSubnational(sp) : undefined
    const res = resolveName(t, { sci, com })
    if (res.code === null) {
      const u: Unmatched = { source: 'ebird', row: i + 1, reason: res.reason }
      if (sci) u.sci = sci
      if (com) u.com = com
      if (res.suggestion) u.suggestion = res.suggestion
      if (date) u.date = date
      if (place) u.place = place
      unmatched.push(u)
      return
    }
    const prev = byCode.get(res.code)
    if (!prev) {
      const rec: SourceRecord = { code: res.code, source: 'ebird' }
      if (date) rec.date = date
      if (place) rec.place = place
      byCode.set(res.code, rec)
    } else if (date && (!prev.date || date < prev.date)) {
      prev.date = date
      if (place) prev.place = place
    }
  })
  return { records: [...byCode.values()], unmatched, skipped, rows: data.length }
}
