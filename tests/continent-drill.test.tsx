// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useReducer } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Filter } from '@/lib/list/filters'
import type { Regions, SpeciesRow } from '@/lib/species/types'

const { PlacesDrill } = await import('@/components/filters/PlacesDrill')
const { startLevel } = await import('@/components/filters/PlacesDrill')
const { RepeatSwitch, Timeline } = await import('@/components/filters/Timeline')
const { SeenAgg } = await import('@/lib/list/seen')
const { monthBins } = await import('@/lib/list/timeline')
const { initialState, makeReducer } = await import('@/lib/list/store')
const { emptySaved } = await import('@/lib/list/storage')
const { buildSpeciesIndex } = await import('@/lib/species/load')

const row = (code: string): SpeciesRow => ({ code, com: code, sci: `Avis ${code}`, ord: 'Passeriformes', fam: 'Corvidae', famCom: 'Corvidae', to: 1, g: 100, gSrc: 'avonet', st: true, ar: 1, q: true })
const species = buildSpeciesIndex([row('duck1'), row('crow1'), row('owl1'), row('wren1')])
const regions: Regions = { v: 1, countries: { CA: 'Canada', KE: 'Kenya', EG: 'Egypt', AU: 'Australia' }, sub1: { 'CA-BC': 'British Columbia' } }
const reduce = makeReducer({ species })

// duck1 Canada (British Columbia), 2019; crow1 Kenya, 2021; owl1 Egypt, 2022; wren1 Australia, 2023.
function multi() {
  const saved = emptySaved()
  saved.records.ebird = [
    { code: 'duck1', source: 'ebird', date: '2019-01-01', place: { country: 'CA', sub1: 'CA-BC' }, seen: ['2019-01-01|CA-BC'] },
    { code: 'crow1', source: 'ebird', date: '2021-01-01', place: { country: 'KE' }, seen: ['2021-01-01|KE'] },
    { code: 'owl1', source: 'ebird', date: '2022-01-01', place: { country: 'EG' }, seen: ['2022-01-01|EG'] },
    { code: 'wren1', source: 'ebird', date: '2023-01-01', place: { country: 'AU' }, seen: ['2023-01-01|AU'] },
  ]
  return reduce(initialState(), { type: 'restore', saved })
}
function oneContinent() {
  const saved = emptySaved()
  saved.records.ebird = [
    { code: 'duck1', source: 'ebird', date: '2019-01-01', place: { country: 'CA', sub1: 'CA-BC' }, seen: ['2019-01-01|CA-BC'] },
    { code: 'crow1', source: 'ebird', date: '2021-01-01', place: { country: 'CA' }, seen: ['2021-01-01|CA'] },
  ]
  return reduce(initialState(), { type: 'restore', saved })
}

function Harness({ start = multi, filter }: { start?: () => ReturnType<typeof multi>; filter?: Filter }) {
  const [state, dispatch] = useReducer(reduce, undefined, () => (filter ? { ...start(), filter } : start()))
  return (
    <>
      <div className="eb-places">
        <PlacesDrill state={state} species={species} regions={regions} onFilter={(f) => dispatch({ type: 'filter', filter: f })} />
      </div>
      <button type="button" onClick={() => dispatch({ type: 'filter', filter: { ...state.filter, from: '2021-01', to: '2022-12' } })}>2021 to 2022</button>
      <output data-testid="filter">{JSON.stringify(state.filter)}</output>
    </>
  )
}
const filterOf = () => JSON.parse(screen.getByTestId('filter').textContent || '{}')
afterEach(cleanup)

describe('the continent level', () => {
  it('heads the top level with "N continents"; rows look like countries: checkbox, name, count, drill, an empty flag slot', () => {
    render(<Harness />)
    expect(screen.getByText(/^3 continents$/)).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Continents' })
    const boxes = within(list).getAllByRole('checkbox')
    expect(boxes.map((b) => b.closest('label')!.textContent)).toEqual(['Africa2, 2 species', 'North America1, 1 species', 'Oceania1, 1 species'])
    expect(list.querySelector('img.eb-flag')).toBeNull()
    // The flag's slot holds a globe: an 18px square svg, decorative, a circle with the continent's land.
    expect(list.querySelectorAll('.eb-flag-slot')).toHaveLength(3)
    const globe = list.querySelector('svg.eb-continent-globe')!
    expect(globe).toHaveAttribute('viewBox', '0 0 256 256')
    expect(globe).toHaveAttribute('aria-hidden', 'true')
    expect(globe).toHaveAttribute('stroke', 'currentColor')
    expect(globe.querySelector('circle')).toHaveAttribute('r', '112')
    expect(screen.getByTestId('drill-n:AF')).toHaveAccessibleName('Show countries in Africa')
    expect(screen.queryByTestId('places-path')).toBeNull()
  })

  it('ticking Africa filters to it; the head counts the checked continent', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('continent-AF'))
    expect(filterOf()).toEqual({ continents: ['AF'] })
    expect(screen.getByText(/^3 continents · 1 checked$/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('continent-AF'))
    expect(filterOf()).toEqual({})
  })

  it('drilling into Africa shows its countries under "All continents / Africa", focus on "All of Africa"', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('drill-n:AF'))
    expect(screen.getByTestId('places-path')).toHaveTextContent('All continents/Africa')
    expect(within(screen.getByTestId('places-path')).getByText('Africa')).toHaveAttribute('aria-current', 'location')
    expect(screen.getByRole('list', { name: 'Countries' })).toBeInTheDocument()
    expect(screen.getByText(/^2 countries$/)).toBeInTheDocument()
    expect(screen.getByTestId('place-all')).toHaveFocus()
    expect(screen.getByTestId('place-all')).toHaveAccessibleName('All of Africa, 2 species')
    expect(screen.getByTestId('country-KE').closest('label')!.querySelector('img.eb-flag')).not.toBeNull()
    // Back to the continents: focus on the drill button it came from.
    fireEvent.click(within(screen.getByTestId('places-path')).getByRole('button', { name: 'All continents' }))
    expect(screen.getByTestId('drill-n:AF')).toHaveFocus()
  })

  it('"All of Africa" ticks the continent; Kenya inside a ticked Africa narrows to Kenya; Africa over Kenya leaves Africa', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('drill-n:AF'))
    fireEvent.click(screen.getByTestId('place-all'))
    expect(filterOf()).toEqual({ continents: ['AF'] })
    fireEvent.click(screen.getByTestId('country-KE'))
    expect(filterOf()).toEqual({ countries: ['KE'] })
    expect(screen.getByTestId('place-all')).not.toBeChecked()
    fireEvent.click(screen.getByTestId('place-all'))
    expect(filterOf()).toEqual({ continents: ['AF'] })
  })

  it('provinces and counties follow below the countries, the breadcrumb growing', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('drill-n:NA'))
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    expect(screen.getByTestId('places-path')).toHaveTextContent('All continents/North America/Canada')
    expect(screen.getByRole('list', { name: 'States and provinces' })).toBeInTheDocument()
  })

  it('counts at the continent level are made under the other filters, a Time range included', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '2021 to 2022' }))
    // crow1 (Kenya) and owl1 (Egypt) fall in the range: Canada and Australia drop out, and with one continent left
    // the level is skipped: the countries, each with its count under the range.
    expect(screen.queryByTestId('continent-AF')).toBeNull()
    const boxes = within(screen.getByRole('list', { name: 'Countries' })).getAllByRole('checkbox')
    expect(boxes.map((b) => b.closest('label')!.textContent)).toEqual(['Egypt1, 1 species', 'Kenya1, 1 species'])
  })

  it('a range that keeps two continents counts each: from 2019, Canada and Africa', () => {
    render(<Harness filter={{ from: '2019-01', to: '2021-12' }} />)
    const boxes = within(screen.getByRole('list', { name: 'Continents' })).getAllByRole('checkbox')
    expect(boxes.map((b) => b.closest('label')!.textContent)).toEqual(['Africa1, 1 species', 'North America1, 1 species'])
  })
})

describe('a list with one continent skips the level', () => {
  it('opens at the countries, "N countries", no breadcrumb; deeper, the breadcrumb starts at "All countries"', () => {
    render(<Harness start={oneContinent} />)
    expect(screen.getByText(/^1 country$/)).toBeInTheDocument()
    expect(screen.queryByTestId('places-path')).toBeNull()
    expect(screen.queryByTestId('continent-NA')).toBeNull()
    expect(screen.getByRole('list', { name: 'Countries' })).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    expect(screen.getByTestId('places-path')).toHaveTextContent('All countries/Canada')
    fireEvent.click(within(screen.getByTestId('places-path')).getByRole('button', { name: 'All countries' }))
    expect(screen.queryByTestId('places-path')).toBeNull()
    expect(screen.getByTestId('drill-c:CA')).toHaveFocus()
  })

  it('a checked place in it, reopened, starts at its parent without the continent in the breadcrumb', () => {
    render(<Harness start={oneContinent} filter={{ provinces: ['CA-BC'] }} />)
    expect(screen.getByTestId('places-path')).toHaveTextContent('All countries/Canada')
  })
})

describe('where the panel opens (startLevel)', () => {
  it('a checked continent opens at the continents; a country at its continent; several parents at the continents', () => {
    expect(startLevel(['n:AF'])).toBeUndefined()
    expect(startLevel(['n:AF', 'n:NA'])).toBeUndefined()
    expect(startLevel(['c:KE'])).toBe('n:AF')
    expect(startLevel(['c:KE', 'c:EG'])).toBe('n:AF')
    expect(startLevel(['c:KE', 'c:CA'])).toBeUndefined()
    expect(startLevel(['s:CA-BC'])).toBe('c:CA')
  })

  it('reopened with Kenya checked, the panel shows Africa\'s countries under the breadcrumb', () => {
    render(<Harness filter={{ countries: ['KE'] }} />)
    expect(screen.getByTestId('places-path')).toHaveTextContent('All continents/Africa')
    expect(screen.getByTestId('country-KE')).toBeChecked()
  })

  it('reopened with Africa checked, the panel shows the continents with Africa checked', () => {
    render(<Harness filter={{ continents: ['AF'] }} />)
    expect(screen.queryByTestId('places-path')).toBeNull()
    expect(screen.getByTestId('continent-AF')).toBeChecked()
  })
})

describe('search from the continent level', () => {
  it('finds any country: matches replace the continents, a tick and a drill work, clearing returns', () => {
    render(<Harness />)
    const field = screen.getByRole('searchbox', { name: 'Find a country or region' })
    fireEvent.change(field, { target: { value: 'ken' } })
    expect(screen.getByRole('list', { name: 'Countries' })).toBeInTheDocument()
    expect(screen.queryByTestId('continent-AF')).toBeNull()
    fireEvent.click(screen.getByTestId('country-KE'))
    expect(filterOf()).toEqual({ countries: ['KE'] })
    fireEvent.change(field, { target: { value: 'zzz' } })
    expect(screen.getByText('No place matches.')).toBeInTheDocument()
    fireEvent.change(field, { target: { value: '' } })
    expect(screen.getByRole('list', { name: 'Continents' })).toBeInTheDocument()
  })

  it('a found country drills to its provinces under "All continents / North America / Canada"', () => {
    render(<Harness />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a country or region' }), { target: { value: 'can' } })
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    expect(screen.getByTestId('places-path')).toHaveTextContent('All continents/North America/Canada')
  })
})

describe('"Count repeat sightings" (RepeatSwitch)', () => {
  function Switch({ start }: { start: () => ReturnType<typeof multi> }) {
    const [state, dispatch] = useReducer(reduce, undefined, start)
    return (
      <>
        <RepeatSwitch filter={state.filter} seen={state.seen} onFilter={(f) => dispatch({ type: 'filter', filter: f })} />
        <output data-testid="filter">{JSON.stringify(state.filter)}</output>
      </>
    )
  }
  const withMonths = () => {
    const agg = new SeenAgg()
    agg.addMonths('duck1', 'CA-BC', ['2019-01', '2024-05'])
    agg.addKey('duck1', 'CA-BC', '2019-01')
    const saved = emptySaved()
    saved.records.ebird = [{ code: 'duck1', source: 'ebird', date: '2019-01-01', place: { country: 'CA', sub1: 'CA-BC' }, seen: agg.get('duck1'), seenMonths: agg.getMonths('duck1') }]
    return reduce(initialState(), { type: 'restore', saved })
  }

  it('is hidden for a list without month sets (first sightings only)', () => {
    render(<Switch start={multi} />)
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('one switch: off counts the first sighting, on sets the basis to every sighting; its note says which', () => {
    render(<Switch start={withMonths} />)
    const sw = screen.getByRole('switch', { name: 'Count repeat sightings' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(sw).toHaveAccessibleDescription('A bird counts where and when you first recorded it.')
    fireEvent.click(sw)
    expect(filterOf()).toEqual({ basis: 'seen' })
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(sw).toHaveAccessibleDescription('A bird counts everywhere and every year you recorded it.')
    fireEvent.click(sw)
    expect(filterOf()).toEqual({})
  })

  it('sits in the Time section, under its head and above the strip, where "Count a bird by" sat', () => {
    const state = withMonths()
    render(<Timeline entries={state.list} seen={state.seen} filter={state.filter} species={species} months={monthBins(state.list, '2024-06').months} today="2024-06" onFilter={() => {}} />)
    const sw = within(screen.getByTestId('timeline')).getByRole('switch', { name: 'Count repeat sightings' })
    const kids = Array.from(screen.getByTestId('timeline').children)
    expect(kids.indexOf(sw)).toBe(1)
    expect(kids[2]).toHaveClass('eb-time-scroll')
  })
})
