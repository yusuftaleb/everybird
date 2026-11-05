'use client'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { loadRegions, stripBracket } from '@/lib/import/places'
import { loadSpecies, type SpeciesIndex } from '@/lib/species/load'
import { buildList } from './build-list'
import type { Filter } from './filters'
import { applyFilterValidity } from './filters-validate'
import type { Edits, ImportResult, ListEntry, Rules, Source, SourceRecord, Unmatched } from './model'
import * as storage from './storage'
import { emptySaved, replaceSource, type Saved } from './storage'
import { findTrips, type Trip } from './trips'

export type AppState = {
  saved: Saved
  list: ListEntry[]
  trips: Trip[]
  /** Derived: unmatched rows that have no fix yet (what the MatchReport shows). */
  openUnmatched: Unmatched[]
  filter: Filter
  mode: 'even' | 'true'
  view: 'collage' | 'list'
  massOrder: 'heaviest' | 'lightest'
  persistence: 'saved' | 'memory-only' | 'idle'
}

export type Action =
  | { type: 'import'; source: Source; result: ImportResult }
  | { type: 'edit'; edits: Edits }
  | { type: 'rules'; rules: Rules }
  | { type: 'filter'; filter: Filter }
  | { type: 'mode'; mode: AppState['mode'] }
  | { type: 'view'; view: AppState['view'] }
  | { type: 'massOrder'; massOrder: AppState['massOrder'] }
  | { type: 'restore'; saved: Saved }
  | { type: 'forget' }
  /** Internal: the hook reports where the last save went. */
  | { type: 'persistence'; persistence: AppState['persistence'] }

export type StoreContext = { species: SpeciesIndex; countryName: (iso2: string) => string }

const SOURCES: Source[] = ['ebird', 'inat', 'manual']

/** Compute everything derived from `saved`, then repair the filter against it. */
function derive(s: AppState, saved: Saved, filter: Filter, ctx: StoreContext, pruneValues: boolean): AppState {
  const taxonOrder = (code: string) => ctx.species.byCode.get(code)?.to ?? Number.MAX_SAFE_INTEGER
  const fixKeys = new Set(Object.keys(saved.edits.fixes))
  const fixRecords: SourceRecord[] = []
  for (const u of saved.unmatched) {
    const code = saved.edits.fixes[`${u.source}:${u.row}`]
    if (code) fixRecords.push({ code, source: u.source, date: u.date, place: u.place })
  }
  const records = [...SOURCES.flatMap((src) => saved.records[src]), ...fixRecords]
  const list = buildList(records, saved.edits, saved.rules, taxonOrder)
  const trips = findTrips(list, ctx.countryName)
  const openUnmatched = saved.unmatched.filter((u) => !fixKeys.has(`${u.source}:${u.row}`))
  return {
    ...s,
    saved,
    list,
    trips,
    openUnmatched,
    filter: applyFilterValidity(filter, list, trips, ctx.species, pruneValues),
  }
}

export function initialState(): AppState {
  return {
    saved: emptySaved(),
    list: [],
    trips: [],
    openUnmatched: [],
    filter: {},
    mode: 'even',
    view: 'collage',
    massOrder: 'heaviest',
    persistence: 'idle',
  }
}

/** Pure reducer; species data and country names are injected. `saved` keeps its identity unless the action changes it. */
export function makeReducer(ctx: StoreContext): (s: AppState, a: Action) => AppState {
  const stamp = (saved: Saved): Saved => ({ ...saved, savedAt: new Date().toISOString() })
  return (s, a) => {
    switch (a.type) {
      case 'import':
        return derive(s, replaceSource(s.saved, a.source, a.result), s.filter, ctx, true)
      case 'edit':
        return derive(s, stamp({ ...s.saved, edits: a.edits }), s.filter, ctx, true)
      case 'rules':
        return derive(s, stamp({ ...s.saved, rules: a.rules }), s.filter, ctx, true)
      case 'restore':
        return derive(s, a.saved, s.filter, ctx, true)
      case 'filter':
        return { ...s, filter: applyFilterValidity(a.filter, s.list, s.trips, ctx.species, false) }
      case 'mode':
        return { ...s, mode: a.mode }
      case 'view':
        return { ...s, view: a.view }
      case 'massOrder':
        return { ...s, massOrder: a.massOrder }
      case 'persistence':
        return { ...s, persistence: a.persistence }
      case 'forget': {
        const f = initialState()
        return derive({ ...f, persistence: s.persistence }, f.saved, {}, ctx, true)
      }
    }
  }
}

const NO_CTX: StoreContext = { species: { rows: [], byCode: new Map(), search: () => [] }, countryName: (c) => c }
const SAVE_DELAY_MS = 500

export type EverybirdMeta = {
  /** False until species, regions and the stored list have loaded. The UI should not dispatch before this. */
  ready: boolean
  /** Set when species/regions failed to load (ready stays false). */
  error?: string
  /** Outcome of the last 'forget': 'failed' means the device copy may remain ("Couldn't clear this device's copy"). */
  forgetOutcome?: 'forgotten' | 'failed'
  /** Species index, once loaded. */
  species?: SpeciesIndex
}

/**
 * Loads species, regions and the stored list on mount, then keeps `saved` persisted
 * (debounced 500 ms, flushed on pagehide / tab hidden). Nothing is saved before the initial load,
 * so a stored list is never overwritten by the empty initial state.
 */
export function useEverybird(): [AppState, (a: Action) => void, EverybirdMeta] {
  const [ctx, setCtx] = useState<StoreContext | null>(null)
  const reducer = useMemo(() => makeReducer(ctx ?? NO_CTX), [ctx])
  const [state, rawDispatch] = useReducer(reducer, undefined, initialState)
  const [meta, setMeta] = useState<EverybirdMeta>({ ready: false })
  const seen = useRef(state.saved) // last `saved` we looked at; only a different one schedules a save
  const skipSave = useRef(false) // the next change to `saved` comes from load/forget and must not be written
  const pending = useRef<Saved | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    let cancelled = false
    ;(async () => {
      try {
        const [species, regions, stored] = await Promise.all([loadSpecies(), loadRegions(), storage.load()])
        if (cancelled) return
        setCtx({
          species,
          countryName: (iso) => (regions.countries[iso] ? stripBracket(regions.countries[iso]) : iso),
        })
        if (stored) {
          skipSave.current = true
          rawDispatch({ type: 'restore', saved: stored })
        }
        if (storage.isMemoryOnly()) rawDispatch({ type: 'persistence', persistence: 'memory-only' })
        setMeta({ ready: true, species })
      } catch (e) {
        if (!cancelled) setMeta({ ready: false, error: e instanceof Error ? e.message : String(e) })
      }
    })()
    return () => {
      cancelled = true
      alive.current = false
    }
  }, [])

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const s = pending.current
    if (!s) return
    pending.current = null
    void storage.save(s).then((p) => {
      if (alive.current) rawDispatch({ type: 'persistence', persistence: p })
    })
  }, [])

  useEffect(() => {
    if (!meta.ready) return
    if (seen.current === state.saved) return
    seen.current = state.saved
    if (skipSave.current) {
      skipSave.current = false
      return
    }
    pending.current = state.saved
    timer.current = setTimeout(flush, SAVE_DELAY_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    }
  }, [state.saved, meta.ready, flush])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [flush])

  const dispatch = useCallback((a: Action) => {
    if (a.type === 'forget') {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      pending.current = null
      skipSave.current = true
      rawDispatch(a)
      void storage.forget().then((outcome) => {
        if (alive.current) setMeta((m) => ({ ...m, forgetOutcome: outcome }))
      })
      return
    }
    rawDispatch(a)
  }, [])

  return [state, dispatch, meta]
}
