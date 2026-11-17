// Search and link-preview metadata for the public pages. Absolute URLs on the production origin, so a preview
// deployment's canonical still names the real site. Never anything from /s/<token>: a share token is the birder's list.
// Titles and descriptions are per language (`page.meta` in src/i18n/messages); canonicals stay unprefixed in every
// language (the rewrites serve /about in the visitor's language), and og:locale says which one a copy is in.
import type { Metadata } from 'next'
import type { Lang } from '@/i18n/langs'
import { SHARE_ORIGIN } from '@/lib/share/origin'

export const SITE_NAME = 'Everybird'

/** Open Graph's locale per UI language (Portuguese is Brazilian Portuguese). */
export const OG_LOCALE: Record<Lang, string> = { en: 'en_US', es: 'es_ES', pt: 'pt_BR', nl: 'nl_NL', pl: 'pl_PL' }

/** A page's document title: "About · Everybird" ("Acerca de · Everybird"). */
export const siteTitle = (page: string) => `${page} · ${SITE_NAME}`

/** Buy Me a Coffee: a quiet way to support the maker (the footer, About#credits and the share dialog; never on the images). */
export const COFFEE_URL = 'https://buymeacoffee.com/yusuftaleb'

/** The repository, linked from the footer's right edge. */
export const REPO_URL = 'https://github.com/yusuftaleb/everybird'

/** The only pages offered to search engines (app/sitemap.ts). */
export const INDEXED_PATHS = ['/', '/about'] as const

/** The site's own 512px icon (scripts/build-data/build-icons.ts), the one picture the public pages already have. */
const ICON = { url: '/icons/icon-512.png', width: 512, height: 512, alt: SITE_NAME }

export const siteUrl = (path: string) => new URL(path, SHARE_ORIGIN).toString()

/** Canonical (unprefixed), Open Graph (with the language's locale) and Twitter card for one public page. */
export function pageSeo(path: string, title: string, description: string, lang: Lang): Pick<Metadata, 'alternates' | 'openGraph' | 'twitter'> {
  const url = siteUrl(path)
  return {
    alternates: { canonical: url },
    openGraph: { type: 'website', siteName: SITE_NAME, url, title, description, images: [ICON], locale: OG_LOCALE[lang] },
    twitter: { card: 'summary', title, description, images: [ICON.url] },
  }
}
