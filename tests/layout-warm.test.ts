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
