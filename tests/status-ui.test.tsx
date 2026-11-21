// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useReducer } from 'react'
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { CollageView } from '@/components/app/CollageView'
import type { FilterSection } from '@/components/filters/Filters'
import { FiltersDock } from './filters-dock'
import { STATUS_ICON } from '@/components/filters/status-icon'
import { IucnBadge, IucnPill } from '@/components/collage/IucnPill'
import { initialState, makeReducer, type AppState } from '@/lib/list/store'
import { emptySaved } from '@/lib/list/storage'
import { monthBins } from '@/lib/list/timeline'
import type { IucnCat } from '@/lib/species/iucn'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { loadLazyParts } from './lazy-parts'

beforeAll(loadLazyParts, 60_000)

const row = (code: string, ord: string, fam: string, to: number, iu?: IucnCat): SpeciesRow => ({
  code, com: code, sci: `Avis ${code}`, ord, fam, famCom: fam, to, g: 100, gSrc: 'avonet', st: true, ar: 1, q: true, ...(iu ? { iu } : {}),
})
const species = buildSpeciesIndex([
  row('duck1', 'Anseriformes', 'Anatidae', 1, 'LC'),
  row('owl1', 'Strigiformes', 'Strigidae', 5, 'VU'),
  row('crow1', 'Passeriformes', 'Corvidae', 3, 'EN'),
  row('robin1', 'Passeriformes', 'Turdidae', 7),
])
const regions: Regions = { v: 1, countries: { CA: 'Canada' }, sub1: {} }
const reduce = makeReducer({ species })

function seeded(codes: string[]): AppState {
  const saved = emptySaved()
  saved.records.ebird = codes.map((code) => ({ code, source: 'ebird', date: '2020-01-01', place: { country: 'CA' } }))
  return reduce(initialState(), { type: 'restore', saved })
}

function Harness({ codes = ['duck1', 'owl1', 'crow1', 'robin1'], hide }: { codes?: string[]; hide?: readonly FilterSection[] }) {
  const [state, dispatch] = useReducer(reduce, undefined, () => seeded(codes))
  const time = { entries: state.list, months: monthBins(state.list, '2022-06').months, today: '2022-06' }
  return (
    <>
      <FiltersDock state={state} dispatch={dispatch} species={species} regions={regions} time={time} hide={hide} />
      <button type="button" onClick={() => dispatch({ type: 'filter', filter: { ...state.filter, order: 'Strigiformes' } })}>owls only</button>
      <button type="button" onClick={() => dispatch({ type: 'filter', filter: { ...state.filter, order: 'Passeriformes', family: 'Turdidae' } })}>thrushes only</button>
      <output data-testid="filter">{JSON.stringify(state.filter)}</output>
    </>
  )
}
const filterOf = () => JSON.parse(screen.getByTestId('filter').textContent || '{}')
const statusBtn = () => screen.getByTestId('filters-button')
const statusPanel = () => screen.getByRole('group', { name: 'Conservation status' })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Status: a section of the Filters panel', () => {
  it('the Filters button opens a Conservation status section that lists the categories on the list, in Red List order, with counts', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    expect(statusBtn()).toHaveAccessibleName('Filters')
    fireEvent.click(statusBtn())
    const panel = screen.getByRole('dialog', { name: 'Filters' })
    expect(statusBtn()).toHaveAttribute('aria-controls', panel.id)
    expect(panel).toContainElement(statusPanel())
    expect(screen.getByText(/4 categories/)).toBeInTheDocument()
    expect(within(statusPanel()).getAllByRole('checkbox').map((c) => c.getAttribute('data-testid'))).toEqual(['status-LC', 'status-VU', 'status-EN', 'status-NE'])
    expect(screen.queryByTestId('status-note')).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Vulnerable, 1 species' })).toBeInTheDocument()
    // The source note lives only on About.
    expect(screen.queryByText(/Global IUCN Red List categories/)).toBeNull()
    // Each row: the box, the pill (hidden from assistive tech), the full name, the count.
    const label = screen.getByTestId('status-VU').closest('label')!
    const pill = label.querySelector('.eb-iucn')!
    expect(pill).toHaveTextContent('VU')
    expect(pill).toHaveAttribute('aria-hidden', 'true')
    expect(label).toHaveTextContent('VUVulnerable1, 1 species')
    expect(screen.queryByTestId('status-clear')).toBeNull()
  })

  it('checking filters live; the button says how many and names them; Clear clears', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(statusBtn())
    fireEvent.click(screen.getByTestId('status-VU'))
    fireEvent.click(screen.getByTestId('status-EN'))
    expect(filterOf()).toEqual({ statuses: ['VU', 'EN'] })
    expect(screen.getByTestId('status-VU')).toBeChecked()
    // One group in use: the button's name says 1, and two chips.
    expect(statusBtn()).toHaveAccessibleName('Filters, 1 in use: Conservation status: Vulnerable, Endangered')
    expect(screen.getByTestId('chip-status-VU')).toBeInTheDocument()
    expect(screen.getByTestId('chip-status-EN')).toBeInTheDocument()
    // The counts are under the other filters: checking a category changes none of them.
    expect(screen.getByRole('checkbox', { name: 'Least Concern, 1 species' })).not.toBeChecked()
    fireEvent.click(screen.getByTestId('status-clear'))
    expect(filterOf()).toEqual({})
    expect(screen.queryByTestId('status-clear')).toBeNull()
  })

  it('a checked category another filter empties stays at 0 so it can be unchecked', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(statusBtn())
    fireEvent.click(screen.getByTestId('status-EN'))
    fireEvent.click(screen.getByRole('button', { name: 'owls only' }))
    expect(filterOf()).toEqual({ order: 'Strigiformes', statuses: ['EN'] })
    expect(within(statusPanel()).getAllByRole('checkbox').map((c) => c.getAttribute('data-testid'))).toEqual(['status-VU', 'status-EN'])
    expect(screen.getByTestId('status-EN')).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Endangered, 0 species' })).toBeInTheDocument()
    expect(screen.getByText(/2 categories · 1 checked/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('status-EN'))
    expect(filterOf()).toEqual({ order: 'Strigiformes' })
  })

  it('no Status section on a list where no species has a status', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness codes={['robin1']} />)
    fireEvent.click(statusBtn())
    expect(screen.queryByRole('group', { name: 'Conservation status' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Places' })).toBeInTheDocument()
  })

  it('hide may name status: no Status section on a list that has statuses', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness hide={['status']} />)
    fireEvent.click(statusBtn())
    expect(screen.queryByRole('group', { name: 'Conservation status' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Time' })).toBeInTheDocument()
  })

  it('under a filter whose birds have no category, the panel offers Not evaluated alone', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'thrushes only' }))
    fireEvent.click(statusBtn())
    expect(within(statusPanel()).getAllByRole('checkbox').map((c) => c.getAttribute('data-testid'))).toEqual(['status-NE'])
    expect(screen.getByText(/1 category/)).toBeInTheDocument()
  })

  it('under a filter with no birds at all, the panel says so', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness codes={['duck1', 'owl1', 'crow1']} />)
    fireEvent.click(screen.getByRole('button', { name: 'thrushes only' }))
    fireEvent.click(statusBtn())
    expect(within(statusPanel()).queryAllByRole('checkbox')).toEqual([])
    expect(screen.getByText(/0 categories/)).toBeInTheDocument()
    expect(screen.getByText('No categories here under the other filters.')).toBeInTheDocument()
  })

  it('Not evaluated: a grey pill row, named in full, that filters the birds with no category; the chip says so', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(statusBtn())
    const box = screen.getByRole('checkbox', { name: 'Not evaluated, 1 species' })
    expect(box).not.toBeChecked()
    const pill = box.closest('label')!.querySelector('.eb-iucn') as HTMLElement
    expect(pill).toHaveTextContent('NE')
    expect(pill.style.getPropertyValue('--iucn-fill')).toBe('#9a9a94')
    expect(pill.style.getPropertyValue('--iucn-text')).toBe('#1e1e24')
    fireEvent.click(screen.getByTestId('status-NE'))
    expect(filterOf()).toEqual({ statuses: ['NE'] })
    expect(screen.getByTestId('chip-status-NE')).toHaveTextContent('Not evaluated')
    expect(statusBtn()).toHaveAccessibleName('Filters, 1 in use: Conservation status: Not evaluated')
  })

  it('Esc closes the panel and focus returns to the Filters button; at phone width it is the bottom sheet', () => {
    vi.stubGlobal('innerWidth', 1000)
    const { unmount } = render(<Harness />)
    statusBtn().focus()
    fireEvent.click(statusBtn())
    expect(screen.getByRole('dialog', { name: 'Filters' })).toContainElement(document.activeElement as HTMLElement)
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(statusBtn()).toHaveFocus()
    unmount()

    vi.stubGlobal('innerWidth', 390)
    render(<Harness />)
    fireEvent.click(statusBtn())
    const sheet = screen.getByRole('dialog', { name: 'Filters' })
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    expect(within(sheet).getByTestId('status-LC')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('IucnPill', () => {
  it('the span form: the abbreviation, its Red List colours inline, hidden from assistive tech', () => {
    render(<IucnPill cat="CR" />)
    const pill = screen.getByText('CR')
    expect(pill.tagName).toBe('SPAN')
    expect(pill).toHaveClass('eb-iucn')
    expect(pill).toHaveAttribute('data-cat', 'CR')
    expect(pill).toHaveAttribute('aria-hidden', 'true')
    expect(pill.style.getPropertyValue('--iucn-fill')).toBe('#d81e05')
    expect(pill.style.getPropertyValue('--iucn-text')).toBe('#ffffff')
  })
  it('the badge: a pill button with a toggletip in the card, a plain span without', () => {
    render(<IucnBadge cat="VU" tip />)
    const btn = screen.getByRole('button', { name: 'Red List: Vulnerable' })
    expect(btn).toHaveTextContent('VU')
    cleanup()
    render(<IucnBadge cat="VU" />)
    const badge = screen.getByTestId('iucn-badge')
    expect(badge.querySelector('button')).toBeNull()
    expect(badge).toHaveTextContent(/^VU$/)
    expect(badge.querySelector('.eb-iucn')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('The Conservation status section’s glyph', () => {
  it('the section title carries STATUS_ICON, one constant shared with the How it works scene; Places and Time keep their own', () => {
    vi.stubGlobal('innerWidth', 1000)
    const { container } = render(<STATUS_ICON />)
    const leaf = container.querySelector('svg')!.innerHTML
    cleanup()
    render(<Harness />)
    fireEvent.click(statusBtn())
    const glyph = (name: string) => screen.getByRole('group', { name }).querySelector('.eb-fsec-title svg')!.innerHTML
    expect(glyph('Conservation status')).toBe(leaf)
    expect(glyph('Places')).not.toBe(leaf)
    expect(glyph('Time')).not.toBe(leaf)
  })
})

describe('The threatened count', () => {
  function View() {
    const [state, dispatch] = useReducer(reduce, undefined, () => seeded(['duck1', 'owl1', 'crow1', 'robin1']))
    return <CollageView state={state} dispatch={dispatch} species={species} regions={regions} label="Test collage" />
  }
  const stats = () => screen.getByTestId('collage-stats')

  const SR = ' (Vulnerable, Endangered or Critically Endangered)'
  it('on the stats line; screen readers hear the categories it counts', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<View />)
    // What the eye reads: the line without the visually hidden context.
    const visible = Array.from(stats().querySelectorAll('.eb-stat')).map((s) => s.firstChild?.textContent).join(' · ')
    expect(visible).toBe('4 species · 3 orders · 4 families · 2 threatened · since Jan 2020')
    // The threatened part carries its context in an .eb-sr span; no other part does.
    const threat = Array.from(stats().querySelectorAll('.eb-stat')).find((s) => s.firstChild?.textContent === '2 threatened')!
    expect(threat).toHaveTextContent(`2 threatened${SR}`, { normalizeWhitespace: false })
    expect(threat.querySelector('.eb-sr')).toHaveTextContent(SR.trim())
    expect(stats().querySelectorAll('.eb-sr')).toHaveLength(1)
  })
})
