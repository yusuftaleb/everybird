// @vitest-environment jsdom
// The controls bar (view tabs, the list's direction and Scientific in the bar, the Taxa, Display and Filters panels,
// round 6), Scientific names and the search, on the shared CollageView. jsdom has no layout worker, so the collage shows its placeholder; the stats line, the list view
// and the card carry what is shown.
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useReducer } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CollageView } from '@/components/app/CollageView'
import { TREE_MINE_KEY, TREE_TIME_KEY } from '@/lib/tree-mine'
import { ARRANGEMENT_KEY, setArrangement } from '@/lib/arrangement'
import type { SourceRecord } from '@/lib/list/model'
import { emptySaved } from '@/lib/list/storage'
import { initialState, makeReducer, type AppState } from '@/lib/list/store'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { fmt } from '@/i18n/core'
import { es } from '@/i18n/messages/es'
import { withI18n } from './i18n-render'

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
const reduce = makeReducer({ species })

function seeded(): AppState {
  const saved = emptySaved()
  saved.records.ebird = [rec('snogoo', '2020-01-02'), rec('norfli', '2021-03-04'), rec('gilfli', '2022-05-06'), rec('amerob', '2023-07-08'), rec('yerwar', '2024-09-10')]
  return reduce(initialState(), { type: 'restore', saved })
}

function Harness({ init = seeded }: { init?: () => AppState }) {
  const [state, dispatch] = useReducer(reduce, undefined, init)
  return <CollageView state={state} dispatch={dispatch} species={species} regions={regions} label="Test collage" />
}
/** The same list with the robin heard only: the legend's marks key shows. */
function seededMarked(): AppState {
  const saved = emptySaved()
  saved.records.ebird = [rec('snogoo', '2020-01-02'), rec('norfli', '2021-03-04'), rec('gilfli', '2022-05-06'), { ...rec('amerob', '2023-07-08'), heard: true }, rec('yerwar', '2024-09-10')]
  return reduce(initialState(), { type: 'restore', saved })
}

const stats = () => screen.getByTestId('collage-stats')
// Round 6: the taxonomy chips and the view's switches live in the bar's Taxa and Display panels.
const openTaxa = () => fireEvent.click(screen.getByTestId('taxa-button'))
const openDisplay = () => fireEvent.click(screen.getByTestId('display-button'))
const pickOrder = (name: RegExp) => {
  if (!screen.queryByTestId('taxa-panel')) openTaxa()
  fireEvent.click(within(screen.getByRole('group', { name: 'Orders' })).getByRole('button', { name }))
}

// Node 25+ has its own unconfigured localStorage that shadows jsdom's.
class MemoryStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}
beforeEach(() => {
  vi.stubGlobal('innerWidth', 1024)
  vi.stubGlobal('localStorage', new MemoryStorage())
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('controls bar', () => {
  it('the legend reads heard only and found dead, with no photo-or-recording mark, only when a bird shown carries a mark', () => {
    render(<Harness />)
    expect(screen.queryByTestId('legend-marks')).toBeNull()
    cleanup()
    const { container } = render(<Harness init={seededMarked} />)
    expect(container).toHaveTextContent('* heard only · † found dead')
    expect(container).not.toHaveTextContent('◦')
    expect(container).not.toHaveTextContent(/photo or recording/i)
  })
  it('has the Collage and List tabs; True size and Scientific in the Collage\'s Display panel; the direction and Scientific in the List\'s bar', () => {
    render(<Harness />)
    const view = screen.getByRole('group', { name: 'View' })
    expect(within(view).getByRole('button', { name: 'Collage' })).toHaveAttribute('aria-pressed', 'true')
    // Collage: no switch in the bar; the Display panel holds them.
    expect(screen.queryAllByRole('switch')).toEqual([])
    openDisplay()
    const panel = screen.getByRole('dialog', { name: 'Display options' })
    expect(within(panel).getByRole('switch', { name: 'True size' })).toHaveAttribute('aria-checked', 'false')
    expect(within(panel).getByRole('switch', { name: 'Scientific names' })).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(within(view).getByRole('button', { name: 'List' }))
    expect(screen.queryByRole('switch', { name: /True size/ })).toBeNull()
    expect(screen.queryByTestId('display-button')).toBeNull()
    expect(screen.queryByTestId('display-panel')).toBeNull()
    expect(screen.getByTestId('dock-sci')).toHaveAccessibleName(/^Scientific.*names$/) // jsdom reads the short label too
    // The default is Newest first; the rest of the five are in the menu.
    const sort = screen.getByRole('button', { name: 'Sort: Newest first' })
    expect(sort).toHaveTextContent('Newest first')
    expect(sort).toHaveAttribute('aria-haspopup', 'menu')
    // Scientific sits before the sort (round 6 polish).
    expect(screen.getByTestId('dock-sci').compareDocumentPosition(sort) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const rowNames = () => [...document.querySelectorAll('.eb-lrow .eb-row-primary')].map((el) => el.textContent)
    expect(rowNames()).toEqual(['Yellow-rumped Warbler', 'American Robin', 'Gilded Flicker', 'Northern Flicker', 'Snow Goose'])
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull() // headings only in Family
    fireEvent.click(sort)
    const menu = screen.getByRole('menu', { name: 'Sort' })
    const items = within(menu).getAllByRole('menuitemradio')
    expect(items.map((i) => i.textContent)).toEqual(['Family', 'Newest first', 'Oldest first', 'Heaviest first', 'Lightest first'])
    expect(items[1]).toHaveAttribute('aria-checked', 'true')
    expect(items[1]).toHaveFocus()
    fireEvent.keyDown(items[1], { key: 'ArrowDown' })
    fireEvent.keyDown(items[2], { key: 'ArrowDown' })
    expect(items[3]).toHaveFocus()
    fireEvent.click(items[3])
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'Sort: Heaviest first' })).toHaveFocus()
    expect(rowNames()[0]).toBe('Snow Goose')
    // Escape closes the menu without a change and gives the button its focus back.
    fireEvent.keyDown(screen.getByTestId('dock-sort'), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByTestId('dock-sort')).toHaveFocus()
    expect(screen.getByTestId('dock-sort')).toHaveAccessibleName('Sort: Heaviest first')
    // Family: taxonomic order under one heading per family, named as the Tree's rows, with its count on the list.
    fireEvent.click(screen.getByTestId('dock-sort'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Family' }))
    expect(rowNames()).toEqual(['Snow Goose', 'Northern Flicker', 'Gilded Flicker', 'American Robin', 'Yellow-rumped Warbler'])
    const heads = screen.getAllByRole('heading', { level: 2 })
    expect(heads.map((h) => h.querySelector('.eb-lhead-name')!.textContent)).toEqual(['Ducks, Geese, and Waterfowl', 'Woodpeckers', 'Thrushes', 'New World Warblers'])
    expect(heads.map((h) => h.querySelector('.eb-lhead-count')!.textContent)).toEqual(['1', '2', '1', '1'])
    expect(heads[1]).toHaveAccessibleName('Woodpeckers, 2 species')
    // The Scientific switch names the families as the Tree does.
    fireEvent.click(screen.getByTestId('dock-sci'))
    const sciHead = screen.getAllByRole('heading', { level: 2 })[1].querySelector('.eb-lhead-name')!
    expect(sciHead).toHaveTextContent('Picidae')
    expect(sciHead).toHaveAttribute('lang', 'la')
    fireEvent.click(screen.getByTestId('dock-sci'))
  })
})

describe('the bar: one press per switch, each only in its view', () => {
  it('Map has no switch in the bar (nothing on it reads Scientific names); Tree\'s Display panel shows Lifers only, held on the device, Time scale and Scientific; no Style, Share or Compare in the bar', () => {
    render(<Harness />)
    const view = screen.getByRole('group', { name: 'View' })
    expect(screen.queryByRole('button', { name: 'Style' })).toBeNull()
    expect(screen.queryByTestId('share-open')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Compare' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Lifers only' })).toBeNull()
    const sci = () => screen.getByRole('switch', { name: /^Scientific/ })
    openDisplay()
    fireEvent.click(sci())
    openDisplay() // closed again
    fireEvent.click(within(view).getByRole('button', { name: 'Map' }))
    // The Map's bar holds no switch and no Display panel; the setting is kept for the other views.
    expect(screen.queryByTestId('display-button')).toBeNull()
    expect(screen.queryAllByRole('switch')).toEqual([])
    expect(screen.queryByTestId('dock-sci')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Sorted by body mass/ })).toBeNull()
    fireEvent.click(within(view).getByRole('button', { name: 'List' }))
    expect(sci()).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(view).getByRole('button', { name: 'Tree' }))
    // In the tree the bar holds no switch; its Display panel does.
    expect(screen.queryAllByRole('switch')).toEqual([])
    openDisplay()
    const mine = screen.getByRole('switch', { name: 'Lifers only' })
    // No True size in the tree; Scientific is there, since the tree shows one name by it.
    // Round 6: Time scale beside them, on by default, held on the device ('0' when off).
    const time = screen.getByRole('switch', { name: 'Time scale' })
    expect(screen.getAllByRole('switch')).toEqual([mine, time, screen.getByRole('switch', { name: 'Scientific names' })])
    expect(time).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(time)
    expect(time).toHaveAttribute('aria-checked', 'false')
    expect(localStorage.getItem(TREE_TIME_KEY)).toBe('0')
    fireEvent.click(time)
    expect(localStorage.getItem(TREE_TIME_KEY)).toBeNull()
    expect(mine).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(mine)
    expect(mine).toHaveAttribute('aria-checked', 'true')
    expect(localStorage.getItem(TREE_MINE_KEY)).toBe('1')
    fireEvent.click(mine)
    expect(localStorage.getItem(TREE_MINE_KEY)).toBeNull()
  })
})

// Round 6 (Yusuf, 2026-11-20): Fit or Oval in the Collage's Display panel, the share dialog's setting (arrangement.ts).
describe('the Arrangement choice', () => {
  afterEach(() => { setArrangement('packed') })
  it('in the Collage\'s Display panel only, first, a labelled segmented group of two icons; one setting with the share dialog', () => {
    render(<Harness />)
    const view = screen.getByRole('group', { name: 'View' })
    expect(screen.queryByTestId('dock-arrange')).toBeNull() // not in the bar
    openDisplay()
    const group = () => screen.getByTestId('dock-arrange')
    expect(group()).toHaveAttribute('role', 'group')
    expect(group()).toHaveAccessibleName('Arrangement')
    const btn = (name: string) => within(group()).getByRole('button', { name })
    // Three small icons, no words: each segment named and titled "Fit" / "Oval" / "Free".
    expect(within(group()).getAllByRole('button').map((b) => [b.textContent, b.getAttribute('title')])).toEqual([['', 'Fit'], ['', 'Oval'], ['', 'Free']])
    // The oval is an ellipse wider than tall, not Phosphor's circle.
    const ellipse = btn('Oval').querySelector('svg ellipse')!
    expect(Number(ellipse.getAttribute('rx'))).toBeGreaterThan(Number(ellipse.getAttribute('ry')))
    expect(btn('Fit')).toHaveAttribute('aria-pressed', 'true')
    expect(btn('Fit').querySelector('svg')).not.toBeNull()
    // Its place: before the panel's switches.
    const trueSize = screen.getByTestId('dock-true')
    expect(group().compareDocumentPosition(trueSize) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(btn('Oval'))
    expect(btn('Oval')).toHaveAttribute('aria-pressed', 'true')
    expect(btn('Fit')).toHaveAttribute('aria-pressed', 'false')
    expect(localStorage.getItem(ARRANGEMENT_KEY)).toBe('oval')
    // The share dialog's row sets the same store: the panel follows.
    act(() => setArrangement('packed'))
    expect(btn('Fit')).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem(ARRANGEMENT_KEY)).toBeNull()
    // Not in List, Map or Tree.
    for (const v of ['List', 'Map', 'Tree']) {
      fireEvent.click(within(view).getByRole('button', { name: v }))
      if (screen.queryByTestId('display-button') && !screen.queryByTestId('display-panel')) openDisplay()
      expect(screen.queryByTestId('dock-arrange')).toBeNull()
    }
  })
})

describe('the bar\'s panels (round 6)', () => {
  it('Taxa, Display and Filters after the view tabs, before the magnifier; one panel open at a time; Esc and a second press close it, focus back on its button', async () => {
    render(<Harness />)
    const taxa = screen.getByTestId('taxa-button'), display = screen.getByTestId('display-button'), filters = screen.getByTestId('filters-button')
    const view = screen.getByRole('group', { name: 'View' }), find = screen.getByRole('button', { name: 'Find a bird' })
    for (const [a, b] of [[view, taxa], [taxa, display], [display, filters], [filters, find]]) expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(taxa).toHaveAccessibleName('Taxa')
    expect(display).toHaveAccessibleName('Display')
    fireEvent.click(taxa)
    expect(screen.getByRole('dialog', { name: 'Orders, families and genera' })).toBe(screen.getByTestId('taxa-panel'))
    expect(taxa).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(display)
    expect(screen.queryByTestId('taxa-panel')).toBeNull()
    expect(screen.getByTestId('display-panel')).toBeInTheDocument()
    fireEvent.click(filters)
    expect(screen.queryByTestId('display-panel')).toBeNull()
    expect(screen.getByTestId('filters-panel')).toBeInTheDocument()
    fireEvent.click(taxa)
    expect(screen.queryByTestId('filters-panel')).toBeNull()
    expect(screen.getByTestId('taxa-panel')).toBeInTheDocument()
    fireEvent.click(taxa)
    expect(screen.queryByTestId('taxa-panel')).toBeNull()
    fireEvent.click(display)
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(screen.queryByTestId('display-panel')).toBeNull()
    await waitFor(() => expect(display).toHaveFocus())
  })

  it('a chip picked in the Taxa panel filters, keeps the panel open, marks the button and leaves only the breadcrumb on the page', () => {
    render(<Harness />)
    expect(screen.queryByTestId('filter-bar')).toBeNull() // nothing under the dock with no taxon picked
    expect(screen.getByTestId('taxa-button')).not.toHaveAttribute('data-active')
    pickOrder(/^Woodpeckers/)
    expect(screen.getByTestId('taxa-panel')).toBeInTheDocument()
    expect(stats()).toHaveTextContent(/^2 of 5 species/)
    expect(screen.getByTestId('taxa-button')).toHaveAttribute('data-active') // Accent, no count
    expect(screen.getByTestId('taxa-button')).toHaveTextContent(/^Taxa$/)
    expect(screen.getByTestId('taxa-button')).toHaveAccessibleName('Taxa: Woodpeckers')
    fireEvent.click(screen.getByTestId('taxa-button'))
    const bar = screen.getByTestId('filter-bar')
    expect(bar).toHaveTextContent('All birds/Woodpeckers')
    expect(within(bar).queryByRole('group')).toBeNull() // no chips on the page
  })

  it('a press outside the dock closes the open panel', () => {
    render(<Harness />)
    openDisplay()
    fireEvent.pointerDown(screen.getByTestId('collage-stats'))
    expect(screen.queryByTestId('display-panel')).toBeNull()
  })
})

// Round 6 polish: choosing anything never scrolls the page or moves an open panel.
describe('one open thing in the dock at a time (round 6)', () => {
  const toList = () => fireEvent.click(within(screen.getByRole('group', { name: 'View' })).getByRole('button', { name: 'List' }))
  it("the List's sort menu closes the open panel as it opens, by press or by key", () => {
    render(<Harness />)
    toList()
    openTaxa()
    expect(screen.getByTestId('taxa-panel')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('dock-sort'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.queryByTestId('taxa-panel')).toBeNull()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    fireEvent.click(screen.getByTestId('filters-button'))
    expect(screen.getByTestId('filters-panel')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByTestId('dock-sort'), { key: 'ArrowDown' })
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.queryByTestId('filters-panel')).toBeNull()
  })
  it('opening a panel closes the sort menu; so does opening the search', () => {
    render(<Harness />)
    toList()
    for (const open of [openTaxa, () => fireEvent.click(screen.getByTestId('filters-button'))]) {
      fireEvent.click(screen.getByTestId('dock-sort'))
      expect(screen.getByRole('menu')).toBeInTheDocument()
      open()
      expect(screen.queryByRole('menu')).toBeNull()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      fireEvent.keyDown(document, { key: 'Escape' })
    }
    fireEvent.click(screen.getByTestId('dock-sort'))
    fireEvent.click(screen.getByRole('button', { name: 'Find a bird' }))
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('nothing moves when something is chosen', () => {
  const proto = HTMLElement.prototype
  const offsetHeight = Object.getOwnPropertyDescriptor(proto, 'offsetHeight')!
  afterEach(() => { Object.defineProperty(proto, 'offsetHeight', offsetHeight); vi.restoreAllMocks() })

  it("every panel's top is the dock's bottom edge, whatever the chip row below the dock holds", () => {
    // The dock 50px tall, everything else (the chip row included) 30px.
    Object.defineProperty(proto, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return this.classList.contains('eb-dock') ? 50 : 30 } })
    render(<Harness />)
    fireEvent.click(screen.getByTestId('filters-button'))
    const panel = () => screen.getByTestId('filters-panel')
    expect(panel().style.getPropertyValue('--dock-bottom')).toBe('50px')
    fireEvent.click(screen.getAllByRole('checkbox')[0]) // a place: a chip appears under the dock
    expect(screen.getByTestId('filter-chips')).toBeInTheDocument()
    expect(panel().style.getPropertyValue('--dock-bottom')).toBe('50px')
    fireEvent.keyDown(document, { key: 'Escape' })
    for (const open of [openTaxa, openDisplay]) {
      open()
      expect(document.querySelector<HTMLElement>('.eb-drop')!.style.getPropertyValue('--dock-bottom')).toBe('50px')
      fireEvent.keyDown(document, { key: 'Escape' })
    }
  })

  it('choosing (a place, its chip removed, a taxon, a switch, a sort) moves focus only with preventScroll', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    render(<Harness />)
    fireEvent.click(screen.getByTestId('filters-button'))
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(within(screen.getByTestId('filter-chips')).getAllByRole('button')[0]) // the last chip: focus goes back to Filters
    pickOrder(/^Woodpeckers/)
    fireEvent.keyDown(document, { key: 'Escape' })
    openDisplay()
    fireEvent.click(screen.getByTestId('dock-true'))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(within(screen.getByRole('group', { name: 'View' })).getByRole('button', { name: 'List' }))
    fireEvent.click(screen.getByTestId('dock-sort'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Family' }))
    expect(focus.mock.calls.length).toBeGreaterThan(0)
    expect(focus.mock.calls.filter(([o]) => !o?.preventScroll)).toEqual([])
  })
})

describe('Filters and the search', () => {
  it('opening the search closes the Filters popover (the magnifier press and the keyboard both)', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('filters-button'))
    expect(screen.getByTestId('filters-panel')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Find a bird' }))
    expect(screen.queryByTestId('filters-panel')).toBeNull()
  })
})

describe('Scientific names', () => {
  it('lead in list rows, the card, the order chips and the breadcrumb, in italics marked as Latin', () => {
    render(<Harness />)
    openDisplay()
    fireEvent.click(screen.getByRole('switch', { name: /Scientific/ }))
    expect(screen.getByRole('switch', { name: /Scientific/ })).toHaveAttribute('aria-checked', 'true')
    // Order chips (the Taxa panel's): the order's scientific name.
    openTaxa()
    const orders = screen.getByRole('group', { name: 'Orders' })
    const chip = within(orders).getByRole('button', { name: /^Piciformes/ })
    expect(chip).toHaveAttribute('lang', 'la')
    fireEvent.click(chip)
    expect(screen.getByTestId('taxa-button')).toHaveAccessibleName('Taxa: Piciformes')
    fireEvent.click(screen.getByTestId('taxa-button'))
    expect(screen.getByRole('navigation', { name: 'Filter by group' })).toHaveTextContent('All birds/Piciformes')
    // List rows: scientific first, common second.
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    const li = screen.getAllByRole('listitem').find((el) => el.querySelector('[data-code="norfli"]'))!
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

  it('the legend\'s latest lifer is a button that finds the bird, as a search pick does', async () => {
    render(<Harness />)
    fireEvent.click(within(screen.getByRole('group', { name: 'View' })).getByRole('button', { name: 'List' }))
    const latest = screen.getByTestId('legend-latest')
    expect(latest).toHaveTextContent('Latest: Yellow-rumped Warbler, Sep 2024')
    fireEvent.click(latest)
    expect(within(screen.getByRole('list', { name: 'Life list' })).getByRole('button', { name: /Yellow-rumped Warbler/ })).toHaveFocus()
  })

  it('open and empty, the drop says what the search understands; the first keystroke takes the line away', async () => {
    render(<Harness />)
    open()
    expect(screen.getByTestId('search-hint')).toHaveTextContent('Try a name, a group, a place or a year: raptors in Kenya 2024')
    expect(box()).toHaveAttribute('aria-describedby', screen.getByTestId('search-hint').id)
    await find('r')
    expect(screen.queryByTestId('search-hint')).toBeNull()
    expect(box()).not.toHaveAttribute('aria-describedby')
  })

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
    pickOrder(/^Woodpeckers/)
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
    pickOrder(/^Woodpeckers/)
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
    pickOrder(/^Woodpeckers/)
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
    pickOrder(/^Woodpeckers/)
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
    pickOrder(/^Woodpeckers/)
    fireEvent.click(screen.getByRole('button', { name: 'Find a bird' }))
    await act(async () => { fireEvent.change(screen.getByRole('combobox', { name: 'Find a bird' }), { target: { value: 'robin' } }) })
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /American Robin/ }))
    await waitFor(() => expect(stats()).toHaveTextContent(/^5 species/))
    pickOrder(/^Waterfowl/)
    await act(async () => { await new Promise((r) => setTimeout(r, 1200)) })
    expect(screen.queryByTestId('bird-tip')).toBeNull()
  })
})

describe('in Spanish', () => {
  it('Taxones, Aspecto (Tamaño real, Nombres científicos), the view tabs, the magnifier and the stats line; Científico in the List\'s bar', () => {
    render(<Harness />, { wrapper: withI18n('es') })
    expect(screen.getByTestId('taxa-button')).toHaveAccessibleName('Taxones')
    fireEvent.click(screen.getByTestId('taxa-button'))
    expect(screen.getByRole('dialog', { name: 'Órdenes, familias y géneros' })).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('display-button'))
    expect(screen.getByRole('dialog', { name: 'Opciones de aspecto' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /^Tamaño real/ })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: 'Nombres científicos' })).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('display-button'))
    const view = screen.getByRole('group', { name: 'Vista' })
    fireEvent.click(within(view).getByRole('button', { name: 'Lista' }))
    expect(screen.getByRole('switch', { name: /^Científico/ })).toBeInTheDocument()
    fireEvent.click(within(view).getByRole('button', { name: 'Collage' }))
    expect(within(view).getByRole('button', { name: 'Lista' })).toBeInTheDocument()
    expect(stats()).toHaveTextContent('5 especies · 3 órdenes · 4 familias · desde ene 2020')
    const find = screen.getByRole('button', { name: 'Buscar un ave' })
    fireEvent.click(find)
    const field = screen.getByRole('combobox', { name: 'Buscar un ave' })
    expect(field).toHaveAttribute('placeholder', 'Buscar un ave')
    fireEvent.change(field, { target: { value: 'zzz' } })
    expect(screen.getByRole('listbox', { name: 'Aves y grupos que coinciden' })).toHaveTextContent(fmt(es.ui.collage.search.noneThis, { q: 'zzz' }))
    expect(screen.getByRole('button', { name: 'Cerrar la búsqueda' })).toBeInTheDocument()
  })
  it('the legend in Spanish', () => {
    const { container } = render(<Harness init={seededMarked} />, { wrapper: withI18n('es') })
    expect(container.querySelector('.eb-legend')).toHaveTextContent('* solo oída · † encontrada muerta')
    expect(container.querySelector('.eb-legend')).toHaveTextContent('Los tamaños siguen la masa corporal, equilibrados para que las aves pequeñas se vean')
  })
})

describe('lifer marks (removed)', () => {
  it('the bar has no lifer-mark switches', () => {
    render(<Harness />)
    expect(screen.queryByRole('switch', { name: 'Mark latest lifer' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Mark first lifer' })).toBeNull()
  })

  it('an old stored mark loads without error and rings nothing', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1024, bottom: 400, width: 1024, height: 400, toJSON: () => ({}) })
    const seed = [{ key: 'wide|even|', layout: 'wide' as const, mode: 'even' as const, W: 1000, H: 400, scale: 1, base: 10,
      boxes: new Map([['snogoo', [10, 10, 80, 60]], ['norfli', [200, 10, 40, 30]], ['gilfli', [300, 10, 40, 30]], ['amerob', [400, 200, 40, 30]], ['yerwar', [500, 200, 20, 15]]] as [string, [number, number, number, number]][]) }]
    function SeededCollage() {
      const [state, dispatch] = useReducer(reduce, undefined, seeded)
      return <CollageView state={state} dispatch={dispatch} species={species} regions={regions} label="Test collage" seed={seed} />
    }
    try {
      // An old device setting from when the marks existed: read by nothing now, and drawn nowhere.
      localStorage.setItem('everybird:mark-newest', '1')
      localStorage.setItem('everybird:mark-first', '1')
      render(<SeededCollage />)
      const stage = await screen.findByTestId('collage-stage')
      expect(stage.querySelector('[data-mark]')).toBeNull()
      expect(stage.querySelector('.eb-bird[data-code="yerwar"]')).toHaveAttribute('aria-label', 'Yellow-rumped Warbler')
    } finally {
      vi.restoreAllMocks()
    }
  })
})
