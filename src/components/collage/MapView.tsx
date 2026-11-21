'use client'
// The Map view (the dock's third tab): the world's countries shaded by the birds the filters leave, the same birds the
// collage shows (mapCounts, the Places filter included), on one continuous log scale with its legend ramp at the top
// right. It has no filter controls of its own: the bar's Filters button filters it, as every view. The world only
// (round 6): no country or province levels, and a press opens nothing. Hovering any country, or pressing or tapping it,
// shows its name and count ("0 species" too) in a tooltip beside the pointer, and outlines it in Ink: the same shape, its
// fill unchanged, moved last (mapDrawOrder) so no neighbour covers half the line.
// Zoom and pan as yusuftaleb.com's places map (PlacesMap.tsx): + and − under the map at the right (and a reset to the
// whole world once zoomed), pinch (two fingers, or a trackpad's ctrl+wheel; a plain wheel scrolls the page), + / − / 0
// and the arrows while the map has focus, and a drag pans once zoomed; zooming eases in log space, instantly under
// reduced motion. The view is clamped between the whole world and the zoom where the 1:50m coasts' typical edge reaches
// a few pixels (src/lib/map/zoom.ts). Borders stay hairlines at every zoom (map.css, non-scaling strokes).
// The picture is aria-hidden: the list under it, the countries with their flags and counts, most species first, in one
// to three columns (map.css), is its text path. The names are told up (`onLevel`) so Share names places as the map does;
// the share image is always the whole world. The ramp (RAMP in shapes.ts) is set per path, the borders and the outline
// by map.css. The shapes (src/lib/map/shapes.ts) are pre-projected and load with the tab.
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { GlobeHemisphereWest, Minus, Plus } from '@/components/phosphor-icons'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { HTML_LANG } from '@/i18n/langs'
import { regionsIn } from '@/lib/i18n-places'
import { parsePlaceKey, placeName } from '@/lib/list/place-keys'
import type { AppState } from '@/lib/list/store'
import { Flag } from '@/components/Flag'
import { countRange, loadMapCountries, mapCounts, mapDrawOrder, mapRows, mapShapes, RAMP, shadeMix, type MapCountries } from '@/lib/map/shapes'
import { clampView, maxZoom, viewBoxOf, worldView, zoomAt, type View } from '@/lib/map/zoom'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Regions } from '@/lib/species/types'
import './card-list.css'
import './map.css'

/** Rows the list shows before "Show all". */
export const MAP_FIRST_ROWS = 10
/** How far a + or − press (or key) zooms, and how long the ease takes (yusuftaleb.com's map). */
const ZOOM_STEP = 2
const EASE_MS = 650
/** A press that moves further than this (CSS px) is a drag: it pans and names nothing. */
const DRAG_PX = 4

/** The CSS colour of `mix` (0 to 1) on the ramp: Accent over Paper, in the theme's tokens. */
export function rampFill(mix: number): string {
  return `color-mix(in srgb, var(--accent) ${Math.round(mix * 1000) / 10}%, var(--paper))`
}

type Props = {
  state: AppState
  species: SpeciesIndex
  regions: Regions
  /** Told how places are named (the map has no level: `at` is always the world), so Share names them as the map does. */
  onLevel?: (at: undefined, name: (key: string) => string) => void
}

type Tip = { key: string; x: number; y: number; w: number }
type Pt = { x: number; y: number }

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function MapView({ state, species, regions, onLevel }: Props) {
  const { t, lang } = useI18n()
  const c = t.collage.controls
  const [world, setWorld] = useState<MapCountries | null>(null)
  const [failed, setFailed] = useState(false)
  const [tip, setTip] = useState<Tip | null>(null)
  const [all, setAll] = useState(false)
  const [view, setViewState] = useState<View | null>(null)
  const [px, setPx] = useState(0)
  const pic = useRef<HTMLDivElement>(null)
  const art = useRef<HTMLDivElement>(null)
  const zoomInBtn = useRef<HTMLButtonElement>(null)
  const hintId = useId()

  const counts = useMemo(() => mapCounts(state.list, state.filter, species, state.seen), [state.list, state.filter, species, state.seen])
  const named = useMemo(() => regionsIn(regions, lang), [regions, lang])
  const name = useCallback((k: string) => placeName(k, named, t.places.continents, t.places.regions), [named, t])
  useEffect(() => { onLevel?.(undefined, name) }, [name, onLevel])

  useEffect(() => {
    let live = true
    loadMapCountries().then((w) => live && setWorld(w), () => live && setFailed(true))
    return () => { live = false }
  }, [])

  const shapes = useMemo(() => (world ? mapShapes(world, counts) : []), [world, counts])
  const [min, max] = countRange(shapes)
  const rows = useMemo(() => mapRows(counts, name, HTML_LANG[lang]), [counts, name, lang])
  const shownRows = all ? rows : rows.slice(0, MAP_FIRST_ROWS)

  // The view, always clamped to the world and the deepest zoom for the map's drawn width (`lim`, read by the listeners).
  const W = world?.w ?? 0, H = world?.h ?? 0
  const top = maxZoom(px, W)
  const lim = useRef({ w: 0, h: 0, max: 1 })
  useLayoutEffect(() => { lim.current = { w: W, h: H, max: top } }, [W, H, top])
  const viewRef = useRef<View | null>(null)
  const anim = useRef<number | null>(null)
  const cur = (): View => viewRef.current ?? worldView(lim.current.w, lim.current.h)
  const go = useCallback((v: View) => {
    const { w, h, max } = lim.current
    viewRef.current = clampView(v, w, h, max)
    setViewState(viewRef.current)
    setTip(null)
  }, [])
  const stop = () => {
    if (anim.current !== null) cancelAnimationFrame(anim.current)
    anim.current = null
  }
  // Eased, the zoom interpolated in log space so each doubling takes as long; at once under reduced motion.
  const animateTo = useCallback((target: View) => {
    stop()
    const { w, h, max } = lim.current
    const from = viewRef.current ?? worldView(w, h)
    const to = clampView(target, w, h, max)
    if (reducedMotion() || typeof requestAnimationFrame === 'undefined') return go(to)
    const start = performance.now()
    const l0 = Math.log(from.zoom), l1 = Math.log(to.zoom)
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / EASE_MS)
      const e = 1 - (1 - p) ** 3
      go({ cx: from.cx + (to.cx - from.cx) * e, cy: from.cy + (to.cy - from.cy) * e, zoom: Math.exp(l0 + (l1 - l0) * e) })
      anim.current = p < 1 ? requestAnimationFrame(step) : null
    }
    anim.current = requestAnimationFrame(step)
  }, [go])
  useEffect(() => stop, [])
  const zoomBy = (factor: number) => animateTo({ ...cur(), zoom: cur().zoom * factor })
  const reset = () => animateTo(worldView(W, H))

  // The map's drawn width at zoom 1 (the svg is letterboxed when its height is capped), for the deepest zoom.
  useEffect(() => {
    const el = art.current
    if (!el || !W || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setPx(Math.min(r.width, (r.height * W) / H))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [W, H])
  // A narrower map allows a deeper zoom, a wider one less: the view is clamped again.
  useEffect(() => { if (viewRef.current) go(viewRef.current) }, [top, go])

  /** A client point in map units, in the view `v`. */
  const toMap = (x: number, y: number, v: View): Pt | null => {
    const r = art.current?.getBoundingClientRect()
    if (!r?.width || !r.height) return null
    const vb = viewBoxOf(v, lim.current.w, lim.current.h)
    const upp = Math.max(vb.w / r.width, vb.h / r.height)
    return { x: vb.x + (x - r.left - (r.width - vb.w / upp) / 2) * upp, y: vb.y + (y - r.top - (r.height - vb.h / upp) / 2) * upp }
  }

  // Pointers: a drag pans once zoomed (captured only once it moves, so a tap still reaches its country), two pointers pinch.
  const pointers = useRef(new Map<number, Pt>())
  const drag = useRef<{ x: number; y: number; view: View; upp: number } | null>(null)
  const pinch = useRef<{ dist: number; view: View; at: Pt } | null>(null)
  const moved = useRef(false)
  const zoomed = (view?.zoom ?? 1) > 1.001
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!world || (e.pointerType === 'mouse' && e.button !== 0)) return
    stop()
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    moved.current = false
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const at = toMap((a.x + b.x) / 2, (a.y + b.y) / 2, cur())
      pinch.current = at ? { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), view: cur(), at } : null
      drag.current = null
    } else if (zoomed) {
      const r = art.current?.getBoundingClientRect()
      const vb = viewBoxOf(cur(), W, H)
      if (r?.width && r.height) drag.current = { x: e.clientX, y: e.clientY, view: cur(), upp: Math.max(vb.w / r.width, vb.h / r.height) }
    }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const p = pinch.current
    if (p && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      moved.current = true
      go(zoomAt(p.view, p.view.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / p.dist), p.at))
      return
    }
    const d = drag.current
    if (!d) return
    if (!moved.current && Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_PX) {
      moved.current = true
      e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    if (moved.current) go({ ...d.view, cx: d.view.cx - (e.clientX - d.x) * d.upp, cy: d.view.cy - (e.clientY - d.y) * d.upp })
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    drag.current = null
  }

  // A trackpad's pinch arrives as ctrl+wheel and zooms where the pointer is; a plain wheel keeps scrolling the page. A
  // native listener, not passive, so preventDefault stops the browser zooming the page.
  useEffect(() => {
    const el = art.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey || !lim.current.w) return
      e.preventDefault()
      stop()
      const v = viewRef.current ?? worldView(lim.current.w, lim.current.h)
      const at = toMap(e.clientX, e.clientY, v)
      const zoom = v.zoom * Math.exp(-e.deltaY * 0.01)
      go(at ? zoomAt(v, zoom, at) : { ...v, zoom })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [go])

  // A tap or press anywhere but a country of the map closes the tooltip.
  useEffect(() => {
    if (!tip) return
    const down = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.eb-map-svg path[data-key]')) setTip(null)
    }
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  }, [tip])

  const tipAt = (key: string, e: ReactPointerEvent | React.MouseEvent) => {
    const r = pic.current?.getBoundingClientRect()
    if (!r) return
    setTip({ key, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width })
  }
  const tipShape = tip ? shapes.find((s) => s.key === tip.key) : undefined
  const spoken = (n: number) => plural(t.collage.stats.species, n, { n: formatInt(n, t.num) })
  const box = world ? viewBoxOf(view ?? worldView(W, H), W, H) : null
  const atTop = (view?.zoom ?? 1) >= top - 0.001

  return (
    <div className="eb-map" data-testid="map-view">
      {/* The legend at the top right of the map. */}
      {world && max > 0 && (
        <div className="eb-map-head">
          <div className="eb-mono eb-map-legend" aria-hidden="true" data-testid="map-legend">
            <span>{formatInt(min, t.num)}</span>
            <i style={{ background: `linear-gradient(90deg, ${rampFill(RAMP.lo)}, ${rampFill(RAMP.hi)})` }} />
            <span>{spoken(max)}</span>
          </div>
        </div>
      )}
      <div
        ref={pic}
        className="eb-map-pic"
        role="group"
        aria-label={c.map}
        aria-describedby={hintId}
        tabIndex={0}
        data-testid="map-pic"
        data-zoomed={zoomed || undefined}
        onKeyDown={(e) => {
          if (!world) return
          const v = cur()
          const step = W / 15 / v.zoom
          if (e.key === 'Escape') { if (!tip) return; setTip(null) }
          else if (e.key === 'ArrowLeft' && zoomed) go({ ...v, cx: v.cx - step })
          else if (e.key === 'ArrowRight' && zoomed) go({ ...v, cx: v.cx + step })
          else if (e.key === 'ArrowUp' && zoomed) go({ ...v, cy: v.cy - step })
          else if (e.key === 'ArrowDown' && zoomed) go({ ...v, cy: v.cy + step })
          else if (e.key === '+' || e.key === '=') zoomBy(ZOOM_STEP)
          else if (e.key === '-' || e.key === '_') zoomBy(1 / ZOOM_STEP)
          else if (e.key === '0' || e.key === 'Home') reset()
          else return
          e.preventDefault()
        }}
      >
        {/* The picture only: the list under it has the same places and numbers for the keyboard and screen readers. */}
        <div
          ref={art}
          className="eb-map-art"
          aria-hidden="true"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {world && box ? (
            <svg
              className="eb-map-svg"
              viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
              data-zoom={(view?.zoom ?? 1).toFixed(2)}
              onPointerLeave={(e) => { if (e.pointerType === 'mouse') setTip(null) }}
            >
              {/* One path per place, the hovered one last: hovering never adds, hides or refills a shape. */}
              {mapDrawOrder(shapes, tipShape?.key).map((s) => {
                const shade = s.n > 0 ? shadeMix(s.n, min, max) : undefined
                return (
                  <path
                    key={s.id}
                    d={s.d}
                    data-key={s.key}
                    data-mix={shade?.toFixed(2)}
                    style={shade !== undefined ? { fill: rampFill(shade) } : undefined}
                    data-edge={s.key === tipShape?.key || undefined}
                    onPointerEnter={(e) => { if (e.pointerType === 'mouse' && !drag.current) tipAt(s.key, e) }}
                    onPointerMove={(e) => { if (e.pointerType === 'mouse' && !moved.current) tipAt(s.key, e) }}
                    // A press or tap names the place, as hovering does; it opens nothing. A drag names nothing.
                    onClick={(e) => { if (!moved.current) tipAt(s.key, e) }}
                  />
                )
              })}
            </svg>
          ) : (
            !failed && <div className="eb-map-svg eb-map-wait" />
          )}
          {tip && tipShape && (
            <div className="eb-card eb-tip eb-map-tip" style={{ left: tip.x, top: tip.y }} data-side={tip.x < tip.w / 3 ? 'start' : tip.x > (2 * tip.w) / 3 ? 'end' : 'mid'} data-testid="map-tip">
              <span className="eb-map-tip-name">{name(tipShape.key)}</span>
              <span className="eb-mono">{spoken(tipShape.n)}</span>
            </div>
          )}
        </div>
      </div>
      {world && (
        <div className="eb-map-zoom">
          <p id={hintId} className="eb-mono eb-map-hint">{c.mapHint}</p>
          <div className="eb-map-zoom-btns">
            {zoomed && (
              <button
                type="button"
                className="eb-btn eb-btn-quiet eb-map-zoom-btn"
                aria-label={c.mapReset}
                title={c.mapReset}
                data-testid="map-reset"
                onClick={(e) => {
                  // The button goes with the zoom: its focus moves to Zoom in, beside it.
                  if (document.activeElement === e.currentTarget) zoomInBtn.current?.focus()
                  reset()
                }}
              >
                <GlobeHemisphereWest aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              className="eb-btn eb-btn-quiet eb-map-zoom-btn"
              aria-label={c.mapZoomOut}
              aria-disabled={!zoomed || undefined}
              data-disabled={!zoomed || undefined}
              data-testid="map-zoom-out"
              onClick={() => { if (zoomed) zoomBy(1 / ZOOM_STEP) }}
            >
              <Minus aria-hidden="true" />
            </button>
            <button
              ref={zoomInBtn}
              type="button"
              className="eb-btn eb-btn-quiet eb-map-zoom-btn"
              aria-label={c.mapZoomIn}
              aria-disabled={atTop || undefined}
              data-disabled={atTop || undefined}
              data-testid="map-zoom-in"
              onClick={() => { if (!atTop) zoomBy(ZOOM_STEP) }}
            >
              <Plus aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      {failed && <p className="eb-note" data-testid="map-failed">{c.mapFailed}</p>}
      <ul className="eb-map-list" aria-label={t.places.head.country} data-testid="map-list">
        {shownRows.map((r) => (
          <li key={r.value}>
            {/* Every row keeps the flag's room, so a place without a flag (Northern Cyprus) lines up with the rest. */}
            <span className="eb-map-row" data-testid={`map-row-${r.value}`}>
              <span className="eb-flag-slot" aria-hidden="true"><Flag iso={parsePlaceKey(r.value)?.country} /></span>
              <span className="eb-map-row-name">{r.label}</span>
              <span className="eb-count" aria-hidden="true">{formatInt(r.count, t.num)}</span>
              <span className="eb-sr">, {spoken(r.count)}</span>
            </span>
          </li>
        ))}
        {rows.length === 0 && <li className="eb-note eb-check-none">{t.places.none}</li>}
      </ul>
      {rows.length > shownRows.length && (
        <button type="button" className="eb-textbtn eb-map-all" data-testid="map-all" onClick={() => setAll(true)}>
          {fmt(c.mapAll, { n: formatInt(rows.length, t.num) })}
        </button>
      )}
    </div>
  )
}
