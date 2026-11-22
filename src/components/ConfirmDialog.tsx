'use client'
import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { trapTab, useEscapeCapture, useFocusInAndBack, useHoldTopBar, useIsSheet } from '@/components/dialog-utils'
import '@/components/filters/filters.css' // .eb-sheet, the phones' bottom sheet
import './confirm-dialog.css'

type Props = {
  /** The question; it names the dialog. */
  ask: string
  yes: string
  keep: string
  onYes: () => void
  /** Keep it, Esc and a press on the scrim. */
  onKeep: () => void
  /** Where focus goes when it closes (default: what was focused when it opened). */
  returnTo?: () => HTMLElement | null | undefined
}

/**
 * A destructive action's one question (remove a source, restore a backup over the list, forget the list): a small
 * centred card, or the phones' bottom sheet (useIsSheet). Portalled to the body, over everything that opened it (the
 * Add birds dialog included). Esc and a press on the scrim keep; Esc is captured on the window, so a dialog underneath
 * never sees it. Focus starts on the action, as the inline confirmations it replaced did, stays inside, and goes back
 * to `returnTo` on close (after Yes the action's own focus move, a rAF later, wins).
 */
export function ConfirmDialog({ ask, yes, keep, onYes, onKeep, returnTo }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const yesRef = useRef<HTMLButtonElement>(null)
  const askId = useId()
  const sheet = useIsSheet()
  useEscapeCapture(onKeep)
  useHoldTopBar()
  useFocusInAndBack(yesRef, returnTo)
  return createPortal(
    // React events bubble through the portal to the opener's tree (the Add birds dialog's Tab trap and scrim): stop them here.
    <div className="eb-confirm-scrim" data-sheet={sheet || undefined} onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onKeep() }}>
      <div
        ref={ref}
        className={sheet ? 'eb-confirm eb-sheet' : 'eb-confirm'}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={askId}
        tabIndex={-1}
        data-testid="confirm"
        onKeyDown={(e) => { e.stopPropagation(); trapTab(e, ref.current) }}
      >
        <p id={askId} className="eb-confirm-ask">{ask}</p>
        <div className="eb-confirm-acts">
          <button ref={yesRef} type="button" className="eb-btn eb-btn-danger-solid" onClick={onYes}>{yes}</button>
          <button type="button" className="eb-btn eb-btn-quiet" onClick={onKeep}>{keep}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
