'use client'
// The UI language for client components. The root layout passes its language's `ui` (plain data from
// messages/<lang>.ts); components read it with useI18n(): `const { lang, t } = useI18n()`, then `t.shell.nav.about`.
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { refreshLangCookie } from './choose'
import { tagPlurals } from './core'
import type { Lang } from './langs'
import type { Ui } from './messages/en-ui'

type I18n = { lang: Lang; t: Ui }

// No English default: it would put the whole English dictionary in every page's JavaScript, in every language. The root
// layout wraps every page; unit tests get English through setI18nFallback (tests/setup-i18n.ts).
const I18nContext = createContext<I18n | null>(null)
// On globalThis, so a test's vi.resetModules() (a fresh copy of this module) keeps it.
const store = globalThis as { __everybirdI18nFallback?: I18n | null }

/** What useI18n gives outside a provider: tests only (tests/setup-i18n.ts sets English). */
export function setI18nFallback(v: I18n | null): void {
  store.__everybirdI18nFallback = v
}

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

/** The current language and its strings. Outside a provider it throws (unless a test set a fallback). */
export function useI18n(): I18n {
  const v = useContext(I18nContext) ?? store.__everybirdI18nFallback
  if (!v) throw new Error('useI18n needs <I18nProvider> (app/[lang]/layout.tsx)')
  return v
}
