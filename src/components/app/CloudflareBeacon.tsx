'use client'

import Script from 'next/script'
import { useSyncExternalStore } from 'react'
import { automatedRun, optedOut, safeSession } from '@/lib/analytics'
import { SHARE_ORIGIN } from '@/lib/share/origin'

/** Everybird's public Cloudflare Web Analytics site token (it goes out in every app page's HTML anyway). */
export const CF_BEACON_TOKEN = '810be5cc6af7455686262e3fe8c0cf30'
export const CF_BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js'

const noop = () => () => {}
/** The production hostname (the share origin). The beacon never loads anywhere else: previews, localhost and the Workers copy. */
const PROD_HOST = new URL(SHARE_ORIGIN).host
/** /s/<token> and /c/<token>, with or without a language prefix (/es/s/...). */
const shared = (path: string) => /^\/(?:[a-z]{2}(?:-[A-Za-z]+)?\/)?[sc]\//.test(path)
/** Whether this document began (or is) on a shared view: its first navigation's URL, or the current path, is /s/... or /c/... */
function startedOnShare(): boolean {
  try {
    const first = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.name
    if (first && shared(new URL(first).pathname)) return true
  } catch {
    // No Navigation Timing: fall back to the current path alone.
  }
  return shared(location.pathname)
}

/**
 * Read once in the browser; the server render (and hydration) says no, so the script only ever starts client-side.
 * Never in a document that started on /s/<token>: belt and braces for FullNavigation, whose click handler attaches a
 * moment after hydration (a click in that gap would be a client navigation into the app, and the beacon's route
 * tracking would later see the token on Back).
 */
const allowedNow = () => location.host === PROD_HOST && !optedOut(navigator, (window as Window & { doNotTrack?: string | null }).doNotTrack) && !startedOnShare()
  && !automatedRun(navigator, location.search, safeSession(window))

/**
 * Cloudflare Web Analytics: cookieless page-view counts. Rendered from app/[lang]/(app)/layout.tsx on every host, and it
 * loads only on the production hostname (checked in the browser: PROD_HOST), so it never runs on previews, the Workers
 * copy or localhost. It never loads on a shared view: /s/<token> is outside that group, and the beacon, which
 * reports location.href with no way to redact it, must never see a share token. The shared view also makes every link
 * into the app a full page load (FullNavigation.tsx), so a document that has shown /s/<token> never gets the beacon,
 * not even on Back. Not loaded at all with Do Not Track or Global Privacy Control on, or in an automated run
 * (navigator.webdriver, ?noanalytics: automatedRun), as for the event counter.
 */
export function CloudflareBeacon() {
  const allowed = useSyncExternalStore(noop, allowedNow, () => false)
  if (!allowed) return null
  return <Script id="cf-beacon" strategy="afterInteractive" src={CF_BEACON_SRC} data-cf-beacon={JSON.stringify({ token: CF_BEACON_TOKEN })} />
}
