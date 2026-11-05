// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useReducer } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FilterBar } from '@/components/filters/FilterBar'
import { CountryMap, litSteps, LIT_OPACITY } from '@/components/map/CountryMap'
import { initialState, makeReducer, type AppState } from '@/lib/list/store'
import { emptySaved } from '@/lib/list/storage'
import type { SourceRecord } from '@/lib/list/model'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { CountryDots, Regions, SpeciesRow } from '@/lib/species/types'

const row = (code: string, ord: string, fam: string, famCom: string, to: number): SpeciesRow => ({
  code, com: code, sci: `Avis ${code}`, ord, fam, famCom, to, g: 100, gSrc: 'avonet', st: true, ar: 1, q: true,
})
const species = buildSpeciesIndex([
  row('duck1', 'Anseriformes', 'Anatidae', 'Ducks', 1),
  row('duck2', 'Anseriformes', 'Anatidae', 'Ducks', 2),
  row('crow1', 'Passeriformes', 'Corvidae', 'Crows', 3),
  row('wren1', 'Passeriformes', 'Troglodytidae', 'Wrens', 4),
  row('owl1', 'Strigiformes', 'Strigidae', 'Owls', 5),
])
const regions: Regions = { v: 1, countries: { CA: 'Canada', EG: 'Egypt [x]' }, sub1: {} }
const rec = (code: string, country: string, date: string): SourceRecord => ({ code, source: 'ebird', date, place: { country } })

function cellsOf(entries: [number, number, number][]): string {
  const a = new Uint16Array(95 * 240)
  for (const [r, c, i] of entries) a[r * 240 + c] = i
  return Buffer.from(a.buffer).toString('base64')
}
const dots: CountryDots = {
  v: 1, step: 1.5, rows: 95, cols: 240, countries: ['', 'CA', 'EG', 'US'],
  cells: cellsOf([[20, 50, 1], [20, 51, 1], [21, 50, 1], [40, 100, 2], [41, 100, 2], [60, 70, 3]]),
  extra: [['MC', 181, 30]],
}

function seeded(): AppState {
  const reduce = makeReducer({ species, countryName: (c) => (c === 'CA' ? 'Canada' : c === 'EG' ? 'Egypt' : c) })
  const saved = emptySaved()
  saved.records.ebird = [
    rec('duck1', 'CA', '2020-05-01'), rec('duck2', 'CA', '2021-05-01'), rec('crow1', 'EG', '2021-06-01'),
    rec('wren1', 'CA', '2022-06-01'), rec('owl1', 'EG', '2022-07-01'),
  ]
  return reduce(initialState(), { type: 'restore', saved })
}

function Harness({ initial }: { initial?: AppState }) {
  const reduce = makeReducer({ species, countryName: (c) => (c === 'CA' ? 'Canada' : c === 'EG' ? 'Egypt' : c) })
  const [state, dispatch] = useReducer(reduce, initial ?? seeded())
  return (
    <>
      <FilterBar state={state} dispatch={dispatch} species={species} regions={regions} dots={dots} />
      <output data-testid="filter">{JSON.stringify(state.filter)}</output>
    </>
  )
}
const name = (c: string) => ({ CA: 'Canada', EG: 'Egypt' })[c as 'CA'] ?? c
const filterOf = () => JSON.parse(screen.getByTestId('filter').textContent!)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('FilterBar', () => {
  it('choosing an order shows family chips and a breadcrumb', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    expect(screen.queryByRole('button', { name: /^Ducks/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Waterfowl/ }))
    expect(filterOf()).toEqual({ order: 'Anseriformes' })
    expect(screen.getByRole('button', { name: /^Ducks/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Crows/ })).toBeNull()
    const crumb = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(crumb).toHaveTextContent('All birds')
    expect(crumb).toHaveTextContent('Waterfowl')
    fireEvent.click(screen.getByRole('button', { name: /^Ducks/ }))
    expect(filterOf()).toEqual({ order: 'Anseriformes', family: 'Anatidae' })
    expect(within(crumb).getByText('Ducks')).toBeInTheDocument()
    // The crumb for the order goes back up one level.
    fireEvent.click(within(crumb).getByRole('button', { name: 'Waterfowl' }))
    expect(filterOf()).toEqual({ order: 'Anseriformes' })
  })

  it('tabs are an arrow-key tablist', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Birds', 'Places', 'Time'])
    tabs[0].focus()
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveFocus()
    fireEvent.keyDown(tabs[1], { key: 'ArrowLeft' })
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('country chip and map tap set the same filter', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(screen.getByRole('tab', { name: 'Places' }))
    fireEvent.click(screen.getByRole('button', { name: /^Canada \d/ }))
    const viaChip = filterOf()
    expect(viaChip).toEqual({ country: 'CA' })
    fireEvent.click(screen.getByRole('button', { name: /^Canada \d/ })) // toggles off
    expect(filterOf()).toEqual({})
    fireEvent.click(screen.getByTestId('map-country-CA'))
    expect(filterOf()).toEqual(viaChip)
    expect(screen.getByTestId('country-map')).toHaveTextContent('Canada · 3 species')
    fireEvent.click(screen.getByTestId('map-country-CA')) // tapping the selected country clears it
    expect(filterOf()).toEqual({})
  })

  it('removing a chip from another tab clears only that dimension', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /^Waterfowl/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Places' }))
    fireEvent.click(screen.getByRole('button', { name: /^Canada \d/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Time' }))
    expect(filterOf()).toEqual({ order: 'Anseriformes', country: 'CA' })
    fireEvent.click(screen.getByRole('button', { name: 'Remove Waterfowl filter' }))
    expect(filterOf()).toEqual({ country: 'CA' })
    expect(screen.getByRole('button', { name: 'Remove Canada filter' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Waterfowl filter' })).toBeNull()
  })

  it('at phone width, tapping a lit country on the map sets the country filter', () => {
    vi.stubGlobal('innerWidth', 390)
    render(<Harness />)
    fireEvent.click(screen.getByRole('tab', { name: 'Places' }))
    expect(screen.getByRole('button', { name: 'Choose a country 2' })).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('map-country-EG'))
    expect(filterOf()).toEqual({ country: 'EG' })
    expect(screen.getByRole('button', { name: 'Egypt' })).toBeInTheDocument()
  })

  it('under 600px a tab shows one button that opens a sheet', () => {
    vi.stubGlobal('innerWidth', 390)
    render(<Harness />)
    const btn = screen.getByRole('button', { name: 'Choose an order 3' })
    expect(screen.queryByRole('button', { name: /^Waterfowl/ })).toBeNull()
    btn.focus()
    fireEvent.click(btn)
    const dlg = screen.getByRole('dialog')
    expect(dlg).toHaveAttribute('aria-modal', 'true')
    expect(dlg).toContainElement(document.activeElement as HTMLElement)
    fireEvent.click(within(dlg).getByRole('button', { name: /^Waterfowl/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(filterOf()).toEqual({ order: 'Anseriformes' })
    expect(screen.getByRole('button', { name: 'Waterfowl' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose a family 1' })).toBeInTheDocument()
    // Esc closes and returns focus.
    const fam = screen.getByRole('button', { name: 'Choose a family 1' })
    fam.focus()
    fireEvent.click(fam)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(fam).toHaveFocus()
  })
})

describe('CountryMap', () => {
  it('lit opacity follows quartiles', () => {
    expect(LIT_OPACITY).toEqual([0.35, 0.55, 0.75, 1])
    // 8 lit countries: two per step, by rank from the top.
    expect(litSteps([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([0, 0, 1, 1, 2, 2, 3, 3])
    // 1-3 lit countries: the top one is always full strength.
    expect(litSteps([5])).toEqual([3])
    expect(litSteps([5, 9])).toEqual([1, 3])
    expect(litSteps([1, 5, 9])).toEqual([1, 2, 3])
    // Ties share a step; everything equal is full.
    expect(litSteps([4, 4, 4])).toEqual([3, 3, 3])
    expect(litSteps([])).toEqual([])

    const counts = new Map([['CA', 30], ['EG', 10], ['US', 1]])
    render(<CountryMap countryName={name} dots={dots} counts={counts} onSelect={() => {}} />)
    expect(screen.getByTestId('map-country-CA')).toHaveAttribute('opacity', '1')
    expect(screen.getByTestId('map-country-EG')).toHaveAttribute('opacity', '0.75')
    expect(screen.getByTestId('map-country-US')).toHaveAttribute('opacity', '0.55')
  })

  it('selected stays full, others fade to .25; dots decode to paths; keyboard list', () => {
    const onSelect = vi.fn()
    const counts = new Map([['CA', 30], ['EG', 10]])
    render(<CountryMap countryName={name} dots={dots} counts={counts} selected="EG" onSelect={onSelect} />)
    expect(screen.getByTestId('map-country-EG')).toHaveAttribute('opacity', '1')
    expect(screen.getByTestId('map-country-CA')).toHaveAttribute('opacity', '0.25')
    // CA has 3 cells: 3 zero-length segments, positioned x = (c + .25 + odd*.5)*1.5, y = (r + .5)*1.5.
    const d = screen.getByTestId('map-country-CA').getAttribute('d')!
    expect(d).toBe('M75.38 30.75h0M76.88 30.75h0M76.13 32.25h0')
    fireEvent.click(screen.getByRole('button', { name: 'Canada, 30 species' }))
    expect(onSelect).toHaveBeenCalledWith('CA')
    fireEvent.click(screen.getByRole('button', { name: 'Egypt, 10 species' }))
    expect(onSelect).toHaveBeenLastCalledWith(undefined)
  })
})
