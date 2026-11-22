'use client'
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import { holdTopBar } from '@/lib/headroom'

/** At or below this width (phones, as /lifelist's max-width:600px), popovers become bottom sheets. */
const SHEET_AT = 600
/** At or below this height (a landscape phone's), the controls bar's panels and the bird card are sheets too: a popover
 *  under the dock would run off the window's bottom. */
const SHORT_AT = 500
const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/** Screens wider than 600px get a popover; 600px and narrower a bottom sheet (the phone controls bar's breakpoint
 * too, app.css). With `short`, a window 500px tall or less is a sheet too (the dock's panels and the bird card, on a
 * landscape phone). Read synchronously on first render. */
export function useIsSheet({ short = false }: { short?: boolean } = {}): boolean {
  const [sheet, setSheet] = useState(() => (typeof window === 'undefined' ? false : sheetNow(short)))
  useLayoutEffect(() => {
    const mq = sheetQuery(short)
    const read = () => setSheet(sheetNow(short))
    mq?.addEventListener?.('change', read)
    return () => mq?.removeEventListener?.('change', read)
  }, [short])
  return sheet
}
const sheetQuery = (short: boolean) =>
  typeof window.matchMedia === 'function' ? window.matchMedia(short ? `(max-width: ${SHEET_AT}px), (max-height: ${SHORT_AT}px)` : `(max-width: ${SHEET_AT}px)`) : null
const sheetNow = (short: boolean) => sheetQuery(short)?.matches ?? (window.innerWidth <= SHEET_AT || (short && window.innerHeight <= SHORT_AT))

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
 * While mounted, the top bar is frozen (headroom.ts' holdTopBar): it keeps the state it had, shown or hidden, under an
 * open menu, panel, popover, sheet, the dock search or a dialog, and the page is never scrolled for it.
 */
export function useHoldTopBar(): void {
  useLayoutEffect(() => holdTopBar(), [])
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

/** How much of the layout viewport's bottom the on-screen keyboard covers (px): the part of `innerHeight` under the
 *  visual viewport. 0 without one. */
export const keyboardInset = (innerHeight: number, vv: { height: number; offsetTop: number } | null | undefined): number =>
  vv ? Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)) : 0

/**
 * While `on`, a bottom sheet keeps clear of the on-screen keyboard: `--kb` on `ref` is the keyboard's height
 * (`keyboardInset`, from `visualViewport`), and on every change the focused control inside is brought into view in its
 * scroller (`revealInScroller`), so the field being typed in stays above the keys.
 */
export function useKeyboardInset(ref: RefObject<HTMLElement | null>, on: boolean): void {
  useEffect(() => {
    const vv = typeof window === 'undefined' ? null : window.visualViewport
    const el = ref.current
    if (!on || !vv || !el) return
    const update = () => {
      el.style.setProperty('--kb', `${keyboardInset(window.innerHeight, vv)}px`)
      const f = document.activeElement
      if (f instanceof HTMLElement && el.contains(f)) revealInScroller(f)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      el.style.removeProperty('--kb')
    }
  }, [ref, on])
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
