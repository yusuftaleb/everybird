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
vi.mock('@/lib/layout/layout-client', () => ({ createLayoutClient: () => fake }))
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
})
