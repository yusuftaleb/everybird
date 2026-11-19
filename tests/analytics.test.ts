// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ALLOWED, PRODUCTION_HOST, resetFilterUsed, trackFilterUsed, STATS_ENDPOINT, WIRE_LEVEL, automatedRun, isTouchMac, optedOut, payloadFor, sendEvent, track,
  type SendEnv, type StatsHookWindow,
} from '@/lib/analytics'
import type { ShareLevel } from '@/lib/share/link'

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

function env(over: Partial<SendEnv> & { nav?: Partial<SendEnv['navigator']> } = {}) {
  const beacon = vi.fn<(url: string, data?: BodyInit | null) => boolean>(() => true)
  const fetchFn = vi.fn(async () => new Response(null))
  const e: SendEnv = {
    hostname: PRODUCTION_HOST,
    navigator: { userAgent: IPHONE, maxTouchPoints: 5, sendBeacon: beacon, ...over.nav },
    fetch: fetchFn as unknown as typeof fetch,
    ...over,
  }
  return { e, beacon, fetchFn }
}
const blobText = (b: unknown) => (b as Blob).text()

/** Every key and value a payload may hold: nothing from the list (names, species, places, counts, URLs). */
function assertClean(body: string) {
  const o = JSON.parse(body) as Record<string, unknown>
  expect(Object.keys(o).every((k) => ['n', 'p', 'd', 'l'].includes(k))).toBe(true)
  expect(ALLOWED[o.n as keyof typeof ALLOWED]).toContain(o.p)
  if ('d' in o) expect(o.d).toBe('touch')
  if ('l' in o) {
    expect(o.n).toBe('visit')
    expect(o.l).toMatch(/^[a-z]{2,3}$/)
  }
}

afterEach(() => {
  delete (window as StatsHookWindow).__everybirdStats
})

describe('payloadFor', () => {
  it('is {n, p} with the one allowed value, and d: touch only for a touch Mac', () => {
    expect(payloadFor('collage_made', { source: 'inat' })).toEqual({ n: 'collage_made', p: 'inat' })
    expect(payloadFor('collage_made', { source: 'obsorg' })).toEqual({ n: 'collage_made', p: 'obsorg' })
    expect(payloadFor('visit', { page: 'shared' })).toEqual({ n: 'visit', p: 'shared' })
    expect(payloadFor('shared', { via: 'link' })).toEqual({ n: 'shared', p: 'link' })
    expect(payloadFor('image_downloaded', { format: 'post' }, true)).toEqual({ n: 'image_downloaded', p: 'post', d: 'touch' })
    for (const size of ['us12x18', 'us18x24', 'us24x36', 'us12x18-l', 'us18x24-l', 'us24x36-l'] as const) {
      expect(payloadFor('poster_made', { size })).toEqual({ n: 'poster_made', p: size })
    }
  })
  it("maps the app's link levels onto the Worker's values", () => {
    for (const level of ['regions', 'countries', 'dates', 'species'] as ShareLevel[]) {
      expect(payloadFor('link_copied', { level })).toEqual({ n: 'link_copied', p: WIRE_LEVEL[level] })
      expect(ALLOWED.link_copied).toContain(WIRE_LEVEL[level])
    }
  })
  it('drops anything off the list: unknown events, values, extra props', () => {
    expect(payloadFor('nope' as 'visit', { page: 'about' })).toBeNull()
    expect(payloadFor('visit', { page: '/s/v1.secret' as 'about' })).toBeNull()
    expect(payloadFor('collage_made', { source: 'Ada Birder' as 'ebird' })).toBeNull()
    expect(payloadFor('image_downloaded', { format: 'story', name: 'Ada' } as unknown as { format: 'story' })).toBeNull()
    expect(payloadFor('link_copied', { level: 'full' as ShareLevel })).toBeNull() // only the app's own names map
  })
})

describe('the browser language', () => {
  it('a visit carries the primary subtag of the browser language', async () => {
    const body = async (language: string | undefined) => {
      const { e, beacon } = env({ nav: { language } })
      expect(sendEvent('visit', { page: 'landing' }, e)).toBe(true)
      return JSON.parse(await blobText(beacon.mock.calls[0][1])) as Record<string, unknown>
    }
    expect(await body('pt-BR')).toEqual({ n: 'visit', p: 'landing', l: 'pt' })
    expect(await body('zh-Hant-TW')).toEqual({ n: 'visit', p: 'landing', l: 'zh' })
    expect(await body('es')).toEqual({ n: 'visit', p: 'landing', l: 'es' })
    for (const bad of ['x', '', 'english', '12-US', undefined]) expect(await body(bad), String(bad)).toEqual({ n: 'visit', p: 'landing' })
    const ipad = env({ nav: { userAgent: MAC, maxTouchPoints: 5, language: 'nl-NL' } })
    sendEvent('visit', { page: 'about' }, ipad.e)
    expect(await blobText(ipad.beacon.mock.calls[0][1])).toBe('{"n":"visit","p":"about","d":"touch","l":"nl"}')
  })
  it('other events never carry l', async () => {
    const { e, beacon } = env({ nav: { language: 'es-MX' } })
    sendEvent('collage_made', { source: 'ebird' }, e)
    sendEvent('image_downloaded', { format: 'story' }, e)
    sendEvent('shared', { via: 'post' }, e)
    sendEvent('link_copied', { level: 'regions' }, e)
    expect(beacon).toHaveBeenCalledTimes(4)
    for (const c of beacon.mock.calls) {
      const text = await blobText(c[1])
      expect(JSON.parse(text)).not.toHaveProperty('l')
      assertClean(text)
    }
    expect(payloadFor('collage_made', { source: 'inat' }, false, 'es')).toEqual({ n: 'collage_made', p: 'inat' })
  })
  it('DNT, GPC and automated runs still send nothing', () => {
    for (const nav of [{ doNotTrack: '1', language: 'es' }, { globalPrivacyControl: true, language: 'es' }]) {
      const { e, beacon } = env({ nav })
      expect(sendEvent('visit', { page: 'about' }, e)).toBe(false)
      expect(beacon).not.toHaveBeenCalled()
    }
    const { e, beacon } = env({ nav: { language: 'es' }, automated: true })
    expect(sendEvent('visit', { page: 'about' }, e)).toBe(false)
    expect(beacon).not.toHaveBeenCalled()
  })
})

describe('sendEvent', () => {
  it('sends one text/plain beacon to the Worker on the production host, with only n/p/d', async () => {
    const { e, beacon, fetchFn } = env()
    expect(sendEvent('image_downloaded', { format: 'story' }, e)).toBe(true)
    expect(sendEvent('link_copied', { level: 'countries' }, e)).toBe(true)
    expect(beacon).toHaveBeenCalledTimes(2)
    const [url, data] = beacon.mock.calls[0]
    expect(url).toBe(STATS_ENDPOINT)
    expect((data as Blob).type).toBe('text/plain')
    expect(await blobText(data)).toBe('{"n":"image_downloaded","p":"story"}')
    expect(await blobText(beacon.mock.calls[1][1])).toBe('{"n":"link_copied","p":"compact"}')
    for (const c of beacon.mock.calls) assertClean(await blobText(c[1]))
    expect(fetchFn).not.toHaveBeenCalled()
  })
  it('adds d: touch for an iPad reporting a Mac, not for a real Mac or an iPhone', async () => {
    const ipad = env({ nav: { userAgent: MAC, maxTouchPoints: 5 } })
    sendEvent('visit', { page: 'landing' }, ipad.e)
    expect(await blobText(ipad.beacon.mock.calls[0][1])).toBe('{"n":"visit","p":"landing","d":"touch"}')
    const mac = env({ nav: { userAgent: MAC, maxTouchPoints: 0 } })
    sendEvent('visit', { page: 'landing' }, mac.e)
    expect(await blobText(mac.beacon.mock.calls[0][1])).toBe('{"n":"visit","p":"landing"}')
    expect(isTouchMac({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(false)
  })
  it('falls back to a keepalive no-cors fetch when sendBeacon is missing or refuses', () => {
    for (const sendBeacon of [undefined, vi.fn(() => false)]) {
      const { e, fetchFn } = env({ nav: { sendBeacon } })
      expect(sendEvent('shared', { via: 'square' }, e)).toBe(true)
      expect(fetchFn).toHaveBeenCalledWith(STATS_ENDPOINT, expect.objectContaining({
        method: 'POST', body: '{"n":"shared","p":"square"}', keepalive: true, mode: 'no-cors', credentials: 'omit',
      }))
    }
  })
  it('sends nothing off the production hostname (dev, previews, tests)', () => {
    for (const hostname of ['localhost', '127.0.0.1', 'everybird-git-x.vercel.app', 'evil.everybird.yusuftaleb.com.example']) {
      const { e, beacon, fetchFn } = env({ hostname })
      expect(sendEvent('visit', { page: 'about' }, e)).toBe(false)
      expect(beacon).not.toHaveBeenCalled()
      expect(fetchFn).not.toHaveBeenCalled()
    }
  })
  it('sends nothing with Do Not Track or Global Privacy Control, not even to the test hook', () => {
    const hook = vi.fn()
    for (const nav of [{ doNotTrack: '1' }, { doNotTrack: 'yes' }, { globalPrivacyControl: true }]) {
      const { e, beacon } = env({ nav })
      expect(sendEvent('visit', { page: 'about' }, e)).toBe(false)
      expect(sendEvent('visit', { page: 'about' }, { ...e, hook })).toBe(false)
      expect(beacon).not.toHaveBeenCalled()
    }
    const { e, beacon } = env({ windowDnt: '1' })
    expect(sendEvent('visit', { page: 'about' }, e)).toBe(false)
    expect(beacon).not.toHaveBeenCalled()
    expect(hook).not.toHaveBeenCalled()
    expect(optedOut({ userAgent: '', maxTouchPoints: 0, doNotTrack: '0', globalPrivacyControl: false })).toBe(false)
  })
  it('hands the body to the hook instead of the network, on any host', () => {
    const hook = vi.fn()
    const { e, beacon } = env({ hostname: 'localhost', hook })
    expect(sendEvent('collage_made', { source: 'manual' }, e)).toBe(true)
    expect(hook).toHaveBeenCalledWith('{"n":"collage_made","p":"manual"}')
    expect(beacon).not.toHaveBeenCalled()
  })
  it('never throws: sendBeacon, fetch and the hook can all fail', async () => {
    const boom = () => { throw new Error('blocked') }
    expect(sendEvent('visit', { page: 'about' }, env({ nav: { sendBeacon: boom } }).e)).toBe(false)
    const rejecting = env({ nav: { sendBeacon: undefined }, fetch: (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch })
    expect(() => sendEvent('visit', { page: 'about' }, rejecting.e)).not.toThrow()
    expect(() => sendEvent('visit', { page: 'about' }, env({ hook: boom }).e)).not.toThrow()
    expect(() => sendEvent('visit', { page: 'about' }, { hostname: PRODUCTION_HOST, navigator: null as never })).not.toThrow()
    await new Promise((r) => setTimeout(r, 0)) // no unhandled rejection from the fetch
  })
})

describe('track', () => {
  it('is a no-op in tests and dev (not the production hostname), and never throws', () => {
    const beacon = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })
    expect(window.location.hostname).not.toBe(PRODUCTION_HOST)
    expect(() => track('collage_made', { source: 'ebird' })).not.toThrow()
    expect(beacon).not.toHaveBeenCalled()
    delete (navigator as { sendBeacon?: unknown }).sendBeacon
  })
  it('reports to window.__everybirdStats when a test sets it', () => {
    const seen: string[] = []
    ;(window as StatsHookWindow).__everybirdStats = (b) => { seen.push(b) }
    Object.defineProperty(navigator, 'language', { value: 'es-AR', configurable: true })
    track('visit', { page: 'collage' })
    track('link_copied', { level: 'species' })
    delete (navigator as { language?: unknown }).language
    expect(seen).toEqual(['{"n":"visit","p":"collage","l":"es"}', '{"n":"link_copied","p":"species"}'])
    for (const b of seen) assertClean(b)
  })
})

describe('automated runs never send', () => {
  const store = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } } }
  it('navigator.webdriver (Playwright, Selenium) or ?noanalytics, remembered for the session', () => {
    expect(automatedRun({ webdriver: true }, '')).toBe(true)
    expect(automatedRun({ webdriver: false }, '')).toBe(false)
    const s = store()
    expect(automatedRun({}, '?noanalytics', s)).toBe(true)
    expect(automatedRun({}, '', s)).toBe(true) // a later page in the same tab
    expect(automatedRun({}, '', store())).toBe(false)
    expect(automatedRun({}, '?x=1', null)).toBe(false)
  })
  it('an automated run sends nothing on the production host, but the test hook still sees the event', () => {
    const beacon = vi.fn(() => true)
    const nav = { userAgent: 'x', maxTouchPoints: 0, sendBeacon: beacon }
    expect(sendEvent('image_downloaded', { format: 'story' }, { hostname: PRODUCTION_HOST, navigator: nav, automated: true })).toBe(false)
    expect(beacon).not.toHaveBeenCalled()
    const hook = vi.fn()
    expect(sendEvent('image_downloaded', { format: 'story' }, { hostname: PRODUCTION_HOST, navigator: nav, automated: true, hook })).toBe(true)
    expect(hook).toHaveBeenCalledOnce()
    expect(beacon).not.toHaveBeenCalled()
  })
})

describe('the newer events', () => {
  it('each value goes out as {n, p}, and an unknown one is dropped', () => {
    for (const lang of ['en', 'es', 'pt', 'nl'] as const) expect(payloadFor('ui_language', { lang })).toEqual({ n: 'ui_language', p: lang })
    for (const size of ['a4', 'a3', 'a2', 'a1', 'a4-l', 'a3-l', 'a2-l', 'a1-l'] as const) expect(payloadFor('poster_made', { size })).toEqual({ n: 'poster_made', p: size })
    // The landscape sizes are the same list turned, not a new event: the app and the Worker allow exactly these eight.
    expect(payloadFor('poster_made', { size: 'a2-x' as never })).toBeNull()
    for (const format of ['png', 'pdf'] as const) expect(payloadFor('poster_downloaded', { format })).toEqual({ n: 'poster_downloaded', p: format })
    for (const kind of ['smart', 'bird'] as const) expect(payloadFor('search_applied', { kind })).toEqual({ n: 'search_applied', p: kind })
    for (const kind of ['place', 'continent', 'time', 'status', 'group', 'taxonomy'] as const) expect(payloadFor('filter_used', { kind })).toEqual({ n: 'filter_used', p: kind })
    expect(payloadFor('ui_language', { lang: 'fr' as never })).toBeNull()
    expect(payloadFor('poster_made', { size: 'A4' as never })).toBeNull()
    expect(payloadFor('poster_downloaded', { format: 'jpg' as never })).toBeNull()
    expect(payloadFor('search_applied', { kind: 'Snow Goose' as never })).toBeNull()
    expect(payloadFor('filter_used', { kind: 'Canada' as never })).toBeNull()
    expect(payloadFor('ui_language', { lang: 'es' }, false, 'es-MX')).toEqual({ n: 'ui_language', p: 'es' }) // no browser language off a visit
  })
  it('trackFilterUsed sends each kind once per page load', () => {
    const bodies: string[] = []
    ;(window as StatsHookWindow).__everybirdStats = (b) => bodies.push(b)
    resetFilterUsed()
    trackFilterUsed('place'); trackFilterUsed('place'); trackFilterUsed('time'); trackFilterUsed('place')
    expect(bodies.map((b) => JSON.parse(b).p)).toEqual(['place', 'time'])
    resetFilterUsed()
    trackFilterUsed('place')
    expect(bodies).toHaveLength(3)
  })
})
