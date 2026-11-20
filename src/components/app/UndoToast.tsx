'use client'
// "Removed … · Undo": the toast after a removal (the bird card's Remove) or a change by hand ("Added … · Undo" too). It
// takes focus as it appears (the control that removed the bird has gone, so keyboard users land on Undo) unless
// `focus` is false (Add by hand keeps focus on its list), stays about 6 s, and waits while it has focus or the pointer
// is on it. The slot is a live region, so the line is announced.
import { useEffect, useRef, useState } from 'react'
import { plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import type { Ui } from '@/i18n/messages/en-ui'

/** How long "Removed … · Undo" stays. */
export const UNDO_MS = 6000

/** What a removal (or a change by hand) touched, to undo: the line to show and the codes. */
export type Removal = { text: string; codes: string[] }

/** "Removed Snow Goose." for one bird, "Removed 3 birds." for more, in `t`'s language. */
export function removedText(names: string[], t: Ui): string {
  return plural(t.collage.removed, names.length, { n: formatInt(names.length, t.num), name: names[0] ?? '' })
}

type Props = {
  /** The line to show; null shows nothing. A new object restarts the toast. */
  removal: Removal | null
  onUndo: () => void
  /** The toast has timed out. */
  onDone: () => void
  /** Undo takes focus as the toast appears (default true). */
  focus?: boolean
}

export function UndoToast({ removal, onUndo, onDone, focus = true }: Props) {
  const { t } = useI18n()
  const undoRef = useRef<HTMLButtonElement>(null)
  const [held, setHeld] = useState(false)
  useEffect(() => {
    if (!removal || !focus) return
    const raf = requestAnimationFrame(() => undoRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(raf)
  }, [removal, focus])
  useEffect(() => {
    if (!removal || held) return
    const t = setTimeout(onDone, UNDO_MS)
    return () => clearTimeout(t)
  }, [removal, held, onDone])
  return (
    <div className="eb-toast-slot" role="status">
      {removal && (
        <div
          className="eb-toast"
          data-testid="undo-toast"
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
        >
          <span>{removal.text}</span>
          <button ref={undoRef} type="button" className="eb-textbtn" onClick={() => { setHeld(false); onUndo() }}>{t.collage.undo}</button>
        </div>
      )}
    </div>
  )
}
