import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { parseEbirdLifeList } from '@/lib/import/ebird-lifelist'
import { parseEbirdMyData } from '@/lib/import/ebird-mydata'
import { makePlaceResolver } from '@/lib/import/inat'
import { willetCode } from '@/lib/import/inat-rules'
import { formatPlace } from '@/lib/import/places'
import { parseObsOrgObservations } from '@/lib/import/obsorg'
import { makeObsOrgPlaces } from '@/lib/import/obsorg-places'
import { buildTaxonomyIndex } from '@/lib/species/load'
import { buildList } from '@/lib/list/build-list'
import { buildSeen, SeenAgg } from '@/lib/list/seen'
import { placeName } from '@/lib/list/place-keys'
import { fromJson, toCsv, toJson } from '@/lib/list/export'
import { emptySaved } from '@/lib/list/storage'
import { recordsOf } from '@/lib/list/store'
import { divisionId, hasSourcePlaceKey, projectPlace, projectRecord, resolveImportedPlace, validateCatalogueUpdate } from '@/lib/places/registry'
import { makeCoordinateRegion } from '@/lib/places/coordinate-region'
import type { Regions } from '@/lib/species/types'
import { retainPlaceHistory } from '../scripts/build-data/build-place-registry'

const regions = JSON.parse(readFileSync('public/data/regions.v1.json', 'utf8')) as Regions
const taxonomy = buildTaxonomyIndex(JSON.parse(readFileSync('tests/fixtures/species/taxonomy.json', 'utf8')).taxa)
const name = 'Colaptes chrysoides'
const header = 'Date,Common Name,Scientific Name,S/P,Countable'
const fullHeader = 'Date,Common Name,Scientific Name,State/Province,Latitude,Longitude'
const resultPlace = (code: string) => parseEbirdLifeList(`${header}\n1 Jan 2026,Gilded Flicker,${name},${code},1`, taxonomy, regions).records[0].place

describe('shared Places registry', () => {
  it('contains all audited places and can label each independently of ISO', () => {
    const ebird = Object.entries(regions.registry!.catalogues.ebird.entries)
    const inat = Object.entries(regions.registry!.catalogues.inat.entries)
    expect(ebird).toHaveLength(253 + 3669)
    expect(inat).toHaveLength(253 + 3578)
    for (const [namespace, entries] of [['ebird', ebird], ['inat', inat]] as const) {
      const edition = regions.registry!.catalogues[namespace].edition
      const missing = entries.filter(([id]) => {
        const place = resolveImportedPlace({ namespace, id, edition }, regions)
        return !formatPlace(projectPlace(place, regions), regions)
      })
      expect(missing).toEqual([])
    }
  })

  it('reconciles Jeju and preserves Sejong and source-specific Danish geography', () => {
    const inat = makePlaceResolver(regions, new Map([
      [6891, { id: 6891, name: 'South Korea', admin_level: 0 }],
      [11003, { id: 11003, name: 'Jeju', admin_level: 10 }],
      [96973, { id: 96973, name: 'Sejong', admin_level: 10 }],
    ]))
    expect(projectPlace(resultPlace('KR-50'), regions)).toEqual({ country: 'KR', sub1: 'KR-49' })
    expect(projectPlace(inat([6891, 11003]), regions)).toEqual({ country: 'KR', sub1: 'KR-49' })
    expect(projectPlace(inat([6891, 96973]), regions)).toEqual({ country: 'KR', sub1: 'KR-50' })
    expect(projectPlace(resultPlace('KR-36'), regions)).toEqual({ country: 'KR', sub1: 'KR-50' })
    const copenhagen = projectPlace(resultPlace('DK-01'), regions)!
    expect(formatPlace(copenhagen, regions)).toBe('København, Denmark')
    expect(placeName('s:' + copenhagen.sub1, regions)).toBe('København')
    expect(hasSourcePlaceKey(copenhagen.sub1!)).toBe(true)
  })

  it('keeps an unversioned reused eBird ID at country level and uses valid local coordinates', async () => {
    expect(projectPlace(resultPlace('VN-48'), regions)).toEqual({ country: 'VN' })
    const result = await parseEbirdMyData(
      `${fullHeader}\n2026-01-01,Gilded Flicker,${name},VN-48,16.0544,108.2022`,
      taxonomy, undefined, async () => () => 'VN-V48', regions,
    )
    const record = result.records[0]
    expect(JSON.stringify(record)).not.toMatch(/16\.0544|108\.2022/)
    expect(projectRecord(record, regions)).toMatchObject({
      place: { country: 'VN', sub1: 'VN-V48' },
      seen: ['2026-01-01|VN-V48'],
    })
    expect(hasSourcePlaceKey(record.place!.sub1!)).toBe(true)
  })

  it('keeps former Vietnamese provinces visible under their verified present-day parent', () => {
    const former = projectPlace(resultPlace('VN-27'), regions)!
    expect(former.sub1).toBe('VN-V48')
    expect(formatPlace(former, regions)).toBe('Quang Nam, Đà Nẵng, Vietnam')
    expect(projectPlace(resultPlace('VN-04'), regions)).toEqual({ country: 'VN', sub1: 'VN-V04' })
  })

  it('links Mexican state names across platforms despite reused local abbreviations', () => {
    const place = (id: string) => projectPlace(resolveImportedPlace({ namespace: 'inat', id }, regions), regions)
    expect(place('11165')?.sub1).toBe('MX-CHH') // Chihuahua
    expect(place('97003')?.sub1).toBe('MX-CHP') // Chiapas, also MX-CH in iNaturalist's metadata
    expect(place('13117')).toEqual(projectPlace(resultPlace('MX-VER'), regions))
    expect(willetCode(place('13117'), 6)).toBe('willet2')
  })

  it('reprojects an Observation.org record and its months after a catalogue correction', async () => {
    const result = await parseObsOrgObservations(
      `date,scientific name,species type,country,country division\n2025-03-01,${name},species,Canada,Historic Division`,
      taxonomy, {}, regions,
    )
    if ('error' in result) throw new Error(result.error)
    const saved = emptySaved()
    saved.records.obsorg = result.records
    const roundTrip = fromJson(toJson(saved))
    const raw = roundTrip.records.obsorg[0]
    expect(projectRecord(raw, regions)).toMatchObject({ place: { country: 'CA' }, seen: ['2025-03-01|CA'] })
    const next: Regions = {
      ...regions, registry: { v: 1, catalogues: {
        ...regions.registry!.catalogues,
        obsorg: { edition: 'later', entries: { [divisionId('CA', 'Historic Division')]: ['CA', 'Historic Division', 'CA-BC'] } },
      } },
    }
    expect(recordsOf(roundTrip, next)[0]).toMatchObject({
      place: { country: 'CA', sub1: 'CA-BC' }, seen: ['2025-03-01|CA-BC'], seenMonths: [expect.stringMatching(/\|CA-BC$/)],
    })
    expect(roundTrip.records.obsorg[0].place).toEqual(raw.place)
    expect(hasSourcePlaceKey(raw.place!.sub1!)).toBe(true)
  })

  it('resolves Observation.org country aliases and Slovenian statistical regions', () => {
    const resolve = makeObsOrgPlaces(regions)
    expect(resolve('Principado de Andorra', '')).toEqual({ country: 'AD' })
    expect(resolve('Slovenië', 'Gorenjska')).toEqual({ country: 'SI', sub1: 'SI-SR09' })
    expect(resolve('Slovenië', 'Obalno-kraška')).toEqual({ country: 'SI', sub1: 'SI-SR12' })
    expect(resolve('Slovenië', 'Brežice')).toEqual({ country: 'SI', sub1: 'SI-009' })
    expect(resolve('Oostenrijk', 'Gorenjska')).toEqual({ country: 'AT' })
    const older = resolveImportedPlace({ namespace: 'obsorg', id: divisionId('SI', 'Gorenjska'), country: 'SI' }, {
      ...regions, registry: undefined,
    })
    expect(projectPlace(older, regions)).toEqual({ country: 'SI', sub1: 'SI-SR09' })
  })

  it('loads the Vietnamese coordinate pack once, skips obscured, embargoed and ambiguous points, and has none for Slovenia', async () => {
    const locate = vi.fn(makeCoordinateRegion(JSON.parse(readFileSync('public/data/vietnam-boundaries.v1.json', 'utf8'))))
    const load = vi.fn(async () => locate)
    const header = 'date,scientific name,species type,country,country division,lng,lat,accuracy,obscurity,embargo date'
    const result = await parseObsOrgObservations([
      header,
      `2025-05-01,${name},species,Vietnam,Unknown,105.8342,21.0278,10,False,`,
      `2025-05-02,${name},species,Vietnam,,105.8342,21.0278,10,False,`,
      `2025-05-03,${name},species,Vietnam,,105.8342,21.0278,10,True,`,
      `2025-05-04,${name},species,Vietnam,,105.8342,21.0278,10,False,2027-01-01`,
      `2025-05-05,${name},species,Vietnam,TP. Da Nang,105.8342,21.0278,10,False,`,
      `2025-06-01,${name},species,Vietnam,,105.8342,21.0278,50000,False,`,
      `2025-06-02,${name},species,Slovenia,,14.1136,46.3636,10,False,`,
    ].join('\n'), taxonomy, {}, regions, undefined, load)
    if ('error' in result) throw new Error(result.error)
    expect(load).toHaveBeenCalledExactlyOnceWith('VN')
    expect(locate).toHaveBeenCalledTimes(3)
    expect(projectRecord(result.records[0], regions).seen).toEqual(expect.arrayContaining([
      '2025-05-01|VN-V01', '2025-05-03|VN', '2025-05-05|VN-V48', '2025-06-02|SI',
    ]))
    expect(JSON.stringify(result.records)).not.toMatch(/105\.8342|21\.0278|14\.1136|46\.3636/)
  })

  it('preserves retired place editions and declines an unversioned ID whose source definition changed', () => {
    const catalogue = retainPlaceHistory(
      { edition: '2026-01-01', entries: { reused: ['CA', 'Old unit', 'CA-BC'], retired: ['CA', 'Former province'] } },
      { edition: '2026-02-01', entries: { reused: ['CA', 'New unit', 'CA-AB'] } },
    )
    const data: Regions = { ...regions, registry: { v: 1, catalogues: { test: catalogue } } }
    const original = resolveImportedPlace({ namespace: 'test', id: 'reused', country: 'CA', edition: '2026-01-01' }, data)
    const ambiguous = resolveImportedPlace({ namespace: 'test', id: 'reused', country: 'CA' }, data)
    const former = resolveImportedPlace({ namespace: 'test', id: 'retired' }, data)
    expect(projectPlace(original, data)).toEqual({ country: 'CA', sub1: 'CA-BC' })
    expect(projectPlace(ambiguous, data)).toEqual({ country: 'CA' })
    expect(formatPlace(projectPlace(former, data), data)).toBe('Former province, Canada')
  })

  it('repairs the old raw eBird code in the saved view while preserving it in backups', () => {
    const saved = emptySaved()
    saved.records.ebird = [{ code: 'gilfli', source: 'ebird', place: { country: 'KR', sub1: 'KR-50' }, seen: ['2024-01-01|KR-50'] }]
    expect(recordsOf(saved, regions)[0]).toMatchObject({
      place: { country: 'KR', sub1: 'KR-49' }, seen: ['2024-01-01|KR-49'],
    })
    expect(fromJson(toJson(saved)).records.ebird[0].place?.sub1).toBe('KR-50')
  })

  it('a fourth parser can use existing codes, new data and country-only records without changing Places', () => {
    const all: Regions = { ...regions, registry: { v: 1, catalogues: {
      ...regions.registry!.catalogues,
      future: { edition: 'edition-1', entries: {
        'its-province': ['CA', 'British Columbia', 'CA-BC'],
        island: ['CA', 'Island District', null, 'CA-BC'],
        'their-region': ['CA', 'Source-only region'],
        country: ['CA', 'Canada', 'CA'],
      } },
    } } }
    const parse = (row: string) => {
      const [namespace, id] = row.split('\t')
      return resolveImportedPlace({ namespace, id }, all)!
    }
    const sightings = new SeenAgg()
    const rows = ['iso\tCA-BC', 'future\tits-province', 'future\tisland', 'future\ttheir-region', 'future\tcountry']
    for (const row of rows) sightings.add('gilfli', parse(row), '2026-03-14')
    const saved = emptySaved()
    saved.records.manual.push({
      code: 'gilfli', source: 'manual', date: '2026-03-14', place: parse(rows[1]),
      seen: sightings.get('gilfli'), seenMonths: sightings.getMonths('gilfli'),
    })
    const records = recordsOf(saved, all)
    const list = buildList(records, saved.edits, saved.rules)
    const seen = buildSeen(records, saved.edits, saved.rules, list)
    const places = seen.byCode.get('gilfli')!.places
    expect(places.filter((p) => p.sub1 === 'CA-BC' && !p.sub2)).toHaveLength(1)
    expect(places.some((p) => formatPlace(p, all) === 'Island District, British Columbia, Canada')).toBe(true)
    expect(places.some((p) => formatPlace(p, all) === 'Source-only region, Canada')).toBe(true)
    expect(places.some((p) => p.country === 'CA' && !p.sub1)).toBe(true)
    expect(seen.byCode.get('gilfli')!.keys.has('s:CA-BC')).toBe(true)
    expect(toCsv(list, { rows: [], byCode: new Map(), search: () => [] }, all, seen)).toContain('British Columbia, Canada')
  })

  it('validates catalogue updates for added, retired, reused IDs and parent changes', () => {
    const previous = {
      edition: '2026-01-01',
      entries: {
        keep: ['CA', 'British Columbia', 'CA-BC'] as [string, string, string],
        retired: ['CA', 'Former province'] as [string, string],
        reused: ['CA', 'Old unit', 'CA-BC'] as [string, string, string],
        reparented: ['CA', 'Island District', null, 'CA-BC'] as [string, string, null, string],
      },
    }
    const rawNext = {
      edition: '2026-02-01',
      entries: {
        keep: ['CA', 'British Columbia', 'CA-BC'] as [string, string, string],
        added: ['CA', 'Yukon', 'CA-YT'] as [string, string, string],
        reused: ['CA', 'New unit', 'CA-AB'] as [string, string, string],
        reparented: ['CA', 'Island District', null, 'CA-AB'] as [string, string, null, string],
      },
    }
    const invalid = validateCatalogueUpdate(previous, rawNext)
    expect(invalid).toEqual({
      added: ['added'],
      retired: ['retired'],
      reused: ['reused'],
      parentChanges: ['reparented'],
      errors: ['retired:retired', 'reused:reused', 'history:reused', 'history:reparented'],
    })
    const valid = validateCatalogueUpdate(previous, retainPlaceHistory(previous, rawNext))
    expect(valid).toEqual({
      added: ['added'],
      retired: ['retired'],
      reused: ['reused'],
      parentChanges: ['reparented'],
      errors: [],
    })
  })
})
