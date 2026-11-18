import { describe, expect, it } from 'vitest'
import { makeSub1Index, SUB1_ALIASES, sub1Names } from '@/lib/import/sub1-index'
import { stripBracket } from '@/lib/import/places'
import { makeObsOrgPlaces, OBSORG_SUB1_ALIASES } from '@/lib/import/obsorg-places'
import { makePlaceResolver } from '@/lib/import/inat'
import { foldName } from '@/lib/species/resolve'
import { regions } from './obsorg-helpers'

/** iNaturalist's resolver over one country and one sub1 name. */
const inatPlace = (country: string, sub1: string) =>
  makePlaceResolver(regions, new Map([[1, { id: 1, name: country, admin_level: 0 }], [2, { id: 2, name: sub1, admin_level: 10 }]]))([1, 2])

describe('the shared sub1 name index', () => {
  it('an alias wins over a real name: Washington is the state, Murcia and Valencia the communities', () => {
    const sub1 = makeSub1Index(regions)
    expect(sub1('US', 'Washington')).toBe('US-WA')
    expect(sub1('US', 'District of Columbia')).toBe('US-DC')
    expect(sub1('ES', 'La Rioja')).toBe('ES-RI')
    expect(sub1('ES', 'Murcia')).toBe('ES-MC')
    expect(sub1('ES', 'Valencia')).toBe('ES-VC')
    expect(sub1('CN', 'Yunnan')).toBe('CN-53')
    expect(sub1('AR', 'Buenos Aires')).toBe('AR-B')
    // Both importers read the same index.
    expect(inatPlace('United States', 'Washington')).toEqual({ country: 'US', sub1: 'US-WA' })
    expect(inatPlace('Spain', 'Murcia')).toEqual({ country: 'ES', sub1: 'ES-MC' })
    expect(makeObsOrgPlaces(regions)('Verenigde Staten', 'Washington')).toEqual({ country: 'US', sub1: 'US-WA' })
    expect(makeObsOrgPlaces(regions)('Spanje', 'Valencia')).toEqual({ country: 'ES', sub1: 'ES-VC' })
  })
  it('a name two codes claim, with no alias, is the country only for observation.org; iNaturalist keeps the first', () => {
    expect(regions.sub1['BG-22']).toBe('Sofia')
    expect(regions.sub1['BG-23']).toBe('Sofia')
    expect(makeSub1Index(regions)('BG', 'Sofia')).toBeUndefined()
    expect(makeSub1Index(regions, undefined, undefined, { onClash: 'first' })('BG', 'Sofia')).toBe('BG-22')
    expect(inatPlace('Bulgaria', 'Sofia')).toEqual({ country: 'BG', sub1: 'BG-22' })
    expect(makeObsOrgPlaces(regions)('Bulgarije', 'Sofia')).toEqual({ country: 'BG' })
    // Three or more claimants stay dead too (a third claim must not revive the name).
    const r = { v: 1 as const, countries: { AA: 'A' }, sub1: { 'AA-1': 'Twin', 'AA-2': 'Twin', 'AA-3': 'Twin', 'AA-4': 'Solo [Alone]' } }
    const sub1 = makeSub1Index(r, [])
    expect(sub1('AA', 'Twin')).toBeUndefined()
    expect(sub1('AA', 'Solo')).toBe('AA-4')
    expect(sub1('AA', 'Alone')).toBe('AA-4')
    expect(sub1('BB', 'Solo')).toBeUndefined()
    expect(makeSub1Index(r, [{ 'AA-2': ['Twin'] }])('AA', 'Twin')).toBe('AA-2')
    expect(makeSub1Index(r, [], undefined, { onClash: 'first' })('AA', 'Twin')).toBe('AA-1')
    expect(makeSub1Index(r, [{ 'AA-2': ['Twin'] }], undefined, { onClash: 'first' })('AA', 'Twin')).toBe('AA-2')
  })
  it('iNaturalist resolves every sub1 name as it did before the shared index, except the names the aliases settle', () => {
    // inat.ts at 601305e: real names first (the first code in regions.sub1 order wins), then this alias table, which
    // only filled gaps.
    const OLD_ALIASES: Record<string, string[]> = {
      'BE-VLG': ['Vlaanderen', 'Vlaams Gewest', 'Flemish Region'], 'BE-WAL': ['Wallonie', 'Région wallonne', 'Walloon Region'],
      'CZ-10': ['Praha', 'Hlavní město Praha'], 'ES-AS': ['Principado de Asturias'], 'ES-CT': ['Catalunya', 'Cataluña'],
      'ES-IB': ['Illes Balears', 'Islas Baleares'], 'ES-MC': ['Murcia', 'Región de Murcia'], 'ES-MD': ['Madrid', 'Comunidad de Madrid'],
      'ES-NC': ['Navarra', 'Comunidad Foral de Navarra'], 'ES-VC': ['Comunitat Valenciana', 'Comunidad Valenciana', 'Valencia'],
      'FR-973': ['Guyane'], 'US-VI': ['Virgin Islands', 'United States Virgin Islands'],
    }
    const old = new Map<string, Map<string, string>>()
    for (const [code, name] of Object.entries(regions.sub1)) {
      const iso = code.split('-')[0]
      let m = old.get(iso)
      if (!m) old.set(iso, (m = new Map()))
      for (const n of sub1Names(name)) if (!m.has(n)) m.set(n, code)
    }
    for (const [code, names] of Object.entries(OLD_ALIASES)) {
      const m = regions.sub1[code] ? old.get(code.split('-')[0]) : undefined
      if (m) for (const n of names) if (!m.has(foldName(n))) m.set(foldName(n), code)
    }
    const oldPlace = (iso: string, name: string) => old.get(iso)?.get(foldName(stripBracket(name)))
    const names = new Set<string>()
    for (const [code, name] of Object.entries(regions.sub1)) for (const n of [name, ...sub1Names(name)]) names.add(`${code.split('-')[0]}|${n}`)
    for (const table of [OLD_ALIASES, SUB1_ALIASES]) for (const [code, list] of Object.entries(table)) for (const n of list) names.add(`${code.split('-')[0]}|${n}`)
    // One resolver over every country and name (iNaturalist place ids are arbitrary here).
    const byId = new Map<number, { id: number; name: string; admin_level: number }>()
    const ids = new Map<string, number>()
    const id = (name: string, level: number) => {
      const k = `${level}|${name}`
      if (!ids.has(k)) {
        ids.set(k, ids.size + 1)
        byId.set(ids.size, { id: ids.size, name, admin_level: level })
      }
      return ids.get(k)!
    }
    const pairs = [...names].map((k) => k.split('|')).filter(([iso]) => regions.countries[iso])
    const at = pairs.map(([iso, name]) => [id(regions.countries[iso], 0), id(name, 10)])
    const resolve = makePlaceResolver(regions, byId)
    const changed = new Set<string>()
    pairs.forEach(([iso, name], i) => {
      const now = resolve(at[i])?.sub1
      // The canonical Vietnam/India mappings have their own import regression tests.
      if (iso === 'VN' || (iso === 'IN' && foldName(name) === 'uttarakhand')) return
      const before = oldPlace(iso, name)
      if (now !== before) changed.add(`${iso}|${foldName(stripBracket(name))}: ${before} -> ${now}`)
    })
    // Six are real names two codes share, a province and the autonomous community or state eBird uses, which the
    // first-in-order rule gave to the wrong one (the province, or Washington, D.C.); three are new alias names that
    // only fill a gap (the city of Buenos Aires, the District of Columbia). SUB1_ALIASES names eBird's subnational1,
    // so these are deliberate; nothing else changes, alias names included.
    expect([...changed].sort()).toEqual([
      'AR|ciudad autonoma de buenos aires: undefined -> AR-C',
      'AR|ciudad de buenos aires: undefined -> AR-C',
      'ES|community of madrid: ES-M -> ES-MD',
      'ES|la rioja: ES-LO -> ES-RI',
      'ES|murcia: ES-MU -> ES-MC',
      'ES|navarre: ES-NA -> ES-NC',
      'ES|valencia: ES-V -> ES-VC',
      'US|district of columbia: undefined -> US-DC',
      'US|washington: US-DC -> US-WA',
    ])
    for (const line of changed) {
      const [, key, to] = /^([A-Z]+\|[^:]+): \S+ -> (\S+)$/.exec(line)!
      expect((SUB1_ALIASES[to] ?? []).map(foldName), line).toContain(key.split('|')[1])
    }
  })
  it('no alias name points at two codes in one country, and every alias names a real code', () => {
    const seen = new Map<string, string>()
    for (const table of [SUB1_ALIASES, OBSORG_SUB1_ALIASES]) {
      for (const [code, names] of Object.entries(table)) {
        expect(regions.sub1[code], code).toBeDefined()
        for (const name of names) {
          const k = `${code.split('-')[0]}|${foldName(name)}`
          expect(seen.get(k) ?? code, k).toBe(code)
          seen.set(k, code)
        }
      }
    }
  })
})
