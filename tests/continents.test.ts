// The continent table (src/lib/places/continents.ts) against the regions file, and the continent helpers.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONTINENTS, CONTINENT_OF, EXTRA_CODES, SUB1_CONTINENT, continentName, continentOfPlace, isContinentId } from '@/lib/places/continents'

const regions = JSON.parse(readFileSync('public/data/regions.v1.json', 'utf8')) as { countries: Record<string, string>; sub1: Record<string, string> }
const IDS = CONTINENTS.map((c) => c.id)

describe('continent table', () => {
  it('every terrestrial country or territory in regions.v1.json has exactly one continent', () => {
    for (const iso of Object.keys(regions.countries)) {
      if (iso === 'XX') continue // eBird High Seas, a distinct Places entry with no continent
      expect(Object.hasOwn(CONTINENT_OF, iso), iso).toBe(true)
      expect(IDS, iso).toContain(CONTINENT_OF[iso])
    }
    expect(regions.countries.XX).toBe('High Seas')
    expect(continentOfPlace({ country: 'XX' })).toBeUndefined()
  })

  it('extra codes only from the explicit EXTRA_CODES list (a code regions.v1.json gains may stay in it)', () => {
    for (const iso of Object.keys(CONTINENT_OF)) {
      if (!Object.hasOwn(regions.countries, iso)) expect(EXTRA_CODES, iso).toContain(iso)
    }
    for (const iso of EXTRA_CODES) expect(Object.hasOwn(CONTINENT_OF, iso), iso).toBe(true)
  })

  it('the extras land where the brief puts them', () => {
    for (const iso of ['AQ', 'BV']) expect(CONTINENT_OF[iso], iso).toBe('AN')
    expect(CONTINENT_OF.GF).toBe('SA')
    for (const iso of ['GP', 'MQ', 'BQ', 'CP']) expect(CONTINENT_OF[iso], iso).toBe('NA')
    for (const iso of ['RE', 'YT']) expect(CONTINENT_OF[iso], iso).toBe('AF')
    for (const iso of ['GI', 'SJ']) expect(CONTINENT_OF[iso], iso).toBe('EU')
    for (const iso of ['CX', 'CC', 'TK', 'UM']) expect(CONTINENT_OF[iso], iso).toBe('OC')
  })

  it('the calls the brief names land where the brief puts them', () => {
    expect(CONTINENT_OF.RU).toBe('EU')
    for (const iso of ['TR', 'CY', 'GE', 'AM', 'AZ']) expect(CONTINENT_OF[iso], iso).toBe('AS')
    expect(CONTINENT_OF.EG).toBe('AF')
    for (const iso of ['GL', 'PR', 'CR', 'PA', 'JM']) expect(CONTINENT_OF[iso], iso).toBe('NA')
    expect(CONTINENT_OF.FK).toBe('SA')
    for (const iso of ['AU', 'NZ', 'FJ', 'PF']) expect(CONTINENT_OF[iso], iso).toBe('OC')
    for (const iso of ['AQ', 'BV', 'HM', 'TF', 'GS']) expect(CONTINENT_OF[iso], iso).toBe('AN')
  })

  it('lists the seven continents in display order, with English names', () => {
    expect(CONTINENTS.map((c) => c.name)).toEqual(['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania', 'Antarctica'])
    expect(continentName('NA')).toBe('North America')
    expect(continentName('XX')).toBe('XX')
  })

  it('isContinentId accepts only the seven ids', () => {
    expect(isContinentId('AF')).toBe(true)
    expect(isContinentId('af')).toBe(false)
    expect(isContinentId('XX')).toBe(false)
    expect(isContinentId(undefined)).toBe(false)
  })
})

describe('overseas regions', () => {
  it('every SUB1_CONTINENT code is a sub1 in regions.v1.json and a known continent', () => {
    for (const [code, cont] of Object.entries(SUB1_CONTINENT)) {
      expect(regions.sub1, code).toHaveProperty([code])
      expect(IDS, code).toContain(cont)
    }
  })

  it('continentOfPlace checks the sub1 before the country', () => {
    expect(continentOfPlace({ country: 'FR' })).toBe('EU')
    expect(continentOfPlace({ country: 'FR', sub1: 'FR-IDF' })).toBe('EU')
    expect(continentOfPlace({ country: 'FR', sub1: 'FR-973' })).toBe('SA')
    expect(continentOfPlace({ country: 'FR', sub1: 'FR-974' })).toBe('AF')
    expect(continentOfPlace({ country: 'NL', sub1: 'NL-CW' })).toBe('NA')
    expect(continentOfPlace({ country: 'US', sub1: 'US-HI' })).toBe('OC')
    expect(continentOfPlace({ country: 'US', sub1: 'US-WA' })).toBe('NA')
    expect(continentOfPlace({ country: 'ZZ' })).toBeUndefined()
  })
})
