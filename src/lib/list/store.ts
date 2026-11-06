'use client'
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { loadRegions, stripBracket } from '@/lib/import/places'
import { loadSpecies, type SpeciesIndex } from '@/lib/species/load'
import { buildList } from './build-list'
import type { Filter } from './filters'
import { applyFilterValidity } from './filters-validate'
import { SLOTS, slotSource, unmatchedKey } from './model'
import type { Edits, ImportResult, ListEntry, Rules, Slot, SourceRecord, Unmatched } from './model'
import { buildSeen, type SeenIndex } from './seen'
import * as storage from './storage'
import { emptySaved, removeSource, replaceSource, type EbirdDetails, type InatDetails, type Saved } from './storage'
import { findTrips, type Trip } from './trips'

export type AppState = {
  saved: Saved
  list: ListEntry[]
  /** Derived: where each species on the list was seen (seen.ts), for the Places filter, its counts and the map. */
  seen: SeenIndex
  trips: Trip[]
  /** Derived: unmatched rows that have no fix yet (what the MatchReport shows). */
  openUnmatched: Unmatched[]
  filter: Filter
  mode: 'even' | 'true'
  view: 'collage' | 'list'
  massOrder: 'heaviest' | 'lightest'
  /** Scientific names lead wherever a bird or group is named (LifeList's Scientific switch); never stored. */
  sci: boolean
  persistence: 'saved' | 'memory-only' | 'idle'
}

export type Action =
  /** An import into one slot (model.ts `Slot`: 'ebird' is MyEBirdData, 'ebird-list' the life list download). */
  | { type: 'import'; source: Slot; result: ImportResult; details?: EbirdDetails | InatDetails }
  /** Disconnect one source: its records, unmatched rows and details go; edits stay (storage.ts `removeSource`). */
  | { type: 'remove-source'; source: Slot }
  | { type: 'edit'; edits: Edits }
  | { type: 'rules'; rules: Rules }
  | { type: 'filter'; filter: Filter }
  | { type: 'mode'; mode: AppState['mode'] }
  | { type: 'view'; view: AppState['view'] }
  | { type: 'massOrder'; massOrder: AppState['massOrder'] }
  | { type: 'sci'; sci: boolean }
  | { type: 'restore'; saved: Saved }
  /** The display name for share images and links (Saved.name); blank removes it. */
  | { type: 'name'; name: string }
  | { type: 'forget' }
  /** Internal: the hook reports where the last save went. */
  | { type: 'persistence'; persistence: AppState['persistence'] }

export type StoreContext = { species: SpeciesIndex; countryName: (iso2: string) => string }

/** Every record the list is built from: each slot's records, then the fixed unmatched rows. */
export function recordsOf(saved: Saved): SourceRecord[] {
  const fixRecords: SourceRecord[] = []
  for (const u of saved.unmatched) {
    const code = saved.edits.fixes[unmatchedKey(u)]
    if (code) {
      const r: SourceRecord = { code, source: slotSource(u.slot ?? u.source), date: u.date, place: u.place }
      if (u.seen) r.seen = u.seen
      fixRecords.push(r)
    }
  }
  return [...SLOTS.flatMap((slot) => saved.records[slot] ?? []), ...fixRecords]
}

/**
 * How many birds on the list each counting rule touches, whatever the rules are set to now: heard only, found dead,
 * and the birds that research grade only would drop (iNaturalist sightings the community hasn't agreed on, with no
 * other source).
 */
export function ruleCounts(saved: Saved): { heard: number; dead: number; casual: number } {
  const records = recordsOf(saved)
  const off = { hideHeard: false, hideDead: false, researchOnly: false }
  const all = buildList(records, saved.edits, off)
  const research = buildList(records, saved.edits, { ...off, researchOnly: true })
  return { heard: all.filter((e) => e.heard).length, dead: all.filter((e) => e.dead).length, casual: all.length - research.length }
}

/** Compute everything derived from `saved`, then repair the filter against it. */
function derive(s: AppState, saved: Saved, filter: Filter, ctx: StoreContext, pruneValues: boolean): AppState {
  const taxonOrder = (code: string) => ctx.species.byCode.get(code)?.to ?? Number.MAX_SAFE_INTEGER
  const fixKeys = new Set(Object.keys(saved.edits.fixes))
  const records = recordsOf(saved)
  const list = buildList(records, saved.edits, saved.rules, taxonOrder)
  const seen = buildSeen(records, saved.edits, saved.rules, list)
  const trips = findTrips(list, ctx.countryName)
  const openUnmatched = saved.unmatched.filter((u) => !fixKeys.has(unmatchedKey(u)))
  return {
    ...s,
    saved,
    list,
    seen,
    trips,
    openUnmatched,
    filter: applyFilterValidity(filter, list, trips, ctx.species, pruneValues, seen),
  }
}

export function initialState(): AppState {
  return {
    saved: emptySaved(),
    list: [],
    seen: { byCode: new Map(), full: false, sig: '0' },
    trips: [],
    openUnmatched: [],
    filter: {},
    mode: 'even',
    view: 'collage',
    massOrder: 'heaviest',
    sci: false,
    persistence: 'idle',
  }
}

/** Pure reducer; species data and country names are injected. `saved` keeps its identity unless the action changes it. */
export function makeReducer(ctx: StoreContext): (s: AppState, a: Action) => AppState {
  const stamp = (saved: Saved): Saved => ({ ...saved, savedAt: new Date().toISOString() })
  return (s, a) => {
    switch (a.type) {
      case 'import':
        return derive(s, replaceSource(s.saved, a.source, a.result, a.details as never), s.filter, ctx, true)
      case 'remove-source':
        return derive(s, removeSource(s.saved, a.source), s.filter, ctx, true)
      case 'edit':
        return derive(s, stamp({ ...s.saved, edits: a.edits }), s.filter, ctx, true)
      case 'rules':
        return derive(s, stamp({ ...s.saved, rules: a.rules }), s.filter, ctx, true)
      case 'restore':
        return derive(s, a.saved, s.filter, ctx, true)
      case 'filter':
        return { ...s, filter: applyFilterValidity(a.filter, s.list, s.trips, ctx.species, false, s.seen) }
      case 'mode':
        return { ...s, mode: a.mode }
      case 'view':
        return { ...s, view: a.view }
      case 'massOrder':
        return { ...s, massOrder: a.massOrder }
      case 'sci':
        return { ...s, sci: a.sci }
      case 'persistence':
        return { ...s, persistence: a.persistence }
      case 'name': {
        const name = a.name.trim()
        if ((s.saved.name ?? '') === name) return s
        const saved = stamp({ ...s.saved, name })
        if (!name) delete saved.name
        return { ...s, saved }
      }
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
  /** False until species, regions and the stored list have loaded. Actions dispatched before this are queued and applied once loaded. */
  ready: boolean
  /** Set when species/regions failed to load (ready stays false). */
  error?: string
  /** Outcome of the last 'forget': 'failed' means the device copy may remain ("Couldn't clear this device's copy"). */
  forgetOutcome?: 'forgotten' | 'failed'
  /** Species index, once loaded. */
  species?: SpeciesIndex
  /** The stored list as first read (null: none; undefined: not read yet). Known well before `ready`. */
  stored?: Saved | null
}

/** Run `fn` when the browser is idle (at most `timeout` ms from now); where idle callbacks don't exist, now. */
function whenIdle(timeout: number): Promise<void> {
  const g = globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }
  return new Promise((resolve) => (g.requestIdleCallback ? g.requestIdleCallback(() => resolve(), { timeout }) : resolve()))
}

/**
 * Loads species, regions and the stored list on mount (`deferIfEmpty`: with no stored list, the species wait for an idle
 * moment), then keeps `saved` persisted
 * (debounced 500 ms, flushed on pagehide / tab hidden). Nothing is saved before the initial load,
 * so a stored list is never overwritten by the empty initial state. Actions dispatched before ready are
 * queued and replayed, in order, after the stored list is restored. A successful save or a new forget clears
 * meta.forgetOutcome; a failed forget re-reads storage.isMemoryOnly() into `persistence`.
 */
export function useEverybird(opts: { deferIfEmpty?: boolean } = {}): [AppState, (a: Action) => void, EverybirdMeta] {
  const deferIfEmpty = useRef(!!opts.deferIfEmpty)
  const [ctx, setCtx] = useState<StoreContext | null>(null)
  const reducer = useMemo(() => makeReducer(ctx ?? NO_CTX), [ctx])
  const [state, rawDispatch] = useReducer(reducer, undefined, initialState)
  const [meta, setMeta] = useState<EverybirdMeta>({ ready: false })
  const seen = useRef(state.saved) // last `saved` we looked at; only a different one schedules a save
  const skipSave = useRef(false) // the next change to `saved` comes from load/forget and must not be written
  const pending = useRef<Saved | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = useRef(true)
  // Actions dispatched before the initial load finishes; null once ready.
  const queue = useRef<Action[] | null>([])
  const dispatchRef = useRef<(a: Action) => void>(() => {})

  useEffect(() => {
    alive.current = true
    let cancelled = false
    ;(async () => {
      try {
        const storedP = storage.load()
        // A visitor with no list on the landing page sees the pre-packed sample: let its stickers have the network
        // first, and fetch the big species file once the browser is idle.
        const stored0 = deferIfEmpty.current ? await storedP : undefined
        if (cancelled) return
        if (deferIfEmpty.current) {
          setMeta((m) => (m.ready ? m : { ...m, stored: stored0 }))
          if (!stored0) await whenIdle(1500)
        } else void storedP.then((st) => { if (!cancelled) setMeta((m) => (m.ready ? m : { ...m, stored: st })) }, () => {})
        const [species, regions, stored] = await Promise.all([loadSpecies(), loadRegions(), storedP])
        if (cancelled) return
        setCtx({
          species,
          countryName: (iso) => (regions.countries[iso] ? stripBracket(regions.countries[iso]) : iso),
        })
        const early = queue.current ?? []
        queue.current = null
        // The restored list itself is not re-saved, unless queued actions change it (then they must be saved).
        if (stored) {
          skipSave.current = early.length === 0
          rawDispatch({ type: 'restore', saved: stored })
        }
        if (storage.isMemoryOnly()) rawDispatch({ type: 'persistence', persistence: 'memory-only' })
        setMeta({ ready: true, species, stored })
        // Actions dispatched before ready run now, on top of the stored list, with the loaded species.
        for (const a of early) dispatchRef.current(a)
      } catch (e) {
        // Keep what is already known (the stored list): the landing still shows its sample, a list holder sees the notice.
        if (!cancelled) setMeta((m) => ({ ...m, ready: false, error: e instanceof Error ? e.message : String(e) }))
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
      if (!alive.current) return
      rawDispatch({ type: 'persistence', persistence: p })
      if (p === 'saved') setMeta((m) => (m.forgetOutcome ? { ...m, forgetOutcome: undefined } : m))
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
    if (queue.current) {
      queue.current.push(a) // not ready: applied after the stored list loads, so the restore can't overwrite it
      return
    }
    if (a.type === 'forget') {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      pending.current = null
      skipSave.current = true
      rawDispatch(a)
      setMeta((m) => (m.forgetOutcome ? { ...m, forgetOutcome: undefined } : m))
      void storage.forget().then((outcome) => {
        if (!alive.current) return
        setMeta((m) => ({ ...m, forgetOutcome: outcome }))
        if (outcome === 'failed' && storage.isMemoryOnly()) rawDispatch({ type: 'persistence', persistence: 'memory-only' })
      })
      return
    }
    rawDispatch(a)
  }, [])
  useLayoutEffect(() => {
    dispatchRef.current = dispatch
  })

  return [state, dispatch, meta]
}
