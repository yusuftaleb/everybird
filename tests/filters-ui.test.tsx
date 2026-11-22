// @vitest-environment jsdom
// The taxonomy filter (round 6): its chips in the controls bar's Taxa panel (TaxaPanel, a popover from 600px, the sheet
// under it, chips in both), and on the page under the dock only the breadcrumb once a taxon is picked (FilterBar).
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useReducer, useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FilterBar } from '@/components/filters/FilterBar'
import { TaxaPanel } from '@/components/filters/TaxaPanel'
import { applyFilter } from '@/lib/list/filters'
import { initialState, makeReducer, type AppState } from '@/lib/list/store'
import { emptySaved } from '@/lib/list/storage'
import type { SourceRecord } from '@/lib/list/model'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { es } from '@/i18n/messages/es'
import { withI18n } from './i18n-render'

// The full taxonomy the Taxa panel's head counts against (loadSpecies): the list's orders and one more, Piciformes.
const taxonomy = vi.hoisted(() => ({ rows: [] as SpeciesRow[] }))
vi.mock('@/lib/species/load', async (orig) => {
  const mod = await orig<typeof import('@/lib/species/load')>()
  return { ...mod, loadSpecies: () => Promise.resolve(mod.buildSpeciesIndex(taxonomy.rows)) }
})

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
  const reduce = makeReducer({ species })
  const saved = emptySaved()
  saved.records.ebird = [
    rec('duck1', 'CA', '2020-05-01'), rec('duck2', 'CA', '2021-05-01'), rec('crow1', 'EG', '2021-06-01'),
    rec('wren1', 'CA', '2022-06-01'), rec('owl1', 'EG', '2022-07-01'),
  ]
  return reduce(initialState(), { type: 'restore', saved })
}
taxonomy.rows = [...species.rows, row('wood1', 'Piciformes', 'Picidae', 'Woodpeckers', 6)]

function Harness({ initial }: { initial?: AppState }) {
  const reduce = makeReducer({ species })
  const [state, dispatch] = useReducer(reduce, initial ?? seeded())
  const btn = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(true)
  return (
    <>
      <div className="eb-dockwrap">
        <button ref={btn} type="button" onClick={() => setOpen((o) => !o)}>Taxa</button>
        {open && <TaxaPanel state={state} dispatch={dispatch} species={species} id="taxa" buttonRef={btn} onClose={() => setOpen(false)} shown={applyFilter(state.list, state.filter, species).length} />}
      </div>
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

describe('the Taxa panel and the breadcrumb', () => {
  const crumbs = () => screen.getByRole('navigation', { name: 'Filter by group' })
  const panel = () => screen.getByTestId('taxa-panel')

  it('as on LifeList: choosing an order swaps the orders row for the breadcrumb and that order\'s families; the page shows only the breadcrumb', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    expect(panel()).toHaveAttribute('role', 'dialog')
    expect(panel()).toHaveAccessibleName('Orders, families and genera')
    const orders = within(panel()).getByRole('group', { name: 'Orders' })
    expect(orders).toHaveTextContent(/^Orders/)
    expect(screen.queryByRole('navigation', { name: 'Filter by group' })).toBeNull() // nothing on the page before a choice
    fireEvent.click(within(orders).getByRole('button', { name: /^Perching birds/ }))
    expect(filterOf()).toEqual({ order: 'Passeriformes' })
    expect(panel()).toBeInTheDocument() // the panel stays open for the next level
    expect(screen.queryByRole('group', { name: 'Orders' })).toBeNull()
    const fams = within(panel()).getByRole('group', { name: 'Families' })
    expect(within(fams).getAllByRole('button').map((b) => b.textContent)).toEqual(['Crows1, 1 species', 'Wrens1, 1 species'])
    expect(within(crumbs()).queryByRole('group')).toBeNull() // the chips are the panel's alone
    expect(crumbs()).toHaveTextContent('All birds/Perching birds')
    expect(within(crumbs()).getByText('Perching birds')).toHaveAttribute('aria-current', 'location')
    expect(panel().querySelector('.eb-path')).toHaveTextContent('All birds/Perching birds')
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
    expect(screen.queryByRole('navigation', { name: 'Filter by group' })).toBeNull()
  })

  it('the head counts the level\'s groups with a bird of the taxonomy\'s in the parent, once the species file loads', async () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    // Before the species file: the count alone, so the head never arrives late (O12).
    expect(screen.getByTestId('taxa-head')).toHaveTextContent(/^3 orders$/)
    expect(await screen.findByText('3 of 4 orders')).toHaveAttribute('data-testid', 'taxa-head')
    fireEvent.click(within(panel()).getByRole('button', { name: /^Perching birds/ }))
    expect(screen.getByTestId('taxa-head')).toHaveTextContent('2 of 2 families')
  })

  it('an order with one family: the breadcrumb ends with the family and there is no families row', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(within(panel()).getByRole('button', { name: /^Waterfowl/ }))
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

  it('under 600px the panel is a modal sheet with the chips themselves (no "Choose an order" picker), a close button and "Show N species"', () => {
    vi.stubGlobal('innerWidth', 390)
    render(<Harness />)
    expect(screen.queryByRole('button', { name: /^Choose an order/ })).toBeNull()
    const dlg = screen.getByRole('dialog', { name: 'Orders, families and genera' })
    expect(dlg).toHaveAttribute('aria-modal', 'true')
    expect(dlg.closest('.eb-sheet-scrim')?.parentElement).toBe(document.body)
    expect(dlg).toContainElement(document.activeElement as HTMLElement)
    fireEvent.click(within(dlg).getByRole('button', { name: /^Perching birds/ }))
    expect(filterOf()).toEqual({ order: 'Passeriformes' })
    expect(within(dlg).getByRole('group', { name: 'Families' })).toBeInTheDocument() // stays open, the next level in it
    expect(crumbs()).toHaveTextContent('All birds/Perching birds')
    expect(within(dlg).getByRole('button', { name: 'Close' })).toBeInTheDocument()
    fireEvent.click(within(dlg).getByRole('button', { name: 'Show 2 species' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    // Esc closes it and returns focus to its button.
    const btn = screen.getByRole('button', { name: 'Taxa' })
    fireEvent.click(btn)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(btn).toHaveFocus()
  })
})

describe('in Spanish', () => {
  it('the orders row, its chips and the breadcrumb come from es.ui (Todas las aves / Paseriformes)', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />, { wrapper: withI18n('es') })
    const orders = screen.getByRole('group', { name: 'Órdenes' })
    const chip = within(orders).getByRole('button', { name: /^Paseriformes/ })
    expect(chip).toHaveAccessibleName('Paseriformes, 2 especies')
    expect(within(orders).getByRole('button', { name: new RegExp(`^${es.ui.orders.Anseriformes}`) })).toBeInTheDocument()
    fireEvent.click(chip)
    const crumbs = screen.getByRole('navigation', { name: 'Filtrar por grupo' }).querySelector('.eb-path')!
    expect(crumbs).toHaveTextContent(`Todas las aves/${es.ui.orders.Passeriformes}`)
    expect(screen.getByRole('group', { name: 'Familias' })).toBeInTheDocument()
  })
  it('under 600px the sheet is named Órdenes, familias y géneros and holds the chips', () => {
    vi.stubGlobal('innerWidth', 390)
    render(<Harness />, { wrapper: withI18n('es') })
    const dlg = screen.getByRole('dialog', { name: 'Órdenes, familias y géneros' })
    expect(within(dlg).getByRole('group', { name: 'Órdenes' })).toBeInTheDocument()
  })
})
