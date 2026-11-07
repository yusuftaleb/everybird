import type { Source } from '@/lib/list/model'
import type { ImageFormat } from '@/lib/share/image'
import type { ShareLevel } from '@/lib/share/link'

/**
 * Everybird's anonymous counter (spec "My calls" 13). Each event is one tiny POST to Yusuf's Worker
 * (workers/stats: Cloudflare D1, one row per event, day-level, no IPs or cookies) with the body {n, p, d?}: the event's
 * name, its one property value from a fixed list, and d: 'touch' on an iPad that reports a Mac. Never counts, names,
 * species, places, URLs or share tokens.
 *
 * Sent only from the production hostname, never with Do Not Track or Global Privacy Control on, and never throws.
 * Page visits are counted separately by Cloudflare Web Analytics (src/components/app/CloudflareBeacon.tsx).
 */
export type VisitPage = 'landing' | 'collage' | 'settings' | 'about' | 'shared'
export type AnalyticsEvents = {
  /** Once per page view. `shared` is /s/[token], never with the token. */
  visit: { page: VisitPage }
  collage_made: { source: Source }
  /** Saved to the device (Download image, or Share image where the share sheet can't take files). */
  image_downloaded: { format: ImageFormat }
  /** Handed to the system share sheet, which resolved. `link` is supported, but the dialog doesn't share links that way yet. */
  shared: { via: ImageFormat | 'link' }
  link_copied: { level: ShareLevel }
}
export type EventName = keyof AnalyticsEvents

export const STATS_ENDPOINT = 'https://stats.yusuftaleb.com/e'
export const PRODUCTION_HOST = 'everybird.yusuftaleb.com'

/**
 * The Worker's allow-list (workers/stats/src/index.ts `ALLOWED`), mirrored so nothing the Worker would drop is sent.
 * link_copied's values there are full/compact/minimal/species; the app's ShareLevel is mapped onto them in order of
 * detail (WIRE_LEVEL) until the Worker lists the app's own names.
 */
export const ALLOWED: Record<EventName, readonly string[]> = {
  visit: ['landing', 'collage', 'settings', 'about', 'shared'],
  collage_made: ['ebird', 'ebird-list', 'inat', 'manual', 'sample', 'restore', 'mixed'],
  image_downloaded: ['story', 'post', 'square'],
  shared: ['story', 'post', 'square', 'link'],
  link_copied: ['full', 'compact', 'minimal', 'species'],
}
export const WIRE_LEVEL: Record<ShareLevel, string> = { regions: 'full', countries: 'compact', dates: 'minimal', species: 'species' }

export type Payload = { n: EventName; p: string; d?: 'touch' }

/** The body for one event, or null if its value isn't on the allow-list (then nothing is sent). */
export function payloadFor<K extends EventName>(name: K, props: AnalyticsEvents[K], touchMac = false): Payload | null {
  if (!Object.prototype.hasOwnProperty.call(ALLOWED, name) || !props || typeof props !== 'object') return null
  const values = Object.values(props as Record<string, unknown>)
  if (values.length !== 1 || typeof values[0] !== 'string') return null
  const p = name === 'link_copied' ? WIRE_LEVEL[values[0] as ShareLevel] : values[0]
  if (typeof p !== 'string' || !ALLOWED[name].includes(p)) return null
  return touchMac ? { n: name, p, d: 'touch' } : { n: name, p }
}

type Nav = Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & {
  doNotTrack?: string | null
  globalPrivacyControl?: boolean
  sendBeacon?: (url: string, data?: BodyInit | null) => boolean
}

/** What a send depends on: the real globals in `track`, fakes in tests. */
export type SendEnv = {
  hostname: string
  navigator: Nav
  /** window.doNotTrack (old Safari and IE). */
  windowDnt?: string | null
  fetch?: typeof fetch
  /** The test seam: when set, the body goes here instead of the network (and the hostname check is skipped). */
  hook?: (body: string) => void
}

/** Do Not Track or Global Privacy Control: either one means nothing is sent. */
export function optedOut(nav: Nav, windowDnt?: string | null): boolean {
  return nav.doNotTrack === '1' || nav.doNotTrack === 'yes' || windowDnt === '1' || nav.globalPrivacyControl === true
}

/** iPadOS 13+ reports a Mac User-Agent; a Mac with more than one touch point is an iPad. */
export function isTouchMac(nav: Nav): boolean {
  return /Macintosh/.test(nav.userAgent ?? '') && (nav.maxTouchPoints ?? 0) > 1
}

/** One event, or nothing. Returns whether a send was attempted. Never throws. */
export function sendEvent<K extends EventName>(name: K, props: AnalyticsEvents[K], env: SendEnv): boolean {
  try {
    if (optedOut(env.navigator, env.windowDnt)) return false
    const payload = payloadFor(name, props, isTouchMac(env.navigator))
    if (!payload) return false
    const body = JSON.stringify(payload)
    if (env.hook) {
      env.hook(body)
      return true
    }
    if (env.hostname !== PRODUCTION_HOST) return false
    // text/plain keeps the cross-origin POST a simple request (no preflight); the Worker reads the raw text.
    if (typeof env.navigator.sendBeacon === 'function' && env.navigator.sendBeacon(STATS_ENDPOINT, new Blob([body], { type: 'text/plain' }))) return true
    // No sendBeacon, or it refused (queue full): fetch with keepalive. no-cors: the response isn't needed, and a string
    // body goes as text/plain, so this is a simple request too.
    env.fetch?.(STATS_ENDPOINT, { method: 'POST', body, keepalive: true, mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer' })
      .catch(() => {})
    return true
  } catch {
    // Analytics must never break the app.
    return false
  }
}

/** Set by e2e tests (page.addInitScript) to see the events without the production hostname. */
export type StatsHookWindow = Window & { __everybirdStats?: (body: string) => void }

export function track<K extends EventName>(name: K, props: AnalyticsEvents[K]): void {
  try {
    if (typeof window === 'undefined') return
    const w = window as StatsHookWindow & { doNotTrack?: string | null }
    sendEvent(name, props, {
      hostname: w.location.hostname,
      navigator: w.navigator as Nav,
      windowDnt: w.doNotTrack,
      fetch: typeof w.fetch === 'function' ? w.fetch.bind(w) : undefined,
      hook: typeof w.__everybirdStats === 'function' ? w.__everybirdStats : undefined,
    })
  } catch {
    // Never break the app.
  }
}
