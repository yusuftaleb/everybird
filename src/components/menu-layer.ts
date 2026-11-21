'use client'
// The one floating layer for menus and popovers opened from a button (round 6, item 19, shared after the audit): the share
// dialog's dropdowns (MenuSelect's `layer`), Settings' and Add birds' ⋯ source menus (SourceMenu) and their "why?"
// popovers (SourceLine). While open the element is fixed to its button in window coordinates (menuPlace: under it, or
// over it when its list doesn't fit below and there is more room above, kept 8px inside the window) and shown in the top
// layer (`popover="manual"`, `showPopover()`), so no ancestor's transform (an entry animation's fill included),
// containment, container-type or overflow (the Add birds dialog's scrolling box) moves or clips it. It stays in its
// place in the DOM, so focus, Tab trapping, outside-press checks and assistive technology see it where it was. Where the
// popover API is missing it is placed the same way, `position: fixed`, in the page: the dialogs around these layers keep
// no containing block for fixed descendants (tests/menu-layer.test.tsx). It follows its button when anything but itself
// scrolls and when the window resizes. Light dismiss, Esc and focus return stay with each component.
import { useLayoutEffect, type RefObject } from 'react'

/** Whether the browser has the popover API (the top layer). */
export const canPopover = () => typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function'

/** The layer's side margin from the window's edges (as the language menu's). */
const EDGE = 8
/** Between the button and the layer (as .eb-menu's 6px). */
const GAP = 6

type ButtonBox = { top: number; bottom: number; right: number; left?: number }

/**
 * Where a floating layer goes (window px): under the button `b`, or over it (`up`) when its natural height `h` doesn't
 * fit below and there is more room above; `maxH` is the room on that side (the layer scrolls past it). Its right edge on
 * the button's (`align` 'end', the menus) or its left edge on the button's ('start', "why?"), as `right`, keeping its
 * left edge EDGE inside the window. `vw`/`vh`: the window's size.
 */
export function menuPlace(b: ButtonBox, h: number, w: number, vw: number, vh: number, align: 'start' | 'end' = 'end') {
  const below = vh - b.bottom - GAP - EDGE, above = b.top - GAP - EDGE
  const up = h > below && above > below
  const right = align === 'start' ? vw - Math.max(EDGE, Math.min(b.left ?? 0, vw - EDGE - w)) - w : Math.min(vw - b.right, vw - EDGE - w)
  return { up, y: up ? vh - b.top + GAP : b.bottom + GAP, maxH: Math.max(0, up ? above : below), right: Math.max(EDGE, right) }
}

/**
 * While `on`, shows `layer` in the top layer (or fixed, without the popover API) at `btn` (see the header). `cap`: the
 * layer's own height limit in px (its CSS max-height), under 50dvh and the room on its side.
 */
export function useMenuLayer(
  layer: RefObject<HTMLElement | null>,
  btn: RefObject<HTMLElement | null>,
  { on = true, align = 'end', cap = 320 }: { on?: boolean; align?: 'start' | 'end'; cap?: number } = {},
) {
  useLayoutEffect(() => {
    const el = layer.current
    if (!on || !el) return
    // In the top layer before it is measured (a popover is not rendered until shown); showing an open one, or hiding a
    // hidden one, is a no-op or throws depending on the browser, so neither may stop it. The attribute is set here, not
    // rendered, so a popover rendered on the server (hidden) hydrates as it was.
    const top = canPopover()
    if (top) {
      el.setAttribute('popover', 'manual')
      try { el.showPopover() } catch { /* already open */ }
    }
    el.style.removeProperty('max-height') // measured at its natural height, not last time's room
    const { offsetHeight: h, offsetWidth: w } = el
    const place = () => {
      const b = btn.current?.getBoundingClientRect()
      if (!b) return
      const p = menuPlace(b, h, w, document.documentElement.clientWidth || window.innerWidth, window.innerHeight, align)
      Object.assign(el.style, { position: 'fixed', left: 'auto', right: `${p.right}px`, top: p.up ? 'auto' : `${p.y}px`, bottom: p.up ? `${p.y}px` : 'auto', maxHeight: `min(${cap}px, 50dvh, ${p.maxH}px)` })
      el.toggleAttribute('data-up', p.up)
    }
    const onScroll = (e: Event) => { if (!(e.target instanceof Node && el.contains(e.target))) place() }
    place()
    window.addEventListener('resize', place)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', place)
      document.removeEventListener('scroll', onScroll, true)
      if (top) {
        try { el.hidePopover() } catch { /* already hidden or gone */ }
        el.removeAttribute('popover')
      }
    }
  }, [on, layer, btn, align, cap])
}
