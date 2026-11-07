import type { Metadata } from 'next'
import { SettingsPage } from '@/components/app/SettingsPage'
import { pageSeo, SITE_DESCRIPTION } from '@/lib/site-meta'

// Not in the sitemap, but its own canonical and card rather than the landing page's.
export const metadata: Metadata = { title: 'Settings · Everybird', ...pageSeo('/settings', 'Settings · Everybird', SITE_DESCRIPTION) }

export default function Page() {
  return <SettingsPage />
}
