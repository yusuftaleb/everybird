// @vitest-environment jsdom
// The Map view: it shades the birds the filters leave (the Places filter included), a bird seen in two countries counts in
// both, a press on a country (or its row in the list under the map) opens it, a province with counties opens too, the
// path above the map goes back, the tooltip names the place, and the map has no filter controls of its own. Its one
// ramp, the flags of the list's rows (the Places filter's Flag) and its columns.
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useReducer } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Regions, SpeciesRow } from '@/lib/species/types'

const square = 'M0 0h2v2h-2z'
const world = { v: 1 as const, w: 10, h: 10, d: { CA: square, US: square, KE: square, BR: square } }
const provinces: { v: 1; groups: Record<string, { w: number; h: number; d: Record<string, string> }> } = { v: 1, groups: { CA: { w: 10, h: 10, d: { 'CA-BC': square, 'CA-ON': square } } } }
vi.mock('@/lib/data-url', () => ({
  fetchData: async (name: string) => (name === 'map-countries.v1.json' ? world : provinces),
}))

const { MapView } = await import('@/components/collage/MapView')
const { countryRows, placeRows } = await import('@/lib/list/filters')
const { countRange, frameBox, mapCounts, mapDrawOrder, mapGroupOf, mapLayer, mapOpens, mapPath, mapRows, mapShapes, pathBox, placeCount, RAMP, shadeMix } = await import('@/lib/map/shapes')
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
/** The Ink outlines drawn after every shape, by place key, in drawing order. */
const edges = () => Array.from(document.querySelectorAll<SVGPathElement>('svg.eb-map-svg path[data-edge]')).map((p) => p.dataset.key)
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
  it('none for no species, the light end for the lowest count, the strong end for the highest, rising on a log scale', () => {
    expect(shadeMix(0, 1, 100)).toBe(0)
    expect(shadeMix(3, 0, 0)).toBe(0)
    expect(shadeMix(1, 1, 100)).toBeCloseTo(RAMP.lo)
    expect(shadeMix(100, 1, 100)).toBeCloseTo(RAMP.hi)
    // Log scale: 10 is halfway between 1 and 100.
    expect(shadeMix(10, 1, 100)).toBeCloseTo((RAMP.lo + RAMP.hi) / 2)
    const steps = [1, 2, 5, 20, 50, 100].map((n) => shadeMix(n, 1, 100))
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1])
    // One count on the layer: the strong end.
    expect(shadeMix(7, 7, 7)).toBe(RAMP.hi)
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

describe('the county level (placeCount, mapPath, mapOpens, mapRows, mapLayer)', () => {
  // duck1 in British Columbia's Capital, crow1 in its Okanagan, owl1 in Ontario (no county).
  const counties = () => {
    const saved = emptySaved()
    saved.records.ebird = [
      { code: 'duck1', source: 'ebird', date: '2019-01-01', place: { country: 'CA', sub1: 'CA-BC' }, seen: ['2019-01-01|CA-BC|Capital'] },
      { code: 'crow1', source: 'ebird', date: '2021-01-01', place: { country: 'CA', sub1: 'CA-BC' }, seen: ['2021-01-01|CA-BC|Okanagan'] },
      { code: 'owl1', source: 'ebird', date: '2022-01-01', place: { country: 'CA', sub1: 'CA-ON' }, seen: ['2022-01-01|CA-ON'] },
    ]
    return reduce(initialState(), { type: 'restore', saved })
  }
  const counts = countsOf(counties())
  const label = (k: string) => k.split('|').at(-1)!.replace(/^[a-z]:/, '')
  it('counts a country and a province; nothing else', () => {
    expect(placeCount(counts, 'c:CA')).toBe(3)
    expect(placeCount(counts, 's:CA-BC')).toBe(2)
    expect(placeCount(counts, 's:CA-ON')).toBe(1)
    expect(placeCount(counts, 'k:CA-BC|Capital')).toBe(0)
    expect(placeCount(counts, 'c:KE')).toBe(0)
  })
  it('the path runs World, the country, the province (never the continent)', () => {
    expect(mapPath(undefined)).toEqual([undefined])
    expect(mapPath('c:CA')).toEqual([undefined, 'c:CA'])
    expect(mapPath('s:CA-BC')).toEqual([undefined, 'c:CA', 's:CA-BC'])
  })
  it('a province with counties opens, one without does not; every country does; the open place never', () => {
    const provinces = mapRows(counts, 'c:CA', label)
    expect(provinces.map((r) => [r.value, mapOpens(r, 'c:CA')])).toEqual([['s:CA-BC', true], ['s:CA-ON', false]])
    expect(mapRows(counts, undefined, label).map((r) => mapOpens(r, undefined))).toEqual([true])
    expect(mapOpens(provinces[0], 's:CA-BC')).toBe(false)
  })
  it("a province's rows are its counties, most first; one with none lists itself", () => {
    expect(mapRows(counts, 's:CA-BC', label).map((r) => [r.value, r.count])).toEqual([['k:CA-BC|Capital', 1], ['k:CA-BC|Okanagan', 1]])
    expect(mapRows(counts, 's:CA-ON', label).map((r) => [r.value, r.count])).toEqual([['s:CA-ON', 1]])
  })
  it("an open province is framed in its country's provinces; without their shapes, the country in the world", () => {
    const layer = { w: 100, h: 100, d: { 'CA-BC': 'M10 10h10v10h-10z', 'CA-ON': 'M70 70h10v10h-10z' } }
    const bc = mapLayer(world, { v: 1, groups: { CA: layer } }, counts, 's:CA-BC')
    expect(bc.layer).toBe(layer)
    expect(bc.box!.w).toBeLessThan(100)
    expect(bc.box!.x).toBeLessThanOrEqual(10)
    expect(bc.box!.x + bc.box!.w).toBeGreaterThanOrEqual(20)
    expect(mapLayer(world, { v: 1, groups: { CA: layer } }, counts, 'c:CA').box).toEqual({ x: 0, y: 0, w: 100, h: 100 })
    const noShapes = mapLayer(world, { v: 1, groups: {} }, counts, 's:CA-BC')
    expect(noShapes.layer).toBe(world)
    expect(noShapes.box).toEqual(mapLayer(world, { v: 1, groups: {} }, counts, 'c:CA').box)
  })
  it('the Map view: a province with counties opens from its row or the map; the path steps back; Esc too', async () => {
    const levels: (string | undefined)[] = []
    render(<Harness init={counties} onLevel={(at) => levels.push(at)} />)
    await act(async () => {})
    fireEvent.click(screen.getByTestId('map-row-c:CA'))
    await act(async () => {})
    expect(screen.getByTestId('map-row-s:CA-BC').tagName).toBe('BUTTON')
    expect(screen.getByTestId('map-row-s:CA-ON').tagName).toBe('SPAN')
    expect(shape('s:CA-BC')).toHaveAttribute('data-opens')
    expect(shape('s:CA-ON')).not.toHaveAttribute('data-opens')
    fireEvent.pointerDown(shape('s:CA-BC'), { pointerType: 'mouse' })
    fireEvent.click(shape('s:CA-BC'))
    await act(async () => {})
    expect(levels.at(-1)).toBe('s:CA-BC')
    expect(screen.getByTestId('map-path')).toHaveTextContent('World/Canada/British Columbia')
    expect(screen.getByRole('button', { name: 'Canada' })).toHaveFocus()
    expect(edges()).toEqual(['s:CA-BC'])
    expect(document.querySelector('svg.eb-map-svg')!.getAttribute('viewBox')).not.toBe('0 0 10 10')
    const list = screen.getByRole('list', { name: 'Counties in British Columbia' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Capital1, 1 species', 'Okanagan1, 1 species'])
    expect(within(list).queryAllByRole('button')).toHaveLength(0)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Canada' }), { key: 'Escape' })
    expect(levels.at(-1)).toBe('c:CA')
    expect(screen.getByTestId('map-row-s:CA-BC')).toHaveFocus()
    fireEvent.click(screen.getByTestId('map-row-s:CA-BC'))
    fireEvent.click(screen.getByRole('button', { name: 'World' }))
    expect(levels.at(-1)).toBeUndefined()
    expect(screen.getByTestId('map-row-c:CA')).toHaveFocus()
  })
})

describe('the draw order (mapDrawOrder): every place, the outlined ones last', () => {
  const shapes = [
    { id: 'CY', key: 'c:CY', d: square, n: 2 },
    { id: 'KE', key: 'c:KE', d: square, n: 1 },
    { id: 'QY', key: 'c:CY', d: square, n: 2 },
    { id: 'BR', key: 'c:BR', d: square, n: 0 },
  ]
  const ids = (o?: string, h?: string) => mapDrawOrder(shapes, o, h).map((s) => s.id)
  it('the shapes drawn always include every place once, hovered, open or not', () => {
    for (const o of [undefined, 'c:CY', 'c:KE', 'c:BR', 'c:CA']) {
      for (const h of [undefined, 'c:CY', 'c:KE', 'c:BR', 'c:XX']) {
        expect([...ids(o, h)].sort()).toEqual(['BR', 'CY', 'KE', 'QY'])
        // The very same shapes (fill, count), only moved.
        for (const s of mapDrawOrder(shapes, o, h)) expect(shapes).toContain(s)
      }
    }
  })
  it('the open place, then the hovered one, last; each place moves whole; a key no shape has changes nothing', () => {
    expect(ids()).toEqual(['CY', 'KE', 'QY', 'BR'])
    expect(ids('c:KE')).toEqual(['CY', 'QY', 'BR', 'KE'])
    expect(ids('c:KE', 'c:BR')).toEqual(['CY', 'QY', 'KE', 'BR'])
    expect(ids(undefined, 'c:CY')).toEqual(['KE', 'BR', 'CY', 'QY'])
    expect(ids('c:CY', 'c:CY')).toEqual(['KE', 'BR', 'CY', 'QY'])
    // A country open on its provinces' layer has no shape of its own there.
    expect(ids('c:CA')).toEqual(['CY', 'KE', 'QY', 'BR'])
  })
})

describe('the ramp (RAMP, rampFill): the one look', () => {
  it('a pale Accent tint over Paper up to a mid-strength Accent, never full', () => {
    expect(RAMP.lo).toBeLessThan(0.25)
    expect(RAMP.hi).toBeGreaterThan(0.5)
    expect(RAMP.hi).toBeLessThan(0.75)
  })
  it("the CSS colour mixes the theme's tokens, so dark mode follows; no look variant on the page", async () => {
    const { rampFill } = await import('@/components/collage/MapView')
    expect(rampFill(0.18)).toBe('color-mix(in srgb, var(--accent) 18%, var(--paper))')
    window.history.replaceState(null, '', '/?v=map:c')
    try {
      render(<Harness />)
      await act(async () => {})
      expect(screen.getByTestId('map-view')).not.toHaveAttribute('data-look')
      expect(shape('c:CA').style.fill).toContain('var(--accent)')
      expect(screen.getByTestId('map-legend').querySelector('i')!.style.background).toContain('var(--paper)')
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })
})

describe('map.css: the borders, the columns, nothing cut', () => {
  it('one column on phones, two from 601px, three from 1024px, a row never split; no ellipsis anywhere', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const css = readFileSync(resolve(__dirname, '../src/components/collage/map.css'), 'utf8')
    expect(css).toMatch(/\.eb-map-list \{[^}]*columns: 1;/)
    expect(css).toMatch(/@media \(min-width: 601px\) \{ \.eb-map-list \{ columns: 2; \} \}/)
    expect(css).toMatch(/@media \(min-width: 1024px\) \{ \.eb-map-list \{ columns: 3; \} \}/)
    // Each row positions its own screen-reader text: an absolutely placed .eb-sr in a column layout with no positioned
    // parent lands far below the list and lets the page scroll past the footer.
    expect(css).toMatch(/\.eb-map-list > li \{ position: relative; break-inside: avoid; \}/)
    expect(css).not.toMatch(/ellipsis/)
    expect(css).not.toMatch(/data-look/)
    // Every shape: a hairline Paper border, the same on screen at every zoom, round joins.
    const border = css.match(/\.eb-map-svg path \{([^}]*)\}/)![1]
    expect(border).toMatch(/fill: var\(--surface\);/)
    expect(border).toMatch(/stroke: var\(--paper\);[^}]*stroke-width: \.5px;/)
    expect(border).toMatch(/stroke-linejoin: round;/)
    expect(border).toMatch(/vector-effect: non-scaling-stroke;/)
    // The hovered or open place: the Ink stroke of its own path, which keeps its fill (no rule sets fill on it).
    const edge = css.match(/\.eb-map-svg path\[data-edge\] \{([^}]*)\}/)![1]
    for (const d of ['stroke: var(--ink)', 'stroke-width: 1.5px', 'stroke-linecap: round']) expect(edge).toContain(d)
    expect(edge).not.toMatch(/fill/)
    // No other rule strokes a shape in Ink, and none blanks a shape's fill.
    expect(css).not.toMatch(/fill: (none|transparent)/)
    expect(css.match(/stroke: var\(--ink\)/g)).toHaveLength(1)
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
    expect(shape('c:CA')).toHaveAttribute('data-mix', RAMP.hi.toFixed(2))
    expect(Number(shape('c:KE').getAttribute('data-mix'))).toBeCloseTo(RAMP.lo)
    expect(shape('c:BR')).not.toHaveAttribute('data-mix')
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.queryByRole('switch')).toBeNull()
    fireEvent.pointerDown(shape('c:KE'), { pointerType: 'mouse' })
    fireEvent.click(shape('c:KE'))
    expect(filterOf()).toEqual({})
  })

  it('a press on a country opens it; the path says where; its World step (focused) goes back and focus returns to its row; Esc does too', async () => {
    const levels: (string | undefined)[] = []
    render(<Harness onLevel={(at) => levels.push(at)} />)
    await act(async () => {})
    fireEvent.pointerDown(shape('c:CA'), { pointerType: 'mouse' })
    fireEvent.click(shape('c:CA'))
    await act(async () => {})
    expect(shape('c:CA')).toBeNull()
    expect(shape('s:CA-BC')).toHaveAttribute('data-mix', RAMP.hi.toFixed(2))
    expect(levels.at(-1)).toBe('c:CA')
    const back = screen.getByRole('button', { name: 'World' })
    expect(back).toHaveFocus()
    expect(screen.getByTestId('map-path')).toHaveTextContent('World/Canada')
    expect(within(screen.getByTestId('map-path')).getByText('Canada')).toHaveAttribute('aria-current', 'location')
    // The list is the country's provinces (plain rows: no counties under them), no flags, the path above the map.
    const list = screen.getByRole('list', { name: 'States and provinces in Canada' })
    expect(within(list).queryAllByRole('button')).toHaveLength(0)
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['British Columbia1, 1 species', 'Ontario1, 1 species'])
    expect(back.compareDocumentPosition(document.querySelector('svg.eb-map-svg')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
    expect(edges()).toEqual(['c:KE'])
    expect(svg().getAttribute('viewBox')).not.toBe('0 0 10 10')
    expect(screen.getByRole('list', { name: 'States and provinces in Kenya' })).toHaveTextContent('Kenya1, 1 species')
    expect(screen.queryByRole('button', { name: 'Kenya' })).toBeNull() // the open place is the path's current step, not a link
  })

  it('the list under the map: countries with species, most first, each a button with its flag and count', async () => {
    render(<Harness />)
    await act(async () => {})
    const list = screen.getByRole('list', { name: 'Countries' })
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(['Canada2, 2 species', 'Kenya1, 1 species', 'United States1, 1 species'])
    expect(within(list).getByRole('button', { name: 'Canada, 2 species' })).toBeInTheDocument() // the flag is decorative
    // The Places filter's flag (components/Flag), in its fixed slot.
    const flag = within(list).getByTestId('map-row-c:CA').querySelector('.eb-flag-slot > img.eb-flag')!
    expect(flag).toHaveAttribute('alt', '')
    expect(flag).toHaveAttribute('width', '18')
    expect(screen.getByTestId('map-path')).toHaveTextContent(/^World$/)
    expect(within(screen.getByTestId('map-path')).queryAllByRole('button')).toHaveLength(0)
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

  it('every place shows its tooltip on hover, one with no species too, and is outlined above every shape, after the open one', async () => {
    render(<Harness />)
    await act(async () => {})
    const drawn = document.querySelectorAll('svg.eb-map-svg path').length
    // Hovered, a place keeps its own fill and shade, with the Ink outline on that same path.
    const fill = shape('c:CA').style.fill, mix = shape('c:CA').dataset.mix
    fireEvent.pointerEnter(shape('c:CA'), { pointerType: 'mouse' })
    expect(edges()).toEqual(['c:CA'])
    expect(document.querySelectorAll('path[data-key="c:CA"]')).toHaveLength(1)
    expect(shape('c:CA').style.fill).toBe(fill)
    expect(shape('c:CA').dataset.mix).toBe(mix)
    expect(document.querySelectorAll('svg.eb-map-svg path')).toHaveLength(drawn)
    fireEvent.pointerEnter(shape('c:BR'), { pointerType: 'mouse' })
    expect(screen.getByTestId('map-tip')).toHaveTextContent('Brazil0 species')
    expect(edges()).toEqual(['c:BR'])
    // The outlined place is the last thing the map draws, and every place is still drawn once.
    expect(document.querySelector('svg.eb-map-svg')!.lastElementChild).toHaveAttribute('data-key', 'c:BR')
    expect(document.querySelectorAll('svg.eb-map-svg path')).toHaveLength(drawn)
    fireEvent.click(screen.getByTestId('map-row-c:KE'))
    await act(async () => {})
    fireEvent.pointerEnter(shape('c:BR'), { pointerType: 'mouse' })
    expect(edges()).toEqual(['c:KE', 'c:BR'])
    // A tap on a place with no species names it too, and opens nothing.
    fireEvent.pointerDown(shape('c:BR'), { pointerType: 'touch' })
    fireEvent.click(shape('c:BR'))
    expect(screen.getByTestId('map-tip')).toHaveTextContent('Brazil0 species')
    expect(screen.getByTestId('map-path')).toHaveTextContent('World/Kenya')
  })

  it('the legend: one ramp from the lowest count to the highest, in the path\'s row at the right', async () => {
    render(<Harness />)
    await act(async () => {})
    const legend = screen.getByTestId('map-legend')
    expect(legend.parentElement).toHaveClass('eb-map-head')
    expect(legend.previousElementSibling).toBe(screen.getByTestId('map-path'))
    expect(legend).toHaveAttribute('aria-hidden', 'true')
    expect(legend).toHaveTextContent('12 species')
    expect(legend.querySelectorAll('i')).toHaveLength(1)
    // map.css: one wrapping row, the legend pushed to its end, and right-aligned on a line of its own.
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const css = readFileSync(resolve(__dirname, '../src/components/collage/map.css'), 'utf8')
    const head = css.match(/\.eb-map-head \{([^}]*)\}/)![1]
    for (const d of ['display: flex', 'flex-wrap: wrap', 'width: 100%']) expect(head).toContain(d)
    const leg = css.match(/\.eb-map-head > \.eb-map-legend \{([^}]*)\}/)![1]
    for (const d of ['display: flex', 'justify-content: flex-end', 'margin: 0 0 0 auto']) expect(leg).toContain(d)
    expect(css).toMatch(/\.eb-map-head > \.eb-map-path \{[^}]*min-width: 0;/)
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
