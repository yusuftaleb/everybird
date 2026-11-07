// Search and link-preview metadata for the public pages. Absolute URLs on the production origin, so a preview
// deployment's canonical still names the real site. Never anything from /s/<token>: a share token is the birder's list.
import type { Metadata } from 'next'
import { SHARE_ORIGIN } from '@/lib/share/origin'

export const SITE_NAME = 'Everybird'
export const SITE_DESCRIPTION = 'Your life list as a sticker collage, from eBird, iNaturalist, or by hand.'
export const ABOUT_TITLE = 'About · Everybird'
export const ABOUT_DESCRIPTION =
  'What Everybird is, how it works, what True size means, and the data, stickers, fonts and code it is built from.'

/** The only pages offered to search engines (app/sitemap.ts). */
export const INDEXED_PATHS = ['/', '/about'] as const

/** The site's own 512px icon (scripts/build-data/build-icons.ts), the one picture the public pages already have. */
const ICON = { url: '/icons/icon-512.png', width: 512, height: 512, alt: SITE_NAME }

export const siteUrl = (path: string) => new URL(path, SHARE_ORIGIN).toString()

/** Canonical, Open Graph and Twitter card for one public page. */
export function pageSeo(path: string, title: string, description: string): Pick<Metadata, 'alternates' | 'openGraph' | 'twitter'> {
  const url = siteUrl(path)
  return {
    alternates: { canonical: url },
    openGraph: { type: 'website', siteName: SITE_NAME, url, title, description, images: [ICON] },
    twitter: { card: 'summary', title, description, images: [ICON.url] },
  }
}
