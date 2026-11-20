'use client'
// The Map view (the dock's third tab): the world shaded by the birds the filters leave, the same birds the collage
// shows (mapCounts, the Places filter included), on one continuous log scale with its legend ramp under the map. It has
// no filter controls of its own: the bar's Filters button filters it, as every view. A press on a country with birds
// opens it (its states and provinces where their shapes have them, else the country framed in the world view); the
// "World" button on the map, or Esc while the map has focus, goes back. Hovering a place shows its name and count in a
// tooltip beside the pointer; on touch the first tap shows the tooltip and a second tap on the same country opens it.
// The picture is aria-hidden: the list under it, the shown level's places with their counts, most species first, is
// its text path (a country's row is a button that opens it, exactly as a press on the map; at a country the rows are
// plain and World leads the list). The level the map has open is told up (`onLevel`), so Share draws the same map.
// The shapes (src/lib/map/shapes.ts) are pre-projected; the world loads with the tab, the provinces on the first open.
import { ArrowLeft } from '@phosphor-icons/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { HTML_LANG } from '@/i18n/langs'
import { regionsIn } from '@/lib/i18n-places'
import { placeName } from '@/lib/list/place-keys'
import type { AppState } from '@/lib/list/store'
import { countRange, loadMapCountries, loadMapProvinces, mapCounts, mapLayer, mapRows, SHADE_LIGHT, shadeMix, type MapCountries, type MapProvinces } from '@/lib/map/shapes'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Regions } from '@/lib/species/types'
import { ChevronDownIcon } from './icons'
import './card-list.css'
import './map.css'

/** Rows the list shows before "Show all". */
export const MAP_FIRST_ROWS = 10

type Props = {
  state: AppState
  species: SpeciesIndex
  regions: Regions
  /** Told the level the map has open (undefined: the world; a country key) and how places are named, so Share draws the same map. */
  onLevel?: (at: string | undefined, name: (key: string) => string) => void
}

type Tip = { key: string; x: number; y: number; w: number }

export function MapView({ state, species, regions, onLevel }: Props) {
  const { t, lang } = useI18n()
  const [at, setAt] = useState<string | undefined>()
  const [world, setWorld] = useState<MapCountries | null>(null)
  const [provinces, setProvinces] = useState<MapProvinces | null>(null)
  const [failed, setFailed] = useState(false)
  const [tip, setTip] = useState<Tip | null>(null)
  const [allFor, setAllFor] = useState<string | null>(null)
  const pic = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const pointer = useRef('mouse')
  const focusNext = useRef<string | null>(null)

  const counts = useMemo(() => mapCounts(state.list, state.filter, species, state.seen), [state.list, state.filter, species, state.seen])
  // A country the filters have since emptied is closed again: the world shows.
  const open = at && (counts.countries.get(at.slice(2))?.n ?? 0) > 0 ? at : undefined
  const named = useMemo(() => regionsIn(regions, lang), [regions, lang])
  const name = useCallback((k: string) => placeName(k, named, t.places.continents, t.places.regions), [named, t])
  useEffect(() => { onLevel?.(open, name) }, [open, name, onLevel])

  useEffect(() => {
    let live = true
    loadMapCountries().then((w) => live && setWorld(w), () => live && setFailed(true))
    return () => { live = false }
  }, [])
  const wantProvinces = open !== undefined && !provinces
  useEffect(() => {
    if (!wantProvinces) return
    let live = true
    // A failure keeps the country framed in the world view.
    loadMapProvinces().then((p) => live && setProvinces(p), () => {})
    return () => { live = false }
  }, [wantProvinces])

  const { layer, shapes, box } = useMemo(() => mapLayer(world, provinces, counts, open), [world, provinces, counts, open])
  const [min, max] = countRange(shapes)
  const rows = useMemo(() => mapRows(counts, open, name, HTML_LANG[lang]), [counts, open, name, lang])
  const level = open ?? 'world'
  const shownRows = allFor === level ? rows : rows.slice(0, MAP_FIRST_ROWS)

  const zoom = useCallback((key: string) => {
    setTip(null)
    focusNext.current = 'map-world'
    setAt(key)
  }, [])
  const back = useCallback(() => {
    if (!open) return
    setTip(null)
    // Back on the world's list: focus the row of the country it came from (the whole list, if it is past the first rows).
    const i = mapRows(counts, undefined, name).findIndex((r) => r.value === open)
    if (i >= MAP_FIRST_ROWS) setAllFor('world')
    focusNext.current = `map-row-${open}`
    setAt(undefined)
  }, [open, counts, name])
  useLayoutEffect(() => {
    const id = focusNext.current
    if (!id) return
    focusNext.current = null
    Array.from(root.current?.querySelectorAll<HTMLElement>('[data-testid]') ?? []).find((el) => el.dataset.testid === id)?.focus()
  }, [open])

  // A tap or press anywhere but a place of the map closes the tooltip.
  useEffect(() => {
    if (!tip) return
    const down = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.eb-map-svg path[data-press]')) setTip(null)
    }
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  }, [tip])

  const tipAt = (key: string, e: ReactPointerEvent | React.MouseEvent) => {
    const r = pic.current?.getBoundingClientRect()
    if (!r) return
    setTip({ key, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width })
  }
  const tipShape = tip ? shapes.find((s) => s.key === tip.key && s.n > 0) : undefined
  const spoken = (n: number) => plural(t.collage.stats.species, n, { n: formatInt(n, t.num) })
  const pct = (n: number) => `${Math.round(shadeMix(n, min, max) * 1000) / 10}%`

  return (
    <div
      ref={root}
      className="eb-map"
      data-testid="map-view"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.preventDefault()
          back()
        }
      }}
    >
      <div ref={pic} className="eb-map-pic">
        {/* The picture only: the list under it has the same places and numbers for the keyboard and screen readers. */}
        <div className="eb-map-art" aria-hidden="true">
          {layer && box ? (
            <svg
              key={`${open ?? ''}|${layer === world ? 'w' : 'p'}`}
              className="eb-map-svg"
              viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
              data-level={open ?? 'world'}
              onPointerLeave={(e) => { if (e.pointerType === 'mouse') setTip(null) }}
            >
              {shapes.map((s) => {
                const press = s.n > 0
                const opens = press && s.key.startsWith('c:')
                return (
                  <path
                    key={s.id}
                    d={s.d}
                    data-key={s.key}
                    data-mix={press ? shadeMix(s.n, min, max).toFixed(2) : undefined}
                    style={press ? { fill: `color-mix(in srgb, var(--accent) ${pct(s.n)}, var(--surface))` } : undefined}
                    data-hot={s.key === tipShape?.key || undefined}
                    data-open={s.key === open || undefined}
                    data-press={press || undefined}
                    data-opens={(opens && s.key !== open) || undefined}
                    onPointerDown={(e) => { pointer.current = e.pointerType }}
                    onPointerEnter={(e) => { if (e.pointerType === 'mouse') { if (press) tipAt(s.key, e); else setTip(null) } }}
                    onPointerMove={(e) => { if (press && e.pointerType === 'mouse') tipAt(s.key, e) }}
                    onClick={press ? (e) => {
                      // Touch: the first tap names the place, a second tap on the same country opens it.
                      if (pointer.current !== 'mouse' && tip?.key !== s.key) { tipAt(s.key, e); return }
                      if (opens && s.key !== open) zoom(s.key)
                      else tipAt(s.key, e)
                    } : undefined}
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
        {open && (
          <button type="button" className="eb-btn eb-btn-quiet eb-map-back" data-testid="map-world" onClick={back}>
            <ArrowLeft aria-hidden="true" focusable="false" />
            {t.collage.controls.mapWorld}
          </button>
        )}
        {layer && max > 0 && (
          <div className="eb-mono eb-map-legend" aria-hidden="true" data-testid="map-legend">
            <span>{formatInt(min, t.num)}</span>
            <i style={{ background: `linear-gradient(90deg, color-mix(in srgb, var(--accent) ${SHADE_LIGHT * 100}%, var(--surface)), var(--accent))` }} />
            <span>{spoken(max)}</span>
          </div>
        )}
      </div>
      {failed && <p className="eb-note" data-testid="map-failed">{t.collage.controls.mapFailed}</p>}
      <ul className="eb-map-list" aria-label={open ? fmt(t.places.group.country, { place: name(open) }) : t.places.head.country} data-testid="map-list">
        {shownRows.map((r) => {
          const n = formatInt(r.count, t.num)
          const inner = (
            <>
              <span className="eb-map-row-name">{r.label}</span>
              <span className="eb-count" aria-hidden="true">{n}</span>
              <span className="eb-sr">, {spoken(r.count)}</span>
            </>
          )
          return (
            <li key={r.value}>
              {open ? (
                <span className="eb-map-row" data-testid={`map-row-${r.value}`}>{inner}</span>
              ) : (
                <button type="button" className="eb-map-row" data-testid={`map-row-${r.value}`} onClick={() => zoom(r.value)}>
                  {inner}
                  <ChevronDownIcon className="eb-map-row-go" />
                </button>
              )}
            </li>
          )
        })}
        {rows.length === 0 && <li className="eb-note eb-check-none">{t.places.none}</li>}
      </ul>
      {rows.length > shownRows.length && (
        <button type="button" className="eb-textbtn eb-map-all" data-testid="map-all" onClick={() => setAllFor(level)}>
          {fmt(t.collage.controls.mapAll, { n: formatInt(rows.length, t.num) })}
        </button>
      )}
    </div>
  )
}
