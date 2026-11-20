// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useReducer } from 'react'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { fmt } from '@/i18n/core'
import { es } from '@/i18n/messages/es'
import { withI18n } from './i18n-render'
import type { PlacesUnplaced } from '@/lib/list/filter-summary'

// The one pass over the list that counts every place level, watched: a checkbox must not count the list again.
vi.mock('@/lib/list/filters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/list/filters')>()
  return { ...actual, placeCounts: vi.fn(actual.placeCounts) }
})

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
    // The button counts the group, its accessible name names the places, and each place is a chip.
    expect(filtersBtn()).toHaveTextContent('Filters · 1')
    expect(filtersBtn()).toHaveAccessibleName('Filters: Places: Mexico, United States of America')
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
    expect(filtersBtn()).toHaveTextContent('Filters · 1')
    expect(filtersBtn()).toHaveAccessibleName('Filters: Time: from January 2020')
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

describe('Places opens in place: country, then state or province, then county', () => {
  const escape = () => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })

  it('a country with provinces has a chevron; it opens the provinces under Canada, in the same list, focus kept', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    expect(screen.queryByTestId('drill-c:MX')).toBeNull()
    expect(screen.queryByTestId('places-path')).toBeNull()
    const chevron = screen.getByTestId('drill-c:CA')
    expect(chevron).toHaveAccessibleName('Show states and provinces in Canada')
    expect(chevron).toHaveAttribute('aria-expanded', 'false')
    chevron.focus()
    fireEvent.click(chevron)
    expect(chevron).toHaveAttribute('aria-expanded', 'true')
    expect(chevron).toHaveFocus()
    const provinces = screen.getByRole('list', { name: 'States and provinces in Canada' })
    expect(within(provinces).getByRole('checkbox', { name: 'British Columbia, 2 species' })).toBeInTheDocument()
    expect(within(provinces).getByRole('checkbox', { name: 'Ontario, 1 species' })).toBeInTheDocument()
    expect(screen.getByTestId('drill-s:CA-BC')).toHaveAccessibleName('Show counties in British Columbia')
    expect(screen.queryByTestId('drill-s:CA-ON')).toBeNull()
    // The countries stay listed and checkable; the head is still the countries'.
    expect(screen.getByTestId('country-MX')).toBeInTheDocument()
    expect(screen.getByText(/^3 countries$/)).toBeInTheDocument()
    // Flags on country rows only.
    expect(provinces.querySelector('img.eb-flag')).toBeNull()
  })

  it('checking a province narrows a checked country; the button counts and names it', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    fireEvent.click(screen.getByTestId('country-CA'))
    expect(filterOf()).toEqual({ countries: ['CA'] })
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    fireEvent.click(screen.getByTestId('place-s:CA-BC'))
    expect(filterOf()).toEqual({ provinces: ['CA-BC'] })
    expect(screen.getByTestId('country-CA')).not.toBeChecked()
    expect(screen.getByTestId('place-s:CA-BC')).toBeChecked()
    expect(filtersBtn()).toHaveTextContent('Filters · 1')
    expect(filtersBtn()).toHaveAccessibleName('Filters: Places: British Columbia, Canada')
    // Canada's own checkbox checks the country again, which holds the province.
    fireEvent.click(screen.getByTestId('country-CA'))
    expect(filterOf()).toEqual({ countries: ['CA'] })
  })

  it('the head counts the checked countries', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    fireEvent.click(screen.getByTestId('country-MX'))
    fireEvent.click(screen.getByTestId('country-CA'))
    expect(screen.getByText(/^3 countries · 2 checked$/)).toBeInTheDocument()
  })

  it('counties open under their province; a county narrows; Canada and the United States can be open at once', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    openFilters()
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    fireEvent.click(screen.getByTestId('drill-s:CA-BC'))
    fireEvent.click(screen.getByTestId('drill-c:US'))
    const counties = screen.getByRole('list', { name: 'Counties in British Columbia' })
    fireEvent.click(within(counties).getByRole('checkbox', { name: 'Capital, 1 species' }))
    expect(filterOf()).toEqual({ counties: ['CA-BC|Capital'] })
    expect(filtersBtn()).toHaveAccessibleName('Filters: Places: Capital, British Columbia')
    expect(screen.getByRole('list', { name: 'States and provinces in United States of America' })).toBeInTheDocument()
    // Every county row keeps the chevron's room, so its checkbox lines up.
    for (const li of counties.querySelectorAll(':scope > li')) expect(li.querySelector('.eb-drill-space')).not.toBeNull()
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

  it('reopened, every branch holding a checked place is open: Capital checked opens Canada and British Columbia', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    // jsdom has no scrollIntoView: record what is scrolled to (removed after the test).
    const scrolled: Element[] = []
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this) }
    onTestFinished(() => { delete (Element.prototype as Partial<Element>).scrollIntoView })
    openFilters()
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    fireEvent.click(screen.getByTestId('drill-s:CA-BC'))
    fireEvent.click(screen.getByTestId('place-k:CA-BC|Capital'))
    fireEvent.click(screen.getByTestId('drill-c:CA')) // closed by hand before closing the panel
    escape()
    openFilters()
    expect(screen.getByTestId('drill-c:CA')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('drill-s:CA-BC')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('place-k:CA-BC|Capital')).toBeChecked()
    expect(scrolled).toContain(screen.getByTestId('place-k:CA-BC|Capital'))
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
    fireEvent.click(screen.getByRole('button', { name: 'from 2022' }))
    expect(filterOf()).toEqual({ countries: ['KE'], from: '2022-01' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a country or region' }), { target: { value: 'Ken' } })
    expect(screen.getByTestId('country-KE')).toHaveAccessibleName('Kenya, 0 species')
  })

  it('an open branch the list itself no longer reaches says the list changed, not the other filters', async () => {
    vi.stubGlobal('innerWidth', 1000)
    const { PlacesTree } = await import('@/components/filters/PlacesTree')
    const full = seeded()
    const { rerender } = render(<PlacesTree state={full} species={species} regions={regions} onFilter={() => {}} />)
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    fireEvent.click(screen.getByTestId('drill-s:CA-BC'))
    // The same panel, the list now only the owl (Ontario): no other filter is set. British Columbia is gone; an open
    // Canada lists Ontario.
    rerender(<PlacesTree state={seededOwl()} species={species} regions={regions} onFilter={() => {}} />)
    expect(screen.queryByTestId('place-s:CA-BC')).toBeNull()
    expect(screen.getByTestId('place-s:CA-ON')).toBeInTheDocument()
  })

  it('countries-only lists show no chevrons', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness variant="countries" />)
    openFilters()
    expect(within(screen.getByRole('list', { name: 'Countries' })).getAllByRole('checkbox')).toHaveLength(3)
    expect(screen.queryAllByRole('button', { name: /^Show / })).toHaveLength(0)
  })

  it('Esc closes the panel with branches open and focus returns to the Filters button', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    filtersBtn().focus()
    openFilters()
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    escape()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(filtersBtn()).toHaveFocus()
  })

  it('at phone width the sheet keeps Tab inside and its chevrons are buttons', () => {
    vi.stubGlobal('innerWidth', 390)
    render(<Harness />)
    openFilters()
    const sheet = screen.getByRole('dialog', { name: 'Filters' })
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    const drill = within(sheet).getByTestId('drill-c:CA')
    expect(drill.tagName).toBe('BUTTON')
    expect(drill).toHaveAttribute('type', 'button')
    fireEvent.click(drill)
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

describe('Places: checked places stay reachable, the list is counted once', () => {
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
    // Reopened, the county's branches are open; the emptied ancestor is listed at 0.
    openFilters()
    for (const k of path) expect(screen.getByTestId(`drill-${k}`)).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('checkbox', { name: spoken })).not.toBeChecked()
    expect(screen.getByTestId(`place-${ancestor}`.replace('place-c:', 'country-'))).toBeInTheDocument()
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
    expect(screen.getByRole('checkbox', { name: 'British Columbia, 1 species' })).not.toBeChecked()
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
    expect(filtersBtn()).toHaveAccessibleName('Filters: Places: Capital, British Columbia')
  })

  describe('counting', () => {
    it('not again for a checkbox or a chevron; again for an order', () => {
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
})

describe('in Spanish', () => {
  it('countries by DisplayNames (Canadá), the levels and the chevrons\' names from es.ui', () => {
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
    expect(screen.getByRole('list', { name: fmt(es.ui.places.group.country, { place: 'Canadá' }) })).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('country-CA'))
    expect(filtersBtn()).toHaveAccessibleName('Filtros: Lugares: Canadá')
    expect(filtersBtn()).toHaveTextContent('Filtros · 1')
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
