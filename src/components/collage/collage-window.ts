// Windowed birds for big lists (more than WINDOW_AT entries). Every bird stays in the DOM as its button (so the
// collage keeps one tab stop, arrow keys over every shown bird, the search's ring), but a bird far from the
// viewport carries `data-far` (display: none in collage.css): the browser then styles, lays out, paints and
// layerizes only the few hundred birds near the screen instead of thousands (G1: Layerize, paint and style
// recalc over every bird were the 100–900 ms frames at 3,000+ birds and 4x CPU).
//
// Which birds are near comes from the layout's boxes (an index sorted by top edge, binary searched), never from
// the DOM or per-bird IntersectionObservers: one stage rect read per scroll frame. Birds within SHOW_MARGIN
// screens of the viewport are shown; once shown, a bird is let go only beyond KEEP_MARGIN screens (hysteresis,
// so a scroll back and forth doesn't flip birds every frame). Changes are budgeted per frame, nearest the middle of
// the viewport first, the budget adapting to the frame times (each bird shown or hidden costs ~50-100 µs of style,
// layout and paint at 4x CPU, so a fast flick through the densest lists fills in a few frames late instead of
// dropping frames). A bird's sticker downloads when it is shown (Sticker's loadDeferred, which caps downloads in
// flight); hidden, it keeps its image until HELD_MAX birds hidden since hold theirs (or at once if still downloading).
// While birds travel, nothing is hidden (`hold`): a bird gliding out of view stays until the glide is over.
import type { StateLayout } from '@/lib/layout/layout-client'
import { loadDeferred, loading, unloadSticker } from './Sticker'

/** Lists with more entries than this are windowed (smaller lists keep every bird rendered, as before). */
export const WINDOW_AT = 1500
/** Shown within this many screens above and below the viewport... */
export const SHOW_MARGIN = 0.75
/** ...and kept until beyond this many. */
export const KEEP_MARGIN = 1
/** Birds shown per frame to start with (a hide counts half); then adapted between FRAME_MIN and FRAME_MAX. */
export const FRAME_BUDGET = 160
export const FRAME_MIN = 40
export const FRAME_MAX = 250
/** Hidden birds that keep their sticker (the most recently hidden: a scroll back shows them at once)... */
export const HELD_MAX = 1000
/** ...beyond that, the oldest let go of it, at most this many per frame (letting go of an image is not free). */
export const DROP_BUDGET = 100

export type BandIndex = {
  codes: string[]
  top: Float64Array
  bottom: Float64Array
  /** Tallest box (to start the binary search early enough). */
  maxH: number
  at: Map<string, number>
}

/** The shown birds' boxes in stage units (% of the stage width, like --y), sorted by top edge. */
export function buildIndex(layout: Pick<StateLayout, 'W' | 'boxes'>, on: Iterable<string>): BandIndex {
  const W = layout.W
  const rows: [string, number, number][] = []
  let maxH = 0
  for (const code of on) {
    const b = layout.boxes.get(code)
    if (!b) continue
    const t = (b[1] / W) * 100, h = (b[3] / W) * 100
    if (h > maxH) maxH = h
    rows.push([code, t, t + h])
  }
  rows.sort((p, q) => p[1] - q[1])
  const top = new Float64Array(rows.length), bottom = new Float64Array(rows.length)
  const codes: string[] = new Array(rows.length)
  const at = new Map<string, number>()
  rows.forEach(([c, t, b], i) => { codes[i] = c; top[i] = t; bottom[i] = b; at.set(c, i) })
  return { codes, top, bottom, maxH, at }
}

/** Call `fn` for every box overlapping [a, b] (stage units), with its distance from [va, vb] (0 inside it). */
export function query(ix: BandIndex, a: number, b: number, fn: (code: string, dist: number, i: number) => void, va = a, vb = b): void {
  // First box whose top is at or after a - maxH: anything earlier ends before a.
  let lo = 0, hi = ix.top.length
  const from = a - ix.maxH
  while (lo < hi) { const mid = (lo + hi) >> 1; if (ix.top[mid] < from) lo = mid + 1; else hi = mid }
  for (let i = lo; i < ix.top.length && ix.top[i] < b; i++) {
    if (ix.bottom[i] <= a) continue
    const t = ix.top[i], bt = ix.bottom[i]
    fn(ix.codes[i], bt < va ? va - bt : t > vb ? t - vb : 0, i)
  }
}

/**
 * Render a bird or not: data-far (display: none) and, the other way, .eb-tile, the class the stage-state rules
 * select on (collage.css), so stage attribute changes never restyle unrendered birds.
 */
export function setFar(el: Element, far: boolean): void {
  if (far) { el.setAttribute('data-far', ''); el.classList.remove('eb-tile') }
  else { el.removeAttribute('data-far'); el.classList.add('eb-tile') }
}

export type View ={ top: number; bottom: number; screen: number }

export type WindowOpts = {
  els: Map<string, HTMLElement>
  /** The viewport in stage units, or null when the stage isn't laid out. */
  view: () => View | null
  /** Birds never hidden (the tab stop, the focused bird). */
  pinned: () => Iterable<string | null>
  /** Birds never hidden right now (playing their exit). */
  busy?: (code: string) => boolean
  /** Called as a bird is rendered, before its data-far goes (to bring its DOM up to date: applyFar). */
  onReveal?: (code: string, el: HTMLElement) => void
  frame?: (cb: () => void) => number
  cancel?: (id: number) => void
}

export class BirdWindow {
  /** Birds without data-far. */
  readonly shown = new Set<string>()
  private ix: BandIndex | null = null
  private holdUntil = 0
  private raf = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  constructor(private o: WindowOpts) {}

  setIndex(ix: BandIndex) { this.ix = ix }

  /** Show one bird now (and start its sticker). */
  reveal(code: string | null | undefined): boolean {
    if (!code || this.shown.has(code)) return false
    const el = this.o.els.get(code)
    if (!el) return false
    this.shown.add(code)
    this.o.onReveal?.(code, el)
    setFar(el, false)
    this.drop.delete(code)
    loadDeferred(el)
    return true
  }

  private hide(code: string) {
    const el = this.o.els.get(code)
    this.shown.delete(code)
    if (!el) return
    setFar(el, true)
    // A sticker still waiting or downloading lets go at once: a hidden image may never finish (nor free its slot).
    if (loading(el)) unloadSticker(el)
    else this.drop.add(code)
  }

  /** Hidden birds still holding their sticker, oldest first. */
  private drop = new Set<string>()
  /** Let go of the oldest hidden birds' stickers beyond HELD_MAX, DROP_BUDGET at a time. Returns whether more wait. */
  private dropSome(): boolean {
    let k = 0
    for (const code of this.drop) {
      if (this.drop.size <= HELD_MAX || k++ >= DROP_BUDGET) break
      this.drop.delete(code)
      const el = this.o.els.get(code)
      if (el && !this.shown.has(code)) unloadSticker(el)
    }
    return this.drop.size > HELD_MAX
  }

  /** Nothing is hidden for `ms` from now (a glide is under way); then the window is synced again. */
  hold(ms: number) {
    const until = performance.now() + ms
    if (until > this.holdUntil) this.holdUntil = until
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.sync(), ms + 20)
  }

  /** Sync on the next frame (a scroll, a resize). Coalesced. */
  schedule() {
    if (this.raf) return
    const frame = this.o.frame ?? requestAnimationFrame
    this.raf = frame(() => { this.raf = 0; this.sync() })
  }

  /** Call `cb` once every bird near the viewport is shown. */
  whenShown(cb: () => void) {
    this.waiters.push(cb)
    this.schedule()
  }
  private waiters: (() => void)[] = []
  /**
   * Quiet: the bird layer is hidden (a fade-through places birds), so the birds in the viewport are shown within the
   * per-frame budget too; nobody sees them arrive.
   */
  quiet = false

  /** Change budget for the next sync (bird reveals; a hide counts half), adapted to how long frames take. */
  private budget = FRAME_BUDGET
  private last = -1

  /**
   * Show the birds near the viewport and hide those far from it, nearest the middle of the viewport first, within a
   * per-frame budget that adapts to how long the last frame took (a fast flick through thousands of birds fills in a
   * few frames late rather than dropping frames). `all`: show every bird in the margin now (a travel, the first
   * placement). `keep`: hide nothing. Returns how many birds were shown.
   */
  sync(opts: { all?: boolean; keep?: boolean } = {}): number {
    const ix = this.ix, v = this.o.view()
    if (!ix || !v) { this.flushWaiters(); return 0 }
    const now = performance.now()
    if (this.last >= 0 && now - this.last < 200) {
      const f = now - this.last
      this.budget = Math.round(Math.min(FRAME_MAX, Math.max(FRAME_MIN, f <= 20 ? this.budget * 1.3 : f <= 34 ? this.budget : this.budget * 0.6)))
    }
    this.last = now
    const s = v.screen, mid = (v.top + v.bottom) / 2
    const want: [string, number][] = []
    let n = 0, more = false, left = false
    query(ix, v.top - SHOW_MARGIN * s, v.bottom + SHOW_MARGIN * s, (code, _d, i) => {
      if (this.shown.has(code)) return
      if (opts.all) { if (this.reveal(code)) n++ } else want.push([code, Math.abs((ix.top[i] + ix.bottom[i]) / 2 - mid)])
    }, v.top, v.bottom)
    let spend = 0
    if (want.length) {
      want.sort((p, q) => p[1] - q[1])
      const k = Math.min(want.length, this.budget)
      for (let i = 0; i < k; i++) if (this.reveal(want[i][0])) n++
      spend = k
      if (want.length > k) more = left = true
    }
    for (const c of this.o.pinned()) if (this.reveal(c)) n++
    if (!opts.keep && performance.now() >= this.holdUntil) {
      const a = v.top - KEEP_MARGIN * s, b = v.bottom + KEEP_MARGIN * s
      const pins = new Set(this.o.pinned())
      const room = Math.max(FRAME_MIN, (this.budget - spend) * 2)
      let hidden = 0
      for (const code of this.shown) {
        if (pins.has(code) || this.o.busy?.(code)) continue
        const i = ix.at.get(code)
        if (i !== undefined && ix.bottom[i] > a && ix.top[i] < b) continue
        if (hidden++ >= room) { more = true; break }
        this.hide(code)
      }
    }
    // Last, so this frame's reads above came before any of its writes.
    if (this.dropSome()) more = true
    if (more) this.schedule()
    else this.last = -1 // the next sync starts a new run: no frame to measure
    if (!left) this.flushWaiters()
    return n
  }

  private flushWaiters() {
    if (!this.waiters.length) return
    const w = this.waiters
    this.waiters = []
    for (const cb of w) cb()
  }

  /** Cancel the pending frame and timer (the collage unmounts; a remount syncs again on its next write). */
  stop() {
    this.waiters = []
    if (this.raf) (this.o.cancel ?? cancelAnimationFrame)(this.raf)
    this.raf = 0
    clearTimeout(this.timer)
  }

  /** Stop, and forget which birds are shown (the list stopped or started being windowed: every bird was reset). */
  dispose() {
    this.stop()
    this.shown.clear()
  }
}
