// The top bar's headroom: it slides up out of view while the page scrolls down and back in on any upward scroll.
// One controller per mounted TopBar (attachHeadroom); the bar keeps its place in the flow (position: sticky), so hiding
// is a transform only (app.css, `.eb-topbar[data-hidden]`) and never changes the document's height or scroll position.
//
// Cost per scroll frame: the scroll handler reads scrollY (layout is clean there: scroll events run before the
// frame's rAF callbacks) and asks for one rAF; the rAF compares numbers and writes `data-hidden` only when the state
// flips. No React state, no layout reads (the bar's height and the page's height come from ResizeObservers).
//
// Always shown: near the top (scrollY at most the bar's height), while a dialog, sheet or popover holds it
// (holdTopBar), and while keyboard focus is inside the bar. Hidden is not removed: the bar stays in the accessibility
// tree and focusable; focusing it shows it.

/** Scroll this far in one direction (px, summed over frames) before the bar hides or shows: no jitter. */
export const HEADROOM_DELTA = 8

type Bar = { el: HTMLElement; show: () => void }
const bars = new Set<Bar>()
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
  if (cy <= o.barH || o.held) { hidden = false; acc = 0 }
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
  const show = () => {
    s = { ...s, acc: 0 }
    if (s.hidden) { s.hidden = false; write() }
  }
  // Focus arriving from the page (Tab, Shift+Tab) shows the bar at once, without the slide. Browsers scroll a newly
  // focused control into view, and a bar still translated out reads as off screen: WebKit scrolls after the focus
  // events (so showing the bar here, applied at once, leaves it nothing to do), Chromium before them (so the page goes
  // back to `y`, the last scroll event's position, which predates this focus; synchronous, so nothing is painted in
  // between). The bar's controls' negative scroll-margin (app.css) cancels the root's scroll-padding for them.
  const onFocusIn = () => {
    const entering = !focused
    focused = true
    s = { ...s, acc: 0 }
    if (s.hidden) {
      s.hidden = false
      el.style.transition = 'none'
      write()
      void el.offsetHeight // apply the shown transform now, before the browser measures the focused control
      el.style.transition = ''
    }
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
  const bar: Bar = { el, show }
  bars.add(bar)
  return () => {
    bars.delete(bar)
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
 * Keep the bar shown (a dialog, sheet or popover is open). Returns the release. With `clear`, an element under the bar
 * (the Places and Time popovers' controls bar) is scrolled down out from under it if the shown bar would cover it.
 */
export function holdTopBar(clear?: HTMLElement | null): () => void {
  holds++
  for (const b of bars) {
    b.show()
    if (!clear) continue
    // The bar's own height: it is sticky at top 0, so shown, its bottom is its height. One read, on open only.
    const gap = clear.getBoundingClientRect().top - b.el.offsetHeight
    if (gap < 8) window.scrollBy(0, gap - 8)
  }
  let done = false
  return () => {
    if (done) return
    done = true
    holds--
  }
}
