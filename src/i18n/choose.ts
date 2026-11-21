// The language preference: one first-party cookie, `everybird-lang`, which the rewrites (routes.ts) read before
// Accept-Language. It is the only stored copy. Safari caps script-set cookies at 7 days, so every page load writes a
// present cookie again with the same value (I18nProvider's effect); a missing one is never created there.
import { track } from '@/lib/analytics'
import { stashResume } from '@/lib/view-resume'
import { LANG_COOKIE, isLang, type Lang } from './langs'

type CookieDoc = { cookie: string; location?: { protocol?: string } }

const YEAR = 31536000

/** Writes the preference: a year, the whole site, Lax, and Secure on https. */
export function setLangCookie(lang: Lang, doc: CookieDoc = document): void {
  const secure = doc.location?.protocol === 'https:' ? '; Secure' : ''
  doc.cookie = `${LANG_COOKIE}=${lang}; Max-Age=${YEAR}; Path=/; SameSite=Lax${secure}`
}

/** The cookie's language, when it is present and names one. */
export function readLangCookie(doc: CookieDoc = document): Lang | undefined {
  for (const part of doc.cookie.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0 || part.slice(0, eq).trim() !== LANG_COOKIE) continue
    const v = part.slice(eq + 1).trim()
    return isLang(v) ? v : undefined
  }
  return undefined
}

/** Re-writes a present, valid cookie with its own value (a fresh year); never creates one. */
export function refreshLangCookie(doc: CookieDoc = document): void {
  try {
    const lang = readLangCookie(doc)
    if (lang) setLangCookie(lang, doc)
  } catch {
    // Cookies blocked: the browser's language decides, as without a choice.
  }
}

/** The language picker's preview variants (`useVariant('lang', LANG_VARIANTS)`): a, the top bar's LanguageMenu beside
 *  the theme toggle plus the Settings field (default; the nav on a second row under 620px); b, the Settings field only;
 *  c, as a, but under 480px the My birds link is hidden (the wordmark goes home). */
export const LANG_VARIANTS = ['a', 'b', 'c'] as const

/** A new choice: the cookie, then a full reload, because the router cache and the page's HTML belong to the old
 *  language. The callers skip the current language (it only closes the menu). */
export function chooseLang(lang: Lang): void {
  try {
    setLangCookie(lang)
    // Cookies blocked without an error (the write is dropped): the reload would show the same language, and would
    // cost the reader their place and focus.
    if (readLangCookie() !== lang) return
  } catch {
    // Cookies blocked: nothing to remember, and the reload would show the same language.
    return
  }
  stashResume() // the view (filters, search, panel) for the new page to take back (view-resume.ts)
  track('ui_language', { lang }) // beacons survive the reload; a deliberate switch only, never a load
  location.reload()
}
