import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { parseEbirdLifeList } from '@/lib/import/ebird-lifelist'
import { parseEbirdMyData } from '@/lib/import/ebird-mydata'
import { importInat } from '@/lib/import/inat'
import { parseObsOrgObservations } from '@/lib/import/obsorg'
import { buildTaxonomyIndex } from '@/lib/species/load'
import type { Regions } from '@/lib/species/types'
import { makeCoordinateRegion, type ProvinceBoundaries } from '@/lib/places/coordinate-region'
import { ebirdRegion, namedImportRegion, vietnamEdition } from '@/lib/places/region-mapping'
import { emptySaved } from '@/lib/list/storage'
import { recordsOf } from '@/lib/list/store'

const regions = { ...JSON.parse(readFileSync('public/data/regions.v1.json', 'utf8')), registry: undefined } as Regions
const taxonomy = buildTaxonomyIndex(JSON.parse(readFileSync('tests/fixtures/species/taxonomy.json', 'utf8')).taxa)
const boundaries = JSON.parse(readFileSync('public/data/vietnam-boundaries.v1.json', 'utf8')) as ProvinceBoundaries
const lookup = makeCoordinateRegion(boundaries)
const name = 'Colaptes chrysoides'
const daNang = [108.2022, 16.0544] as const
const canTho = [105.7800, 10.0380] as const

describe('source region mapping', () => {
  it('matches Nepal and France to the existing IDs and corrects published wrong labels', () => {
    expect(ebirdRegion('NP-3')).toBe('NP-P3')
    expect(ebirdRegion('FR-COR')).toBe('FR-20R')
    expect(regions.sub1['CO-CUN']).toBe('Cundinamarca')
    expect(regions.sub1['PH-SUN']).toBe('Surigao del Norte')
    expect(regions.sub1['PH-DIN']).toBe('Dinagat Islands')
  })

  it('uses distinct current IDs and treats ambiguous codes as country-level without evidence', () => {
    expect(vietnamEdition(['VN-48', 'VN-82'])).toBe('current')
    expect(vietnamEdition(['VN-48', 'VN-27'])).toBe('historical')
    expect(vietnamEdition(['VN-27', 'VN-82'])).toBe('unknown')
    expect(ebirdRegion('VN-48', 'current')).toBe('VN-V48')
    expect(ebirdRegion('VN-48', 'historical')).toBe('VN-V92')
    expect(ebirdRegion('VN-48')).toBe('VN')
    expect(namedImportRegion('VN', 'TP. Da Nang')).toBe('VN-V48')
    expect(namedImportRegion('VN', 'Quảng Nam')).toBe('VN-V48')
    expect(namedImportRegion('VN', 'Alternate place spelling', 97364)).toBe('VN-V48')
    expect(namedImportRegion('VN', 'Northeast Vietnam')).toBeUndefined()
    expect(namedImportRegion('US', 'Quảng Nam')).toBeUndefined()
    expect(Object.keys(regions.sub1).filter((key) => key.startsWith('VN-'))).toHaveLength(34)
  })

  it('reuses the same region for lifer, seen and seen months, and retains no coordinates', async () => {
    const csv = [
      'Date,Common Name,Scientific Name,State/Province,County,Longitude,Latitude',
      `2024-01-01,Gilded Flicker,${name},VN-48,old district,${daNang.join(',')}`,
      `2025-02-01,Gilded Flicker,${name},VN-48,old district,${canTho.join(',')}`,
      `2026-03-01,Gilded Flicker,${name},VN-48,,,`,
    ].join('\n')
    const { records: [record] } = await parseEbirdMyData(csv, taxonomy, undefined, async () => lookup)
    expect(record.place).toEqual({ country: 'VN', sub1: 'VN-V48' })
    expect(record.seen).toEqual(expect.arrayContaining(['2024-01-01|VN-V48', '2025-02-01|VN-V92', '2026-03-01|VN']))
    expect(record.seenMonths).toEqual(expect.arrayContaining([expect.stringContaining('|VN-V48'), expect.stringContaining('|VN-V92')]))
    expect(JSON.stringify(record)).not.toContain(String(daNang[0]))
  })

  it('resolves the short eBird CSV by codes in the export, independent of sighting dates', () => {
    const header = 'Date,Common Name,Scientific Name,S/P,Countable'
    const row = `1 Jan 2012,Gilded Flicker,${name},VN-48,1`
    const [ambiguous] = parseEbirdLifeList([header, row].join('\n'), taxonomy).records
    const [current] = parseEbirdLifeList([header, row, '1 Jan 2026,,,VN-82,0'].join('\n'), taxonomy).records
    expect(ambiguous.place).toEqual({ country: 'VN' })
    expect(current.place).toEqual({ country: 'VN', sub1: 'VN-V48' })
  })

  it('picks exact public iNaturalist data and leaves obscured observations at their public country', async () => {
    const points = [
      { id: 1, observed_on: '2026-01-02', obscured: false, geojson: { type: 'Point', coordinates: daNang } },
      { id: 2, observed_on: '2026-02-02', obscured: true, geojson: { type: 'Point', coordinates: canTho } },
      { id: 3, observed_on: '2026-03-02', obscured: false, taxon_geoprivacy: 'obscured', geojson: { type: 'Point', coordinates: canTho } },
    ].map((obs) => ({ ...obs, place_ids: [6847], positional_accuracy: 30, taxon: { rank: 'species', name } }))
    const client: typeof fetch = async (input) => {
      const url = new URL(String(input))
      if (url.pathname.includes('/users/')) return Response.json({ results: [{ login: 'fixture' }] })
      if (url.pathname.includes('/places/')) return Response.json({ results: [{ id: 6847, name: 'Vietnam', admin_level: 0 }] })
      return Response.json({ results: url.searchParams.get('id_above') === '0' ? points : [] })
    }
    const locate = vi.fn(lookup)
    const result = await importInat('fixture', { taxonomy, regions, synonyms: {}, fetch: client, minIntervalMs: 0, loadCoordinates: async () => locate })
    if ('error' in result) throw new Error(result.error)
    expect(locate).toHaveBeenCalledTimes(1)
    expect(result.records[0].seen).toEqual(expect.arrayContaining(['2026-01-02|VN-V48', '2026-02-02|VN']))
  })

  it('resolves Observation.org names first and uses only explicit public points as a fallback', async () => {
    const header = 'date,scientific name,species type,country,country division,lng,lat,accuracy,obscurity,embargo date'
    const csv = [
      header,
      `2026-01-01,${name},species,Vietnam,Quảng Nam,,,,,`,
      `2026-02-01,${name},species,Vietnam,,${canTho.join(',')},20,False,`,
      `2026-03-01,${name},species,Vietnam,,${canTho.join(',')},20,True,`,
      `2026-04-01,${name},species,Vietnam,,${canTho.join(',')},20,False,2030-01-01`,
    ].join('\n')
    const locate = vi.fn(lookup)
    const load = vi.fn(async () => locate)
    const result = await parseObsOrgObservations(csv, taxonomy, {}, regions, undefined, load)
    if ('error' in result) throw new Error(result.error)
    expect(result.records[0].seen).toEqual(expect.arrayContaining(['2026-01-01|VN-V48', '2026-02-01|VN-V92', '2026-03-01|VN']))
    expect(load).toHaveBeenCalledOnce()
    expect(locate).toHaveBeenCalledOnce()
  })

  it('repairs saved display safely while retaining the original region codes in the backup', () => {
    const saved = emptySaved()
    saved.records.ebird = [{ code: 'norfli', source: 'ebird', place: { country: 'VN', sub1: 'VN-48' }, seen: ['2026-01-01|VN-48|County'] }]
    saved.records.inat = [{ code: 'norfli', source: 'inat', place: { country: 'CO', sub1: 'CO-CUN' } }]
    saved.records.obsorg = [{ code: 'norfli', source: 'obsorg', place: { country: 'CO', sub1: 'CO-CUN' } }]
    saved.sources = { obsorg: { kind: 'observations', regionMapping: 1 } }
    expect(recordsOf(saved)).toMatchObject([
      { place: { country: 'VN' }, seen: ['2026-01-01|VN'] },
      { place: { country: 'CO', sub1: 'CO-DC' } },
      { place: { country: 'CO', sub1: 'CO-CUN' } },
    ])
    expect(saved.records.ebird[0].place?.sub1).toBe('VN-48')
  })
})

describe('coordinate lookup', () => {
  it('matches the released boundary data and declines missing, coastal, or uncertain points', () => {
    expect(Object.keys(boundaries)).toHaveLength(34)
    expect(lookup(...daNang)).toBe('VN-V48')
    expect(lookup(...canTho)).toBe('VN-V92')
    expect(lookup(...canTho, 100_000)).toBeUndefined()
    expect(lookup('', '')).toBeUndefined()
    expect(lookup(0, 0)).toBeUndefined()
    const testBoundary: ProvinceBoundaries = { 'VN-V01': [[[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]] }
    const testLookup = makeCoordinateRegion(testBoundary)
    expect(testLookup(0.5, 0.5)).toBe('VN-V01')
    expect(testLookup(0, 0.5)).toBeUndefined()
  })
})
