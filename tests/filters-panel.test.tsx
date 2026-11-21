// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useCallback, useReducer, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IucnCat } from '@/lib/species/iucn'
import type { Regions, SpeciesRow } from '@/lib/species/types'

// How many times each section's list renders, watched: a Timeline drag preview must re-render neither.
const renders = vi.hoisted(() => ({ places: 0, status: 0 }))
vi.mock('@/components/filters/PlacesList', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/filters/PlacesList')>()
  return { ...actual, PlacesList: (p: Parameters<typeof actual.PlacesList>[0]) => { renders.places++; return actual.PlacesList(p) } }
})
vi.mock('@/components/filters/StatusList', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/filters/StatusList')>()
  return { ...actual, StatusList: (p: Parameters<typeof actual.StatusList>[0]) => { renders.status++; return actual.StatusList(p) } }
})

const { CollageView } = await import('@/components/app/CollageView')
const { applyFilter } = await import('@/lib/list/filters')
const { initialState, makeReducer } = await import('@/lib/list/store')
const { emptySaved } = await import('@/lib/list/storage')
const { monthBins } = await import('@/lib/list/timeline')
const { buildSpeciesIndex } = await import('@/lib/species/load')
const { FiltersDock } = await import('./filters-dock')
type FilterSection = import('@/components/filters/Filters').FilterSection

const row = (code: string, ord: string, fam: string, to: number, iu?: IucnCat): SpeciesRow => ({
  code, com: code, sci: `Avis ${code}`, ord, fam, famCom: fam, to, g: 100, gSrc: 'avonet', st: true, ar: 1, q: true, ...(iu ? { iu } : {}),
})
const species = buildSpeciesIndex([
  row('duck1', 'Anseriformes', 'Anatidae', 1, 'LC'),
  row('crow1', 'Passeriformes', 'Corvidae', 3, 'VU'),
  row('owl1', 'Strigiformes', 'Strigidae', 5, 'EN'),
])
const noStatus = buildSpeciesIndex([
  row('duck1', 'Anseriformes', 'Anatidae', 1),
  row('crow1', 'Passeriformes', 'Corvidae', 3),
  row('owl1', 'Strigiformes', 'Strigidae', 5),
])
const regions: Regions = { v: 1, countries: { CA: 'Canada', EG: 'Egypt', US: 'United States of America' }, sub1: { 'CA-BC': 'British Columbia', 'CA-ON': 'Ontario', 'US-WA': 'Washington' } }
const reduce = makeReducer({ species })

// duck1 lifer in Canada, also seen in the US; crow1 lifer in Egypt, also seen in British Columbia; owl1 Ontario only.
function seeded() {
  const saved = emptySaved()
  saved.records.ebird = [
    { code: 'duck1', source: 'ebird', date: '2020-01-01', place: { country: 'CA', sub1: 'CA-BC' }, seen: ['2020-01-01|CA-BC|Capital', '2021-01-01|US-WA|King'] },
    { code: 'crow1', source: 'ebird', date: '2019-01-01', place: { country: 'EG' }, seen: ['2019-01-01|EG', '2022-01-01|CA-BC'] },
    { code: 'owl1', source: 'ebird', date: '2021-01-01', place: { country: 'CA', sub1: 'CA-ON' }, seen: ['2021-01-01|CA-ON'] },
  ]
  return reduce(initialState(), { type: 'restore', saved })
}

type Action = import('@/lib/list/store').Action
// Runs after each dispatch, before React renders it: a test uses it to move the scroll or focus the way a browser would.
let onDispatched: (() => void) | null = null

function Harness({ hide, sp = species }: { hide?: readonly FilterSection[]; sp?: typeof species }) {
  const [state, rawDispatch] = useReducer(reduce, undefined, seeded)
  const dispatch = useCallback((a: Action) => { rawDispatch(a); onDispatched?.() }, [])
  const [previews, setPreviews] = useState(0)
  const onPreview = useCallback(() => setPreviews((n) => n + 1), [])
  const time = { entries: state.list, months: monthBins(state.list, '2022-06').months, today: '2022-06', onPreview }
  const shown = applyFilter(state.list, state.filter, sp, state.seen).length
  return (
    <>
      <FiltersDock state={state} dispatch={dispatch} species={sp} regions={regions} time={time} hide={hide} shown={shown} />
      <button type="button">elsewhere</button>
      <button type="button" onClick={() => dispatch({ type: 'filter', filter: { countries: ['EG', 'US'], provinces: ['CA-BC', 'CA-ON'] } })}>four places</button>
      <button type="button" onClick={() => dispatch({ type: 'filter', filter: { order: 'Passeriformes', family: 'Corvidae', countries: ['EG'], from: '2019-01', to: '2022-06', basis: 'seen', statuses: ['VU'] } })}>everything</button>
      <output data-testid="filter">{JSON.stringify(state.filter)}</output>
      <output data-testid="previews">{previews}</output>
    </>
  )
}
const filterOf = () => JSON.parse(screen.getByTestId('filter').textContent || '{}')
const button = () => screen.getByTestId('filters-button')
const esc = () => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the Filters button and its panel', () => {
  it('one Filters button opens one panel holding Time, Places and Conservation status, in that order', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    expect(button()).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button())
    expect(button()).toHaveAttribute('aria-expanded', 'true')
    const dialog = screen.getByRole('dialog', { name: 'Filters' })
    expect(dialog).not.toHaveAttribute('aria-modal')
    expect(button()).toHaveAttribute('aria-controls', dialog.id)
    expect(within(dialog).getAllByRole('group').filter((g) => g.dataset.sec).map((g) => g.getAttribute('aria-labelledby') && document.getElementById(g.getAttribute('aria-labelledby')!)!.textContent)).toEqual([
      'Time', 'Places', 'Conservation status',
    ])
    const row = dialog.querySelector('.eb-fpanel-row')!
    expect(row).toContainElement(screen.getByTestId('filter-panel-places'))
    expect(row).toContainElement(screen.getByTestId('filter-panel-status'))
    expect(row).not.toContainElement(screen.getByTestId('filter-panel-time'))
    fireEvent.click(button())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the head counts filters and species live; the button says the count and speaks every filter', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(button())
    expect(screen.getByTestId('filters-head')).toHaveTextContent('Filters · 3 species')
    fireEvent.click(screen.getByTestId('continent-AF'))
    expect(screen.getByTestId('filters-head')).toHaveTextContent('Filters · 1 · 1 species')
    expect(button()).toHaveAccessibleName('Filters, 1 in use: Places: Africa')
    fireEvent.click(screen.getByTestId('status-VU'))
    expect(screen.getByTestId('filters-head')).toHaveTextContent('Filters · 2 · 1 species')
    expect(button()).toHaveAccessibleName(/^Filters, 2 in use: /)
  })

  it('Esc and a press outside close the popover; focus returns to the Filters button', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    button().focus()
    fireEvent.click(button())
    expect(screen.getByRole('dialog', { name: 'Filters' })).toContainElement(document.activeElement as HTMLElement)
    esc()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(button()).toHaveFocus()
    fireEvent.click(button())
    fireEvent.pointerDown(screen.getByRole('button', { name: 'elsewhere' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('at phone width: a modal bottom sheet, Tab trapped, the head in place of a title, "Show N species" closes', () => {
    vi.stubGlobal('innerWidth', 390)
    render(<Harness />)
    button().focus()
    fireEvent.click(button())
    const sheet = screen.getByRole('dialog', { name: 'Filters' })
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    expect(sheet.parentElement?.parentElement).toBe(document.body)
    expect(within(sheet).getByTestId('filters-head')).toHaveTextContent('Filters · 3 species')
    expect(sheet.querySelector('.eb-fpanel-row')).toBeNull()
    const show = within(sheet).getByTestId('filters-show')
    expect(show).toHaveTextContent('Show 3 species')
    fireEvent.keyDown(sheet, { key: 'Tab', shiftKey: true })
    expect(show).toHaveFocus()
    fireEvent.keyDown(show, { key: 'Tab' })
    expect(within(sheet).getByRole('button', { name: 'Close' })).toHaveFocus()
    fireEvent.click(show)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(button()).toHaveFocus()
  })

  it('opened from a collapsed chip, focus goes to its section; on close back to that chip', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'four places' }))
    const chip = screen.getByTestId('chip-place-open')
    chip.focus()
    fireEvent.click(chip)
    expect(screen.getByTestId('filter-panel-places')).toHaveFocus()
    esc()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(chip).toHaveFocus()
  })

  it('focus returns to the Filters button when the chip that opened the panel is gone', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'four places' }))
    fireEvent.click(screen.getByTestId('chip-place-open'))
    fireEvent.click(screen.getByTestId('drill-n:NA'))
    fireEvent.click(screen.getByTestId('country-US'))
    expect(screen.queryByTestId('chip-place-open')).toBeNull()
    expect(screen.getByTestId('chip-place-s:CA-BC')).toBeInTheDocument()
    esc()
    expect(button()).toHaveFocus()
  })

  it('hidden sections are left out; all hidden, no button; a list with no statuses has no Status group', () => {
    vi.stubGlobal('innerWidth', 1000)
    const { unmount } = render(<Harness hide={['places', 'time']} />)
    fireEvent.click(button())
    expect(screen.getAllByRole('group').filter((g) => g.dataset.sec).map((g) => g.dataset.sec)).toEqual(['status'])
    unmount()
    const again = render(<Harness hide={['places', 'time', 'status']} />)
    expect(screen.queryByTestId('filters-button')).toBeNull()
    again.unmount()
    render(<Harness sp={noStatus} />)
    fireEvent.click(button())
    expect(screen.queryByRole('group', { name: 'Conservation status' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Places' })).toBeInTheDocument()
  })

  it('a Timeline preview re-renders neither Places nor Status', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(button())
    const before = { ...renders }
    vi.useFakeTimers()
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Start month' }), { key: 'ArrowRight' })
    // The harness re-rendered (the preview reached it), the two lists did not.
    expect(Number(screen.getByTestId('previews').textContent)).toBeGreaterThan(0)
    expect(renders).toEqual(before)
  })
})

describe('the chip row', () => {
  it('× on a single chip removes it; the last one sends focus to the Filters button', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(button())
    fireEvent.click(screen.getByTestId('continent-AF'))
    fireEvent.click(screen.getByTestId('continent-NA'))
    esc()
    const chips = screen.getByTestId('filter-chips')
    expect(within(chips).getAllByRole('button').map((b) => b.dataset.testid).filter((id) => id !== 'chips-clear-all')).toEqual(['chip-place-n:AF', 'chip-place-n:NA'])
    fireEvent.click(screen.getByTestId('chip-place-n:AF'))
    expect(filterOf()).toEqual({ continents: ['NA'] })
    expect(screen.getByTestId('chip-place-n:NA')).toHaveFocus()
    fireEvent.click(screen.getByTestId('chip-place-n:NA'))
    expect(filterOf()).toEqual({})
    expect(screen.queryByTestId('filter-chips')).toBeNull()
    expect(button()).toHaveFocus()
  })

  it('a collapsed chip: its × clears every place and sends focus to the Filters button', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'four places' }))
    expect(screen.getByTestId('chip-place-open')).toHaveTextContent('4 places')
    fireEvent.click(screen.getByTestId('chip-place-clear'))
    expect(filterOf()).toEqual({})
    expect(button()).toHaveFocus()
  })

  it('spec 15: the popover follows the chip row, and a chip press there keeps it open', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(button())
    const dialog = screen.getByRole('dialog', { name: 'Filters' })
    expect(dialog.previousElementSibling).toHaveClass('eb-dock') // no chips: under the dock
    fireEvent.click(screen.getByTestId('continent-AF'))
    expect(screen.getByTestId('filter-chips').nextElementSibling).toBe(dialog)
    expect(dialog.parentElement).toHaveClass('eb-dockwrap')
    fireEvent.pointerDown(screen.getByTestId('chip-place-n:AF'))
    fireEvent.click(screen.getByTestId('chip-place-n:AF'))
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument()
    expect(filterOf()).toEqual({})
    expect(button()).toHaveFocus()
  })
})

describe('spec 15: the content below the panel', () => {
  function View() {
    const [state, dispatch] = useReducer(reduce, undefined, seeded)
    return <CollageView state={state} dispatch={dispatch} species={species} regions={regions} label="Test collage" />
  }

  it('is inert and dimmed from 600px; a press there closes the panel, a chip press does not', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<View />)
    const below = document.querySelector('.eb-view-below')!
    // A taxon picked in the Taxa panel puts the taxonomy path under the dock (round 6).
    fireEvent.click(screen.getByTestId('taxa-button'))
    fireEvent.click(within(screen.getByRole('group', { name: 'Orders' })).getByRole('button', { name: /^Perching birds/ }))
    fireEvent.click(screen.getByTestId('taxa-button'))
    expect(below).not.toHaveAttribute('inert')
    fireEvent.click(button())
    expect(below).toHaveAttribute('inert')
    expect(below).toHaveAttribute('data-dim')
    expect(below).toContainElement(screen.getByTestId('filter-bar'))
    fireEvent.click(screen.getByTestId('continent-AF'))
    fireEvent.pointerDown(screen.getByTestId('chip-place-n:AF'))
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument()
    fireEvent.pointerDown(below.firstElementChild!)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(below).not.toHaveAttribute('inert')
    expect(below).not.toHaveAttribute('data-dim')
  })

  it('on phones the sheet has its own scrim: no dim', () => {
    vi.stubGlobal('innerWidth', 390)
    render(<View />)
    fireEvent.click(button())
    const below = document.querySelector('.eb-view-below')!
    expect(screen.getByRole('dialog', { name: 'Filters' })).toHaveAttribute('aria-modal', 'true')
    expect(below).not.toHaveAttribute('inert')
    expect(below).not.toHaveAttribute('data-dim')
  })

  it('Clear all: hidden with no filter, shown with one, clears every field in one dispatch and keeps focus in the panel', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(button())
    expect(screen.queryByTestId('filters-clear-all')).toBeNull()
    fireEvent.click(screen.getByTestId('status-VU'))
    const clear = screen.getByTestId('filters-clear-all')
    expect(clear).toHaveTextContent('Clear all')
    expect(clear).toHaveAccessibleName('Clear all filters')
    expect(within(screen.getByRole('dialog', { name: 'Filters' })).getByTestId('filters-head')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'everything' }))
    const before = filterOf()
    expect(before.order).toBe('Passeriformes')
    expect(before.statuses).toEqual(['VU'])
    fireEvent.click(screen.getByTestId('filters-clear-all'))
    expect(filterOf()).toEqual({})
    expect(screen.queryByTestId('filters-clear-all')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Filters' })).toHaveFocus()
  })

  it('Clear all sits in the sheet head on phones', () => {
    vi.stubGlobal('innerWidth', 390)
    render(<Harness />)
    fireEvent.click(button())
    const sheet = screen.getByRole('dialog', { name: 'Filters' })
    expect(within(sheet).queryByTestId('filters-clear-all')).toBeNull()
    fireEvent.click(within(sheet).getByTestId('status-VU'))
    const clear = within(sheet).getByTestId('filters-clear-all')
    expect(clear.closest('.eb-sheet-head')).not.toBeNull()
    fireEvent.click(clear)
    expect(filterOf()).toEqual({})
  })

  it('the chip row\'s Clear all clears every filter, as the panel\'s does, and focuses the Filters button', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'everything' }))
    fireEvent.click(screen.getByTestId('chips-clear-all'))
    expect(filterOf()).toEqual({})
    expect(screen.queryByTestId('chips-clear-all')).toBeNull()
    expect(button()).toHaveFocus()
  })
})

describe('a filter change keeps the place: scroll, panel scrollers and focus', () => {
  let scrollTo: ReturnType<typeof vi.spyOn>
  let intoView: ReturnType<typeof vi.fn>
  // Places checkboxes and the Conservation status checkboxes, ticked and unticked with the panel open.
  const tick = (testId: string) => {
    const cb = screen.getByTestId(testId) as HTMLInputElement
    act(() => cb.focus())
    fireEvent.click(cb)
    expect(cb).toHaveFocus()
    return cb
  }

  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1000)
    intoView = vi.fn()
    Element.prototype.scrollIntoView = intoView as unknown as Element['scrollIntoView'] // jsdom has none
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(((_x: number, y: number) => { window.scrollY = y }) as typeof window.scrollTo)
    window.scrollY = 0
  })
  afterEach(() => {
    onDispatched = null
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    scrollTo.mockRestore()
    window.scrollY = 0
  })

  it('ticking, unticking and × keep the panel node, make no scroll call and keep the focus on the control', () => {
    render(<Harness />)
    fireEvent.click(button())
    const panel = screen.getByTestId('filters-panel')
    intoView.mockClear()
    scrollTo.mockClear()

    tick('continent-NA')
    expect(filterOf()).toEqual({ continents: ['NA'] })
    tick('continent-NA')
    expect(filterOf()).toEqual({})
    tick('status-VU')
    tick('status-VU')
    tick('continent-NA')
    expect(screen.getByTestId('chip-place-n:NA')).toBeInTheDocument()
    expect(screen.getByTestId('filters-panel')).toBe(panel)

    // × on a chip: the chip now at its index takes focus (ChipRow), not the scroll.
    tick('status-VU')
    fireEvent.click(screen.getByTestId('chip-place-n:NA'))
    expect(screen.getByTestId('chip-status-VU')).toHaveFocus()
    expect(screen.getByTestId('filters-panel')).toBe(panel)
    expect(filterOf()).toEqual({ statuses: ['VU'] })

    expect(scrollTo).not.toHaveBeenCalled()
    expect(intoView).not.toHaveBeenCalled()
  })

  it('a change that shrinks the window scroll puts it back', () => {
    render(<Harness />)
    fireEvent.click(button())
    window.scrollY = 300
    onDispatched = () => { window.scrollY = 0 } // the page shorter for a moment: the browser clamps
    tick('continent-NA')
    expect(scrollTo).toHaveBeenCalledWith(0, 300)
    expect(window.scrollY).toBe(300)
  })

  it('each column ends with its one scroller, so a squeezed column never runs under another part (CSS: filters.css)', () => {
    render(<Harness />)
    fireEvent.click(button())
    const places = screen.getByTestId('filter-panel-places')
    const scroll = places.querySelectorAll<HTMLElement>('.eb-places-scroll')
    expect(scroll).toHaveLength(1)
    expect(scroll[0].parentElement!.lastElementChild).toBe(scroll[0])
    expect(places.lastElementChild).toBe(scroll[0].closest('.eb-places'))
    expect(within(places).queryByRole('switch')).toBeNull()
    const status = screen.getByTestId('filter-panel-status')
    expect(status.lastElementChild!.lastElementChild).toHaveClass('eb-checklist')
  })

  it('a popover scroller (the Places list and the panel body) is put back to its position', () => {
    render(<Harness />)
    fireEvent.click(button())
    const panel = screen.getByTestId('filters-panel')
    const body = panel.querySelector<HTMLElement>('.eb-drop-body')!
    const list = panel.querySelector<HTMLElement>('.eb-places-scroll')!
    body.scrollTop = 120
    list.scrollTop = 80
    onDispatched = () => { body.scrollTop = 0; list.scrollTop = 0 }
    tick('continent-NA')
    expect(body.scrollTop).toBe(120)
    expect(list.scrollTop).toBe(80)
  })

  it('focus lost to the body in a change comes back to the control that was focused', () => {
    render(<Harness />)
    fireEvent.click(button())
    onDispatched = () => (document.activeElement as HTMLElement).blur()
    const cb = tick('status-VU')
    expect(cb).toHaveFocus()
    expect(filterOf()).toEqual({ statuses: ['VU'] })
  })

  it('a change with the panel closed takes no snapshot and moves nothing', () => {
    render(<Harness />)
    window.scrollY = 300
    onDispatched = () => { window.scrollY = 0 }
    fireEvent.click(screen.getByRole('button', { name: 'four places' }))
    expect(scrollTo).not.toHaveBeenCalled()
    expect(window.scrollY).toBe(0)
  })
})

describe('the collage column while the panel is open', () => {
  function Column() {
    const [state, dispatch] = useReducer(reduce, undefined, seeded)
    return <CollageView state={state} dispatch={dispatch} species={species} regions={regions} label="Test collage" />
  }

  it('is frozen at its height from open to close (popover and phone sheet alike)', () => {
    for (const width of [1000, 390]) {
      vi.stubGlobal('innerWidth', width)
      const { unmount } = render(<Column />)
      const section = document.querySelector<HTMLElement>('.eb-view')!
      vi.spyOn(section, 'getBoundingClientRect').mockReturnValue({ height: 640 } as DOMRect)
      expect(section.style.minHeight).toBe('')
      fireEvent.click(button())
      expect(section.style.minHeight).toBe('640px')
      esc()
      expect(section.style.minHeight).toBe('')
      unmount()
    }
  })
})
