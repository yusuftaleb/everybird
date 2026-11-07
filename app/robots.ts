import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site-meta'

// The landing page and /about are open to crawlers (so are the scripts and styles they need, under /_next/).
// /s/ is closed: a share link's token is the birder's whole list. Those pages also say noindex.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/s/' },
    sitemap: siteUrl('/sitemap.xml'),
  }
}
