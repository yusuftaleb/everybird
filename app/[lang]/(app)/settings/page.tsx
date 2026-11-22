import type { Metadata } from 'next'
import { SettingsPage } from '@/components/app/SettingsPage'
import { getMessages, langParam } from '@/i18n/server'
import { pageSeo, siteTitle } from '@/lib/site-meta'

// Not in the sitemap, but its own canonical and card rather than the landing page's.
// Only the layout's four languages exist: any other first segment (/nope) is the static 404, never a render.
export const dynamicParams = false

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = await langParam(params)
  const { meta } = getMessages(lang).page
  const title = siteTitle(meta.settings.title)
  return { title, ...pageSeo('/settings', title, meta.description, lang, meta.imageAlt) }
}

export default function Page() {
  return <SettingsPage />
}
