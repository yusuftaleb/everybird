// The UI languages. No imports: the config (rewrites), the server and the client all read this.
// A new language is an entry here, its own messages/<lang>.ts and the steps in GLOSSARY.md.

export const LANGS = ['en', 'es', 'pt', 'nl', 'pl', 'fr', 'de', 'it', 'sv', 'da', 'ru', 'ja'] as const
export type Lang = (typeof LANGS)[number]

/** The preference cookie (src/i18n/choose.ts writes it, the rewrites in routes.ts read it): `en|es|pt|nl|pl|fr|de|it|sv|da|ru|ja`. */
export const LANG_COOKIE = 'everybird-lang'

export function isLang(s: unknown): s is Lang {
  return typeof s === 'string' && (LANGS as readonly string[]).includes(s)
}

/** `<html lang>` per language: Portuguese is Brazilian Portuguese. */
export const HTML_LANG: Record<Lang, string> = { en: 'en', es: 'es', pt: 'pt-BR', nl: 'nl', pl: 'pl', fr: 'fr', de: 'de', it: 'it', sv: 'sv', da: 'da', ru: 'ru', ja: 'ja' }

/** Each language's name in itself, for the language picker (short: Portuguese is pt-BR, the menu just says Português). */
export const LANG_NAMES: Record<Lang, string> = { en: 'English', es: 'Español', pt: 'Português', nl: 'Nederlands', pl: 'Polski', fr: 'Français', de: 'Deutsch', it: 'Italiano', sv: 'Svenska', da: 'Dansk', ru: 'Русский', ja: '日本語' }

/** A BCP 47 tag's primary subtag, lower-cased ("es-AR" -> "es", "pt_BR" -> "pt"), when it is 2 or 3 letters; else undefined. */
export function primarySubtag(tag: string | undefined): string | undefined {
  const p = tag?.split(/[-_]/)[0]?.toLowerCase()
  return p && /^[a-z]{2,3}$/.test(p) ? p : undefined
}

/** Chinese tags that read Traditional: zh-TW, zh-HK, zh-MO and any zh-Hant… (any case, "-" or "_"); every other zh is Simplified. */
const TRADITIONAL = /^zh[-_](?:hant|tw|hk|mo)(?:[-_]|$)/i

/** A browser tag's language as Everybird codes it: the primary subtag ("es-AR" -> "es"), but zh-Hans or zh-Hant for
 *  Chinese (the script, from TRADITIONAL), since the two are separate UI languages; undefined as primarySubtag. */
export function langCode(tag: string | undefined): string | undefined {
  const p = primarySubtag(tag)
  return p === 'zh' ? (TRADITIONAL.test(tag!) ? 'zh-Hant' : 'zh-Hans') : p
}

/** The UI language for a browser tag: any Spanish -> es, any Portuguese -> pt, any Dutch (nl-NL, nl-BE) -> nl, and so
 *  on for every language in LANGS (Chinese by script, langCode), else en. */
export function langFromTag(tag: string): Lang {
  const p = langCode(tag)
  return isLang(p) ? p : 'en'
}
