// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Filter } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
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

type P = { list: ListEntry[]; filter: Filter }
const setup = (list: ListEntry[]) =>
  renderHook((p: P) => useCollageLayout({ ...p, mode: 'even', species, container }), { initialProps: { list, filter: {} } as P })

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
    h.rerender({ list: [e('a', { heard: true }), e('b')], filter: {} })
    h.rerender({ list: [e('a', { heard: true }), e('b', { media: true })], filter: {} })
    expect(fake.setList).toHaveBeenCalledTimes(1)
    expect(fake.refilter).not.toHaveBeenCalled()
  })

  it('a new date or place keeps the packed collage and only re-resolves filters', () => {
    const h = setup([e('a'), e('b')])
    h.rerender({ list: [e('a', { date: '2019-01' }), e('b')], filter: {} })
    expect(fake.setList).toHaveBeenCalledTimes(1)
    expect(fake.refilter).toHaveBeenCalledTimes(1)
    h.rerender({ list: [e('a', { date: '2019-01', place: { country: 'EG' } }), e('b')], filter: {} })
    expect(fake.refilter).toHaveBeenCalledTimes(2)
    // The client resolves filters against the newest list.
    const resolve = fake.setList.mock.calls[0][1] as (f: Filter) => string[]
    expect(resolve({ year: '2019' })).toEqual(['a'])
  })

  it('a different set of birds re-packs', () => {
    const h = setup([e('a'), e('b')])
    h.rerender({ list: [e('a'), e('b'), e('c')], filter: {} })
    expect(fake.setList).toHaveBeenCalledTimes(2)
    expect((fake.setList.mock.calls[1][0] as { code: string }[]).map((x) => x.code)).toEqual(['a', 'b', 'c'])
  })

  it('gives a new client its list (Strict Mode remounts the client)', () => {
    renderHook((p: P) => useCollageLayout({ ...p, mode: 'even', species, container }), {
      initialProps: { list: [e('a')], filter: {} } as P,
      reactStrictMode: true,
    })
    expect(clients.length).toBe(2)
    expect(fake.setList).toHaveBeenCalledTimes(2)
    expect(fake.setList.mock.contexts.at(-1)).toBe(clients[1])
  })
})

describe('childFilters and timeless', () => {
  it('prefetches the next taxonomy level and countries, never a time state (range drags are not guessed ahead)', async () => {
    const { childFilters, timeless } = await import('@/components/app/use-collage-layout')
    const list = [e('a', { date: '2019-01-02' }), e('b', { date: '2020-03-04' })]
    const out = childFilters(list, {}, species)
    expect(out.length).toBeGreaterThan(0)
    expect(out.some((f) => f.year || f.from || f.to)).toBe(false)
    expect(timeless({ order: 'X', year: '2020', from: '2020-01', to: '2020-02' })).toEqual({ order: 'X' })
  })
})

describe('stillView', () => {
  it('a preview hides birds outside the range; else as is', async () => {
    const { stillView } = await import('@/components/app/use-collage-layout')
    const box: [number, number, number, number] = [0, 0, 1, 1]
    const layout = (key: string) => ({ key, layout: 'wide' as const, mode: 'even' as const, W: 10, H: 10, scale: 1, base: 1, boxes: new Map([['a', box], ['b', box]]) })
    const full = { layout: layout('wide|even|'), visible: new Set(['a', 'b']) }
    const dates = new Map([['a', '2020-01-02'], ['b', '2021-05-03']])
    expect([...stillView(full, '', { dates, from: '2021-01' }).visible]).toEqual(['b'])
    expect(stillView(full, '', null)).toBe(full)
  })

  it('a committed preview stands in over the old layout, then lets the committed range\'s layout travel (not still)', async () => {
    const { stillView } = await import('@/components/app/use-collage-layout')
    const box: [number, number, number, number] = [0, 0, 1, 1]
    const layout = (key: string) => ({ key, layout: 'wide' as const, mode: 'even' as const, W: 10, H: 10, scale: 1, base: 1, boxes: new Map([['a', box], ['b', box]]) })
    const dates = new Map([['a', '2020-01-02'], ['b', '2021-05-03']])
    const old = { layout: layout('wide|even|'), visible: new Set(['a', 'b']) }
    const preview = { dates, to: '2020-12', committed: true }
    // The filter is committed (want = its key) but the old layout is still shown: the preview's visibility, still.
    expect(stillView(old, 'r:~2020-12', preview)).toEqual({ layout: old.layout, visible: new Set(['a']), still: true })
    // The committed layout lands: shown as it is, so it travels.
    const next = { layout: layout('wide|even|r:~2020-12'), visible: new Set(['a']) }
    expect(stillView(next, 'r:~2020-12', preview)).toBe(next)
    // Uncommitted (still dragging): the shown layout matches the unchanged filter, and the preview applies.
    expect(stillView(old, '', { dates, to: '2020-12' }).still).toBe(true)
  })
})
