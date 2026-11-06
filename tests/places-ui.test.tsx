// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useReducer, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Regions, SpeciesRow } from '@/lib/species/types'

const { FilterDropdowns, SEARCH_FROM } = await import('@/components/filters/FilterDropdowns')
const { initialState, makeReducer } = await import('@/lib/list/store')
const { emptySaved } = await import('@/lib/list/storage')
const { buildSpeciesIndex } = await import('@/lib/species/load')
const { monthBins } = await import('@/lib/list/timeline')
type Panel = import('@/components/filters/FilterDropdowns').Panel
type PlacesNote = import('@/components/filters/FilterDropdowns').PlacesNote

const row = (code: string, ord: string, fam: string, to: number): SpeciesRow => ({
  code, com: code, sci: `Avis ${code}`, ord, fam, famCom: fam, to, g: 100, gSrc: 'avonet', st: true, ar: 1, q: true,
})
const species = buildSpeciesIndex([row('duck1', 'Anseriformes', 'Anatidae', 1), row('crow1', 'Passeriformes', 'Corvidae', 3), row('owl1', 'Strigiformes', 'Strigidae', 5)])
const regions: Regions = { v: 1, countries: { CA: 'Canada', EG: 'Egypt', US: 'United States of America' }, sub1: {} }
const name = (c: string) => regions.countries[c] ?? c

// duck1: lifer in Canada, also seen in the US. crow1: lifer in Egypt, also seen in Canada. owl1: Canada only.
function seeded(full = true) {
  const reduce = makeReducer({ species, countryName: name })
  const saved = emptySaved()
  saved.records.ebird = full
    ? [
        { code: 'duck1', source: 'ebird', date: '2020-01-01', place: { country: 'CA', sub1: 'CA-BC' }, seen: ['2020-01-01|CA-BC|Capital', '2021-01-01|US-WA|King'] },
        { code: 'crow1', source: 'ebird', date: '2019-01-01', place: { country: 'EG' }, seen: ['2019-01-01|EG', '2022-01-01|CA-BC'] },
        { code: 'owl1', source: 'ebird', date: '2021-01-01', place: { country: 'CA', sub1: 'CA-ON' }, seen: ['2021-01-01|CA-ON'] },
      ]
    : [{ code: 'duck1', source: 'ebird', date: '2020-01-01', place: { country: 'CA', sub1: 'CA-BC' } }]
  return reduce(initialState(), { type: 'restore', saved })
}

function Harness({ full = true, note }: { full?: boolean; note?: PlacesNote }) {
  const reduce = makeReducer({ species, countryName: name })
  const [state, dispatch] = useReducer(reduce, undefined, () => seeded(full))
  const [open, setOpen] = useState<Panel | null>(null)
  const time = { entries: state.list, months: monthBins(state.list, '2022-06').months, today: '2022-06' }
  return (
    <>
      <div className="eb-dock">
        <FilterDropdowns state={state} dispatch={dispatch} species={species} regions={regions} open={open} onOpen={setOpen} placesNote={note} time={time} />
      </div>
      <button type="button">elsewhere</button>
      <output data-testid="filter">{JSON.stringify(state.filter)}</output>
    </>
  )
}
const filterOf = () => JSON.parse(screen.getByTestId('filter').textContent || '{}')
const placesBtn = () => screen.getByTestId('filter-tab-places')
const timeBtn = () => screen.getByTestId('filter-tab-time')

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Places and Time: dropdowns in the controls bar', () => {
  it('two buttons with aria-expanded; a button opens its panel, a second tap closes it, one panel at a time', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    expect(placesBtn()).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(placesBtn())
    expect(placesBtn()).toHaveAttribute('aria-expanded', 'true')
    const panel = screen.getByRole('dialog', { name: 'Places' })
    expect(placesBtn()).toHaveAttribute('aria-controls', panel.id)
    expect(panel).not.toHaveAttribute('aria-modal') // a popover on wider screens
    fireEvent.click(timeBtn())
    expect(screen.queryByRole('dialog', { name: 'Places' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Time' })).toBeInTheDocument()
    expect(screen.getByTestId('timeline')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Play/ })).toBeNull()
    fireEvent.click(timeBtn())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Places is a checklist of countries: real checkboxes with flags and seen-here counts, sorted by count; several may be checked', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(placesBtn())
    const list = screen.getByRole('list', { name: 'Countries' })
    const boxes = within(list).getAllByRole('checkbox')
    // Canada 3 (seen-here: the crow too), then Egypt 1 and the US 1 by name.
    expect(boxes.map((b) => b.closest('label')!.textContent)).toEqual(['Canada3, 3 species', 'Egypt1, 1 species', 'United States of America1, 1 species'])
    expect(boxes.map((b) => b.closest('label')!.querySelector('img.eb-flag')?.getAttribute('alt'))).toEqual(['', '', ''])
    expect(boxes[0]).toHaveAccessibleName('Canada, 3 species')
    expect(boxes[0]).not.toBeChecked()
    fireEvent.click(screen.getByTestId('country-EG'))
    fireEvent.click(screen.getByTestId('country-US'))
    expect(filterOf()).toEqual({ countries: ['EG', 'US'] })
    expect(screen.getByTestId('country-EG')).toBeChecked()
    // The button says how many, and its accessible name names them.
    expect(placesBtn()).toHaveTextContent('Places · 2')
    expect(placesBtn()).toHaveAccessibleName('Places: Egypt, United States of America')
    fireEvent.click(screen.getByTestId('country-EG'))
    expect(filterOf()).toEqual({ countries: ['US'] })
    fireEvent.click(screen.getByTestId('places-clear'))
    expect(filterOf()).toEqual({})
    expect(screen.queryByTestId('places-clear')).toBeNull()
  })

  it('a search field only for more than SEARCH_FROM countries', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(placesBtn())
    expect(SEARCH_FROM).toBe(12)
    expect(screen.queryByRole('searchbox', { name: 'Find a country' })).toBeNull()
  })

  it('Esc and a press outside close the popover; focus returns to its button', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    placesBtn().focus()
    fireEvent.click(placesBtn())
    expect(screen.getByRole('dialog', { name: 'Places' })).toContainElement(document.activeElement as HTMLElement)
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(placesBtn()).toHaveFocus()
    fireEvent.click(timeBtn())
    fireEvent.pointerDown(screen.getByRole('button', { name: 'elsewhere' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('at phone width the panel is a modal bottom sheet with a close button', () => {
    vi.stubGlobal('innerWidth', 390)
    render(<Harness />)
    fireEvent.click(placesBtn())
    const sheet = screen.getByRole('dialog', { name: 'Places' })
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a range shows on the Time button as years, spoken in full', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(timeBtn())
    const lo = screen.getByRole('slider', { name: 'Start month' })
    vi.useFakeTimers()
    fireEvent.keyDown(lo, { key: 'PageUp' })
    act(() => { vi.advanceTimersByTime(400) })
    vi.useRealTimers()
    expect(filterOf()).toEqual({ from: '2020-01' })
    expect(timeBtn()).toHaveTextContent('Time · from 2020')
    expect(timeBtn()).toHaveAccessibleName('Time: from January 2020')
  })

  it('the lifer-only notice, inside Places: add files, or import MyEBirdData again for an old save', () => {
    vi.stubGlobal('innerWidth', 1000)
    const { unmount } = render(<Harness full={false} note="add" />)
    fireEvent.click(placesBtn())
    expect(screen.getByTestId('places-lifer-only')).toHaveTextContent('Showing where each lifer was first seen. Add MyEBirdData or iNaturalist for full country lists.')
    unmount()
    render(<Harness full={false} note="reimport" />)
    fireEvent.click(placesBtn())
    expect(screen.getByTestId('places-lifer-only')).toHaveTextContent('Showing where each lifer was first seen. Import Download My Data again for full country lists.')
    expect(screen.getByRole('link', { name: 'Import Download My Data again' })).toHaveAttribute('href', '/settings')
  })
})
