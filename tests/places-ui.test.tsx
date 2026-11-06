// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useReducer } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CountryDots, Regions, SpeciesRow } from '@/lib/species/types'

const { FilterBar } = await import('@/components/filters/FilterBar')
const { initialState, makeReducer } = await import('@/lib/list/store')
const { emptySaved } = await import('@/lib/list/storage')
const { buildSpeciesIndex } = await import('@/lib/species/load')

const row = (code: string, ord: string, fam: string, to: number): SpeciesRow => ({
  code, com: code, sci: `Avis ${code}`, ord, fam, famCom: fam, to, g: 100, gSrc: 'avonet', st: true, ar: 1, q: true,
})
const species = buildSpeciesIndex([row('duck1', 'Anseriformes', 'Anatidae', 1), row('crow1', 'Passeriformes', 'Corvidae', 3), row('owl1', 'Strigiformes', 'Strigidae', 5)])
const regions: Regions = { v: 1, countries: { CA: 'Canada', EG: 'Egypt', US: 'United States of America' }, sub1: { 'CA-BC': 'British Columbia', 'CA-ON': 'Ontario', 'US-WA': 'Washington' } }
const dots: CountryDots = { v: 1, step: 1.5, rows: 95, cols: 240, countries: ['', 'CA', 'EG', 'US'], cells: Buffer.from(new Uint16Array(95 * 240).map((_, i) => (i === 20 * 240 + 50 ? 1 : i === 40 * 240 + 100 ? 2 : i === 30 * 240 + 40 ? 3 : 0)).buffer).toString('base64'), extra: [] }
const name = (c: string) => regions.countries[c] ?? c

function seeded(full = true) {
  const reduce = makeReducer({ species, countryName: name })
  const saved = emptySaved()
  saved.records.ebird = full
    ? [
        { code: 'duck1', source: 'ebird', date: '2020-01-01', place: { country: 'CA', sub1: 'CA-BC', sub2: 'Capital' }, seen: ['2020-01-01|CA-BC|Capital', '2021-01-01|US-WA|King'] },
        { code: 'crow1', source: 'ebird', date: '2019-01-01', place: { country: 'EG' }, seen: ['2019-01-01|EG', '2022-01-01|CA-BC|Cowichan'] },
        { code: 'owl1', source: 'ebird', date: '2021-01-01', place: { country: 'CA', sub1: 'CA-ON' }, seen: ['2021-01-01|CA-ON'] },
      ]
    : [{ code: 'duck1', source: 'ebird', date: '2020-01-01', place: { country: 'CA', sub1: 'CA-BC' } }]
  return reduce(initialState(), { type: 'restore', saved })
}

function Harness({ full = true, liferPlaces }: { full?: boolean; liferPlaces?: boolean }) {
  const reduce = makeReducer({ species, countryName: name })
  const [state, dispatch] = useReducer(reduce, undefined, () => seeded(full))
  return (
    <>
      <FilterBar state={state} dispatch={dispatch} species={species} regions={regions} dots={dots} liferPlaces={liferPlaces} />
      <output data-testid="filter">{JSON.stringify(state.filter)}</output>
    </>
  )
}
const filterOf = () => JSON.parse(screen.getByTestId('filter').textContent || '{}')
const openPlaces = () => fireEvent.click(screen.getByRole('button', { name: 'Places' }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Places: seen here, province and county chips', () => {
  it('country chips count species seen there, not only lifers there', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openPlaces()
    const countries = within(screen.getByRole('group', { name: 'Countries' })).getAllByRole('button').map((b) => b.textContent)
    expect(countries).toEqual(['🇨🇦Canada3, 3 species', '🇪🇬Egypt1, 1 species', '🇺🇸United States of America1, 1 species'])
  })

  it('choosing a country keeps the map on countries (no zoom) and adds its provinces as chips', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openPlaces()
    fireEvent.click(within(screen.getByRole('group', { name: 'Countries' })).getByRole('button', { name: /^Canada/ }))
    expect(screen.getByRole('navigation', { name: 'Place' })).toHaveTextContent('World›Canada')
    expect(screen.getByTestId('map-country-CA')).toHaveAttribute('opacity', '1')
    expect(screen.getByTestId('country-map').querySelectorAll('svg')).toHaveLength(1)
    expect(within(screen.getByRole('group', { name: 'Regions' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['British Columbia2, 2 species', 'Ontario1, 1 species'])
  })

  it('a province chip shows its counties; the breadcrumb steps back out', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openPlaces()
    fireEvent.click(within(screen.getByRole('group', { name: 'Countries' })).getByRole('button', { name: /^Canada/ }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Regions' })).getByRole('button', { name: /^British Columbia/ }))
    expect(filterOf()).toEqual({ country: 'CA', sub1: 'CA-BC' })
    expect(screen.getByRole('navigation', { name: 'Place' })).toHaveTextContent('World›Canada›British Columbia')
    const counties = screen.getByRole('group', { name: 'Counties' })
    expect(within(counties).getAllByRole('button').map((b) => b.textContent)).toEqual(['Capital1, 1 species', 'Cowichan1, 1 species'])
    fireEvent.click(within(counties).getByRole('button', { name: /^Capital/ }))
    expect(filterOf()).toEqual({ country: 'CA', sub1: 'CA-BC', sub2: 'Capital' })
    const path = screen.getByRole('navigation', { name: 'Place' })
    expect(path).toHaveTextContent('World›Canada›British Columbia›Capital')
    fireEvent.click(within(path).getByRole('button', { name: 'British Columbia' }))
    expect(filterOf()).toEqual({ country: 'CA', sub1: 'CA-BC' })
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Place' })).getByRole('button', { name: 'Canada' }))
    expect(filterOf()).toEqual({ country: 'CA' })
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Place' })).getByRole('button', { name: 'World' }))
    expect(filterOf()).toEqual({})
  })

  it('tapping a country on the map selects it; tapping again clears it (and its province)', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openPlaces()
    fireEvent.click(screen.getByTestId('map-country-CA'))
    expect(filterOf()).toEqual({ country: 'CA' })
    fireEvent.click(within(screen.getByRole('group', { name: 'Regions' })).getByRole('button', { name: /^Ontario/ }))
    fireEvent.click(screen.getByTestId('map-country-CA'))
    expect(filterOf()).toEqual({})
  })

  it('a closed panel shows the deepest place as one removable chip; removing it clears every place level', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openPlaces()
    fireEvent.click(within(screen.getByRole('group', { name: 'Countries' })).getByRole('button', { name: /^Canada/ }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Regions' })).getByRole('button', { name: /^British Columbia/ }))
    openPlaces() // close
    fireEvent.click(screen.getByRole('button', { name: 'Remove British Columbia filter' }))
    expect(filterOf()).toEqual({})
  })

  it('a list with only lifer places says so, with a link to add the files that know more', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness full={false} liferPlaces />)
    openPlaces()
    const note = screen.getByTestId('places-lifer-only')
    expect(note).toHaveTextContent('Showing where each lifer was first seen. Add MyEBirdData or iNaturalist for full country lists.')
    expect(within(note).getByRole('link', { name: 'Add MyEBirdData or iNaturalist' })).toHaveAttribute('href', '/settings')
  })

  it('at phone width the three levels are sheet buttons', () => {
    vi.stubGlobal('innerWidth', 390)
    render(<Harness />)
    openPlaces()
    fireEvent.click(screen.getByRole('button', { name: 'Choose a country 3' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Countries' })).getByRole('button', { name: /^Canada/ }))
    expect(screen.getByTestId('picker-country')).toHaveTextContent('Canada')
    fireEvent.click(screen.getByRole('button', { name: 'Choose a region 2' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Regions' })).getByRole('button', { name: /^British Columbia/ }))
    expect(screen.getByRole('button', { name: 'Choose a county 2' })).toBeInTheDocument()
  })
})
