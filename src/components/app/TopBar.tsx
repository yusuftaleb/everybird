'use client'
// The top bar on every page, after the site's phone top bar (framer-site code-components/SiteNav.tsx): the Everybird
// wordmark home on the left, then My birds (the page at /, its key `collage`), Compare, Settings and About (the current page carries aria-current="page" and the
// site's active style: Surface fill, Hairline border, Accent), then on the right the language button (LanguageMenu)
// and the sun/moon theme switch, together in row one at every width. On phones (under 620px) the four pages are icon
// tabs (Birdhouse, Intersect, GearSix, Info), so the bar is one line; under 381px (360 and 375px phones) the wordmark is the
// site icon's origami bird (OrigamiMark), the word visually hidden so the link is still named Everybird. Under 320px of
// page, where even that can't fit, the nav takes its own second row in words (app.css; --topbar-h in tokens.css
// follows), which wraps onto a second line. Each link is named by its word (aria-label), the icon titled by it. Sticky with headroom (src/lib/headroom.ts): it slides out of view while the page
// scrolls down and back on any upward scroll, at the top, while a dialog holds it and while focus is inside it.
import Link from '@/components/app/IntentLink'
import { GearSix, Info, Intersect, type Icon } from '@/components/phosphor-icons'
import { IconBase } from '@phosphor-icons/react'
import { createElement as h, forwardRef, useEffect, useRef } from 'react'
import { useI18n } from '@/i18n/I18nProvider'
import { useAppPath } from '@/i18n/path'
import { attachHeadroom } from '@/lib/headroom'
import { ORIGAMI_PATH } from '@/lib/origami-mark'
import { LanguageMenu } from './LanguageMenu'
import { ThemeToggle } from './ThemeToggle'

/** The site icon's bird (Icons8 "Origami", Fluent Systems Regular, credited on About; scripts/build-data/build-icons.ts),
 *  traced from its 512px PNG's alpha at the half pixel: the same shape, drawn inline in currentColor, no request. */
function OrigamiMark() {
  return (
    <svg className="eb-wordmark-mark" viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <path fill="currentColor" fillRule="evenodd" d={ORIGAMI_PATH} />
    </svg>
  )
}

// My birds' icon, a birdhouse (Yusuf, 2026-11-21). Phosphor has none: drawn on its 256 grid at the regular weight
// (16 stroke, round caps and joins), as src/lib/arrangement.ts draws the Oval: a steep peaked roof with small eaves (24
// past the walls), walls taller than wide (a birdhouse, not a house) and the floor, a round entrance hole high in the
// face and a short perch well under it (closer, the two read as a face). Only the weight the bar draws.
const BIRDHOUSE = new Map([['regular' as const, h('g', { fill: 'none', stroke: 'currentColor', strokeWidth: 16, strokeLinecap: 'round', strokeLinejoin: 'round' },
  h('polyline', { points: '40,108 128,24 216,108' }),
  h('polyline', { points: '64,85 64,232 192,232 192,85' }),
  h('circle', { cx: 128, cy: 122, r: 28 }),
  h('line', { x1: 118, y1: 194, x2: 138, y2: 194 }),
)]])
const Birdhouse: Icon = forwardRef((props, ref) => h(IconBase, { ref, ...props, weights: BIRDHOUSE }))
Birdhouse.displayName = 'Birdhouse'

const PAGES = [
  { href: '/', key: 'collage', Icon: Birdhouse },
  { href: '/compare', key: 'compare', Icon: Intersect },
  { href: '/settings', key: 'settings', Icon: GearSix },
  { href: '/about', key: 'about', Icon: Info },
] as const

export function TopBar() {
  // Unprefixed on the server (/es/settings) and in the browser (/settings) alike: the same aria-current both times.
  const path = useAppPath()
  const { t } = useI18n()
  const ref = useRef<HTMLElement>(null)
  useEffect(() => (ref.current ? attachHeadroom(ref.current) : undefined), [])
  return (
    <header ref={ref} className="eb-topbar" data-testid="topbar">
      <div className="eb-topbar-in">
        <Link href="/" className="eb-wordmark"><OrigamiMark /><span className="eb-wordmark-word">Everybird</span></Link>
        <nav aria-label={t.shell.nav.label} className="eb-nav">
          <ul>
            {PAGES.map((p) => (
              <li key={p.href} data-nav={p.key}>
                <Link href={p.href} className="eb-nav-link" aria-label={t.shell.nav[p.key]} aria-current={path === p.href ? 'page' : undefined}>
                  <p.Icon className="eb-nav-icon" aria-hidden="true" focusable="false" alt={t.shell.nav[p.key]} />
                  <span className="eb-nav-word">{t.shell.nav[p.key]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="eb-topbar-end">
          <LanguageMenu />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
