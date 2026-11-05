// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { redactAnalyticsEvent, redactShareToken, track } from '@/lib/analytics'

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

describe('redactShareToken', () => {
  it('replaces the share token in /s/<token> paths', () => {
    expect(redactShareToken('https://everybird.vercel.app/s/v1.AbC-_123')).toBe('https://everybird.vercel.app/s/[token]')
    expect(redactShareToken('/s/v1.AbC')).toBe('/s/[token]')
  })
  it('keeps the query and hash', () => {
    expect(redactShareToken('https://everybird.vercel.app/s/v1.AbC?ref=x#top')).toBe('https://everybird.vercel.app/s/[token]?ref=x#top')
    expect(redactShareToken('/s/v1.AbC#y')).toBe('/s/[token]#y')
  })
  it('leaves other paths untouched', () => {
    for (const u of ['https://everybird.vercel.app/', 'https://everybird.vercel.app/credits', '/s', '/s/', '/sx/abc', '/?s=/s/abc']) {
      expect(redactShareToken(u)).toBe(u)
    }
  })
  it('redacts both page views and custom events (the Analytics beforeSend)', () => {
    expect(redactAnalyticsEvent({ type: 'pageview', url: 'https://e.app/s/tok' })).toEqual({ type: 'pageview', url: 'https://e.app/s/[token]' })
    expect(redactAnalyticsEvent({ type: 'event', url: 'https://e.app/s/tok?q=1' })).toEqual({ type: 'event', url: 'https://e.app/s/[token]?q=1' })
  })
})
