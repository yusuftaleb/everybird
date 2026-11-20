// @vitest-environment jsdom
// The Map view: it shades the birds the filters leave (the Places filter included), a bird seen in two countries counts in
// both, a press on a country (or its row in the list under the map) opens it and World closes it, the tooltip names the
// place, and the map has no filter controls of its own.
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
const { countryRows, placeRows } = await import('@/lib/list/filters')
const { countRange, frameBox, mapCounts, mapGroupOf, mapLayer, mapRows, mapShapes, pathBox, shadeMix, SHADE_LIGHT } = await import('@/lib/map/shapes')
const { initialState, makeReducer } = await import('@/lib/list/store')
const { emptySaved } = await import('@/lib/list/storage')
const { buildSpeciesIndex } = await import('@/lib/species/load')
const { resolveImportedPlace } = await import('@/lib/places/registry')

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

function Harness({ init = start, onLevel }: { init?: typeof start; onLevel?: (at: string | undefined) => void }) {
  const [state, dispatch] = useReducer(reduce, undefined, init)
  return (
    <>
      <MapView state={state} species={species} regions={regions} onLevel={onLevel} />
      <button type="button" onClick={() => dispatch({ type: 'filter', filter: { countries: ['KE'] } })}>Kenya only</button>
      <button type="button" onClick={() => dispatch({ type: 'filter', filter: {} })}>no filter</button>
      <output data-testid="filter">{JSON.stringify(state.filter)}</output>
    </>
  )
}
const filterOf = () => JSON.parse(screen.getByTestId('filter').textContent || '{}')
const shape = (key: string) => document.querySelector<SVGPathElement>(`path[data-key="${key}"]`)!
const countsOf = (state: ReturnType<typeof start>) => mapCounts(state.list, state.filter, species, state.seen)
afterEach(cleanup)

describe('the map counts', () => {
  const state = start()
  const counts = countsOf(state)
  const label = (k: string) => k

  it('with no filter, each country and province counts what the Places panel lists for it', () => {
    const panel = new Map(countryRows(counts, label).map((r) => [r.value, r.count]))
    for (const s of mapShapes(world, counts)) expect(s.n).toBe(panel.get(s.key) ?? 0)
    const panelCa = new Map(placeRows(counts, 'c:CA', label).map((r) => [r.value, r.count]))
    for (const s of mapShapes(provinces.groups.CA, counts, 'CA')) expect(s.n).toBe(panelCa.get(s.key))
  })

  it('a bird seen in two countries counts in both', () => {
    const n = Object.fromEntries(mapShapes(world, counts).map((s) => [s.key, s.n]))
    expect(n).toEqual({ 'c:CA': 2, 'c:US': 1, 'c:KE': 1, 'c:BR': 0 })
  })

  it('counts the birds the whole filter leaves, the Places filter included', () => {
    // Washington: the duck only; it was also seen in British Columbia, so Canada counts it, not the crow.
    const n = Object.fromEntries(mapShapes(world, mapCounts(state.list, { provinces: ['US-WA'] }, species, state.seen)).map((s) => [s.key, s.n]))
    expect(n).toEqual({ 'c:CA': 1, 'c:US': 1, 'c:KE': 0, 'c:BR': 0 })
    expect(Object.fromEntries(mapShapes(world, mapCounts(state.list, { countries: ['KE'] }, species, state.seen)).map((s) => [s.key, s.n]))).toEqual({ 'c:CA': 0, 'c:US': 0, 'c:KE': 1, 'c:BR': 0 })
  })

  it("a province stored under eBird's own code (no shared region) lights that code's shape, under the counted key", () => {
    // Quebec in eBird's catalogue with no equivalent: the import keeps a reference key ("CA-SRC…"), as for eBird's FR-GES or JP-38.
    const tables: Regions = { ...regions, registry: { v: 1, catalogues: { ebird: { edition: '2026', entries: { 'CA-QC': ['CA', 'Quebec'] } } } } }
    const place = resolveImportedPlace({ namespace: 'ebird', id: 'CA-QC', country: 'CA' }, tables)!
    expect(place.sub1).toMatch(/^CA-SRC/)
    const saved = emptySaved()
    saved.records.ebird = [{ code: 'duck1', source: 'ebird', date: '2019-01-01', place, seen: [`2019-01-01|${place.sub1}`] }]
    const c = countsOf(reduce(initialState(), { type: 'restore', saved }))
    const qc = mapShapes({ w: 10, h: 10, d: { 'CA-QC': square, 'CA-BC': square } }, c, 'CA')
    expect(qc).toEqual([
      { id: 'CA-QC', key: `s:${place.sub1}`, d: square, n: 1 },
      { id: 'CA-BC', key: 's:CA-BC', d: square, n: 0 },
    ])
    expect(placeRows(c, 'c:CA', label).map((r) => r.value)).toEqual([qc[0].key])
  })

  it("Northern Cyprus takes Cyprus's shade, name and press when the list has Cyprus and no QY; any QY keeps it its own", () => {
    const island = { w: 10, h: 10, d: { CY: square, QY: square } }
    const counted = (places: { country: string }[]) => {
      const saved = emptySaved()
      saved.records.ebird = places.map((place, i) => ({ code: ['duck1', 'crow1'][i], source: 'ebird' as const, date: '2019-01-01', place, seen: [`2019-01-01|${place.country}`] }))
      return countsOf(reduce(initialState(), { type: 'restore', saved }))
    }
    expect(mapShapes(island, counted([{ country: 'CY' }])).map(({ id, key, n }) => ({ id, key, n }))).toEqual([
      { id: 'CY', key: 'c:CY', n: 1 },
      { id: 'QY', key: 'c:CY', n: 1 },
    ])
    expect(mapShapes(island, counted([{ country: 'CY' }, { country: 'QY' }])).map(({ id, key, n }) => ({ id, key, n }))).toEqual([
      { id: 'CY', key: 'c:CY', n: 1 },
      { id: 'QY', key: 'c:QY', n: 1 },
    ])
  })

  it('a place inside a country maps to its country', () => {
    expect([undefined, 'n:NA', 'c:CA', 's:CA-BC', 'k:CA-BC|Capital', 's:US-HI'].map(mapGroupOf)).toEqual([undefined, undefined, 'CA', 'CA', 'CA', 'US@OC'])
  })
})

describe('the continuous shade (shadeMix) and the legend ends (countRange)', () => {
  it('none for no species, the light end for the lowest count, full for the highest, rising on a log scale', () => {
    expect(shadeMix(0, 1, 100)).toBe(0)
    expect(shadeMix(3, 0, 0)).toBe(0)
    expect(shadeMix(1, 1, 100)).toBeCloseTo(SHADE_LIGHT)
    expect(shadeMix(100, 1, 100)).toBe(1)
    // Log scale: 10 is halfway between 1 and 100.
    expect(shadeMix(10, 1, 100)).toBeCloseTo(SHADE_LIGHT + (1 - SHADE_LIGHT) / 2)
    const steps = [1, 2, 5, 20, 50, 100].map((n) => shadeMix(n, 1, 100))
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1])
    // One count on the layer: full.
    expect(shadeMix(7, 7, 7)).toBe(1)
  })

  it('the legend runs from the lowest count with species to the highest', () => {
    expect(countRange([{ n: 0 }, { n: 3 }, { n: 12 }, { n: 1 }])).toEqual([1, 12])
    expect(countRange([{ n: 0 }])).toEqual([0, 0])
  })
})

describe('framing a country (pathBox, frameBox, mapLayer)', () => {
  it('the bounding box of a path in the build\'s relative commands', () => {
    expect(pathBox('M10 20l5 0 0 5-5 0z')).toEqual({ x: 10, y: 20, w: 5, h: 5 })
    expect(pathBox('M0 0h2v2h-2z')).toEqual({ x: 0, y: 0, w: 2, h: 2 })
    expect(pathBox('M1 1l2 2zM10 10l-1 3z')).toEqual({ x: 1, y: 1, w: 9, h: 12 })
    expect(pathBox('')).toBeNull()
  })

  it('a frame is padded, keeps the layer\'s aspect, stays inside the layer, and is the whole layer when as large', () => {
    const f = frameBox({ x: 900, y: 400, w: 100, h: 50 }, 2000, 1000)
    expect(f.w / f.h).toBeCloseTo(2)
    expect(f.x).toBeLessThan(900)
    expect(f.x + f.w).toBeGreaterThan(1000)
    expect(f.y).toBeLessThan(400)
    expect(f.y + f.h).toBeGreaterThan(450)
    // At the corner it is moved inside.
    const c = frameBox({ x: 0, y: 0, w: 100, h: 100 }, 2000, 1000)
    expect(c.x).toBe(0)
    expect(c.y).toBe(0)
    expect(frameBox({ x: 0, y: 0, w: 1900, h: 900 }, 2000, 1000)).toEqual({ x: 0, y: 0, w: 2000, h: 1000 })
  })

  it('a country with province shapes holding its species shows them; one without is framed in the world', () => {
    const counts = countsOf(start())
    const wide = { v: 1 as const, w: 1000, h: 500, d: { CA: 'M100 100h50v50h-50z', KE: 'M600 300h20v20h-20z' } }
    const ca = mapLayer(wide, provinces, counts, 'c:CA')
    expect(ca.layer).toBe(provinces.groups.CA)
    expect(ca.box).toEqual({ x: 0, y: 0, w: 10, h: 10 })
    const ke = mapLayer(wide, provinces, counts, 'c:KE')
    expect(ke.layer).toBe(wide)
    expect(ke.box!.w).toBeLessThan(1000)
    expect(ke.box!.x).toBeLessThanOrEqual(600)
    expect(ke.box!.x + ke.box!.w).toBeGreaterThanOrEqual(620)
    expect(mapLayer(wide, provinces, counts, undefined).box).toEqual({ x: 0, y: 0, w: 1000, h: 500 })
  })
})

describe('the list under the map (mapRows)', () => {
  const counts = countsOf(start())
  const label = (k: string) => regions.countries[k.slice(2)] ?? regions.sub1[k.slice(2)] ?? k
  it('the world: countries with species, most first, then by name', () => {
    expect(mapRows(counts, undefined, label).map((r) => [r.label, r.count])).toEqual([['Canada', 2], ['Kenya', 1], ['United States', 1]])
  })
  it('a country: its states and provinces; a country whose birds have none: the country itself', () => {
    expect(mapRows(counts, 'c:CA', label).map((r) => [r.label, r.count])).toEqual([['British Columbia', 1], ['Ontario', 1]])
    expect(mapRows(counts, 'c:KE', label).map((r) => [r.value, r.count])).toEqual([['c:KE', 1]])
  })
})

describe('the Map view', () => {
  it('shades by species; has no filter controls: no checkboxes, no counting switch, a press never filters', async () => {
    render(<Harness />)
    await act(async () => {})
    expect(shape('c:CA')).toHaveAttribute('data-mix', '1.00')
    expect(Number(shape('c:KE').getAttribute('data-mix'))).toBeCloseTo(SHADE_LIGHT)
    expect(shape('c:BR')).not.toHaveAttribute('data-mix')
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.queryByRole('switch')).toBeNull()
    fireEvent.pointerDown(shape('c:KE'), { pointerType: 'mouse' })
    fireEvent.click(shape('c:KE'))
    expect(filterOf()).toEqual({})
  })

  it('a press on a country opens it; World (focused) goes back and focus returns to its row; Esc does too', async () => {
    const levels: (string | undefined)[] = []
    render(<Harness onLevel={(at) => levels.push(at)} />)
    await act(async () => {})
    fireEvent.pointerDown(shape('c:CA'), { pointerType: 'mouse' })
    fireEvent.click(shape('c:CA'))
    await act(async () => {})
    expect(shape('c:CA')).toBeNull()
    expect(shape('s:CA-BC')).toHaveAttribute('data-mix', '1.00')
    expect(levels.at(-1)).toBe('c:CA')
    const back = screen.getByRole('button', { name: 'World' })
    expect(back).toHaveFocus()
    // The list is the country's provinces, plain rows, World leading it.
    const list = screen.getByRole('list', { name: 'States and provinces in Canada' })
    expect(within(list).queryAllByRole('button')).toHaveLength(0)
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['British Columbia1, 1 species', 'Ontario1, 1 species'])
    expect(back.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(back)
    expect(shape('c:CA')).toBeInTheDocument()
    expect(levels.at(-1)).toBeUndefined()
    expect(screen.getByTestId('map-row-c:CA')).toHaveFocus()
    fireEvent.click(screen.getByTestId('map-row-c:CA'))
    expect(screen.getByRole('button', { name: 'World' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('button', { name: 'World' }), { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'World' })).toBeNull()
    expect(screen.getByTestId('map-row-c:CA')).toHaveFocus()
  })

  it('a country without province shapes holding its birds is framed in the world view', async () => {
    render(<Harness />)
    await act(async () => {})
    const svg = () => document.querySelector('svg.eb-map-svg')!
    expect(svg()).toHaveAttribute('viewBox', '0 0 10 10')
    fireEvent.click(screen.getByTestId('map-row-c:KE'))
    await act(async () => {})
    expect(shape('c:KE')).toHaveAttribute('data-open')
    expect(svg().getAttribute('viewBox')).not.toBe('0 0 10 10')
    expect(screen.getByRole('list', { name: 'States and provinces in Kenya' })).toHaveTextContent('Kenya1, 1 species')
  })

  it('the list under the map: countries with species, most first, each a button with its count', async () => {
    render(<Harness />)
    await act(async () => {})
    const list = screen.getByRole('list', { name: 'Countries' })
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(['Canada2, 2 species', 'Kenya1, 1 species', 'United States1, 1 species'])
    expect(screen.queryByTestId('map-all')).toBeNull()
  })

  it('the filters drive it: with Kenya only, Canada is unshaded and the list holds Kenya alone; an open country the filter empties closes', async () => {
    render(<Harness />)
    await act(async () => {})
    fireEvent.click(screen.getByTestId('map-row-c:CA'))
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Kenya only' }))
    await act(async () => {})
    expect(screen.queryByRole('button', { name: 'World' })).toBeNull()
    expect(shape('c:CA')).not.toHaveAttribute('data-mix')
    expect(within(screen.getByRole('list', { name: 'Countries' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Kenya1, 1 species'])
  })

  it('hover shows a tooltip with the name and count; on touch the first tap names the country and the second opens it', async () => {
    render(<Harness />)
    await act(async () => {})
    fireEvent.pointerEnter(shape('c:CA'), { pointerType: 'mouse' })
    expect(screen.getByTestId('map-tip')).toHaveTextContent('Canada2 species')
    fireEvent.pointerLeave(document.querySelector('svg.eb-map-svg')!, { pointerType: 'mouse' })
    expect(screen.queryByTestId('map-tip')).toBeNull()
    fireEvent.pointerDown(shape('c:KE'), { pointerType: 'touch' })
    fireEvent.click(shape('c:KE'))
    expect(screen.getByTestId('map-tip')).toHaveTextContent('Kenya1 species')
    expect(screen.queryByRole('button', { name: 'World' })).toBeNull()
    fireEvent.pointerDown(shape('c:KE'), { pointerType: 'touch' })
    fireEvent.click(shape('c:KE'))
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'World' })).toBeInTheDocument()
    // A tap elsewhere dismisses the tooltip.
    fireEvent.pointerDown(shape('c:KE'), { pointerType: 'touch' })
    fireEvent.click(shape('c:KE'))
    expect(screen.getByTestId('map-tip')).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByTestId('map-tip')).toBeNull()
  })

  it('the legend: one ramp from the lowest count to the highest', async () => {
    render(<Harness />)
    await act(async () => {})
    const legend = screen.getByTestId('map-legend')
    expect(legend).toHaveAttribute('aria-hidden', 'true')
    expect(legend).toHaveTextContent('12 species')
    expect(legend.querySelectorAll('i')).toHaveLength(1)
  })
})

describe('the list shows the first rows, then all', () => {
  it('"Show all N" past the first rows', async () => {
    const many = () => {
      const saved = emptySaved()
      const codes = ['duck1', 'crow1', 'owl1']
      const ids = ['CA', 'US', 'KE', 'BR', 'FR', 'DE', 'JP', 'MX', 'PE', 'AU', 'NZ', 'IN']
      saved.records.ebird = codes.map((code) => ({ code, source: 'ebird' as const, date: '2019-01-01', place: { country: 'CA' }, seen: ids.map((c) => `2019-01-01|${c}`) }))
      return reduce(initialState(), { type: 'restore', saved })
    }
    const { MAP_FIRST_ROWS } = await import('@/components/collage/MapView')
    render(<Harness init={many} />)
    await act(async () => {})
    const rows = () => within(screen.getByRole('list', { name: 'Countries' })).getAllByRole('listitem')
    expect(rows()).toHaveLength(MAP_FIRST_ROWS)
    fireEvent.click(screen.getByRole('button', { name: 'Show all 12' }))
    expect(rows()).toHaveLength(12)
  })
})
