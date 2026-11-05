import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CountryDots, Regions } from '../src/lib/species/types'
import { cellCountry, decodeCells, cellOf } from '../scripts/build-data/build-geo'

const read = (f: string) => readFileSync(resolve(__dirname, '../public/data', f), 'utf8')
const dots = JSON.parse(read('country-dots.v1.json')) as CountryDots
const regions = JSON.parse(read('regions.v1.json')) as Regions
const cells = decodeCells(dots)

describe('country dots', () => {
  it('cell at 56N 106W is CA', () => {
    const [r, c] = cellOf(56, -106)
    expect(cellCountry(dots, cells, r, c)).toBe('CA')
  })
  it('cell at 26.8N 30.8E is EG', () => {
    const [r, c] = cellOf(26.8, 30.8)
    expect(cellCountry(dots, cells, r, c)).toBe('EG')
  })
  it('SG has an extra dot', () => {
    expect(dots.extra.some(([iso]) => iso === 'SG')).toBe(true)
  })
  it('has the documented shape and stays small', () => {
    expect([dots.v, dots.step, dots.rows, dots.cols]).toEqual([1, 1.5, 95, 240])
    expect(cells.length).toBe(95 * 240)
    expect(dots.countries[0]).toBe('')
    expect(gzipSync(read('country-dots.v1.json')).length).toBeLessThan(60 * 1024)
  })
})

describe('regions', () => {
  it('sub1 CA-BC is British Columbia and EG-DK is Dakahlia', () => {
    expect(regions.sub1['CA-BC']).toBe('British Columbia')
    expect(regions.sub1['EG-DK']).toBe('Dakahlia')
    expect(regions.countries.CA).toBe('Canada')
  })
  it('ISO top-level codes supplement Natural Earth (eBird subnational1)', () => {
    expect(regions.sub1['GB-ENG']).toBe('England')
    expect(regions.sub1['FR-IDF']).toBe('Île-de-France')
    expect(regions.sub1['ES-AN']).toBe('Andalucía')
    for (const c of ['GB-SCT', 'GB-WLS', 'GB-NIR', 'FR-ARA', 'FR-BRE', 'ES-CT', 'ES-MD', 'IT-62', 'IT-25', 'CN-11', 'CN-44', 'BE-VLG'])
      expect(regions.sub1[c], c).toBeTruthy()
    expect(regions.sub1['CN-11']).toBe(regions.sub1['CN-BJ'])
  })
})
