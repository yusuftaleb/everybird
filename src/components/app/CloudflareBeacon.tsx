'use client'

import Script from 'next/script'
import { useSyncExternalStore } from 'react'
import { optedOut } from '@/lib/analytics'

/** Everybird's public Cloudflare Web Analytics site token (it goes out in every app page's HTML anyway). */
export const CF_BEACON_TOKEN = '810be5cc6af7455686262e3fe8c0cf30'
export const CF_BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js'

const noop = () => () => {}
/** Whether this document began (or is) on a shared view: its first navigation's URL, or the current path, is /s/... */
export function startedOnShare(): boolean {
  try {
    const first = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.name
    if (first && new URL(first).pathname.startsWith('/s/')) return true
  } catch {
    // No Navigation Timing: fall back to the current path alone.
  }
  return location.pathname.startsWith('/s/')
}

/**
 * Read once in the browser; the server render (and hydration) says no, so the script only ever starts client-side.
 * Never in a document that started on /s/<token>: belt and braces for FullNavigation, whose click handler attaches a
 * moment after hydration (a click in that gap would be a client navigation into the app, and the beacon's route
 * tracking would later see the token on Back).
 */
const allowedNow = () => !optedOut(navigator, (window as Window & { doNotTrack?: string | null }).doNotTrack) && !startedOnShare()

/**
 * Cloudflare Web Analytics: cookieless page-view counts. Rendered only from app/(app)/layout.tsx in production
 * (VERCEL_ENV=production), so it never loads on a shared view: /s/<token> is outside that group, and the beacon, which
 * reports location.href with no way to redact it, must never see a share token. The shared view also makes every link
 * into the app a full page load (FullNavigation.tsx), so a document that has shown /s/<token> never gets the beacon,
 * not even on Back. Not loaded at all with Do Not Track or Global Privacy Control on, as for the event counter.
 */
export function CloudflareBeacon() {
  const allowed = useSyncExternalStore(noop, allowedNow, () => false)
  if (!allowed) return null
  return <Script id="cf-beacon" strategy="afterInteractive" src={CF_BEACON_SRC} data-cf-beacon={JSON.stringify({ token: CF_BEACON_TOKEN })} />
}
