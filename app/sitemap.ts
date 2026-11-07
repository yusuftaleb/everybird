import type { MetadataRoute } from 'next'
import { INDEXED_PATHS, siteUrl } from '@/lib/site-meta'

// Only the landing page and /about. Never a /s/ link: its token is the birder's whole list.
export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXED_PATHS.map((path) => ({ url: siteUrl(path) }))
}
