import { Home } from '@/components/app/Home'
import { preloadData, sampleFiles } from '@/lib/data-preload'
import { langParam } from '@/i18n/server'
import { SITE_NAME, siteUrl } from '@/lib/site-meta'

// Only the layout's four languages exist: any other first segment (/nope) is the static 404, never a render.
export const dynamicParams = false

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  // The landing's sample (every first visit) downloads with the page's JavaScript; a returning birder's species file isn't
  // known to be needed until storage is read (EverybirdProvider warms the collage then).
  preloadData(sampleFiles(await langParam(params)), 'high')
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      // One more site-name hint for Google, which lists the site as "yusuftaleb.com".
      alternateName: 'Everybird app',
      url: siteUrl('/'),
    }).replace(/</g, '\\u003c') }} />
    <Home />
  </>
}
