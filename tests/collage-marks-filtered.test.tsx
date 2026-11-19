// @vitest-environment jsdom
// The lifer rings on the collage follow the filter: the newest and first bird shown, as the share image's row marks them.
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { useReducer } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CollageView } from '@/components/app/CollageView'
import { setLiferMark } from '@/lib/lifer-marks'
import { emptyFilter } from '@/lib/list/filters'
import type { SourceRecord } from '@/lib/list/model'
import { emptySaved } from '@/lib/list/storage'
import { initialState, makeReducer, type AppState } from '@/lib/list/store'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow } from '@/lib/species/types'

const sp = (code: string, com: string, to: number, g: number): SpeciesRow =>
  ({ code, com, sci: code, ord: 'Passeriformes', fam: 'Turdidae', famCom: 'Thrushes', to, g, gSrc: 'avonet', st: true, ar: 1, q: true })
const species = buildSpeciesIndex([sp('aaa', 'Bird A', 1, 100), sp('bbb', 'Bird B', 2, 80), sp('ccc', 'Bird C', 3, 60), sp('ddd', 'Bird D', 4, 40)])
const regions: Regions = { v: 1, countries: { CA: 'Canada' }, sub1: {} }
const rec = (code: string, date: string): SourceRecord => ({ code, source: 'ebird', date, place: { country: 'CA' } })
const reduce = makeReducer({ species })

function filtered(): AppState {
  const saved = emptySaved()
  saved.records.ebird = [rec('aaa', '2019-01-02'), rec('bbb', '2020-03-04'), rec('ccc', '2021-05-06'), rec('ddd', '2024-09-10')]
  const state = reduce(initialState(), { type: 'restore', saved })
  // 2020–2021 shows Bird B and Bird C: the whole list's first (A) and newest (D) are outside it.
  return reduce(state, { type: 'filter', filter: { ...emptyFilter(), from: '2020-01', to: '2021-12' } })
}

const box = (x: number): [number, number, number, number] => [x, 10, 40, 30]
const seed = [{ key: 'wide|even|', layout: 'wide' as const, mode: 'even' as const, W: 1000, H: 400, scale: 1, base: 10,
  boxes: new Map([['aaa', box(10)], ['bbb', box(200)], ['ccc', box(400)], ['ddd', box(600)]]) }]

function Harness() {
  const [state, dispatch] = useReducer(reduce, undefined, filtered)
  return <CollageView state={state} dispatch={dispatch} species={species} regions={regions} label="Test collage" seed={seed} />
}

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  })
  vi.stubGlobal('innerWidth', 1024)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1024, bottom: 400, width: 1024, height: 400, toJSON: () => ({}) })
  setLiferMark('newest', true)
  setLiferMark('first', true)
})
afterEach(() => {
  setLiferMark('newest', false)
  setLiferMark('first', false)
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('lifer rings under a filter', () => {
  it('mark the newest and first bird of the filtered view', async () => {
    render(<Harness />)
    const stage = await screen.findByTestId('collage-stage')
    expect(stage.querySelector('.eb-bird[data-code="ccc"]')).toHaveAttribute('data-mark', 'newest')
    expect(stage.querySelector('.eb-bird[data-code="bbb"]')).toHaveAttribute('data-mark', 'first')
    expect(stage.querySelector('.eb-bird[data-code="ddd"]')).not.toHaveAttribute('data-mark')
    expect(stage.querySelector('.eb-bird[data-code="aaa"]')).not.toHaveAttribute('data-mark')
  })
})
