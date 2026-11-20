'use client'
// The top bar on every page, after the site's phone top bar (framer-site code-components/SiteNav.tsx): the Everybird
// wordmark home on the left, then Collage, Compare, Settings and About (the current page carries aria-current="page" and the
// site's active style: Surface fill, Hairline border, Accent), then on the right the language button (LanguageMenu,
// preview variants lang:a and c) and the sun/moon theme switch, together in row one at every width. Where row one
// can't hold the nav it takes its own second row (app.css; a and c under 600px, c with Collage hidden under 480px, b
// under 548/540px by language), which wraps onto a second line under 300px of page. The variant is mirrored on <html data-topbar> so the CSS and --topbar-h
// (tokens.css) switch together. Sticky with headroom (src/lib/headroom.ts): it slides out of view while the page
// scrolls down and back on any upward scroll, at the top, while a dialog holds it and while focus is inside it.
import Link from '@/components/app/IntentLink'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { LANG_VARIANTS } from '@/i18n/choose'
import { useI18n } from '@/i18n/I18nProvider'
import { useAppPath } from '@/i18n/path'
import { attachHeadroom } from '@/lib/headroom'
import { rememberVariants, useVariant } from '@/lib/variants'
import { LanguageMenu } from './LanguageMenu'
import { ThemeToggle } from './ThemeToggle'

const PAGES = [
  { href: '/', key: 'collage' },
  { href: '/compare', key: 'compare' },
  { href: '/settings', key: 'settings' },
  { href: '/about', key: 'about' },
] as const

export function TopBar() {
  // Unprefixed on the server (/es/settings) and in the browser (/settings) alike: the same aria-current both times.
  const path = useAppPath()
  const { t } = useI18n()
  const ref = useRef<HTMLElement>(null)
  useEffect(() => (ref.current ? attachHeadroom(ref.current) : undefined), [])
  // Preview variants: a `?v=` on any page load is remembered for the tab (src/lib/variants.ts).
  useEffect(rememberVariants, [])
  // a: the language button beside the theme switch (the prerendered bar); b: Settings only; c: the button, and
  // Collage hidden on phones.
  const langVariant = useVariant('lang', LANG_VARIANTS)
  // On <html>, in the commit that renders the variant's markup, so the bar's CSS and --topbar-h never disagree with it.
  // None on the server and while hydrating: the default selectors are a's.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.topbar = langVariant
    return () => { delete root.dataset.topbar }
  }, [langVariant])
  return (
    <header ref={ref} className="eb-topbar" data-testid="topbar">
      <div className="eb-topbar-in">
        {/* Variant c hides Collage on phones, so the wordmark (which goes to the same page) says where you are. */}
        <Link href="/" className="eb-wordmark" aria-current={langVariant === 'c' && path === '/' ? 'page' : undefined}>Everybird</Link>
        <nav aria-label={t.shell.nav.label} className="eb-nav">
          <ul>
            {PAGES.map((p) => (
              <li key={p.href} data-nav={p.key}>
                <Link href={p.href} className="eb-nav-link" aria-current={path === p.href ? 'page' : undefined}>{t.shell.nav[p.key]}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="eb-topbar-end">
          {langVariant !== 'b' && <LanguageMenu />}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
