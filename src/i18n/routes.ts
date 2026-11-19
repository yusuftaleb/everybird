// The language rewrites: every visible URL stays unprefixed (/about), and next.config.ts's `beforeFiles` rewrites send
// it to the page prerendered for one language (/es/about). The language comes from the preference cookie, else from
// Accept-Language's first tag, else English. Vercel's router applies these (`has` conditions), so a visit costs no Proxy
// or Function invocation. No `@/` imports: next.config.ts imports this file relatively.
import { LANGS, LANG_COOKIE, type Lang } from './langs'

export { LANG_COOKIE }

/** The languages negotiated from Accept-Language: every language but English, the fallback. */
const NEGOTIATED = LANGS.filter((l): l is Exclude<Lang, 'en'> => l !== 'en')

/**
 * Every unprefixed path a page answers at, in rule order. `/s/:token` (the shared view, negotiated) comes before
 * `/s/:token/:rest*`, which also matches `/s/<token>` with no rest; beforeFiles rules all run in turn, and once the page
 * is rewritten to `/<lang>/s/…` no later source matches it.
 */
export const PAGE_SOURCES = ['/', '/settings', '/about', '/compare', '/make', '/my', '/credits', '/c/:token', '/s/:token', '/s/:token/:rest*'] as const

/** The old image URLs (`/s/<token>/opengraph-image`, `/s/<token>/twitter-image`) that links shared before the languages
 *  already point at, cached for a year: always the English image, never negotiated. */
const OLD_IMAGES = '/s/:token/:rest*'

/** A primary subtag, case-insensitive by character class: "es" -> "[Ee][Ss]". */
const anyCase = (s: string) => [...s].map((c) => `[${c.toUpperCase()}${c.toLowerCase()}]`).join('')

/**
 * Accept-Language whose FIRST tag's primary subtag is the language: "es", "ES", "es-MX,en;q=0.8", "nl-BE,nl;q=0.9".
 * Next compiles a `has` value as `new RegExp('^' + value + '$')`; the value carries its own anchors as well, so it also
 * matches the whole header on a router that doesn't add them ("^^…$$" is the same regex).
 */
export const ACCEPT = Object.fromEntries(
  NEGOTIATED.map((l) => [l, `^${anyCase(l)}(?:[-_][^,;]*)?(?:[;,].*)?$`]),
) as Record<(typeof NEGOTIATED)[number], string>

/** The cookie's value when it names a language; the named group becomes `:lang` in the destination. */
const COOKIE_VALUE = `^(?<lang>${LANGS.join('|')})$`

export type Has = { type: 'cookie' | 'header'; key: string; value?: string }
export type LangRewrite = { source: string; destination: string; has?: Has[] }

/** "/" -> "" so "/" becomes "/es", not "/es/". */
const dest = (source: string) => (source === '/' ? '' : source)

/** The rewrites, per page source in order: the cookie, then Accept-Language es / pt / nl, then English. */
export function langRewrites(): LangRewrite[] {
  return PAGE_SOURCES.flatMap((source): LangRewrite[] => {
    if (source === OLD_IMAGES) return [{ source, destination: `/en${source}` }]
    return [
      { source, destination: `/:lang${dest(source)}`, has: [{ type: 'cookie', key: LANG_COOKIE, value: COOKIE_VALUE }] },
      ...NEGOTIATED.map((l) => ({
        source,
        destination: `/${l}${dest(source)}`,
        has: [{ type: 'header' as const, key: 'accept-language', value: ACCEPT[l] }],
      })),
      { source, destination: `/en${dest(source)}` },
    ]
  })
}
