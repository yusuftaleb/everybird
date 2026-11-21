'use client'
// The site's one toast (round 6 menu audit, item 7): a small card at the bottom centre of the window (app.css
// .eb-toast-slot, .eb-toast), in a live region that is there before anything shows, so each line is announced. It never
// takes focus itself (UndoToast moves focus to its Undo when asked). With `stay` it goes after that many ms, waiting
// while the pointer is on it or focus is inside it; a new `restart` value starts the wait again. One toast at a time:
// the newest open one shows and an older one still open is dismissed (`onDone`), so an import's toast and "Removed … ·
// Undo" never overlap. Used by UndoToast and ImportToast.
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'

/** The open toasts, oldest first; the last one shows. Each entry's `replaced` dismisses it when a newer one opens. */
const open: { id: string; replaced: () => void }[] = []
const subs = new Set<() => void>()
const notify = () => { for (const f of subs) f() }
function push(id: string, replaced: () => void) {
  const before = open.at(-1)
  const at = open.findIndex((o) => o.id === id)
  if (at >= 0) open.splice(at, 1)
  open.push({ id, replaced })
  if (before && before.id !== id) before.replaced()
  notify()
}
function drop(id: string) {
  const at = open.findIndex((o) => o.id === id)
  if (at < 0) return
  open.splice(at, 1)
  notify()
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
const topId = () => open.at(-1)?.id ?? null

type Props = {
  /** Whether it has something to show. */
  show: boolean
  /** How long it stays (ms) once shown, while not hovered or focused; none: until `show` goes false. */
  stay?: number
  /** It has stayed its time, or a newer toast replaced it. */
  onDone?: () => void
  /** A new value is a new message: it shows again over any other toast and its wait starts again. */
  restart?: unknown
  testId?: string
  children?: ReactNode
}

export function Toast({ show, stay, onDone, restart, testId, children }: Props) {
  const id = useId()
  const [held, setHeld] = useState(false)
  const done = useRef(onDone)
  useLayoutEffect(() => { done.current = onDone })
  const top = useSyncExternalStore(subscribe, topId, () => null)
  useEffect(() => {
    if (!show) return
    push(id, () => done.current?.())
    return () => drop(id)
    // A new message (restart) claims the slot again.
  }, [show, restart, id])
  const shown = show && top === id
  if (!shown && held) setHeld(false) // gone while hovered or focused: the next message waits afresh
  useEffect(() => {
    if (!shown || held || !stay) return
    const t = setTimeout(() => onDone?.(), stay)
    return () => clearTimeout(t)
  }, [shown, held, stay, onDone, restart])
  return (
    <div className="eb-toast-slot" role="status">
      {shown && (
        <div
          className="eb-toast"
          data-testid={testId}
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}
