'use client'
import { stripLang } from '@/i18n/path'
import { ArrowRight } from '@/components/phosphor-icons'
import Link from '@/components/app/IntentLink'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '@/components/collage/icons'
import { trapTab, useEscapeCapture, useHoldTopBar, useIsSheet } from '@/components/dialog-utils'
import { useI18n } from '@/i18n/I18nProvider'
import { rememberWelcomed, welcomed } from '@/lib/welcome'

/**
 * The first visit's welcome, over the landing's sample collage (Landing renders it, so never with a list on the device,
 * never before storage has been read, never on /settings, /about or a shared view). One line, "Make mine" (to the ways
 * in on Settings) and "Explore the sample", which starts the sample's tour; ✕, Esc and a press outside close it
 * without the tour. Closed once, it stays closed on this
 * device (src/lib/welcome.ts). A small card from 601px, the phones' bottom sheet at 600px and under; a light scrim
 * keeps the sample in view.
 */
export function Welcome({ onExplore }: { onExplore?: () => void }) {
  // Landing only renders on the client, after storage is read, so this is never a server render.
  const [open, setOpen] = useState(() => !welcomed())
  if (!open) return null
  return createPortal(<WelcomeDialog onClose={() => setOpen(false)} onExplore={onExplore} />, document.body)
}

function WelcomeDialog({ onClose, onExplore }: { onClose: () => void; onExplore?: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const primary = useRef<HTMLAnchorElement>(null)
  const lineId = useId()
  const { t } = useI18n()
  const sheet = useIsSheet()
  const explore = () => {
    rememberWelcomed()
    onClose()
  }
  useEscapeCapture(explore)
  useHoldTopBar()
  useLayoutEffect(() => {
    primary.current?.focus({ preventScroll: true })
    // Closed (and not off to Settings), focus goes back to the page: the sample's first control (its view tabs), or the
    // hero's "Make yours" while the sample is still loading.
    return () => {
      if (stripLang(location.pathname) !== '/') return
      const back = document.querySelector<HTMLElement>('.eb-page-landing .eb-view button:not(:disabled)') ?? document.querySelector<HTMLElement>('.eb-page-landing .eb-hero-cta')
      back?.focus({ preventScroll: true })
    }
  }, [])
  return (
    <div className="eb-welcome-scrim" data-sheet={sheet || undefined} onClick={(e) => { if (e.target === e.currentTarget) explore() }}>
      <div
        ref={ref}
        className="eb-welcome"
        role="dialog"
        aria-modal="true"
        aria-labelledby={lineId}
        tabIndex={-1}
        data-testid="welcome"
        onKeyDown={(e) => trapTab(e, ref.current)}
      >
        <p id={lineId} className="eb-welcome-line">{t.landing.welcome}</p>
        <div className="eb-welcome-actions">
          <Link ref={primary} href="/settings#sources" className="eb-btn" onClick={rememberWelcomed}>
            {t.landing.makeMine}
            <ArrowRight aria-hidden="true" focusable="false" weight="bold" />
          </Link>
          {/* The button (not ✕, Esc or a press outside) starts the sample's guided tour (Tour.tsx). */}
          <button type="button" className="eb-btn eb-btn-quiet" onClick={() => { explore(); onExplore?.() }}>{t.landing.explore}</button>
        </div>
        <button type="button" className="eb-welcome-close" aria-label={t.collage.close} onClick={explore}>
          <CloseIcon />
        </button>
      </div>
    </div>
  )
}
