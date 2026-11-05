// Collage motion: the constants and the direct style writer, ported from LifeList.tsx (framer-site).
// Birds are positioned by writing CSS variables straight onto their elements (never by re-rendering
// every bird), unchanged values are skipped, and each bird's Web Animation is kept in a map and cancelled
// directly: getAnimations() would force a style recalculation per bird in the tap frame (LifeList v5).
import type { StateLayout } from '@/lib/layout/layout-client'
import type { Box } from '@/lib/layout/pack'

// Global Constraints: travel 640ms ease-in-out; arrival 480ms decelerating, starting at 160ms; exit 180ms
// ease-in; ripple 0–120ms by distance from the count. The first appearance ripples out over 0–480ms.
export const TRAVEL = 'cubic-bezier(.45,0,.1,1)'
export const EASE_OUT = 'cubic-bezier(.25,.8,.25,1)'
export const EASE_IN = 'cubic-bezier(.4,0,1,1)'
export const EXIT_MS = 180, MOVE_MS = 640, ENTER_MS = 480, ENTER_AT = 160, RIPPLE_MS = 120, APPEAR_MS = 480
/** Above this many visible birds, and with reduced motion, a change is a 200ms opacity fade instead of travel. */
export const CROSSFADE_AT = 1500
export const FADE_MS = 200
export const SHRINK = 'translate(12%,12%) scale(.76)' // scale .76 about the tile's centre (transform-origin is 0 0)

export const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Layout units to % of the stage width (the collage is placed in cqw). */
export const pct = (v: number, W: number) => (v / W) * 100

/** 0..1: distance of a box's centre from the count at the stage centre (1 at the stage edge or beyond). */
export function fromCount(b: Box, W: number, H: number): number {
  const dx = (b[0] + b[2] / 2 - W / 2) / (W / 2), dy = (b[1] + b[3] / 2 - H / 2) / (H / 2)
  return Math.min(1, Math.hypot(dx, dy))
}

export type Motion = {
  /** Base tile size per bird, in % of the stage width; the current size is a `scale` on top. */
  base: Map<string, [number, number]>
  written: Map<string, string>
  anims: Map<string, Animation>
  /** Largest CSS px width each bird's <img sizes> has been raised to (never lowered). */
  sizes: Map<string, number>
  on: Set<string> | null // birds shown after the last write; null before the first
}
export const newMotion = (): Motion => ({ base: new Map(), written: new Map(), anims: new Map(), sizes: new Map(), on: null })

export type WriteArgs = {
  codes: string[]
  els: Map<string, HTMLElement>
  layout: StateLayout
  visible: Set<string>
  stagePx: number
  /** 'travel': glide with WAAPI exits and entries; 'jump': place without motion (first write, fades). */
  style: 'travel' | 'jump'
}

/** Write every bird's variables and data-off / data-enter for the layout, and start exit / entry animations. */
export function writeBirds(m: Motion, a: WriteArgs): void {
  const { layout, visible, els, stagePx } = a
  const { W, H } = layout
  const prev = m.on
  const on = new Set<string>()
  const enter: string[] = [], exit: string[] = []
  for (const code of a.codes) {
    const el = els.get(code)
    if (!el) continue
    const box = visible.has(code) ? layout.boxes.get(code) : undefined
    if (box) {
      on.add(code)
      let b = m.base.get(code)
      if (!b) {
        b = [pct(box[2], W), pct(box[3], W)]
        m.base.set(code, b)
        el.style.setProperty('--w', String(b[0]))
        el.style.setProperty('--h', String(b[1]))
      }
      const x = pct(box[0], W), y = pct(box[1], W), k = pct(box[2], W) / b[0]
      const md = Math.round(fromCount(box, W, H) * RIPPLE_MS)
      const v = `${x},${y},${k},${md}`
      if (m.written.get(code) !== v) {
        m.written.set(code, v)
        const st = el.style
        st.setProperty('--x', String(x))
        st.setProperty('--y', String(y))
        st.setProperty('--k', String(k))
        st.setProperty('--md', `${md}ms`)
      }
      // Ask for a sharper sticker once the bird is drawn bigger than any size it was shown at before.
      const px = Math.ceil((pct(box[2], W) / 100) * stagePx)
      if (px > (m.sizes.get(code) ?? 0)) {
        m.sizes.set(code, px)
        el.querySelector('img')?.setAttribute('sizes', `${px}px`)
      }
      if (el.hasAttribute('data-off')) { el.removeAttribute('data-off'); el.removeAttribute('aria-hidden') }
      if (prev && !prev.has(code)) enter.push(code)
    } else {
      if (!el.hasAttribute('data-off')) { el.setAttribute('data-off', ''); el.setAttribute('aria-hidden', 'true') }
      if (prev?.has(code)) exit.push(code)
    }
  }
  m.on = on
  const travel = a.style === 'travel'
  // Arriving birds jump to their new spot while invisible (data-enter turns their travel off).
  const entering = new Set(enter)
  for (const code of a.codes) {
    const el = els.get(code)
    if (!el) continue
    if (travel && entering.has(code)) el.setAttribute('data-enter', '')
    else if (el.hasAttribute('data-enter')) el.removeAttribute('data-enter')
  }
  if (!travel) {
    for (const code of [...enter, ...exit]) { m.anims.get(code)?.cancel(); m.anims.delete(code) }
    return
  }
  for (const code of exit) {
    const el = els.get(code)
    if (!el || typeof el.animate !== 'function') continue
    m.anims.get(code)?.cancel()
    m.anims.set(code, el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: SHRINK }], { duration: EXIT_MS, easing: EASE_IN }))
  }
  for (const code of enter) {
    const el = els.get(code)
    if (!el || typeof el.animate !== 'function') continue
    const md = Math.round(fromCount(layout.boxes.get(code)!, W, H) * RIPPLE_MS)
    m.anims.get(code)?.cancel()
    m.anims.set(code, el.animate([{ opacity: 0, transform: SHRINK }, { opacity: 1, transform: 'none' }],
      { duration: ENTER_MS, delay: ENTER_AT + md, easing: EASE_OUT, fill: 'backwards' }))
  }
}

/** After the stage grows: raise each shown bird's <img sizes> so the browser can fetch the sharper file. */
export function raiseSizes(m: Motion, els: Map<string, HTMLElement>, layout: StateLayout, stagePx: number): void {
  if (!m.on) return
  for (const code of m.on) {
    const box = layout.boxes.get(code)
    if (!box) continue
    const px = Math.ceil((pct(box[2], layout.W) / 100) * stagePx)
    if (px > (m.sizes.get(code) ?? 0)) {
      m.sizes.set(code, px)
      els.get(code)?.querySelector('img')?.setAttribute('sizes', `${px}px`)
    }
  }
}
