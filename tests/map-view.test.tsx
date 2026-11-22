// @vitest-environment jsdom
// The Map view: the world's countries only (round 6). It shades the birds the filters leave (the Places filter
// included), a bird seen in two countries counts in both, a press or tap names a country as hovering does and opens
// nothing, the map has no filter controls of its own, and it zooms and pans (src/lib/map/zoom.ts): + and −, a reset
// once zoomed, pinch, ctrl+wheel (a plain wheel scrolls the page), the keys while focused, and a drag once zoomed. Its
// one ramp, the flags of the list's rows (the Places filter's Flag) and its columns.
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useReducer } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Regions, SpeciesRow } from '@/lib/species/types'

const square = 'M0 0h2v2h-2z'
// As wide as the real world layer (2000 units), so the deepest zoom is the real one for a map of a given width.
const world = { v: 1 as const, w: 2000, h: 1000, d: { CA: square, US: 'M10 0h2v2h-2z', KE: 'M20 0h2v2h-2z', BR: 'M30 0h2v2h-2z' } }
// How many loads of the world fail before one succeeds (the Try again tests).
const net = vi.hoisted(() => ({ fails: 0 }))
vi.mock('@/lib/data-url', () => ({
  fetchData: async (name: string) => {
    if (name !== 'map-countries.v1.json') throw new Error(`the map reads only the world, not ${name}`)
    if (net.fails > 0) { net.fails--; throw new Error('offline') }
    return world
  },
}))

const { MapView } = await import('@/components/collage/MapView')
const { countryRows } = await import('@/lib/list/filters')
const { countRange, mapCounts, mapDrawOrder, mapRows, mapShapes, mapUnplaced, RAMP, RAMP_DARK, shadeMix } = await import('@/lib/map/shapes')
const { clampView, EDGE_PX, MAP_EDGE, maxZoom, viewBoxOf, worldView, zoomAt } = await import('@/lib/map/zoom')
const { initialState, makeReducer } = await import('@/lib/list/store')
const { emptySaved } = await import('@/lib/list/storage')
const { buildSpeciesIndex } = await import('@/lib/species/load')

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


function Harness({ init = start, onLevel }: { init?: typeof start; onLevel?: (at: undefined) => void }) {
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
const viewBox = () => document.querySelector('svg.eb-map-svg')!.getAttribute('viewBox')
const countsOf = (state: ReturnType<typeof start>) => mapCounts(state.list, state.filter, species, state.seen)
afterEach(cleanup)

describe('the map counts', () => {
  const state = start()
  const counts = countsOf(state)
  const label = (k: string) => k

  it('with no filter, each country counts what the Places panel lists for it', () => {
    const panel = new Map(countryRows(counts, label).map((r) => [r.value, r.count]))
    for (const s of mapShapes(world, counts)) expect(s.n).toBe(panel.get(s.key) ?? 0)
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

describe('the draw order (mapDrawOrder): every place, the hovered one last', () => {
  const shapes = [
    { id: 'CY', key: 'c:CY', d: square, n: 2 },
    { id: 'KE', key: 'c:KE', d: square, n: 1 },
    { id: 'QY', key: 'c:CY', d: square, n: 2 },
    { id: 'BR', key: 'c:BR', d: square, n: 0 },
  ]
  const ids = (h?: string) => mapDrawOrder(shapes, h).map((s) => s.id)
  it('the shapes drawn always include every place once, hovered or not', () => {
    for (const h of [undefined, 'c:CY', 'c:KE', 'c:BR', 'c:XX']) {
      expect([...ids(h)].sort()).toEqual(['BR', 'CY', 'KE', 'QY'])
      // The very same shapes (fill, count), only moved.
      for (const s of mapDrawOrder(shapes, h)) expect(shapes).toContain(s)
    }
  })
  it('the hovered place last; a place moves whole; a key no shape has changes nothing', () => {
    expect(ids()).toEqual(['CY', 'KE', 'QY', 'BR'])
    expect(ids('c:KE')).toEqual(['CY', 'QY', 'BR', 'KE'])
    expect(ids('c:CY')).toEqual(['KE', 'BR', 'CY', 'QY'])
    expect(ids('c:XX')).toEqual(['CY', 'KE', 'QY', 'BR'])
  })
})

describe('zoom and pan (zoom.ts)', () => {
  const W = 2000, H = 1000
  it('the zoom never goes below the whole world nor past the deepest zoom', () => {
    expect(clampView({ cx: 1000, cy: 500, zoom: 0.25 }, W, H, 12).zoom).toBe(1)
    expect(clampView({ cx: 1000, cy: 500, zoom: 50 }, W, H, 12).zoom).toBe(12)
    expect(clampView({ cx: 1000, cy: 500, zoom: 3 }, W, H, 12).zoom).toBe(3)
    // A deepest zoom under 1 (a very wide map) still allows the whole world.
    expect(clampView({ cx: 1000, cy: 500, zoom: 2 }, W, H, 0.5).zoom).toBe(1)
  })
  it('the view never leaves the world: at the whole world it is centred, zoomed its edges stop at the world\'s', () => {
    expect(clampView({ cx: 0, cy: 9999, zoom: 1 }, W, H, 12)).toEqual(worldView(W, H))
    const v = clampView({ cx: -500, cy: 5000, zoom: 4 }, W, H, 12)
    const b = viewBoxOf(v, W, H)
    expect(b).toEqual({ x: 0, y: H - H / 4, w: W / 4, h: H / 4 })
    const far = viewBoxOf(clampView({ cx: 1e6, cy: -1e6, zoom: 4 }, W, H, 12), W, H)
    expect(far.x + far.w).toBe(W)
    expect(far.y).toBe(0)
    // Inside, a view is kept as it is.
    expect(clampView({ cx: 900, cy: 400, zoom: 4 }, W, H, 12)).toEqual({ cx: 900, cy: 400, zoom: 4 })
  })
  it('a pinch or trackpad zooms where it is: the point under it stays put', () => {
    const v = { cx: 1000, cy: 500, zoom: 2 }
    const f = { x: 1300, y: 420 }
    const z = zoomAt(v, 5, f)
    const at = (view: typeof v) => {
      const b = viewBoxOf(view, W, H)
      return [(f.x - b.x) / b.w, (f.y - b.y) / b.h]
    }
    expect(z.zoom).toBe(5)
    expect(at(z)[0]).toBeCloseTo(at(v)[0])
    expect(at(z)[1]).toBeCloseTo(at(v)[1])
  })
  it('the deepest zoom: where the 1:50m coasts\' typical edge reaches a few pixels, deeper on a narrower map', () => {
    expect(MAP_EDGE).toBe(0.5)
    expect(EDGE_PX).toBe(3)
    expect(maxZoom(1152, W)).toBeCloseTo(10.42, 2) // the page's widest map
    expect(maxZoom(360, W)).toBeCloseTo(33.33, 2) // a phone
    expect(maxZoom(1152, W) * MAP_EDGE * (1152 / W)).toBeCloseTo(EDGE_PX)
    expect(maxZoom(1e6, W)).toBe(1)
    expect(maxZoom(0, W)).toBe(1)
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
    // The hovered place: the Ink stroke of its own path, which keeps its fill (no rule sets fill on it).
    const edge = css.match(/\.eb-map-svg path\[data-edge\] \{([^}]*)\}/)![1]
    for (const d of ['stroke: var(--ink)', 'stroke-width: 1.5px', 'stroke-linecap: round']) expect(edge).toContain(d)
    expect(edge).not.toMatch(/fill/)
    // No other rule strokes a shape in Ink, and none blanks a shape's fill.
    expect(css).not.toMatch(/fill: (none|transparent)/)
    expect(css.match(/stroke: var\(--ink\)/g)).toHaveLength(1)
    // A one-finger swipe scrolls the page at the whole world; once zoomed a drag pans the map.
    expect(css).toMatch(/\.eb-map-art \{ touch-action: pan-y; \}/)
    expect(css).toMatch(/\.eb-map-pic\[data-zoomed\] \.eb-map-art \{ touch-action: none;/)
    // No country or province level: nothing on the map is a button.
    expect(css).not.toMatch(/data-opens|eb-map-path|button\.eb-map-row/)
  })
})

describe('the list under the map (mapRows)', () => {
  const counts = countsOf(start())
  const label = (k: string) => regions.countries[k.slice(2)] ?? k
  it('countries with species, most first, then by name', () => {
    expect(mapRows(counts, label).map((r) => [r.label, r.count])).toEqual([['Canada', 2], ['Kenya', 1], ['United States', 1]])
  })
})

/** A 1000 × 500 px map (jsdom lays nothing out), under reduced motion so every zoom lands at once. */
function layOut() {
  vi.stubGlobal('ResizeObserver', class {
    constructor(private cb: () => void) {}
    observe() { this.cb() }
    disconnect() {}
  })
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 500, width: 1000, height: 500, toJSON() {} } as DOMRect)
}

describe('the Map view', () => {
  it('shades by species; has no filter controls: no checkboxes, no counting switch, a press never filters', async () => {
    render(<Harness />)
    await act(async () => {})
    expect(shape('c:CA')).toHaveAttribute('data-mix', RAMP.hi.toFixed(2))
    expect(Number(shape('c:KE').getAttribute('data-mix'))).toBeCloseTo(RAMP.lo)
    expect(shape('c:BR')).not.toHaveAttribute('data-mix')
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.queryByRole('switch')).toBeNull()
    fireEvent.pointerDown(shape('c:KE'), { pointerType: 'mouse', pointerId: 1 })
    fireEvent.click(shape('c:KE'))
    expect(filterOf()).toEqual({})
  })

  it('a press or a tap opens nothing: it names the country as hovering does, and the map stays the world', async () => {
    const levels: unknown[] = []
    render(<Harness onLevel={(at) => levels.push(at)} />)
    await act(async () => {})
    const drawn = document.querySelectorAll('svg.eb-map-svg path').length
    const before = viewBox()
    for (const pointerType of ['mouse', 'touch', 'touch']) {
      fireEvent.pointerDown(shape('c:CA'), { pointerType, pointerId: 1 })
      fireEvent.pointerUp(shape('c:CA'), { pointerType, pointerId: 1 })
      fireEvent.click(shape('c:CA'))
      await act(async () => {})
      expect(screen.getByTestId('map-tip')).toHaveTextContent('Canada2 species')
      expect(viewBox()).toBe(before)
      expect(document.querySelectorAll('svg.eb-map-svg path')).toHaveLength(drawn)
      expect(shape('c:CA')).toBeInTheDocument()
    }
    // No path above the map, no province shapes or rows, nothing on the map or in its list to open.
    expect(screen.queryByTestId('map-path')).toBeNull()
    expect(document.querySelector('path[data-key^="s:"], [data-opens]')).toBeNull()
    expect(within(screen.getByRole('list', { name: 'Countries' })).queryAllByRole('button')).toHaveLength(0)
    expect(levels.every((at) => at === undefined)).toBe(true)
    expect(filterOf()).toEqual({})
    // A tap elsewhere dismisses the tooltip.
    fireEvent.pointerDown(document.body)
    expect(screen.queryByTestId('map-tip')).toBeNull()
  })

  it('the list under the map: countries with species, most first, each with its flag and count, none a button', async () => {
    render(<Harness />)
    await act(async () => {})
    const list = screen.getByRole('list', { name: 'Countries' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Canada2, 2 species', 'Kenya1, 1 species', 'United States1, 1 species'])
    // The Places filter's flag (components/Flag), in its fixed slot.
    const flag = within(list).getByTestId('map-row-c:CA').querySelector('.eb-flag-slot > img.eb-flag')!
    expect(flag).toHaveAttribute('alt', '')
    expect(flag).toHaveAttribute('width', '18')
    expect(screen.queryByTestId('map-all')).toBeNull()
  })

  it('the filters drive it: with Kenya only, Canada is unshaded and the list holds Kenya alone', async () => {
    render(<Harness />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Kenya only' }))
    await act(async () => {})
    expect(shape('c:CA')).not.toHaveAttribute('data-mix')
    expect(within(screen.getByRole('list', { name: 'Countries' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Kenya1, 1 species'])
  })

  it('every place shows its tooltip on hover, one with no species too, and is outlined above every shape', async () => {
    render(<Harness />)
    await act(async () => {})
    const drawn = document.querySelectorAll('svg.eb-map-svg path').length
    // Hovered, a place keeps its own fill and shade, with the Ink outline on that same path.
    const fill = shape('c:CA').style.fill, mix = shape('c:CA').dataset.mix
    fireEvent.pointerEnter(shape('c:CA'), { pointerType: 'mouse' })
    expect(screen.getByTestId('map-tip')).toHaveTextContent('Canada2 species')
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
    fireEvent.pointerLeave(document.querySelector('svg.eb-map-svg')!, { pointerType: 'mouse' })
    expect(screen.queryByTestId('map-tip')).toBeNull()
    expect(edges()).toEqual([])
  })

  it('the legend: one ramp from the lowest count to the highest, at the right of the row above the map', async () => {
    render(<Harness />)
    await act(async () => {})
    const legend = screen.getByTestId('map-legend')
    expect(legend.parentElement).toHaveClass('eb-map-head')
    expect(legend).toHaveAttribute('aria-hidden', 'true')
    expect(legend).toHaveTextContent('12 species')
    expect(legend.querySelectorAll('i')).toHaveLength(1)
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const css = readFileSync(resolve(__dirname, '../src/components/collage/map.css'), 'utf8')
    const head = css.match(/\.eb-map-head \{([^}]*)\}/)![1]
    for (const d of ['display: flex', 'width: 100%']) expect(head).toContain(d)
    const leg = css.match(/\.eb-map-head > \.eb-map-legend \{([^}]*)\}/)![1]
    for (const d of ['display: flex', 'justify-content: flex-end', 'margin: 0 0 0 auto']) expect(leg).toContain(d)
  })
})

describe('the Map view zooms and pans', () => {
  beforeEach(layOut)
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
  const zoomIn = () => screen.getByRole('button', { name: 'Zoom in' })
  const zoomOut = () => screen.getByRole('button', { name: 'Zoom out' })
  const reset = () => screen.queryByRole('button', { name: 'Show the whole world' })

  it('+ and − under the map, named, with the caption; − is off at the whole world; a reset shows once zoomed', async () => {
    render(<Harness />)
    await act(async () => {})
    const pic = screen.getByRole('group', { name: 'Map' })
    expect(pic).toHaveAttribute('tabindex', '0')
    expect(document.getElementById(pic.getAttribute('aria-describedby')!)).toHaveTextContent('Pinch or +/− to zoom · drag to pan')
    expect(viewBox()).toBe('0 0 2000 1000')
    expect(zoomOut()).toHaveAttribute('aria-disabled', 'true')
    expect(zoomIn()).not.toHaveAttribute('aria-disabled')
    expect(reset()).toBeNull()
    for (const b of [zoomIn(), zoomOut()]) expect(b).toHaveClass('eb-btn', 'eb-btn-quiet', 'eb-map-zoom-btn')
    fireEvent.click(zoomIn())
    expect(viewBox()).toBe('500 250 1000 500')
    expect(zoomOut()).not.toHaveAttribute('aria-disabled')
    // Back to the whole world; the reset goes with the zoom and its focus moves to Zoom in.
    reset()!.focus()
    fireEvent.click(reset()!)
    expect(viewBox()).toBe('0 0 2000 1000')
    expect(reset()).toBeNull()
    expect(zoomIn()).toHaveFocus()
  })

  it('the zoom stops at the deepest zoom for the map\'s width (12× at 1000px) and never below the whole world', async () => {
    render(<Harness />)
    await act(async () => {})
    for (let i = 0; i < 6; i++) fireEvent.click(zoomIn())
    expect(document.querySelector('svg.eb-map-svg')).toHaveAttribute('data-zoom', maxZoom(1000, 2000).toFixed(2))
    expect(zoomIn()).toHaveAttribute('aria-disabled', 'true')
    for (let i = 0; i < 6; i++) fireEvent.click(zoomOut())
    expect(viewBox()).toBe('0 0 2000 1000')
  })

  it('the keys while the map has focus: + and − zoom, the arrows pan once zoomed, 0 resets; Esc closes the tooltip', async () => {
    render(<Harness />)
    await act(async () => {})
    const pic = screen.getByRole('group', { name: 'Map' })
    // At the whole world the arrows are the page's (they scroll it).
    expect(fireEvent.keyDown(pic, { key: 'ArrowRight' })).toBe(true)
    expect(fireEvent.keyDown(pic, { key: '+' })).toBe(false)
    expect(viewBox()).toBe('500 250 1000 500')
    expect(fireEvent.keyDown(pic, { key: 'ArrowRight' })).toBe(false)
    expect(Number(viewBox()!.split(' ')[0])).toBeCloseTo(500 + 2000 / 15 / 2) // a fifteenth of the width, at zoom 2
    for (let i = 0; i < 4; i++) fireEvent.keyDown(pic, { key: 'ArrowUp' })
    // Never past the world's top edge.
    expect(viewBox()!.split(' ')[1]).toBe('0')
    fireEvent.keyDown(pic, { key: '-' })
    expect(viewBox()).toBe('0 0 2000 1000')
    fireEvent.keyDown(pic, { key: '=' })
    fireEvent.keyDown(pic, { key: '0' })
    expect(viewBox()).toBe('0 0 2000 1000')
    fireEvent.pointerEnter(shape('c:CA'), { pointerType: 'mouse' })
    expect(fireEvent.keyDown(pic, { key: 'Escape' })).toBe(false)
    expect(screen.queryByTestId('map-tip')).toBeNull()
  })

  it('a plain wheel scrolls the page; a trackpad pinch (ctrl+wheel) zooms where the pointer is', async () => {
    render(<Harness />)
    await act(async () => {})
    const art = document.querySelector('.eb-map-art')!
    expect(fireEvent.wheel(art, { deltaY: -100, clientX: 250, clientY: 125 })).toBe(true)
    expect(viewBox()).toBe('0 0 2000 1000')
    expect(fireEvent.wheel(art, { deltaY: -100, ctrlKey: true, clientX: 250, clientY: 125 })).toBe(false)
    const [x, y, w, h] = viewBox()!.split(' ').map(Number)
    expect(w).toBeLessThan(2000)
    // The point under the pointer (500, 250 in map units) stays under it.
    expect((500 - x) / w).toBeCloseTo(0.25)
    expect((250 - y) / h).toBeCloseTo(0.25)
  })

  it('a drag pans once zoomed (and names nothing); at the whole world it does nothing', async () => {
    render(<Harness />)
    await act(async () => {})
    const art = document.querySelector('.eb-map-art')!
    fireEvent.pointerDown(shape('c:CA'), { pointerType: 'mouse', pointerId: 1, button: 0, clientX: 600, clientY: 300 })
    fireEvent.pointerMove(art, { pointerType: 'mouse', pointerId: 1, clientX: 700, clientY: 300 })
    fireEvent.pointerUp(art, { pointerType: 'mouse', pointerId: 1 })
    expect(viewBox()).toBe('0 0 2000 1000')
    fireEvent.click(zoomIn())
    fireEvent.pointerDown(shape('c:CA'), { pointerType: 'mouse', pointerId: 1, button: 0, clientX: 600, clientY: 300 })
    fireEvent.pointerMove(art, { pointerType: 'mouse', pointerId: 1, clientX: 700, clientY: 340 })
    fireEvent.pointerUp(art, { pointerType: 'mouse', pointerId: 1 })
    fireEvent.click(shape('c:CA'))
    // 1000 units over 1000px: 100px right and 40px down move the view 100 units left and 40 up.
    expect(viewBox()).toBe('400 210 1000 500')
    expect(screen.queryByTestId('map-tip')).toBeNull()
  })

  it('two fingers pinch, around the point between them', async () => {
    render(<Harness />)
    await act(async () => {})
    const art = document.querySelector('.eb-map-art')!
    fireEvent.pointerDown(art, { pointerType: 'touch', pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerDown(art, { pointerType: 'touch', pointerId: 2, clientX: 300, clientY: 100 })
    fireEvent.pointerMove(art, { pointerType: 'touch', pointerId: 2, clientX: 500, clientY: 100 })
    // Twice as far apart: zoom 2, the midpoint at the start (200, 100 px: 400, 200 units) held still.
    expect(viewBox()).toBe('200 100 1000 500')
    fireEvent.pointerUp(art, { pointerType: 'touch', pointerId: 1 })
    fireEvent.pointerUp(art, { pointerType: 'touch', pointerId: 2 })
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

describe('round 6 design proposals on the Map (D8, H4, H12, H13, H14, AU12, AU14, O7, P11)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
  it('the head counts the countries at its left; one country, or every count tied, gets one swatch, not a range', async () => {
    render(<Harness />)
    expect(screen.getByTestId('map-count')).toHaveTextContent('3 countries')
    await act(async () => {})
    expect(screen.getByTestId('map-legend')).toHaveTextContent('12 species')
    expect(screen.getByTestId('map-legend').querySelector('.eb-map-swatch')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Kenya only' }))
    expect(screen.getByTestId('map-count')).toHaveTextContent('1 country')
    const legend = screen.getByTestId('map-legend')
    expect(legend.querySelectorAll('i')).toHaveLength(1)
    expect(legend.querySelector('.eb-map-swatch')).not.toBeNull()
    expect(legend).toHaveTextContent(/^1 species$/)
  })

  it('the zoom row and its caption are there before the shapes, the buttons disabled and titled', async () => {
    layOut()
    render(<Harness />)
    expect(screen.getByTestId('map-zoom-in')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByTestId('map-zoom-out')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByTestId('map-zoom-in')).toHaveAttribute('title', 'Zoom in')
    expect(screen.getByTestId('map-zoom-out')).toHaveAttribute('title', 'Zoom out')
    expect(screen.getByText('Pinch or +/− to zoom · drag to pan')).toBeInTheDocument()
    await act(async () => {})
    expect(screen.getByTestId('map-zoom-in')).not.toHaveAttribute('aria-disabled')
  })

  it('a failed load says so with Try again (a status line); the map is no stop for the keyboard until it loads', async () => {
    net.fails = 1
    // A fresh module: the shapes earlier tests loaded are cached for the page.
    vi.resetModules()
    const { MapView: FreshMap } = await import('@/components/collage/MapView')
    const state = start()
    render(<FreshMap state={state} species={species} regions={regions} />)
    await act(async () => {})
    const failed = screen.getByTestId('map-failed')
    expect(failed).toHaveAttribute('role', 'status')
    const pic = screen.getByTestId('map-pic')
    expect(pic).not.toHaveAttribute('tabindex')
    expect(pic).not.toHaveAttribute('role')
    expect(pic).not.toHaveAttribute('aria-describedby')
    expect(screen.queryByTestId('map-zoom-in')).toBeNull()
    await act(async () => { fireEvent.click(within(failed).getByRole('button', { name: 'Try again' })) })
    expect(screen.queryByTestId('map-failed')).toBeNull()
    expect(screen.getByRole('group', { name: 'Map' })).toHaveAttribute('tabindex', '0')
    expect(shape('c:CA')).toBeInTheDocument()
  })

  it('a note under the list counts the birds shown with no place, which the map leaves out', () => {
    const init = () => {
      const saved = emptySaved()
      saved.records.ebird = [{ code: 'duck1', source: 'ebird', date: '2019-01-01', place: { country: 'CA' } }]
      saved.records['obsorg-list'] = [{ code: 'crow1', source: 'obsorg', date: '2020-01-01' }, { code: 'owl1', source: 'obsorg', date: '2020-02-01' }]
      return reduce(initialState(), { type: 'restore', saved })
    }
    const state = init()
    expect(mapUnplaced(state.list, state.filter, species, state.seen)).toBe(2)
    render(<Harness init={init} />)
    expect(screen.getByTestId('map-unplaced')).toHaveTextContent('2 birds on this list have no place, so the map leaves them out.')
    cleanup()
    render(<Harness />)
    expect(screen.queryByTestId('map-unplaced')).toBeNull()
  })

  it('dark mode starts the ramp stronger; the share image keeps RAMP', async () => {
    expect(RAMP_DARK.lo).toBeGreaterThan(RAMP.lo)
    expect(RAMP_DARK.hi).toBe(RAMP.hi)
    expect(shadeMix(1, 1, 100, RAMP_DARK)).toBeCloseTo(RAMP_DARK.lo)
    document.documentElement.dataset.theme = 'dark'
    try {
      render(<Harness />)
      await act(async () => {})
      expect(Number(shape('c:KE').getAttribute('data-mix'))).toBeCloseTo(RAMP_DARK.lo)
    } finally {
      delete document.documentElement.dataset.theme
    }
  })

  it('near the top of the map the tooltip goes under the pointer', async () => {
    layOut()
    render(<Harness />)
    await act(async () => {})
    fireEvent.click(shape('c:CA'), { clientX: 500, clientY: 20 })
    expect(screen.getByTestId('map-tip')).toHaveAttribute('data-below')
    fireEvent.click(shape('c:CA'), { clientX: 500, clientY: 300 })
    expect(screen.getByTestId('map-tip')).not.toHaveAttribute('data-below')
  })
})
