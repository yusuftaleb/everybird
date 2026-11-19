// @vitest-environment jsdom
// The view across a language switch, on the real paths: chooseLang stashes it before the reload; the list store takes
// the filter, layout switches back with the stored list; the dock search takes its typed text and open state back. None
// of the restores emits analytics (filter_used, search_applied, ui_language is the switch's own beacon, not a restore).
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SourceRecord } from '@/lib/list/model'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { withI18n } from './i18n-render'

const spy = vi.hoisted(() => ({ track: vi.fn(), trackFilterUsed: vi.fn() }))
vi.mock('@/lib/analytics', async (orig) => ({ ...(await orig<typeof import('@/lib/analytics')>()), track: spy.track, trackFilterUsed: spy.trackFilterUsed }))

const row = (code: string, to: number): SpeciesRow => ({ code, com: code, sci: code, ord: 'Passeriformes', fam: 'Corvidae', famCom: 'Crows', to, g: 1, gSrc: 'family', st: true, ar: 1, q: true })
const speciesFile = { v: 1, species: [row('crow', 10), row('wren', 12)] }
const regionsFile = { v: 1, countries: { CA: 'Canada', EG: 'Egypt [x]' }, sub1: {} }
const rec = (code: string): SourceRecord => ({ code, source: 'ebird', date: '2020-01-02', place: { country: 'CA' } })
const regions: Regions = { v: 1, countries: { CA: 'Canada' }, sub1: {} }

function stubFetch() {
  vi.stubGlobal('fetch', async (u: string | URL) => {
    const url = String(u)
    const body = url.includes('species.v1') ? speciesFile : url.includes('regions.v1') ? regionsFile : null
    return body ? new Response(JSON.stringify(body)) : new Response('no', { status: 404 })
  })
}

const KEY = 'everybird:resume:v1'
const carried = {
  collage: { filter: { order: 'Passeriformes' }, mode: 'true', view: 'list', massOrder: 'lightest', sci: true },
  search: { open: true },
}

/** Writes the record a language switch leaves behind (the same shape stashResume writes). */
function leaveRecord(at = Date.now()) {
  window.sessionStorage.setItem(KEY, JSON.stringify({ v: 1, at, slices: carried }))
}

beforeEach(() => {
  vi.resetModules()
  ;(globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  stubFetch()
  spy.track.mockReset()
  spy.trackFilterUsed.mockReset()
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.cookie = 'everybird-lang=; Max-Age=0; Path=/'
  window.sessionStorage.clear()
})

describe('the list store after a language switch', () => {
  it('takes the filter and the layout switches back with the stored list, without analytics', async () => {
    const storage = await import('@/lib/list/storage')
    await storage.save({ ...storage.emptySaved(), records: { obsorg: [], 'obsorg-list': [], ebird: [rec('wren'), rec('crow')], 'ebird-list': [], inat: [], sheet: [], scythebill: [], manual: [] } })
    const store = await import('@/lib/list/store')
    leaveRecord()
    const { result } = renderHook(() => store.useEverybird())
    await waitFor(() => expect(result.current[2].ready).toBe(true))
    const s = result.current[0]
    expect(s.filter).toEqual({ order: 'Passeriformes' })
    expect(s.mode).toBe('true')
    expect(s.view).toBe('list')
    expect(s.massOrder).toBe('lightest')
    expect(s.sci).toBe(true)
    expect(spy.track).not.toHaveBeenCalled()
    expect(spy.trackFilterUsed).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
  })

  it('still restores under StrictMode, whose effects run twice on mount', async () => {
    const storage = await import('@/lib/list/storage')
    await storage.save({ ...storage.emptySaved(), records: { obsorg: [], 'obsorg-list': [], ebird: [rec('wren'), rec('crow')], 'ebird-list': [], inat: [], sheet: [], scythebill: [], manual: [] } })
    const store = await import('@/lib/list/store')
    leaveRecord()
    const { result } = renderHook(() => store.useEverybird(), { wrapper: StrictMode })
    await waitFor(() => expect(result.current[2].ready).toBe(true))
    expect(result.current[0].filter).toEqual({ order: 'Passeriformes' })
    expect(result.current[0].view).toBe('list')
  })

  it('a second switch before the store is ready carries the view that is still on its way', async () => {
    const storage = await import('@/lib/list/storage')
    await storage.save({ ...storage.emptySaved(), records: { obsorg: [], 'obsorg-list': [], ebird: [rec('wren'), rec('crow')], 'ebird-list': [], inat: [], sheet: [], scythebill: [], manual: [] } })
    const store = await import('@/lib/list/store')
    const resume = await import('@/lib/view-resume')
    leaveRecord()
    const { result } = renderHook(() => store.useEverybird())
    expect(result.current[2].ready).toBe(false) // the carried view is claimed, not yet applied
    resume.stashResume(Date.now(), window.sessionStorage)
    expect(JSON.parse(window.sessionStorage.getItem(KEY)!).slices.collage).toEqual(carried.collage)
  })

  it('a normal load restores nothing', async () => {
    const store = await import('@/lib/list/store')
    const { result } = renderHook(() => store.useEverybird())
    await waitFor(() => expect(result.current[2].ready).toBe(true))
    expect(result.current[0].filter).toEqual({})
    expect(result.current[0].view).toBe('collage')
    expect(result.current[0].sci).toBe(false)
  })
})

describe('chooseLang', () => {
  it('stashes the view before it reloads, and only when the cookie was stored', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, protocol: 'http:', reload })
    const resume = await import('@/lib/view-resume')
    const { chooseLang } = await import('@/i18n/choose')
    resume.offerResume('search', () => ({ open: true }))
    chooseLang('nl')
    expect(reload).toHaveBeenCalledTimes(1)
    const rec = JSON.parse(window.sessionStorage.getItem(KEY)!)
    expect(rec.v).toBe(1)
    expect(rec.slices.search).toEqual({ open: true })
  })
})

describe('the dock search after a language switch', () => {
  it('opens the field again, with no typed text, and emits no search_applied', async () => {
    const { ControlsBar } = await import('@/components/app/ControlsBar')
    leaveRecord()
    const sp = (code: string, com: string): SpeciesRow => ({ code, com, sci: com, ord: 'Passeriformes', fam: 'Corvidae', famCom: 'Crows', to: 1, g: 1, gSrc: 'avonet', st: true, ar: 1, q: true })
    const rows = [sp('crow', 'Crow'), sp('wren', 'Wren')]
    const search = {
      entries: rows.map((r) => ({ code: r.code })),
      species: buildSpeciesIndex(rows),
      onPick: vi.fn(),
      filter: {},
      onApply: vi.fn(),
      regions,
      listPlaces: [],
      hasMonths: false,
    }
    const I18n = withI18n('en')
    render(
      <StrictMode>
        <I18n>
          <ControlsBar view="collage" onView={() => {}} trueSize={false} onTrueSize={() => {}} lightFirst={false} onDirection={() => {}} sci={false} onSci={() => {}} search={search} />
        </I18n>
      </StrictMode>,
    )
    const field = await screen.findByRole('combobox')
    expect((field as HTMLInputElement).value).toBe('')
    expect(spy.track).not.toHaveBeenCalled()
    expect(search.onApply).not.toHaveBeenCalled()
    expect(search.onPick).not.toHaveBeenCalled()
  })
})

describe('the collage after a restore', () => {
  it('a restored filter is not counted as used (filter_used), while one the birder sets is', async () => {
    const { CollageView } = await import('@/components/app/CollageView')
    const { initialState, makeReducer } = await import('@/lib/list/store')
    const { emptySaved } = await import('@/lib/list/storage')
    const { buildSpeciesIndex: build } = await import('@/lib/species/load')
    const { useReducer } = await import('react')
    const sp2 = (code: string, com: string, ord: string, fam: string): SpeciesRow =>
      ({ code, com, sci: com, ord, fam, famCom: fam, to: 1, g: 1, gSrc: 'avonet', st: true, ar: 1, q: true })
    const rows = [sp2('norfli', 'Northern Flicker', 'Piciformes', 'Picidae'), sp2('amerob', 'American Robin', 'Passeriformes', 'Turdidae')]
    const species = build(rows)
    const reduce = makeReducer({ species })
    const saved = emptySaved()
    saved.records.ebird = [
      { code: 'norfli', source: 'ebird', date: '2021-03-04', place: { country: 'CA' } },
      { code: 'amerob', source: 'ebird', date: '2023-07-08', place: { country: 'CA' } },
    ]
    // The order the provider applies: the stored list, then the carried view, before the first render.
    const init = reduce(reduce(initialState(), { type: 'restore', saved }), {
      type: 'resume',
      view: { filter: { order: 'Piciformes' }, mode: 'even', view: 'collage', massOrder: 'heaviest', sci: false },
    })
    const api: { dispatch?: (a: Parameters<typeof reduce>[1]) => void } = {}
    function Harness() {
      const [state, dispatch] = useReducer(reduce, init)
      api.dispatch = dispatch
      return <CollageView state={state} dispatch={dispatch} species={species} regions={regions} label="Test collage" />
    }
    render(<Harness />, { wrapper: withI18n('en') })
    expect(screen.getByTestId('collage-stats')).toBeInTheDocument()
    expect(spy.trackFilterUsed).not.toHaveBeenCalled()
    act(() => api.dispatch!({ type: 'filter', filter: { order: 'Passeriformes' } }))
    expect(spy.trackFilterUsed).toHaveBeenCalled()
  })
})

