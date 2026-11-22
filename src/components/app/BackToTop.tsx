'use client'
import { ArrowUp } from '@/components/phosphor-icons'
import { useEffect, useRef, useState } from 'react'
import { reduced } from '@/components/collage/collage-motion'
import { useI18n } from '@/i18n/I18nProvider'

/** How far down the page (px) the button waits before it shows. */
export const SHOW_AFTER = 600

/**
 * "Back to top", on every page (SiteFooter mounts it): a 44px squircle fixed to the bottom-right corner that fades in
 * once the page has scrolled past SHOW_AFTER and glides to the top (at once under reduced motion). Pressing it sends
 * the button off immediately, rising in the direction of travel, and it stays away until the page is back near the
 * top or the reader scrolls down again. Focus moves to the page's <main> so the keyboard starts from the top too.
 */
export function BackToTop() {
  const { t } = useI18n()
  const [shown, setShown] = useState(false)
  const [launched, setLaunched] = useState(false)
  const away = useRef(false)

  useEffect(() => {
    let last = window.scrollY
    const update = () => {
      const y = window.scrollY
      // Arrived, or the reader took over and scrolled down: ready to come back.
      if (away.current && (y <= SHOW_AFTER || y > last + 2)) {
        away.current = false
        setLaunched(false)
      }
      last = y
      setShown(y > SHOW_AFTER)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  const toTop = () => {
    away.current = true
    setLaunched(true)
    window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' })
    const main = document.querySelector<HTMLElement>('main')
    if (main) {
      if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1')
      main.focus({ preventScroll: true })
    }
  }

  const on = shown && !launched
  return (
    <button
      type="button"
      className="eb-totop"
      aria-label={t.shell.toTop}
      title={t.shell.toTop}
      data-testid="to-top"
      data-hidden={on ? undefined : ''}
      data-launched={launched ? '' : undefined}
      tabIndex={on ? 0 : -1}
      aria-hidden={on ? undefined : true}
      onClick={toTop}
    >
      <ArrowUp aria-hidden="true" focusable="false" />
    </button>
  )
}
