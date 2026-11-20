'use client'
// The Map view (the dock's third tab): the world shaded by the birds the filters leave, the same birds the collage
// shows (mapCounts, the Places filter included), on one continuous log scale with its legend ramp at the top right,
// across from the path. It has
// no filter controls of its own: the bar's Filters button filters it, as every view. A press on a country with birds
// opens it (its states and provinces where their shapes have them, else the country framed in the world view).
// Hovering any place shows its name and count ("0 species" too) in a
// tooltip beside the pointer, and outlines it in Ink above every other shape (mapEdges), as the open place is; on touch the first tap shows the tooltip and a second tap on the same place opens it.
// Inside a country, a province with counties opens too: the province framed and outlined, its counties or districts in
// the list (there are no county shapes). Above the map, the path ("World / Canada / British Columbia", the Places
// breadcrumb's style) says where the map is; each earlier step goes back to it, and so does Esc while the map has focus.
// The picture is aria-hidden: the list under it, the shown level's places with their counts, most species first, in
// one to three columns (map.css), is its text path (a row that opens is a button, exactly as a press on the map; country
// rows carry the Places filter's flag, components/Flag). The level the map has open is told up (`onLevel`), so Share
// draws the same map. The ramp (RAMP in shapes.ts) is set per path, the borders and outlines by map.css. The shapes
// (src/lib/map/shapes.ts) are pre-projected; the world loads with the tab, the provinces on the first open.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { HTML_LANG } from '@/i18n/langs'
import { regionsIn } from '@/lib/i18n-places'
import { parsePlaceKey, placeName } from '@/lib/list/place-keys'
import type { AppState } from '@/lib/list/store'
import { Flag } from '@/components/Flag'
import { countRange, loadMapCountries, loadMapProvinces, mapCounts, mapEdges, mapLayer, mapOpens, mapPath, mapRows, placeCount, RAMP, shadeMix, type MapCountries, type MapProvinces } from '@/lib/map/shapes'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Regions } from '@/lib/species/types'
import { ChevronDownIcon } from './icons'
import './card-list.css'
import './map.css'

/** Rows the list shows before "Show all". */
export const MAP_FIRST_ROWS = 10

/** The test id of a step of the path (undefined: World). */
const stepId = (k: string | undefined) => `map-path-${k ?? 'world'}`

/** The CSS colour of `mix` (0 to 1) on the ramp: Accent over Paper, in the theme's tokens. */
export function rampFill(mix: number): string {
  return `color-mix(in srgb, var(--accent) ${Math.round(mix * 1000) / 10}%, var(--paper))`
}

type Props = {
  state: AppState
  species: SpeciesIndex
  regions: Regions
  /** Told the level the map has open (undefined: the world; a country or province key) and how places are named, so Share draws the same map. */
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
  // A place the filters have since emptied is closed again: the deepest step of its path that still has birds shows.
  const path = useMemo(() => {
    const p = mapPath(at)
    while (p.length > 1 && placeCount(counts, p[p.length - 1]!) <= 0) p.pop()
    return p
  }, [at, counts])
  const open = path[path.length - 1]
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
  // The provinces a press on the map opens (those with counties), inside the open country; any country shape opens.
  const opening = useMemo(
    () => new Set(path[1] ? mapRows(counts, path[1], name).filter((r) => mapOpens(r, open)).map((r) => r.value) : []),
    [path, counts, name, open],
  )
  const level = open ?? 'world'
  const shownRows = allFor === level ? rows : rows.slice(0, MAP_FIRST_ROWS)

  const zoom = useCallback((key: string) => {
    setTip(null)
    // Focus the path's step back up, as World's button had it.
    const p = mapPath(key)
    focusNext.current = stepId(p[p.length - 2])
    setAt(key)
  }, [])
  // Back to `target` (undefined: the world), a step of the path: focus the row of the place it came from (the whole
  // list, if it is past the first rows).
  const stepTo = useCallback((target: string | undefined) => {
    const i = path.indexOf(target)
    const from = path[i + 1]
    if (i < 0 || !from) return
    setTip(null)
    if (mapRows(counts, target, name).findIndex((r) => r.value === from) >= MAP_FIRST_ROWS) setAllFor(target ?? 'world')
    focusNext.current = `map-row-${from}`
    setAt(target)
  }, [path, counts, name])
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
  const stepName = (k: string | undefined) => (k ? name(k) : t.collage.controls.mapWorld)
  const openLevel = open ? parsePlaceKey(open)?.level : undefined
  const atWorld = !open

  return (
    <div
      ref={root}
      className="eb-map"
      data-testid="map-view"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.preventDefault()
          stepTo(path[path.length - 2])
        }
      }}
    >
      {/* The path on the left, the legend at the right of the same row (under it, right-aligned, when both don't fit). */}
      <div className="eb-map-head">
        <p className="eb-path eb-map-path" data-testid="map-path">
          {path.map((k, i) => (
            <span key={k ?? ''} className="eb-path-item">
              {i > 0 && <span className="eb-path-sep" aria-hidden="true">/</span>}
              {k === open ? (
                <span aria-current="location">{stepName(k)}</span>
              ) : (
                <button type="button" data-testid={stepId(k)} onClick={() => stepTo(k)}>{stepName(k)}</button>
              )}
            </span>
          ))}
        </p>
        {layer && max > 0 && (
          <div className="eb-mono eb-map-legend" aria-hidden="true" data-testid="map-legend">
            <span>{formatInt(min, t.num)}</span>
            <i style={{ background: `linear-gradient(90deg, ${rampFill(RAMP.lo)}, ${rampFill(RAMP.hi)})` }} />
            <span>{spoken(max)}</span>
          </div>
        )}
      </div>
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
                const opens = press && s.key !== open && (s.key.startsWith('c:') || opening.has(s.key))
                return (
                  <path
                    key={s.id}
                    d={s.d}
                    data-key={s.key}
                    data-mix={press ? shadeMix(s.n, min, max).toFixed(2) : undefined}
                    style={press ? { fill: rampFill(shadeMix(s.n, min, max)) } : undefined}
                    data-opens={opens || undefined}
                    onPointerDown={(e) => { pointer.current = e.pointerType }}
                    onPointerEnter={(e) => { if (e.pointerType === 'mouse') tipAt(s.key, e) }}
                    onPointerMove={(e) => { if (e.pointerType === 'mouse') tipAt(s.key, e) }}
                    onClick={(e) => {
                      // Touch: the first tap names the place, a second tap on the same place opens it.
                      if (pointer.current !== 'mouse' && tip?.key !== s.key) { tipAt(s.key, e); return }
                      if (opens) zoom(s.key)
                      else tipAt(s.key, e)
                    }}
                  />
                )
              })}
              {/* The open and the hovered place's outlines, drawn last so no neighbour covers half the line. */}
              {mapEdges(shapes, open, tipShape?.key).map((s) => (
                <path key={`edge-${s.id}`} className="eb-map-edge" d={s.d} data-edge={s.key} />
              ))}
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
      {failed && <p className="eb-note" data-testid="map-failed">{t.collage.controls.mapFailed}</p>}
      <ul
        className="eb-map-list"
        aria-label={open ? fmt(openLevel === 'province' ? t.places.group.province : t.places.group.country, { place: name(open) }) : t.places.head.country}
        data-testid="map-list"
      >
        {shownRows.map((r) => {
          const n = formatInt(r.count, t.num)
          const inner = (
            <>
              {/* World rows keep the flag's room, so a place without a flag (Northern Cyprus) lines up with the rest. */}
              {atWorld && <span className="eb-flag-slot" aria-hidden="true"><Flag iso={parsePlaceKey(r.value)?.country} /></span>}
              <span className="eb-map-row-name">{r.label}</span>
              <span className="eb-count" aria-hidden="true">{n}</span>
              <span className="eb-sr">, {spoken(r.count)}</span>
            </>
          )
          return (
            <li key={r.value}>
              {mapOpens(r, open) ? (
                <button type="button" className="eb-map-row" data-testid={`map-row-${r.value}`} onClick={() => zoom(r.value)}>
                  {inner}
                  <ChevronDownIcon className="eb-map-row-go" />
                </button>
              ) : (
                <span className="eb-map-row" data-testid={`map-row-${r.value}`}>{inner}</span>
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
