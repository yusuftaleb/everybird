'use client'
// The birder's list and the imports in flight, above the routes (app/(app)/layout.tsx): /, /make and /my share one
// store, and an import started on /make keeps running while the birder moves between them. The shared view
// (/s/[token]) and /credits live outside this layout, so they never load or touch the saved list.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { track } from '@/lib/analytics'
import { loadCountryDots, loadRegions } from '@/lib/import/places'
import { slotSource, SLOTS, type ImportResult, type Slot } from '@/lib/list/model'
import type { Saved } from '@/lib/list/storage'
import { useEverybird, type Action, type AppState, type EverybirdMeta } from '@/lib/list/store'
import type { SpeciesIndex } from '@/lib/species/load'
import type { CountryDots, Regions } from '@/lib/species/types'
import { useImportJobs, type ImportJobs } from './use-import-jobs'

export type Everybird = {
  state: AppState
  dispatch: (a: Action) => void
  meta: EverybirdMeta
  /** Species and regions, once both have loaded (and the stored list with them). */
  data: { species: SpeciesIndex; regions: Regions } | null
  dots?: CountryDots
  /** The bird data couldn't load. */
  failed: boolean
  /** The birder has a list (anything imported, matched or not). */
  mine: boolean
  jobs: ImportJobs
}

/** Anything the birder brought in, matched or not (an import of only unmatched rows still shows its report). */
export function hasData(s: Saved): boolean {
  return SLOTS.some((k) => (s.records[k]?.length ?? 0) > 0) || s.edits.added.length > 0 || s.unmatched.length > 0
}

const Ctx = createContext<Everybird | null>(null)

export function EverybirdProvider({ children }: { children: ReactNode }) {
  const [state, dispatch, meta] = useEverybird()
  const [regions, setRegions] = useState<Regions | null>(null)
  const [dots, setDots] = useState<CountryDots | undefined>(undefined)
  const [regionsFailed, setRegionsFailed] = useState(false)
  useEffect(() => {
    let live = true
    loadRegions().then((r) => { if (live) setRegions(r) }, () => { if (live) setRegionsFailed(true) })
    loadCountryDots().then((d) => { if (live) setDots(d) }, () => {}) // the map is optional; chips still work
    return () => { live = false }
  }, [])

  const onImport = useCallback((slot: Slot, result: ImportResult) => {
    dispatch({ type: 'import', source: slot, result })
    track('collage_made', { source: slotSource(slot) })
  }, [dispatch])
  const jobs = useImportJobs(onImport)

  const species = meta.species
  const data = useMemo(() => (meta.ready && species && regions ? { species, regions } : null), [meta.ready, species, regions])
  const mine = hasData(state.saved)
  const value = useMemo<Everybird>(
    () => ({ state, dispatch, meta, data, dots, failed: !!meta.error || regionsFailed, mine, jobs }),
    [state, dispatch, meta, data, dots, regionsFailed, mine, jobs],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useEverybirdContext(): Everybird {
  const v = useContext(Ctx)
  if (!v) throw new Error('useEverybirdContext needs <EverybirdProvider> (app/(app)/layout.tsx)')
  return v
}
