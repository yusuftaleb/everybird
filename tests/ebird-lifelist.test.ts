import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { detectFile } from '@/lib/import/detect'
import { parseEbirdLifeList } from '@/lib/import/ebird-lifelist'
import { buildTaxonomyIndex } from '@/lib/species/load'

const t = buildTaxonomyIndex(JSON.parse(readFileSync('tests/fixtures/species/taxonomy.json', 'utf8')).taxa)
const fx = (n: string) => readFileSync(`tests/fixtures/ebird/${n}.csv`, 'utf8')
const basic = parseEbirdLifeList(fx('lifelist-basic'), t)
const byCode = (r: typeof basic, c: string) => r.records.find((x) => x.code === c)

describe('parseEbirdLifeList', () => {
  it('keeps Countable=1 rows and skips spuh/slash', () => {
    expect(basic.records).toHaveLength(5)
    expect(basic.skipped).toBe(3)
    expect(basic.unmatched).toEqual([])
    expect(basic.records.every((r) => r.source === 'ebird')).toBe(true)
  })
  it('counts the data rows it read (for "Your sources")', () => {
    expect(basic.rows).toBe(8)
  })
  it("parses '06 Sep 2026' to 2026-09-06 and tolerates single-digit days", () => {
    expect(byCode(basic, 'yerwar')?.date).toBe('2026-09-06')
    expect(byCode(basic, 'rocpig')?.date).toBe('2026-09-30')
    expect(byCode(basic, 'norfli')?.date).toBe('2026-03-03')
  })
  it('S/P CA-BC gives country CA, sub1 CA-BC', () => {
    expect(byCode(basic, 'norfli')?.place).toEqual({ country: 'CA', sub1: 'CA-BC' })
  })
  it('Feral Pigeon counts as Rock Pigeon', () => {
    expect(byCode(basic, 'rocpig')).toBeDefined()
  })
  it('matches by scientific name when common names are Spanish', () => {
    const r = parseEbirdLifeList(fx('lifelist-spanish'), t)
    expect(r.records.map((x) => x.code)).toEqual(['norfli', 'rupgri'])
    expect(r.unmatched).toEqual([])
  })
  describe('edge cases', () => {
    const r = parseEbirdLifeList(fx('lifelist-edge'), t)
    it('keeps the earliest date (and its place) for a repeated species', () => {
      const n = r.records.filter((x) => x.code === 'norfli')
      expect(n).toHaveLength(1)
      expect(n[0].date).toBe('2026-01-02')
      expect(n[0].place?.sub1).toBe('US-AZ')
    })
    it('empty, unparseable and non-English-month dates give a record without date', () => {
      expect(byCode(r, 'gilfli')).toBeDefined()
      expect(byCode(r, 'gilfli')?.date).toBeUndefined()
      expect(byCode(r, 'rupgri')?.date).toBeUndefined()
      expect(byCode(r, 'yerwar')?.date).toBeUndefined()
    })
    it('countable rows that do not resolve go to unmatched with 1-based data row, date and place', () => {
      expect(r.skipped).toBe(0)
      expect(r.unmatched.map((u) => [u.row, u.reason])).toEqual([[6, 'no-match'], [7, 'not-species'], [8, 'not-species']])
      expect(r.unmatched[0]).toMatchObject({ source: 'ebird', sci: 'Fictus avis', com: 'Imaginary Bird', date: '2026-04-04', place: { country: 'US', sub1: 'US-AZ' } })
    })
  })
  it('handles BOM, CRLF and an empty file', () => {
    const csv = '﻿' + fx('lifelist-spanish').replace(/\n/g, '\r\n')
    expect(parseEbirdLifeList(csv, t).records).toHaveLength(2)
    expect(parseEbirdLifeList('', t)).toEqual({ records: [], unmatched: [], skipped: 0, rows: 0 })
  })
})

describe('detectFile', () => {
  const life = 'Row #,Taxon Order,Category,Common Name,Scientific Name,Count,Location,S/P,Date,LocID,SubID,Exotic,Countable'
  const mine = 'Submission ID,Common Name,Scientific Name,Taxonomic Order,Count,State/Province,County,Location ID,Location,Latitude,Longitude,Date,Time'
  it('recognises both eBird headers, with and without BOM', () => {
    expect(detectFile(life)).toBe('ebird-lifelist')
    expect(detectFile('﻿' + life)).toBe('ebird-lifelist')
    expect(detectFile(mine)).toBe('ebird-mydata')
    expect(detectFile('﻿' + mine)).toBe('ebird-mydata')
    expect(detectFile('a,b,c')).toBe('unknown')
  })
})
