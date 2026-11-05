'use client'
import { useEffect, useMemo, useReducer } from 'react'
import { stripBracket } from '@/lib/import/places'
import { loadSample } from '@/lib/list/sample'
import { initialState, makeReducer } from '@/lib/list/store'
import type { SpeciesIndex } from '@/lib/species/load'
import type { CountryDots, Regions } from '@/lib/species/types'
import { CollageView } from './CollageView'

/** The landing page's live demo: the sample list in its own store (never saved), fully filterable. */
export function SampleDemo({ species, regions, dots }: { species: SpeciesIndex; regions: Regions; dots?: CountryDots }) {
  const reducer = useMemo(
    () => makeReducer({ species, countryName: (iso) => (regions.countries[iso] ? stripBracket(regions.countries[iso]) : iso) }),
    [species, regions],
  )
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  useEffect(() => {
    let live = true
    loadSample().then((saved) => { if (live) dispatch({ type: 'restore', saved }) }, () => {})
    return () => { live = false }
  }, [])
  if (!state.list.length) return <div className="eb-stage-wait eb-sample-wait" aria-hidden="true" />
  return <CollageView state={state} dispatch={dispatch} species={species} regions={regions} dots={dots} label="Sample collage" />
}
