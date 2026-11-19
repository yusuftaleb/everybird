import type { Metadata } from 'next'
import { ComparePage } from '@/components/compare/ComparePage'
import { getMessages, langParam } from '@/i18n/server'
import { pageSeo, siteTitle } from '@/lib/site-meta'

// Not in the sitemap. Only the layout's languages exist: any other first segment is the static 404, never a render.
export const dynamicParams = false

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = await langParam(params)
  const { ui, page } = getMessages(lang)
  const title = siteTitle(ui.compare.title)
  return { title, ...pageSeo('/compare', title, page.meta.description, lang) }
}

export default function Page() {
  return <ComparePage />
}
