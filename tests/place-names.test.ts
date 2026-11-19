import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { makeObsOrgPlaces } from '@/lib/import/obsorg-places'
import { SUB1_PARENT } from '@/lib/import/sub1-parents'
import { countryNameMap, makeSub1Index, OBSORG_SUB1_ALIASES, SUB1_ALIASES, sub1Names } from '@/lib/places/names'
import { IMPORT_REGION_ALIASES } from '@/lib/places/region-mapping'
import { parseSmart } from '@/lib/search/smart'
import type { GroupsFile, SearchLang } from '@/lib/search/groups'
import type { Regions } from '@/lib/species/types'

const regions: Regions = { v: 1, countries: { US: 'United States of America', MX: 'Mexico', NL: 'Netherlands', GB: 'United Kingdom' },
  sub1: { 'CA-BC': 'British Columbia', 'XX-A': 'Shared', 'XX-B': 'Shared', 'ES-CT': 'Catalunya [Cataluña]' } }

describe('shared item 8 place-name resolution', () => {
  it('adds current-language Intl country names, English, and explicit aliases', () => {
    expect(countryNameMap(regions, ['en', 'es']).get('mexico')).toBe('MX')
    expect(countryNameMap(regions, ['en', 'nl']).get('nederland')).toBe('NL')
    expect(countryNameMap(regions).get('usa')).toBe('US')
    expect(countryNameMap(regions).get('uk')).toBe('GB')
  })
  it('never guesses between countries with the same folded name', () => {
    expect(countryNameMap({ ...regions, countries: { AA: 'Shared', BB: 'Shared' } }, []).has('shared')).toBe(false)
  })
  it('mirrors item 8 sub1 collisions, explicit alias precedence, country scoping and bracketed names', () => {
    const sub1 = makeSub1Index(regions, [{ 'XX-A': ['Known alias'] }])
    expect(sub1('XX', 'Shared')).toBeUndefined()
    expect(sub1('XX', 'Known alias')).toBe('XX-A')
    expect(sub1('CA', 'Known alias')).toBeUndefined()
    expect(sub1('ES', 'Cataluña')).toBe('ES-CT')
    expect(sub1Names('Wales [Cymru GB-CYM]')).toEqual(['wales', 'cymru'])
    const preferred = makeSub1Index(regions, [{ 'XX-A': ['Shared'] }, { 'XX-B': ['Shared'] }])
    expect(preferred('XX', 'Shared')).toBe('XX-A')
  })
})

describe('consolidated place resolution across importers and search', () => {
  const realRegions = JSON.parse(readFileSync('public/data/regions.v1.json', 'utf8')) as Regions
  const { groups } = JSON.parse(readFileSync('public/data/groups.v1.json', 'utf8')) as GroupsFile

  it('resolves all focus-country regions and aliases consistently for iNaturalist and observation.org', () => {
    const inat = makeSub1Index(realRegions, [IMPORT_REGION_ALIASES, SUB1_ALIASES], undefined, { onClash: 'first' })
    const obsorg = makeObsOrgPlaces(realRegions)
    const topOf = (code: string) => (Object.hasOwn(SUB1_PARENT, code) ? SUB1_PARENT[code] : code)
    const focus = new Set(['GB', 'FR', 'ES', 'IT', 'BE', 'US', 'KR'])

    for (const [code, aliases] of Object.entries(SUB1_ALIASES)) {
      const country = code.split('-')[0]
      for (const alias of aliases) {
        expect(inat(country, alias)).toBe(code)
        expect(obsorg(realRegions.countries[country], alias)).toEqual({ country, sub1: topOf(code) })
      }
    }
    for (const [code, aliases] of Object.entries(OBSORG_SUB1_ALIASES)) {
      const country = code.split('-')[0]
      for (const alias of aliases) {
        expect(obsorg(realRegions.countries[country], alias)).toEqual({ country, sub1: topOf(code) })
      }
    }
    for (const [code, name] of Object.entries(realRegions.sub1)) {
      const country = code.split('-')[0]
      if (!focus.has(country)) continue
      for (const n of sub1Names(name)) {
        expect(inat(country, n)?.startsWith(country + '-')).toBe(true)
        expect(obsorg(realRegions.countries[country], n)?.sub1?.startsWith(country + '-')).toBe(true)
      }
    }
    expect(obsorg('Sérvia', '')).toEqual({ country: 'RS' })
    expect(obsorg('usa', '')).toEqual({ country: 'US' })
    expect(obsorg('uk', '')).toEqual({ country: 'GB' })
    expect(obsorg('World', '')).toBeUndefined()
  })

  it('preserves existing search matches and gains consolidated sub1 aliases', () => {
    for (const lang of ['en', 'es', 'pt', 'nl'] as SearchLang[]) {
      const ctx = { today: new Date(2026, 10, 15, 12), lang, groups, regions: realRegions, listPlaces: [] as string[] }
      expect(parseSmart('Åland', ctx).filter).toEqual({ countries: ['AX'] })
      expect(parseSmart('Grad Zagreb', ctx).filter).toEqual({ provinces: ['HR-21'] })
      expect(parseSmart('Bayern', ctx).filter).toEqual({ provinces: ['DE-BY'] })
      expect(parseSmart('Guyane', ctx).filter).toEqual({ provinces: ['FR-973'] })
      expect(parseSmart('USA', ctx).filter).toEqual({ countries: ['US'] })
      expect(parseSmart('UK', ctx).filter).toEqual({ countries: ['GB'] })
      expect(parseSmart('Wales', ctx).filter).toEqual({ provinces: ['GB-WLS'] })
      expect(parseSmart('Cataluña', ctx).filter).toEqual({ provinces: ['ES-CT'] })
      expect(parseSmart('District of Columbia', ctx).filter).toEqual({ provinces: ['US-DC'] })
    }
  })
})
