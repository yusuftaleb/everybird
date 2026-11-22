'use client'
// The birder's list and the imports in flight, above the routes (app/[lang]/(app)/layout.tsx): / (Collage), /settings and
// /about share one store, and an import started on /settings keeps running while the birder moves between them. The
// shared view (/s/[token]) lives outside this layout, so it never loads or touches the saved list. Every import's toast
// (ImportToast) is mounted here, so it follows the birder from page to page until the import ends.
import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { track } from '@/lib/analytics'
import { slotSource, SLOTS, type ImportResult, type Slot } from '@/lib/list/model'
import type { DetailsFor, Saved } from '@/lib/list/storage'
import { useEverybird, type Action, type AppState, type EverybirdMeta } from '@/lib/list/store'
import type { SpeciesIndex } from '@/lib/species/load'
import { useLoadNames } from '@/lib/species/use-names'
import type { Regions } from '@/lib/species/types'
import { useAppPath } from '@/i18n/path'
import { ImportToast } from '@/components/import/ImportToast'
import { useImportJobs, type ImportJobs } from './use-import-jobs'

export type Everybird = {
  state: AppState
  dispatch: (a: Action) => void
  meta: EverybirdMeta
  /** Species and regions, once both have loaded (and the stored list with them). */
  data: { species: SpeciesIndex; regions: Regions } | null
  /** The bird data couldn't load. */
  failed: boolean
  /** The birder has a list (anything imported, matched or not). */
  mine: boolean
  /** Whether there is a list, known as soon as storage has been read (before the bird data): null until then. */
  mineSoon: boolean | null
  jobs: ImportJobs
  /** My birds' Add birds dialog is open (held here, not in Home, so the import toast's "See my collage" can close it). */
  adding: boolean
  setAdding: (open: boolean) => void
}

/** Anything the birder brought in, matched or not (an import of only unmatched rows still shows its report). */
function hasData(s: Saved): boolean {
  return SLOTS.some((k) => (s.records[k]?.length ?? 0) > 0) || s.edits.added.length > 0 || s.unmatched.length > 0
}

const Ctx = createContext<Everybird | null>(null)

export function EverybirdProvider({ children }: { children: ReactNode }) {
  // A visitor without a list needs neither the species nor the regions yet (the landing shows its pre-packed sample,
  // About neither, Settings only once something is imported): on every page both wait for an idle moment.
  const [state, dispatch, meta] = useEverybird({ deferIfEmpty: true })
  useLoadNames(state.list)

  const onImport = useCallback((slot: Slot, result: ImportResult, details: DetailsFor<Slot>) => {
    dispatch({ type: 'import', source: slot, result, details })
    track('collage_made', { source: slotSource(slot) })
  }, [dispatch])
  // The list before an import lands: the toast names a first collage, or what a Refresh or Replace added.
  const saved = state.saved
  const before = useCallback((slot: Slot) => {
    const held = saved.records[slot]
    return { empty: !hasData(saved), codes: held?.length ? new Set(held.map((r) => r.code)) : null }
  }, [saved])
  const jobs = useImportJobs(onImport, before)

  const { species, regions } = meta
  const data = useMemo(() => (meta.ready && species && regions ? { species, regions } : null), [meta.ready, species, regions])
  const mine = hasData(state.saved)
  const mineSoon = meta.ready ? mine : meta.stored === undefined ? null : !!meta.stored && hasData(meta.stored)
  // On / with a list, the collage's layout worker and its masks start now, beside the species download, not after it.
  const home = useAppPath() === '/'
  useEffect(() => {
    if (home && mineSoon) void import('@/lib/layout/layout-client').then((m) => m.warmLayoutWorker())
  }, [home, mineSoon])
  const [adding, setAdding] = useState(false)
  // A page change (Back) leaves no dialog behind: the next visit to / opens on the collage, as when Home held it.
  if (!home && adding) setAdding(false)
  const value = useMemo<Everybird>(
    () => ({ state, dispatch, meta, data, failed: !!meta.error, mine, mineSoon, jobs, adding, setAdding }),
    [state, dispatch, meta, data, mine, mineSoon, jobs, adding],
  )

  // The import toast's "See my collage": My birds on the Collage view, at the top. On / it closes the Add birds dialog
  // and switches the view (the dock's own action); from another page it goes to / (scrolled to the top, as a link does).
  const router = useRouter()
  const view = state.view
  const onSee = useCallback(() => {
    if (view !== 'collage') dispatch({ type: 'view', view: 'collage' })
    if (!home) return router.push('/')
    setAdding(false)
    scrollTo({ top: 0 })
  }, [view, dispatch, home, router])
  return <Ctx.Provider value={value}>{children}<ImportToast jobs={jobs} onSee={onSee} here={home && !adding && view === 'collage'} /></Ctx.Provider>
}

export function useEverybirdContext(): Everybird {
  const v = useContext(Ctx)
  if (!v) throw new Error('useEverybirdContext needs <EverybirdProvider> (app/[lang]/(app)/layout.tsx)')
  return v
}
