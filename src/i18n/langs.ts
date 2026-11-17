// The UI languages. No imports: the config (rewrites), the server and the client all read this.
// A new language is an entry here, its own messages/<lang>.ts and the steps in GLOSSARY.md.

export const LANGS = ['en', 'es', 'pt', 'nl', 'pl'] as const
export type Lang = (typeof LANGS)[number]

/** The preference cookie (src/i18n/choose.ts writes it, the rewrites in routes.ts read it): `en|es|pt|nl|pl`. */
export const LANG_COOKIE = 'everybird-lang'

export function isLang(s: unknown): s is Lang {
  return typeof s === 'string' && (LANGS as readonly string[]).includes(s)
}

/** `<html lang>` per language: Portuguese is Brazilian Portuguese. */
export const HTML_LANG: Record<Lang, string> = { en: 'en', es: 'es', pt: 'pt-BR', nl: 'nl', pl: 'pl' }

/** Each language's name in itself, for the language picker (short: Portuguese is pt-BR, the menu just says Português). */
export const LANG_NAMES: Record<Lang, string> = { en: 'English', es: 'Español', pt: 'Português', nl: 'Nederlands', pl: 'Polski' }

/** A BCP 47 tag's primary subtag, lower-cased ("es-AR" -> "es", "pt_BR" -> "pt"), when it is 2 or 3 letters; else undefined. */
export function primarySubtag(tag: string | undefined): string | undefined {
  const p = tag?.split(/[-_]/)[0]?.toLowerCase()
  return p && /^[a-z]{2,3}$/.test(p) ? p : undefined
}

/** The UI language for a browser tag: any Spanish -> es, any Portuguese -> pt, any Dutch (nl-NL, nl-BE) -> nl, else en. */
export function langFromTag(tag: string): Lang {
  const p = primarySubtag(tag)
  return isLang(p) ? p : 'en'
}
