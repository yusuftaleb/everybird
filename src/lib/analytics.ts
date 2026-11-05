import { track as vercelTrack } from '@vercel/analytics'
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
