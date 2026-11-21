// @vitest-environment jsdom
// The taxonomy chips down to genera (round 6): a picked family offers its genera as chips (scientific names, italic),
// a genus chip filters to that genus and keeps its row as a leaf; an order with one family offers that family's genera
// (the breadcrumb names the lone family); a family with one genus shows no lone genus chip. The chips are the controls
// bar's Taxa panel's (TaxaPanel), the breadcrumb the page's (FilterBar). Synthetic species only.
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useReducer, useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FilterBar } from '@/components/filters/FilterBar'
import { TaxaPanel } from '@/components/filters/TaxaPanel'
import { initialState, makeReducer, type AppState } from '@/lib/list/store'
import { emptySaved } from '@/lib/list/storage'
import type { SourceRecord } from '@/lib/list/model'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'

const row = (code: string, sci: string, ord: string, fam: string, famCom: string, to: number): SpeciesRow => ({
  code, com: code, sci, ord, fam, famCom, to, g: 100, gSrc: 'avonet', st: true, ar: 1, q: true,
})
const species = buildSpeciesIndex([
  // Waterfowl: one family, two genera.
  row('duck1', 'Anas one', 'Anseriformes', 'Anatidae', 'Ducks', 1),
  row('duck2', 'Anas two', 'Anseriformes', 'Anatidae', 'Ducks', 2),
  row('goose1', 'Anser one', 'Anseriformes', 'Anatidae', 'Ducks', 3),
  // Perching birds: crows (two genera), wrens (one genus).
  row('crow1', 'Corvus one', 'Passeriformes', 'Corvidae', 'Crows', 4),
  row('jay1', 'Garrulus one', 'Passeriformes', 'Corvidae', 'Crows', 5),
  row('wren1', 'Troglodytes one', 'Passeriformes', 'Troglodytidae', 'Wrens', 6),
])
const rec = (code: string): SourceRecord => ({ code, source: 'ebird', date: '2024-05-01', place: { country: 'CA' } })

function seeded(): AppState {
  const reduce = makeReducer({ species })
  const saved = emptySaved()
  saved.records.ebird = ['duck1', 'duck2', 'goose1', 'crow1', 'jay1', 'wren1'].map(rec)
  return reduce(initialState(), { type: 'restore', saved })
}
function Harness() {
  const reduce = makeReducer({ species })
  const [state, dispatch] = useReducer(reduce, undefined, seeded)
  const btn = useRef<HTMLButtonElement>(null)
  return (
    <>
      <div className="eb-dockwrap">
        <button ref={btn} type="button">Taxa</button>
        <TaxaPanel state={state} dispatch={dispatch} species={species} id="taxa" buttonRef={btn} onClose={() => {}} shown={0} />
      </div>
      <FilterBar state={state} dispatch={dispatch} species={species} />
      <output data-testid="filter">{JSON.stringify(state.filter)}</output>
    </>
  )
}
const filterOf = () => JSON.parse(screen.getByTestId('filter').textContent!)
const crumbs = () => screen.getByRole('navigation', { name: 'Filter by group' }).querySelector('.eb-path')!

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('genus chips', () => {
  it('a picked family offers its genera, in italics; a genus filters and keeps its row; the family goes back', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /^Perching birds/ }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Families' })).getByRole('button', { name: /^Crows/ }))
    const genera = screen.getByRole('group', { name: 'Genera' })
    const chips = within(genera).getAllByRole('button')
    expect(chips.map((b) => b.textContent)).toEqual(['Corvus1, 1 species', 'Garrulus1, 1 species'])
    expect(chips[0]).toHaveAttribute('lang', 'la')
    expect(screen.queryByRole('group', { name: 'Families' })).toBeNull()
    expect(crumbs()).toHaveTextContent('All birds/Perching birds/Crows')
    fireEvent.click(chips[1])
    expect(filterOf()).toEqual({ order: 'Passeriformes', family: 'Corvidae', genus: 'Garrulus' })
    expect(within(screen.getByRole('group', { name: 'Genera' })).getByRole('button', { name: /^Garrulus/ })).toHaveAttribute('aria-pressed', 'true')
    expect(crumbs()).toHaveTextContent('All birds/Perching birds/Crows/Garrulus')
    expect(within(crumbs() as HTMLElement).getByText('Garrulus')).toHaveAttribute('lang', 'la')
    fireEvent.click(within(crumbs() as HTMLElement).getByRole('button', { name: 'Crows' }))
    expect(filterOf()).toEqual({ order: 'Passeriformes', family: 'Corvidae' })
    fireEvent.click(within(crumbs() as HTMLElement).getByRole('button', { name: 'All birds' }))
    expect(filterOf()).toEqual({})
  })

  it('an order with one family offers its genera at once; picking one sets the family too', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /^Waterfowl/ }))
    expect(screen.queryByRole('group', { name: 'Families' })).toBeNull()
    expect(crumbs()).toHaveTextContent('All birds/Waterfowl/Ducks')
    fireEvent.click(within(screen.getByRole('group', { name: 'Genera' })).getByRole('button', { name: /^Anser/ }))
    expect(filterOf()).toEqual({ order: 'Anseriformes', family: 'Anatidae', genus: 'Anser' })
  })

  it('a family with one genus shows no lone genus chip: its families row stays', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /^Perching birds/ }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Families' })).getByRole('button', { name: /^Wrens/ }))
    expect(screen.queryByRole('group', { name: 'Genera' })).toBeNull()
    expect(within(screen.getByRole('group', { name: 'Families' })).getByRole('button', { name: /^Wrens/ })).toHaveAttribute('aria-pressed', 'true')
    expect(crumbs()).toHaveTextContent('All birds/Perching birds/Wrens')
  })
})
