// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// next/script as a plain <script> (no loading in jsdom), and the app layout's other parts as pass-throughs.
vi.mock('next/script', () => ({ default: (p: Record<string, unknown>) => <script data-testid="next-script" {...(p as object)} /> }))
vi.mock('@/components/app/EverybirdProvider', () => ({ EverybirdProvider: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('@/components/app/TopBar', () => ({ TopBar: () => null }))
vi.mock('@/components/app/SiteFooter', () => ({ SiteFooter: () => null }))
vi.mock('@/components/app/VisitTracker', async (orig) => ({ ...(await orig<object>()), VisitTracker: () => null }))
vi.mock('@/components/app/app.css', () => ({}))

import AppLayout from '../app/[lang]/(app)/layout'
import { CF_BEACON_SRC, CF_BEACON_TOKEN, CloudflareBeacon } from '@/components/app/CloudflareBeacon'
import { wantsFullLoad } from '@/components/app/FullNavigation'
import { visitPageFor } from '@/components/app/VisitTracker'

/** The beacon loads on the production hostname only: the document's location is stubbed to that host (or another). */
const onHost = (host: string) => vi.stubGlobal('location', new URL(`https://${host}/`))

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  delete (navigator as { doNotTrack?: unknown }).doNotTrack
  delete (navigator as { globalPrivacyControl?: unknown }).globalPrivacyControl
})

const beacons = () => document.querySelectorAll(`script[src="${CF_BEACON_SRC}"]`)

describe('Cloudflare Web Analytics beacon', () => {
  it('renders the beacon with its public site token, after interactive', () => {
    onHost('everybird.yusuftaleb.com')
    render(<CloudflareBeacon />)
    const s = beacons()
    expect(s).toHaveLength(1)
    expect(s[0].getAttribute('data-cf-beacon')).toBe(JSON.stringify({ token: CF_BEACON_TOKEN }))
    expect(s[0].getAttribute('strategy')).toBe('afterInteractive')
  })
  it('stays out of a document that started on a shared view, even after it moved into the app', () => {
    onHost('everybird.yusuftaleb.com')
    const real = performance.getEntriesByType.bind(performance)
    const spy = vi.spyOn(performance, 'getEntriesByType').mockImplementation((t: string) =>
      t === 'navigation' ? ([{ name: 'https://everybird.yusuftaleb.com/s/1abc' }] as unknown as PerformanceEntryList) : real(t))
    render(<CloudflareBeacon />)
    expect(beacons()).toHaveLength(0)
    spy.mockRestore()
  })
  it('stays out with Do Not Track or Global Privacy Control', () => {
    onHost('everybird.yusuftaleb.com')
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true })
    render(<CloudflareBeacon />)
    expect(beacons()).toHaveLength(0)
    cleanup()
    delete (navigator as { doNotTrack?: unknown }).doNotTrack
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true })
    render(<CloudflareBeacon />)
    expect(beacons()).toHaveLength(0)
  })
  it('loads from the (app) layout on the production hostname only, on Vercel or Cloudflare alike', () => {
    onHost('everybird.yusuftaleb.com')
    for (const v of ['production', 'preview', '']) {
      cleanup()
      vi.stubEnv('VERCEL_ENV', v)
      render(<AppLayout>page</AppLayout>)
      expect(beacons(), `prod host, VERCEL_ENV=${v || 'unset'}`).toHaveLength(1)
    }
    for (const host of ['everybird-preview.vercel.app', 'everybird.yusuftaleb.workers.dev', 'localhost:3000']) {
      cleanup()
      vi.unstubAllGlobals()
      onHost(host)
      render(<AppLayout>page</AppLayout>)
      expect(beacons(), host).toHaveLength(0)
    }
  })
  it('is never in the root layout or the shared view, which the token travels through', () => {
    for (const f of ['app/[lang]/layout.tsx', 'app/global-not-found.tsx', 'app/[lang]/s/[token]/page.tsx', 'app/[lang]/s/[token]/opengraph-image.tsx']) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/CloudflareBeacon|cloudflareinsights|@vercel\/analytics/)
    }
    expect(readFileSync('app/[lang]/s/[token]/page.tsx', 'utf8')).toMatch(/<FullNavigation \/>/)
  })
})

describe('visitPageFor', () => {
  it('names the page only: / is the landing or the collage once storage is read', () => {
    expect(visitPageFor('/', null)).toBeNull()
    expect(visitPageFor('/', false)).toBe('landing')
    expect(visitPageFor('/', true)).toBe('collage')
    expect(visitPageFor('/settings', true)).toBe('settings')
    expect(visitPageFor('/about', null)).toBe('about')
    expect(visitPageFor('/compare', null)).toBe('compare')
    expect(visitPageFor('/s/v1.token', false)).toBeNull()
  })
})

describe('wantsFullLoad (the shared view leaves by full page loads)', () => {
  const here = new URL('https://everybird.yusuftaleb.com/s/1abc') as unknown as Location
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }
  const a = (href: string, attrs: Record<string, string> = {}) => {
    const el = document.createElement('a')
    el.href = href
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    return el
  }
  it('takes plain clicks on links into the app', () => {
    for (const h of ['https://everybird.yusuftaleb.com/settings', 'https://everybird.yusuftaleb.com/', 'https://everybird.yusuftaleb.com/about#credits']) {
      expect(wantsFullLoad(click, a(h), here), h).toBe(true)
    }
  })
  it('leaves new-tab clicks, other sites, downloads and same-page hashes alone', () => {
    expect(wantsFullLoad({ ...click, metaKey: true }, a('https://everybird.yusuftaleb.com/settings'), here)).toBe(false)
    expect(wantsFullLoad({ ...click, button: 1 }, a('https://everybird.yusuftaleb.com/settings'), here)).toBe(false)
    expect(wantsFullLoad(click, a('https://www.yusuftaleb.com/'), here)).toBe(false)
    expect(wantsFullLoad(click, a('https://everybird.yusuftaleb.com/settings', { target: '_blank' }), here)).toBe(false)
    expect(wantsFullLoad(click, a('https://everybird.yusuftaleb.com/x.png', { download: '' }), here)).toBe(false)
    expect(wantsFullLoad(click, a('https://everybird.yusuftaleb.com/s/1abc#top'), here)).toBe(false)
  })
})
