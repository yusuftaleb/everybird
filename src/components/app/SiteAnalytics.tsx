'use client'

import { Analytics } from '@vercel/analytics/react'
import { redactAnalyticsEvent } from '@/lib/analytics'

/** Vercel Web Analytics with share tokens redacted from every page view and event URL. A client component because
 *  `beforeSend` is a function, which a server component can't pass down. */
export default function SiteAnalytics() {
  return <Analytics beforeSend={redactAnalyticsEvent} />
}
