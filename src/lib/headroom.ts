// The top bar's headroom: it slides up out of view while the page scrolls down and back in on any upward scroll.
// One controller per mounted TopBar (attachHeadroom); the bar keeps its place in the flow (position: sticky), so hiding
// is a transform only (app.css, `.eb-topbar[data-hidden]`) and never changes the document's height or scroll position.
//
// Cost per scroll frame: the scroll handler reads scrollY (layout is clean there: scroll events run before the
// frame's rAF callbacks) and asks for one rAF; the rAF compares numbers and writes `data-hidden` only when the state
// flips. No React state, no layout reads (the bar's height and the page's height come from ResizeObservers).
//
// Always shown near the top (scrollY at most the bar's height). Frozen while a menu, panel, popover, sheet, the dock
// search or a dialog is open (holdTopBar; round 6 menu audit, item 5): it keeps the state it had, shown or hidden, and
// neither hides nor shows on any scroll until the last hold is released, so opening or closing one never moves the bar
// or the page. Keyboard focus inside the bar shows it (onFocusIn) and then freezes it the same way. Hidden is not
// removed: the bar stays in the accessibility tree and focusable; focusing it shows it.

/** Scroll this far in one direction (px, summed over frames) before the bar hides or shows: no jitter. */
export const HEADROOM_DELTA = 8

let holds = 0

/** The decision, pure (tests/headroom.test.ts). `acc` is the scroll summed in the current direction. */
export function nextHeadroom(
  s: { hidden: boolean; lastY: number; acc: number },
  y: number,
  o: { barH: number; maxY: number; held: boolean },
): { hidden: boolean; lastY: number; acc: number } {
  // iOS rubber-banding reports scrollY below 0 and past the end: treat it as the edge, so the bounce back is no delta.
  const cy = Math.min(Math.max(y, 0), Math.max(o.maxY, 0))
  const d = cy - s.lastY
  let acc = d === 0 ? s.acc : Math.sign(d) === Math.sign(s.acc) ? s.acc + d : d
  let hidden = s.hidden
  if (o.held) acc = 0 // frozen: the state it had
  else if (cy <= o.barH) { hidden = false; acc = 0 }
  else if (acc >= HEADROOM_DELTA) { hidden = true; acc = 0 }
  else if (acc <= -HEADROOM_DELTA) { hidden = false; acc = 0 }
  return { hidden, lastY: cy, acc }
}

/** Run the headroom on `el` (the <header>). Returns the cleanup. */
export function attachHeadroom(el: HTMLElement): () => void {
  let s = { hidden: false, lastY: Math.max(window.scrollY, 0), acc: 0 }
  let barH = el.offsetHeight
  let docH = document.documentElement.scrollHeight
  let viewH = window.innerHeight
  let focused = el.contains(document.activeElement)
  let y = s.lastY
  let raf = 0

  const write = () => {
    if (s.hidden) el.setAttribute('data-hidden', '')
    else el.removeAttribute('data-hidden')
  }
  const update = () => {
    raf = 0
    const was = s.hidden
    s = nextHeadroom(s, y, { barH, maxY: docH - viewH, held: holds > 0 || focused })
    if (s.hidden !== was) write()
  }
  const onScroll = () => {
    y = window.scrollY
    if (!raf) raf = requestAnimationFrame(update)
  }
  const onResize = () => { viewH = window.innerHeight }
  /** Show the bar at once: the shown transform applied now, without the slide. */
  const show = () => {
    s = { ...s, acc: 0 }
    if (!s.hidden) return
    s.hidden = false
    el.style.transition = 'none'
    write()
    void el.offsetHeight
    el.style.transition = ''
  }
  // Focus arriving from the page (Tab, Shift+Tab) shows the bar at once, without the slide. Browsers scroll a newly
  // focused control into view, and a bar still translated out reads as off screen: WebKit scrolls after the focus
  // events (so showing the bar here, applied at once, leaves it nothing to do), Chromium before them (so the page goes
  // back to `y`, the last scroll event's position, which predates this focus; synchronous, so nothing is painted in
  // between). The bar's controls' negative scroll-margin (app.css) cancels the root's scroll-padding for them.
  // Only keyboard focus holds the bar (the spec's "focus moves into it"): Chromium and Firefox also focus a link or
  // button on a mouse click, and the bar outlives client navigation, so a clicked "Settings" would pin it until the
  // next click elsewhere. A mouse click needs nothing: the bar was on screen to be clicked.
  const onFocusIn = (e: FocusEvent) => {
    const t = e.target as Element | null
    if (!t?.matches?.(':focus-visible')) return
    const entering = !focused
    focused = true
    show() // apply the shown transform now, before the browser measures the focused control
    if (entering && Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y)
  }
  const onFocusOut = (e: FocusEvent) => { if (!el.contains(e.relatedTarget as Node | null)) focused = false }

  const ro = typeof ResizeObserver === 'function'
    ? new ResizeObserver((entries) => {
        for (const e of entries) {
          const h = e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height
          if (e.target === el) barH = h
          else docH = h
        }
      })
    : null
  ro?.observe(el)
  ro?.observe(document.documentElement)
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize, { passive: true })
  el.addEventListener('focusin', onFocusIn)
  el.addEventListener('focusout', onFocusOut)
  return () => {
    if (raf) cancelAnimationFrame(raf)
    ro?.disconnect()
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onResize)
    el.removeEventListener('focusin', onFocusIn)
    el.removeEventListener('focusout', onFocusOut)
    el.removeAttribute('data-hidden')
  }
}

/**
 * Freeze the bar while a menu, panel, popover, sheet, the dock search or a dialog is open: it keeps the state it had,
 * shown or hidden, and the page is never scrolled for it. Returns the release.
 */
export function holdTopBar(): () => void {
  holds++
  let done = false
  return () => {
    if (done) return
    done = true
    holds--
  }
}
