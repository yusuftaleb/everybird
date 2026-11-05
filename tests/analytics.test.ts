// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { track } from '@/lib/analytics'

type VaWindow = Window & { va?: (...args: unknown[]) => void }

afterEach(() => {
  delete (window as VaWindow).va
})

describe('track', () => {
  it('is a harmless no-op when the Vercel script is absent (dev, tests)', () => {
    expect(() => track('collage_made', { source: 'ebird' })).not.toThrow()
  })
  it('sends only the event name and its one anonymous property', () => {
    const va = vi.fn()
    ;(window as VaWindow).va = va
    track('collage_made', { source: 'inat' })
    track('image_downloaded', { format: 'story' })
    track('link_copied', { level: 'countries' })
    expect(va.mock.calls).toEqual([
      ['event', { name: 'collage_made', data: { source: 'inat' }, options: undefined }],
      ['event', { name: 'image_downloaded', data: { format: 'story' }, options: undefined }],
      ['event', { name: 'link_copied', data: { level: 'countries' }, options: undefined }],
    ])
  })
  it('never throws, even if the analytics queue does', () => {
    ;(window as VaWindow).va = () => { throw new Error('blocked') }
    expect(() => track('link_copied', { level: 'species' })).not.toThrow()
  })
})
