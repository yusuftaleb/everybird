'use client'

import { useEffect } from 'react'

/** Whether a click on this link should become a full page load: a plain click on a same-origin link that leaves the page. */
export function wantsFullLoad(e: Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'defaultPrevented'>, a: HTMLAnchorElement, here: Location): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false
  if (a.hasAttribute('download') || (a.target && a.target !== '_self')) return false
  let to: URL
  try {
    to = new URL(a.href, here.href)
  } catch {
    return false
  }
  if (to.origin !== here.origin) return false
  return to.pathname !== here.pathname || to.search !== here.search // same page, new hash: let it scroll
}

/**
 * On the shared view (/s/<token>), every link into the app is a full page load, never a client navigation. Cloudflare's
 * beacon (CloudflareBeacon.tsx, app pages only) follows history changes once loaded and can't redact a URL: if
 * "Make yours" were a client navigation, the beacon would load in a document whose history holds /s/<token>, and Back
 * would report the token. A full load starts a fresh document instead; Back then returns to a page without the beacon.
 * Capture phase, so next/link sees the click already handled (it skips defaultPrevented clicks).
 */
export function FullNavigation() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || !wantsFullLoad(e, a, window.location)) return
      e.preventDefault()
      window.location.assign(a.href)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
  return null
}
