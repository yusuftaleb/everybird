// @vitest-environment jsdom
// The Map view: its counts are the Places panel's, a bird seen in two countries counts in both, a press on a place sets
// the filter its checkbox sets, and the drilled list switches the map to that country's provinces.
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useReducer } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Regions, SpeciesRow } from '@/lib/species/types'

const square = 'M0 0h2v2h-2z'
const world = { v: 1, w: 10, h: 10, d: { CA: square, US: square, KE: square, BR: square } }
const provinces: { v: 1; groups: Record<string, { w: number; h: number; d: Record<string, string> }> } = { v: 1, groups: { CA: { w: 10, h: 10, d: { 'CA-BC': square, 'CA-ON': square } } } }
vi.mock('@/lib/data-url', () => ({
  fetchData: async (name: string) => (name === 'map-countries.v1.json' ? world : provinces),
}))

const { MapView } = await import('@/components/collage/MapView')
const { placeCountsFor } = await import('@/components/filters/places-shared')
const { countryRows, placeRows, togglePlace } = await import('@/lib/list/filters')
const { mapGroupOf, mapShapes, shadeStep } = await import('@/lib/map/shapes')
const { initialState, makeReducer } = await import('@/lib/list/store')
const { emptySaved } = await import('@/lib/list/storage')
const { buildSpeciesIndex } = await import('@/lib/species/load')
const { resolveImportedPlace } = await import('@/lib/places/registry')
const { SeenAgg } = await import('@/lib/list/seen')

const row = (code: string): SpeciesRow => ({ code, com: code, sci: `Avis ${code}`, ord: 'Passeriformes', fam: 'Corvidae', famCom: 'Corvidae', to: 1, g: 100, gSrc: 'avonet', st: true, ar: 1, q: true })
const species = buildSpeciesIndex([row('duck1'), row('crow1'), row('owl1')])
const regions: Regions = { v: 1, countries: { CA: 'Canada', US: 'United States', KE: 'Kenya', BR: 'Brazil' }, sub1: { 'CA-BC': 'British Columbia', 'CA-ON': 'Ontario', 'US-WA': 'Washington' } }
const reduce = makeReducer({ species })

// duck1 seen in British Columbia and Washington; crow1 in Ontario; owl1 in Kenya. Nothing in Brazil.
function start() {
  const saved = emptySaved()
  saved.records.ebird = [
    { code: 'duck1', source: 'ebird', date: '2019-01-01', place: { country: 'CA', sub1: 'CA-BC' }, seen: ['2019-01-01|CA-BC', '2020-05-01|US-WA'] },
    { code: 'crow1', source: 'ebird', date: '2021-01-01', place: { country: 'CA', sub1: 'CA-ON' }, seen: ['2021-01-01|CA-ON'] },
    { code: 'owl1', source: 'ebird', date: '2022-01-01', place: { country: 'KE' }, seen: ['2022-01-01|KE'] },
  ]
  return reduce(initialState(), { type: 'restore', saved })
}

function Harness({ init = start }: { init?: typeof start }) {
  const [state, dispatch] = useReducer(reduce, undefined, init)
  return (
    <>
      <MapView state={state} species={species} regions={regions} onFilter={(f) => dispatch({ type: 'filter', filter: f })} />
      <output data-testid="filter">{JSON.stringify(state.filter)}</output>
    </>
  )
}
const filterOf = () => JSON.parse(screen.getByTestId('filter').textContent || '{}')
const shape = (key: string) => document.querySelector<SVGPathElement>(`path[data-key="${key}"]`)!
afterEach(cleanup)

describe('the map counts', () => {
  const state = start()
  const counts = placeCountsFor(state, species)
  const label = (k: string) => k

  it('each country and province counts what the Places panel lists for it', () => {
    const panel = new Map(countryRows(counts, label).map((r) => [r.value, r.count]))
    for (const s of mapShapes(world, counts, new Set())) expect(s.n).toBe(panel.get(s.key) ?? 0)
    const panelCa = new Map(placeRows(counts, 'c:CA', label).map((r) => [r.value, r.count]))
    for (const s of mapShapes(provinces.groups.CA, counts, new Set(), 'CA')) expect(s.n).toBe(panelCa.get(s.key))
  })

  it('a bird seen in two countries counts in both', () => {
    const n = Object.fromEntries(mapShapes(world, counts, new Set()).map((s) => [s.key, s.n]))
    expect(n).toEqual({ 'c:CA': 2, 'c:US': 1, 'c:KE': 1, 'c:BR': 0 })
  })

  it("a province stored under eBird's own code (no shared region) lights that code's shape, under the counted key", () => {
    // Quebec in eBird's catalogue with no equivalent: the import keeps a reference key ("CA-SRC…"), as for eBird's FR-GES or JP-38.
    const tables: Regions = { ...regions, registry: { v: 1, catalogues: { ebird: { edition: '2026', entries: { 'CA-QC': ['CA', 'Quebec'] } } } } }
    const place = resolveImportedPlace({ namespace: 'ebird', id: 'CA-QC', country: 'CA' }, tables)!
    expect(place.sub1).toMatch(/^CA-SRC/)
    const saved = emptySaved()
    saved.records.ebird = [{ code: 'duck1', source: 'ebird', date: '2019-01-01', place, seen: [`2019-01-01|${place.sub1}`] }]
    const c = placeCountsFor(reduce(initialState(), { type: 'restore', saved }), species)
    const qc = mapShapes({ w: 10, h: 10, d: { 'CA-QC': square, 'CA-BC': square } }, c, new Set(), 'CA')
    expect(qc).toEqual([
      { key: `s:${place.sub1}`, d: square, n: 1, checked: false },
      { key: 's:CA-BC', d: square, n: 0, checked: false },
    ])
    // The key is the Places panel's row, so a press sets its filter.
    expect(placeRows(c, 'c:CA', label).map((r) => r.value)).toEqual([qc[0].key])
  })

  it('shades on five steps, none for no species; a drilled place maps to its country', () => {
    expect([0, 1, 2, 10, 100].map((n) => shadeStep(n, 100))).toEqual([0, 1, 2, 3, 5])
    expect(shadeStep(3, 0)).toBe(0)
    expect([undefined, 'n:NA', 'c:CA', 's:CA-BC', 'k:CA-BC|Capital', 's:US-HI'].map(mapGroupOf)).toEqual([undefined, undefined, 'CA', 'CA', 'CA', 'US@OC'])
  })
})

describe('the Map view', () => {
  it('a press on a country sets the filter its Places checkbox sets, and a second press clears it', async () => {
    render(<Harness />)
    await act(async () => {})
    expect(shape('c:CA')).toHaveAttribute('data-step', '5')
    expect(shape('c:BR')).toHaveAttribute('data-step', '0')
    fireEvent.click(shape('c:CA'))
    const pressed = filterOf()
    expect(pressed).toEqual(togglePlace({}, 'c:CA'))
    expect(shape('c:CA')).toHaveAttribute('data-on')
    fireEvent.click(shape('c:CA'))
    expect(filterOf()).toEqual({})
    // The same place by the list under the map (the Places panel): North America, then Canada's checkbox.
    fireEvent.click(screen.getByTestId('drill-n:NA'))
    fireEvent.click(screen.getByTestId('country-CA'))
    expect(filterOf()).toEqual(pressed)
    // A place with no species can't be pressed.
    fireEvent.click(screen.getByTestId('country-CA'))
    fireEvent.click(shape('c:BR'))
    expect(filterOf()).toEqual({})
  })

  it('hover names the place and its count; drilling the list into Canada maps its provinces', async () => {
    render(<Harness />)
    await act(async () => {})
    fireEvent.pointerEnter(shape('c:CA'))
    expect(screen.getByText('Canada · 2 species')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('drill-n:NA'))
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    await act(async () => {})
    expect(shape('c:CA')).toBeNull()
    fireEvent.click(shape('s:CA-BC'))
    expect(filterOf()).toEqual({ provinces: ['CA-BC'] })
    fireEvent.click(screen.getByTestId('place-s:CA-BC'))
    expect(filterOf()).toEqual({})
    fireEvent.click(screen.getByTestId('place-s:CA-BC'))
    expect(filterOf()).toEqual({ provinces: ['CA-BC'] })
  })

  it('a drilled country whose province shapes hold none of its species keeps the world', async () => {
    const kept = provinces.groups.CA
    provinces.groups.CA = { w: 10, h: 10, d: { 'CA-NS': square } }
    try {
      render(<Harness />)
      await act(async () => {})
      fireEvent.click(screen.getByTestId('drill-n:NA'))
      fireEvent.click(screen.getByTestId('drill-c:CA'))
      await act(async () => {})
      expect(shape('c:CA')).toHaveAttribute('data-step', '5')
      expect(shape('s:CA-NS')).toBeNull()
    } finally {
      provinces.groups.CA = kept
    }
  })
})

describe('the counting switch on the map', () => {
  it('is hidden for a list without month sets (first sightings only), as in the Time panel', async () => {
    render(<Harness />)
    await act(async () => {})
    expect(screen.queryByTestId('time-basis')).toBeNull()
  })

  it('with month sets, "Seen any time" sets the basis and "First seen" clears it, by press and by arrow key', async () => {
    const withMonths = () => {
      const agg = new SeenAgg()
      agg.addMonths('duck1', 'CA-BC', ['2019-01', '2024-05'])
      agg.addKey('duck1', 'CA-BC', '2019-01')
      const saved = emptySaved()
      saved.records.ebird = [{ code: 'duck1', source: 'ebird', date: '2019-01-01', place: { country: 'CA', sub1: 'CA-BC' }, seen: agg.get('duck1'), seenMonths: agg.getMonths('duck1') }]
      return reduce(initialState(), { type: 'restore', saved })
    }
    render(<Harness init={withMonths} />)
    await act(async () => {})
    const group = screen.getByRole('radiogroup', { name: 'Count a bird by' })
    expect(screen.getByRole('radio', { name: 'First seen' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Seen any time' }))
    expect(filterOf()).toEqual({ basis: 'seen' })
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Seen any time' }), { key: 'ArrowLeft' })
    expect(filterOf()).toEqual({})
    expect(group).toBeInTheDocument()
  })
})
