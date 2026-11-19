// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlacesDrill } from '@/components/filters/PlacesDrill'
import { withI18n } from './i18n-render'
import { buildList } from '@/lib/list/build-list'
import { applyFilter, placeCounts } from '@/lib/list/filters'
import { DEFAULT_RULES, EMPTY_EDITS, type SourceRecord } from '@/lib/list/model'
import { buildSeen } from '@/lib/list/seen'
import { initialState, type AppState } from '@/lib/list/store'
import { CONTINENT_OF, SUB1_CONTINENT } from '@/lib/places/continents'
import { REGION_PRESETS, regionsOfPlace } from '@/lib/places/presets'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Regions } from '@/lib/species/types'

afterEach(cleanup)

const row = (code: string, ord: string, fam: string, to: number) =>
  ({ code, com: code, sci: code, ord, fam, famCom: fam, to }) as never

const rows = [
  row('sp-eg', 'Passeriformes', 'Corvidae', 1),
  row('sp-br', 'Passeriformes', 'Corvidae', 2),
  row('sp-gf', 'Passeriformes', 'Corvidae', 3),
  row('sp-jp', 'Passeriformes', 'Corvidae', 4),
]

const species: SpeciesIndex = {
  rows,
  byCode: new Map(rows.map((r) => [(r as { code: string }).code, r])),
  search: () => [],
}

const rec = (code: string, extra: Partial<SourceRecord>): SourceRecord => ({ code, source: 'ebird', ...extra })

describe('REGION_PRESETS and regionsOfPlace', () => {
  it('maps every non-Antarctica country in CONTINENT_OF to at least one preset', () => {
    for (const [iso, cont] of Object.entries(CONTINENT_OF)) {
      const regs = regionsOfPlace({ country: iso })
      if (cont === 'AN') expect(regs).toEqual([])
      else expect(regs.length, `country ${iso} (${cont})`).toBeGreaterThan(0)
    }
  })

  it('includes MX, CR, PR, BR and overseas Caribbean/South American sub1s in latam', () => {
    for (const country of ['MX', 'CR', 'PR', 'BR', 'GT', 'PA', 'CU', 'DO', 'AR', 'CO', 'PE', 'CL']) {
      expect(regionsOfPlace({ country })).toContain('latam')
    }
    for (const [country, sub1] of [
      ['FR', 'FR-971'],
      ['FR', 'FR-972'],
      ['FR', 'FR-973'],
      ['FR', 'FR-BL'],
      ['FR', 'FR-MF'],
      ['NL', 'NL-AW'],
      ['NL', 'NL-CW'],
      ['NL', 'NL-SX'],
      ['NL', 'NL-BQ1'],
      ['NL', 'NL-BQ2'],
      ['NL', 'NL-BQ3'],
    ]) {
      expect(regionsOfPlace({ country, sub1 })).toContain('latam')
    }
    for (const country of ['US', 'CA', 'FR', 'NL', 'ES', 'PT']) {
      expect(regionsOfPlace({ country })).not.toContain('latam')
    }
  })

  it('includes EG, TR, IR, Levant, Cyprus and all Gulf states in me', () => {
    for (const country of ['EG', 'TR', 'IR', 'IQ', 'IL', 'PS', 'JO', 'LB', 'SY', 'CY', 'QY', 'QZ', 'SA', 'AE', 'QA', 'BH', 'KW', 'OM', 'YE']) {
      expect(regionsOfPlace({ country })).toContain('me')
    }
    expect(regionsOfPlace({ country: 'EG' })).toEqual(['me', 'northern-africa'])
    expect(regionsOfPlace({ country: 'TR' })).toEqual(['me', 'western-asia'])
    expect(regionsOfPlace({ country: 'IR' })).toEqual(['me', 'southern-asia'])
  })

  it('covers all 22 UN M49 subregions plus latam and me', () => {
    expect(REGION_PRESETS).toHaveLength(24)
    expect(regionsOfPlace({ country: 'MA' })).toContain('northern-africa')
    expect(regionsOfPlace({ country: 'KE' })).toContain('eastern-africa')
    expect(regionsOfPlace({ country: 'CM' })).toContain('middle-africa')
    expect(regionsOfPlace({ country: 'ZA' })).toContain('southern-africa')
    expect(regionsOfPlace({ country: 'NG' })).toContain('western-africa')
    expect(regionsOfPlace({ country: 'CA' })).toContain('northern-america')
    expect(regionsOfPlace({ country: 'CR' })).toContain('central-america')
    expect(regionsOfPlace({ country: 'BR' })).toContain('south-america')
    expect(regionsOfPlace({ country: 'JM' })).toContain('caribbean')
    expect(regionsOfPlace({ country: 'KZ' })).toContain('central-asia')
    expect(regionsOfPlace({ country: 'JP' })).toContain('eastern-asia')
    expect(regionsOfPlace({ country: 'TH' })).toContain('south-eastern-asia')
    expect(regionsOfPlace({ country: 'IN' })).toContain('southern-asia')
    expect(regionsOfPlace({ country: 'JO' })).toContain('western-asia')
    expect(regionsOfPlace({ country: 'PL' })).toContain('eastern-europe')
    expect(regionsOfPlace({ country: 'GB' })).toContain('northern-europe')
    expect(regionsOfPlace({ country: 'ES' })).toContain('southern-europe')
    expect(regionsOfPlace({ country: 'FR' })).toContain('western-europe')
    expect(regionsOfPlace({ country: 'NZ' })).toContain('australia-nz')
    expect(regionsOfPlace({ country: 'FJ' })).toContain('melanesia')
    expect(regionsOfPlace({ country: 'FM' })).toContain('micronesia')
    expect(regionsOfPlace({ country: 'WS' })).toContain('polynesia')
  })

  it('applies overseas sub1 overrides without leaking the parent country subregion', () => {
    expect(regionsOfPlace({ country: 'FR', sub1: 'FR-973' })).toEqual(['latam', 'south-america'])
    expect(regionsOfPlace({ country: 'FR', sub1: 'FR-974' })).toEqual(['eastern-africa'])
    expect(regionsOfPlace({ country: 'FR', sub1: 'FR-976' })).toEqual(['eastern-africa'])
    expect(regionsOfPlace({ country: 'FR', sub1: 'FR-PM' })).toEqual(['northern-america'])
    expect(regionsOfPlace({ country: 'FR', sub1: 'FR-NC' })).toEqual(['melanesia'])
    expect(regionsOfPlace({ country: 'FR', sub1: 'FR-PF' })).toEqual(['polynesia'])
    expect(regionsOfPlace({ country: 'FR', sub1: 'FR-WF' })).toEqual(['polynesia'])
    expect(regionsOfPlace({ country: 'US', sub1: 'US-HI' })).toEqual(['polynesia'])
    expect(regionsOfPlace({ country: 'US', sub1: 'US-AS' })).toEqual(['polynesia'])
    expect(regionsOfPlace({ country: 'US', sub1: 'US-GU' })).toEqual(['micronesia'])
    expect(regionsOfPlace({ country: 'US', sub1: 'US-MP' })).toEqual(['micronesia'])
    expect(regionsOfPlace({ country: 'US', sub1: 'US-UM' })).toEqual(['micronesia'])
    for (const [sub1, cont] of Object.entries(SUB1_CONTINENT)) {
      const country = sub1.slice(0, 2)
      const regs = regionsOfPlace({ country, sub1 })
      if (cont === 'AN') expect(regs).toEqual([])
      else expect(regs.length, sub1).toBeGreaterThan(0)
    }
  })
})

describe('overlapping presets and Places UI search', () => {
  const records = [
    rec('sp-eg', { date: '2020-01-01', place: { country: 'EG' }, seen: ['2020-01-01|EG'] }),
    rec('sp-br', { date: '2020-02-01', place: { country: 'BR' }, seen: ['2020-02-01|BR'] }),
    rec('sp-gf', { date: '2020-03-01', place: { country: 'FR', sub1: 'FR-973' }, seen: ['2020-03-01|FR-973'] }),
    rec('sp-jp', { date: '2020-04-01', place: { country: 'JP' }, seen: ['2020-04-01|JP'] }),
  ]
  const list = buildList(records, EMPTY_EDITS, DEFAULT_RULES)
  const seen = buildSeen(records, EMPTY_EDITS, DEFAULT_RULES, list)

  it('counts each species once when overlapping presets or countries are selected', () => {
    expect(applyFilter(list, { regions: ['me', 'northern-africa'] }, species, seen).map((e) => e.code)).toEqual(['sp-eg'])
    expect(applyFilter(list, { regions: ['latam'], countries: ['BR'] }, species, seen).map((e) => e.code).sort()).toEqual(['sp-br', 'sp-gf'])
    const counts = placeCounts(list, {}, species, seen)
    expect(counts.regions.get('me')?.n).toBe(1)
    expect(counts.regions.get('northern-africa')?.n).toBe(1)
    expect(counts.regions.get('latam')?.n).toBe(2)
    expect(counts.regions.get('western-europe')).toBeUndefined()
  })

  it('shows Regions at top level, searches them, and toggles r:<id>', () => {
    const regions: Regions = {
      v: 1,
      countries: { EG: 'Egypt', BR: 'Brazil', FR: 'France', JP: 'Japan' },
      sub1: { 'FR-973': 'French Guiana' },
    }
    const state: AppState = { ...initialState(), list, seen }
    const onFilter = vi.fn()
    render(createElement(PlacesDrill, { state, species, regions, onFilter }), { wrapper: withI18n('en') })

    expect(screen.getByTestId('region-latam')).toBeTruthy()
    expect(screen.getByTestId('region-me')).toBeTruthy()

    const find = screen.getByTestId('places-find')
    fireEvent.change(find, { target: { value: 'middle' } })
    expect(screen.getByTestId('region-me')).toBeTruthy()
    expect(screen.queryByTestId('region-latam')).toBeNull()

    fireEvent.click(screen.getByTestId('region-me'))
    expect(onFilter).toHaveBeenCalledWith({ regions: ['me'] })
  })
})
