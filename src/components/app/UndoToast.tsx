'use client'
// "Removed … · Undo": the toast after a removal (the bird card's Remove, Tick by hand's "Remove N from my list"). It
// takes focus as it appears (the control that removed the bird has gone, so keyboard users land on Undo), stays about
// 6 s, and waits while it has focus or the pointer is on it. The slot is a live region, so the line is announced.
import { useEffect, useRef, useState } from 'react'

/** How long "Removed … · Undo" stays. */
export const UNDO_MS = 6000

/** What a removal took off, to undo: the line to show and the codes. */
export type Removal = { text: string; codes: string[] }

/** "Removed Snow Goose." for one bird, "Removed 3 birds." for more. */
export function removedText(names: string[]): string {
  return names.length === 1 ? `Removed ${names[0]}.` : `Removed ${names.length.toLocaleString('en-US')} birds.`
}

type Props = {
  /** The line to show; null shows nothing. A new object restarts the toast. */
  removal: Removal | null
  onUndo: () => void
  /** The toast has timed out. */
  onDone: () => void
}

export function UndoToast({ removal, onUndo, onDone }: Props) {
  const undoRef = useRef<HTMLButtonElement>(null)
  const [held, setHeld] = useState(false)
  useEffect(() => {
    if (!removal) return
    const raf = requestAnimationFrame(() => undoRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(raf)
  }, [removal])
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
          <button ref={undoRef} type="button" className="eb-textbtn" onClick={() => { setHeld(false); onUndo() }}>Undo</button>
        </div>
      )}
    </div>
  )
}
