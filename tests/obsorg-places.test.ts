import { describe, expect, it, vi } from 'vitest'
import { countryNameMap, makeObsOrgPlaces, OBSORG_COUNTRY_ALIASES, OBSORG_SUB1_ALIASES } from '@/lib/import/obsorg-places'
import { SUB1_PARENT } from '@/lib/import/sub1-parents'
import { sub1Parents } from '../scripts/build-data/build-sub1-parents'
import { makeSub1Index, sub1Names } from '@/lib/import/sub1-index'
import { makePlaceResolver } from '@/lib/import/inat'
import { regions } from './obsorg-helpers'
const place = () => makeObsOrgPlaces(regions)

describe('observation.org country and division names', () => {
  it('maps country names in nl, en, fr, de and es', () => {
    const p = place()
    for (const [name, country] of Object.entries({ Nederland: 'NL', België: 'BE', Spanje: 'ES', 'Verenigd Koninkrijk': 'GB', Belgique: 'BE', Deutschland: 'DE', España: 'ES', Netherlands: 'NL', belgie: 'BE', 'Sint-Helena, Ascension en Tristan da Cunha':'SH', 'Zuid-Georgië en de Zuidelijke Sandwicheilanden':'GS' })) expect(p(name, '')).toEqual({ country })
  })
  it('oceans and unknown countries give no place', () => {
    const p = place()
    expect(p('World','Southern Atlantic Ocean')).toBeUndefined()
    expect(p('Atlantis','X')).toBeUndefined()
  })
  it('maps divisions within the country, dropping one trailing parenthesis and never matching fuzzily', () => {
    const p = place()
    for (const [country, division, iso, sub1] of [
      // Belgian provinces and French departments roll up to their regions (eBird's subnational1).
      ['België','Antwerpen','BE','BE-VLG'], ['België','Oost-Vlaanderen','BE','BE-VLG'], ['België','Henegouwen','BE','BE-WAL'],
      ['Nederland','Noord-Holland','NL','NL-NH'], ['Frankrijk','Pas-de-Calais (62)','FR','FR-HDF'],
      ['België','Limburg (B)','BE','BE-VLG'], ['Nederland','Limburg','NL','NL-LI'], ['België','Brussel','BE','BE-BRU'],
      ['Peru','Cuzco','PE','PE-CUS'], ['Spanje','Murcia','ES','ES-MC'], ['Duitsland','Beieren','DE','DE-BY'], ['Nederland','Fryslân','NL','NL-FR'],
    ]) expect(p(country,division)).toEqual({ country:iso, sub1 })
    expect(p('Nederland','Noord Holand')).toEqual({ country:'NL' })
    expect(p('Nederland','Antwerpen')).toEqual({ country:'NL' })
  })
  it('reads divisions in their own languages, and the UK nation before " - "', () => {
    const p = place()
    for (const [country, division, iso, sub1] of [
      ['Duitsland','Hessen','DE','DE-HE'], ['Duitsland','Thüringen','DE','DE-TH'], ['Oostenrijk','Steiermark','AT','AT-6'],
      ['Oostenrijk','Wien','AT','AT-9'], ['Denemarken','Nordjylland','DK','DK-81'], ['Finland','Varsinais-Suomi','FI','FI-19'],
      ['Kroatië','Splitsko-dalmatinska','HR','HR-17'], ['Kroatië','Grad Zagreb','HR','HR-21'], ['Portugal','Açores','PT','PT-20'],
      ['Peru','Provincia Constitucional del Callao','PE','PE-CAL'], ['België','Brussel / Bruxelles','BE','BE-BRU'],
      ['Frankrijk','Paris','FR','FR-IDF'], ['Spanje','Alicante','ES','ES-VC'], ['Italië','Sassari','IT','IT-88'],
      ['Verenigd Koninkrijk','Cumbria','GB','GB-ENG'],
      ['Verenigd Koninkrijk','England - Kent','GB','GB-ENG'], ['Verenigd Koninkrijk','Wales - Gwynedd','GB','GB-WLS'],
    ]) expect(p(country,division)).toEqual({ country:iso, sub1 })
    // Only the UK's divisions split at the dash; elsewhere the whole name must match.
    expect(p('Duitsland','Hessen - Kassel')).toEqual({ country:'DE' })
    // A Slovenian statistical region has its own key alongside the municipalities.
    expect(p('Slovenië','Pomurska')).toEqual({ country:'SI', sub1:'SI-SR01' })
  })
  it('falls back to country for empty or unknown divisions and caches a pair', () => {
    const p = place()
    expect(p('Nederland','')).toEqual({ country:'NL' })
    expect(p('Nederland','Atlantis')).toEqual({ country:'NL' })
    expect(p('Nederland','Atlantis')).toBe(p('Nederland','Atlantis'))
  })
  it('rolls up only BE, FR, ES, IT and GB, to a top-level code in regions.sub1', () => {
    const countries = new Set(['BE','FR','ES','IT','GB'])
    for (const [child, top] of Object.entries(SUB1_PARENT)) {
      expect(regions.sub1[child], child).toBeDefined()
      expect(regions.sub1[top], top).toBeDefined()
      expect(SUB1_PARENT[top], top).toBeUndefined()
      expect(countries.has(child.split('-')[0]), child).toBe(true)
      expect(top.split('-')[0]).toBe(child.split('-')[0])
    }
    expect(Object.keys(SUB1_PARENT)).toEqual([...Object.keys(SUB1_PARENT)].sort())
    for (const [child, top] of Object.entries({ 'BE-VAN':'BE-VLG', 'BE-WHT':'BE-WAL', 'FR-62':'FR-HDF', 'FR-75':'FR-IDF', 'FR-2A':'FR-20R', 'FR-2B':'FR-20R', 'FR-67':'FR-GES', 'ES-A':'ES-VC', 'GB-CMA':'GB-ENG', 'IT-SS':'IT-88' })) expect(SUB1_PARENT[child], child).toBe(top)
    for (const top of ['BE-BRU','BE-VLG','FR-20R','FR-973','ES-IB','ES-MC','IT-88','GB-ENG']) expect(SUB1_PARENT[top], top).toBeUndefined()
    // The Mediterranean Flycatcher's islands are top-level codes, so rolled-up places still name them.
    for (const code of ['ES-IB','FR-20R','IT-88']) expect(SUB1_PARENT[code]).toBeUndefined()
  })
  it('the generator walks the parent chain, reads bare-suffix parents, and keeps to the five countries', () => {
    const iso = [
      { code:'FR-GES', name:'Grand Est' }, { code:'FR-6AE', name:'Alsace', parent:'FR-GES' }, { code:'FR-67', name:'Bas-Rhin', parent:'FR-6AE' },
      { code:'BE-VLG', name:'Vlaanderen' }, { code:'BE-VAN', name:'Antwerpen', parent:'VLG' }, { code:'NL-UT', name:'Utrecht', parent:'NL-XX' },
    ]
    const sub1 = { 'FR-GES':'Grand Est', 'FR-67':'Bas-Rhin', 'FR-75':'Paris', 'FR-IDF':'Île-de-France', 'BE-VLG':'Flanders', 'BE-VAN':'Antwerp', 'NL-UT':'Utrecht' }
    expect(sub1Parents(iso, sub1)).toEqual({ 'BE-VAN':'BE-VLG', 'FR-67':'FR-GES', 'FR-75':'FR-IDF' })
  })
  it('every alias points to a real code', () => {
    for (const code of Object.keys(OBSORG_SUB1_ALIASES)) expect(regions.sub1[code]).toBeDefined()
    for (const code of Object.values(OBSORG_COUNTRY_ALIASES)) expect(regions.countries[code]).toBeDefined()
  })
  it('drops colliding country names permanently, even if repeated', () => {
    const r = { v:1 as const, countries:{ AA:'Collision', BB:'Collision', CC:'Unique' }, sub1:{} }
    expect(countryNameMap(r, []).has('collision')).toBe(false)
    expect(countryNameMap(r, []).get('unique')).toBe('CC')
  })
  it('a language Intl.DisplayNames cannot build is skipped; English names still resolve', () => {
    const Real = Intl.DisplayNames
    const spy = vi.spyOn(Intl, 'DisplayNames').mockImplementation(function (this: unknown, langs?: string | string[], opts?: Intl.DisplayNamesOptions) {
      if (String(langs) === 'nl') throw new RangeError('no data')
      return new Real(langs, opts!)
    } as never)
    try {
      const names = countryNameMap(regions)
      expect(names.get('netherlands')).toBe('NL')
      expect(names.get('belgique')).toBe('BE')
      expect(names.has('nederland')).toBe(false)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('observation.org: shared names, the overseas departments, and every division of the rolled-up countries', () => {
  const NAMES: Record<string, string> = { BE: 'België', FR: 'Frankrijk', ES: 'Spanje', IT: 'Italië', GB: 'Verenigd Koninkrijk' }
  // Names regions.v1.json gives two codes whose regions differ, with no alias to settle them: none today (the
  // overseas departments' twin codes are settled by OBSORG_SUB1_ALIASES). Add one here, with why, only if it is
  // genuinely ambiguous.
  const AMBIGUOUS = new Set<string>([])
  it('a name two codes share resolves to their common region when both roll up to it', () => {
    // regions.v1.json names GB-WRL "Halton" (GB-HAL's name) and IT-GE "Liguria" (IT-42's).
    expect(regions.sub1['GB-WRL']).toBe('Halton')
    expect(regions.sub1['IT-GE']).toBe('Liguria')
    const p = place()
    expect(p('Verenigd Koninkrijk', 'Halton')).toEqual({ country: 'GB', sub1: 'GB-ENG' })
    expect(p('Verenigd Koninkrijk', 'Wirral')).toEqual({ country: 'GB', sub1: 'GB-ENG' })
    expect(p('Italië', 'Liguria')).toEqual({ country: 'IT', sub1: 'IT-42' })
    for (const name of ['Genova', 'Genoa']) expect(p('Italië', name)).toEqual({ country: 'IT', sub1: 'IT-42' })
    // Different tops (or no roll-up) stay the country only.
    const r = { v: 1 as const, countries: { AA: 'A' }, sub1: { 'AA-1': 'Top', 'AA-2': 'Other', 'AA-11': 'Twin', 'AA-12': 'Twin', 'AA-21': 'Pair', 'AA-22': 'Pair' } }
    const up: Record<string, string> = { 'AA-11': 'AA-1', 'AA-12': 'AA-1', 'AA-21': 'AA-1', 'AA-22': 'AA-2' }
    const idx = makeSub1Index(r, [], undefined, { onClash: 'none', rollUp: (c) => up[c] ?? c })
    expect(idx('AA', 'Twin')).toBe('AA-1')
    expect(idx('AA', 'Pair')).toBeUndefined()
    expect(makeSub1Index(r, [])('AA', 'Twin')).toBeUndefined()
  })
  it('the overseas departments: one code each, as iNaturalist resolves them, and Réunion under both spellings', () => {
    const inat = makeSub1Index(regions, undefined, undefined, { onClash: 'first' })
    const p = place()
    for (const name of ['Guadeloupe', 'Martinique', 'Mayotte', 'Guyane', 'French Guiana']) {
      expect(p('Frankrijk', name), name).toEqual({ country: 'FR', sub1: inat('FR', name) })
    }
    expect(inat('FR', 'La Réunion')).toBe('FR-974')
    for (const name of ['Réunion', 'La Réunion']) expect(p('Frankrijk', name), name).toEqual({ country: 'FR', sub1: 'FR-974' })
  })
  it('every division name of BE, FR, ES, IT and GB in regions.v1.json resolves to a region, never the country only', () => {
    const p = place()
    const missed: string[] = []
    for (const [code, name] of Object.entries(regions.sub1)) {
      const cc = code.split('-')[0]
      if (!NAMES[cc]) continue
      const inner = /\[([^\]]*)\]\s*$/.exec(name)?.[1]?.replace(/\s+[A-Z]{2}-[A-Z0-9]+$/, '').trim()
      for (const raw of [name.replace(/\s*\[[^\]]*\]\s*$/, ''), inner].filter((x): x is string => !!x)) {
        expect(sub1Names(name).length).toBeGreaterThan(0)
        if (AMBIGUOUS.has(`${code}|${raw}`)) continue
        if (!p(NAMES[cc], raw)?.sub1) missed.push(`${code} ${raw}`)
      }
    }
    expect(missed).toEqual([])
  })
  it('iNaturalist is unchanged: its resolver still takes the first code', () => {
    const byId = new Map([[1, { id: 1, name: 'France', admin_level: 0 }], [2, { id: 2, name: 'Réunion', admin_level: 10 }]])
    expect(makePlaceResolver(regions, byId as never)([1, 2])).toEqual({ country: 'FR', sub1: 'FR-RE' })
  })
})

