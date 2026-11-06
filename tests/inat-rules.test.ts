import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { REGION_RULES, applyRegionRule, willetCode } from '@/lib/import/inat-rules'
import type { SpeciesFile } from '@/lib/species/types'

const AB = { country: 'CA', sub1: 'CA-AB', sub2: 'Division No. 4' }
const FL = { country: 'US', sub1: 'US-FL' }

describe('willet (iNat lumps Tringa semipalmata; eBird splits willet2 Saltmarsh / willet3 Prairie)', () => {
  it('subspecies decide when iNat gives one, wherever and whenever', () => {
    expect(applyRegionRule('Tringa semipalmata', 'inornata', FL, '2024-06-01')).toEqual({ code: 'willet3' })
    expect(applyRegionRule('Tringa semipalmata', 'semipalmata', AB, '2024-05-01')).toEqual({ code: 'willet2' })
  })

  it('Alberta in May is Prairie Willet, assigned by region', () => {
    expect(applyRegionRule('Tringa semipalmata', undefined, AB, '2024-05-12')).toEqual({ code: 'willet3', assigned: 'region' })
  })

  it('Florida in June is Saltmarsh Willet; Florida in January is Prairie Willet', () => {
    expect(applyRegionRule('Tringa semipalmata', undefined, FL, '2024-06-10')).toEqual({ code: 'willet2', assigned: 'region' })
    expect(applyRegionRule('Tringa semipalmata', undefined, FL, '2024-01-10')).toEqual({ code: 'willet3', assigned: 'region' })
  })

  it('an unknown place is Prairie Willet (the more widespread), flagged as a default', () => {
    expect(applyRegionRule('Tringa semipalmata', undefined, undefined, '2024-06-10')).toEqual({ code: 'willet3', assigned: 'default' })
    // US with no state: cannot tell coast from interior
    expect(applyRegionRule('Tringa semipalmata', undefined, { country: 'US' }, '2024-06-10')).toEqual({ code: 'willet3', assigned: 'default' })
  })

  it('willetCode: Atlantic, Gulf and Caribbean coasts in Apr-Aug; interior and Pacific always Prairie', () => {
    const m = (place: Parameters<typeof willetCode>[0], month?: number) => willetCode(place, month)
    expect(m({ country: 'US', sub1: 'US-NJ' }, 4)).toBe('willet2')
    expect(m({ country: 'US', sub1: 'US-TX' }, 8)).toBe('willet2')
    expect(m({ country: 'US', sub1: 'US-TX' }, 9)).toBe('willet3')
    expect(m({ country: 'CA', sub1: 'CA-NS' }, 7)).toBe('willet2')
    expect(m({ country: 'MX', sub1: 'MX-TAM' }, 5)).toBe('willet2')
    expect(m({ country: 'BS' }, 6)).toBe('willet2')
    expect(m({ country: 'PR' }, 6)).toBe('willet2')
    expect(m({ country: 'US', sub1: 'US-PR' }, 6)).toBe('willet2')
    expect(m({ country: 'CU' }, 12)).toBe('willet3')
    expect(m({ country: 'US', sub1: 'US-CA' }, 6)).toBe('willet3')
    expect(m({ country: 'US', sub1: 'US-ND' }, 6)).toBe('willet3')
    expect(m({ country: 'CA', sub1: 'CA-SK' }, 6)).toBe('willet3')
    expect(m({ country: 'BR' }, 6)).toBe('willet3')
    // a coastal state with no month (year-only date): cannot tell season -> undefined (default)
    expect(m({ country: 'US', sub1: 'US-FL' }, undefined)).toBeUndefined()
    expect(m(undefined, 6)).toBeUndefined()
  })

  it('a coastal record with only a year falls back to the default', () => {
    expect(applyRegionRule('Tringa semipalmata', undefined, FL, '2024')).toEqual({ code: 'willet3', assigned: 'default' })
    // interior needs no month
    expect(applyRegionRule('Tringa semipalmata', undefined, AB, '2024')).toEqual({ code: 'willet3', assigned: 'region' })
  })
})

describe('marsh wren (iNat Cistothorus palustris; eBird eamwre1 Eastern / marwre1 Western)', () => {
  it('western North America is Western, other known places Eastern, by region', () => {
    expect(applyRegionRule('Cistothorus palustris', undefined, { country: 'CA', sub1: 'CA-BC' }, '2024-05-01')).toEqual({ code: 'marwre1', assigned: 'region' })
    expect(applyRegionRule('Cistothorus palustris', undefined, { country: 'US', sub1: 'US-NY' }, '2024-05-01')).toEqual({ code: 'eamwre1', assigned: 'region' })
    expect(applyRegionRule('Cistothorus palustris', undefined, { country: 'MX' }, '2024-05-01')).toEqual({ code: 'marwre1', assigned: 'region' })
  })

  it('unknown place falls back to Western (the synonym) and is flagged', () => {
    expect(applyRegionRule('Cistothorus palustris', undefined, undefined, undefined)).toEqual({ code: 'marwre1', assigned: 'default' })
    expect(applyRegionRule('Cistothorus palustris', undefined, { country: 'US' }, undefined)).toEqual({ code: 'marwre1', assigned: 'default' })
  })

  it('an eastern subspecies decides', () => {
    expect(applyRegionRule('Cistothorus palustris', 'waynei', { country: 'US', sub1: 'US-CA' }, '2024-05-01')).toEqual({ code: 'eamwre1' })
    expect(applyRegionRule('Cistothorus palustris', 'plesius', { country: 'US', sub1: 'US-NY' }, '2024-05-01')).toEqual({ code: 'marwre1' })
  })
})

describe('horned owl (iNat Bubo virginianus; eBird grhowl Great / grhowl19 Tropical)', () => {
  const r = (ssp: string | undefined, place: Parameters<typeof applyRegionRule>[2]) => applyRegionRule('Bubo virginianus', ssp, place, '2024-03-01')
  it('South America is Tropical, North and Central America Great, by region', () => {
    expect(r(undefined, { country: 'BR' })).toEqual({ code: 'grhowl19', assigned: 'region' })
    expect(r(undefined, { country: 'AR', sub1: 'AR-B' })).toEqual({ code: 'grhowl19', assigned: 'region' })
    expect(r(undefined, { country: 'FR', sub1: 'FR-973' })).toEqual({ code: 'grhowl19', assigned: 'region' }) // French Guiana
    expect(r(undefined, { country: 'US', sub1: 'US-NY' })).toEqual({ code: 'grhowl', assigned: 'region' })
    expect(r(undefined, { country: 'MX' })).toEqual({ code: 'grhowl', assigned: 'region' })
    expect(r(undefined, { country: 'FR', sub1: 'FR-75' })).toEqual({ code: 'grhowl', assigned: 'region' })
  })
  it('subspecies decide; unknown place is Great Horned Owl by default', () => {
    expect(r('nacurutu', { country: 'US' })).toEqual({ code: 'grhowl19' })
    expect(r('virginianus', { country: 'BR' })).toEqual({ code: 'grhowl' })
    expect(r(undefined, undefined)).toEqual({ code: 'grhowl', assigned: 'default' })
  })
})

describe('whistling-thrush (iNat Myophonus caeruleus; eBird bluwht1 Chinese / bluwht2 Yellow-billed)', () => {
  const r = (ssp: string | undefined, place: Parameters<typeof applyRegionRule>[2]) => applyRegionRule('Myophonus caeruleus', ssp, place, '2024-03-01')
  it('China outside Yunnan, Tibet and Xinjiang (and Hong Kong) is Chinese; everywhere else Yellow-billed', () => {
    expect(r(undefined, { country: 'CN', sub1: 'CN-SC' })).toEqual({ code: 'bluwht1', assigned: 'region' })
    expect(r(undefined, { country: 'CN', sub1: 'CN-51' })).toEqual({ code: 'bluwht1', assigned: 'region' })
    expect(r(undefined, { country: 'CN' })).toEqual({ code: 'bluwht1', assigned: 'region' })
    expect(r(undefined, { country: 'HK' })).toEqual({ code: 'bluwht1', assigned: 'region' })
    expect(r(undefined, { country: 'CN', sub1: 'CN-YN' })).toEqual({ code: 'bluwht2', assigned: 'region' })
    expect(r(undefined, { country: 'CN', sub1: 'CN-53' })).toEqual({ code: 'bluwht2', assigned: 'region' })
    expect(r(undefined, { country: 'IN' })).toEqual({ code: 'bluwht2', assigned: 'region' })
    expect(r(undefined, { country: 'ID' })).toEqual({ code: 'bluwht2', assigned: 'region' })
  })
  it('subspecies decide; unknown place is Yellow-billed by default', () => {
    expect(r('caeruleus', { country: 'IN' })).toEqual({ code: 'bluwht1' })
    expect(r('temminckii', { country: 'CN', sub1: 'CN-SC' })).toEqual({ code: 'bluwht2' })
    expect(r(undefined, undefined)).toEqual({ code: 'bluwht2', assigned: 'default' })
  })
})

describe('spotted flycatcher (iNat Muscicapa striata; eBird spofly2 Spotted / spofly3 Mediterranean)', () => {
  const r = (place: Parameters<typeof applyRegionRule>[2], date: string, ssp?: string) => applyRegionRule('Muscicapa striata', ssp, place, date)
  it('Balearics, Corsica and Sardinia in June-July are Mediterranean; migrants and elsewhere Spotted', () => {
    expect(r({ country: 'ES', sub1: 'ES-IB' }, '2024-06-10')).toEqual({ code: 'spofly3', assigned: 'region' })
    expect(r({ country: 'FR', sub1: 'FR-2A' }, '2024-07-10')).toEqual({ code: 'spofly3', assigned: 'region' })
    expect(r({ country: 'IT', sub1: 'IT-88' }, '2024-06-10')).toEqual({ code: 'spofly3', assigned: 'region' })
    expect(r({ country: 'IT', sub1: 'IT-88' }, '2024-09-10')).toEqual({ code: 'spofly2', assigned: 'region' })
    expect(r({ country: 'GB' }, '2024-06-10')).toEqual({ code: 'spofly2', assigned: 'region' })
  })
  it('subspecies decide; unknown place is Spotted by default', () => {
    expect(r({ country: 'GB' }, '2024-06-10', 'balearica')).toEqual({ code: 'spofly3' })
    expect(r(undefined, '2024-06-10')).toEqual({ code: 'spofly2', assigned: 'default' })
  })
})

describe('applyRegionRule', () => {
  it('names without a rule give undefined', () => {
    expect(applyRegionRule('Colaptes auratus', undefined, AB, '2024-05-01')).toBeUndefined()
  })

  it('an unknown subspecies falls through to region', () => {
    expect(applyRegionRule('Tringa semipalmata', 'nonesuch', AB, '2024-05-01')).toEqual({ code: 'willet3', assigned: 'region' })
  })

  it('every rule targets real species codes', () => {
    const codes = new Set((JSON.parse(readFileSync('public/data/species.v1.json', 'utf8')) as SpeciesFile).species.map((s) => s.code))
    for (const [name, r] of Object.entries(REGION_RULES)) {
      for (const c of [r.fallback, ...Object.values(r.subspecies)]) expect(codes.has(c), `${name} -> ${c}`).toBe(true)
      expect(name).toMatch(/^[A-Z][a-z]+ [a-z]+$/)
    }
  })
})
