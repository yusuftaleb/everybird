import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatPlace, loadRegions, placeFromSubnational, resetRegionsCache, stripBracket } from '../src/lib/import/places'
import type { Regions } from '../src/lib/species/types'

const R: Regions = {
  v: 1,
  countries: { CA: 'Canada', EG: 'Egypt', GB: 'United Kingdom' },
  sub1: { 'CA-BC': 'British Columbia', 'GB-CYM': 'Wales [Cymru GB-CYM]', 'ES-MD': 'Madrid, Comunidad de' },
}

describe('formatPlace', () => {
  it('formats sub2, sub1, country', () => {
    expect(formatPlace({ country: 'CA', sub1: 'CA-BC', sub2: 'Okanagan-Similkameen' }, R)).toBe('Okanagan-Similkameen, British Columbia, Canada')
  })
  it('formats sub1, country without sub2', () => {
    expect(formatPlace({ country: 'CA', sub1: 'CA-BC' }, R)).toBe('British Columbia, Canada')
  })
  it('falls back to country for an unknown sub1, dropping sub2', () => {
    expect(formatPlace({ country: 'CA', sub1: 'CA-ZZ' }, R)).toBe('Canada')
    expect(formatPlace({ country: 'CA', sub1: 'CA-ZZ', sub2: 'Nowhere' }, R)).toBe('Canada')
    expect(formatPlace({ country: 'CA', sub2: 'Nowhere' }, R)).toBe('Canada')
  })
  it('country only', () => {
    expect(formatPlace({ country: 'EG' }, R)).toBe('Egypt')
  })
  it('undefined and empty give empty string', () => {
    expect(formatPlace(undefined, R)).toBe('')
    expect(formatPlace({}, R)).toBe('')
  })
  it('derives the country from the sub1 prefix', () => {
    expect(formatPlace({ sub1: 'CA-BC' }, R)).toBe('British Columbia, Canada')
  })
  it('unknown country gives empty unless a sub1 name is known', () => {
    expect(formatPlace({ country: 'ZZ' }, R)).toBe('')
    expect(formatPlace({ country: 'ZZ', sub1: 'ZZ-XX' }, R)).toBe('')
    expect(formatPlace({ country: 'ZZ', sub1: 'CA-BC' }, R)).toBe('British Columbia, Canada')
    expect(formatPlace({ country: 'ZZ', sub1: 'CA-BC', sub2: 'Okanagan' }, R)).toBe('Okanagan, British Columbia, Canada')
  })
  it('known sub1 with unknown country omits the country', () => {
    expect(formatPlace({ country: 'XX', sub1: 'XX-BC' }, { ...R, sub1: { ...R.sub1, 'XX-BC': 'Bee Region' } })).toBe('Bee Region')
  })
  it('strips ISO bracket forms, leaves inverted names', () => {
    expect(formatPlace({ country: 'GB', sub1: 'GB-CYM' }, R)).toBe('Wales, United Kingdom')
    expect(formatPlace({ sub1: 'ES-MD' }, R)).toBe('Madrid, Comunidad de')
  })
})

describe('stripBracket', () => {
  it('removes a trailing bracket only', () => {
    expect(stripBracket('Wales [Cymru GB-CYM]')).toBe('Wales')
    expect(stripBracket('Wales  [x]  ')).toBe('Wales')
    expect(stripBracket('Plain')).toBe('Plain')
    expect(stripBracket('[Only]')).toBe('[Only]')
  })
})

describe('placeFromSubnational', () => {
  it('splits a sub1 code', () => {
    expect(placeFromSubnational('CA-BC')).toEqual({ country: 'CA', sub1: 'CA-BC' })
    expect(placeFromSubnational('EG-DK').country).toBe('EG')
  })
  it('handles a bare country code', () => {
    expect(placeFromSubnational('EG')).toEqual({ country: 'EG' })
  })
  it('trims and upper-cases', () => {
    expect(placeFromSubnational('  ca-bc ')).toEqual({ country: 'CA', sub1: 'CA-BC' })
  })
  it('empty and junk give {}', () => {
    expect(placeFromSubnational('')).toEqual({})
    expect(placeFromSubnational('   ')).toEqual({})
  })
})

describe('loadRegions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetRegionsCache()
  })
  it('fetches once and caches', async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => R }))
    vi.stubGlobal('fetch', f)
    const [a, b] = await Promise.all([loadRegions(), loadRegions()])
    expect(a).toBe(R)
    expect(b).toBe(R)
    await loadRegions()
    expect(f).toHaveBeenCalledTimes(1)
    expect(f).toHaveBeenCalledWith('/data/regions.v1.json')
  })
  it('does not cache a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })))
    await expect(loadRegions()).rejects.toThrow()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => R })))
    await expect(loadRegions()).resolves.toBe(R)
  })
})
