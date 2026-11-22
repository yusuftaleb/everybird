// warmLayoutWorker starts one worker (and its masks download) ahead of the collage; the next client takes it.
import { afterEach, describe, expect, it, vi } from 'vitest'

class FakeWorker {
  static made: FakeWorker[] = []
  sent: unknown[] = []
  terminated = false
  onmessage: unknown = null
  onerror: unknown = null
  onmessageerror: unknown = null
  constructor() { FakeWorker.made.push(this) }
  postMessage(m: unknown) { this.sent.push(m) }
  terminate() { this.terminated = true }
}

describe('warmLayoutWorker', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); FakeWorker.made = [] })

  it('starts one worker with a warm message, handed to the next client only', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const { createLayoutClient, warmLayoutWorker } = await import('@/lib/layout/layout-client')
    warmLayoutWorker()
    warmLayoutWorker() // one spare at most
    expect(FakeWorker.made).toHaveLength(1)
    expect(FakeWorker.made[0].sent).toEqual([{ type: 'warm' }])
    const a = createLayoutClient()
    expect(FakeWorker.made).toHaveLength(1) // the spare, not a new worker
    a.setList([{ code: 'x', mass: 1, ord: 'O' }])
    expect(FakeWorker.made[0].sent[1]).toMatchObject({ type: 'setList' })
    createLayoutClient()
    expect(FakeWorker.made).toHaveLength(2) // the spare is gone: a new worker
  })

  it('does nothing without Worker', async () => {
    vi.stubGlobal('Worker', undefined)
    const { warmLayoutWorker } = await import('@/lib/layout/layout-client')
    expect(() => warmLayoutWorker()).not.toThrow()
  })
})

describe('masks sent with the list', () => {
  it('the worker packs with them and never calls its loader', async () => {
    const { createLayoutHandler } = await import('@/lib/layout/layout.worker')
    const { maskFromAlpha } = await import('@/lib/layout/mask')
    const calls: string[] = []
    const handle = createLayoutHandler(async (o) => { calls.push(o); return {} })
    const m = maskFromAlpha(new Uint8Array(48 * 24).fill(255), 48, 24)
    const r = await handle({ type: 'setList', id: 1, entries: [{ code: 'a', mass: 10, ord: 'O' }], masks: { O: { a: m } } })
    expect(r.type).toBe('ready')
    expect(calls).toEqual([])
    await handle({ type: 'setList', id: 2, entries: [{ code: 'a', mass: 10, ord: 'O' }] })
    expect(calls).toEqual(['O']) // without them, the masks file as before
  })

  it('masksInHand gives every bird\'s mask, or nothing when one is missing', async () => {
    const { addMasks, masksInHand } = await import('@/lib/data-url')
    const m: [number, number, string] = [24, 24, 'AA==']
    addMasks({ O: { a: m }, P: { b: m } })
    expect(masksInHand([{ code: 'a', ord: 'O' }, { code: 'b', ord: 'P' }])).toEqual({ O: { a: m }, P: { b: m } })
    expect(masksInHand([{ code: 'a', ord: 'O' }, { code: 'c', ord: 'O' }])).toBeUndefined()
    expect(masksInHand([{ code: 'b', ord: 'O' }])).toBeUndefined() // a code is looked up under its own order
  })
})
