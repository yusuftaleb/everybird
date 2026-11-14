'use client'
// The top bar on every page, after the site's phone top bar (framer-site code-components/SiteNav.tsx): the Everybird
// wordmark home on the left, then Collage, Settings and About (the current page carries aria-current="page" and the
// site's active style: Surface fill, Hairline border, Accent), and the sun/moon theme switch on the right. One row
// down to 320px. Sticky with headroom (src/lib/headroom.ts): it slides out of view while the page scrolls down and back
// on any upward scroll, at the top, while a dialog holds it and while focus is inside it.
import Link from '@/components/app/IntentLink'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { attachHeadroom } from '@/lib/headroom'
import { ThemeToggle } from './ThemeToggle'

const PAGES = [
  { href: '/', label: 'Collage' },
  { href: '/settings', label: 'Settings' },
  { href: '/about', label: 'About' },
] as const

export function TopBar() {
  const path = usePathname()
  const ref = useRef<HTMLElement>(null)
  useEffect(() => (ref.current ? attachHeadroom(ref.current) : undefined), [])
  return (
    <header ref={ref} className="eb-topbar" data-testid="topbar">
      <div className="eb-topbar-in">
        <Link href="/" className="eb-wordmark">Everybird</Link>
        <nav aria-label="Everybird" className="eb-nav">
          <ul>
            {PAGES.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="eb-nav-link" aria-current={path === p.href ? 'page' : undefined}>{p.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <ThemeToggle />
      </div>
    </header>
  )
}
