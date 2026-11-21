'use client'
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import { holdTopBar } from '@/lib/headroom'

/** At or below this width (phones, as /lifelist's max-width:600px), popovers become bottom sheets. */
export const SHEET_AT = 600
export const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/** Screens wider than 600px get a popover; 600px and narrower a bottom sheet (the phone controls bar's breakpoint
 * too, app.css). Read synchronously on first render. */
export function useIsSheet(): boolean {
  const query = () => (typeof window.matchMedia === 'function' ? window.matchMedia(`(max-width: ${SHEET_AT}px)`) : null)
  const [sheet, setSheet] = useState(() => (typeof window === 'undefined' ? false : (query()?.matches ?? window.innerWidth <= SHEET_AT)))
  useLayoutEffect(() => {
    const mq = query()
    const read = () => setSheet(mq ? mq.matches : window.innerWidth <= SHEET_AT)
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

/**
 * While mounted, the top bar stays shown (its headroom never hides it under an open dialog, sheet or popover).
 * `clear()` names an element the shown bar must not cover (a popover's controls bar): the page scrolls it out from
 * under the bar on open.
 */
export function useHoldTopBar(clear?: () => HTMLElement | null | undefined): void {
  const get = useRef(clear)
  useLayoutEffect(() => holdTopBar(get.current?.()), [])
}

/** Keep Tab inside `root` (a modal). Call from the root's onKeyDown. */
export function trapTab(e: ReactKeyboardEvent, root: HTMLElement | null): void {
  if (e.key !== 'Tab' || !root) return
  // In document order (a selector list may return its matches grouped by selector, as jsdom's does). Not what Tab skips:
  // out of the tab order (a hidden file input) or inside a closed panel (`hidden`).
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.tabIndex >= 0 && !el.closest('[hidden]')).sort((x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
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

/** Brings `el` into view inside its nearest scrolling ancestor only (a panel's list or body), never the page: what
 *  `scrollIntoView({ block: 'nearest' })` does, without scrolling the window when the panel itself is partly off screen. */
export function revealInScroller(el: HTMLElement | null | undefined): void {
  let box = el?.parentElement
  while (box && !(box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement
  if (!el || !box || box === document.scrollingElement || box === document.body) return
  const r = el.getBoundingClientRect(), b = box.getBoundingClientRect()
  if (r.top < b.top) box.scrollTop -= b.top - r.top
  else if (r.bottom > b.bottom) box.scrollTop += Math.min(r.bottom - b.bottom, r.top - b.top)
}
