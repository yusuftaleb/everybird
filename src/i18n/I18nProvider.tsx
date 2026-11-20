'use client'
// The UI language for client components. The root layout passes its language's `ui` (plain data from
// messages/<lang>.ts); components read it with useI18n(): `const { lang, t } = useI18n()`, then `t.shell.nav.about`.
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { refreshLangCookie } from './choose'
import { tagPlurals } from './core'
import type { Lang } from './langs'
import { EN_UI, type Ui } from './messages/en-ui'

type I18n = { lang: Lang; t: Ui }

/** No provider means English: components not yet wrapped (and their tests) keep rendering today's English text until
 *  the layouts mount the provider. Defaulting rather than throwing is deliberate. */
const ENGLISH: I18n = { lang: 'en', t: EN_UI }

const I18nContext = createContext<I18n>(ENGLISH)

export function I18nProvider({ lang, ui, children }: { lang: Lang; ui: Ui; children: ReactNode }) {
  // The layout's `ui` arrives as a fresh copy (RSC props), so its plurals are tagged here for `plural`'s few and many.
  const value = useMemo(() => {
    tagPlurals(lang, ui)
    return { lang, t: ui }
  }, [lang, ui])
  // A chosen language's cookie gets a fresh year on every page load (Safari caps script-set cookies at 7 days).
  useEffect(refreshLangCookie, [])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/** The current language and its strings (English when no provider is mounted). */
export function useI18n(): I18n {
  return useContext(I18nContext)
}
