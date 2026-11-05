import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { parseEbirdMyData } from '@/lib/import/ebird-mydata'
import { handleParseMessage, type ParseResponse } from '@/lib/import/parse.worker'
import { buildSyntheticMyData, MYDATA_HEADER, type SyntheticSpecies } from '../scripts/validate/synthetic-list'
import { buildTaxonomyIndex } from '@/lib/species/load'

const t = buildTaxonomyIndex(JSON.parse(readFileSync('tests/fixtures/species/taxonomy.json', 'utf8')).taxa)
const fx = (n: string) => readFileSync(`tests/fixtures/ebird/${n}.csv`, 'utf8')
const basic = await parseEbirdMyData(fx('mydata-basic'), t)
const byCode = (c: string) => basic.records.find((x) => x.code === c)

describe('parseEbirdMyData', () => {
  it("rolls 'Northern Flicker (Red-shafted)' and 'Yellow-rumped Warbler (Audubon's)' up to norfli and yerwar", () => {
    expect(byCode('norfli')).toBeDefined()
    expect(byCode('yerwar')).toBeDefined()
    expect(basic.records.map((r) => r.code).sort()).toEqual(['gilfli', 'norfli', 'rupgri', 'yerwar'])
    expect(basic.records.every((r) => r.source === 'ebird')).toBe(true)
  })
  it('drops sp. and slash rows into skipped', () => {
    expect(basic.skipped).toBe(2)
  })
  it('earliest row per species wins (date and place)', () => {
    expect(byCode('norfli')).toMatchObject({ date: '2026-01-02', place: { country: 'US', sub1: 'US-AZ', sub2: 'Pima' } })
    expect(byCode('gilfli')?.date).toBe('2026-02-01')
  })
  it("place is 'Okanagan-Similkameen' + CA-BC", () => {
    expect(byCode('yerwar')?.place).toEqual({ country: 'CA', sub1: 'CA-BC', sub2: 'Okanagan-Similkameen' })
  })
  it('place without a county has no sub2 value', () => {
    expect(byCode('rupgri')?.place?.sub2).toBeUndefined()
    expect(byCode('rupgri')?.place).toMatchObject({ country: 'KE' })
  })
  it('media from any row with ML Catalog Numbers', () => {
    expect(byCode('gilfli')?.media).toBe(true) // only the later-dated... S7 is earliest; S6 has none
    expect(byCode('norfli')?.media).toBeFalsy()
  })
  it('media is true even when the ML row is not the earliest', () => {
    const csv = [
      MYDATA_HEADER,
      'S1,Gilded Flicker,Colaptes chrysoides,11994,1,US-AZ,,L,x,0,0,2026-01-01,,,,,,,,,,,',
      'S2,Gilded Flicker,Colaptes chrysoides,11994,1,US-AZ,,L,x,0,0,2026-06-01,,,,,,,,,,,ML9',
    ].join('\n')
    return parseEbirdMyData(csv, t).then((r) => {
      expect(r.records[0]).toMatchObject({ date: '2026-01-01', media: true })
    })
  })
  it('records never contain coordinates (or comments)', () => {
    const keys = new Set<string>()
    const walk = (v: unknown) => {
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
        keys.add(k)
        walk(x)
      }
    }
    walk(basic)
    expect([...keys].filter((k) => /lat|lon/i.test(k))).toEqual([])
    const json = JSON.stringify(basic)
    expect(json).not.toContain('secret comment')
    expect(json).not.toContain('1.5')
    expect(json).not.toContain('Test Park')
  })
  it('unknown scientific name falls back to common name, else unmatched with suggestion', async () => {
    const csv = [
      MYDATA_HEADER,
      'S1,Gilded Flicker,Colaptes unknownus,11994,1,US-AZ,,L,x,0,0,2026-01-01,,,,,,,,,,,',
      'S2,Imaginary Bird,Fictus avis,1,1,US-AZ,,L,x,0,0,2026-01-02,,,,,,,,,,,',
      'S3,Gilded Flickr,Colaptes chrysoidez,1,1,US-AZ,,L,x,0,0,2026-01-03,,,,,,,,,,,',
    ].join('\n')
    const r = await parseEbirdMyData(csv, t)
    expect(r.records.map((x) => x.code)).toEqual(['gilfli'])
    expect(r.unmatched.map((u) => u.sci)).toEqual(['Fictus avis', 'Colaptes chrysoidez'])
    expect(r.unmatched.every((u) => u.reason === 'no-match' && u.source === 'ebird')).toBe(true)
  })
  it('unmatched: one per distinct name, earliest-dated row, 1-based data row, with date and place', () => {
    expect(basic.unmatched).toHaveLength(1)
    expect(basic.unmatched[0]).toMatchObject({
      source: 'ebird',
      row: 10,
      sci: 'Fictus avis',
      com: 'Imaginary Bird',
      reason: 'no-match',
      date: '2026-08-08',
      place: { country: 'CA', sub1: 'CA-BC', sub2: 'Okanagan-Similkameen' },
    })
  })
  it('handles BOM, CRLF, a File input and an empty file', async () => {
    const csv = '﻿' + fx('mydata-basic').replace(/\n/g, '\r\n')
    expect((await parseEbirdMyData(csv, t)).records).toHaveLength(4)
    const file = new File([fx('mydata-basic')], 'MyEBirdData.csv', { type: 'text/csv' })
    expect(await parseEbirdMyData(file, t)).toEqual(basic)
    expect(await parseEbirdMyData('', t)).toEqual({ records: [], unmatched: [], skipped: 0 })
  })
  it('reports progress', async () => {
    const seen: number[] = []
    await parseEbirdMyData(buildSyntheticMyData(12_000, FIX_SPECIES), t, (n) => seen.push(n))
    expect(seen.length).toBeGreaterThanOrEqual(2)
    expect(seen[seen.length - 1]).toBeLessThanOrEqual(12_000)
  })
  it('parses 200k synthetic rows under 5 s', async () => {
    const csv = buildSyntheticMyData(200_000, FIX_SPECIES)
    const t0 = performance.now()
    const r = await parseEbirdMyData(csv, t)
    const ms = performance.now() - t0
    console.log(`200k rows: ${ms.toFixed(0)} ms`)
    expect(r.records).toHaveLength(FIX_SPECIES.length)
    expect(r.records.every((x) => x.media === true)).toBe(true)
    expect(ms).toBeLessThan(5000)
  }, 30_000)
})

const FIX_SPECIES: SyntheticSpecies[] = [
  { com: 'Northern Flicker', sci: 'Colaptes auratus', to: 11980 },
  { com: 'Yellow-rumped Warbler', sci: 'Setophaga coronata', to: 34401 },
  { com: 'Gilded Flicker', sci: 'Colaptes chrysoides', to: 11994 },
  { com: 'Rüppell\'s Griffon', sci: 'Gyps rueppelli', to: 600 },
]

describe('parse worker handler', () => {
  const file = () => new File([fx('mydata-basic')], 'm.csv')
  it('dispatches ebird-mydata, posts progress then done', async () => {
    const posts: ParseResponse[] = []
    await handleParseMessage({ kind: 'ebird-mydata', file: file() }, (m) => posts.push(m), async () => t)
    expect(posts[posts.length - 1]).toMatchObject({ type: 'done' })
    expect((posts[posts.length - 1] as Extract<ParseResponse, { type: 'done' }>).result.records).toHaveLength(4)
  })
  it('dispatches ebird-lifelist', async () => {
    const posts: ParseResponse[] = []
    const f = new File([fx('lifelist-basic')], 'l.csv')
    await handleParseMessage({ kind: 'ebird-lifelist', file: f }, (m) => posts.push(m), async () => t)
    expect(posts[posts.length - 1]).toMatchObject({ type: 'done' })
    expect((posts[posts.length - 1] as Extract<ParseResponse, { type: 'done' }>).result.records).toHaveLength(5)
  })
  it('throttles progress messages', async () => {
    const posts: ParseResponse[] = []
    const f = new File([buildSyntheticMyData(20_000, FIX_SPECIES)], 'big.csv')
    await handleParseMessage({ kind: 'ebird-mydata', file: f }, (m) => posts.push(m), async () => t)
    const progress = posts.filter((p) => p.type === 'progress')
    expect(progress.length).toBeGreaterThan(0)
    expect(progress.length).toBeLessThanOrEqual(5)
  })
  it('posts an error message when loading or parsing fails', async () => {
    const posts: ParseResponse[] = []
    const fail = vi.fn(async () => {
      throw new Error('boom')
    })
    await handleParseMessage({ kind: 'ebird-mydata', file: file() }, (m) => posts.push(m), fail)
    expect(posts).toEqual([{ type: 'error', message: 'boom' }])
  })
})
