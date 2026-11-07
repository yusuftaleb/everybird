'use client'
import { ArrowRight } from '@phosphor-icons/react'
import Link from 'next/link'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '@/components/collage/icons'
import { trapTab, useEscapeCapture, useHoldTopBar, useIsSheet } from '@/components/dialog-utils'
import { rememberWelcomed, welcomed } from '@/lib/welcome'

/**
 * The first visit's welcome, over the landing's sample collage (Landing renders it, so never with a list on the device,
 * never before storage has been read, never on /settings, /about or a shared view). One line, "Make mine" (to the ways
 * in on Settings) and "Explore the sample"; ✕, Esc and a press outside are Explore. Closed once, it stays closed on this
 * device (src/lib/welcome.ts). A small card from 601px, the phones' bottom sheet at 600px and under; a light scrim
 * keeps the sample in view.
 */
export function Welcome() {
  // Landing only renders on the client, after storage is read, so this is never a server render.
  const [open, setOpen] = useState(() => !welcomed())
  if (!open) return null
  return createPortal(<WelcomeDialog onClose={() => setOpen(false)} />, document.body)
}

function WelcomeDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const primary = useRef<HTMLAnchorElement>(null)
  const lineId = useId()
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
      if (location.pathname !== '/') return
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
        <p id={lineId} className="eb-welcome-line">A lifetime of birds, as a sticker collage.</p>
        <div className="eb-welcome-actions">
          <Link ref={primary} href="/settings#sources" className="eb-btn" onClick={rememberWelcomed}>
            Make mine
            <ArrowRight aria-hidden="true" focusable="false" weight="bold" />
          </Link>
          <button type="button" className="eb-btn eb-btn-quiet" onClick={explore}>Explore the sample</button>
        </div>
        <button type="button" className="eb-welcome-close" aria-label="Close" onClick={explore}>
          <CloseIcon />
        </button>
      </div>
    </div>
  )
}
