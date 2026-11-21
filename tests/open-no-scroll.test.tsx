// @vitest-environment jsdom
// Round 6 menu audit, item 5: opening or closing a dock panel (Taxa, Display, Filters), the List view's Sort menu, the
// dock search, the language menu or the share dialog's menus never scrolls the page and never shows or hides the top bar.
// The bar runs the real headroom (attachHeadroom) on a <header>; the page's scroll calls are spied on. Each case runs
// with the bar hidden (scrolled down) and shown.
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createRef, useReducer, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CollageView } from '@/components/app/CollageView'
import { LanguageMenu } from '@/components/app/LanguageMenu'
import { useHoldTopBar } from '@/components/dialog-utils'
import { MenuSelect } from '@/components/share/MenuSelect'
import { attachHeadroom } from '@/lib/headroom'
import type { SourceRecord } from '@/lib/list/model'
import { emptySaved } from '@/lib/list/storage'
import { initialState, makeReducer, type AppState } from '@/lib/list/store'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { withI18n } from './i18n-render'

const sp = (code: string, com: string, sci: string, ord: string, fam: string, famCom: string, to: number, g: number): SpeciesRow =>
  ({ code, com, sci, ord, fam, famCom, to, g, gSrc: 'avonet', st: true, ar: 1, q: true })
const species = buildSpeciesIndex([
  sp('snogoo', 'Snow Goose', 'Anser caerulescens', 'Anseriformes', 'Anatidae', 'Ducks, Geese, and Waterfowl', 1, 2700),
  sp('norfli', 'Northern Flicker', 'Colaptes auratus', 'Piciformes', 'Picidae', 'Woodpeckers', 2, 140),
  sp('amerob', 'American Robin', 'Turdus migratorius', 'Passeriformes', 'Turdidae', 'Thrushes', 4, 77),
])
const regions: Regions = { v: 1, countries: { CA: 'Canada' }, sub1: { 'CA-BC': 'British Columbia' } }
const rec = (code: string, date: string): SourceRecord => ({ code, source: 'ebird', date, place: { country: 'CA', sub1: 'CA-BC' } })
const reduce = makeReducer({ species })
function seeded(): AppState {
  const saved = emptySaved()
  saved.records.ebird = [rec('snogoo', '2020-01-02'), rec('norfli', '2021-03-04'), rec('amerob', '2023-07-08')]
  return reduce(initialState(), { type: 'restore', saved })
}
function Collage() {
  const [state, dispatch] = useReducer(reduce, undefined, seeded)
  return <CollageView state={state} dispatch={dispatch} species={species} regions={regions} label="Test collage" />
}

class MemoryStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}

let bar: HTMLElement
let detach: () => void
let y = 0
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 2)) })
/** The page scrolled to `to` by the reader (a scroll event, then the headroom's frame). */
const scrollPage = async (to: number) => { y = to; window.dispatchEvent(new Event('scroll')); await tick() }
const spies = () => ({
  by: vi.spyOn(window, 'scrollBy').mockImplementation(() => {}),
  to: vi.spyOn(window, 'scrollTo').mockImplementation(() => {}),
  into: vi.fn(),
})
let page: ReturnType<typeof spies>

beforeEach(() => {
  vi.stubGlobal('innerWidth', 1024)
  vi.stubGlobal('innerHeight', 800)
  vi.stubGlobal('localStorage', new MemoryStorage())
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => setTimeout(() => f(0), 0) as unknown as number)
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  y = 0
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y })
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 6000 })
  bar = document.createElement('header')
  bar.className = 'eb-topbar'
  document.body.append(bar)
  detach = attachHeadroom(bar)
  page = spies()
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: page.into })
})
afterEach(() => {
  cleanup()
  detach()
  document.body.innerHTML = ''
  delete (Element.prototype as Partial<Element>).scrollIntoView
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Opens and closes with the bar `hidden` or shown; the bar and the page stay as they were throughout. */
async function stillThrough(hidden: boolean, open: () => unknown, close: () => unknown) {
  await scrollPage(hidden ? 900 : 0)
  expect(bar.hasAttribute('data-hidden')).toBe(hidden)
  await open()
  await tick()
  expect(bar.hasAttribute('data-hidden'), 'opening').toBe(hidden)
  await close()
  await tick()
  expect(bar.hasAttribute('data-hidden'), 'closing').toBe(hidden)
  expect(page.by).not.toHaveBeenCalled()
  expect(page.to).not.toHaveBeenCalled()
  expect(page.into).not.toHaveBeenCalled()
}

describe.each([['hidden', true], ['shown', false]] as const)('with the top bar %s', (_, hidden) => {
  it.each([['taxa'], ['display'], ['filters']])('the dock\'s %s panel: opening and closing move neither the page nor the bar', async (kind) => {
    render(<Collage />)
    const btn = () => screen.getByTestId(`${kind}-button`)
    await stillThrough(hidden, () => fireEvent.click(btn()), () => fireEvent.keyDown(window, { key: 'Escape' }))
    expect(screen.queryByTestId(`${kind}-panel`)).toBeNull()
    expect(btn()).toHaveFocus()
    // And by a second press on its button.
    await stillThrough(hidden, () => fireEvent.click(btn()), () => fireEvent.click(btn()))
  })
  it('the List view\'s Sort menu', async () => {
    render(<Collage />)
    fireEvent.click(within(screen.getByRole('group', { name: 'View' })).getByRole('button', { name: 'List' }))
    await stillThrough(hidden, () => fireEvent.click(screen.getByTestId('dock-sort')), () => fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' }))
    expect(screen.getByTestId('dock-sort')).toHaveFocus()
  })
  it('the dock search', async () => {
    render(<Collage />)
    await stillThrough(hidden, () => fireEvent.click(screen.getByRole('button', { name: 'Find a bird' })),
      () => fireEvent.keyDown(screen.getByRole('combobox', { name: 'Find a bird' }), { key: 'Escape' }))
    expect(screen.queryByRole('combobox', { name: 'Find a bird' })).toBeNull()
  })
  it('the language menu', async () => {
    render(<LanguageMenu />, { wrapper: withI18n('en'), container: bar.appendChild(document.createElement('div')) })
    const btn = screen.getByRole('button', { name: /English/ })
    await stillThrough(hidden, () => fireEvent.click(btn), () => fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' }))
    expect(btn).toHaveFocus()
  })
  it('the share dialog\'s menus (MenuSelect in its layer, the dialog holding the bar)', async () => {
    function Dialog() {
      useHoldTopBar()
      const layer = useRef<HTMLDivElement>(null)
      return (
        <div ref={layer} role="dialog" aria-label="Share">
          <span id="lbl">Split by</span>
          <MenuSelect labelledBy="lbl" menuLabel="Split by" escapeRef={createRef()} layer={layer} value="a" onChange={() => {}}
            options={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]} />
        </div>
      )
    }
    await scrollPage(hidden ? 900 : 0)
    render(<Dialog />)
    const btn = screen.getByRole('button', { name: 'Split by Alpha' })
    await stillThrough(hidden, () => fireEvent.click(btn), () => fireEvent.click(screen.getByRole('menuitemradio', { name: 'Beta' })))
    expect(btn).toHaveFocus()
  })
})

describe('the hold is a freeze', () => {
  it('a scroll while something is open neither hides nor shows the bar; released, the headroom runs again', async () => {
    function Open() { useHoldTopBar(); return null }
    await scrollPage(900)
    expect(bar).toHaveAttribute('data-hidden')
    const { unmount } = render(<Open />)
    await scrollPage(400) // up 500px: would show it
    expect(bar).toHaveAttribute('data-hidden')
    unmount()
    await scrollPage(300)
    expect(bar).not.toHaveAttribute('data-hidden')
    render(<Open />)
    await scrollPage(1200) // down: would hide it
    expect(bar).not.toHaveAttribute('data-hidden')
    expect(page.by).not.toHaveBeenCalled()
  })
})
