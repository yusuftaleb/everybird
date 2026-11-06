import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Regions } from '../src/lib/species/types'
import { renameRegions, REGION_RENAMES } from '../scripts/build-data/build-geo'

const read = (f: string) => readFileSync(resolve(__dirname, '../public/data', f), 'utf8')
const regions = JSON.parse(read('regions.v1.json')) as Regions

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
  it('no region or country name is inverted ("Madrid, Comunidad de") or carries an ISO bracket', () => {
    // Commas would also break "Sub1, Country" places. No official name we keep needs one.
    for (const [code, name] of [...Object.entries(regions.countries), ...Object.entries(regions.sub1)]) {
      expect(name, code).not.toMatch(/[,[\]]/)
    }
    expect(regions.sub1['BE-WAL']).toBe('Wallonia')
    expect(regions.sub1['ES-MD']).toBe('Community of Madrid')
    expect(regions.sub1['CZ-10']).toBe('Prague')
    expect(regions.sub1['US-VI']).toBe('U.S. Virgin Islands')
  })
  it('renameRegions applies the hand-kept table and only to codes present', () => {
    const r = { v: 1 as const, countries: { ES: 'Spain' }, sub1: { 'ES-MD': 'Madrid, Comunidad de', 'ES-AN': 'Andalucía' } }
    renameRegions(r)
    expect(r.sub1).toEqual({ 'ES-MD': 'Community of Madrid', 'ES-AN': 'Andalucía' })
    expect(Object.keys(REGION_RENAMES).length).toBeGreaterThanOrEqual(8)
  })
})
