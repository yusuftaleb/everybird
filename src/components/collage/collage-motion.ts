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
/** Birds written per frame during a travel (the rest follow in the next frames, in ripple order). */
export const WRITE_CHUNK = 200
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
  /** Birds playing their exit; they get data-off when it ends (so no per-frame main-thread transition runs). */
  leaving: Set<string>
}
export const newMotion = (): Motion => ({ base: new Map(), written: new Map(), anims: new Map(), sizes: new Map(), on: null, leaving: new Set() })

export type WriteArgs = {
  codes: string[]
  els: Map<string, HTMLElement>
  layout: StateLayout
  visible: Set<string>
  stagePx: number
  /** 'travel': glide with WAAPI exits and entries; 'jump': place without motion (first write, fades). */
  style: 'travel' | 'jump'
  /**
   * The viewport's vertical span in stage units (% of the stage width, like --y). Birds entering or leaving
   * entirely outside it skip their entry / exit animation (nobody sees it, and each one costs a composited
   * layer and a style update per frame). Omitted: every bird animates.
   */
  view?: { top: number; bottom: number }
}

const inView = (view: WriteArgs['view'], y: number, h: number) => !view || (y < view.bottom && y + h > view.top)

/** One bird's DOM changes for a layout, applied later (in ripple order) by `run`. */
export type BirdOp = { md: number; run: () => void }

/**
 * Plan every bird's changes for the layout without touching the DOM, and return the birds shown afterwards.
 * Whether a bird is currently shown is read from the DOM (`data-off`), and `written` is updated only when an op
 * runs, so a plan whose ops were partly applied (and then superseded) is always re-planned correctly.
 * Ops come sorted by ripple delay (nearest the count first), so applying them in chunks keeps the ripple.
 */
export function planBirds(m: Motion, a: WriteArgs): { ops: BirdOp[]; on: Set<string> } {
  const { layout, visible, els, stagePx } = a
  const { W, H } = layout
  const travel = a.style === 'travel'
  const animated = m.on !== null // the first write places birds without entry/exit motion
  const on = new Set<string>()
  const ops: BirdOp[] = []
  for (const code of a.codes) {
    const el = els.get(code)
    if (!el) continue
    const box = visible.has(code) ? layout.boxes.get(code) : undefined
    const wasOff = el.hasAttribute('data-off') || m.leaving.has(code)
    const entering = el.hasAttribute('data-enter')
    if (box) {
      on.add(code)
      const x = pct(box[0], W), y = pct(box[1], W)
      const md = Math.round(fromCount(box, W, H) * RIPPLE_MS)
      const px = Math.ceil((pct(box[2], W) / 100) * stagePx)
      const enter = animated && wasOff
      const seen = inView(a.view, y, pct(box[3], W))
      const b = m.base.get(code)
      const v = b ? `${x},${y},${pct(box[2], W) / b[0]},${md}` : ''
      if (b && m.written.get(code) === v && !wasOff && !entering && px <= (m.sizes.get(code) ?? 0)) continue
      ops.push({
        md,
        run: () => {
          let base = m.base.get(code)
          if (!base) {
            base = [pct(box[2], W), pct(box[3], W)]
            m.base.set(code, base)
            el.style.setProperty('--w', String(base[0]))
            el.style.setProperty('--h', String(base[1]))
          }
          const k = pct(box[2], W) / base[0]
          const val = `${x},${y},${k},${md}`
          if (m.written.get(code) !== val) {
            m.written.set(code, val)
            const st = el.style
            st.setProperty('--x', String(x))
            st.setProperty('--y', String(y))
            st.setProperty('--k', String(k))
            st.setProperty('--md', `${md}ms`)
          }
          // Ask for a sharper sticker once the bird is drawn bigger than any size it was shown at before.
          if (px > (m.sizes.get(code) ?? 0)) {
            m.sizes.set(code, px)
            el.querySelector('img')?.setAttribute('sizes', `${px}px`)
          }
          // Arriving birds jump to their new spot while invisible (data-enter turns their travel off).
          if (travel && enter) el.setAttribute('data-enter', '')
          else if (el.hasAttribute('data-enter')) el.removeAttribute('data-enter')
          if (m.leaving.delete(code)) { m.anims.get(code)?.cancel(); m.anims.delete(code) }
          if (el.hasAttribute('data-off')) el.removeAttribute('data-off')
          if (el.hasAttribute('aria-hidden')) el.removeAttribute('aria-hidden')
          if (!enter) return
          m.anims.get(code)?.cancel()
          m.anims.delete(code)
          if (!travel || !seen || typeof el.animate !== 'function') return
          m.anims.set(code, el.animate([{ opacity: 0, transform: SHRINK }, { opacity: 1, transform: 'none' }],
            { duration: ENTER_MS, delay: ENTER_AT + md, easing: EASE_OUT, fill: 'backwards' }))
        },
      })
    } else {
      if (wasOff && !entering) continue
      const [, wy, wk, wmd] = (m.written.get(code) ?? '').split(',').map(Number)
      const md = wmd || 0 // its ripple delay where it was
      const seen = inView(a.view, wy || 0, (m.base.get(code)?.[1] ?? 0) * (wk || 1))
      ops.push({
        md,
        run: () => {
          if (el.hasAttribute('data-enter')) el.removeAttribute('data-enter')
          if (el.hasAttribute('data-off') || m.leaving.has(code)) return
          el.setAttribute('aria-hidden', 'true')
          m.anims.get(code)?.cancel()
          m.anims.delete(code)
          if (!travel || !animated || !seen || typeof el.animate !== 'function') { el.setAttribute('data-off', ''); return }
          // A composited shrink-and-fade, held at its end; data-off (visibility hidden) lands when it finishes.
          const anim = el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: SHRINK }], { duration: EXIT_MS, easing: EASE_IN, fill: 'forwards' })
          m.leaving.add(code)
          m.anims.set(code, anim)
          anim.onfinish = () => {
            if (m.anims.get(code) !== anim) return
            m.leaving.delete(code)
            m.anims.delete(code)
            el.setAttribute('data-off', '')
            anim.cancel()
          }
        },
      })
    }
  }
  ops.sort((p, q) => p.md - q.md)
  return { ops, on }
}

/** Write every bird's variables and data-off / data-enter for the layout now, and start exit / entry animations. */
export function writeBirds(m: Motion, a: WriteArgs): void {
  const { ops, on } = planBirds(m, a)
  m.on = on
  for (const op of ops) op.run()
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
