'use client'
// The Map view (the dock's third tab): the world shaded by species per country, and, once the list under it is drilled
// into a country, that country's states and provinces. The list is the Places panel itself (PlacesList), so the
// keyboard and screen-reader path has the same numbers, and drilling happens there; the map follows its level. A
// press on a place toggles it in the filter exactly as its checkbox does (togglePlace). The counts are the panel's
// (placeCountsFor: under the other filters, whatever places are checked), so a checked place is outlined, never re-shaded.
// The shapes (src/lib/map/shapes.ts) are pre-projected; the world loads with the tab, the provinces on the first drill.
import { useEffect, useMemo, useState } from 'react'
import { PlacesList } from '@/components/filters/PlacesList'
import { placeCountsFor, type PlacesBodyProps, type PlacesNote } from '@/components/filters/places-shared'
import { plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { regionsIn } from '@/lib/i18n-places'
import { filterPlaceKeys, togglePlace } from '@/lib/list/filters'
import type { PlacesUnplaced } from '@/lib/list/filter-summary'
import { placeName } from '@/lib/list/place-keys'
import { loadMapCountries, loadMapProvinces, mapGroupOf, mapLayer, shadeStep, type MapCountries, type MapProvinces } from '@/lib/map/shapes'
import './map.css'

/** `onLevel`: told the Places level the map follows (as PlacesBodyProps' onLevel), so Share can draw the same map. */
type Props = PlacesBodyProps & { note?: PlacesNote; unplaced?: PlacesUnplaced; onLevel?: (at: string | undefined) => void }

export function MapView({ state, species, regions, onFilter, note, unplaced, onLevel }: Props) {
  const { t, lang } = useI18n()
  const [at, setAt] = useState<string | undefined>()
  const [world, setWorld] = useState<MapCountries | null>(null)
  const [provinces, setProvinces] = useState<MapProvinces | null>(null)
  const [failed, setFailed] = useState(false)
  const [hot, setHot] = useState<string | null>(null)
  const group = mapGroupOf(at)
  useEffect(() => onLevel?.(at), [at, onLevel])

  useEffect(() => {
    let live = true
    loadMapCountries().then((w) => live && setWorld(w), () => live && setFailed(true))
    return () => { live = false }
  }, [])
  const wantProvinces = group !== undefined && !provinces
  useEffect(() => {
    if (!wantProvinces) return
    let live = true
    loadMapProvinces().then((p) => live && setProvinces(p), () => live && setFailed(true))
    return () => { live = false }
  }, [wantProvinces])

  const counts = placeCountsFor(state, species)
  const checked = useMemo(() => new Set(filterPlaceKeys(state.filter)), [state.filter])
  const { layer, shapes } = useMemo(() => mapLayer(world, provinces, counts, checked, at), [world, provinces, at, counts, checked])
  const max = shapes.reduce((m, s) => Math.max(m, s.n), 0)

  const named = useMemo(() => regionsIn(regions, lang), [regions, lang])
  const hotShape = hot ? shapes.find((s) => s.key === hot) : undefined
  const line = hotShape
    ? `${placeName(hotShape.key, named, t.places.continents, t.places.regions)} · ${plural(t.collage.stats.species, hotShape.n, { n: formatInt(hotShape.n, t.num) })}`
    : t.collage.controls.mapHint

  return (
    <div className="eb-map" data-testid="map-view">
      {/* The picture only: the list under it is the same places and numbers for the keyboard and screen readers. */}
      <div className="eb-map-pic" aria-hidden="true">
        {layer ? (
          <svg className="eb-map-svg" viewBox={`0 0 ${layer.w} ${layer.h}`} onPointerLeave={() => setHot(null)}>
            {shapes.map((s) => (
              <path
                key={s.id}
                d={s.d}
                data-key={s.key}
                data-step={shadeStep(s.n, max)}
                data-on={s.checked || undefined}
                data-hot={s.key === hot || undefined}
                data-press={s.n > 0 || s.checked || undefined}
                onPointerEnter={s.n > 0 || s.checked ? () => setHot(s.key) : () => setHot(null)}
                onClick={s.n > 0 || s.checked ? () => { setHot(s.key); onFilter(togglePlace(state.filter, s.key)) } : undefined}
              />
            ))}
          </svg>
        ) : (
          !failed && <div className="eb-map-svg eb-map-wait" />
        )}
        {layer && <p className="eb-mono eb-map-line">{line}</p>}
      </div>
      {failed && <p className="eb-note" data-testid="map-failed">{t.collage.controls.mapFailed}</p>}
      <PlacesList state={state} species={species} regions={regions} onFilter={onFilter} note={note} unplaced={unplaced} />
    </div>
  )
}
