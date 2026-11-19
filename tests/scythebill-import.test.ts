import { readFileSync } from 'node:fs'
import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import { en } from '@/i18n/messages/en'
import { detectFile, slotOfKind } from '@/lib/import/detect'
import { handleParseMessage, type ParseResponse } from '@/lib/import/parse.worker'
import { parseScythebillCsv, parseScythebillEbird } from '@/lib/import/scythebill'
import { buildList } from '@/lib/list/build-list'
import { fromJson, toCsv, toJson } from '@/lib/list/export'
import { buildSeen } from '@/lib/list/seen'
import { sourceCounts, summaryLine } from '@/lib/list/source-counts'
import { emptySaved, replaceSource } from '@/lib/list/storage'
import { projectPlace } from '@/lib/places/registry'
import { buildSpeciesIndex, buildTaxonomyIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow, TaxonRow } from '@/lib/species/types'

const rawSpecies = JSON.parse(readFileSync('public/data/species.v1.json', 'utf8')) as { species: SpeciesRow[] }
const rawTaxon = JSON.parse(readFileSync('public/data/taxonomy.v1.json', 'utf8')) as { taxa: TaxonRow[] }
const species = buildSpeciesIndex(rawSpecies.species)
const taxonomy = buildTaxonomyIndex(rawTaxon.taxa)
const regions = JSON.parse(readFileSync('public/data/regions.v1.json', 'utf8')) as Regions

const fixture = (name: string) => readFileSync(`tests/fixtures/scythebill/${name}`, 'utf8')

describe('Scythebill detection', () => {
  it('detects native CSV and eBird Record Format without misclassifying other files', () => {
    const native = fixture('native.csv')
    const ebirdRecord = fixture('ebird-record.csv')
    expect(detectFile(native)).toBe('scythebill-csv')
    expect(slotOfKind('scythebill-csv')).toBe('scythebill')
    expect(detectFile(ebirdRecord)).toBe('scythebill-ebird')
    expect(slotOfKind('scythebill-ebird')).toBe('scythebill')

    expect(detectFile('Row #,Taxon Order,Category,Common Name,Scientific Name,Count,Location,S/P,Date,LocID,SubID,Exotic,Countable')).toBe('ebird-lifelist')
    expect(detectFile('Common Name,Scientific Name,Countable,Date\nMallard,Anas platyrhynchos,1,1 Jan 2024')).toBe('unknown')
    expect(detectFile('Submission ID,Common Name,Scientific Name,Date\nS1,Mallard,Anas platyrhynchos,2024-01-01')).toBe('ebird-mydata')
    expect(detectFile('scientific name,species type,date first observed\nAnas platyrhynchos,species,2024-01-01')).toBe('obsorg-species')
    expect(detectFile('scientific name,species type,country,date\nAnas platyrhynchos,species,Netherlands,2024-01-01')).toBe('obsorg-observations')
    expect(detectFile('Common Name,Country,Date\nMallard,Canada,2024-01-01')).toBe('unknown')
    expect(detectFile('Mallard\nBarn Owl')).toBe('unknown')
  })
})

describe('Scythebill fixtures', () => {
  it('are synthetic: every native row has 44 fields, and no real coordinates or site names', () => {
    const rows = fixture('native.csv').trim().split('\n').map((l) => Papa.parse<string[]>(l).data[0])
    expect(rows.every((r) => r.length === 44)).toBe(true)
    const [lat, lon] = [rows[0].indexOf('Latitude'), rows[0].indexOf('Longitude')]
    expect(rows.slice(1).every((r) => [r[lat], r[lon]].every((v) => v === '' || v === '0.00'))).toBe(true)
    expect(rows.some((r, i) => i > 0 && !r[rows[0].indexOf('Country')])).toBe(true) // one row has no place
    const ebird = fixture('ebird-record.csv').trim().split('\n').map((l) => Papa.parse<string[]>(l).data[0])
    expect(ebird.every((r) => [r[6], r[7]].every((v) => !v.trim() || v === '0.00'))).toBe(true)
    expect(ebird.map((r) => r[5]).filter(Boolean)).toEqual(['Test Forest, Northland', 'Test Track'])
  })
})

describe('Scythebill Format 1: native CSV', () => {
  it('parses species, earliest dates, seenMonths, places, heard-only, subspecies, and unmatched rows', () => {
    const res = parseScythebillCsv(fixture('native.csv'), taxonomy, regions)
    expect('error' in res).toBe(false)
    if ('error' in res) return

    expect(res.rows).toBe(8)
    expect(res.records).toHaveLength(5)
    expect(res.unmatched).toHaveLength(1)
    expect(res.unmatched[0]).toMatchObject({
      source: 'scythebill',
      row: 8,
      sci: 'Gallus imaginaris',
      com: 'Mystery Bird',
      reason: 'no-match',
      date: '2024-05-01',
    })
    expect(projectPlace(res.unmatched[0].place, regions)).toEqual({ country: 'CA', sub1: 'CA-BC' })

    const byCode = new Map(res.records.map((r) => [r.code, r]))

    const kiwi = byCode.get('nibkiw1')!
    expect(kiwi.source).toBe('scythebill')
    expect(kiwi.date).toBe('2023-11-12')
    expect(projectPlace(kiwi.place, regions)).toEqual({ country: 'NZ', sub1: 'NZ-NTL', sub2: 'Whangarei' })
    expect(kiwi.seen).toHaveLength(2)
    expect(kiwi.seenMonths).toHaveLength(2)
    expect(kiwi.heard).toBeUndefined()

    const mallard = byCode.get('mallar3')!
    expect(mallard.heard).toBe(true)
    expect(projectPlace(mallard.place, regions)).toEqual({ country: 'US', sub1: 'US-CA', sub2: 'Alameda' })

    const pigeon = byCode.get('rocpig')!
    expect(pigeon.heard).toBeUndefined()
    expect(projectPlace(pigeon.place, regions)).toEqual({ country: 'CA', sub1: 'CA-BC', sub2: 'Capital' })

    const sbk = byCode.get('sobkiw1')!
    expect(sbk.date).toBe('2024-01-08')
    expect(projectPlace(sbk.place, regions)).toEqual({ country: 'NZ', sub1: 'NZ-STL' })

    const owl = byCode.get('webowl1')!
    expect(owl.date).toBeUndefined()
    expect(owl.place).toBeUndefined()
  })

  it('rejects malformed or wrong CSVs without throwing unhandled errors', () => {
    expect(() => parseScythebillCsv('Common,Country\nMallard,Canada', taxonomy, regions)).toThrow()
    expect(parseScythebillCsv('', taxonomy, regions)).toEqual({ error: 'no-birds' })
  })
})

describe('Scythebill Format 2: eBird Record Format', () => {
  it('parses headerless rows, subspecies epithets, US dates, eBird places, common fallback, and unmatched rows', () => {
    const res = parseScythebillEbird(fixture('ebird-record.csv'), taxonomy, regions)
    expect('error' in res).toBe(false)
    if ('error' in res) return

    expect(res.rows).toBe(6)
    expect(res.records).toHaveLength(4)
    expect(res.unmatched).toHaveLength(1)
    expect(res.unmatched[0]).toMatchObject({
      source: 'scythebill',
      row: 6,
      sci: 'Gallus imaginaris',
      com: 'Mystery Bird',
      reason: 'no-match',
      date: '2024-05-01',
    })

    const byCode = new Map(res.records.map((r) => [r.code, r]))

    const kiwi = byCode.get('nibkiw1')!
    expect(kiwi.date).toBe('2023-11-12')
    expect(projectPlace(kiwi.place, regions)).toEqual({ country: 'NZ', sub1: 'NZ-NTL' })

    const sbk = byCode.get('sobkiw1')!
    expect(sbk.date).toBe('2024-01-08')
    expect(projectPlace(sbk.place, regions)).toEqual({ country: 'NZ', sub1: 'NZ-STL' })

    const mallard = byCode.get('mallar3')!
    expect(mallard.date).toBe('2024-02-10')
    expect(projectPlace(mallard.place, regions)).toEqual({ country: 'US', sub1: 'US-CA' })

    const owl = byCode.get('webowl1')!
    expect(owl.date).toBeUndefined()
    expect(owl.place).toBeUndefined()
  })

  it('does not inherit a later row place when an earlier row has no place, and skips hybrid/slash rows', () => {
    const csv = [
      'Common,Scientific,Subspecies,Index,Date,Start time,Number,Female,Male,Immature,Adult,Heard only,Status,Breeding,Photographed,Photos,Description,Latitude,Longitude,Location Description,Region,Country,State,County,City,Location 1,Location 2,Location 3,Location 4,Observation type,Duration,Distance,Area,Party size,Complete list,Visit comments,Visit photos,Trip name,Trip start date,Trip start time,Trip end date,Trip end time,Trip notes,Trip links',
      'Mallard,Anas platyrhynchos,,1,2024-05-01,,,,,,,,,,,,,,,,,Canada,British Columbia,,,,,,,,,,,,,,,,,,,,,',
      'Mallard,Anas platyrhynchos,,1,2023-01-10,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
      'Mallard x American Black Duck,Anas platyrhynchos x rubripes,,2,2024-06-01,,,,,,,,,,,,,,,,,Canada,British Columbia,,,,,,,,,,,,,,,,,,,,,',
      'Mallard/American Black Duck,Anas platyrhynchos/rubripes,,3,2024-06-02,,,,,,,,,,,,,,,,,Canada,British Columbia,,,,,,,,,,,,,,,,,,,,,',
    ].join('\n')
    const res = parseScythebillCsv(csv, taxonomy, regions)
    if ('error' in res) throw new Error('expected valid result')
    expect(res.records).toHaveLength(1)
    expect(res.records[0].code).toBe('mallar3')
    expect(res.records[0].date).toBe('2023-01-10')
    expect(res.records[0].place).toBeUndefined()
    expect(res.skipped).toBe(2)

    const ebirdRows = [
      'Mallard x American Black Duck,Anas,platyrhynchos x rubripes,1,,,, ,6/1/2024,08:00,BC,CA,Stationary,1,15,Y,',
      'Mallard/American Black Duck,Anas,platyrhynchos/rubripes,1,,,, ,6/2/2024,08:00,BC,CA,Stationary,1,15,Y,',
    ].join('\n')
    const ebirdRes = parseScythebillEbird(ebirdRows, taxonomy, regions)
    if ('error' in ebirdRes) throw new Error('expected valid result')
    expect(ebirdRes.records).toHaveLength(0)
    expect(ebirdRes.skipped).toBe(2)
  })
})

describe('Scythebill storage, export, buildList, sourceCounts, and worker', () => {
  it('integrates with replaceSource, backup round-trip, buildList heard mark, seen, and sourceCounts', () => {
    const res = parseScythebillCsv(fixture('native.csv'), taxonomy, regions)
    if ('error' in res) throw new Error('expected valid result')

    const saved = replaceSource(emptySaved(), 'scythebill', res, {
      kind: 'csv',
      file: 'native.csv',
      rows: res.rows,
      at: '2026-11-19T00:00:00Z',
    })

    const roundTrip = fromJson(toJson(saved))
    expect(roundTrip.records.scythebill).toHaveLength(5)
    expect(roundTrip.sources?.scythebill?.kind).toBe('csv')

    const list = buildList(roundTrip.records.scythebill, roundTrip.edits, roundTrip.rules)
    expect(list).toHaveLength(5)
    const mallard = list.find((e) => e.code === 'mallar3')!
    const pigeon = list.find((e) => e.code === 'rocpig')!
    expect(mallard.heard).toBe(true)
    expect(pigeon.heard).toBe(false)

    const seen = buildSeen(roundTrip.records.scythebill, roundTrip.edits, roundTrip.rules, list)
    expect(seen.full).toBe(true)
    expect(seen.byCode.get('nibkiw1')?.places.length).toBe(2)

    const counts = sourceCounts(roundTrip, list)
    expect(counts.total).toBe(5)
    expect(counts.rows.scythebill.species).toBe(5)
    expect(summaryLine(counts, en.ui)).toContain('5 species, all from Scythebill')

    const csv = toCsv(list, species, regions, seen)
    expect(csv).toContain('scythebill')
  })

  it('parses both formats through handleParseMessage', async () => {
    for (const [kind, name] of [['scythebill-csv', 'native.csv'], ['scythebill-ebird', 'ebird-record.csv']] as const) {
      const messages: ParseResponse[] = []
      const file = new File([fixture(name)], name, { type: 'text/csv' })
      await handleParseMessage({ kind, file, regions }, (m) => messages.push(m), async () => taxonomy)
      const done = messages.find((m) => m.type === 'done')
      expect(done?.type).toBe('done')
    }
  })
})
