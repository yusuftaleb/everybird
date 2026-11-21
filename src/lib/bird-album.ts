// Links to a bird's page on Bird Album (birdalbum.com), where the huashu stickers come from.
import type { Lang } from '@/i18n/langs'

/** Bird Album's slug for an English name: plain letters, lower case, apostrophes dropped, other runs to one hyphen. */
export function albumSlug(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// The interface languages Bird Album serves under a path prefix (seen 2026-11-19).
const PREFIX: Partial<Record<string, string>> = { es: 'es/', pt: 'pt-br/', nl: 'nl/', fr: 'fr/', de: 'de/' }

export function albumUrl(slug: string, lang: Lang): string {
  return `https://birdalbum.com/${PREFIX[lang] ?? ''}birds/${slug}/`
}

let slugs: Promise<Record<string, string>> | null = null
/** The slugs that differ from the eBird name's, loaded once (a failure isn't cached). */
export function loadAlbumSlugs(): Promise<Record<string, string>> {
  slugs ??= import('./data-url').then((m) => m.fetchData<{ slugs: Record<string, string> }>('album.v1.json'))
    .then((f) => f.slugs, (e) => { slugs = null; throw e })
  return slugs
}
