// @vitest-environment jsdom
// The Places panel as one list that opens in place (PlacesTree): continents, each opening its countries under it, a
// country its provinces; several branches at once, no breadcrumb; a branch holding a checked place starts open.
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useReducer } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Filter } from '@/lib/list/filters'
import type { Regions, SpeciesRow } from '@/lib/species/types'

const { PlacesTree, openFor } = await import('@/components/filters/PlacesTree')
const { RepeatSwitch } = await import('@/components/filters/Filters')
const { SeenAgg } = await import('@/lib/list/seen')
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
        <PlacesTree state={state} species={species} regions={regions} onFilter={(f) => dispatch({ type: 'filter', filter: f })} />
      </div>
      <button type="button" onClick={() => dispatch({ type: 'filter', filter: { ...state.filter, from: '2021-01', to: '2022-12' } })}>2021 to 2022</button>
      <output data-testid="filter">{JSON.stringify(state.filter)}</output>
    </>
  )
}
const filterOf = () => JSON.parse(screen.getByTestId('filter').textContent || '{}')
afterEach(cleanup)

describe('the continent level', () => {
  it('heads the top level with "N continents"; rows look like countries: chevron, checkbox, name, count, the globe', () => {
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
    const chevron = screen.getByTestId('drill-n:AF')
    expect(chevron).toHaveAccessibleName('Show countries in Africa')
    expect(chevron).toHaveAttribute('aria-expanded', 'false')
    expect(chevron).not.toHaveAttribute('aria-controls')
    // The chevron leads its row; the count sits in the label right after the name.
    expect(chevron.nextElementSibling?.tagName).toBe('LABEL')
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

  it('the chevron opens Africa\'s countries right under it, in place; pressed again it closes them; focus stays', () => {
    render(<Harness />)
    const chevron = screen.getByTestId('drill-n:AF')
    chevron.focus()
    fireEvent.click(chevron)
    expect(chevron).toHaveAttribute('aria-expanded', 'true')
    const group = screen.getByRole('list', { name: 'Countries in Africa' })
    expect(chevron).toHaveAttribute('aria-controls', group.id)
    expect(chevron.closest('li')).toContainElement(group)
    expect(within(group).getAllByRole('checkbox').map((b) => b.dataset.testid)).toEqual(['country-EG', 'country-KE'])
    expect(screen.getByTestId('country-KE').closest('label')!.querySelector('img.eb-flag')).not.toBeNull()
    // The continents stay: nothing replaces the list.
    expect(screen.getByTestId('continent-NA')).toBeInTheDocument()
    expect(chevron).toHaveFocus()
    fireEvent.click(chevron)
    expect(chevron).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('country-KE')).toBeNull()
  })

  it('Africa\'s own checkbox covers its countries; Kenya inside a ticked Africa narrows to Kenya; Africa over Kenya leaves Africa', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('drill-n:AF'))
    fireEvent.click(screen.getByTestId('continent-AF'))
    expect(filterOf()).toEqual({ continents: ['AF'] })
    fireEvent.click(screen.getByTestId('country-KE'))
    expect(filterOf()).toEqual({ countries: ['KE'] })
    expect(screen.getByTestId('continent-AF')).not.toBeChecked()
    fireEvent.click(screen.getByTestId('continent-AF'))
    expect(filterOf()).toEqual({ continents: ['AF'] })
  })

  it('several branches open at once, a country\'s provinces indented under it', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('drill-n:AF'))
    fireEvent.click(screen.getByTestId('drill-n:NA'))
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    expect(screen.getByRole('list', { name: 'Countries in Africa' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Countries in North America' })).toBeInTheDocument()
    const provinces = screen.getByRole('list', { name: 'States and provinces in Canada' })
    expect(within(provinces).getByTestId('place-s:CA-BC')).toBeInTheDocument()
    expect(screen.getByTestId('place-s:CA-BC').closest('.eb-places-row')).toHaveStyle({ paddingLeft: 'calc(2 * var(--eb-places-indent))' })
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
  it('lists the countries, "N countries"; a country opens its provinces in place', () => {
    render(<Harness start={oneContinent} />)
    expect(screen.getByText(/^1 country$/)).toBeInTheDocument()
    expect(screen.queryByTestId('continent-NA')).toBeNull()
    expect(screen.getByRole('list', { name: 'Countries' })).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    expect(screen.getByRole('list', { name: 'States and provinces in Canada' })).toBeInTheDocument()
  })

  it('a checked province starts with its country open', () => {
    render(<Harness start={oneContinent} filter={{ provinces: ['CA-BC'] }} />)
    expect(screen.getByTestId('drill-c:CA')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('place-s:CA-BC')).toBeChecked()
  })
})

describe('the branches open when the panel opens (openFor)', () => {
  it('every place above a checked one', () => {
    expect([...openFor(['n:AF'])]).toEqual([])
    expect([...openFor(['c:KE'])]).toEqual(['n:AF'])
    expect([...openFor(['c:KE', 'c:EG'])]).toEqual(['n:AF'])
    expect([...openFor(['s:CA-BC'])].sort()).toEqual(['c:CA', 'n:NA'])
    expect([...openFor(['c:KE', 's:CA-BC'])].sort()).toEqual(['c:CA', 'n:AF', 'n:NA'])
  })

  it('reopened with Kenya checked, Africa is open and Kenya ticked; the other continents stay closed', () => {
    render(<Harness filter={{ countries: ['KE'] }} />)
    expect(screen.getByTestId('drill-n:AF')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('country-KE')).toBeChecked()
    expect(screen.getByTestId('drill-n:NA')).toHaveAttribute('aria-expanded', 'false')
  })

  it('reopened with Africa checked, the continents show with Africa checked and closed', () => {
    render(<Harness filter={{ continents: ['AF'] }} />)
    expect(screen.getByTestId('continent-AF')).toBeChecked()
    expect(screen.getByTestId('drill-n:AF')).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('search at the top', () => {
  it('finds any country: matches replace the list, a tick works, clearing returns', () => {
    render(<Harness />)
    const field = screen.getByRole('searchbox', { name: 'Find a country or region' })
    fireEvent.change(field, { target: { value: 'ken' } })
    expect(screen.queryByTestId('continent-AF')).toBeNull()
    fireEvent.click(screen.getByTestId('country-KE'))
    expect(filterOf()).toEqual({ countries: ['KE'] })
    fireEvent.change(field, { target: { value: 'zzz' } })
    expect(screen.getByText('No place matches.')).toBeInTheDocument()
    fireEvent.change(field, { target: { value: '' } })
    expect(screen.getByTestId('continent-AF')).toBeInTheDocument()
  })

  it('a found country opens its provinces in place', () => {
    render(<Harness />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a country or region' }), { target: { value: 'can' } })
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    expect(screen.getByRole('list', { name: 'States and provinces in Canada' })).toBeInTheDocument()
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
})
