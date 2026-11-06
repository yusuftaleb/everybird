// @vitest-environment jsdom
// The controls bar (view tabs, the list's direction, True size, Scientific), Scientific names and the search, on the
// shared CollageView. jsdom has no layout worker, so the collage shows its placeholder; the stats line, the list view
// and the card carry what is shown.
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useReducer } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CollageView } from '@/components/app/CollageView'
import type { SourceRecord } from '@/lib/list/model'
import { emptySaved } from '@/lib/list/storage'
import { initialState, makeReducer, type AppState } from '@/lib/list/store'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow } from '@/lib/species/types'

const sp = (code: string, com: string, sci: string, ord: string, fam: string, famCom: string, to: number, g: number): SpeciesRow =>
  ({ code, com, sci, ord, fam, famCom, to, g, gSrc: 'avonet', st: true, ar: 1, q: true })
const species = buildSpeciesIndex([
  sp('snogoo', 'Snow Goose', 'Anser caerulescens', 'Anseriformes', 'Anatidae', 'Ducks, Geese, and Waterfowl', 1, 2700),
  sp('norfli', 'Northern Flicker', 'Colaptes auratus', 'Piciformes', 'Picidae', 'Woodpeckers', 2, 140),
  sp('gilfli', 'Gilded Flicker', 'Colaptes chrysoides', 'Piciformes', 'Picidae', 'Woodpeckers', 3, 120),
  sp('amerob', 'American Robin', 'Turdus migratorius', 'Passeriformes', 'Turdidae', 'Thrushes', 4, 77),
  sp('yerwar', 'Yellow-rumped Warbler', 'Setophaga coronata', 'Passeriformes', 'Parulidae', 'New World Warblers', 5, 12),
])
const regions: Regions = { v: 1, countries: { CA: 'Canada' }, sub1: { 'CA-BC': 'British Columbia' } }
const rec = (code: string, date: string): SourceRecord => ({ code, source: 'ebird', date, place: { country: 'CA', sub1: 'CA-BC' } })
const reduce = makeReducer({ species, countryName: (c) => (c === 'CA' ? 'Canada' : c) })

function seeded(): AppState {
  const saved = emptySaved()
  saved.records.ebird = [rec('snogoo', '2020-01-02'), rec('norfli', '2021-03-04'), rec('gilfli', '2022-05-06'), rec('amerob', '2023-07-08'), rec('yerwar', '2024-09-10')]
  return reduce(initialState(), { type: 'restore', saved })
}

function Harness() {
  const [state, dispatch] = useReducer(reduce, undefined, seeded)
  return <CollageView state={state} dispatch={dispatch} species={species} regions={regions} label="Test collage" />
}

const stats = () => screen.getByTestId('collage-stats')

beforeEach(() => {
  vi.stubGlobal('innerWidth', 1024)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('controls bar', () => {
  it('has the Collage and List tabs, True size in collage view and the direction in list view, and Scientific', () => {
    render(<Harness />)
    const view = screen.getByRole('group', { name: 'View' })
    expect(within(view).getByRole('button', { name: 'Collage' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('switch', { name: /True size/ })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: /Scientific/ })).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(within(view).getByRole('button', { name: 'List' }))
    expect(screen.queryByRole('switch', { name: /True size/ })).toBeNull()
    const dir = screen.getByRole('button', { name: 'Sorted by body mass, heaviest first. Reverse order' })
    expect(dir).toHaveTextContent('Heaviest first')
    const rowNames = () => screen.getAllByRole('listitem').map((li) => li.querySelector('.eb-row-primary')!.textContent)
    expect(rowNames()[0]).toBe('Snow Goose')
    fireEvent.click(dir)
    expect(screen.getByRole('button', { name: 'Sorted by body mass, lightest first. Reverse order' })).toHaveTextContent('Lightest first')
    expect(rowNames()[0]).toBe('Yellow-rumped Warbler')
  })
})

describe('Scientific names', () => {
  it('lead in list rows, the card, the order chips and the breadcrumb, in italics marked as Latin', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('switch', { name: /Scientific/ }))
    expect(screen.getByRole('switch', { name: /Scientific/ })).toHaveAttribute('aria-checked', 'true')
    // Order chips: the order's scientific name.
    const orders = screen.getByRole('group', { name: 'Orders' })
    const chip = within(orders).getByRole('button', { name: /^Piciformes/ })
    expect(chip).toHaveAttribute('lang', 'la')
    fireEvent.click(chip)
    expect(screen.getByRole('navigation', { name: 'Filter by group' })).toHaveTextContent('All birds/Piciformes')
    // List rows: scientific first, common second.
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    const li = screen.getAllByRole('listitem')[0]
    const primary = li.querySelector('.eb-row-primary')!
    expect(primary).toHaveTextContent('Colaptes auratus')
    expect(primary).toHaveAttribute('lang', 'la')
    expect(li.querySelector('.eb-row-other')).toHaveTextContent('Northern Flicker')
    // Card: the title is the scientific name (the dialog's name stays the common name).
    fireEvent.click(within(li).getByRole('button'))
    const card = screen.getByRole('dialog', { name: 'Northern Flicker' })
    expect(within(card).getByRole('heading')).toHaveTextContent('Colaptes auratus')
  })
})

describe('search (Photography\'s dock search)', () => {
  const open = () => fireEvent.click(screen.getByRole('button', { name: 'Find a bird' }))
  const box = () => screen.getByRole('combobox', { name: 'Find a bird' })
  const find = (text: string) => act(async () => { fireEvent.change(box(), { target: { value: text } }) })
  const names = () => within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.querySelector('.eb-result-name')!.textContent)

  it('the magnifier turns the dock into the field: tabs and tools inert, focus in the field; Esc closes and returns focus', async () => {
    render(<Harness />)
    open()
    expect(box()).toHaveFocus()
    expect(screen.getByRole('group', { name: 'View' })).toHaveAttribute('inert')
    await find('fli')
    expect(box()).toHaveAttribute('aria-expanded', 'true')
    expect(box()).toHaveAttribute('aria-controls', screen.getByRole('listbox').id)
    fireEvent.keyDown(box(), { key: 'ArrowDown' })
    const opts = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(box()).toHaveAttribute('aria-activedescendant', opts[0].id)
    await act(async () => { fireEvent.keyDown(box(), { key: 'Escape' }) })
    expect(screen.queryByRole('combobox')).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Find a bird' })).toHaveFocus())
    expect(stats()).toHaveTextContent(/^5 species/) // typing never narrowed the view
  })

  it('results read "Common name (scientific)", sorted by common name, over orders, families and species on show', async () => {
    render(<Harness />)
    open()
    await find('fli')
    expect(names()).toEqual(['Gilded Flicker (Colaptes chrysoides)', 'Northern Flicker (Colaptes auratus)'])
    await find('wood')
    expect(names()).toEqual(['Woodpeckers (Piciformes)']) // the order; its one family of the same name is left out
    expect(within(screen.getByRole('listbox')).getByRole('option')).toHaveTextContent(/Order · 2$/)
    await find('setóphaga')
    expect(names()).toEqual(['Yellow-rumped Warbler (Setophaga coronata)'])
    await find('zzz')
    expect(screen.getByText('No bird on this list matches “zzz”.')).toBeInTheDocument()
  })

  it('covers the whole list: matches in the filter first, the rest under "Elsewhere on the list" with their order', async () => {
    render(<Harness />)
    fireEvent.click(within(screen.getByRole('group', { name: 'Orders' })).getByRole('button', { name: /^Woodpeckers/ }))
    open()
    await find('robin')
    const opt = within(screen.getByRole('listbox')).getByRole('option', { name: /American Robin/ })
    expect(opt).toHaveTextContent(/Perching birds · Species$/)
    expect(screen.getByText('Elsewhere on the list')).toBeInTheDocument()
    await find('co') // Colaptes (the flickers, in the filter) before Setophaga coronata (outside)
    const all = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.querySelector('.eb-result-name')!.textContent)
    expect(all.indexOf('Gilded Flicker (Colaptes chrysoides)')).toBeLessThan(all.indexOf('Yellow-rumped Warbler (Setophaga coronata)'))
  })

  it('picking a species outside the filter clears the filters that hide it, then shows it (list view: its row)', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Orders' })).getByRole('button', { name: /^Woodpeckers/ }))
    await waitFor(() => expect(stats()).toHaveTextContent(/^2 of 5 species/))
    open()
    await find('robin')
    await act(async () => { fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /American Robin/ })) })
    await waitFor(() => expect(stats()).toHaveTextContent(/^5 species/)) // back to All birds
    await waitFor(() => expect(document.querySelector('.eb-row-btn[data-code="amerob"]')).toHaveAttribute('data-ring'))
    expect(document.querySelector('.eb-row-btn[data-code="amerob"]')).toHaveFocus()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('picking an order or family outside the filter drills into it', async () => {
    render(<Harness />)
    fireEvent.click(within(screen.getByRole('group', { name: 'Orders' })).getByRole('button', { name: /^Woodpeckers/ }))
    open()
    await find('thrush')
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /^Thrushes/ }))
    await waitFor(() => expect(stats()).toHaveTextContent(/^1 of 5 species/))
    expect(document.querySelector('.eb-path')).toHaveTextContent('All birds/Perching birds/Thrushes')
  })

  it('picking an order or a family drills the filter into it', async () => {
    render(<Harness />)
    open()
    await find('thrush')
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /^Thrushes/ }))
    await waitFor(() => expect(stats()).toHaveTextContent(/^1 of 5 species/))
    expect(document.querySelector('.eb-path')).toHaveTextContent('All birds/Perching birds/Thrushes')
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('picking a species shows it where it stands, without opening its card (list view: its row, ringed and focused)', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    open()
    await find('robin')
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /American Robin/ }))
    const row = document.querySelector<HTMLElement>('.eb-row-btn[data-code="amerob"]')!
    expect(row).toHaveAttribute('data-ring')
    expect(row).toHaveFocus()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(stats()).toHaveTextContent(/^5 species/)
  })
})

describe('hover tooltip', () => {
  // A full layout handed in as a seed stands in for the worker, so the stage renders in jsdom.
  const seed = [{ key: 'wide|even|', layout: 'wide' as const, mode: 'even' as const, W: 1000, H: 400, scale: 1, base: 10,
    boxes: new Map([['snogoo', [10, 10, 80, 60]], ['norfli', [200, 10, 40, 30]], ['gilfli', [300, 10, 40, 30]], ['amerob', [400, 200, 40, 30]], ['yerwar', [500, 200, 20, 15]]] as [string, [number, number, number, number]][]) }]
  function Seeded() {
    const [state, dispatch] = useReducer(reduce, undefined, seeded)
    return <CollageView state={state} dispatch={dispatch} species={species} regions={regions} label="Test collage" seed={seed} />
  }
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1024, bottom: 400, width: 1024, height: 400, toJSON: () => ({}) })
  })
  afterEach(() => vi.restoreAllMocks())

  it('a species picked from the search shows its tooltip (the card\'s facts, not interactive); Esc or a press hides it', async () => {
    render(<Seeded />)
    await screen.findByTestId('collage-stage')
    fireEvent.click(screen.getByRole('button', { name: 'Find a bird' }))
    await act(async () => { fireEvent.change(screen.getByRole('combobox', { name: 'Find a bird' }), { target: { value: 'robin' } }) })
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /American Robin/ }))
    const tip = await screen.findByTestId('bird-tip')
    expect(tip).toHaveAttribute('aria-hidden', 'true')
    expect(tip).toHaveTextContent('American Robin')
    expect(tip).toHaveTextContent('Turdus migratorius')
    expect(tip).toHaveTextContent(/Jul 2023/i)
    expect(tip).toHaveTextContent(/British Columbia, Canada/i)
    expect(tip.querySelector('button')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(screen.queryByTestId('bird-tip')).toBeNull()
  })

  it('a species picked from outside the filter: the filter clears, the collage glides, then its tooltip opens', async () => {
    render(<Seeded />)
    await screen.findByTestId('collage-stage')
    fireEvent.click(within(screen.getByRole('group', { name: 'Orders' })).getByRole('button', { name: /^Woodpeckers/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Find a bird' }))
    await act(async () => { fireEvent.change(screen.getByRole('combobox', { name: 'Find a bird' }), { target: { value: 'robin' } }) })
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /American Robin/ }))
    await waitFor(() => expect(stats()).toHaveTextContent(/^5 species/))
    expect(screen.queryByTestId('bird-tip')).toBeNull() // not before the glide
    expect(await screen.findByTestId('bird-tip', {}, { timeout: 2000 })).toHaveTextContent('American Robin')
  })

  it('an out-of-filter pick lapses when the filter is changed by hand before it lands', async () => {
    render(<Seeded />)
    await screen.findByTestId('collage-stage')
    fireEvent.click(within(screen.getByRole('group', { name: 'Orders' })).getByRole('button', { name: /^Woodpeckers/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Find a bird' }))
    await act(async () => { fireEvent.change(screen.getByRole('combobox', { name: 'Find a bird' }), { target: { value: 'robin' } }) })
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /American Robin/ }))
    await waitFor(() => expect(stats()).toHaveTextContent(/^5 species/))
    fireEvent.click(within(screen.getByRole('group', { name: 'Orders' })).getByRole('button', { name: /^Waterfowl/ }))
    await act(async () => { await new Promise((r) => setTimeout(r, 1200)) })
    expect(screen.queryByTestId('bird-tip')).toBeNull()
  })
})
