import Papa from 'papaparse'
import type { ImportResult, Place, SourceRecord, Unmatched } from '@/lib/list/model'
import { resolveName, type Resolution, type TaxonomyIndex } from '@/lib/species/resolve'
import { parseEbirdDate } from './ebird-lifelist'
import { SeenAgg } from '@/lib/list/seen'
import { placeFromSubnational } from './places'

const PROGRESS_EVERY = 5000
type Row = Record<string, string | undefined>

/** eBird's MyEBirdData.csv uses ISO dates; the life-list style ('30 Sep 2026') is tolerated too. */
function rowDate(s: string | undefined): string | undefined {
  const v = (s ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : parseEbirdDate(v)
}

function rowPlace(r: Row): Place | undefined {
  const sp = (r['State/Province'] ?? '').trim()
  if (!sp) return undefined
  const county = (r['County'] ?? '').trim()
  return { ...placeFromSubnational(sp), sub2: county || undefined }
}

/** The row's seen-here key, "CA-BC|County" or "KE", straight from the raw columns (no Place object per row). */
function rowKey(r: Row): string | undefined {
  const sp = (r['State/Province'] ?? '').trim().toUpperCase()
  if (!sp || sp[0] === '-') return undefined
  const county = (r['County'] ?? '').trim()
  return county ? `${sp}|${county}` : sp
}

const earlier = (date: string | undefined, prev: string | undefined) => !!date && (!prev || date < prev)

/**
 * Stream eBird's full export (MyEBirdData.csv). Only per-species state is kept, never the rows.
 * Latitude, longitude, location names, comments and checklist details are never read.
 * - `skipped` counts ROWS that resolve to not-species (sp., slash, hybrid, domestic).
 * - `unmatched` has one entry per distinct (sci, com) name; `row` is the 1-based data-row index of that
 *   name's earliest-dated row, which also supplies its date and place.
 * - Per species the earliest row wins (date and place); `media` is true if ANY row has ML Catalog Numbers.
 * - Seen here (seen.ts): every record and unmatched name gets `seen`, one entry per place (province + county) it was
 *   seen in, with the earliest date there. Aggregated per species and place as the rows stream by; rows are not kept.
 */
export function parseEbirdMyData(csv: string | File, t: TaxonomyIndex, onProgress?: (rows: number) => void): Promise<ImportResult> {
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
      const k = rowKey(r)
      if (k) seenUnmatched.addKey(key, k, date ?? '')
      const prev = unmatchedByName.get(key)
      if (!prev || earlier(date, prev.date)) {
        const u: Unmatched = { source: 'ebird', row: rowNo, reason: res.reason }
        if (sci) u.sci = sci
        if (com) u.com = com
        if (res.suggestion) u.suggestion = res.suggestion
        if (date) u.date = date
        const place = rowPlace(r)
        if (place) u.place = place
        unmatchedByName.set(key, u)
      }
      return
    }
    const date = rowDate(r['Date'])
    const media = (r['ML Catalog Numbers'] ?? '').trim() !== ''
    const k = rowKey(r)
    if (k) seen.addKey(res.code, k, date ?? '')
    const prev = byCode.get(res.code)
    if (!prev) {
      const rec: SourceRecord = { code: res.code, source: 'ebird' }
      if (date) rec.date = date
      const place = rowPlace(r)
      if (place) rec.place = place
      if (media) rec.media = true
      byCode.set(res.code, rec)
      return
    }
    if (media) prev.media = true
    if (earlier(date, prev.date)) {
      prev.date = date
      const place = rowPlace(r)
      if (place) prev.place = place
    }
  }

  const finish = (): ImportResult => {
    const records = [...byCode.values()]
    for (const r of records) r.seen = seen.get(r.code) ?? []
    const unmatched: Unmatched[] = []
    for (const [key, u] of unmatchedByName) unmatched.push({ ...u, seen: seenUnmatched.get(key) ?? [] })
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

  return (async () => {
    if (typeof csv === 'string') return run(csv.replace(/^﻿/, ''))
    // Browsers and workers stream a File through FileReader; Node has no FileReader, so read it as text.
    if (typeof FileReader === 'undefined') return run((await csv.text()).replace(/^﻿/, ''))
    return run(csv)
  })()
}
