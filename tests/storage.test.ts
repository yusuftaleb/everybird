import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportResult, SourceRecord } from '@/lib/list/model'
import { DEFAULT_RULES, EMPTY_EDITS } from '@/lib/list/model'

const rec = (code: string, source: SourceRecord['source'] = 'ebird'): SourceRecord => ({ code, source, date: '2020-01-02' })

async function fresh() {
  vi.resetModules()
  return import('@/lib/list/storage')
}

beforeEach(() => {
  ;(globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
})
afterEach(() => {
  vi.doUnmock('idb-keyval')
  vi.unstubAllGlobals()
})

describe('storage', () => {
  it('save/load round-trips', async () => {
    const s = await fresh()
    const saved = { ...s.emptySaved(), records: { ebird: [rec('a')], inat: [], manual: [] }, name: 'Me' }
    expect(await s.load()).toBeNull()
    expect(await s.save(saved)).toBe('saved')
    expect(await s.load()).toEqual(saved)
    expect(s.isMemoryOnly()).toBe(false)
    // survives a module reload (real persistence)
    const s2 = await fresh()
    expect(await s2.load()).toEqual(saved)
  })

  it('forget clears', async () => {
    const s = await fresh()
    await s.save(s.emptySaved())
    expect(await s.forget()).toBe('forgotten')
    expect(await s.load()).toBeNull()
    expect((await fresh()).load()).resolves.toBeNull()
  })

  it('falls back to memory when IndexedDB throws on open', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('SecurityError') } })
    const s = await fresh()
    const saved = { ...s.emptySaved(), name: 'x' }
    expect(await s.save(saved)).toBe('memory-only')
    expect(s.isMemoryOnly()).toBe(true)
    expect(await s.load()).toEqual(saved)
    expect(await s.forget()).toBe('failed') // the device copy could not be cleared
    expect(await s.load()).toBeNull() // memory is cleared either way
  })

  it('forget reports failure when the delete rejects, and still clears memory', async () => {
    vi.resetModules()
    vi.doMock('idb-keyval', async (orig) => {
      const real = await orig<typeof import('idb-keyval')>()
      return { ...real, del: () => Promise.reject(new Error('boom')) }
    })
    const s = await import('@/lib/list/storage')
    await s.save({ ...s.emptySaved(), name: 'x' })
    expect(await s.forget()).toBe('failed')
    expect(s.isMemoryOnly()).toBe(true)
    expect(await s.load()).toBeNull()
  })

  it('falls back to memory when a write rejects (quota), and stays memory-only', async () => {
    vi.resetModules()
    let fail = true
    vi.doMock('idb-keyval', async (orig) => {
      const real = await orig<typeof import('idb-keyval')>()
      return { ...real, set: (...a: Parameters<typeof real.set>) => (fail ? Promise.reject(new DOMException('full', 'QuotaExceededError')) : real.set(...a)) }
    })
    const s = await import('@/lib/list/storage')
    const a = { ...s.emptySaved(), name: 'a' }
    expect(await s.save(a)).toBe('memory-only')
    fail = false // storage recovers, but the session stays memory-only
    const b = { ...s.emptySaved(), name: 'b' }
    expect(await s.save(b)).toBe('memory-only')
    expect(await s.load()).toEqual(b)
    expect(s.isMemoryOnly()).toBe(true)
  })

  it('re-import replaces one source and keeps edits', async () => {
    const s = await fresh()
    const edits = { ...EMPTY_EDITS, removed: ['x'], fixes: { 'inat:3': 'z' } }
    const saved = {
      ...s.emptySaved(),
      name: 'Me',
      records: { ebird: [rec('e1')], inat: [rec('old', 'inat')], manual: [rec('m', 'manual')] },
      unmatched: [
        { source: 'ebird' as const, row: 1, reason: 'no-match' as const },
        { source: 'inat' as const, row: 3, reason: 'no-match' as const },
      ],
      edits,
      rules: { ...DEFAULT_RULES, hideDead: true },
      savedAt: '2020-01-01T00:00:00.000Z',
    }
    const result: ImportResult = {
      records: [rec('new1', 'inat'), rec('new2', 'inat')],
      unmatched: [{ source: 'inat', row: 9, reason: 'not-species' }],
      skipped: 0,
    }
    const out = s.replaceSource(saved, 'inat', result)
    expect(out.records.inat.map((r) => r.code)).toEqual(['new1', 'new2'])
    expect(out.records.ebird).toEqual(saved.records.ebird)
    expect(out.records.manual).toEqual(saved.records.manual)
    expect(out.unmatched).toEqual([saved.unmatched[0], result.unmatched[0]])
    expect(out.edits).toEqual(edits)
    expect(out.rules).toEqual(saved.rules)
    expect(out.name).toBe('Me')
    expect(out.savedAt).not.toBe(saved.savedAt)
    expect(saved.records.inat[0].code).toBe('old') // input not mutated
  })
})
