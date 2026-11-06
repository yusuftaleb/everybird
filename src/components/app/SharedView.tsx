'use client'
import { useEffect, useMemo, useReducer, useState } from 'react'
import { loadCountryDots, loadRegions, stripBracket } from '@/lib/import/places'
import { initialState, makeReducer } from '@/lib/list/store'
import { emptySaved } from '@/lib/list/storage'
import { loadSpecies, type SpeciesIndex } from '@/lib/species/load'
import type { CountryDots, Regions } from '@/lib/species/types'
import { payloadToRecords } from '@/lib/share/convert'
import type { SharePayload } from '@/lib/share/link'
import type { Tab } from '@/components/filters/FilterBar'
import { CollageView } from './CollageView'
import './app.css'

const NO_PLACES: readonly Tab[] = ['places']
const NO_DATES: readonly Tab[] = ['time']
const NEITHER: readonly Tab[] = ['places', 'time']
const NONE: readonly Tab[] = []

/** What a link carries decides which filters exist: it holds places or dates only at the levels that fit. */
export function missingFilters(p: SharePayload): { places: boolean; dates: boolean } {
  return { places: !p.places?.length || !p.birds.some((b) => b.p !== undefined), dates: !p.birds.some((b) => b.ym !== undefined) }
}

/**
 * The read-only collage behind a share link. Its state is built from the decoded payload alone, in its own store:
 * nothing here reads or writes the visitor's saved list (no useEverybird, no storage).
 */
export function SharedView({ payload }: { payload: SharePayload }) {
  const [data, setData] = useState<{ species: SpeciesIndex; regions: Regions } | null>(null)
  const [dots, setDots] = useState<CountryDots | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    Promise.all([loadSpecies(), loadRegions()]).then(([species, regions]) => { if (live) setData({ species, regions }) }, () => { if (live) setFailed(true) })
    loadCountryDots().then((d) => { if (live) setDots(d) }, () => {}) // the map is optional; chips still work
    return () => { live = false }
  }, [])

  if (failed) return <p className="eb-error eb-notice" role="alert">Couldn&apos;t load the bird data. Check your connection and reload the page.</p>
  if (!data) return <div className="eb-stage-wait eb-sample-wait" aria-hidden="true" />
  return <Loaded payload={payload} species={data.species} regions={data.regions} dots={dots} />
}

function Loaded({ payload, species, regions, dots }: { payload: SharePayload; species: SpeciesIndex; regions: Regions; dots?: CountryDots }) {
  const shown = useMemo(() => payloadToRecords(payload, regions), [payload, regions])
  const reducer = useMemo(
    () => makeReducer({ species, countryName: (iso) => (regions.countries[iso] ? stripBracket(regions.countries[iso]) : iso) }),
    [species, regions],
  )
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const saved = emptySaved()
    saved.records.ebird = shown.records
    return reducer(initialState(), { type: 'restore', saved })
  })
  const miss = missingFilters(payload)
  const hide = miss.places && miss.dates ? NEITHER : miss.places ? NO_PLACES : miss.dates ? NO_DATES : NONE
  // What the link leaves out is said quietly where the missing tab would be, not before the birds.
  const note = miss.places || miss.dates ? (
    <p className="eb-note eb-filter-note" data-testid="share-limited">
      {miss.places && miss.dates ? 'This link carries no places or dates' : miss.places ? 'This link carries no places' : 'This link carries no dates'}, so those filters are left out.
    </p>
  ) : undefined
  return <CollageView state={state} dispatch={dispatch} species={species} regions={shown.regions} dots={dots} label="Shared collage" hideTabs={hide} filterNote={note} />
}
