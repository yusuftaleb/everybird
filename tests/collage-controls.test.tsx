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
const search = () => screen.getByRole('combobox', { name: 'Search your birds' })
const type = (text: string) => act(async () => { search().focus(); fireEvent.change(search(), { target: { value: text } }) })

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

describe('search', () => {
  it('is a combobox: suggestions from the current list as you type, arrow keys move, and the view narrows', async () => {
    render(<Harness />)
    const box = search()
    expect(box).toHaveAttribute('aria-expanded', 'false')
    await type('fli')
    expect(box).toHaveAttribute('aria-expanded', 'true')
    const list = screen.getByRole('listbox')
    expect(box).toHaveAttribute('aria-controls', list.id)
    const opts = within(list).getAllByRole('option')
    expect(opts.map((o) => o.querySelector('.eb-suggest-primary')!.textContent)).toEqual(['Northern Flicker', 'Gilded Flicker'])
    await waitFor(() => expect(stats()).toHaveTextContent(/^2 of 5 species/))
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    expect(box).toHaveAttribute('aria-activedescendant', opts[0].id)
    expect(opts[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    expect(box).toHaveAttribute('aria-activedescendant', opts[1].id)
    fireEvent.keyDown(box, { key: 'ArrowUp' })
    expect(box).toHaveAttribute('aria-activedescendant', opts[0].id)
  })

  it('matches scientific names and accents, and combines with the other filters', async () => {
    render(<Harness />)
    await type('setóphaga')
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1)
    fireEvent.click(within(screen.getByRole('group', { name: 'Orders' })).getByRole('button', { name: /^Woodpeckers/ }))
    await type('fli')
    await waitFor(() => expect(stats()).toHaveTextContent(/^2 of 5 species/))
    const status = document.querySelector('.eb-search-field [role="status"]')!
    expect(status).toHaveTextContent('') // in the DOM before it has anything to say, so the text is announced
    await type('robin')
    expect(screen.queryByRole('option')).toBeNull()
    expect(document.querySelector('.eb-search-field [role="status"]')).toBe(status)
    expect(status).toHaveTextContent('No bird on this list matches')
  })

  it('Enter picks: the narrowing clears, the bird is highlighted and its card opens', async () => {
    render(<Harness />)
    await type('gil')
    await waitFor(() => expect(stats()).toHaveTextContent(/^1 of 5 species/))
    fireEvent.keyDown(search(), { key: 'ArrowDown' })
    fireEvent.keyDown(search(), { key: 'Enter' })
    expect(await screen.findByRole('dialog', { name: 'Gilded Flicker' })).toBeInTheDocument()
    expect(search()).toHaveValue('')
    await waitFor(() => expect(stats()).toHaveTextContent(/^5 species/))
  })

  it('a click on a suggestion picks too; in list view the row is the one highlighted', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    await type('robin')
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /American Robin/ }))
    expect(await screen.findByRole('dialog', { name: 'American Robin' })).toBeInTheDocument()
    expect(document.querySelector('.eb-row-btn[data-code="amerob"]')).toHaveAttribute('data-ring')
  })

  it('Esc clears the search and the narrowing', async () => {
    render(<Harness />)
    await type('flicker')
    await waitFor(() => expect(stats()).toHaveTextContent(/^2 of 5 species/))
    await act(async () => { fireEvent.keyDown(search(), { key: 'Escape' }) })
    expect(search()).toHaveValue('')
    expect(search()).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(stats()).toHaveTextContent(/^5 species/))
  })

  it('with Scientific names on, suggestions lead with the scientific name', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('switch', { name: /Scientific/ }))
    await type('turdus')
    const opt = within(screen.getByRole('listbox')).getByRole('option')
    expect(opt.querySelector('.eb-suggest-primary')).toHaveTextContent('Turdus migratorius')
    expect(opt.querySelector('.eb-suggest-primary')).toHaveAttribute('lang', 'la')
  })
})
