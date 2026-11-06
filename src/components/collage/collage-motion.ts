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
/**
 * Chunked writes (see `takeChunk`): a change bigger than WRITE_START cost units is written over several frames,
 * one chunk per frame starting with the next frame, the budget adapting to how long the last frame took.
 * A unit is about one bird restyle (a leaving bird); a moving or arriving bird starts transitions and costs two.
 */
export const WRITE_START = 100, WRITE_MIN = 50, WRITE_MAX = 800
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
  /** Finished exits waiting for their data-off, FINISH_CHUNK per frame (see `finishLater`). */
  done: (() => void)[]
  doneFrame: number
}
export const newMotion = (): Motion => ({
  base: new Map(), written: new Map(), anims: new Map(), sizes: new Map(), on: null, leaving: new Set(), done: [], doneFrame: 0,
})

/** Finished exits cleaned up per frame (a finished exit holds the bird invisible, so a late data-off shows nothing). */
export const FINISH_CHUNK = 60

/**
 * Run `fn` (a finished exit's data-off) in a coming frame, at most FINISH_CHUNK per frame: exits that started
 * together finish together, and restyling ~300 birds in one frame is a dropped frame on a phone.
 */
export function finishLater(m: Motion, fn: () => void): void {
  if (typeof requestAnimationFrame !== 'function') { fn(); return }
  m.done.push(fn)
  if (m.doneFrame) return
  const flush = () => {
    const batch = m.done.splice(0, FINISH_CHUNK)
    m.doneFrame = m.done.length ? requestAnimationFrame(flush) : 0
    for (const f of batch) f()
  }
  m.doneFrame = requestAnimationFrame(flush)
}

/** Drop pending clean-ups (unmount). */
export function cancelFinishes(m: Motion): void {
  if (m.doneFrame) cancelAnimationFrame(m.doneFrame)
  m.doneFrame = 0
  m.done.length = 0
}

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

/**
 * One bird's DOM changes for a layout, applied later by `run`.
 *  - at:   when its motion starts in the spec, in ms after the change: exits 0, travel its ripple delay,
 *          arrivals ENTER_AT + their ripple delay.
 *  - seen: it is in the viewport before or after the change (or no viewport was given).
 *  - cost: rough style work, in units of one bird restyle.
 *  - exit: a leaving bird (never forced into a chunk early: see takeChunk).
 *  - run(late): apply it `late` ms after the change (the plan). Delays shrink by `late` (an exit starts `late`
 *    ms into its animation), so a bird written a few frames late still moves on the ripple's schedule.
 */
export type BirdOp = { at: number; seen: boolean; cost: number; code?: string; exit?: boolean; run: (late?: number) => void }

/**
 * Plan every bird's changes for the layout without touching the DOM, and return the birds shown afterwards.
 * Whether a bird is currently shown is read from the DOM (`data-off`), and `written` is updated only when an op
 * runs, so a plan whose ops were partly applied (and then superseded) is always re-planned correctly.
 * Ops come in the order to apply them: seen birds first, by when their motion starts (exits, then the travel
 * ripple outward from the count, then arrivals), then the birds outside the viewport, nearest the count first.
 * So a change applied in chunks keeps the ripple where it can be seen.
 */
export function planBirds(m: Motion, a: WriteArgs): { ops: BirdOp[]; on: Set<string> } {
  const { layout, visible, els, stagePx } = a
  const { W, H } = layout
  const travel = a.style === 'travel'
  const animated = m.on !== null // the first write places birds without entry/exit motion
  const on = new Set<string>()
  const ops: (BirdOp & { md: number })[] = []
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
      // A kept bird is seen if it starts or ends in view. `seen` is frozen here, at plan time, though the op may
      // run a few frames later (a scroll in between is not re-checked).
      const was = !wasOff && !entering ? m.written.get(code)?.split(',').map(Number) : undefined
      const seenBefore = was && b ? inView(a.view, was[1] || 0, b[1] * (was[2] || 1)) : false
      ops.push({
        at: enter ? ENTER_AT + md : md,
        seen: seen || seenBefore,
        cost: 2,
        md,
        code,
        run: (late = 0) => {
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
            st.setProperty('--md', `${Math.max(0, md - late)}ms`)
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
            { duration: ENTER_MS, delay: Math.max(0, ENTER_AT + md - late), easing: EASE_OUT, fill: 'backwards' }))
        },
      })
    } else {
      if (wasOff && !entering) continue
      const [, wy, wk, wmd] = (m.written.get(code) ?? '').split(',').map(Number)
      const md = wmd || 0 // its ripple delay where it was
      const seen = inView(a.view, wy || 0, (m.base.get(code)?.[1] ?? 0) * (wk || 1)) // frozen at plan time, as above
      ops.push({
        at: 0,
        seen,
        cost: 1,
        exit: true,
        md,
        code,
        run: (late = 0) => {
          if (el.hasAttribute('data-enter')) el.removeAttribute('data-enter')
          if (el.hasAttribute('data-off') || m.leaving.has(code)) return
          el.setAttribute('aria-hidden', 'true')
          m.anims.get(code)?.cancel()
          m.anims.delete(code)
          // Out of view, without motion, or written after its exit would already have ended: hidden at once.
          if (!travel || !animated || !seen || late >= EXIT_MS || typeof el.animate !== 'function') { el.setAttribute('data-off', ''); return }
          // A composited shrink-and-fade, held at its end; data-off (visibility hidden) lands when it finishes.
          // Written `late` ms after the change, it starts that far in (negative delay), so it ends on schedule.
          const anim = el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: SHRINK }],
            { duration: EXIT_MS, delay: -late, easing: EASE_IN, fill: 'forwards' })
          m.leaving.add(code)
          m.anims.set(code, anim)
          anim.onfinish = () => finishLater(m, () => {
            if (m.anims.get(code) !== anim) return // re-planned since (re-entered or restarted)
            m.leaving.delete(code)
            m.anims.delete(code)
            el.setAttribute('data-off', '')
            anim.cancel()
          })
        },
      })
    }
  }
  return { ops: order(ops), on }
}

/** Seen ops by start time (ties: nearest the count first), then the unseen ones nearest the count first. */
function order(ops: (BirdOp & { md: number })[]): BirdOp[] {
  return ops.sort((p, q) => (p.seen === q.seen ? (p.seen ? p.at - q.at : 0) || p.md - q.md : p.seen ? -1 : 1))
}

/** Longest a travel or arrival in view may start after its time in the spec (ms): the ruling on chunked writes. */
export const MAX_LATE = 64

/**
 * One chunk: the indices of the ops to apply now, from `start` (every op before it is done; `done` marks the
 * ones applied out of order). Whole ops in order until `budget` cost units are spent, at least one so every
 * frame makes progress; then any seen travel or arrival due at or before `due` (ms after the change), whatever
 * the budget, since left for the next frame it would start more than MAX_LATE late. Exits are never forced:
 * written late, they start partway and still end on schedule.
 */
export function takeChunk(ops: readonly BirdOp[], start: number, budget: number, due = -Infinity, done?: readonly boolean[]): number[] {
  const out: number[] = []
  let i = start, spent = 0
  for (; i < ops.length; i++) {
    if (done?.[i]) continue
    if (out.length && spent + ops[i].cost > budget) break
    spent += ops[i].cost
    out.push(i)
  }
  for (; i < ops.length && ops[i].seen; i++) {
    const op = ops[i]
    if (done?.[i] || op.exit) continue
    if (op.at > due) break // seen ops are in start order, exits aside
    out.push(i)
  }
  return out
}

/**
 * The next chunk's budget from the last frame's length (ms between two chunks): grow while frames keep up
 * with a 60 Hz display, hold at one dropped frame, shrink when more were dropped. A fast device writes a big change in a few frames; a slow
 * one spreads it so no frame carries more than it can draw.
 */
export function adaptBudget(budget: number, frameMs: number): number {
  const next = frameMs <= 20 ? budget * 1.5 : frameMs <= 40 ? budget : budget * 0.6
  return Math.min(WRITE_MAX, Math.max(WRITE_MIN, Math.round(next)))
}

/**
 * Apply `ops` one budgeted chunk per frame, starting with the next frame (`frame` is requestAnimationFrame or
 * a stand-in; `pending` gets each frame request's id, 0 when done, so the caller can cancel it). `start` is the
 * change's time on the frame clock (performance.now() when it was planned); each op runs with how late its
 * frame is after it, so even the first chunk is about one frame late, and its delays shrink by that.
 * Budget: WRITE_START units, then adaptBudget's. Seen travels and arrivals that would start more than MAX_LATE
 * late if left for the next frame (estimated one frame of the last length away) go in this chunk regardless.
 * `onDone` runs after the last chunk.
 */
export function runChunked(
  ops: readonly BirdOp[],
  start: number,
  frame: (cb: (t: number) => void) => number,
  pending: (id: number) => void,
  onDone: () => void,
): void {
  let i = 0, last = -1, budget = WRITE_START
  const done: boolean[] = []
  const step = (now: number) => {
    const late = Math.max(0, now - start)
    const frameMs = Math.max(1000 / 60, last < 0 ? late : now - last)
    if (last >= 0) budget = adaptBudget(budget, now - last)
    last = now
    for (const k of takeChunk(ops, i, budget, late + frameMs - MAX_LATE, done)) { done[k] = true; ops[k].run(late) }
    while (i < ops.length && done[i]) i++
    if (i < ops.length) pending(frame(step))
    else { pending(0); onDone() }
  }
  pending(frame(step))
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
