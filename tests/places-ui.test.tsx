// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useReducer } from 'react'
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { fmt } from '@/i18n/core'
import { es } from '@/i18n/messages/es'
import { withI18n } from './i18n-render'
import type { PlacesUnplaced } from '@/lib/list/filter-summary'
import { loadLazyParts } from './lazy-parts'

beforeAll(loadLazyParts, 60_000)

// The one pass over the list that counts every place level, watched: a checkbox must not count the list again.
vi.mock('@/lib/list/filters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/list/filters')>()
  return { ...actual, placeCounts: vi.fn(actual.placeCounts) }
})

// What the panel scrolls to: revealInScroller scrolls only the panel's own list (never the page), so the tests record it.
vi.mock('@/components/dialog-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/dialog-utils')>()
  return { ...actual, revealInScroller: vi.fn() }
})
const { revealInScroller } = await import('@/components/dialog-utils')
const revealed = () => vi.mocked(revealInScroller).mock.calls.map(([el]) => el)
const { SEARCH_FROM } = await import('@/components/filters/Filters')
const { FiltersDock } = await import('./filters-dock')
const { initialState, makeReducer } = await import('@/lib/list/store')
const { emptySaved } = await import('@/lib/list/storage')
const { buildSpeciesIndex } = await import('@/lib/species/load')
const { monthBins } = await import('@/lib/list/timeline')
const { placeCounts } = await import('@/lib/list/filters')
const counted = vi.mocked(placeCounts)
type PlacesNote = import('@/components/filters/Filters').PlacesNote

const row = (code: string, ord: string, fam: string, to: number): SpeciesRow => ({
  code, com: code, sci: `Avis ${code}`, ord, fam, famCom: fam, to, g: 100, gSrc: 'avonet', st: true, ar: 1, q: true,
})
const species = buildSpeciesIndex([row('duck1', 'Anseriformes', 'Anatidae', 1), row('crow1', 'Passeriformes', 'Corvidae', 3), row('owl1', 'Strigiformes', 'Strigidae', 5)])
const MORE = { FR: 'France', DE: 'Germany', JP: 'Japan', KE: 'Kenya', PE: 'Peru', MX: 'Mexico', AU: 'Australia' }
const regions: Regions = { v: 1, countries: { CA: 'Canada', US: 'United States of America', ...MORE }, sub1: { 'CA-BC': 'British Columbia', 'CA-ON': 'Ontario', 'US-WA': 'Washington' } }

type Variant = 'full' | 'lifer' | 'countries' | 'many' | 'two'

// full: duck1 lifer in Canada, also seen in the US (Capital, British Columbia and King, Washington); crow1 lifer in
// Mexico, also seen in British Columbia; owl1 Ontario only. lifer: the duck's lifer place alone. countries: the three
// species with lifer countries only and no seen-here.
function seeded(variant: Variant = 'full') {
  const reduce = makeReducer({ species })
  const saved = emptySaved()
  saved.records.ebird = variant === 'full' || variant === 'many' || variant === 'two'
    ? [
        { code: 'duck1', source: 'ebird', date: '2020-01-01', place: { country: 'CA', sub1: 'CA-BC' }, seen: ['2020-01-01|CA-BC|Capital', '2021-01-01|US-WA|King', ...(variant === 'many' ? Object.keys(MORE).map((c) => `2023-01-01|${c}`) : variant === 'two' ? ['2021-01-01|KE', '2023-01-01|JP'] : [])] },
        { code: 'crow1', source: 'ebird', date: '2019-01-01', place: { country: 'MX' }, seen: ['2019-01-01|MX', '2022-01-01|CA-BC'] },
        { code: 'owl1', source: 'ebird', date: '2021-01-01', place: { country: 'CA', sub1: 'CA-ON' }, seen: ['2021-01-01|CA-ON'] },
      ]
    : variant === 'countries'
    ? [
        { code: 'duck1', source: 'ebird', date: '2020-01-01', place: { country: 'CA' } },
        { code: 'crow1', source: 'ebird', date: '2019-01-01', place: { country: 'MX' } },
        { code: 'owl1', source: 'ebird', date: '2021-01-01', place: { country: 'US' } },
      ]
    : [{ code: 'duck1', source: 'ebird', date: '2020-01-01', place: { country: 'CA', sub1: 'CA-BC' } }]
  return reduce(initialState(), { type: 'restore', saved })
}

/** Only the owl, seen in Ontario. */
function seededOwl() {
  const saved = emptySaved()
  saved.records.ebird = [{ code: 'owl1', source: 'ebird', date: '2021-01-01', place: { country: 'CA', sub1: 'CA-ON' }, seen: ['2021-01-01|CA-ON'] }]
  return makeReducer({ species })(initialState(), { type: 'restore', saved })
}

function Harness({ variant = 'full', note, unplaced }: { variant?: Variant; note?: PlacesNote; unplaced?: PlacesUnplaced }) {
  const reduce = makeReducer({ species })
  const [state, dispatch] = useReducer(reduce, undefined, () => seeded(variant))
  const time = { entries: state.list, months: monthBins(state.list, '2022-06').months, today: '2022-06' }
  return (
    <>
      <FiltersDock state={state} dispatch={dispatch} species={species} regions={regions} placesNote={note} placesUnplaced={unplaced} time={time} />
      <button type="button">elsewhere</button>
      <button type="button" onClick={() => dispatch({ type: 'filter', filter: { ...state.filter, order: 'Anseriformes' } })}>ducks only</button>
      <button type="button" onClick={() => dispatch({ type: 'filter', filter: { ...state.filter, order: 'Strigiformes' } })}>owls only</button>
      <button type="button" onClick={() => dispatch({ type: 'filter', filter: { ...state.filter, order: 'Passeriformes' } })}>crows only</button>
      <button type="button" onClick={() => dispatch({ type: 'filter', filter: { ...state.filter, from: '2022-01' } })}>from 2022</button>
      <output data-testid="filter">{JSON.stringify(state.filter)}</output>
    </>
  )
}
const filterOf = () => JSON.parse(screen.getByTestId('filter').textContent || '{}')
// One Filters button opens one panel; a second press closes it, so these open only when closed.
const filtersBtn = () => screen.getByTestId('filters-button')
const openFilters = () => { if (filtersBtn().getAttribute('aria-expanded') !== 'true') fireEvent.click(filtersBtn()) }

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Places and Time: sections of the Filters panel', () => {
  it('the Places and Time sections sit in the one Filters panel, the timeline beside the checklist', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    expect(within(screen.getByRole('group', { name: 'Places' })).getByRole('list', { name: 'Countries' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Time' })).getByTestId('timeline')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Play/ })).toBeNull()
  })

  it('Places is a checklist of countries: real checkboxes with flags and seen-here counts, sorted by count; several may be checked', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    const list = screen.getByRole('list', { name: 'Countries' })
    const boxes = within(list).getAllByRole('checkbox')
    // Canada 3 (seen-here: the crow too), then Mexico 1 and the US 1 by name.
    expect(boxes.map((b) => b.closest('label')!.textContent)).toEqual(['Canada3, 3 species', 'Mexico1, 1 species', 'United States of America1, 1 species'])
    expect(boxes.map((b) => b.closest('label')!.querySelector('img.eb-flag')?.getAttribute('alt'))).toEqual(['', '', ''])
    expect(boxes[0]).toHaveAccessibleName('Canada, 3 species')
    expect(boxes[0]).not.toBeChecked()
    fireEvent.click(screen.getByTestId('country-MX'))
    fireEvent.click(screen.getByTestId('country-US'))
    expect(filterOf()).toEqual({ countries: ['MX', 'US'] })
    expect(screen.getByTestId('country-MX')).toBeChecked()
    // The button's accessible name counts the group and names the places, and each place is a chip.
    expect(filtersBtn()).toHaveAccessibleName('Filters, 1 in use: Places: Mexico, United States of America')
    expect(screen.getByTestId('chip-place-c:MX')).toBeInTheDocument()
    expect(screen.getByTestId('chip-place-c:US')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('country-MX'))
    expect(filterOf()).toEqual({ countries: ['US'] })
    fireEvent.click(screen.getByTestId('places-clear'))
    expect(filterOf()).toEqual({})
    expect(screen.queryByTestId('places-clear')).toBeNull()
  })

  it('a search field only for more than SEARCH_FROM countries', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    expect(SEARCH_FROM).toBe(8)
    expect(screen.queryByRole('searchbox', { name: 'Find a country' })).toBeNull()
  })

  it('Esc and a press outside close the popover; focus returns to the Filters button', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    filtersBtn().focus()
    openFilters()
    expect(screen.getByRole('dialog', { name: 'Filters' })).toContainElement(document.activeElement as HTMLElement)
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(filtersBtn()).toHaveFocus()
    openFilters()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'elsewhere' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('at phone width the panel is a modal bottom sheet with a close button', () => {
    vi.stubGlobal('innerWidth', 390)
    render(<Harness />)
    openFilters()
    const sheet = screen.getByRole('dialog', { name: 'Filters' })
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a range shows as a chip and on the Filters button, spoken in full', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    const lo = screen.getByRole('slider', { name: 'Start month' })
    vi.useFakeTimers()
    fireEvent.keyDown(lo, { key: 'PageUp' })
    act(() => { vi.advanceTimersByTime(400) })
    vi.useRealTimers()
    expect(filterOf()).toEqual({ from: '2020-01' })
    expect(filtersBtn()).toHaveAccessibleName('Filters, 1 in use: Time: from January 2020')
    expect(screen.getByTestId('chip-date-2020-01..')).toHaveTextContent('from 2020')
  })

  it('the lifer-only notice, inside Places: add MyEBirdData, or import it again for an old save; both link to its Add panel', () => {
    vi.stubGlobal('innerWidth', 1000)
    const { unmount } = render(<Harness variant="lifer" note="add" />)
    openFilters()
    expect(screen.getByTestId('places-lifer-only')).toHaveTextContent(/^Places only knows where you first recorded each bird\. Add MyEBirdData to filter by every place you recorded each bird, down to the county\.$/)
    expect(screen.getByRole('link', { name: 'Add MyEBirdData' })).toHaveAttribute('href', '/settings#add-mydata')
    unmount()
    render(<Harness variant="lifer" note="reimport" />)
    openFilters()
    expect(screen.getByTestId('places-lifer-only')).toHaveTextContent(/^Places only knows where you first recorded each bird\. Import MyEBirdData again to filter by every place you recorded each bird\.$/)
    expect(screen.getByRole('link', { name: 'Import MyEBirdData again' })).toHaveAttribute('href', '/settings#add-mydata')
  })

  it('observation.org life list birds with no places: a line above the lifer-only note, linking to the observations Add panel', () => {
    vi.stubGlobal('innerWidth', 1000)
    const { unmount } = render(<Harness variant="lifer" note="add" unplaced="add" />)
    fireEvent.click(filtersBtn())
    const line = screen.getByTestId('places-unplaced')
    expect(line).toHaveClass('eb-note', 'eb-places-note')
    expect(line).toHaveTextContent(/^Birds only on your observation\.org life list have no places, so a place filter leaves them out\. Add the observations export to place them by country and province\.$/)
    expect(within(line).getByRole('link', { name: 'Add the observations export' })).toHaveAttribute('href', '/settings#add-obsorg')
    const lifer = screen.getByTestId('places-lifer-only')
    expect(line.compareDocumentPosition(lifer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    unmount()
    render(<Harness variant="lifer" unplaced="add" />)
    fireEvent.click(filtersBtn())
    expect(screen.getByTestId('places-unplaced')).toBeInTheDocument()
    expect(screen.queryByTestId('places-lifer-only')).toBeNull()
  })

  it('with the observations on the list: the first sentence only, no link', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness variant="lifer" unplaced="plain" />)
    fireEvent.click(filtersBtn())
    const line = screen.getByTestId('places-unplaced')
    expect(line).toHaveTextContent(/^Birds only on your observation\.org life list have no places, so a place filter leaves them out\.$/)
    expect(within(line).queryByRole('link')).toBeNull()
  })

  it('no unplaced line without the prop', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness variant="lifer" note="add" />)
    fireEvent.click(filtersBtn())
    expect(screen.queryByTestId('places-unplaced')).toBeNull()
  })
})

describe('Places drills down: country, then state or province, then county', () => {
  it('a country with provinces has a drill button; drilling shows its provinces under a breadcrumb, focus on "All of Canada"', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    expect(screen.queryByTestId('drill-c:MX')).toBeNull()
    expect(screen.queryByTestId('places-path')).toBeNull()
    expect(screen.getByTestId('drill-c:CA')).toHaveAccessibleName('Show states and provinces in Canada')
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    expect(screen.getByTestId('places-path')).toHaveTextContent('All countries/Canada')
    expect(within(screen.getByTestId('places-path')).getByText('Canada')).toHaveAttribute('aria-current', 'location')
    expect(screen.getByText(/2 states and provinces/)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'States and provinces' })).toBeInTheDocument()
    expect(screen.getByTestId('place-all')).toHaveFocus()
    expect(screen.getByTestId('place-all')).toHaveAccessibleName('All of Canada, 3 species')
    expect(screen.getByRole('checkbox', { name: 'British Columbia, 2 species' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Ontario, 1 species' })).toBeInTheDocument()
    expect(screen.getByTestId('drill-s:CA-BC')).toHaveAccessibleName('Show counties in British Columbia')
    expect(screen.queryByTestId('drill-s:CA-ON')).toBeNull()
    // Flags on country rows only.
    expect(screen.getByTestId('filter-panel-places').querySelector('img.eb-flag')).toBeNull()
  })

  it('checking a province narrows a checked country; the button counts and names it', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    fireEvent.click(screen.getByTestId('country-CA'))
    expect(filterOf()).toEqual({ countries: ['CA'] })
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    expect(screen.getByTestId('place-all')).toBeChecked()
    fireEvent.click(screen.getByTestId('place-s:CA-BC'))
    expect(filterOf()).toEqual({ provinces: ['CA-BC'] })
    expect(screen.getByTestId('place-all')).not.toBeChecked()
    expect(screen.getByTestId('place-s:CA-BC')).toBeChecked()
    expect(filtersBtn()).toHaveAccessibleName('Filters, 1 in use: Places: British Columbia, Canada')
    // "All of Canada" checks the country again, which holds the province.
    fireEvent.click(screen.getByTestId('place-all'))
    expect(filterOf()).toEqual({ countries: ['CA'] })
  })

  it('the head counts the checked rows of the level shown', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    fireEvent.click(screen.getByTestId('country-MX'))
    fireEvent.click(screen.getByTestId('country-CA'))
    expect(screen.getByText(/^3 countries · 2 checked$/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    fireEvent.click(screen.getByTestId('place-s:CA-BC'))
    // The country checks sit on another level: only British Columbia counts here.
    expect(screen.getByText(/^2 states and provinces · 1 checked$/)).toBeInTheDocument()
  })

  it('counties: drill again, check one; the breadcrumb steps back and focus returns to the drill button', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    fireEvent.click(screen.getByTestId('drill-s:CA-BC'))
    expect(screen.getByTestId('places-path')).toHaveTextContent('All countries/Canada/British Columbia')
    expect(screen.getByText(/1 county/)).toBeInTheDocument()
    expect(screen.getByTestId('place-all')).toHaveAccessibleName('All of British Columbia, 2 species')
    expect(screen.getByTestId('place-all')).toHaveFocus()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Capital, 1 species' }))
    expect(filterOf()).toEqual({ counties: ['CA-BC|Capital'] })
    expect(filtersBtn()).toHaveAccessibleName('Filters, 1 in use: Places: Capital, British Columbia')
    // One step back: Canada's provinces, focus on British Columbia's drill button.
    fireEvent.click(within(screen.getByTestId('places-path')).getByRole('button', { name: 'Canada' }))
    expect(screen.getByText(/2 states and provinces/)).toBeInTheDocument()
    expect(screen.getByTestId('drill-s:CA-BC')).toHaveFocus()
    fireEvent.click(screen.getByTestId('drill-s:CA-BC'))
    fireEvent.click(within(screen.getByTestId('places-path')).getByRole('button', { name: 'All countries' }))
    expect(screen.queryByTestId('places-path')).toBeNull()
    expect(screen.getByText(/3 countries/)).toBeInTheDocument()
    expect(screen.getByTestId('drill-c:CA')).toHaveFocus()
  })

  it('a step back scrolls the drill button it focuses into view, inside the panel (never the page)', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    fireEvent.click(within(screen.getByTestId('places-path')).getByRole('button', { name: 'All countries' }))
    expect(revealed().at(-1)).toBe(screen.getByTestId('drill-c:CA'))
  })

  it('Clear clears every level', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    fireEvent.click(screen.getByTestId('country-MX'))
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    fireEvent.click(screen.getByTestId('place-s:CA-ON'))
    fireEvent.click(screen.getByTestId('drill-s:CA-BC'))
    fireEvent.click(screen.getByTestId('place-k:CA-BC|Capital'))
    expect(filterOf()).toEqual({ countries: ['MX'], provinces: ['CA-ON'], counties: ['CA-BC|Capital'] })
    fireEvent.click(screen.getByTestId('places-clear'))
    expect(filterOf()).toEqual({})
    expect(screen.queryByTestId('places-clear')).toBeNull()
  })

  it('a province alone shows Clear, and Clear empties it', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    expect(screen.queryByTestId('places-clear')).toBeNull()
    fireEvent.click(screen.getByTestId('place-s:CA-BC'))
    fireEvent.click(screen.getByTestId('places-clear'))
    expect(filterOf()).toEqual({})
  })

  it('reopened, the panel starts at the selection\'s level: Capital checked opens on British Columbia\'s counties', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    fireEvent.click(screen.getByTestId('drill-s:CA-BC'))
    fireEvent.click(screen.getByTestId('place-k:CA-BC|Capital'))
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    openFilters()
    expect(screen.getByText(/^1 county · 1 checked$/)).toBeInTheDocument()
    expect(screen.getByTestId('places-path')).toHaveTextContent('All countries/Canada/British Columbia')
    expect(screen.getByTestId('place-k:CA-BC|Capital')).toBeChecked()
    expect(screen.getByTestId('place-all')).toHaveAccessibleName('All of British Columbia, 2 species')
    expect(revealed()).toContain(screen.getByTestId('place-k:CA-BC|Capital'))
    // A step back lands on the province's drill button, as from a drill.
    fireEvent.click(within(screen.getByTestId('places-path')).getByRole('button', { name: 'Canada' }))
    expect(screen.getByTestId('drill-s:CA-BC')).toHaveFocus()
  })

  it('reopened with places under several parents (or countries only), the panel starts at the countries', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    fireEvent.click(screen.getByTestId('place-s:CA-ON'))
    fireEvent.click(within(screen.getByTestId('places-path')).getByRole('button', { name: 'All countries' }))
    fireEvent.click(screen.getByTestId('drill-c:US'))
    fireEvent.click(screen.getByTestId('place-s:US-WA'))
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    openFilters()
    expect(screen.getByText(/^3 countries$/)).toBeInTheDocument()
    expect(screen.queryByTestId('places-path')).toBeNull()
  })

  it('every county row keeps the drill button\'s room, so the counts stay in one column', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    fireEvent.click(screen.getByTestId('drill-s:CA-BC'))
    const level = screen.getByRole('list', { name: 'Counties' })
    for (const li of level.querySelectorAll('li.eb-places-row')) expect(li.querySelector('.eb-drill-space')).not.toBeNull()
  })

  it('a checked place that another filter empties stays listed at 0 so it can be unchecked', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    fireEvent.click(screen.getByTestId('place-s:CA-ON'))
    fireEvent.click(screen.getByRole('button', { name: 'ducks only' }))
    expect(filterOf()).toEqual({ order: 'Anseriformes', provinces: ['CA-ON'] })
    const ontario = screen.getByTestId('place-s:CA-ON')
    expect(ontario).toBeChecked()
    expect(ontario).toHaveAccessibleName('Ontario, 0 species')
    fireEvent.click(ontario)
    expect(filterOf()).toEqual({ order: 'Anseriformes' })
  })

  it('the top-level search finds a checked country the Time range has emptied (count 0)', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness variant="two" />)
    openFilters()
    fireEvent.click(screen.getByTestId('drill-n:AF'))
    fireEvent.click(screen.getByTestId('country-KE'))
    fireEvent.click(screen.getByRole('button', { name: 'All continents' }))
    fireEvent.click(screen.getByRole('button', { name: 'from 2022' }))
    expect(filterOf()).toEqual({ countries: ['KE'], from: '2022-01' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a country or region' }), { target: { value: 'Ken' } })
    expect(screen.getByTestId('country-KE')).toHaveAccessibleName('Kenya, 0 species')
  })

  it('a drilled level with nothing left under the other filters says so, the breadcrumb kept', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    fireEvent.click(screen.getByTestId('drill-s:CA-BC'))
    // The owl was only ever seen in Ontario: nothing in British Columbia's counties is left.
    fireEvent.click(screen.getByRole('button', { name: 'owls only' }))
    const level = screen.getByRole('list', { name: 'Counties' })
    expect(within(level).getByTestId('places-empty')).toHaveTextContent('No places here under the other filters.')
    expect(screen.getByTestId('places-empty').tagName).toBe('LI')
    // "All of British Columbia" stays, so the province itself can still be checked; nothing else.
    expect(screen.queryAllByRole('checkbox')).toEqual([screen.getByTestId('place-all')])
    expect(screen.getByTestId('place-all')).toHaveAccessibleName('All of British Columbia, 0 species')
    expect(screen.getByTestId('places-path')).toHaveTextContent('All countries/Canada/British Columbia')
  })

  it('a drilled level the list itself no longer reaches says the list changed, not the other filters', async () => {
    vi.stubGlobal('innerWidth', 1000)
    const { PlacesDrill } = await import('@/components/filters/PlacesDrill')
    const full = seeded()
    const { rerender } = render(<PlacesDrill state={full} species={species} regions={regions} onFilter={() => {}} />)
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    fireEvent.click(screen.getByTestId('drill-s:CA-BC'))
    // The same panel, the list now only the owl (Ontario): no other filter is set.
    rerender(<PlacesDrill state={seededOwl()} species={species} regions={regions} onFilter={() => {}} />)
    expect(screen.getByTestId('places-empty')).toHaveTextContent('No places here on your list now.')
    expect(screen.getByTestId('place-all')).toBeInTheDocument()
  })

  it('countries-only lists show no drill buttons and no breadcrumb', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness variant="countries" />)
    openFilters()
    expect(within(screen.getByRole('list', { name: 'Countries' })).getAllByRole('checkbox')).toHaveLength(3)
    expect(screen.queryAllByRole('button', { name: /^Show / })).toHaveLength(0)
    expect(screen.queryByTestId('places-path')).toBeNull()
  })

  it('Esc closes the panel from a drilled level and focus returns to the Filters button', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    filtersBtn().focus()
    openFilters()
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(filtersBtn()).toHaveFocus()
  })

  it('at phone width the drilled sheet keeps Tab inside and its drill buttons are buttons', () => {
    vi.stubGlobal('innerWidth', 390)
    render(<Harness />)
    openFilters()
    const sheet = screen.getByRole('dialog', { name: 'Filters' })
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    const drill = within(sheet).getByTestId('drill-c:CA')
    expect(drill.tagName).toBe('BUTTON')
    expect(drill).toHaveAttribute('type', 'button')
    fireEvent.click(drill)
    expect(within(sheet).getByTestId('place-all')).toHaveFocus()
    expect(within(sheet).getByTestId('drill-s:CA-BC').tagName).toBe('BUTTON')
    // Tab from the last control (the footer's "Show N species") wraps to the first (the sheet's close button); Shift+Tab from the first to the last.
    const last = within(sheet).getByTestId('filters-show')
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(within(sheet).getByRole('button', { name: 'Close' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
  })
})

describe('Places drill: checked places stay reachable, the list is counted once', () => {
  /** Reopened at a checked county's level: it is shown checked; then the breadcrumb back to the countries. */
  const backToCountries = (county: string) => {
    expect(screen.getByTestId(`place-${county}`)).toBeChecked()
    fireEvent.click(within(screen.getByTestId('places-path')).getByRole('button', { name: 'All countries' }))
  }

  it.each([
    ['k:US-WA|King', 'c:US', ['c:US', 's:US-WA'], 'United States of America, 0 species'],
    ['k:CA-BC|Capital', 's:CA-BC', ['c:CA', 's:CA-BC'], 'British Columbia, 0 species'],
  ])('a checked %s stays reachable when another filter empties its ancestor %s', (county, ancestor, path, spoken) => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    for (const k of path) fireEvent.click(screen.getByTestId(`drill-${k}`))
    fireEvent.click(screen.getByTestId(`place-${county}`))
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    // The owl was only ever seen in Ontario.
    fireEvent.click(screen.getByRole('button', { name: 'owls only' }))
    // Reopened, the panel starts at the county's level (its checkbox in view). From the countries, the emptied ancestor is listed at 0 and still drills.
    openFilters()
    backToCountries(county)
    for (const k of path) {
      const btn = screen.getByTestId(`drill-${k}`)
      if (k === ancestor) expect(screen.getByRole('checkbox', { name: spoken })).not.toBeChecked()
      fireEvent.click(btn)
    }
    const box = screen.getByTestId(`place-${county}`)
    expect(box).toBeChecked()
    fireEvent.click(box)
    expect(filterOf()).toEqual({ order: 'Strigiformes' })
  })

  it('a checked county stays reachable when another filter leaves its province listed with no counties', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    fireEvent.click(screen.getByTestId('drill-s:CA-BC'))
    fireEvent.click(screen.getByTestId('place-k:CA-BC|Capital'))
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    // The crow was seen in British Columbia, but in no county there.
    fireEvent.click(screen.getByRole('button', { name: 'crows only' }))
    openFilters()
    backToCountries('k:CA-BC|Capital')
    for (const k of ['c:CA', 's:CA-BC']) {
      const btn = screen.getByTestId(`drill-${k}`)
      if (k === 's:CA-BC') expect(screen.getByRole('checkbox', { name: 'British Columbia, 1 species' })).not.toBeChecked()
      fireEvent.click(btn)
    }
    const box = screen.getByRole('checkbox', { name: 'Capital, 0 species' })
    expect(box).toBeChecked()
    fireEvent.click(box)
    expect(filterOf()).toEqual({ order: 'Passeriformes' })
  })

  it('selects a province, then a county, through the same filter', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    fireEvent.click(screen.getByTestId('place-s:CA-BC'))
    expect(filterOf()).toEqual({ provinces: ['CA-BC'] })
    fireEvent.click(screen.getByTestId('drill-s:CA-BC'))
    fireEvent.click(screen.getByTestId('place-k:CA-BC|Capital'))
    expect(filterOf()).toEqual({ counties: ['CA-BC|Capital'] })
    expect(filtersBtn()).toHaveAccessibleName('Filters, 1 in use: Places: Capital, British Columbia')
  })

  describe('counting', () => {
    it('not again for a checkbox or a drill; again for an order', () => {
      vi.stubGlobal('innerWidth', 1000)
      render(<Harness />)
      counted.mockClear()
      openFilters()
      expect(counted).toHaveBeenCalledTimes(1)
      fireEvent.click(screen.getByTestId('country-MX'))
      fireEvent.click(screen.getByTestId('drill-c:CA'))
      fireEvent.click(screen.getByTestId('place-s:CA-BC'))
      fireEvent.click(screen.getByTestId('drill-s:CA-BC'))
      fireEvent.click(screen.getByTestId('place-k:CA-BC|Capital'))
      expect(filterOf()).toEqual({ countries: ['MX'], counties: ['CA-BC|Capital'] })
      expect(counted).toHaveBeenCalledTimes(1)
      fireEvent.click(screen.getByRole('button', { name: 'ducks only' }))
      expect(counted).toHaveBeenCalledTimes(2)
    })
  })

  it('the panel drills in place: no disclosure buttons, a breadcrumb once drilled', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    expect(screen.getByTestId('drill-c:CA')).not.toHaveAttribute('aria-expanded')
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    expect(screen.getByTestId('places-path')).toBeInTheDocument()
  })
})

describe('in Spanish', () => {
  it('countries by DisplayNames (Canadá), the levels, "Todo en Canadá" (es.ui.places.allOf) and the drill labels from es.ui', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />, { wrapper: withI18n('es') })
    expect(filtersBtn()).toHaveAccessibleName('Filtros')
    fireEvent.click(filtersBtn())
    const list = screen.getByRole('list', { name: 'Países' })
    expect(within(list).getByRole('checkbox', { name: 'Canadá, 3 especies' })).toBeInTheDocument()
    expect(within(list).getByRole('checkbox', { name: 'México, 1 especie' })).toBeInTheDocument()
    expect(screen.getByText('3 países')).toBeInTheDocument()
    expect(screen.getByTestId('drill-c:CA')).toHaveAccessibleName('Ver estados y provincias de Canadá')
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    expect(screen.getByTestId('places-path')).toHaveTextContent('Todos los países/Canadá')
    expect(screen.getByTestId('place-all')).toHaveAccessibleName(`${fmt(es.ui.places.allOf, { place: 'Canadá' })}, 3 especies`)
    expect(screen.getByRole('list', { name: 'Estados y provincias' })).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('place-all'))
    expect(filtersBtn()).toHaveAccessibleName('Filtros, 1 en uso: Lugares: Canadá')
    expect(filtersBtn().querySelector('.eb-drop-label')).toHaveTextContent(/^Filtros$/)
    expect(screen.getByTestId('chip-place-c:CA')).toHaveTextContent('Canadá')
  })
  it('the lifer-only note, in Spanish, keeps its link', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness note="add" />, { wrapper: withI18n('es') })
    fireEvent.click(filtersBtn())
    const note = screen.getByTestId('places-lifer-only')
    expect(note).toHaveTextContent('Lugares solo sabe dónde registraste cada ave por primera vez. Añade MyEBirdData para filtrar por todos los lugares donde registraste cada ave, hasta el condado.')
    expect(within(note).getByRole('link', { name: 'Añade MyEBirdData' })).toHaveAttribute('href', '/settings#add-mydata')
  })
  it('the Time panel and button in Spanish', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />, { wrapper: withI18n('es') })
    fireEvent.click(filtersBtn())
    expect(screen.getByRole('group', { name: 'Fechas' })).toBeInTheDocument()
    expect(screen.getByTestId('time-handle-lo')).toHaveAccessibleName('Mes inicial')
    expect(screen.getByTestId('time-handle-lo')).toHaveAttribute('aria-valuetext', 'enero de 2019')
    expect(screen.getByTestId('timeline-read')).toHaveTextContent('ene 2019–jun 2022 · 3 especies')
  })
})
