'use client'
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'

/** Below this width, popovers become bottom sheets. */
export const SHEET_BELOW = 600
export const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/** Pointer devices >= 600px get a popover; narrower screens a bottom sheet. Read synchronously on first render. */
export function useIsSheet(): boolean {
  const query = () => (typeof window.matchMedia === 'function' ? window.matchMedia(`(max-width: ${SHEET_BELOW - 1}px)`) : null)
  const [sheet, setSheet] = useState(() => (typeof window === 'undefined' ? false : (query()?.matches ?? window.innerWidth < SHEET_BELOW)))
  useLayoutEffect(() => {
    const mq = query()
    const read = () => setSheet(mq ? mq.matches : window.innerWidth < SHEET_BELOW)
    mq?.addEventListener?.('change', read)
    return () => mq?.removeEventListener?.('change', read)
  }, [])
  return sheet
}

/**
 * Esc closes. Captured on window and stopped, so nothing underneath (a dialog, the page) also sees this Esc.
 */
export function useEscapeCapture(onClose: () => void): void {
  const ref = useRef(onClose)
  useLayoutEffect(() => {
    ref.current = onClose
  })
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        ref.current()
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
}

/** Keep Tab inside `root` (a modal). Call from the root's onKeyDown. */
export function trapTab(e: ReactKeyboardEvent, root: HTMLElement | null): void {
  if (e.key !== 'Tab' || !root) return
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
  if (!items.length) return
  const first = items[0], last = items[items.length - 1]
  if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

/** Move focus into `ref` on mount; on unmount send it to `returnTo()` (or whatever was focused before). */
export function useFocusInAndBack(ref: RefObject<HTMLElement | null>, returnTo?: () => HTMLElement | null | undefined): void {
  const back = useRef(returnTo)
  useLayoutEffect(() => {
    back.current = returnTo
  })
  useLayoutEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus({ preventScroll: true })
    return () => {
      const target = back.current?.() ?? prev
      if (target?.isConnected) target.focus({ preventScroll: true })
    }
  }, [ref])
}
