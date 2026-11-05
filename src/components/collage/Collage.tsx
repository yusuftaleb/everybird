'use client'
// The collage stage: every entry as an absolutely placed sticker, sized by body mass, around the species count.
// Ported from LifeList.tsx (framer-site): birds render once and are then moved by writing their CSS variables
// (--x --y --k, in % of the stage width, shown in cqw) in a layout effect; filtering glides kept birds, shrinks
// leaving ones away and grows arriving ones in, rippling out from the count. See collage-motion.ts.
//
// Props beyond the plan's interface (all optional):
//  - total:     the full list size; the count reads "<n> of <total> species" while fewer are shown.
//  - onHover:   called with the bird under the mouse or keyboard focus (null when none), for a hover card.
//  - className: extra class on the outer wrapper.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { LAYOUTS } from '@/lib/layout/constants'
import type { StateLayout } from '@/lib/layout/layout-client'
import type { ListEntry } from '@/lib/list/model'
import type { SpeciesIndex } from '@/lib/species/load'
import { Bird, type BirdInit } from './Bird'
import { birdAt, ensureMasks } from './collage-hit'
import {
  APPEAR_MS, CROSSFADE_AT, EASE_IN, EASE_OUT, FADE_MS, RIPPLE_MS, fromCount, newMotion, pct, raiseSizes, reduced, writeBirds,
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
  total?: number
  onHover?: (code: string | null) => void
  className?: string
}

const TOUCH_SLOP_PX = 28
type Fade = { anim: Animation | null; phase: 'out' | 'in' | null; apply: (() => void) | null }

/** A bird's first-render style, from the layout it first appears in (seeds the motion caches to match). */
function makeInit(code: string, layout: StateLayout, visible: Set<string>, m: Motion, stagePx: number, appear: boolean): BirdInit {
  const box = visible.has(code) ? layout.boxes.get(code) : undefined
  if (!box) return { style: { '--x': 0, '--y': 0, '--w': 0, '--h': 0, '--k': 1, '--md': '0ms', '--d': '0ms' } as CSSProperties, off: true, w: 1, h: 1 }
  const { W, H } = layout
  const b: [number, number] = [pct(box[2], W), pct(box[3], W)]
  const x = pct(box[0], W), y = pct(box[1], W), md = Math.round(fromCount(box, W, H) * RIPPLE_MS)
  m.base.set(code, b)
  m.written.set(code, `${x},${y},1,${md}`)
  const w = (b[0] / 100) * stagePx, h = (b[1] / 100) * stagePx
  m.sizes.set(code, Math.ceil(w))
  const d = appear ? Math.round(fromCount(box, W, H) * APPEAR_MS) : 0
  return { style: { '--x': x, '--y': y, '--w': b[0], '--h': b[1], '--k': 1, '--md': `${md}ms`, '--d': `${d}ms` } as CSSProperties, off: false, w, h }
}

export function Collage({ entries, species, layout, visible, mode, onPick, total, onHover, className }: CollageProps) {
  const stage = useRef<HTMLDivElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const els = useRef(new Map<string, HTMLButtonElement>())
  // Per-instance caches that outlive renders: the motion state and each bird's frozen first style.
  const [motion] = useState<Motion>(newMotion)
  const [inits] = useState(() => new Map<string, BirdInit>())
  const stagePx = useRef(layout.W) // layout units are CSS px at the layout's design width, until measured
  const fade = useRef<Fade>({ anim: null, phase: null, apply: null })
  const focusCode = useRef<string | null>(null)
  const stopCode = useRef<string | null>(null)
  const hot = useRef<string | null>(null)
  const frame = useRef(0)
  const prunedFor = useRef<ListEntry[] | null>(null)
  const latest = useRef({ layout, onPick, onHover })
  useLayoutEffect(() => { latest.current = { layout, onPick, onHover } })

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

  const register = useCallback((code: string, el: HTMLButtonElement | null) => {
    if (el) els.current.set(code, el)
    else els.current.delete(code)
  }, [])

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
    const active = typeof document !== 'undefined' ? document.activeElement : null
    if (active instanceof HTMLElement && active.dataset.code && active.hasAttribute('data-off') && el) el.focus({ preventScroll: true })
  }, [taxo, motion])

  const setHot = useCallback((code: string | null) => {
    if (hot.current === code) return
    if (hot.current) els.current.get(hot.current)?.removeAttribute('data-hot')
    if (code) els.current.get(code)?.setAttribute('data-hot', '')
    hot.current = code
    stage.current?.toggleAttribute('data-hovering', code !== null)
    latest.current.onHover?.(code)
  }, [])

  // Fade-through for big lists and reduced motion: the bird layer fades out, the birds are placed, it fades back.
  const fadeThrough = useCallback((apply: () => void) => {
    const L = layer.current, f = fade.current
    if (!L || typeof L.animate !== 'function') { apply(); return }
    f.apply = apply
    if (f.phase === 'out') return
    const from = f.anim ? Number(getComputedStyle(L).opacity) || 0 : 1
    f.anim?.cancel()
    f.phase = 'out'
    const out = L.animate([{ opacity: from }, { opacity: 0 }], { duration: (FADE_MS / 2) * from, easing: EASE_IN, fill: 'forwards' })
    f.anim = out
    out.onfinish = () => {
      if (f.anim !== out) return
      f.apply?.()
      f.apply = null
      f.phase = 'in'
      const fadeIn = L.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS / 2, easing: EASE_OUT })
      out.cancel()
      f.anim = fadeIn
      fadeIn.onfinish = () => { if (f.anim === fadeIn) { f.anim = null; f.phase = null } }
    }
  }, [])

  useLayoutEffect(() => {
    const m = motion
    // Forget birds that left the list, so one that comes back starts fresh.
    if (prunedFor.current !== entries) {
      prunedFor.current = entries
      const keep = new Set(entries.map((e) => e.code))
      for (const code of [...inits.keys()]) {
        if (keep.has(code)) continue
        inits.delete(code); m.base.delete(code); m.written.delete(code); m.sizes.delete(code)
        m.anims.get(code)?.cancel(); m.anims.delete(code); m.on?.delete(code)
      }
    }
    const first = m.on === null
    const write = (style: 'travel' | 'jump') => {
      writeBirds(m, { codes: taxo, els: els.current, layout, visible, stagePx: stagePx.current, style })
      syncTabStop()
      if (hot.current && !m.on?.has(hot.current)) setHot(null)
    }
    const st = stage.current
    if (!first && (reduced() || shown > CROSSFADE_AT)) {
      st?.setAttribute('data-fast', '')
      fadeThrough(() => write('jump'))
      return
    }
    st?.removeAttribute('data-fast')
    const f = fade.current
    if (f.phase === 'out') { f.anim?.cancel(); f.anim = null; f.phase = null; f.apply = null }
    write(first ? 'jump' : 'travel')
  }, [layout, visible, taxo, entries, shown, syncTabStop, setHot, fadeThrough, motion, inits])

  // Measure the stage so sticker sizes follow its real width.
  useEffect(() => {
    const el = stage.current
    if (!el || typeof ResizeObserver !== 'function') return
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width
      if (!w || w === stagePx.current) return
      stagePx.current = w
      raiseSizes(motion, els.current, latest.current.layout, w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [motion])
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

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
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(code); return }
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
        init = makeInit(code, layout, visible, motion, layout.W, appear)
        inits.set(code, init)
      }
      const r = row(code)
      return <Bird key={code} code={code} name={r?.com ?? code} st={!!r?.st} ar={r?.ar ?? 1} init={init} register={register} />
    })
    // layout and visible are read only to seed birds new to the list; their changes are written in the layout effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, row, register, motion, inits])

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
          if (e.detail === 0) return // keyboard activation of a focused bird: handled in onKeyDown
          const pt = (e.nativeEvent as PointerEvent).pointerType
          const touch = pt ? pt !== 'mouse' : typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches
          const code = hitAt(e.clientX, e.clientY, touch ? TOUCH_SLOP_PX : 0)
          if (!code) return
          focusCode.current = code
          syncTabStop()
          onPick(code)
        }}
        onFocus={(e) => { const c = codeOf(e.target); if (c) { focusCode.current = c; syncTabStop(); setHot(c) } }}
        onBlur={(e) => { if (codeOf(e.target)) setHot(null) }}
        onKeyDown={onKeyDown}
      >
        <Tally value={shown} total={total} />
        <div ref={layer} className="eb-layer">{birds}</div>
      </div>
    </div>
  )
}
