// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SourceRecord } from '@/lib/list/model'
import { EMPTY_EDITS } from '@/lib/list/model'

const row = (code: string, to: number) => ({ code, com: code, sci: code, ord: 'Passeriformes', fam: 'Corvidae', famCom: 'Crows', to, g: 1, gSrc: 'family', st: true, ar: 1, q: true })
const speciesFile = { v: 1, species: [row('crow', 10), row('wren', 12)] }
const regionsFile = { v: 1, countries: { CA: 'Canada', EG: 'Egypt [x]' }, sub1: {} }
const rec = (code: string): SourceRecord => ({ code, source: 'ebird', date: '2020-01-02', place: { country: 'CA' } })

function stubFetch() {
  vi.stubGlobal('fetch', async (u: string | URL) => {
    const url = String(u)
    const body = url.includes('species.v1') ? speciesFile : url.includes('regions.v1') ? regionsFile : null
    return body ? new Response(JSON.stringify(body)) : new Response('no', { status: 404 })
  })
}

async function setup() {
  vi.resetModules()
  ;(globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  stubFetch()
  const storage = await import('@/lib/list/storage')
  const store = await import('@/lib/list/store')
  return { storage, store }
}
afterEach(() => vi.unstubAllGlobals())
beforeEach(() => vi.useRealTimers())

describe('useEverybird', () => {
  it('loads species + the stored list and becomes ready, without overwriting storage', async () => {
    const { storage, store } = await setup()
    await storage.save({ ...storage.emptySaved(), records: { ebird: [rec('wren'), rec('crow')], 'ebird-list': [], inat: [], manual: [] } })
    const { result } = renderHook(() => store.useEverybird())
    expect(result.current[2].ready).toBe(false)
    await waitFor(() => expect(result.current[2].ready).toBe(true))
    expect(result.current[0].list.map((e) => e.code)).toEqual(['crow', 'wren'])
    expect(result.current[0].persistence).toBe('idle')
    await new Promise((r) => setTimeout(r, 700))
    expect((await storage.load())!.records.ebird).toHaveLength(2)
  })

  it('does not save an empty initial state', async () => {
    const { storage, store } = await setup()
    const { result } = renderHook(() => store.useEverybird())
    await waitFor(() => expect(result.current[2].ready).toBe(true))
    await new Promise((r) => setTimeout(r, 700))
    expect(await storage.load()).toBeNull()
    expect(result.current[0].persistence).toBe('idle')
  })

  it('debounces saves by 500 ms and reports saved', async () => {
    const { storage, store } = await setup()
    const { result } = renderHook(() => store.useEverybird())
    await waitFor(() => expect(result.current[2].ready).toBe(true))
    act(() => result.current[1]({ type: 'import', source: 'ebird', result: { records: [rec('crow')], unmatched: [], skipped: 0 } }))
    act(() => result.current[1]({ type: 'edit', edits: { ...EMPTY_EDITS, removed: ['wren'] } }))
    await new Promise((r) => setTimeout(r, 200))
    expect(await storage.load()).toBeNull()
    await waitFor(() => expect(result.current[0].persistence).toBe('saved'), { timeout: 2000 })
    const got = await storage.load()
    expect(got!.records.ebird).toHaveLength(1)
    expect(got!.edits.removed).toEqual(['wren'])
  })

  it('flushes a pending save on pagehide', async () => {
    const { storage, store } = await setup()
    const { result } = renderHook(() => store.useEverybird())
    await waitFor(() => expect(result.current[2].ready).toBe(true))
    act(() => result.current[1]({ type: 'import', source: 'ebird', result: { records: [rec('crow')], unmatched: [], skipped: 0 } }))
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    await waitFor(async () => expect((await storage.load())?.records.ebird).toHaveLength(1), { timeout: 400 })
  })

  it('reports memory-only when storage is unavailable', async () => {
    vi.resetModules()
    stubFetch()
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('SecurityError') } })
    const store = await import('@/lib/list/store')
    const { result } = renderHook(() => store.useEverybird())
    await waitFor(() => expect(result.current[2].ready).toBe(true))
    expect(result.current[0].persistence).toBe('memory-only')
  })

  it('forget clears state and storage, and does not re-save the empty list', async () => {
    const { storage, store } = await setup()
    await storage.save({ ...storage.emptySaved(), records: { ebird: [rec('crow')], 'ebird-list': [], inat: [], manual: [] } })
    const { result } = renderHook(() => store.useEverybird())
    await waitFor(() => expect(result.current[2].ready).toBe(true))
    await act(async () => { result.current[1]({ type: 'forget' }) })
    await waitFor(() => expect(result.current[2].forgetOutcome).toBe('forgotten'))
    expect(result.current[0].list).toEqual([])
    await new Promise((r) => setTimeout(r, 700))
    expect(await storage.load()).toBeNull()
  })

  it('surfaces a failed forget', async () => {
    vi.resetModules()
    stubFetch()
    vi.doMock('@/lib/list/storage', async (orig) => ({ ...(await orig<typeof import('@/lib/list/storage')>()), forget: async () => 'failed' as const }))
    const store = await import('@/lib/list/store')
    const { result } = renderHook(() => store.useEverybird())
    await waitFor(() => expect(result.current[2].ready).toBe(true))
    await act(async () => { result.current[1]({ type: 'forget' }) })
    await waitFor(() => expect(result.current[2].forgetOutcome).toBe('failed'))
    vi.doUnmock('@/lib/list/storage')
  })

  it('reports an error when the species data cannot load', async () => {
    vi.resetModules()
    vi.stubGlobal('fetch', async () => new Response('no', { status: 500 }))
    const store = await import('@/lib/list/store')
    const { result } = renderHook(() => store.useEverybird())
    await waitFor(() => expect(result.current[2].error).toBeTruthy())
    expect(result.current[2].ready).toBe(false)
  })

  it('queues dispatches made before ready; the late restore does not overwrite them', async () => {
    const { storage, store } = await setup()
    await storage.save({ ...storage.emptySaved(), records: { ebird: [rec('crow')], 'ebird-list': [], inat: [], manual: [] } })
    const { result } = renderHook(() => store.useEverybird())
    expect(result.current[2].ready).toBe(false)
    act(() => result.current[1]({ type: 'import', source: 'inat', result: { records: [{ ...rec('wren'), source: 'inat' }], unmatched: [], skipped: 0 } }))
    await waitFor(() => expect(result.current[2].ready).toBe(true))
    await waitFor(() => expect(result.current[0].list.map((e) => e.code)).toEqual(['crow', 'wren']))
    // The queued import is saved on top of the stored list (not skipped as if it were the restore).
    await waitFor(() => expect(result.current[0].persistence).toBe('saved'), { timeout: 2000 })
    const got = await storage.load()
    expect(got!.records.ebird.map((r) => r.code)).toEqual(['crow'])
    expect(got!.records.inat.map((r) => r.code)).toEqual(['wren'])
  })

  it('after a failed forget, persistence follows isMemoryOnly()', async () => {
    vi.resetModules()
    stubFetch()
    ;(globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
    let memOnly = false
    vi.doMock('@/lib/list/storage', async (orig) => ({
      ...(await orig<typeof import('@/lib/list/storage')>()),
      forget: async () => { memOnly = true; return 'failed' as const },
      isMemoryOnly: () => memOnly,
    }))
    const store = await import('@/lib/list/store')
    const { result } = renderHook(() => store.useEverybird())
    await waitFor(() => expect(result.current[2].ready).toBe(true))
    expect(result.current[0].persistence).toBe('idle')
    await act(async () => { result.current[1]({ type: 'forget' }) })
    await waitFor(() => expect(result.current[2].forgetOutcome).toBe('failed'))
    expect(result.current[0].persistence).toBe('memory-only')
    vi.doUnmock('@/lib/list/storage')
  })

  it('forgetOutcome resets on the next forget and after a successful save', async () => {
    vi.resetModules()
    stubFetch()
    ;(globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
    let outcome: 'failed' | 'forgotten' = 'failed'
    let release: () => void = () => {}
    vi.doMock('@/lib/list/storage', async (orig) => ({
      ...(await orig<typeof import('@/lib/list/storage')>()),
      forget: () => new Promise<'failed' | 'forgotten'>((done) => { release = () => done(outcome) }),
    }))
    const store = await import('@/lib/list/store')
    const { result } = renderHook(() => store.useEverybird())
    await waitFor(() => expect(result.current[2].ready).toBe(true))
    await act(async () => { result.current[1]({ type: 'forget' }) })
    await act(async () => { release() })
    await waitFor(() => expect(result.current[2].forgetOutcome).toBe('failed'))
    // A new forget clears the old outcome while it runs.
    outcome = 'forgotten'
    await act(async () => { result.current[1]({ type: 'forget' }) })
    expect(result.current[2].forgetOutcome).toBeUndefined()
    await act(async () => { release() })
    await waitFor(() => expect(result.current[2].forgetOutcome).toBe('forgotten'))
    // A successful save also clears it.
    act(() => result.current[1]({ type: 'import', source: 'ebird', result: { records: [rec('crow')], unmatched: [], skipped: 0 } }))
    await waitFor(() => expect(result.current[0].persistence).toBe('saved'), { timeout: 2000 })
    expect(result.current[2].forgetOutcome).toBeUndefined()
    vi.doUnmock('@/lib/list/storage')
  })
})
