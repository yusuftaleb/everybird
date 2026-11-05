import { track as vercelTrack } from '@vercel/analytics'
import type { BeforeSendEvent } from '@vercel/analytics/react'
import type { Source } from '@/lib/list/model'
import type { ImageFormat } from '@/lib/share/image'
import type { ShareLevel } from '@/lib/share/link'

/**
 * The only events Everybird sends (spec "My calls" 13). They never carry counts, names, species or places.
 * Vercel Web Analytics is cookieless. Without its script (dev, tests, any non-Vercel host) `track` is a no-op.
 */
export type AnalyticsEvents = {
  collage_made: { source: Source }
  image_downloaded: { format: ImageFormat }
  link_copied: { level: ShareLevel }
}

export function track<K extends keyof AnalyticsEvents>(name: K, props: AnalyticsEvents[K]): void {
  try {
    vercelTrack(name, props)
  } catch {
    // Analytics must never break the app.
  }
}

/** `/s/<token>` at the start of the path (after an optional scheme and host). The token is the birder's whole list. */
const SHARE_PATH = /^((?:[a-z][a-z0-9+.-]*:\/\/[^/?#]*)?)\/s\/[^/?#]+/i

/** Replaces a share token in a URL with `[token]`, keeping the rest (query, hash) as is. Other URLs are returned unchanged. */
export function redactShareToken(url: string): string {
  return url.replace(SHARE_PATH, '$1/s/[token]')
}

/**
 * The `<Analytics beforeSend>` hook. The Vercel script runs it for page views and for custom `track()` events alike
 * (both carry the page URL), so no event ever reports a share token.
 */
export function redactAnalyticsEvent<E extends BeforeSendEvent>(event: E): E {
  return { ...event, url: redactShareToken(event.url) }
}
