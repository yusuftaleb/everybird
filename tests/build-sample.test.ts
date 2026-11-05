import { describe, expect, it } from 'vitest'
import { buildSample, placeFromRegion } from '../scripts/build-data/build-sample'
import type { Regions } from '@/lib/species/types'

const regions: Regions = {
  v: 1,
  countries: { CA: 'Canada', EG: 'Egypt', TR: 'Turkey', GB: 'United Kingdom', ZA: 'South Africa' },
  sub1: { 'CA-BC': 'British Columbia', 'EG-DK': 'Dakahlia', 'GB-ENG': 'England', 'ZA-NW': 'North West', 'SG-03': 'North West' },
}

describe('build-sample', () => {
  it('derives country and sub1 from region names, never anything finer', () => {
    expect(placeFromRegion('British Columbia, Canada', regions)).toEqual({ country: 'CA', sub1: 'CA-BC' })
    expect(placeFromRegion('North West, South Africa', regions)).toEqual({ country: 'ZA', sub1: 'ZA-NW' })
    expect(placeFromRegion('England, United Kingdom', regions)).toEqual({ country: 'GB', sub1: 'GB-ENG' })
    expect(placeFromRegion('Türkiye', regions)).toEqual({ country: 'TR' })
    expect(placeFromRegion('Nowhere, Canada', regions)).toEqual({ country: 'CA' })
    expect(placeFromRegion('Atlantis', regions)).toBeUndefined()
  })

  it('keeps only code, month and place; drops towns, sources and full dates', () => {
    const out = buildSample(
      {
        _note: 'x',
        species: [
          { code: 'amerob', common: 'American Robin', scientific: 'Turdus migratorius', date: '2024-05-17', town: 'Secret Town', region: 'British Columbia, Canada', source: 'eBird S1' },
          { code: 'eurkes', common: 'Eurasian Kestrel', scientific: 'Falco tinnunculus', date: '2019-08', town: 'Other', region: 'Türkiye', source: 'Me' },
          { code: 'nope', common: 'Nope', scientific: 'Nope', date: '2020-01-01', town: '', region: 'Canada', source: '' },
        ],
      },
      regions,
      new Set(['amerob', 'eurkes']),
    )
    expect(out.v).toBe(1)
    expect(out.birds).toEqual([
      { code: 'amerob', date: '2024-05', place: { country: 'CA', sub1: 'CA-BC' } },
      { code: 'eurkes', date: '2019-08', place: { country: 'TR' } },
    ])
    expect(JSON.stringify(out)).not.toMatch(/Secret|Other|eBird S1|Robin|Turdus/)
  })
})
