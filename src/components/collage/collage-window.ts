// Windowed birds for big lists (more than WINDOW_AT entries). Every bird stays in the DOM as its button (so the
// collage keeps one tab stop, arrow keys over every shown bird, the search's ring), but a bird far from the
// viewport carries `data-far` (display: none in collage.css): the browser then styles, lays out, paints and
// layerizes only the few hundred birds near the screen instead of thousands (G1: Layerize, paint and style
// recalc over every bird were the 100–900 ms frames at 3,000+ birds and 4x CPU).
//
// Which birds are near comes from the layout's boxes (an index sorted by top edge, binary searched), never from
// the DOM or per-bird IntersectionObservers: one stage rect read per scroll frame. Birds within SHOW_MARGIN
// screens of the viewport are shown; once shown, a bird is let go only beyond KEEP_MARGIN screens (hysteresis,
// so a scroll back and forth doesn't flip birds every frame). Birds in the viewport are shown in the same frame;
// those in the margin at most REVEAL_BUDGET per frame, nearest first. A bird's sticker downloads when it is
// shown and is let go when it is hidden (Sticker's loadDeferred / unloadSticker, which caps downloads in flight).
// While birds travel, nothing is hidden (`hold`): a bird gliding out of view stays until the glide is over.
import type { StateLayout } from '@/lib/layout/layout-client'
import { loadDeferred, unloadSticker } from './Sticker'

/** Lists with more entries than this are windowed (smaller lists keep every bird rendered, as before). */
export const WINDOW_AT = 1500
/** Shown within this many screens above and below the viewport... */
export const SHOW_MARGIN = 0.75
/** ...and kept until beyond this many. */
export const KEEP_MARGIN = 1.5
/** Birds in the margin shown per frame (those in the viewport are always shown at once). */
export const REVEAL_BUDGET = 160

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
export function query(ix: BandIndex, a: number, b: number, fn: (code: string, dist: number) => void, va = a, vb = b): void {
  // First box whose top is at or after a - maxH: anything earlier ends before a.
  let lo = 0, hi = ix.top.length
  const from = a - ix.maxH
  while (lo < hi) { const mid = (lo + hi) >> 1; if (ix.top[mid] < from) lo = mid + 1; else hi = mid }
  for (let i = lo; i < ix.top.length && ix.top[i] < b; i++) {
    if (ix.bottom[i] <= a) continue
    const t = ix.top[i], bt = ix.bottom[i]
    fn(ix.codes[i], bt < va ? va - bt : t > vb ? t - vb : 0)
  }
}

export type View = { top: number; bottom: number; screen: number }

export type WindowOpts = {
  els: Map<string, HTMLElement>
  /** The viewport in stage units, or null when the stage isn't laid out. */
  view: () => View | null
  /** Birds never hidden (the tab stop, the focused bird). */
  pinned: () => Iterable<string | null>
  /** Birds never hidden right now (playing their exit). */
  busy?: (code: string) => boolean
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
    el.removeAttribute('data-far')
    loadDeferred(el)
    return true
  }

  private hide(code: string) {
    const el = this.o.els.get(code)
    this.shown.delete(code)
    if (!el) return
    el.setAttribute('data-far', '')
    unloadSticker(el)
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

  /**
   * Show the birds near the viewport and hide those far from it. `all`: show every bird in the margin now (no
   * per-frame budget). `keep`: hide nothing. Returns how many birds were shown.
   */
  sync(opts: { all?: boolean; keep?: boolean } = {}): number {
    const ix = this.ix, v = this.o.view()
    if (!ix || !v) return 0
    const s = v.screen
    const want: [string, number][] = []
    let n = 0
    query(ix, v.top - SHOW_MARGIN * s, v.bottom + SHOW_MARGIN * s, (code, dist) => {
      if (this.shown.has(code)) return
      if (dist === 0 || opts.all) { if (this.reveal(code)) n++ } else want.push([code, dist])
    }, v.top, v.bottom)
    if (want.length) {
      want.sort((p, q) => p[1] - q[1])
      const k = Math.min(want.length, REVEAL_BUDGET)
      for (let i = 0; i < k; i++) if (this.reveal(want[i][0])) n++
      if (want.length > k) this.schedule()
    }
    for (const c of this.o.pinned()) if (this.reveal(c)) n++
    if (!opts.keep && performance.now() >= this.holdUntil) {
      const a = v.top - KEEP_MARGIN * s, b = v.bottom + KEEP_MARGIN * s
      const pins = new Set(this.o.pinned())
      for (const code of this.shown) {
        if (pins.has(code) || this.o.busy?.(code)) continue
        const i = ix.at.get(code)
        if (i !== undefined && ix.bottom[i] > a && ix.top[i] < b) continue
        this.hide(code)
      }
    }
    return n
  }

  /** Forget every bird's state (the list stopped being windowed, or the collage unmounts). */
  dispose() {
    if (this.raf) (this.o.cancel ?? cancelAnimationFrame)(this.raf)
    this.raf = 0
    clearTimeout(this.timer)
    this.shown.clear()
  }
}
