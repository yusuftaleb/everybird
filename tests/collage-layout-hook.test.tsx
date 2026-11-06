// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Filter } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import type { Trip } from '@/lib/list/trips'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'

// A fake client: records setList / refilter and never resolves get() (layouts aren't the point here).
const fake = {
  setList: vi.fn(),
  refilter: vi.fn(),
  get: vi.fn(() => new Promise(() => {})),
  prefetch: vi.fn(),
  dispose: vi.fn(),
}
const clients: object[] = []
// A new object per client (shared spies), so client identity is observable.
vi.mock('@/lib/layout/layout-client', () => ({ createLayoutClient: () => { const c = { ...fake }; clients.push(c); return c } }))
const { useCollageLayout } = await import('@/components/app/use-collage-layout')

const row = (code: string, to: number, g: number) => ({ code, com: code, sci: code, ord: 'Passeriformes', fam: 'Corvidae', famCom: 'Crows', to, g, gSrc: 'family', st: true, ar: 1, q: true }) as SpeciesRow
const species = buildSpeciesIndex([row('a', 1, 10), row('b', 2, 20), row('c', 3, 30)])
const e = (code: string, extra: Partial<ListEntry> = {}): ListEntry => ({ code, date: '2020-05', place: { country: 'CA' }, heard: false, dead: false, media: false, sources: ['ebird'], ...extra })
const container = { current: document.createElement('div') }

type P = { list: ListEntry[]; trips: Trip[]; filter: Filter }
const setup = (list: ListEntry[]) =>
  renderHook((p: P) => useCollageLayout({ ...p, mode: 'even', species, container }), { initialProps: { list, trips: [], filter: {} } as P })

beforeEach(() => {
  Object.values(fake).forEach((f) => f.mockClear())
  clients.length = 0
  vi.stubGlobal('Worker', class {})
})
afterEach(() => vi.unstubAllGlobals())

describe('useCollageLayout', () => {
  it('a mark edit (same codes and masses) neither re-packs nor drops the filtered states', () => {
    const h = setup([e('a'), e('b')])
    expect(fake.setList).toHaveBeenCalledTimes(1)
    h.rerender({ list: [e('a', { heard: true }), e('b')], trips: [], filter: {} })
    h.rerender({ list: [e('a', { heard: true }), e('b', { media: true })], trips: [], filter: {} })
    expect(fake.setList).toHaveBeenCalledTimes(1)
    expect(fake.refilter).not.toHaveBeenCalled()
  })

  it('a new date or place keeps the packed collage and only re-resolves filters', () => {
    const h = setup([e('a'), e('b')])
    h.rerender({ list: [e('a', { date: '2019-01' }), e('b')], trips: [], filter: {} })
    expect(fake.setList).toHaveBeenCalledTimes(1)
    expect(fake.refilter).toHaveBeenCalledTimes(1)
    h.rerender({ list: [e('a', { date: '2019-01' }), e('b')], trips: [{ id: 't1', country: 'CA', start: '2019-01-01', end: '2019-01-02', label: 'x', codes: ['a'] }], filter: {} })
    expect(fake.refilter).toHaveBeenCalledTimes(2)
    // The client resolves filters against the newest list.
    const resolve = fake.setList.mock.calls[0][1] as (f: Filter) => string[]
    expect(resolve({ year: '2019' })).toEqual(['a'])
  })

  it('a different set of birds re-packs', () => {
    const h = setup([e('a'), e('b')])
    h.rerender({ list: [e('a'), e('b'), e('c')], trips: [], filter: {} })
    expect(fake.setList).toHaveBeenCalledTimes(2)
    expect((fake.setList.mock.calls[1][0] as { code: string }[]).map((x) => x.code)).toEqual(['a', 'b', 'c'])
  })

  it('gives a new client its list (Strict Mode remounts the client)', () => {
    renderHook((p: P) => useCollageLayout({ ...p, mode: 'even', species, container }), {
      initialProps: { list: [e('a')], trips: [], filter: {} } as P,
      reactStrictMode: true,
    })
    expect(clients.length).toBe(2)
    expect(fake.setList).toHaveBeenCalledTimes(2)
    expect(fake.setList.mock.contexts.at(-1)).toBe(clients[1])
  })
})

describe('childFilters and timeless', () => {
  it('with no time chosen, prefetches the latest trips as a bracket tap sets them; none once a range is set', async () => {
    const { childFilters, timeless } = await import('@/components/app/use-collage-layout')
    const list = [e('a', { date: '2019-01-02' }), e('b', { date: '2020-03-04' })]
    const trips: Trip[] = [
      { id: 't1', country: 'EG', start: '2019-01-01', end: '2019-02-02', label: 'x', codes: ['a'] },
      { id: 't2', country: 'EG', start: '2020-03-01', end: '2020-03-05', label: 'y', codes: ['b'] },
    ]
    const out = childFilters(list, {}, species, trips)
    expect(out.filter((f) => f.trip)).toEqual([
      { trip: 't2', from: '2020-03', to: '2020-03' },
      { trip: 't1', from: '2019-01', to: '2019-02' },
    ])
    expect(out.some((f) => f.year)).toBe(false)
    expect(childFilters(list, { from: '2019-01' }, species, trips).some((f) => f.trip)).toBe(false)
    expect(timeless({ order: 'X', year: '2020', from: '2020-01', to: '2020-02', trip: 't' })).toEqual({ order: 'X' })
  })
})
