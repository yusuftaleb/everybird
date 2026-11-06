// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useReducer } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FilterBar } from '@/components/filters/FilterBar'
import { initialState, makeReducer, type AppState } from '@/lib/list/store'
import { emptySaved } from '@/lib/list/storage'
import type { SourceRecord } from '@/lib/list/model'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'

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
const rec = (code: string, country: string, date: string): SourceRecord => ({ code, source: 'ebird', date, place: { country } })

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
      <FilterBar state={state} dispatch={dispatch} species={species} />
      <output data-testid="filter">{JSON.stringify(state.filter)}</output>
    </>
  )
}
const filterOf = () => JSON.parse(screen.getByTestId('filter').textContent!)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('FilterBar', () => {
  const crumbs = () => screen.getByRole('navigation', { name: 'Filter by group' })

  it('as on LifeList: choosing an order swaps the orders row for the breadcrumb and that order\'s families', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    const orders = screen.getByRole('group', { name: 'Orders' })
    expect(orders).toHaveTextContent(/^Orders/)
    expect(crumbs()).not.toHaveTextContent('All birds') // no breadcrumb before a choice
    fireEvent.click(within(orders).getByRole('button', { name: /^Perching birds/ }))
    expect(filterOf()).toEqual({ order: 'Passeriformes' })
    expect(screen.queryByRole('group', { name: 'Orders' })).toBeNull()
    const fams = screen.getByRole('group', { name: 'Families' })
    expect(within(fams).getAllByRole('button').map((b) => b.textContent)).toEqual(['Crows1, 1 species', 'Wrens1, 1 species'])
    expect(crumbs()).toHaveTextContent('All birds/Perching birds')
    expect(within(crumbs()).getByText('Perching birds')).toHaveAttribute('aria-current', 'location')
    fireEvent.click(within(fams).getByRole('button', { name: /^Crows/ }))
    expect(filterOf()).toEqual({ order: 'Passeriformes', family: 'Corvidae' })
    // The families row stays, with the choice marked; the breadcrumb ends with the family.
    expect(within(screen.getByRole('group', { name: 'Families' })).getByRole('button', { name: /^Crows/ })).toHaveAttribute('aria-pressed', 'true')
    expect(crumbs()).toHaveTextContent('All birds/Perching birds/Crows')
    fireEvent.click(within(crumbs()).getByRole('button', { name: 'Perching birds' }))
    expect(filterOf()).toEqual({ order: 'Passeriformes' })
    fireEvent.click(within(crumbs()).getByRole('button', { name: 'All birds' }))
    expect(filterOf()).toEqual({})
    expect(screen.getByRole('group', { name: 'Orders' })).toBeInTheDocument()
  })

  it('an order with one family: the breadcrumb ends with the family and there is no families row', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /^Waterfowl/ }))
    expect(crumbs()).toHaveTextContent('All birds/Waterfowl/Ducks')
    expect(within(crumbs()).queryByRole('button', { name: 'Waterfowl' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Families' })).toBeNull()
  })

  it('chips have no icons; each count is muted beside the name, read as ", 2 species"', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    const chip = within(screen.getByRole('group', { name: 'Orders' })).getByRole('button', { name: 'Waterfowl, 2 species' })
    expect(chip.querySelector('svg')).toBeNull()
    expect(chip.querySelector('.eb-count')).toHaveTextContent(/^2$/)
  })

  it('under 600px the level is one button ("Choose an order 3") that opens a sheet of chips', () => {
    vi.stubGlobal('innerWidth', 390)
    render(<Harness />)
    const btn = screen.getByRole('button', { name: 'Choose an order 3' })
    expect(screen.queryByRole('button', { name: /^Waterfowl/ })).toBeNull()
    btn.focus()
    fireEvent.click(btn)
    const dlg = screen.getByRole('dialog', { name: 'Orders' })
    expect(dlg).toHaveAttribute('aria-modal', 'true')
    expect(dlg).toHaveTextContent('Orders · 3')
    expect(dlg).toContainElement(document.activeElement as HTMLElement)
    fireEvent.click(within(dlg).getByRole('button', { name: /^Perching birds/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(filterOf()).toEqual({ order: 'Passeriformes' })
    expect(crumbs()).toHaveTextContent('All birds/Perching birds')
    // Esc closes the families sheet and returns focus to its button.
    const fam = screen.getByRole('button', { name: 'Choose a family 2' })
    fam.focus()
    fireEvent.click(fam)
    expect(screen.getByRole('dialog', { name: 'Families' })).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(fam).toHaveFocus()
  })
})
