'use client'
// The collage stage: every entry as an absolutely placed sticker, sized by body mass, around the species count.
// Ported from LifeList.tsx (framer-site): birds render once and are then moved by writing their CSS variables
// (--x --y --k, in % of the stage width, shown in cqw) in a layout effect; filtering glides kept birds, shrinks
// leaving ones away and grows arriving ones in, rippling out from the count. See collage-motion.ts.
//
// Props beyond the plan's interface (all optional):
//  - onHover:   called with the bird under the mouse or keyboard focus (null when none), for a hover card.
//  - className: extra class on the outer wrapper.
//  - still:     only visibility changes over the shown layout (a range drag's preview; see the prop).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { LAYOUTS } from '@/lib/layout/constants'
import type { StateLayout } from '@/lib/layout/layout-client'
import type { ListEntry } from '@/lib/list/model'
import type { SpeciesIndex } from '@/lib/species/load'
import { Bird, type BirdInit } from './Bird'
import { loadDeferred, unloadSticker } from './Sticker'
import { birdAt, ensureMasks } from './collage-hit'
import { BirdWindow, WINDOW_AT, buildIndex } from './collage-window'
import {
  APPEAR_MS, CROSSFADE_AT, EASE_IN, EASE_OUT, ENTER_AT, ENTER_MS, MOVE_MS, FADE_MS, RIPPLE_MS, WRITE_MIN, WRITE_START, cancelFinishes, fromCount, newMotion, pct, planBirds, raiseSizes, reduced, runChunked,
  type Motion,
} from './collage-motion'
import { Tally } from './Tally'
import './collage.css'

export { stickerUrl } from './Bird'

export type CollageProps = {
  entries: ListEntry[]
  species: SpeciesIndex
  layout: StateLayout
  visible: Set<string>
  mode: 'even' | 'true'
  onPick: (code: string) => void
  onHover?: (code: string | null) => void
  className?: string
  /**
   * Only visibility changes over one fixed layout (a range drag's preview): birds appear with their CSS opacity
   * fade where they stand and disappear at once; never travel, WAAPI growth or the layer fade; big changes are
   * written in budgeted chunks. A new visible set over the very same layout object is treated the same way.
   */
  still?: boolean
}

const TOUCH_SLOP_PX = 28
/** How far beyond the viewport (above and below) a bird's sticker starts downloading: one screen. */
const STICKER_MARGIN = '100% 0px'
/** Beyond this (four screens above or below the viewport) a bird's sticker is let go until it comes near again. */
const STICKER_FAR = '400% 0px'
/** How long a travel moves birds (the latest arrival's start and run, a little slack for chunked writes). */
const SETTLE_MS = Math.max(MOVE_MS + RIPPLE_MS, ENTER_AT + RIPPLE_MS + ENTER_MS) + 400
/** In a still change (a drag preview), more arrivals than this appear without their fade. */
const INSTANT_AT = 60
/** :focus-visible, where the browser knows it (jsdom doesn't: there, any focus counts). */
const focusVisible = (el: Element) => { try { return el.matches(':focus-visible') } catch { return true } }
type Fade = { anim: Animation | null; phase: 'out' | 'place' | 'in' | null; apply: ((ready: () => void) => void) | null; seq: number }

/** A bird's first-render style, from the layout it first appears in (seeds the motion caches to match). */
function makeInit(code: string, layout: StateLayout, visible: Set<string>, m: Motion, stagePx: number, appear: boolean, far: boolean): BirdInit {
  const box = visible.has(code) ? layout.boxes.get(code) : undefined
  if (!box) return { style: { '--x': 0, '--y': 0, '--w': 0, '--h': 0, '--k': 1, '--md': '0ms', '--d': '0ms' } as CSSProperties, off: true, far, w: 1, h: 1 }
  const { W, H } = layout
  const b: [number, number] = [pct(box[2], W), pct(box[3], W)]
  const x = pct(box[0], W), y = pct(box[1], W), md = Math.round(fromCount(box, W, H) * RIPPLE_MS)
  m.base.set(code, b)
  m.written.set(code, `${x},${y},1,${md}`)
  const w = (b[0] / 100) * stagePx, h = (b[1] / 100) * stagePx
  m.sizes.set(code, Math.ceil(w))
  const d = appear ? Math.round(fromCount(box, W, H) * APPEAR_MS) : 0
  return { style: { '--x': x, '--y': y, '--w': b[0], '--h': b[1], '--k': 1, '--md': `${md}ms`, '--d': `${d}ms` } as CSSProperties, off: false, far, w, h }
}

export function Collage({ entries, species, layout, visible, mode, onPick, onHover, className, still }: CollageProps) {
  const stage = useRef<HTMLDivElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const els = useRef(new Map<string, HTMLButtonElement>())
  // Per-instance caches that outlive renders: the motion state and each bird's frozen first style.
  const [motion] = useState<Motion>(newMotion)
  const [inits] = useState(() => new Map<string, BirdInit>())
  const stagePx = useRef(layout.W) // layout units are CSS px at the layout's design width, until measured
  const fade = useRef<Fade>({ anim: null, phase: null, apply: null, seq: 0 })
  const focusCode = useRef<string | null>(null)
  const stopCode = useRef<string | null>(null)
  const hot = useRef<string | null>(null)
  const frame = useRef(0)
  const chunkFrame = useRef(0)
  const prunedFor = useRef<ListEntry[] | null>(null)
  const alive = useRef(true)
  const latest = useRef({ layout, onPick, onHover, still })
  useLayoutEffect(() => { latest.current = { layout, onPick, onHover, still } })
  const written = useRef<StateLayout | null>(null) // the layout of the last write

  const row = useCallback((code: string) => species.byCode.get(code), [species])
  // Keyboard order: taxonomic. Draw order: heaviest first, so small birds sit on top.
  const taxo = useMemo(() => {
    const to = (c: string) => row(c)?.to ?? Number.MAX_SAFE_INTEGER
    return entries.map((e, i) => ({ c: e.code, i })).sort((a, b) => to(a.c) - to(b.c) || a.i - b.i).map((x) => x.c)
  }, [entries, row])
  const draw = useMemo(() => {
    const g = (c: string) => row(c)?.g ?? 0
    return [...taxo].sort((a, b) => g(b) - g(a))
  }, [taxo, row])
  const top = useMemo(() => [...draw].reverse(), [draw])
  const orders = useMemo(() => [...new Set(entries.map((e) => row(e.code)?.ord).filter((o): o is string => !!o))], [entries, row])
  const shown = useMemo(() => entries.reduce((n, e) => n + (visible.has(e.code) ? 1 : 0), 0), [entries, visible])

  // Stickers download when their bird comes within STICKER_MARGIN of the viewport (Sticker `defer`), so a tall
  // collage of thousands of birds fetches only what is near the screen, and let go of their image again once it
  // is beyond STICKER_FAR (unloadSticker), so scrolling through thousands never holds them all decoded (WebKit's
  // page crashed scrolling 6,000 at 1440 px). Both observers are created at the first bird's ref.
  // A big list (more than WINDOW_AT entries) is windowed instead (collage-window.ts): only birds near the viewport
  // are rendered, and they start their stickers when shown, so no bird is observed. `winOn` is what the birds are
  // set up for; it follows `windowed` in the flip effect below (new birds are created far, with data-far).
  const windowed = entries.length > WINDOW_AT
  const winOn = useRef(windowed)
  const win = useRef<BirdWindow | null>(null)
  const getWin = useCallback(() => {
    win.current ??= new BirdWindow({
      els: els.current,
      view: () => {
        const r = stage.current?.getBoundingClientRect()
        if (!r || !r.width || typeof window === 'undefined') return null
        const k = 100 / r.width
        return { top: -r.top * k, bottom: (window.innerHeight - r.top) * k, screen: window.innerHeight * k }
      },
      pinned: () => {
        const a = typeof document !== 'undefined' ? document.activeElement : null
        return [stopCode.current, a instanceof HTMLElement ? a.dataset.code ?? null : null]
      },
      busy: (code) => motion.leaving.has(code),
    })
    return win.current
  }, [motion])
  const io = useRef<{ near: IntersectionObserver; far: IntersectionObserver } | null | undefined>(undefined)
  const observe = useCallback((el: HTMLElement) => {
    if (io.current === undefined) {
      io.current = typeof IntersectionObserver === 'function'
        ? {
            near: new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) loadDeferred(e.target) }, { rootMargin: STICKER_MARGIN }),
            // While a fade-through places birds, the layer's content is skipped (content-visibility: hidden) and every
            // bird reads as not intersecting: letting go then would drop and re-fetch every sticker near the screen.
            far: new IntersectionObserver((es) => {
              if (layer.current?.style.contentVisibility === 'hidden') return
              for (const e of es) if (!e.isIntersecting) unloadSticker(e.target)
            }, { rootMargin: STICKER_FAR }),
          }
        : null
    }
    if (io.current) { io.current.near.observe(el); io.current.far.observe(el) } else loadDeferred(el)
  }, [])
  const register = useCallback((code: string, el: HTMLButtonElement | null) => {
    const old = els.current.get(code)
    if (old && old !== el) { io.current?.near.unobserve(old); io.current?.far.unobserve(old) }
    if (el) {
      els.current.set(code, el)
      if (!winOn.current) observe(el)
    } else {
      els.current.delete(code)
      win.current?.shown.delete(code)
    }
  }, [observe])

  // The list crossed WINDOW_AT: set every bird up the other way (the motion effect below then syncs the window).
  useLayoutEffect(() => {
    if (winOn.current === windowed) return
    winOn.current = windowed
    win.current?.dispose()
    if (windowed) {
      io.current?.near.disconnect()
      io.current?.far.disconnect()
      for (const el of els.current.values()) el.setAttribute('data-far', '')
    } else {
      for (const el of els.current.values()) { el.removeAttribute('data-far'); observe(el) }
    }
  }, [windowed, observe])
  // Windowed: the window follows the page's scroll and size.
  useEffect(() => {
    if (!windowed || typeof window === 'undefined') return
    const again = () => getWin().schedule()
    window.addEventListener('scroll', again, { passive: true })
    window.addEventListener('resize', again, { passive: true })
    return () => {
      window.removeEventListener('scroll', again)
      window.removeEventListener('resize', again)
    }
  }, [windowed, getWin])

  // One tab stop: the last focused or picked bird if it is shown, else the first shown bird in taxonomic order.
  const syncTabStop = useCallback(() => {
    const on = motion.on
    if (!on) return
    const want = focusCode.current && on.has(focusCode.current) ? focusCode.current : taxo.find((c) => on.has(c)) ?? null
    if (want === stopCode.current && (!want || els.current.get(want)?.tabIndex === 0)) return
    const prev = stopCode.current ? els.current.get(stopCode.current) : undefined
    if (prev) prev.tabIndex = -1
    stopCode.current = want
    const el = want ? els.current.get(want) : undefined
    if (el) el.tabIndex = 0
    if (winOn.current) getWin().reveal(want) // the tab stop is always rendered (windowed lists)
    const active = typeof document !== 'undefined' ? document.activeElement : null
    if (active instanceof HTMLElement && active.dataset.code && !on.has(active.dataset.code) && el) el.focus({ preventScroll: true })
  }, [taxo, motion, getWin])

  const setHot = useCallback((code: string | null) => {
    if (hot.current === code) return
    if (hot.current) els.current.get(hot.current)?.removeAttribute('data-hot')
    if (code) els.current.get(code)?.setAttribute('data-hot', '')
    hot.current = code
    stage.current?.toggleAttribute('data-hovering', code !== null)
    latest.current.onHover?.(code)
  }, [])

  // Fade-through for big lists and reduced motion: the bird layer fades out, the birds are placed (in budgeted
  // chunks: `apply` calls `ready` after the last one), it fades back. A change that lands while the birds are
  // being placed is placed instead, under the same fade. While placing, the layer's content is skipped
  // (content-visibility: hidden) rather than held at opacity 0 by the finished fade: with thousands of birds,
  // every chunk's frame would otherwise re-layerize all of them (~300 ms a frame at 4x CPU for 3,000 birds), and
  // visibility: hidden would restyle every bird twice (it is inherited).
  // cut: skip the fade-out (the birds go at once). For a change away from thousands of shown birds: fading that
  // layer out costs a few ~300 ms frames at 4x CPU, so on a slow phone it never looked like a fade anyway.
  const fadeThrough = useCallback((apply: (ready: () => void) => void, cut = false) => {
    const L = layer.current, f = fade.current
    if (!L || typeof L.animate !== 'function') { apply(() => {}); return }
    f.apply = apply
    if (f.phase === 'out') return
    const place = () => {
      const run = f.apply
      f.apply = null
      f.phase = 'place'
      L.style.contentVisibility = 'hidden'
      f.anim?.cancel()
      f.anim = null
      const seq = ++f.seq
      run?.(() => {
        if (f.seq !== seq || f.phase !== 'place' || !alive.current) return
        L.style.removeProperty('content-visibility')
        f.phase = 'in'
        const fadeIn = L.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS / 2, easing: EASE_OUT })
        f.anim = fadeIn
        fadeIn.onfinish = () => { if (f.anim === fadeIn && alive.current) { f.anim = null; f.phase = null } }
      })
    }
    if (f.phase === 'place' || (cut && !f.anim)) { place(); return }
    const from = f.anim ? Number(getComputedStyle(L).opacity) || 0 : 1
    f.anim?.cancel()
    f.phase = 'out'
    const out = L.animate([{ opacity: from }, { opacity: 0 }], { duration: (FADE_MS / 2) * from, easing: EASE_IN, fill: 'forwards' })
    f.anim = out
    out.onfinish = () => {
      if (f.anim !== out || !alive.current) return
      place()
    }
  }, [])

  // A fade-through cut short: the birds show again at once.
  const unveil = useCallback(() => { layer.current?.style.removeProperty('content-visibility') }, [])

  // eslint-disable-next-line react-hooks/immutability -- `motion` is a per-instance mutable cache kept outside React state on purpose (birds move by DOM writes, never re-renders); this effect writes it
  useLayoutEffect(() => {
    const m = motion
    // Forget birds that left the list, so one that comes back starts fresh.
    if (prunedFor.current !== entries) {
      prunedFor.current = entries
      const keep = new Set(entries.map((e) => e.code))
      for (const code of [...inits.keys()]) {
        if (keep.has(code)) continue
        inits.delete(code); m.base.delete(code); m.written.delete(code); m.sizes.delete(code)
        m.anims.get(code)?.cancel(); m.anims.delete(code); m.on?.delete(code); m.leaving.delete(code)
      }
    }
    const first = m.on === null
    // Restyling ~1,000 birds at once is several long frames on a phone. A big travel is planned now and written
    // from the next frame on, one budgeted chunk per frame (takeChunk / adaptBudget), the birds in view first in
    // the order their motion starts; each op shortens its delays by how late it lands, so the ripple keeps its
    // timing. Small changes, first placement and fades are written at once; a jump with `done` (a still change) is
    // chunked too, and calls `done` after its last chunk.
    const write = (style: 'travel' | 'jump', done?: () => void, startBudget?: number) => {
      cancelAnimationFrame(chunkFrame.current)
      let view: { top: number; bottom: number } | undefined
      const r = style === 'travel' && typeof window !== 'undefined' ? stage.current?.getBoundingClientRect() : undefined
      if (r && r.width) view = { top: (-r.top * 100) / r.width, bottom: ((window.innerHeight - r.top) * 100) / r.width }
      // eslint-disable-next-line react-hooks/immutability -- motion is the mutable motion cache (see the effect)
      const { ops, on } = planBirds(m, { codes: taxo, els: els.current, layout, visible, stagePx: stagePx.current, style, view })
      m.on = on
      if (winOn.current) {
        // Windowed: render the birds that will be near the viewport before they are written, so a bird gliding in
        // from far away starts where it was and an arriving one fades in. A travel hides nothing until it is over.
        const w = getWin()
        w.setIndex(buildIndex(layout, on))
        const shownNow = w.sync({ all: true, keep: style === 'travel' })
        // Style the newly rendered birds where they stand now, so their changes below transition from there.
        if (shownNow && layer.current?.style.contentVisibility !== 'hidden') void stage.current?.offsetWidth
        if (style === 'travel') w.hold(SETTLE_MS)
      }
      const cost = ops.reduce((n, op) => n + op.cost, 0)
      if ((style === 'jump' && !done) || cost <= WRITE_START || typeof requestAnimationFrame !== 'function') {
        for (const op of ops) op.run()
        done?.()
      } else {
        // The tab-stop bird is written now, so focus never lands on a bird that is still hidden.
        const stop = focusCode.current && on.has(focusCode.current) ? focusCode.current : taxo.find((c) => on.has(c))
        const at = stop ? ops.findIndex((op) => op.code === stop) : -1
        if (at >= 0) ops.splice(at, 1)[0].run()
        // After the last chunk the tab stop may be a bird that was still hidden a frame ago.
        runChunked(ops, performance.now(), requestAnimationFrame, (id) => { chunkFrame.current = id }, () => { syncTabStop(); done?.() }, startBudget)
      }
      syncTabStop()
      if (hot.current && !m.on?.has(hot.current)) setHot(null)
    }
    const st = stage.current
    const sameLayout = written.current === layout
    written.current = layout
    if (!first && (latest.current.still || sameLayout)) {
      st?.removeAttribute('data-fast')
      const f = fade.current
      if (f.phase) { f.anim?.cancel(); f.anim = null; f.phase = null; f.apply = null; f.seq++; unveil() }
      // Placed without motion, in budgeted chunks: hidden birds go at once, shown ones fade in through their CSS opacity
      // transition (200 ms) rather than a 640 ms WAAPI growth, so few birds are composited at once. Many arrivals at
      // once (a wide drag back) appear without the fade: hundreds of overlapping fades
      // are long frames on a phone.
      let arriving = 0
      for (const c of visible) if (!m.on?.has(c)) arriving++
      const instant = arriving > INSTANT_AT
      if (instant) st?.setAttribute('data-instant', '')
      write('jump', () => {
        if (instant) requestAnimationFrame(() => requestAnimationFrame(() => { if (alive.current) st?.removeAttribute('data-instant') }))
      }, WRITE_MIN)
      return
    }
    // Big before or after: a filter from 3,000 birds down to a few would otherwise start a WAAPI exit for every
    // leaving bird in view, each its own composited layer (Layerize took ~500 ms a frame at 4x CPU).
    if (!first && (reduced() || shown > CROSSFADE_AT || (m.on?.size ?? 0) > CROSSFADE_AT)) {
      // A cut hides the layer first, so data-fast restyles no bird now (its content is skipped until shown).
      fadeThrough((ready) => write('jump', ready, WRITE_MIN), (m.on?.size ?? 0) > CROSSFADE_AT)
      st?.setAttribute('data-fast', '')
      return
    }
    st?.removeAttribute('data-fast')
    const f = fade.current
    if (f.phase === 'out' || f.phase === 'place') { f.anim?.cancel(); f.anim = null; f.phase = null; f.apply = null; f.seq++; unveil() }
    write(first ? 'jump' : 'travel')
  }, [layout, visible, taxo, entries, shown, syncTabStop, setHot, fadeThrough, unveil, motion, inits, getWin])

  // Once the first appearance has played (the latest bird starts at APPEAR_MS and runs ENTER_MS), switch the
  // birds' eb-in CSS animation off in idle time: a bird holding even a finished CSS animation costs more on
  // every later restyle. Later arrivals use Web Animations, and birds new to a mounted collage start hidden.
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const g = globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    let idle = 0
    const t = setTimeout(() => {
      const settle = () => el.setAttribute('data-settled', '')
      if (g.requestIdleCallback) idle = g.requestIdleCallback(settle, { timeout: 1000 })
      else settle()
    }, APPEAR_MS + ENTER_MS + 100)
    return () => { clearTimeout(t); if (idle) g.cancelIdleCallback?.(idle) }
  }, [])

  // Firefox resolves cqw against the viewport in a new collage's first style pass, then against the collage once it
  // is laid out, and transitions between the two: birds rendered with the collage (the landing's pre-packed sample,
  // a shared link) slid in from 1.3x their place and the page scrolled sideways while they did. No transitions until
  // the collage has had two frames; the first appearance is its CSS animation, not a transition, so it still plays.
  useEffect(() => {
    const el = stage.current
    if (!el || typeof requestAnimationFrame !== 'function') { el?.setAttribute('data-ready', ''); return }
    let id = requestAnimationFrame(() => { id = requestAnimationFrame(() => el.setAttribute('data-ready', '')) })
    return () => cancelAnimationFrame(id)
  }, [])

  // Measure the stage so sticker sizes follow its real width.
  useEffect(() => {
    const el = stage.current
    if (!el || typeof ResizeObserver !== 'function') return
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width
      if (!w || w === stagePx.current) return
      stagePx.current = w
      raiseSizes(motion, els.current, latest.current.layout, w)
      if (winOn.current) getWin().schedule()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [motion, getWin])
  // On unmount: stop the rAF, the layer fade and every bird animation; late onfinish callbacks see alive = false.
  useEffect(() => {
    alive.current = true
    const f = fade.current
    // A remount (Strict Mode) re-watches the birds whose stickers haven't started (observe is idempotent).
    const watch = io.current
    if (watch) for (const el of els.current.values()) { watch.near.observe(el); watch.far.observe(el) }
    return () => {
      alive.current = false
      io.current?.near.disconnect()
      io.current?.far.disconnect()
      win.current?.dispose()
      cancelAnimationFrame(frame.current)
      cancelAnimationFrame(chunkFrame.current)
      f.anim?.cancel(); f.anim = null; f.phase = null; f.apply = null
      cancelFinishes(motion)
      for (const a of motion.anims.values()) a.cancel()
      motion.anims.clear()
      motion.leaving.clear()
    }
  }, [motion])

  const codeOf = (t: EventTarget | null) => ((t as HTMLElement | null)?.dataset?.code ?? null)
  const hitAt = (clientX: number, clientY: number, slopPx: number) => {
    const el = stage.current, on = motion.on
    if (!el || !on) return null
    const r = el.getBoundingClientRect()
    if (!r.width) return null
    const L = latest.current.layout, s = L.W / r.width
    return birdAt(L, top, on, (clientX - r.left) * s, (clientY - r.top) * s, slopPx * s)
  }
  const loadMasks = () => { void ensureMasks(orders) }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const code = codeOf(e.target)
    if (!code) return
    // Enter/Space are left to the button: its native click (detail 0) picks, as do screen-reader activations.
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    const edge = e.key === 'Home' ? -1 : e.key === 'End' ? 1 : 0
    if (!step && !edge) return
    e.preventDefault()
    const on = motion.on
    if (!on) return
    const list = taxo.filter((c) => on.has(c))
    const i = list.indexOf(code)
    const j = edge === -1 ? 0 : edge === 1 ? list.length - 1 : i + step
    if (j < 0 || j >= list.length || j === i) return
    focusCode.current = list[j]
    if (winOn.current) getWin().reveal(list[j]) // a windowed bird far away is rendered first (focus scrolls to it)
    syncTabStop()
    els.current.get(list[j])?.focus()
  }

  const F = (LAYOUTS.find((l) => l.name === layout.layout) ?? LAYOUTS[0]).F
  const stageStyle = { '--sh': pct(layout.H, layout.W), '--f': pct(F, layout.W) } as CSSProperties
  // Birds render once each (memoised on the list); after that every change is written to their style directly.
  // A bird's first style comes from the layout current when it first appears, and is then frozen in `inits`.
  const birds = useMemo(() => {
    const appear = motion.on === null
    return draw.map((code) => {
      let init = inits.get(code)
      if (!init) {
        init = makeInit(code, layout, visible, motion, layout.W, appear, windowed)
        inits.set(code, init)
      }
      const r = row(code)
      return <Bird key={code} code={code} name={r?.com ?? code} st={!!r?.st} ar={r?.ar ?? 1} init={init} register={register} />
    })
    // layout and visible are read only to seed birds new to the list; their changes are written in the layout effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, row, register, motion, inits])
  // The layer element itself is memoised too, so a new layout re-renders the stage without walking 1,000 birds.
  const birdLayer = useMemo(() => <div ref={layer} className="eb-layer">{birds}</div>, [birds])

  return (
    <div className={className ? `eb-collage ${className}` : 'eb-collage'}>
      <div
        ref={stage}
        className="eb-stage"
        role="group"
        aria-label={`Collage of ${shown.toLocaleString('en-US')} species, sized by body mass${mode === 'true' ? ' at true scale' : ''}. Use the arrow keys to move between birds.`}
        data-testid="collage-stage"
        data-mode={mode}
        data-many={shown > CROSSFADE_AT || undefined}
        style={stageStyle}
        onPointerEnter={loadMasks}
        onPointerDown={loadMasks}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse') return
          const { clientX, clientY } = e
          cancelAnimationFrame(frame.current)
          frame.current = requestAnimationFrame(() => setHot(hitAt(clientX, clientY, 0)))
        }}
        onPointerLeave={() => { cancelAnimationFrame(frame.current); setHot(null) }}
        onClick={(e) => {
          if (e.detail === 0) {
            // Keyboard (Enter/Space) or assistive-tech activation of a bird button: no pointer position.
            const c = codeOf(e.target)
            if (!c || !motion.on?.has(c)) return
            focusCode.current = c
            syncTabStop()
            onPick(c)
            return
          }
          const pt = (e.nativeEvent as PointerEvent).pointerType
          const touch = pt ? pt !== 'mouse' : typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches
          const code = hitAt(e.clientX, e.clientY, touch ? TOUCH_SLOP_PX : 0)
          if (!code) return
          focusCode.current = code
          syncTabStop()
          onPick(code)
        }}
        onFocus={(e) => {
          const c = codeOf(e.target)
          if (!c) return
          focusCode.current = c
          syncTabStop()
          // Keyboard focus shows the bird's tooltip (as on /lifelist); focus put back after a click or a card does not.
          if (focusVisible(e.target as Element)) setHot(c)
        }}
        onBlur={(e) => { if (codeOf(e.target)) setHot(null) }}
        onKeyDown={onKeyDown}
      >
        <Tally value={shown} />
        {birdLayer}
      </div>
    </div>
  )
}
