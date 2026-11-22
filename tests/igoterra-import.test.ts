import { readFileSync } from 'node:fs'
import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import { en } from '@/i18n/messages/en'
import { detectFile, slotOfKind } from '@/lib/import/detect'
import { parseIgoterra } from '@/lib/import/igoterra'
import { handleParseMessage, type ParseResponse } from '@/lib/import/parse.worker'
import { buildList } from '@/lib/list/build-list'
import { fromJson, toJson } from '@/lib/list/export'
import type { ImportResult } from '@/lib/list/model'
import { sourceCounts, summaryLine } from '@/lib/list/source-counts'
import { emptySaved, replaceSource } from '@/lib/list/storage'
import { recordsOf } from '@/lib/list/store'
import { buildTaxonomyIndex } from '@/lib/species/load'
import type { Regions, TaxonRow } from '@/lib/species/types'

const rawTaxon = JSON.parse(readFileSync('public/data/taxonomy.v1.json', 'utf8')) as { taxa: TaxonRow[] }
const taxonomy = buildTaxonomyIndex(rawTaxon.taxa)
const regions = JSON.parse(readFileSync('public/data/regions.v1.json', 'utf8')) as Regions
const fixture = readFileSync('tests/fixtures/igoterra/Backup.csv', 'utf8')
const HEADER = fixture.replace(/^﻿/, '').split(/\r?\n/, 1)[0]
const parse = (csv: string) => {
  const res = parseIgoterra(csv, taxonomy, regions)
  if ('error' in res) throw new Error('expected a result')
  return res
}
/** One data row from column values by header name; every other column empty. */
const row = (v: Record<string, string>) => {
  const cols = Papa.parse<string[]>(HEADER).data[0]
  return cols.map((c) => JSON.stringify(v[c] ?? '')).join(',')
}

describe('iGoTerra detection', () => {
  it('detects the sightings export by its header and nothing else', () => {
    expect(detectFile(fixture, 'Backup.csv')).toBe('igoterra')
    expect(slotOfKind('igoterra')).toBe('igoterra')
    expect(detectFile('scientific name,species type,country,date\nAnas platyrhynchos,species,Netherlands,2024-01-01')).toBe('obsorg-observations')
    expect(detectFile('Common Name,Scientific Name,Date,Country\nMallard,Anas platyrhynchos,2024-01-01,Canada')).toBe('unknown')
  })
})

describe('iGoTerra fixture', () => {
  it('is synthetic: 36 fields a row, no coordinates, comments or diary notes', () => {
    const rows = Papa.parse<string[]>(fixture.replace(/^﻿/, ''), { skipEmptyLines: true }).data
    expect(rows.every((r) => r.length === 36)).toBe(true)
    const blank = ['Coordinate Lat', 'Coordinate Lng', 'Comment', 'Diary Note', 'Fullday Diary Note'].map((h) => rows[0].indexOf(h))
    expect(rows.slice(1).every((r) => blank.every((i) => r[i] === ''))).toBe(true)
  })
})

describe('parseIgoterra', () => {
  const res = parse(fixture)
  const rec = (code: string) => res.records.find((r) => r.code === code)

  it('keeps one record per bird species, from the earliest dated row', () => {
    expect(res.records.map((r) => r.code).sort()).toEqual(['amerob', 'comrav', 'gretit1', 'mallar3'])
    expect(res.records.every((r) => r.source === 'igoterra')).toBe(true)
    expect(rec('mallar3')).toMatchObject({ date: '2020-04-11', place: { country: 'CA', sub1: 'CA-BC' } })
    expect(res.rows).toBe(10)
  })

  it('places by country code, the province by State Code or an exact State name, else the country only', () => {
    expect(rec('amerob')?.place).toEqual({ country: 'CA', sub1: 'CA-BC' }) // State Code "BC"
    expect(rec('comrav')?.place).toEqual({ country: 'US' }) // a State that names no province
    expect(rec('gretit1')?.place).toBeUndefined() // "No Country"
    expect(rec('mallar3')?.seen?.length).toBe(2) // British Columbia, and Canada for the other row
  })

  it('marks heard only when every row is, and rolls a subspecies into its species', () => {
    expect(rec('comrav')?.heard).toBe(true)
    expect(rec('amerob')?.heard).toBeUndefined()
    expect(rec('gretit1')?.date).toBe('2019-03-03')
  })

  it('skips other animals, leaves Don’t Count species off as one skipped entry, and reports unmatched names', () => {
    expect(res.skipped).toBe(1) // the chickadee, only ever marked Don't Count
    expect(res.notCountable).toHaveLength(1) // named as the birder's not-countable species, not as a non-species entry
    expect(res.unmatched).toHaveLength(1)
    expect(res.unmatched[0]).toMatchObject({ source: 'igoterra', sci: 'Fictus imaginarius', com: 'Imaginary Warbler', row: 10, reason: 'no-match' })
    expect(JSON.stringify(res)).not.toContain('Vulpes')
  })

  it('a Don’t Count row of a species counted elsewhere is left out, not the species', () => {
    const csv = [HEADER,
      row({ 'Common Name': 'Mallard', 'Scientific Name': 'Anas platyrhynchos', Date: '2019-01-01', 'Country Code': 'GB', "Don't Count": '1', 'Main Group': 'Birds' }),
      row({ 'Common Name': 'Mallard', 'Scientific Name': 'Anas platyrhynchos', Date: '2020-01-01', 'Country Code': 'CA', "Don't Count": '0', 'Main Group': 'Birds' }),
    ].join('\n')
    const r = parse(csv)
    expect(r.records).toEqual([expect.objectContaining({ code: 'mallar3', date: '2020-01-01', place: { country: 'CA' } })])
    expect(r.skipped).toBe(0)
    expect(r.notCountable).toBeUndefined()
  })

  it('never reads location names, coordinates, comments or diary notes', () => {
    const secret = 'SENTINEL-PRIVATE'
    const csv = [HEADER,
      row({ 'Common Name': 'Imaginary Warbler', 'Scientific Name': 'Fictus imaginarius', Date: '2024-01-01', 'Country Code': 'CA', 'Main Group': 'Birds',
        'Location Name': secret, 'Coordinate Lat': '12.3456', 'Coordinate Lng': '-65.4321', Comment: secret, 'Diary Note': secret, 'Fullday Diary Note': secret }),
      row({ 'Common Name': 'Mallard', 'Scientific Name': 'Anas platyrhynchos', Date: '2024-01-02', 'Country Code': 'CA', 'Main Group': 'Birds',
        'Location Name': secret, 'Coordinate Lat': '12.3456', 'Coordinate Lng': '-65.4321', Comment: secret, 'Diary Note': secret, 'Fullday Diary Note': secret }),
    ].join('\n')
    const out = JSON.stringify(parse(csv))
    for (const s of [secret, '12.3456', '65.4321']) expect(out).not.toContain(s)
  })

  it('reads a row with a stray quote in a free-text field, and refuses one that runs on', () => {
    const cols = Papa.parse<string[]>(HEADER).data[0]
    const line = (comment: string) => cols.map((c) => ({ 'Common Name': '"Mallard"', 'Scientific Name': '"Anas platyrhynchos"', Date: '"2024-01-02"',
      'Country Code': '"CA"', 'Main Group': '"Birds"', Comment: comment } as Record<string, string>)[c] ?? '').join(',')
    expect(parse([HEADER, line('"a "stray" quote"')].join('\n')).records.map((r) => r.code)).toEqual(['mallar3'])
    expect(() => parseIgoterra([HEADER, line('"never closed')].join('\n'), taxonomy, regions)).toThrow()
  })

  it('refuses another file, and a file with no birds', () => {
    expect(() => parseIgoterra('Common,Scientific,Date\nMallard,Anas platyrhynchos,2024-01-01', taxonomy, regions)).toThrow()
    expect(parseIgoterra(HEADER, taxonomy, regions)).toEqual({ error: 'no-birds' })
    const mammals = [HEADER, row({ 'Common Name': 'Red Fox', 'Scientific Name': 'Vulpes vulpes', Date: '2024-01-01', 'Main Group': 'Mammals' })].join('\n')
    expect(parseIgoterra(mammals, taxonomy, regions)).toEqual({ error: 'no-birds' })
  })
})

describe('iGoTerra on the list', () => {
  it('stores, backs up, builds and counts as its own source; places survive the display projection', () => {
    const res = parse(fixture) as ImportResult
    const saved = replaceSource(emptySaved(), 'igoterra', res, { kind: 'csv', file: 'Backup.csv', rows: res.rows, at: '2026-11-19T00:00:00Z', regionMapping: 1 })
    const back = fromJson(toJson(saved))
    expect(back.records.igoterra).toHaveLength(4)
    expect(back.sources?.igoterra?.file).toBe('Backup.csv')
    expect(JSON.parse(toJson(emptySaved())).records.igoterra).toBeUndefined() // left out of a backup while empty
    const records = recordsOf(back, regions)
    expect(records.find((r) => r.code === 'mallar3')?.place).toEqual({ country: 'CA', sub1: 'CA-BC' })
    const list = buildList(records, back.edits, back.rules)
    expect(list.map((e) => e.code).sort()).toEqual(['amerob', 'comrav', 'gretit1', 'mallar3'])
    expect(summaryLine(sourceCounts(back, list), en.ui)).toContain('all from iGoTerra')
  })

  it('parses through the worker', async () => {
    const messages: ParseResponse[] = []
    const file = new File([fixture], 'Backup.csv', { type: 'text/csv' })
    await handleParseMessage({ kind: 'igoterra', file, regions }, (m) => messages.push(m), async () => taxonomy)
    expect(messages.find((m) => m.type === 'done')?.type).toBe('done')
  })
})
